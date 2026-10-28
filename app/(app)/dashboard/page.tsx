"use client"

import Link from "next/link"
import {
  ArrowRight01Icon,
  BankIcon,
  CheckmarkCircle02Icon,
  Coins01Icon,
  LockIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"

import { ActivityFeed } from "@/components/arctic/activity-feed"
import { DealCard } from "@/components/arctic/deal-card"
import { EmptyState } from "@/components/arctic/empty-state"
import { Icon } from "@/components/arctic/icon"
import { PageHeader } from "@/components/arctic/page-header"
import { StatCard } from "@/components/arctic/stat-card"
import { Button } from "@/components/ui/button"
import { useDeals } from "@/lib/deals-store"
import { usdc } from "@/lib/format"
import { useProfile } from "@/lib/profile-store"

export default function DashboardPage() {
  const { deals, activity } = useDeals()
  const { profile } = useProfile()

  const greeting = profile
    ? `Welcome back, ${profile.displayName}`
    : "Dashboard"

  const volume = deals.reduce((sum, d) => sum + d.total, 0)
  const released = deals.reduce((sum, d) => sum + d.released, 0)
  const active = deals.filter((d) => d.status !== "completed")

  const newDeal = (
    <Button asChild>
      <Link href="/deals/new">
        <Icon icon={PlusSignIcon} />
        New deal
      </Link>
    </Button>
  )

  return (
    <>
      <PageHeader
        title={greeting}
        description="Everything locked and released across your escrows."
        actions={newDeal}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="USDC in escrow"
          icon={LockIcon}
          value={`$${usdc(volume - released, 2)}`}
          hint="Locked and waiting for release"
        />
        <StatCard
          label="Released"
          icon={CheckmarkCircle02Icon}
          value={`$${usdc(released, 2)}`}
          hint="Paid out to recipients"
        />
        <StatCard
          label="Total volume"
          icon={Coins01Icon}
          value={`$${usdc(volume, 2)}`}
          hint="Across all deals"
        />
        <StatCard
          label="Active deals"
          icon={BankIcon}
          value={String(active.length)}
          hint={`${deals.length} deals in total`}
        />
      </section>

      {deals.length === 0 ? (
        <EmptyState
          icon={BankIcon}
          title="No deals yet"
          description="Create your first escrow to lock USDC, set release rules and split the payout."
          action={newDeal}
        />
      ) : (
        <section className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Active deals</h2>
              <Link
                href="/deals"
                className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                View all <Icon icon={ArrowRight01Icon} size={14} />
              </Link>
            </div>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">All deals are completed.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {active.slice(0, 4).map((deal) => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </div>
            )}
          </div>

          <div className="glass rounded-2xl p-3">
            <h2 className="px-2.5 pt-2 pb-3 font-medium">Activity</h2>
            <ActivityFeed events={activity.slice(0, 7)} />
          </div>
        </section>
      )}
    </>
  )
}
