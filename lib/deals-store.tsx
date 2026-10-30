"use client"

/**
 * Onchain deals store — reads directly from ArcticEscrow (v2) via wagmi hooks.
 * Falls back gracefully when CONTRACT_ADDRESS is not configured.
 */

import * as React from "react"
import { parseUnits, formatUnits, zeroAddress, type Address } from "viem"
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  usePublicClient,
} from "wagmi"
import { erc20Abi } from "viem"

import {
  CONTRACT_ADDRESS,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "@/lib/arc"
import type {
  ActivityEvent,
  Deal,
  Milestone,
  MilestoneStatus,
  Party,
  SplitShare,
} from "@/lib/types"
import ESCROW_ABI_JSON from "@/lib/abi/ArcticEscrow.json"
import type { Abi, PublicClient } from "viem"
// Cast to Abi so wagmi hooks accept it without "string not assignable to 'function'" errors
const ESCROW_ABI = ESCROW_ABI_JSON as unknown as Abi

/** Max ids the contract returns per dealsByPayer / dealsByPayee page. */
const PAGE_SIZE = 100n

/**
 * Poll for a receipt directly. viem's waitForTransactionReceipt times out in the
 * browser against the Arc RPC even for mined txs, so poll getTransactionReceipt.
 */
async function waitForReceipt(client: PublicClient, hash: `0x${string}`, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const receipt = await client.getTransactionReceipt({ hash })
      if (receipt.status === "reverted") throw new Error("Transaction reverted onchain")
      return receipt
    } catch (err) {
      if (err instanceof Error && err.message.includes("reverted onchain")) throw err
      // not mined yet (or transient RPC error) - keep polling
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error("Still waiting for confirmation. Check the explorer for the transaction.")
}

function readableError(err: unknown, fallback: string): Error {
  const e = err as { shortMessage?: string; message?: string }
  return new Error(e.shortMessage ?? e.message ?? fallback)
}

// ─────────────────────────────────────────────────────────────────────────
// Types for form inputs
// ─────────────────────────────────────────────────────────────────────────

export type NewDealInput = {
  title: string
  payee: Party
  arbiter: Party
  /** Seconds the payer has to review each delivery. */
  reviewPeriod: number
  milestones: Pick<Milestone, "title" | "amount" | "rule" | "dueAt" | "deliverBy">[]
  splits: SplitShare[]
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

type RawDeal = {
  payer: Address; payee: Address; arbiter: Address
  total: bigint; released: bigint; refunded: bigint
  createdAt: bigint; acceptedAt: bigint; reviewPeriod: number
  feeBps: number; status: number
}

type RawMilestone = {
  amount: bigint; releaseTime: bigint; deliverBy: bigint
  deliveredAt: bigint; settledAt: bigint; rule: number; state: number
}

function usdcWhole(raw: bigint): number {
  return Number(formatUnits(raw, USDC_DECIMALS))
}

function isoOrUndefined(sec: bigint): string | undefined {
  return sec > 0n ? new Date(Number(sec) * 1000).toISOString() : undefined
}

function statusFromContract(s: number): Deal["status"] {
  if (s === 2) return "completed"
  if (s === 1) return "in_progress"
  return "funded"
}

function msStatusFromContract(s: number): MilestoneStatus {
  switch (s) {
    case 1: return "submitted"
    case 2: return "released"
    case 3: return "refunded"
    case 4: return "disputed"
    default: return "pending"
  }
}

function msRuleFromContract(r: number): Milestone["rule"] {
  return r === 1 ? "schedule" : "approval"
}

function dealFromContract(id: bigint, d: RawDeal): Omit<Deal, "milestones" | "splits"> {
  return {
    id: String(id),
    title: `Deal #${String(id)}`,   // title is only emitted in DealCreated
    payer: { address: d.payer },
    payee: { address: d.payee },
    arbiter: d.arbiter !== zeroAddress ? { address: d.arbiter } : undefined,
    total: usdcWhole(d.total),
    released: usdcWhole(d.released),
    refunded: usdcWhole(d.refunded),
    status: statusFromContract(d.status),
    createdAt: new Date(Number(d.createdAt) * 1000).toISOString(),
    acceptedAt: isoOrUndefined(d.acceptedAt),
    reviewPeriod: Number(d.reviewPeriod),
    feeBps: d.feeBps,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Read hook: load a single deal by onchain id (bigint)
// ─────────────────────────────────────────────────────────────────────────

export function useDealById(dealId: bigint | undefined): {
  deal: Deal | undefined
  isLoading: boolean
  refetch: () => void
} {
  const escrow = CONTRACT_ADDRESS as Address | undefined
  const enabled = !!escrow && dealId !== undefined

  const { data: dealRaw, isLoading: l1, refetch: r1 } = useReadContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "getDeal",
    args: [dealId],
    query: { enabled },
  })

  const { data: msRaw, isLoading: l2, refetch: r2 } = useReadContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "getMilestones",
    args: [dealId],
    query: { enabled },
  })

  const { data: splitsRaw, isLoading: l3, refetch: r3 } = useReadContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "getSplits",
    args: [dealId],
    query: { enabled },
  })

  const deal = React.useMemo(() => {
    if (!dealRaw || !msRaw || !splitsRaw || dealId === undefined) return undefined
    const d = dealRaw as RawDeal
    if (d.payer === zeroAddress) return undefined
    const milestones: Milestone[] = (msRaw as RawMilestone[]).map((m, i) => ({
      id: `${String(dealId)}-${i}`,
      title: `Milestone ${i + 1}`,   // titles not stored onchain; show index
      amount: usdcWhole(m.amount),
      rule: msRuleFromContract(m.rule),
      status: msStatusFromContract(m.state),
      dueAt: isoOrUndefined(m.releaseTime),
      deliverBy: isoOrUndefined(m.deliverBy),
      deliveredAt: isoOrUndefined(m.deliveredAt),
      releasedAt: isoOrUndefined(m.settledAt),
    }))
    const splits: SplitShare[] = (splitsRaw as Array<{ recipient: Address; bps: number }>).map((s) => ({
      recipient: s.recipient,
      address: s.recipient,
      bps: s.bps,
    }))
    return { ...dealFromContract(dealId, d), milestones, splits } satisfies Deal
  }, [dealRaw, msRaw, splitsRaw, dealId])

  return {
    deal,
    isLoading: l1 || l2 || l3,
    refetch: () => { void r1(); void r2(); void r3() },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Read hook: all deals for connected wallet
// ─────────────────────────────────────────────────────────────────────────

function pageCalls(escrow: Address, fn: "dealsByPayer" | "dealsByPayee", who: Address, count: bigint) {
  const calls = []
  for (let offset = 0n; offset < count; offset += PAGE_SIZE) {
    calls.push({ address: escrow, abi: ESCROW_ABI, functionName: fn, args: [who, offset, PAGE_SIZE] as const })
  }
  return calls
}

export function useDeals(): {
  deals: Deal[]
  activity: ActivityEvent[]
  isLoading: boolean
  refetch: () => void
} {
  const { address } = useAccount()
  const escrow = CONTRACT_ADDRESS as Address | undefined

  const { data: counts, refetch: rc } = useReadContracts({
    contracts: escrow && address
      ? [
          { address: escrow, abi: ESCROW_ABI, functionName: "dealCountByPayer", args: [address] },
          { address: escrow, abi: ESCROW_ABI, functionName: "dealCountByPayee", args: [address] },
        ]
      : [],
    query: { enabled: !!escrow && !!address },
  })

  const idCalls = React.useMemo(() => {
    if (!escrow || !address || !counts) return []
    const payerCount = (counts[0]?.result as bigint | undefined) ?? 0n
    const payeeCount = (counts[1]?.result as bigint | undefined) ?? 0n
    return [
      ...pageCalls(escrow, "dealsByPayer", address, payerCount),
      ...pageCalls(escrow, "dealsByPayee", address, payeeCount),
    ]
  }, [escrow, address, counts])

  const { data: idPages, refetch: ri } = useReadContracts({
    contracts: idCalls,
    query: { enabled: idCalls.length > 0 },
  })

  // Merge and dedupe deal ids
  const allIds = React.useMemo(() => {
    const ids = new Set<bigint>()
    idPages?.forEach((page) => (page.result as bigint[] | undefined)?.forEach((id) => ids.add(id)))
    return [...ids]
  }, [idPages])

  // Batch read all deal headers
  const dealContracts = React.useMemo(() =>
    allIds.map((id) => ({
      address: escrow as Address,
      abi: ESCROW_ABI,
      functionName: "getDeal" as const,
      args: [id] as const,
    })),
    [allIds, escrow],
  )

  const { data: dealsRaw, isLoading, refetch: rd } = useReadContracts({
    contracts: dealContracts,
    query: { enabled: !!escrow && allIds.length > 0 },
  })

  const deals = React.useMemo(() => {
    if (!dealsRaw) return []
    return dealsRaw.flatMap((res, i) => {
      if (res.status !== "success") return []
      return [{
        ...dealFromContract(allIds[i], res.result as RawDeal),
        milestones: [],   // loaded lazily in deal detail page
        splits: [],
      } satisfies Deal]
    })
  }, [dealsRaw, allIds])

  return {
    deals,
    activity: [],    // activity feed from events — implemented via logs in detail page
    isLoading: isLoading && allIds.length > 0,
    refetch: () => { void rc(); void ri(); void rd() },
  }
}

/** USDC credited to the connected wallet after a failed push payment. */
export function useOwed(): { owed: number; refetch: () => void } {
  const { address } = useAccount()
  const escrow = CONTRACT_ADDRESS as Address | undefined
  const { data, refetch } = useReadContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "owed",
    args: [address],
    query: { enabled: !!escrow && !!address },
  })
  return { owed: data !== undefined ? usdcWhole(data as bigint) : 0, refetch: () => void refetch() }
}

