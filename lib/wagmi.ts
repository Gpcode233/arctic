"use client"

import { fallback, http } from "viem"
import { arc, arcTestnet } from "viem/chains"
import { createConfig } from "wagmi"
import { getDefaultConfig } from "connectkit"

const chains = [arcTestnet, arc] as const
const rpcUrls = {
  [arc.id]: ["https://rpc.mainnet.arc.io"],
  [arcTestnet.id]: [
    "https://rpc.testnet.arc.io",
    "https://rpc.blockdaemon.testnet.arc.io",
    "https://rpc.quicknode.testnet.arc.io",
  ],
}

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains,
    transports: {
      // In the browser, read through the same-origin proxy (some networks block *.arc.io);
      // direct endpoints stay as fallback and are used during SSR.
      [arc.id]: fallback([
        ...(typeof window !== "undefined"
          ? [http("/api/rpc", { retryCount: 1, retryDelay: 300, timeout: 20_000, batch: true })]
          : []),
        ...rpcUrls[arc.id].map((url) => http(url, { retryCount: 2, retryDelay: 500, timeout: 15_000 })),
      ]),
      [arcTestnet.id]: fallback([
        ...(typeof window !== "undefined"
          ? [http("/api/rpc", { retryCount: 1, retryDelay: 300, timeout: 20_000, batch: true })]
          : []),
        ...rpcUrls[arcTestnet.id].map((url) => http(url, { retryCount: 2, retryDelay: 500, timeout: 15_000 })),
      ]),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "arctic-escrow",
    enableAaveAccount: false,
    appName: "Arctic",
    appDescription: "Programmable USDC escrow on Arc",
  }),
)
