"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Copy01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useAccount } from "wagmi"

import { Icon } from "@/components/arctic/icon"
import { StatusBadge } from "@/components/arctic/status-badge"
import { Button } from "@/components/ui/button"
import {
  useDealById,
  useMarkDelivered,
  useReleaseMilestone,
  useRefundMilestone,
} from "@/lib/deals-store"
import { explorerTx, shortAddress, shortDate, usdc } from "@/lib/format"
import { cn } from "@/lib/utils"

const ruleLabels = {
  approval: "Payer approval",
  schedule: "Scheduled",
} as const

export default function DealPage() {
  const { id } = useParams<{ id: string }>()
  const { address } = useAccount()

  const dealId = BigInt(id ?? "0")
  const { deal, isLoading, refetch } = useDealById(id ? dealId : undefined)

  const { markDelivered, isPending: pendingDeliver } = useMarkDelivered(dealId)
  const { releaseMilestone, isPending: pendingRelease } = useReleaseMilestone(dealId)
  const { refundMilestone, isPending: pendingRefund } = useRefundMilestone(dealId)
  const anyPending = pendingDeliver || pendingRelease || pendingRefund

  const isPayer = address && deal && address.toLowerCase() === deal.payer.address.toLowerCase()
  const isPayee = address && deal && address.toLowerCase() === deal.payee.address.toLowerCase()

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

  const locked = deal.total - deal.released
  const pct = deal.total > 0 ? Math.round((deal.released / deal.total) * 100) : 0

  async function handleDeliver(index: number, title: string) {
    try {
      await markDelivered(index)
      toast.success(`Marked delivered: ${title}`)
      refetch()
    } catch (err) {
      toast.error("Transaction failed", { description: err instanceof Error ? err.message.slice(0, 120) : String(err) })
    }
  }

  async function handleRelease(index: number, amount: number, title: string) {
    try {
      const hash = await releaseMilestone(index)
      toast.success(`Released $${usdc(amount, 2)} USDC`, { description: title })
      if (hash) toast.info("View on explorer", { action: { label: "Open", onClick: () => window.open(explorerTx(hash), "_blank") } })
      refetch()
    } catch (err) {
      toast.error("Transaction failed", { description: err instanceof Error ? err.message.slice(0, 120) : String(err) })
    }
  }

  async function handleRefund(index: number, amount: number, title: string) {
    try {
      const hash = await refundMilestone(index)
      toast.success(`Refunded $${usdc(amount, 2)} USDC`, { description: title })
      if (hash) toast.info("View on explorer", { action: { label: "Open", onClick: () => window.open(explorerTx(hash), "_blank") } })
      refetch()
    } catch (err) {
      toast.error("Transaction failed", { description: err instanceof Error ? err.message.slice(0, 120) : String(err) })
    }
  }

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

      <section className="glass-strong rounded-2xl p-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <Figure label="Total escrowed" value={`$${usdc(deal.total, 0)}`} />
          <Figure label="Released" value={`$${usdc(deal.released, 0)}`} />
          <Figure label="Still locked" value={`$${usdc(locked, 0)}`} />
        </div>
        {deal.yieldEarned !== undefined && deal.yieldEarned > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Pending yield: ${usdc(deal.yieldEarned, 4)} USDC
          </p>
        )}
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-foreground transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="tabular mt-3 text-xs text-muted-foreground">{pct}% released</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="glass rounded-2xl p-6">
          <h2 className="font-medium">Milestones</h2>
          {deal.milestones.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading milestones…</p>
          ) : (
            <ol className="mt-5">
              {deal.milestones.map((m, i) => {
                const last = i === deal.milestones.length - 1
                const done = m.status === "released" || m.status === "refunded"
                const canRelease =
                  (isPayer && m.rule === "approval" && m.status === "submitted") ||
                  (m.rule === "schedule" && m.status !== "released" && m.status !== "refunded" && !!m.dueAt && new Date(m.dueAt) <= new Date())
                const canDeliver = isPayee && m.rule === "approval" && m.status === "pending"
                const canRefund =
                  !done &&
                  (
                    (isPayee && (m.status === "pending" || m.status === "submitted")) ||
                    (isPayer && m.status === "pending")
                  )

                return (
                  <li key={m.id} className="relative flex gap-4 pb-7 last:pb-0">
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
                        done
                          ? "border-foreground bg-foreground text-background"
                          : "glass text-muted-foreground",
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
                            {m.dueAt ? ` · due ${shortDate(m.dueAt)}` : ""}
                            {m.releasedAt ? ` · released ${shortDate(m.releasedAt)}` : ""}
                          </p>
                        </div>
                        <span className="tabular font-medium">${usdc(m.amount, 0)}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={m.status} />
                        {canDeliver && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={anyPending}
                            onClick={() => void handleDeliver(i, m.title)}
                          >
                            {pendingDeliver ? "Confirming…" : "Mark delivered"}
                          </Button>
                        )}
                        {canRelease && (
                          <Button
                            size="sm"
                            disabled={anyPending}
                            onClick={() => void handleRelease(i, m.amount, m.title)}
                          >
                            {pendingRelease ? "Confirming…" : `Release $${usdc(m.amount, 0)}`}
                          </Button>
                        )}
                        {canRefund && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={anyPending}
                            onClick={() => void handleRefund(i, m.amount, m.title)}
                          >
                            {pendingRefund ? "Confirming…" : "Refund"}
                          </Button>
                        )}
                        {m.txHash && (
                          <a
                            href={explorerTx(m.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {shortAddress(m.txHash)}
                            <Icon icon={ArrowUpRight01Icon} size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <div className="glass h-fit rounded-2xl p-6">
          <h2 className="font-medium">Payout split</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every release is divided automatically.
          </p>
          <ul className="mt-5 space-y-4">
            {deal.splits.map((s) => (
              <li key={s.address}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="truncate">{s.recipient !== s.address ? s.recipient : shortAddress(s.address)}</span>
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
      </section>
    </>
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
