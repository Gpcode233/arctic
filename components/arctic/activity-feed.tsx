import Link from "next/link"
import type { IconSvgElement } from "@hugeicons/react"
import {
  ArrowUpRight01Icon,
  CheckmarkCircle02Icon,
  PlusSignIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"

import { Icon } from "@/components/arctic/icon"
import { EXPLORER_URL, shortDateTime, usdc } from "@/lib/format"
import type { ActivityEvent } from "@/lib/types"

const icons: Record<ActivityEvent["kind"], IconSvgElement> = {
  released: CheckmarkCircle02Icon,
  created: PlusSignIcon,
  split: UserGroupIcon,
}

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <ul className="relative space-y-1">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href={`/deals/${event.dealId}`}
            className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-foreground/5"
          >
            <span className="glass mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
              <Icon icon={icons[event.kind]} size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{event.label}</span>
              <span className="text-xs text-muted-foreground">
                {shortDateTime(event.at)} UTC
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              {event.amount ? (
                <span className="tabular text-sm font-medium">
                  ${usdc(event.amount, 0)}
                </span>
              ) : null}
              {event.txHash ? (
                <span
                  className="flex items-center gap-0.5 text-xs text-muted-foreground"
                  title={`${EXPLORER_URL}/tx/${event.txHash}`}
                >
                  tx
                  <Icon icon={ArrowUpRight01Icon} size={11} />
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
