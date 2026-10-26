"use client"

import * as React from "react"

import type {
  ActivityEvent,
  Deal,
  Milestone,
  Party,
  SplitShare,
} from "@/lib/types"

export type NewDealInput = {
  title: string
  payee: Party
  milestones: Pick<Milestone, "title" | "amount" | "rule" | "dueAt">[]
  splits: SplitShare[]
}

type State = { deals: Deal[]; activity: ActivityEvent[] }

const STORAGE_KEY = "arctic.deals.v1"
const EMPTY: State = { deals: [], activity: [] }

// Client-side store persisted to localStorage. The escrow contract calls in
// lib/escrow.ts replace these mutations once the contracts are deployed.
let state: State = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded || typeof window === "undefined") return
  loaded = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) state = JSON.parse(raw) as State
  } catch {
    state = EMPTY
  }
}

function commit(next: State) {
  state = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  load()
  return state
}

function getServerSnapshot() {
  return EMPTY
}

function event(partial: Omit<ActivityEvent, "id" | "at">): ActivityEvent {
  return { ...partial, id: `ev-${Date.now()}`, at: new Date().toISOString() }
}

function createDeal(input: NewDealInput): Deal {
  load()
  const total = input.milestones.reduce((sum, m) => sum + m.amount, 0)
  const deal: Deal = {
    id: `deal-${Date.now().toString(36)}`,
    title: input.title,
    payee: input.payee,
    total,
    released: 0,
    status: "funded",
    createdAt: new Date().toISOString(),
    milestones: input.milestones.map((m, i) => ({
      ...m,
      id: `m${i + 1}`,
      status: "pending",
    })),
    splits: input.splits,
  }
  commit({
    deals: [deal, ...state.deals],
    activity: [
      event({
        kind: "created",
        dealId: deal.id,
        label: `Deal created · ${deal.title}`,
        amount: total,
      }),
      ...state.activity,
    ],
  })
  return deal
}

function submitMilestone(dealId: string, milestoneId: string) {
  load()
  commit({
    ...state,
    deals: state.deals.map((d) =>
      d.id !== dealId
        ? d
        : {
            ...d,
            milestones: d.milestones.map((m) =>
              m.id === milestoneId ? { ...m, status: "submitted" } : m,
            ),
          },
    ),
  })
}

function releaseMilestone(dealId: string, milestoneId: string) {
  load()
  const deal = state.deals.find((d) => d.id === dealId)
  const target = deal?.milestones.find((m) => m.id === milestoneId)
  if (!deal || !target || target.status === "released") return

  const released = deal.released + target.amount
  const split = deal.splits.length > 1

  commit({
    deals: state.deals.map((d) =>
      d.id !== dealId
        ? d
        : {
            ...d,
            released,
            status: released >= d.total ? "completed" : "in_progress",
            milestones: d.milestones.map((m) =>
              m.id === milestoneId
                ? { ...m, status: "released", releasedAt: new Date().toISOString() }
                : m,
            ),
          },
    ),
    activity: [
      event({
        kind: split ? "split" : "released",
        dealId,
        label: split
          ? `${target.title} split across ${deal.splits.length} recipients`
          : `Released ${target.title}`,
        amount: target.amount,
      }),
      ...state.activity,
    ],
  })
}

export function useDeals() {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    deals: snapshot.deals,
    activity: snapshot.activity,
    createDeal,
    submitMilestone,
    releaseMilestone,
  }
}