// ─────────────────────────────────────────────────────────────────────────
// Write hooks
// ─────────────────────────────────────────────────────────────────────────

export type CreateStep = "idle" | "approve" | "approving" | "create" | "confirming"

const toSec = (iso: string) => BigInt(Math.floor(new Date(iso).getTime() / 1000))

/** Approve USDC spend then create deal in one flow. */
export function useCreateDeal() {
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient()
  const { address } = useAccount()
  const escrow = CONTRACT_ADDRESS as Address | undefined

  const [isPending, setIsPending] = React.useState(false)
  const [step, setStep] = React.useState<CreateStep>("idle")
  const [txHash, setTxHash] = React.useState<`0x${string}` | undefined>()


  async function createDeal(input: NewDealInput): Promise<{ dealId: bigint; txHash: `0x${string}` }> {
    if (!escrow) throw new Error("Contract not deployed. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local")
    if (!address || !client) throw new Error("Wallet not connected")

    setIsPending(true)
    try {
      // Step 1: build milestone and split structs (validate before any wallet prompt)
      const nowSec = Math.floor(Date.now() / 1000)
      const milestonesIn = input.milestones.map((m, i) => {
        const scheduled = m.rule === "schedule"
        const when = scheduled ? m.dueAt : m.deliverBy
        if (!when) throw new Error(`Milestone ${i + 1} needs a ${scheduled ? "release" : "delivery"} date`)
        const ts = toSec(when)
        // Contract rejects times <= block.timestamp; keep a 5 min buffer for wallet lag
        if (ts <= BigInt(nowSec + 300)) {
          throw new Error(`Milestone ${i + 1} date must be at least 5 minutes in the future.`)
        }
        return {
          title: m.title,
          amount: parseUnits(String(m.amount), USDC_DECIMALS),
          rule: scheduled ? 1 : 0,
          releaseTime: scheduled ? ts : 0n,
          deliverBy: scheduled ? 0n : ts,
        }
      })
      const totalRaw = milestonesIn.reduce((sum, m) => sum + m.amount, 0n)

      const effectiveSplits = input.splits.length > 0
        ? input.splits.map((s) => ({ recipient: s.address as Address, bps: s.bps }))
        : [{ recipient: input.payee.address as Address, bps: 10000 }]

      const createArgs = [
        input.payee.address as Address,
        input.arbiter.address as Address,
        input.title,
        milestonesIn,
        effectiveSplits,
        input.reviewPeriod,
      ] as const

      // Step 2: approve USDC (skipped when existing allowance already covers the deal)
      const allowance = await client
        .readContract({
          address: USDC_ADDRESS as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, escrow],
        })
        .catch(() => 0n) // RPC hiccup: fall back to approving
      if (allowance < totalRaw) {
        setStep("approve")
        const approveTx = await writeContractAsync({
          address: USDC_ADDRESS as Address,
          abi: erc20Abi,
          functionName: "approve",
          args: [escrow, totalRaw],
        })
        setStep("approving")
        await waitForReceipt(client, approveTx)
      }

      // Step 3: simulate first so a revert surfaces as a readable error, not a silent wallet failure
      try {
        await client.simulateContract({
          account: address,
          address: escrow,
          abi: ESCROW_ABI,
          functionName: "createDeal",
          args: createArgs,
        })
      } catch (err) {
        throw readableError(err, "createDeal would revert")
      }

      setStep("create")
      const createTx = await writeContractAsync({
        address: escrow,
        abi: ESCROW_ABI,
        functionName: "createDeal",
        args: createArgs,
      })
      setTxHash(createTx)

      setStep("confirming")
      const receipt = await waitForReceipt(client, createTx)

      // DealCreated(uint256 indexed dealId, ...) is emitted by the escrow itself;
      // ignore other contracts' logs (e.g. the USDC Transfer, whose topic[1] is an address).
      let dealId: bigint | undefined
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === escrow.toLowerCase() && log.topics[1]) {
          dealId = BigInt(log.topics[1])
          break
        }
      }
      if (dealId === undefined) throw new Error("Deal created, but its ID was not found in the receipt")

      return { dealId, txHash: createTx }
    } finally {
      setIsPending(false)
      setStep("idle")
    }
  }

  return { createDeal, isPending, step, txHash }
}

