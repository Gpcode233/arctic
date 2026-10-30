"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  Mail01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useAccount } from "wagmi"

import { Icon } from "@/components/arctic/icon"
import { PageHeader } from "@/components/arctic/page-header"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useCreateDeal } from "@/lib/deals-store"
import { explorerTx, usdc } from "@/lib/format"
import { isAddress, protocolFeeBps } from "@/lib/config"
import { isEmail, mailtoFor, saveShare, type ShareRecipient } from "@/lib/share"
import {
  buildVesting,
  frequencyAllowed,
  releaseCount,
  toLocalInput,
  type VestingDuration,
  type VestingFrequency,
} from "@/lib/vesting"
import { CHAIN_ID } from "@/lib/arc"
import type { ReleaseRule } from "@/lib/types"
import { cn } from "@/lib/utils"

type MilestoneDraft = { title: string; amount: string; rule: ReleaseRule; dueAt: string; deliverBy: string }
type SplitDraft = { recipient: string; email: string; address: string; pct: string }
type ArbiterDraft = { name: string; email: string; address: string }

const rules: { value: ReleaseRule; label: string; hint: string }[] = [
  { value: "approval", label: "Approval", hint: "Payee delivers, payer reviews" },
  { value: "schedule", label: "Schedule", hint: "Releases on a date" },
]

const HOUR = 3600
const DAY = 24 * HOUR
const reviewOptions: { seconds: number; label: string }[] = [
  ...(CHAIN_ID !== 5042 ? [{ seconds: HOUR, label: "1 hour" }] : []),
  { seconds: DAY, label: "1 day" },
  { seconds: 3 * DAY, label: "3 days" },
  { seconds: 7 * DAY, label: "7 days" },
  { seconds: 14 * DAY, label: "14 days" },
]

const walletPrompt: Partial<Record<string, string>> = {
  approve: "Approve USDC (no funds move)…",
  create: "Confirm deal in wallet…",
}

const waitingJokes = [
  "Confirming your deal…",
  "Counting very carefully…",
  "Tucking USDC away…",
  "Polishing the contract…",
  "Asking validators nicely…",
  "Almost there, promise…",
]

function useRotatingText(lines: string[], active: boolean, ms = 4500) {
  const [i, setI] = React.useState(0)
  React.useEffect(() => {
    if (!active) return
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), ms)
    return () => {
      clearInterval(t)
      setI(0)
    }
  }, [active, lines.length, ms])
  return lines[i]
}

function FundLabel({ step, isPending }: { step: string; isPending: boolean }) {
  const waiting = step === "approving" || step === "confirming"
  const joke = useRotatingText(waitingJokes, waiting)
  if (!isPending) return <>Fund escrow</>
  const text = waiting ? joke : (walletPrompt[step] ?? "Working…")
  return (
    <span className="flex items-center gap-2">
      <Icon icon={Loading03Icon} className="animate-spin" />
      <span key={text} className="animate-in fade-in duration-300">{text}</span>
    </span>
  )
}

// Onchain dates must be at least 5 minutes in the future to survive wallet confirmation lag.
const DATE_BUFFER_MS = 5 * 60 * 1_000
const dateOk = (value: string) => !!value && new Date(value).getTime() > Date.now() + DATE_BUFFER_MS
const defaultDeliverBy = () => toLocalInput(new Date(Date.now() + 30 * DAY * 1000))
const emptyMilestone = (): MilestoneDraft => ({
  title: "", amount: "", rule: "approval", dueAt: "", deliverBy: defaultDeliverBy(),
})

const label = "text-xs font-medium text-muted-foreground"

