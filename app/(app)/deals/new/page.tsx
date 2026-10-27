"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Cancel01Icon,
  Loading03Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Icon } from "@/components/arctic/icon"
import { PageHeader } from "@/components/arctic/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCreateDeal } from "@/lib/deals-store"
import { explorerTx, usdc } from "@/lib/format"
import { isAddress, protocolFeeBps } from "@/lib/config"
import { isEmail, saveShare, type ShareRecipient } from "@/lib/share"
import {
  buildVesting,
  frequencyAllowed,
  releaseCount,
  type VestingDuration,
  type VestingFrequency,
} from "@/lib/vesting"
import { YIELD_ENABLED } from "@/lib/arc"
import type { ReleaseRule } from "@/lib/types"
import { cn } from "@/lib/utils"

type MilestoneDraft = { title: string; amount: string; rule: ReleaseRule; dueAt: string }
type SplitDraft = { recipient: string; email: string; address: string; pct: string }

const rules: { value: ReleaseRule; label: string; hint: string }[] = [
  { value: "approval", label: "Approval", hint: "Payer releases" },
  { value: "schedule", label: "Schedule", hint: "Releases on a date" },
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

// Scheduled releases must be in the future; the contract reverts InvalidReleaseTime otherwise.
const scheduleOk = (dueAt: string) => !!dueAt && new Date(dueAt).getTime() > Date.now() + 60_000

const label = "text-xs font-medium text-muted-foreground"

export default function NewDealPage() {
  const router = useRouter()
  const { createDeal, isPending, step } = useCreateDeal()

  const [title, setTitle] = React.useState("")
  const [payeeName, setPayeeName] = React.useState("")
  const [payeeEmail, setPayeeEmail] = React.useState("")
  const [payeeAddress, setPayeeAddress] = React.useState("")
  const [milestones, setMilestones] = React.useState<MilestoneDraft[]>([
    { title: "", amount: "", rule: "approval", dueAt: "" },
  ])
  const [splits, setSplits] = React.useState<SplitDraft[]>([])
  const [vestTotal, setVestTotal] = React.useState("")
  const [vestMonths, setVestMonths] = React.useState<VestingDuration>(12)
  const [vestFreq, setVestFreq] = React.useState<VestingFrequency>("monthly")
  const [earnYield, setEarnYield] = React.useState(false)

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
    milestones.every((m) => m.rule !== "schedule" || scheduleOk(m.dueAt)) &&
    splitOk &&
    emailsOk

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
    setMilestones(rows.map((r) => ({ ...r, rule: "schedule" as const })))
    toast.success("Vesting schedule applied", {
      description: `${rows.length} releases over ${vestMonths} months. Edit anything below.`,
    })
  }

  function updateMilestone(i: number, patch: Partial<MilestoneDraft>) {
    setMilestones((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }

  function updateSplit(i: number, patch: Partial<SplitDraft>) {
    setSplits((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return

    const address = payeeAddress.trim()
    try {
      const { dealId, txHash } = await createDeal({
        title: title.trim(),
        payee: { name: payeeName.trim() || undefined, address },
        milestones: milestones.map((m) => ({
          title: m.title.trim(),
          amount: Number(m.amount),
          rule: m.rule,
          dueAt: m.rule === "schedule" && m.dueAt ? new Date(m.dueAt).toISOString() : undefined,
        })),
        splits:
          splits.length > 0
            ? splits.map((s) => ({
                recipient: s.recipient.trim() || s.address.trim(),
                address: s.address.trim(),
                bps: Math.round(Number(s.pct) * 100),
              }))
            : [],
        earnYield: earnYield && YIELD_ENABLED,
      })

      toast.success("Deal created", {
        description: `$${usdc(total, 2)} USDC locked onchain`,
        action: { label: "View on explorer", onClick: () => window.open(explorerTx(txHash), "_blank") },
      })
      const recipients: ShareRecipient[] = [
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
      router.push(`/deals/${String(dealId)}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error("Transaction failed", { description: msg.slice(0, 120) })
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
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
            <p className="text-xs text-muted-foreground">
              Emails stay in this browser. After funding you get a ready-to-send email link.
            </p>
          </section>

          <section className="glass space-y-4 rounded-2xl p-6">
            <div>
              <h2 className="font-medium">Vesting template</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Optional. Fill equal scheduled releases for team vesting or retainers.
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
                onClick={() =>
                  setMilestones((prev) => [
                    ...prev,
                    { title: "", amount: "", rule: "approval", dueAt: "" },
                  ])
                }
                disabled={milestones.length >= 20}
              >
                <Icon icon={PlusSignIcon} size={14} /> Add
              </Button>
            </div>

            {milestones.map((m, i) => (
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
                  {m.rule === "schedule" && (
                    <Input
                      type="datetime-local"
                      value={m.dueAt}
                      onChange={(e) => updateMilestone(i, { dueAt: e.target.value })}
                      aria-invalid={!!m.dueAt && !scheduleOk(m.dueAt)}
                      className="h-8 w-52"
                    />
                  )}
                </div>
              </div>
            ))}
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
            <Row label="Escrow total" value={`$${usdc(total, 2)}`} />
            <Row label={`Protocol fee (${protocolFeeBps / 100}%)`} value={`$${usdc(fee, 2)}`} />
          </dl>
          {YIELD_ENABLED && (
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm">
              <div>
                <p className="font-medium">Earn yield</p>
                <p className="text-xs text-muted-foreground">Auto-deposit into vault</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={earnYield}
                onClick={() => setEarnYield((v) => !v)}
                className={cn(
                  "relative h-5 w-9 cursor-pointer rounded-full transition-colors",
                  earnYield ? "bg-foreground" : "bg-foreground/20",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 size-4 rounded-full bg-background transition-transform",
                    earnYield ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          )}
          <div className="border-t border-border pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">You deposit</span>
              <span className="tabular text-2xl font-semibold tracking-tight">${usdc(total, 2)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">USDC · settled on Arc</p>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={!valid || isPending}>
            <FundLabel step={step} isPending={isPending} />
          </Button>
        </aside>
      </div>
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