type EscrowAction =
  | "acceptDeal"
  | "markDelivered"
  | "disputeMilestone"
  | "releaseMilestone"
  | "refundMilestone"
  | "resolveDispute"
  | "withdraw"

/** Simulate, send and confirm a single escrow call. */
function useEscrowWrite() {
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient()
  const { address } = useAccount()
  const escrow = CONTRACT_ADDRESS as Address | undefined
  const [pending, setPending] = React.useState<EscrowAction | undefined>()

  async function send(functionName: EscrowAction, args: readonly unknown[]) {
    if (!escrow || !client) throw new Error("No contract configured")
    if (!address) throw new Error("Wallet not connected")
    setPending(functionName)
    try {
      try {
        await client.simulateContract({ account: address, address: escrow, abi: ESCROW_ABI, functionName, args })
      } catch (err) {
        throw readableError(err, `${functionName} would revert`)
      }
      const hash = await writeContractAsync({ address: escrow, abi: ESCROW_ABI, functionName, args })
      await waitForReceipt(client, hash)
      return hash
    } finally {
      setPending(undefined)
    }
  }

  return { send, pending }
}

/** All actions on one deal. `pending` names the call in flight, if any. */
export function useDealActions(dealId: bigint | undefined) {
  const { send, pending } = useEscrowWrite()
  const need = () => {
    if (dealId === undefined) throw new Error("No deal")
    return dealId
  }
  return {
    pending,
    acceptDeal: () => send("acceptDeal", [need()]),
    markDelivered: (i: number) => send("markDelivered", [need(), BigInt(i)]),
    disputeMilestone: (i: number) => send("disputeMilestone", [need(), BigInt(i)]),
    releaseMilestone: (i: number) => send("releaseMilestone", [need(), BigInt(i)]),
    refundMilestone: (i: number) => send("refundMilestone", [need(), BigInt(i)]),
    resolveDispute: (i: number, releaseToPayee: boolean) =>
      send("resolveDispute", [need(), BigInt(i), releaseToPayee]),
  }
}

/** Withdraw USDC credited to the connected wallet in `owed`. */
export function useWithdraw() {
  const { send, pending } = useEscrowWrite()
  return { withdraw: () => send("withdraw", []), isPending: pending === "withdraw" }
}
