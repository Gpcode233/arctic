"use client"

/**
 * Onchain deals store — reads directly from ArcticEscrow via wagmi hooks.
 * Falls back gracefully when CONTRACT_ADDRESS is not configured.
 *
 * Keeps the same public API surface as the old localStorage store so all
 * pages continue to compile without changes until Phase 4 wires them.
 */

import * as React from "react"
import { parseUnits, formatUnits, type Address } from "viem"
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
  YIELD_ENABLED,
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

// ─────────────────────────────────────────────────────────────────────────
// Types for form inputs
// ─────────────────────────────────────────────────────────────────────────

export type NewDealInput = {
  title: string
  payee: Party
  milestones: Pick<Milestone, "title" | "amount" | "rule" | "dueAt">[]
  splits: SplitShare[]
  earnYield?: boolean
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function usdcWhole(raw: bigint): number {
  return Number(formatUnits(raw, USDC_DECIMALS))
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
    default: return "pending"
  }
}

function msRuleFromContract(r: number): Milestone["rule"] {
  return r === 1 ? "schedule" : "approval"
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

  const { data: dealRaw, isLoading: l1, refetch: r1 } = useReadContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "getDeal",
    args: [dealId],
    query: { enabled: !!escrow && dealId !== undefined },
  })

  const { data: msRaw, isLoading: l2, refetch: r2 } = useReadContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "getMilestones",
    args: [dealId],
    query: { enabled: !!escrow && dealId !== undefined },
  })

  const { data: splitsRaw, isLoading: l3, refetch: r3 } = useReadContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "getSplits",
    args: [dealId],
    query: { enabled: !!escrow && dealId !== undefined },
  })

  const { data: yieldRaw } = useReadContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "pendingYield",
    args: [dealId],
    query: { enabled: !!escrow && dealId !== undefined && YIELD_ENABLED },
  })

  const deal = React.useMemo(() => {
    if (!dealRaw || !msRaw || !splitsRaw) return undefined
    const d = dealRaw as {
      payer: Address; payee: Address; total: bigint; released: bigint;
      principalRemaining: bigint; shares: bigint; earnYield: boolean;
      createdAt: bigint; feeBps: number; yieldFeeBps: number; status: number
    }
    const milestones: Milestone[] = (msRaw as Array<{
      amount: bigint; releaseTime: bigint; rule: number; state: number; releasedAt: bigint
    }>).map((m, i) => ({
      id: `${String(dealId)}-${i}`,
      title: `Milestone ${i + 1}`,   // titles not stored onchain; show index
      amount: usdcWhole(m.amount),
      rule: msRuleFromContract(m.rule),
      status: msStatusFromContract(m.state),
      dueAt: m.releaseTime > 0n ? new Date(Number(m.releaseTime) * 1000).toISOString() : undefined,
      releasedAt: m.releasedAt > 0n ? new Date(Number(m.releasedAt) * 1000).toISOString() : undefined,
    }))
    const splits: SplitShare[] = (splitsRaw as Array<{ recipient: Address; bps: number }>).map((s) => ({
      recipient: s.recipient,
      address: s.recipient,
      bps: s.bps,
    }))
    return {
      id: String(dealId),
      title: `Deal #${String(dealId)}`,   // title not stored onchain
      payer: { address: d.payer },
      payee: { address: d.payee },
      total: usdcWhole(d.total),
      released: usdcWhole(d.released),
      status: statusFromContract(d.status),
      createdAt: new Date(Number(d.createdAt) * 1000).toISOString(),
      milestones,
      splits,
      earnYield: d.earnYield,
      yieldEarned: yieldRaw !== undefined ? usdcWhole(yieldRaw as bigint) : undefined,
      feeBps: d.feeBps,
    } satisfies Deal
  }, [dealRaw, msRaw, splitsRaw, yieldRaw, dealId])

  return {
    deal,
    isLoading: l1 || l2 || l3,
    refetch: () => { void r1(); void r2(); void r3() },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Read hook: all deals for connected wallet
// ─────────────────────────────────────────────────────────────────────────

export function useDeals(): {
  deals: Deal[]
  activity: ActivityEvent[]
  isLoading: boolean
  refetch: () => void
} {
  const { address } = useAccount()
  const escrow = CONTRACT_ADDRESS as Address | undefined

  const { data: payerIds, refetch: rp } = useReadContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "dealsByPayer",
    args: [address],
    query: { enabled: !!escrow && !!address },
  })

  const { data: payeeIds, refetch: re } = useReadContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "dealsByPayee",
    args: [address],
    query: { enabled: !!escrow && !!address },
  })

  // Merge and dedupe deal ids
  const allIds = React.useMemo(() => {
    const ids = new Set<bigint>()
    ;(payerIds as bigint[] | undefined)?.forEach((id) => ids.add(id))
    ;(payeeIds as bigint[] | undefined)?.forEach((id) => ids.add(id))
    return [...ids]
  }, [payerIds, payeeIds])

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
      const d = res.result as {
        payer: Address; payee: Address; total: bigint; released: bigint;
        createdAt: bigint; feeBps: number; earnYield: boolean; status: number
      }
      const id = allIds[i]
      return [{
        id: String(id),
        title: `Deal #${String(id)}`,
        payer: { address: d.payer },
        payee: { address: d.payee },
        total: usdcWhole(d.total),
        released: usdcWhole(d.released),
        status: statusFromContract(d.status),
        createdAt: new Date(Number(d.createdAt) * 1000).toISOString(),
        milestones: [],   // loaded lazily in deal detail page
        splits: [],
        earnYield: d.earnYield,
        feeBps: d.feeBps,
      } satisfies Deal]
    })
  }, [dealsRaw, allIds])

  return {
    deals,
    activity: [],    // activity feed from events — implemented via logs in detail page
    isLoading: isLoading && allIds.length > 0,
    refetch: () => { void rp(); void re(); void rd() },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Write hooks
// ─────────────────────────────────────────────────────────────────────────

export type CreateStep = "idle" | "approve" | "approving" | "create" | "confirming"

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
      const totalWhole = input.milestones.reduce((sum, m) => sum + m.amount, 0)
      const totalRaw = parseUnits(String(totalWhole), USDC_DECIMALS)

      // Step 1: approve USDC (skipped when existing allowance already covers the deal)
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

      // Step 2: build milestone and split structs
      const milestonesIn = input.milestones.map((m) => ({
        title: m.title,
        amount: parseUnits(String(m.amount), USDC_DECIMALS),
        rule: m.rule === "schedule" ? 1 : 0,
        releaseTime: m.rule === "schedule" && m.dueAt
          ? BigInt(Math.floor(new Date(m.dueAt).getTime() / 1000))
          : 0n,
      }))

      const effectiveSplits = input.splits.length > 0
        ? input.splits.map((s) => ({ recipient: s.address as Address, bps: s.bps }))
        : [{ recipient: input.payee.address as Address, bps: 10000 }]

      // Step 3: createDeal
      const createArgs = [
        input.payee.address as Address,
        input.title,
        milestonesIn,
        effectiveSplits,
        input.earnYield ?? false,
      ] as const

      // Simulate first so a revert surfaces as a readable error, not a silent wallet failure
      try {
        await client.simulateContract({
          account: address,
          address: escrow,
          abi: ESCROW_ABI,
          functionName: "createDeal",
          args: createArgs,
        })
      } catch (err) {
        const e = err as { shortMessage?: string; message?: string }
        throw new Error(e.shortMessage ?? e.message ?? "createDeal would revert")
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

export function useMarkDelivered(dealId: bigint | undefined) {
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient()
  const escrow = CONTRACT_ADDRESS as Address | undefined

  const [isPending, setIsPending] = React.useState(false)

  async function markDelivered(index: number) {
    if (!escrow || dealId === undefined) throw new Error("No contract or deal")
    setIsPending(true)
    try {
      const hash = await writeContractAsync({
        address: escrow,
        abi: ESCROW_ABI,
        functionName: "markDelivered",
        args: [dealId, BigInt(index)],
      })
      await waitForReceipt(client!, hash)
      return hash
    } finally {
      setIsPending(false)
    }
  }

  return { markDelivered, isPending }
}

export function useReleaseMilestone(dealId: bigint | undefined) {
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient()
  const escrow = CONTRACT_ADDRESS as Address | undefined

  const [isPending, setIsPending] = React.useState(false)

  async function releaseMilestone(index: number) {
    if (!escrow || dealId === undefined) throw new Error("No contract or deal")
    setIsPending(true)
    try {
      const hash = await writeContractAsync({
        address: escrow,
        abi: ESCROW_ABI,
        functionName: "releaseMilestone",
        args: [dealId, BigInt(index)],
      })
      await waitForReceipt(client!, hash)
      return hash
    } finally {
      setIsPending(false)
    }
  }

  return { releaseMilestone, isPending }
}

export function useRefundMilestone(dealId: bigint | undefined) {
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient()
  const escrow = CONTRACT_ADDRESS as Address | undefined

  const [isPending, setIsPending] = React.useState(false)

  async function refundMilestone(index: number) {
    if (!escrow || dealId === undefined) throw new Error("No contract or deal")
    setIsPending(true)
    try {
      const hash = await writeContractAsync({
        address: escrow,
        abi: ESCROW_ABI,
        functionName: "refundMilestone",
        args: [dealId, BigInt(index)],
      })
      await waitForReceipt(client!, hash)
      return hash
    } finally {
      setIsPending(false)
    }
  }

  return { refundMilestone, isPending }
}
