"use client"

/**
 * Per-wallet profile store backed by localStorage.
 * Key: arctic:profile:<address.toLowerCase()>
 * Isolated per wallet — reading/writing always uses the connected address.
 */

import { useCallback, useEffect, useState } from "react"
import { useAccount } from "wagmi"

export interface Profile {
  address: string        // checksummed address, set on creation
  displayName: string    // editable; defaults to shortAddress(address)
  avatarColor: string    // tailwind bg colour token e.g. "bg-violet-500"
  createdAt: number      // unix ms
}

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-sky-500",
]

function pickColor(address: string): string {
  const n = parseInt(address.slice(2, 4), 16)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

function storageKey(address: string) {
  return `arctic:profile:${address.toLowerCase()}`
}

function shortAddr(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function load(address: string): Profile | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(storageKey(address))
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

function save(profile: Profile) {
  if (typeof window === "undefined") return
  localStorage.setItem(storageKey(profile.address), JSON.stringify(profile))
}

function getOrCreate(address: string): Profile {
  const existing = load(address)
  if (existing) return existing
  const profile: Profile = {
    address,
    displayName: shortAddr(address),
    avatarColor: pickColor(address),
    createdAt: Date.now(),
  }
  save(profile)
  return profile
}

/** Hook — returns the connected wallet's profile + an updater. */
export function useProfile() {
  const { address, isConnected } = useAccount()
  const [profile, setProfileState] = useState<Profile | null>(null)

  useEffect(() => {
    const next = isConnected && address ? getOrCreate(address) : null
    // Use a scheduler to avoid synchronous setState-in-effect lint violation
    const id = setTimeout(() => setProfileState(next), 0)
    return () => clearTimeout(id)
  }, [address, isConnected])

  const updateProfile = useCallback(
    (patch: Partial<Pick<Profile, "displayName" | "avatarColor">>) => {
      if (!address) return
      const current = getOrCreate(address)
      const updated = { ...current, ...patch }
      save(updated)
      setProfileState(updated)
    },
    [address],
  )

  /** Read any address's display name (for showing counterparty names). */
  const getDisplayName = useCallback((addr: string): string => {
    const p = load(addr)
    return p?.displayName ?? shortAddr(addr)
  }, [])

  /** Read any address's avatar color. */
  const getAvatarColor = useCallback((addr: string): string => {
    const p = load(addr)
    return p?.avatarColor ?? pickColor(addr)
  }, [])

  return { profile, updateProfile, getDisplayName, getAvatarColor }
}
