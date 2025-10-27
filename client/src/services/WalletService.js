// src/services/WalletService.js
import { createPublicClient, http,createWalletClient, custom, getContract } from 'viem';
import { createCoinbaseWalletSDK } from '@coinbase/wallet-sdk';
import {getEnsName} from 'viem/ens'
import { base, baseSepolia} from 'viem/chains'

export const CHAINS = {
  BASE_MAINNET: { name:'Base', chainIdDec:8453, chainIdHex:'0x2105', rpcUrl:'https://mainnet.base.org', explorer:'https://basescan.org', currency:{ name:'ETH', symbol:'ETH', decimals:18 } },
  BASE_SEPOLIA: { name:'Base Sepolia', chainIdDec:84532, chainIdHex:'0x14A34', rpcUrl:'https://sepolia.base.org', explorer:'https://sepolia.basescan.org', currency:{ name:'ETH', symbol:'ETH', decimals:18 } }
};

const ACTIVE = baseSepolia;

// Small utility to check “user rejected” errors across wallets
function isUserRejected(err) {
  // EIP-1193 standard code:
  if (err && (err.code === 4001 || err.code === '4001')) return true;
  // Some wallets use different shapes; you can extend checks here.
  return false;
}

class WalletService {
  constructor() {
    this.address = null;
    this.displayName = null;
    this.cbSdk = null;
    this.provider = null;
    this.client = null;
    this._inited = false;

    // Guard to avoid concurrent prompts
    this._connecting = false;
  }

  async init() {
    if (this._inited) return;
    // PREFERRED: factory API → use getProvider()
   this.cbSdk = createCoinbaseWalletSDK({
     appName: 'BORC',
     appLogoUrl: '',
     darkMode: true,
   });

   if (typeof this.cbSdk.getProvider === 'function') {
     this.provider = this.cbSdk.getProvider();
   } else if (typeof this.cbSdk.makeWeb3Provider === 'function') {
     // Fallback for older docs/versions (class-style instance)
     this.provider = this.cbSdk.makeWeb3Provider(); // params optional; SDK uses its own RPC for whitelisted chains
   } else {
     throw new Error('Coinbase Wallet SDK: no provider factory found (getProvider/makeWeb3Provider missing).');
   }


    this.client = createPublicClient({
      chain: ACTIVE,
      transport: http(ACTIVE.rpcUrls.default.http[0]),
    });
    this._bindProviderEvents();
    this._inited = true;
  }

  _bindProviderEvents() {
    if (!this.provider?.on) return;
    this.provider.on('accountsChanged', (accs) => {
      this.address = accs?.[0] || null;
      if (this.address && (!this.displayName || this.displayName.startsWith('0x'))) {
        this.displayName = this.shortAddress();
      }
    });
    this.provider.on?.('disconnect', () => { this.address = null; });
  }
  
getInjectedProvider() {
    if (typeof window !== 'undefined' && window.ethereum) {
      // If multiple, prefer Coinbase if present; else first one
      const providers = window.ethereum.providers || [window.ethereum];
      const coinbase = providers.find(p => p.isCoinbaseWallet);
      return coinbase || providers[0];
    }
    return null;
  }

  shortAddress(addr = this.address) {
    return addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : 'Guest';
  }

  getAddress() { return this.address; }
  getDisplayName() { return this.displayName; }
  setDisplayName(name) { this.displayName = name; }
  isConnected() { return !!this.address; }

  async getChainId() {
    if (!this.provider) return null;
    const idHex = await this.provider.request({ method: 'eth_chainId' });
    return parseInt(idHex, 16);
  }

  /**
   * Idempotent connect:
   * 1) Check if already authorized (eth_accounts) → no prompt.
   * 2) Otherwise request accounts (eth_requestAccounts) → single prompt.
   * 3) If Coinbase fails/cancelled, try injected fallback once.
   */
  async connect() {
    if (this._connecting) return Promise.reject(new Error('Already connecting'));
    this._connecting = true;
    try {
      // Try Coinbase prompt
      try {
        const accounts = await this.provider.request({ method: 'eth_requestAccounts' });
        this.address = accounts?.[0] || null;
        if (this.address) {
          this.displayName = this.shortAddress();
          return { address: this.address, displayName: this.displayName };
        }
      } catch (e) {
        if (!isUserRejected(e)) {
          // If it's not a user cancel, rethrow to surface real errors
          throw e;
        }
        // If user cancelled, we’ll try fallback (only once). If that’s also cancelled, we stop.
      }

      // Fallback to any injected wallet (MetaMask, Rabby, etc.)
      const injected = this.getInjectedProvider();
      if (!injected) {
        throw new Error('No compatible wallet found. Install Coinbase Wallet or MetaMask.');
      }
      this.provider = injected;           // switch active provider
      this._bindProviderEvents();

      const pre2 = await this.provider.request({ method: 'eth_accounts' });
      if (pre2?.length) {
        this.address = pre2[0];
        this.displayName = this.shortAddress();
        return { address: this.address, displayName: this.displayName };
      }

      // Prompt injected wallet
      const accounts2 = await this.provider.request({ method: 'eth_requestAccounts' });
      this.address = accounts2?.[0] || null;
      this.displayName = this.shortAddress();
      return { address: this.address, displayName: this.displayName };
    } finally {
      this._connecting = false;
    }
  }

  // get base name
  // inside WalletService class
async resolveBaseName() {
  // Skip during localhost dev if you want:
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    // optional: return null for local dev to avoid contacting upstream
    console.warn("Skipping BaseName resolution in local mode.");
    return null;
  }

  if (!this.address) return null;

  try {
    // Call Vercel proxy on same origin
    const url = `/api/proxy-basename?address=${encodeURIComponent(this.address)}`;
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) {
      console.warn('proxy-basename returned not ok', r.status);
      return null;
    }
    const data = await r.json();
    const name = data?.primary_name?.name || data?.primary_name || data?.name || null;
    if (name) {
      this.displayName = name;
      return name;
    }
    return null;
  } catch (err) {
    console.warn('BaseName resolve failed:', err);
    return null;
  }
}


  // Network ensure with add/switch and graceful 4001 handling
  async ensureNetwork(target) {
    if (!this.provider) throw new Error('Wallet provider not initialized.');
    try {
      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: target.chainIdHex }]
      });
      return true;
    } catch (err) {
      if (isUserRejected(err)) {
        // User said “No” — just return false and let the app continue without chain ops.
        return false;
      }
      if (err?.code === 4902) {
        // Chain not added → request to add
        try {
          await this.provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: target.chainIdHex,
              chainName: target.name,
              nativeCurrency: target.currency,
              rpcUrls: [target.rpcUrl],
              blockExplorerUrls: [target.explorer]
            }]
          });
          return true;
        } catch (e2) {
          // User may reject here as well
          return !isUserRejected(e2);
        }
      }
      // Some other error
      throw err;
    }
  }

  async ensureBaseSepolia() { return this.ensureNetwork(CHAINS.BASE_SEPOLIA); }
  async ensureBaseMainnet() { return this.ensureNetwork(CHAINS.BASE_MAINNET); }
}

export const walletService = new WalletService();




