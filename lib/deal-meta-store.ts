"use client"

/**
 * Off-chain deal metadata store backed by localStorage.
 * Stores full milestone descriptions and deal notes that are too long for onchain storage.
 * Key: arctic:deal-meta:<chainId>:<dealId>
 */

import { useCallback } from "react"
import { CHAIN_ID } from "@/lib/arc"

export interface MilestoneMeta {
  description?: string   // full description; title comes from onchain event
}

export interface DealMeta {
  dealId: string         // stringified bigint
  description?: string   // deal-level notes / scope of work
  milestones: Record<number, MilestoneMeta>
  savedAt: number
}

function storageKey(dealId: string) {
  return `arctic:deal-meta:${CHAIN_ID}:${dealId}`
}

export function loadDealMeta(dealId: string): DealMeta | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(storageKey(dealId))
    return raw ? (JSON.parse(raw) as DealMeta) : null
  } catch {
    return null
  }
}

export function saveDealMeta(meta: DealMeta) {
  if (typeof window === "undefined") return
  localStorage.setItem(storageKey(meta.dealId), JSON.stringify(meta))
}

/** Hook for reading/writing metadata for a single deal. */
export function useDealMeta(dealId: string | undefined) {
  const getDealMeta = useCallback((): DealMeta | null => {
    if (!dealId) return null
    return loadDealMeta(dealId)
  }, [dealId])

  const setDealMeta = useCallback(
    (patch: Partial<Pick<DealMeta, "description" | "milestones">>) => {
      if (!dealId) return
      const existing = loadDealMeta(dealId) ?? {
        dealId,
        milestones: {},
        savedAt: Date.now(),
      }
      const updated: DealMeta = {
        ...existing,
        ...patch,
        milestones: { ...existing.milestones, ...(patch.milestones ?? {}) },
        savedAt: Date.now(),
      }
      saveDealMeta(updated)
    },
    [dealId],
  )

  const setMilestoneMeta = useCallback(
    (index: number, patch: Partial<MilestoneMeta>) => {
      if (!dealId) return
      const existing = loadDealMeta(dealId) ?? {
        dealId,
        milestones: {},
        savedAt: Date.now(),
      }
      const updated: DealMeta = {
        ...existing,
        milestones: {
          ...existing.milestones,
          [index]: { ...(existing.milestones[index] ?? {}), ...patch },
        },
        savedAt: Date.now(),
      }
      saveDealMeta(updated)
    },
    [dealId],
  )

  return { getDealMeta, setDealMeta, setMilestoneMeta }
}
