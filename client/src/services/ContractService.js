// src/services/ContractService.js
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  getContract,
} from "viem";
import { base } from "viem/chains";  // Switched to Base Mainnet
import PlayerRegistry from "../contracts/PlayerRegistry.json";

const CONTRACT_ADDRESS = "0xdCc826fA1573f0fc30AF8d7cd79402Aa506cB850";  // TODO: Replace with your deployed Mainnet address

const ABI = PlayerRegistry.abi || PlayerRegistry;

class ContractService {
  constructor() {
    const rpcUrl = "https://mainnet.base.org";  // Public Mainnet RPC; swap to private (e.g., Alchemy/Infura) if needed

    this.chain = {
      ...base,
      rpcUrls: { default: { http: [rpcUrl] } },
    };

    // Public client for read-only operations
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(rpcUrl),
    });

    this.walletClient = null;
    this.account = null;
  }

  /** Connect wallet (MetaMask / Coinbase / injected provider) */
  async connectWallet() {
    if (!window.ethereum) {
      throw new Error("No wallet provider found. Please install MetaMask or Coinbase Wallet.");
    }

    const [address] = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    this.walletClient = createWalletClient({
      account: address,
      chain: this.chain,
      transport: custom(window.ethereum),
    });

    this.account = address;
    console.log("✅ Wallet connected:", address);
    return address;
  }

  /** Helper: get contract instance for any client */
  getContract(client) {
    return getContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      client,
    });
  }

  /** Check if a display name is available */
  async isNameAvailable(name) {
    try {
      const contract = this.getContract(this.publicClient);
      const available = await contract.read.isNameAvailable([name]);
      console.log(`✅ Name "${name}" available:`, available);
      return available;
    } catch (err) {
      console.error("❌ Error checking name availability:", err);
      throw err;
    }
  }

  /** Fetch player info by wallet address */
  async getPlayer(address) {
    try {
      if (!address || typeof address !== "string") {
        throw new Error(`Invalid address passed to getPlayer: ${address}`);
      }

      const contract = this.getContract(this.publicClient);
      const player = await contract.read.getPlayer([address]);
      console.log("✅ Player data:", player);
      return player;
    } catch (err) {
      console.error("❌ getPlayer failed:", err);
      return null;
    }
  }

  /** Register player (requires connected wallet) */
  async registerPlayer(baseName, displayName) {
    try {
      if (!this.walletClient || !this.account) {
        throw new Error("Wallet not connected — please connect first.");
      }

      const contract = this.getContract(this.walletClient);
      const txHash = await contract.write.registerPlayer(
        [baseName, displayName],
        { account: this.account }
      );

      console.log("✅ Player registered, tx hash:", txHash);
      return txHash;
    } catch (err) {
      console.error("❌ registerPlayer failed:", err);
      throw err;
    }
  }

  /** Change player display name (requires connected wallet) */
  async changeDisplayName(newDisplayName) {
    try {
      if (!this.walletClient || !this.account) {
        throw new Error("Wallet not connected — please connect first.");
      }

      const contract = this.getContract(this.walletClient);
      const txHash = await contract.write.changeDisplayName(
        [newDisplayName],
        { account: this.account }
      );

      console.log("✅ Display name changed, tx hash:", txHash);
      return txHash;
    } catch (err) {
      console.error("❌ changeDisplayName failed:", err);
      throw err;
    }
  }
}

export const contractService = new ContractService();
export default contractService;