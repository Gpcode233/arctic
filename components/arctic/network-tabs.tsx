"use client"

import { useAccount, useSwitchChain } from "wagmi"

import { cn } from "@/lib/utils"

const networks = [
  { id: 5042002, label: "Testnet", accent: "bg-amber-400" },
  { id: 5042, label: "Mainnet", accent: "bg-emerald-400" },
] as const

export function NetworkTabs() {
  const { chain } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const activeChainId = chain?.id

  return (
    <div
      aria-label="Network"
      className="glass flex items-center gap-0.5 rounded-lg p-1"
      role="tablist"
    >
      {networks.map((network) => {
        const isActive = activeChainId === network.id

        return (
          <button
            key={network.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={isPending || isActive}
            onClick={() => switchChain({ chainId: network.id })}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              isActive
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              "disabled:cursor-default",
            )}
          >
            <span className={cn("size-1.5 rounded-full", network.accent)} />
            {network.label}
          </button>
        )
      })}
    </div>
  )
}
