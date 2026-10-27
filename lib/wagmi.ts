"use client"

import { fallback, http } from "viem"
import { arc, arcTestnet } from "viem/chains"
import { createConfig } from "wagmi"
import { getDefaultConfig } from "connectkit"
import { CHAIN_ID } from "@/lib/arc"

// Arc mainnet (chain 5042) or Arc testnet (5042002)
const activeChain = CHAIN_ID === 5042 ? arc : arcTestnet
const rpcUrls = CHAIN_ID === 5042
  ? ["https://rpc.mainnet.arc.io"]
  : [
      "https://rpc.testnet.arc.io",
      "https://rpc.blockdaemon.testnet.arc.io",
      "https://rpc.quicknode.testnet.arc.io",
    ]

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [activeChain],
    transports: {
      // In the browser, read through the same-origin proxy (some networks block *.arc.io);
      // direct endpoints stay as fallback and are used during SSR.
      [activeChain.id]: fallback([
        ...(typeof window !== "undefined"
          ? [http("/api/rpc", { retryCount: 1, retryDelay: 300, timeout: 20_000, batch: true })]
          : []),
        ...rpcUrls.map((url) => http(url, { retryCount: 2, retryDelay: 500, timeout: 15_000 })),
      ]),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "arctic-escrow",
    enableAaveAccount: false,
    appName: "Arctic",
    appDescription: "Programmable USDC escrow on Arc",
  }),
)
