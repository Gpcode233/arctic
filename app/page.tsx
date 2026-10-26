import Link from "next/link"
import type { IconSvgElement } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Coins01Icon,
  LockIcon,
  Shield01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"

import { Icon } from "@/components/arctic/icon"
import { Wordmark } from "@/components/arctic/logo"
import { Button } from "@/components/ui/button"

const features: { icon: IconSvgElement; title: string; body: string }[] = [
  {
    icon: LockIcon,
    title: "Escrow that releases itself",
    body: "Lock USDC against milestones, dates or approvals. Funds move only when the rule is met.",
  },
  {
    icon: UserGroupIcon,
    title: "Splits and shared treasuries",
    body: "Divide every payout across a team or DAO by percentage. No spreadsheets, no manual transfers.",
  },
  {
    icon: Calendar03Icon,
    title: "Scheduled payouts and vesting",
    body: "Release on a date instead of an approval. Payroll and vesting run themselves.",
  },
  {
    icon: Shield01Icon,
    title: "Verifiable on-chain",
    body: "Every deposit and release is a USDC transaction on Arc that anyone can check on the explorer.",
  },
]

const flow: { icon: IconSvgElement; title: string; body: string }[] = [
  { icon: Coins01Icon, title: "Deposit", body: "USDC goes into escrow" },
  { icon: LockIcon, title: "Lock", body: "Held until a rule is met" },
  { icon: CheckmarkCircle02Icon, title: "Release", body: "Approval or date triggers it" },
  { icon: UserGroupIcon, title: "Split", body: "Divided across recipients" },
]

const steps = [
  { n: "01", title: "Define the deal", body: "Set the payee, milestones and who approves each release." },
  { n: "02", title: "Fund the escrow", body: "Deposit USDC once. It stays locked in the contract on Arc." },
  { n: "03", title: "Release and split", body: "Each milestone pays out and divides across recipients automatically." },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-svh overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[640px]" />
      <div className="bg-glow pointer-events-none absolute inset-x-0 top-0 h-[520px]" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark className="text-lg" />
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          <a href="https://docs.arc.io" className="transition-colors hover:text-foreground">Arc docs</a>
        </nav>
        <Button asChild size="sm">
          <Link href="/dashboard">Launch app</Link>
        </Button>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-4xl px-6 pt-20 pb-24 text-center md:pt-28">
          <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 animate-[pulse-dot_1.6s_ease-in-out_infinite] rounded-full bg-foreground" />
            Built on Arc · settled in USDC
          </span>
          <h1 className="text-gradient mt-8 text-5xl leading-[1.05] font-semibold tracking-tight md:text-7xl">
            Programmable USDC escrow on Arc.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Lock USDC, set the rules, split the payout. Arctic releases funds
            when your conditions are met.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/deals/new">
                Create a deal <Icon icon={ArrowRight01Icon} size={16} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard">View demo</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-28">
          <div className="glass-strong grid animate-[float-slow_8s_ease-in-out_infinite] gap-px overflow-hidden rounded-3xl p-1.5 md:grid-cols-4">
            {flow.map((step, i) => (
              <div
                key={step.title}
                className="flex flex-col gap-4 rounded-[1.25rem] bg-background/40 p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="glass flex size-9 items-center justify-center rounded-lg">
                    <Icon icon={step.icon} size={17} />
                  </span>
                  <span className="tabular text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                <div>
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-8 px-6 pb-28">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Money that follows rules.
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className="glass rounded-2xl p-7">
                <span className="glass-strong flex size-10 items-center justify-center rounded-xl">
                  <Icon icon={f.icon} size={18} />
                </span>
                <h3 className="mt-5 text-lg font-medium">{f.title}</h3>
                <p className="mt-2 text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-6 pb-28">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">How it works</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="glass rounded-2xl p-7">
                <span className="tabular text-sm text-muted-foreground">{s.n}</span>
                <h3 className="mt-4 text-lg font-medium">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-28">
          <div className="glass-strong rounded-3xl p-10 text-center md:p-14">
            <h2 className="text-gradient text-3xl font-semibold tracking-tight md:text-4xl">
              Put your first escrow on Arc.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              A flat 0.5% on each release. Nothing to pay until money moves.
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link href="/deals/new">
                Get started <Icon icon={ArrowRight01Icon} size={16} />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <Wordmark className="text-sm" />
          <p>Built on Arc with Arc Studio. Contracts are unaudited — use small amounts.</p>
        </div>
      </footer>
    </div>
  )
}
