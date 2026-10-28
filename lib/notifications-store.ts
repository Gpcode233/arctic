"use client"

/**
 * Per-wallet notification feed backed by localStorage.
 * Key: arctic:notifications:<address.toLowerCase()>
 * Events are appended by onchain hooks when milestones are delivered, released or refunded.
 */

import { useCallback, useEffect, useState } from "react"
import { useAccount } from "wagmi"

export type NotificationKind =
  | "milestone_delivered"
  | "milestone_released"
  | "milestone_refunded"
  | "deal_created"
  | "deal_completed"

export interface Notification {
  id: string             // random uuid-like id
  kind: NotificationKind
  dealId: string
  dealTitle: string
  milestoneIndex?: number
  milestoneTitle?: string
  read: boolean
  createdAt: number      // unix ms
}

function storageKey(address: string) {
  return `arctic:notifications:${address.toLowerCase()}`
}

function loadAll(address: string): Notification[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(storageKey(address))
    return raw ? (JSON.parse(raw) as Notification[]) : []
  } catch {
    return []
  }
}

function saveAll(address: string, notifications: Notification[]) {
  if (typeof window === "undefined") return
  // Keep at most 200 notifications
  const trimmed = notifications.slice(-200)
  localStorage.setItem(storageKey(address), JSON.stringify(trimmed))
}

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function useNotifications() {
  const { address, isConnected } = useAccount()
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    const next = isConnected && address ? loadAll(address) : []
    const id = setTimeout(() => setNotifications(next), 0)
    return () => clearTimeout(id)
  }, [address, isConnected])

  const unreadCount = notifications.filter((n) => !n.read).length

  const addNotification = useCallback(
    (payload: Omit<Notification, "id" | "read" | "createdAt">) => {
      if (!address) return
      const n: Notification = {
        ...payload,
        id: makeId(),
        read: false,
        createdAt: Date.now(),
      }
      setNotifications((prev) => {
        const next = [...prev, n]
        saveAll(address, next)
        return next
      })
    },
    [address],
  )

  const markAllRead = useCallback(() => {
    if (!address) return
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }))
      saveAll(address, next)
      return next
    })
  }, [address])

  const markRead = useCallback(
    (id: string) => {
      if (!address) return
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        saveAll(address, next)
        return next
      })
    },
    [address],
  )

  // Sorted newest-first for display
  const sorted = [...notifications].sort((a, b) => b.createdAt - a.createdAt)

  return { notifications: sorted, unreadCount, addNotification, markAllRead, markRead }
}
