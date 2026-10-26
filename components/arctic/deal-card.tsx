import Link from "next/link"
import { ArrowRight01Icon, UserIcon } from "@hugeicons/core-free-icons"

import { Icon } from "@/components/arctic/icon"
import { StatusBadge } from "@/components/arctic/status-badge"
import { shortDate, usdc } from "@/lib/format"
import type { Deal } from "@/lib/types"

export function DealCard({ deal }: { deal: Deal }) {
  const pct = Math.round((deal.released / deal.total) * 100)
  const released = deal.milestones.filter((m) => m.status === "released").length

  return (
    <Link
      href={`/deals/${deal.id}`}
      className="glass group flex flex-col gap-5 rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:border-foreground/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{deal.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon icon={UserIcon} size={13} className="shrink-0" />
            <span className="truncate">{deal.payee.name}</span>
          </p>
        </div>
        <StatusBadge status={deal.status} />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="tabular text-2xl font-semibold tracking-tight">
            ${usdc(deal.total, 0)}
          </span>
          <span className="text-xs text-muted-foreground">
            {released}/{deal.milestones.length} milestones
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-foreground transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Created {shortDate(deal.createdAt)}</span>
        <span className="flex items-center gap-1 text-foreground/70 transition-colors group-hover:text-foreground">
          Open <Icon icon={ArrowRight01Icon} size={13} />
        </span>
      </div>
    </Link>
  )
}
