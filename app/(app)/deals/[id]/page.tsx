"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  CheckmarkCircle02Icon,
  Mail01Icon,
  Clock01Icon,
  Copy01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useAccount } from "wagmi"

import { Icon } from "@/components/arctic/icon"
import { StatusBadge } from "@/components/arctic/status-badge"
import { Button } from "@/components/ui/button"
import { useDealActions, useDealById, useOwed, useWithdraw } from "@/lib/deals-store"
import { CONTRACT_ADDRESS } from "@/lib/arc"
import { formatCountdown, useChainNow } from "@/lib/chain-time"
import { dealUrl, mailtoFor, parseShare, readShareRaw } from "@/lib/share"
import { explorerAddr, explorerTx, localDateTime, shortAddress, shortDate, usdc } from "@/lib/format"
import type { Deal, Milestone } from "@/lib/types"
import { cn } from "@/lib/utils"

const ruleLabels = {
  approval: "Payee delivers, payer reviews",
  schedule: "Scheduled",
} as const

type Actions = ReturnType<typeof useDealActions>
type ActionName = Exclude<Actions["pending"], undefined>

function formatPeriod(seconds: number) {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} day${seconds === 86_400 ? "" : "s"}`
  if (seconds % 3_600 === 0) return `${seconds / 3_600} hour${seconds === 3_600 ? "" : "s"}`
  return `${Math.round(seconds / 60)} min`
}

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

export default function DealPage() {
  const { id } = useParams<{ id: string }>()
  const { address } = useAccount()
  const chainNow = useChainNow()

  const dealId = BigInt(id ?? "0")
  const { deal, isLoading, refetch } = useDealById(id ? dealId : undefined)
  const actions = useDealActions(dealId)
  const { owed, refetch: refetchOwed } = useOwed()
  const { withdraw, isPending: withdrawing } = useWithdraw()

  async function run(label: string, fn: () => Promise<`0x${string}`>, description?: string) {
    try {
      const hash = await fn()
      toast.success(label, {
        description,
        action: { label: "Explorer", onClick: () => window.open(explorerTx(hash), "_blank") },
      })
      refetch()
      refetchOwed()
    } catch (err) {
      toast.error("Transaction failed", { description: err instanceof Error ? err.message.slice(0, 160) : String(err) })
    }
  }

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-8 text-sm text-muted-foreground">
        Loading deal…
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="glass mx-auto mt-16 max-w-md rounded-2xl p-8 text-center">
        <h1 className="font-medium">Deal not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          It may not exist, or your wallet has no access to it.
        </p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/deals">Back to deals</Link>
        </Button>
      </div>
    )
  }

  const isPayer = same(address, deal.payer.address)
  const isPayee = same(address, deal.payee.address)
  const isArbiter = same(address, deal.arbiter?.address)
  const accepted = !!deal.acceptedAt
  const completed = deal.status === "completed"

  // Refunded milestones are no longer held, so sum what is still open.
  const locked = deal.milestones
    .filter((m) => m.status !== "released" && m.status !== "refunded")
    .reduce((sum, m) => sum + m.amount, 0)
  const pct = deal.total > 0 ? Math.round((deal.released / deal.total) * 100) : 0

  return (
    <>
      <Link
        href="/deals"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Icon icon={ArrowLeft01Icon} size={14} /> Deals
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{deal.title}</h1>
            <StatusBadge status={deal.status} />
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Icon icon={UserIcon} size={14} />
              {deal.payee.name ?? shortAddress(deal.payee.address)}
            </span>
            {deal.payee.name && (
              <span className="tabular">{shortAddress(deal.payee.address)}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CONTRACT_ADDRESS && (
            <Button variant="outline" asChild>
              <a href={explorerAddr(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
                View on explorer <Icon icon={ArrowUpRight01Icon} size={14} />
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(id)
              toast.success("Deal ID copied")
            }}
          >
            <Icon icon={Copy01Icon} />
            #{id}
          </Button>
        </div>
      </div>

      {owed > 0 && (
        <section className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
          <div>
            <p className="font-medium">${usdc(owed, 2)} USDC waiting for you</p>
            <p className="text-xs text-muted-foreground">
              An earlier payment to this wallet could not be sent automatically. Withdraw it now.
            </p>
          </div>
          <Button disabled={withdrawing} onClick={() => void run("Withdrawn", withdraw)}>
            {withdrawing ? "Confirming…" : "Withdraw"}
          </Button>
        </section>
      )}

      {!accepted && !completed && (
        <AcceptBanner
          deal={deal}
          isPayee={isPayee}
          isPayer={isPayer}
          pending={actions.pending === "acceptDeal"}
          onAccept={() => void run("Deal accepted", actions.acceptDeal, "You can start work now.")}
        />
      )}

      <section className="glass-strong rounded-2xl p-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <Figure label="Total escrowed" value={`$${usdc(deal.total, 0)}`} />
          <Figure label="Released" value={`$${usdc(deal.released, 0)}`} />
          <Figure label="Held in escrow" value={`$${usdc(locked, 0)}`} />
        </div>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-foreground transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="tabular mt-3 text-xs text-muted-foreground">
          {pct}% released
          {deal.refunded > 0 ? ` · $${usdc(deal.refunded, 0)} refunded` : ""}
          {` · ${formatPeriod(deal.reviewPeriod)} review period`}
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="glass rounded-2xl p-6">
          <h2 className="font-medium">Milestones</h2>
          {deal.milestones.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No milestones.</p>
          ) : (
            <ol className="mt-5">
              {deal.milestones.map((m, i) => (
                <MilestoneRow
                  key={m.id}
                  m={m}
                  index={i}
                  last={i === deal.milestones.length - 1}
                  deal={deal}
                  chainNow={chainNow}
                  role={{ isPayer, isPayee, isArbiter, accepted }}
                  actions={actions}
                  run={run}
                />
              ))}
            </ol>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass h-fit rounded-2xl p-6">
            <h2 className="font-medium">Payout split</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Every release is divided automatically.
            </p>
            <ul className="mt-5 space-y-4">
              {deal.splits.map((s) => (
                <li key={s.address}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="truncate">
                      {same(s.address, deal.payee.address) ? "Payee" : same(s.address, deal.payer.address) ? "Payer" : shortAddress(s.address)}
                    </span>
                    <span className="tabular font-medium">{s.bps / 100}%</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="h-full rounded-full bg-foreground"
                      style={{ width: `${s.bps / 100}%` }}
                    />
                  </div>
                  <p className="tabular mt-1 text-xs text-muted-foreground">
                    {shortAddress(s.address)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass h-fit rounded-2xl p-6">
            <h2 className="font-medium">Arbiter</h2>
            {deal.arbiter ? (
              <>
                <p className="tabular mt-2 text-sm">{shortAddress(deal.arbiter.address)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Settles disputed milestones: release to the payee or refund to the payer.
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                None. A disputed milestone stays locked until the payer releases it or the payee refunds it.
              </p>
            )}
          </div>
        </div>
      </section>

      <ShareCard dealId={id} title={deal.title} />
    </>
  )
}

function AcceptBanner({
  deal,
  isPayee,
  isPayer,
  pending,
  onAccept,
}: {
  deal: Deal
  isPayee: boolean
  isPayer: boolean
  pending: boolean
  onAccept: () => void
}) {
  const payeeShare = deal.splits
    .filter((s) => same(s.address, deal.payee.address))
    .reduce((sum, s) => sum + s.bps, 0)

  if (isPayee) {
    return (
      <section className="glass-strong space-y-3 rounded-2xl border border-foreground/20 p-5">
        <div>
          <p className="font-medium">Review and accept this deal</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check the milestones, deadlines, arbiter and payout split below before you start work.
            Until you accept, the payer can cancel. After you accept, scheduled releases are locked in
            and the payer can only take back milestones you miss the deadline on.
          </p>
        </div>
        {payeeShare < 10_000 && (
          <p className="text-xs text-destructive">
            Heads up: your wallet receives {payeeShare / 100}% of each release. The rest goes to other wallets.
          </p>
        )}
        <Button disabled={pending} onClick={onAccept}>
          {pending ? "Confirming…" : "Accept deal"}
        </Button>
      </section>
    )
  }

  return (
    <section className="glass rounded-2xl p-5 text-sm">
      <p className="font-medium">Waiting for the payee to accept</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {isPayer
          ? "Share the link with the payee. Until they accept, you can refund any milestone."
          : "The payee has not accepted this deal yet."}
      </p>
    </section>
  )
}

type Role = { isPayer: boolean; isPayee: boolean; isArbiter: boolean; accepted: boolean }

function MilestoneRow({
  m,
  index,
  last,
  deal,
  chainNow,
  role,
  actions,
  run,
}: {
  m: Milestone
  index: number
  last: boolean
  deal: Deal
  chainNow: number
  role: Role
  actions: Actions
  run: (label: string, fn: () => Promise<`0x${string}`>, description?: string) => Promise<void>
}) {
  const { isPayer, isPayee, isArbiter, accepted } = role
  const done = m.status === "released" || m.status === "refunded"
  const busy = actions.pending !== undefined

  const at = (iso?: string) => (iso ? Date.parse(iso) : undefined)
  const dueMs = at(m.dueAt)
  const deliverByMs = at(m.deliverBy)
  const reviewEndsMs = m.deliveredAt ? Date.parse(m.deliveredAt) + deal.reviewPeriod * 1000 : undefined

  const scheduleReady = dueMs !== undefined && chainNow >= dueMs
  const reviewOver = reviewEndsMs !== undefined && chainNow >= reviewEndsMs
  const pastDeadline = deliverByMs !== undefined && chainNow > deliverByMs

  // Mirrors the contract rules in ArcticEscrow v2.
  const canDeliver =
    isPayee && accepted && m.rule === "approval" && (m.status === "pending" || m.status === "disputed")
  const canDispute = isPayer && m.status === "submitted" && !reviewOver
  const canRelease =
    m.rule === "schedule"
      ? accepted && m.status === "pending" && scheduleReady
      : (m.status === "submitted" && (isPayer || reviewOver)) || (m.status === "disputed" && isPayer)
  const canRefund =
    !done &&
    ((isPayee && m.status !== "released") ||
      (isPayer && m.status === "pending" && (!accepted || (m.rule === "approval" && pastDeadline))))
  const canResolve = isArbiter && m.status === "disputed"

  const releaseLabel =
    m.status === "disputed" ? "Accept and release" : !isPayer && reviewOver ? "Claim payment" : "Release"

  const btn = (name: ActionName, text: string) => (actions.pending === name ? "Confirming…" : text)
  const amount = `$${usdc(m.amount, 2)}`

  let hint: string | undefined
  if (!done) {
    if (m.rule === "schedule") {
      if (!accepted) hint = "Locks in when the payee accepts the deal."
    } else if (m.status === "pending") {
      if (isPayer) hint = pastDeadline
        ? "The delivery deadline has passed. You can refund this milestone."
        : "Waiting for the payee to deliver."
      if (isPayee) hint = accepted ? "Mark this delivered when the work is done." : "Accept the deal first."
    } else if (m.status === "submitted") {
      if (isPayer) hint = "Release it if you're happy, or dispute it before the review ends. If you do nothing, the payee can claim it."
      if (isPayee) hint = reviewOver ? "Review period is over. You can claim this payment." : "Waiting for the payer to review."
    } else if (m.status === "disputed") {
      hint = deal.arbiter
        ? "Disputed. The arbiter decides, or the payee can resubmit or refund, or the payer can release."
        : "Disputed. The payee can resubmit or refund, or the payer can release."
    }
  }

  return (
    <li className="relative flex gap-4 pb-7 last:pb-0">
      {!last && (
        <span
          className={cn(
            "absolute top-8 bottom-0 left-[15px] w-px",
            done ? "bg-foreground/40" : "bg-foreground/10",
          )}
        />
      )}
      <span
        className={cn(
          "z-10 flex size-8 shrink-0 items-center justify-center rounded-full border",
          done ? "border-foreground bg-foreground text-background" : "glass text-muted-foreground",
        )}
      >
        <Icon icon={done ? CheckmarkCircle02Icon : Clock01Icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">{m.title}</p>
            <p className="text-xs text-muted-foreground">
              {ruleLabels[m.rule]}
              {m.dueAt ? ` · releases ${localDateTime(m.dueAt)}` : ""}
              {m.deliverBy && !done ? ` · deliver by ${localDateTime(m.deliverBy)}` : ""}
              {m.releasedAt ? ` · ${m.status} ${shortDate(m.releasedAt)}` : ""}
            </p>
          </div>
          <span className="tabular font-medium">${usdc(m.amount, 0)}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={m.status} />
          {m.rule === "schedule" && !done && dueMs !== undefined && (
            <span className="tabular text-xs text-muted-foreground">
              {scheduleReady ? "Ready to release" : `Releases in ${formatCountdown(dueMs - chainNow)}`}
            </span>
          )}
          {m.status === "submitted" && reviewEndsMs !== undefined && (
            <span className="tabular text-xs text-muted-foreground">
              {reviewOver ? "Review period over" : `Review ends in ${formatCountdown(reviewEndsMs - chainNow)}`}
            </span>
          )}
          {canDeliver && (
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => void run(m.status === "disputed" ? "Resubmitted" : "Marked delivered", () => actions.markDelivered(index), m.title)}>
              {btn("markDelivered", m.status === "disputed" ? "Resubmit" : "Mark delivered")}
            </Button>
          )}
          {canRelease && (
            <Button size="sm" disabled={busy}
              onClick={() => void run(`Released ${amount} USDC`, () => actions.releaseMilestone(index), m.title)}>
              {btn("releaseMilestone", `${releaseLabel} ${amount}`)}
            </Button>
          )}
          {canDispute && (
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => void run("Milestone disputed", () => actions.disputeMilestone(index), m.title)}>
              {btn("disputeMilestone", "Dispute")}
            </Button>
          )}
          {canResolve && (
            <>
              <Button size="sm" disabled={busy}
                onClick={() => void run(`Released ${amount} to payee`, () => actions.resolveDispute(index, true), m.title)}>
                {btn("resolveDispute", "Release to payee")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => void run(`Refunded ${amount} to payer`, () => actions.resolveDispute(index, false), m.title)}>
                Refund payer
              </Button>
            </>
          )}
          {canRefund && (
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => void run(`Refunded ${amount} USDC`, () => actions.refundMilestone(index), m.title)}>
              {btn("refundMilestone", "Refund")}
            </Button>
          )}
        </div>
        {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </li>
  )
}

function ShareCard({ dealId, title }: { dealId: string; title: string }) {
  // Stored per browser; empty on the server so hydration matches.
  const raw = React.useSyncExternalStore(
    () => () => {},
    () => readShareRaw(dealId),
    () => "",
  )
  const recipients = React.useMemo(() => parseShare(raw), [raw])

  return (
    <section className="glass rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Share this deal</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Send the link so the payee and arbiter can open the deal with their wallet.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(dealUrl(dealId))
            toast.success("Deal link copied")
          }}
        >
          <Icon icon={Copy01Icon} /> Copy link
        </Button>
      </div>
      {recipients.length > 0 && (
        <ul className="mt-5 space-y-3">
          {recipients.map((r) => (
            <li key={`${r.role}-${r.email}-${r.address}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name ?? r.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.role} · {r.email}
                </p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <a href={mailtoFor(r, dealId, title)}>
                  <Icon icon={Mail01Icon} size={14} /> Email link
                </a>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
