// src/services/WalletService.js
import { 
  createPublicClient,
   http,
   ContractFunctionZeroDataError,
   toCoinType,
   encodePacked,
   keccak256,
   namehash
} from 'viem';
import { createCoinbaseWalletSDK } from '@coinbase/wallet-sdk';
import { getEnsName } from 'viem/ens';
import { base, baseSepolia, mainnet } from 'viem/chains';

export const CHAINS = {
  BASE_MAINNET: { name: 'Base', chainIdDec: 8453, chainIdHex: '0x2105', rpcUrl: 'https://mainnet.base.org', explorer: 'https://basescan.org', currency: { name: 'ETH', symbol: 'ETH', decimals: 18 } },
  BASE_SEPOLIA: { name: 'Base Sepolia', chainIdDec: 84532, chainIdHex: '0x14A34', rpcUrl: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org', currency: { name: 'ETH', symbol: 'ETH', decimals: 18 } }
};

const ACTIVE = base;

// Utility function to check for user-rejected errors across wallets
function isUserRejected(err) {
  // EIP-1193 standard code:
  if (err && (err.code === 4001 || err.code === '4001')) return true;
  // Additional checks for other wallet error shapes can be added here if needed.
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

    // Guard to prevent concurrent connection prompts
    this._connecting = false;
  }

  async init() {
    if (this._inited) return;
    // Preferred factory API: use getProvider()
    this.cbSdk = createCoinbaseWalletSDK({
      appName: 'BORC',
      appLogoUrl: '',
      darkMode: true,
    });

    if (typeof this.cbSdk.getProvider === 'function') {
      this.provider = this.cbSdk.getProvider();
    } else if (typeof this.cbSdk.makeWeb3Provider === 'function') {
      // Fallback for older SDK versions
      this.provider = this.cbSdk.makeWeb3Provider(); // Parameters optional; SDK uses its own RPC for whitelisted chains
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
      // If multiple providers, prefer Coinbase if present; otherwise, use the first one
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
   * Idempotent connection logic:
   * 1) Check if already authorized (eth_accounts) – no prompt.
   * 2) Otherwise request accounts (eth_requestAccounts) – single prompt.
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
          // If not a user cancel, rethrow to surface real errors
          throw e;
        }
        // If user cancelled, try fallback (only once). If also cancelled, stop.
      }

      // Fallback to any injected wallet (MetaMask, Rabby, etc.)
      const injected = this.getInjectedProvider();
      if (!injected) {
        throw new Error('No compatible wallet found. Install Coinbase Wallet or MetaMask.');
      }
      this.provider = injected;           // Switch active provider
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

  // Resolve Base name
  async resolveBaseName() {
    if (!this.address) return null;
    try {
      // Create a Base Mainnet public client (uses public RPC, fine for reads)
      const baseClient = createPublicClient({
        chain: base,
        transport: http('https://mainnet.base.org'),
      });

      // Compute address node: keccak256(encodePacked(string(addr_hex)))
      const addrHex = this.address.slice(2).toLowerCase();
      const addressNode = keccak256(encodePacked(['string'], [addrHex]));

      // Compute slipped coinType (0x80000000 | chainId) as hex string (lowercase for normalization)
      const coinType = Number((BigInt(0x80000000) | BigInt(base.id)) & BigInt(0xFFFFFFFF));
      const coinTypeHex = coinType.toString(16).toLowerCase();

      // Base reverse node: namehash('<coinTypeHex>.reverse')
      const baseReverseNode = namehash(`${coinTypeHex}.reverse`);

      // Address reverse node: keccak256(encodePacked(bytes32(baseReverseNode), bytes32(addressNode)))
      const addressReverseNode = keccak256(encodePacked(['bytes32', 'bytes32'], [baseReverseNode, addressNode]));

      // Call the 'name' function on the L2 Resolver contract
      const name = await baseClient.readContract({
        address: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD',
        abi: [{
          "inputs": [{"internalType": "bytes","name": "reverseName","type": "bytes"}],
          "name": "name",
          "outputs": [{"internalType": "string","name":"","type": "string"}],
          "stateMutability": "view",
          "type": "function"
        }],
        functionName: 'name',
        args: [addressReverseNode],
      });

      // Validate Basename; return null if empty or invalid
      if (name && name.endsWith('.base.eth')) {
        this.displayName = name;
        return name;
      }
      return null;
    } catch (err) {
      // Silence reverts (common for no name/record); log other errors
      if (err.name === 'ContractFunctionExecutionError' || err.cause?.name === 'ContractFunctionRevertedError') {
        return null;
      }
      console.warn('BaseName resolve failed:', err);
      return null;
    }
  }

  // Ensure network with add/switch and graceful handling of user rejections
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
        // User rejected – return false and allow app to continue without chain operations
        return false;
      }
      if (err?.code === 4902) {
        // Chain not added – request to add
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
      // Other errors
      throw err;
    }
  }

  async ensureBaseSepolia() { return this.ensureNetwork(CHAINS.BASE_SEPOLIA); }
  async ensureBaseMainnet() { return this.ensureNetwork(CHAINS.BASE_MAINNET); }
}

export const walletService = new WalletService();