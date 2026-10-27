"use client"

import * as React from "react"
import { usePublicClient } from "wagmi"

/**
 * Chain-synced clock (ms). Scheduled releases are gated on block.timestamp, so the
 * countdown runs against the latest block time, not this device's clock. The offset
 * is re-synced every 30s; block timestamps are whole seconds, so this errs a little late.
 */
export function useChainNow(): number {
  const client = usePublicClient()
  const [offset, setOffset] = React.useState(0)
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!client) return
    let live = true
    async function sync() {
      try {
        const block = await client!.getBlock()
        if (live) setOffset(Number(block.timestamp) * 1000 - Date.now())
      } catch {
        /* keep the last known offset */
      }
    }
    void sync()
    const t = setInterval(sync, 30_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [client])

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  return now + offset
}

/** 93784000 -> "1d 02:03:04"; under a day -> "02:03:04". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const d = Math.floor(total / 86_400)
  const h = Math.floor((total % 86_400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d > 0 ? `${d}d ` : ""}${pad(h)}:${pad(m)}:${pad(s)}`
}