export default function NewDealPage() {
  const router = useRouter()
  const { address: connected } = useAccount()
  const { createDeal, isPending, step, txHash } = useCreateDeal()

  const [title, setTitle] = React.useState("")
  const [payeeName, setPayeeName] = React.useState("")
  const [payeeEmail, setPayeeEmail] = React.useState("")
  const [payeeAddress, setPayeeAddress] = React.useState("")
  const [milestones, setMilestones] = React.useState<MilestoneDraft[]>(() => [emptyMilestone()])
  const [splits, setSplits] = React.useState<SplitDraft[]>([])
  const [reviewPeriod, setReviewPeriod] = React.useState(7 * DAY)
  const [vestTotal, setVestTotal] = React.useState("")
  const [vestMonths, setVestMonths] = React.useState<VestingDuration>(12)
  const [vestFreq, setVestFreq] = React.useState<VestingFrequency>("monthly")

  const [arbiterOpen, setArbiterOpen] = React.useState(false)
  const [arbiter, setArbiter] = React.useState<ArbiterDraft>({ name: "", email: "", address: "" })
  const [created, setCreated] = React.useState<{ dealId: string; arbiter: ShareRecipient } | undefined>()

  const total = milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0)
  const fee = (total * protocolFeeBps) / 10_000
  const splitTotal = splits.reduce((sum, s) => sum + (Number(s.pct) || 0), 0)
  const splitOk =
    splits.length === 0 ||
    (splitTotal === 100 && splits.every((s) => isAddress(s.address.trim())))

  const emailsOk =
    (!payeeEmail.trim() || isEmail(payeeEmail.trim())) &&
    splits.every((s) => !s.email.trim() || isEmail(s.email.trim()))

  const valid =
    !isPending &&
    title.trim() &&
    isAddress(payeeAddress.trim()) &&
    total > 0 &&
    milestones.every((m) => m.title.trim() && Number(m.amount) > 0) &&
    milestones.every((m) => dateOk(m.rule === "schedule" ? m.dueAt : m.deliverBy)) &&
    splitOk &&
    emailsOk

  // The arbiter must be a third party: not the payer, payee or a split recipient.
  const arbiterAddr = arbiter.address.trim().toLowerCase()
  const arbiterConflict =
    isAddress(arbiterAddr) &&
    [connected ?? "", payeeAddress.trim()].some((a) => a.toLowerCase() === arbiterAddr)
  const arbiterSplitConflict =
    isAddress(arbiterAddr) && splits.some((s) => s.address.trim().toLowerCase() === arbiterAddr)
  const arbiterOk =
    !!arbiter.name.trim() &&
    isEmail(arbiter.email.trim()) &&
    isAddress(arbiterAddr) &&
    !arbiterConflict &&
    !arbiterSplitConflict

  const vestTotalNum = Number(vestTotal) || 0
  const vestCount = releaseCount(vestMonths, vestFreq)

  function chooseDuration(months: VestingDuration) {
    setVestMonths(months)
    // Monthly would exceed the contract's 20-milestone cap for 24/36 months
    if (!frequencyAllowed(months, vestFreq)) setVestFreq("quarterly")
  }

  function applyVesting() {
    if (vestTotalNum <= 0) return
    const rows = buildVesting(vestTotalNum, vestMonths, vestFreq, new Date())
    setMilestones(rows.map((r) => ({ ...r, rule: "schedule" as const, deliverBy: "" })))
    toast.success("Vesting schedule applied", {
      description: `${rows.length} releases over ${vestMonths} months. Edit anything below.`,
    })
  }

  function updateMilestone(i: number, patch: Partial<MilestoneDraft>) {
    setMilestones((prev) =>
      prev.map((m, idx) => {
        if (idx !== i) return m
        const next = { ...m, ...patch }
        // Switching a vesting row back to approval needs a delivery deadline
        if (next.rule === "approval" && !next.deliverBy) next.deliverBy = defaultDeliverBy()
        return next
      }),
    )
  }

  function updateSplit(i: number, patch: Partial<SplitDraft>) {
    setSplits((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  function openArbiter(e: React.FormEvent) {
    e.preventDefault()
    if (valid) setArbiterOpen(true)
  }

  async function fund() {
    if (!valid || !arbiterOk) return

    const address = payeeAddress.trim()
    const arb: ShareRecipient = {
      name: arbiter.name.trim(),
      email: arbiter.email.trim(),
      role: "Arbiter",
      address: arbiter.address.trim(),
    }
    try {
      const { dealId, txHash } = await createDeal({
        title: title.trim(),
        payee: { name: payeeName.trim() || undefined, address },
        arbiter: { name: arb.name, address: arb.address! },
        reviewPeriod,
        milestones: milestones.map((m) => ({
          title: m.title.trim(),
          amount: Number(m.amount),
          rule: m.rule,
          dueAt: m.rule === "schedule" ? new Date(m.dueAt).toISOString() : undefined,
          deliverBy: m.rule === "approval" ? new Date(m.deliverBy).toISOString() : undefined,
        })),
        splits:
          splits.length > 0
            ? splits.map((s) => ({
                recipient: s.recipient.trim() || s.address.trim(),
                address: s.address.trim(),
                bps: Math.round(Number(s.pct) * 100),
              }))
            : [],
      })

      toast.success("Deal created", {
        description: `$${usdc(total, 2)} USDC locked onchain`,
        action: { label: "View on explorer", onClick: () => window.open(explorerTx(txHash), "_blank") },
      })
      const recipients: ShareRecipient[] = [
        arb,
        ...(payeeEmail.trim()
          ? [{ name: payeeName.trim() || undefined, email: payeeEmail.trim(), role: "Payee" as const, address }]
          : []),
        ...splits
          .filter((s) => s.email.trim())
          .map((s) => ({
            name: s.recipient.trim() || undefined,
            email: s.email.trim(),
            role: "Split recipient" as const,
            address: s.address.trim(),
          })),
      ]
      saveShare(String(dealId), recipients)
      setCreated({ dealId: String(dealId), arbiter: arb })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error("Transaction failed", { description: msg.slice(0, 120) })
    }
  }

  function onArbiterOpenChange(open: boolean) {
    if (isPending) return // keep the dialog up while the wallet flow runs
    if (!open && created) {
      router.push(`/deals/${created.dealId}`)
      return
    }
    setArbiterOpen(open)
  }

  return (
    <form onSubmit={openArbiter} className="space-y-6">
      <PageHeader
        title="New deal"
        description="Lock USDC, set the release rules, split the payout."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="glass space-y-4 rounded-2xl p-6">
            <h2 className="font-medium">Basics</h2>
            <div className="space-y-1.5">
              <label className={label} htmlFor="title">Deal title</label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What is this deal for?"
                maxLength={80}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={label} htmlFor="payee">Payee name (optional)</label>
                <Input
                  id="payee"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="Recipient name"
                />
              </div>
              <div className="space-y-1.5">
                <label className={label} htmlFor="payee-email">Payee email (optional)</label>
                <Input
                  id="payee-email"
                  type="email"
                  value={payeeEmail}
                  onChange={(e) => setPayeeEmail(e.target.value)}
                  placeholder="name@example.com"
                  aria-invalid={!!payeeEmail.trim() && !isEmail(payeeEmail.trim())}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={label} htmlFor="address">Payee wallet</label>
              <Input
                id="address"
                value={payeeAddress}
                onChange={(e) => setPayeeAddress(e.target.value)}
                placeholder="0x…"
              />
            </div>
            <div className="space-y-1.5">
              <span className={label}>Review period</span>
              <div className="flex flex-wrap gap-2">
                {reviewOptions.map((o) => (
                  <button
                    key={o.seconds}
                    type="button"
                    onClick={() => setReviewPeriod(o.seconds)}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                      reviewPeriod === o.seconds
                        ? "bg-foreground text-background"
                        : "bg-foreground/5 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                After the payee marks a milestone delivered, you have this long to release or dispute it.
                If you do neither, the payee can claim it.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Emails stay in this browser. After funding you get ready-to-send email links.
            </p>
          </section>

          <section className="glass space-y-4 rounded-2xl p-6">
            <div>
              <h2 className="font-medium">Vesting template</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Optional. Fill equal scheduled releases for team vesting or retainers.
                Once the payee accepts, scheduled releases cannot be revoked.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className={label} htmlFor="vest-total">Total to vest</label>
                <div className="relative">
                  <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    id="vest-total"
                    value={vestTotal}
                    inputMode="decimal"
                    onChange={(e) => setVestTotal(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0"
                    className="tabular pl-6"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <span className={label}>Duration</span>
                <div className="flex gap-2">
                  {([12, 24, 36] as VestingDuration[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => chooseDuration(m)}
                      className={cn(
                        "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                        vestMonths === m
                          ? "bg-foreground text-background"
                          : "bg-foreground/5 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m} months
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className={label}>Release every</span>
                <div className="flex gap-2">
                  {(["monthly", "quarterly"] as VestingFrequency[]).map((f) => {
                    const ok = frequencyAllowed(vestMonths, f)
                    return (
                      <button
                        key={f}
                        type="button"
                        disabled={!ok}
                        title={ok ? undefined : "Over the 20-milestone limit per deal"}
                        onClick={() => setVestFreq(f)}
                        className={cn(
                          "rounded-md px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          vestFreq === f
                            ? "bg-foreground text-background"
                            : "bg-foreground/5 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {f === "monthly" ? "Month" : "Quarter"}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {vestTotalNum > 0
                  ? `${vestCount} releases of about $${usdc(vestTotalNum / vestCount, 2)}, first one in ${vestFreq === "monthly" ? "1 month" : "3 months"}. Max 20 per deal.`
                  : "Enter a total to preview. Max 20 releases per deal."}
              </p>
              <Button type="button" size="sm" variant="outline" disabled={vestTotalNum <= 0} onClick={applyVesting}>
                Apply schedule
              </Button>
            </div>
          </section>

          <section className="glass space-y-4 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Milestones</h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setMilestones((prev) => [...prev, emptyMilestone()])}
                disabled={milestones.length >= 20}
              >
                <Icon icon={PlusSignIcon} size={14} /> Add
              </Button>
            </div>

            {milestones.map((m, i) => {
              const dateField = m.rule === "schedule" ? "dueAt" : "deliverBy"
              const dateValue = m[dateField]
              return (
                <div key={i} className="space-y-3 rounded-xl border border-border bg-foreground/2 p-4">
                  <div className="flex gap-3">
                    <Input
                      value={m.title}
                      onChange={(e) => updateMilestone(i, { title: e.target.value })}
                      placeholder={`Milestone ${i + 1}`}
                      maxLength={80}
                    />
                    <div className="relative w-36 shrink-0">
                      <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      <Input
                        value={m.amount}
                        inputMode="decimal"
                        onChange={(e) => updateMilestone(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })}
                        placeholder="0"
                        className="tabular pl-6"
                      />
                    </div>
                    {milestones.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remove milestone"
                        onClick={() => setMilestones((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        <Icon icon={Cancel01Icon} size={14} />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {rules.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        title={r.hint}
                        onClick={() => updateMilestone(i, { rule: r.value })}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs transition-colors",
                          m.rule === r.value
                            ? "bg-foreground text-background"
                            : "bg-foreground/5 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        {m.rule === "schedule" ? "Releases" : "Deliver by"}
                        <Input
                          type="datetime-local"
                          value={dateValue}
                          onChange={(e) => updateMilestone(i, { [dateField]: e.target.value })}
                          aria-invalid={!!dateValue && !dateOk(dateValue)}
                          className="h-8 w-52"
                        />
                      </label>
                      {dateValue && !dateOk(dateValue) && (
                        <p className="text-xs text-destructive">
                          Must be at least 5 min from now to confirm onchain
                        </p>
                      )}
                    </div>
                  </div>
                  {m.rule === "approval" && (
                    <p className="text-xs text-muted-foreground">
                      If nothing is delivered by this date, you can take this milestone back.
                    </p>
                  )}
                </div>
              )
            })}
          </section>

          <section className="glass space-y-4 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">Split payouts</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Optional. Divide every release between wallets.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setSplits((prev) => [...prev, { recipient: "", email: "", address: "", pct: "" }])
                }
                disabled={splits.length >= 10}
              >
                <Icon icon={PlusSignIcon} size={14} /> Add
              </Button>
            </div>

            {splits.map((s, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-border bg-foreground/2 p-4">
                <div className="flex gap-3">
                  <Input
                    value={s.recipient}
                    onChange={(e) => updateSplit(i, { recipient: e.target.value })}
                    placeholder="Name"
                  />
                  <Input
                    type="email"
                    value={s.email}
                    onChange={(e) => updateSplit(i, { email: e.target.value })}
                    placeholder="Email (optional)"
                    aria-invalid={!!s.email.trim() && !isEmail(s.email.trim())}
                  />
                </div>
                <div className="flex gap-3">
                  <Input
                    value={s.address}
                    onChange={(e) => updateSplit(i, { address: e.target.value })}
                    placeholder="0x…"
                  />
                  <div className="relative w-24 shrink-0">
                    <Input
                      value={s.pct}
                      inputMode="decimal"
                      onChange={(e) => updateSplit(i, { pct: e.target.value.replace(/[^0-9.]/g, "") })}
                      placeholder="0"
                      className="tabular pr-7"
                    />
                    <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove recipient"
                    onClick={() => setSplits((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Icon icon={Cancel01Icon} size={14} />
                  </Button>
                </div>
              </div>
            ))}

            {splits.length > 0 && (
              <p className={cn("text-xs", splitOk ? "text-muted-foreground" : "text-destructive")}>
                {splitTotal}% allocated{splitTotal === 100 ? "" : " — shares must add up to 100%"}
              </p>
            )}
          </section>
        </div>

        <aside className="glass-strong h-fit space-y-5 rounded-2xl p-6 xl:sticky xl:top-6">
          <h2 className="font-medium">Summary</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Milestones" value={String(milestones.length)} />
            <Row label="Review period" value={reviewOptions.find((o) => o.seconds === reviewPeriod)?.label ?? ""} />
            <Row label="Escrow total" value={`$${usdc(total, 2)}`} />
            <Row label={`Protocol fee (${protocolFeeBps / 100}%)`} value={`$${usdc(fee, 2)}`} />
          </dl>
          <div className="border-t border-border pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">You deposit</span>
              <span className="tabular text-2xl font-semibold tracking-tight">${usdc(total, 2)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">USDC · settled on Arc</p>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={!valid}>
            Continue
          </Button>
          <p className="text-xs text-muted-foreground">Next: choose a third-party arbiter.</p>
        </aside>
      </div>

      <Dialog open={arbiterOpen} onOpenChange={onArbiterOpenChange}>
        <DialogContent showCloseButton={!isPending}>
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Icon icon={CheckmarkCircle02Icon} size={18} /> Deal #{created.dealId} funded
                </DialogTitle>
                <DialogDescription>
                  Last step: let {created.arbiter.name} know they are the arbiter. The email opens in your
                  mail app with the deal link filled in.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => router.push(`/deals/${created.dealId}`)}>
                  Go to deal
                </Button>
                <Button asChild>
                  <a href={mailtoFor(created.arbiter, created.dealId, title.trim())}>
                    <Icon icon={Mail01Icon} size={14} /> Email the arbiter
                  </a>
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Choose an arbiter</DialogTitle>
                <DialogDescription>
                  A neutral third party who settles disputes. If you dispute a delivery, they decide
                  whether it goes to the payee or back to you. They never hold funds.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className={label} htmlFor="arbiter-name">Name</label>
                  <Input
                    id="arbiter-name"
                    value={arbiter.name}
                    onChange={(e) => setArbiter((a) => ({ ...a, name: e.target.value }))}
                    placeholder="Full name"
                    disabled={isPending}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={label} htmlFor="arbiter-email">Email</label>
                  <Input
                    id="arbiter-email"
                    type="email"
                    value={arbiter.email}
                    onChange={(e) => setArbiter((a) => ({ ...a, email: e.target.value }))}
                    placeholder="name@example.com"
                    disabled={isPending}
                    aria-invalid={!!arbiter.email.trim() && !isEmail(arbiter.email.trim())}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={label} htmlFor="arbiter-address">Wallet</label>
                  <Input
                    id="arbiter-address"
                    value={arbiter.address}
                    onChange={(e) => setArbiter((a) => ({ ...a, address: e.target.value }))}
                    placeholder="0x…"
                    disabled={isPending}
                    aria-invalid={
                      (!!arbiter.address.trim() && !isAddress(arbiter.address.trim())) ||
                      arbiterConflict ||
                      arbiterSplitConflict
                    }
                  />
                  {arbiterConflict && (
                    <p className="text-xs text-destructive">The arbiter can&apos;t be you or the payee.</p>
                  )}
                  {arbiterSplitConflict && (
                    <p className="text-xs text-destructive">The arbiter can&apos;t be a payout recipient.</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => setArbiterOpen(false)}
                >
                  Back
                </Button>
                <Button type="button" disabled={!arbiterOk || isPending} onClick={() => void fund()}>
                  <FundLabel step={step} isPending={isPending} />
                </Button>
              </DialogFooter>
              {txHash && isPending && (
                <a
                  href={explorerTx(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  View transaction
                </a>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </form>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  )
}
