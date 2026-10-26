"use client"

import Link from "next/link"
import { BankIcon, PlusSignIcon } from "@hugeicons/core-free-icons"

import { DealCard } from "@/components/arctic/deal-card"
import { EmptyState } from "@/components/arctic/empty-state"
import { Icon } from "@/components/arctic/icon"
import { PageHeader } from "@/components/arctic/page-header"
import { Button } from "@/components/ui/button"
import { useDeals } from "@/lib/deals-store"

export default function DealsPage() {
  const { deals } = useDeals()

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
        title="Deals"
        description="Escrows, schedules and vesting you have created."
        actions={newDeal}
      />
      {deals.length === 0 ? (
        <EmptyState
          icon={BankIcon}
          title="No deals yet"
          description="Create an escrow to lock USDC against milestones and pay out automatically."
          action={newDeal}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </>
  )
}
