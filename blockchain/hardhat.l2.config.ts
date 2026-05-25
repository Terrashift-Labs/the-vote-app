/**
 * L2 network additions for hardhat.config.ts
 * Merge these networks into the main config.
 *
 * Testnets:
 *   optimismSepolia  (chainId 11155420)
 *   arbitrumSepolia  (chainId 421614)
 *
 * Mainnets:
 *   optimism         (chainId 10)
 *   arbitrum         (chainId 42161)
 *
 * Required env vars (add to blockchain/.env):
 *   OPTIMISM_SEPOLIA_RPC_URL
 *   ARBITRUM_SEPOLIA_RPC_URL
 *   OPTIMISM_RPC_URL
 *   ARBITRUM_RPC_URL
 *   OPTIMISM_ETHERSCAN_API_KEY
 *   ARBISCAN_API_KEY
 */
export const l2Networks = {
  optimismSepolia: {
    url:      process.env.OPTIMISM_SEPOLIA_RPC_URL ?? "https://sepolia.optimism.io",
    accounts: [process.env.DEPLOYER_PRIVATE_KEY ?? "0x" + "0".repeat(64)],
    chainId:  11155420,
  },
  arbitrumSepolia: {
    url:      process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc",
    accounts: [process.env.DEPLOYER_PRIVATE_KEY ?? "0x" + "0".repeat(64)],
    chainId:  421614,
  },
  optimism: {
    url:      process.env.OPTIMISM_RPC_URL ?? "https://mainnet.optimism.io",
    accounts: [process.env.DEPLOYER_PRIVATE_KEY ?? "0x" + "0".repeat(64)],
    chainId:  10,
  },
  arbitrum: {
    url:      process.env.ARBITRUM_RPC_URL ?? "https://arb1.arbitrum.io/rpc",
    accounts: [process.env.DEPLOYER_PRIVATE_KEY ?? "0x" + "0".repeat(64)],
    chainId:  42161,
  },
};

export const l2EtherscanKeys = {
  optimisticEthereum: process.env.OPTIMISM_ETHERSCAN_API_KEY ?? "",
  arbitrumOne:        process.env.ARBISCAN_API_KEY ?? "",
};
