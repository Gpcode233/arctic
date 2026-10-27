"use client"

import { http } from "viem"
import { arc, arcTestnet } from "viem/chains"
import { createConfig } from "wagmi"
import { getDefaultConfig } from "connectkit"
import { CHAIN_ID } from "@/lib/arc"

// Arc mainnet (chain 5042) or Arc testnet (5042002)
const activeChain = CHAIN_ID === 5042 ? arc : arcTestnet
const rpcUrl = CHAIN_ID === 5042
  ? "https://rpc.mainnet.arc.io"
  : "https://rpc.testnet.arc.io"

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [activeChain],
    transports: {
      [activeChain.id]: http(rpcUrl),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "arctic-escrow",
    appName: "Arctic",
    appDescription: "Programmable USDC escrow on Arc",
  }),
)
