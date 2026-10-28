"use client"

import * as React from "react"
import { Notification03Icon } from "@hugeicons/core-free-icons"
import { Icon } from "@/components/arctic/icon"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useNotifications } from "@/lib/notifications-store"
import { cn } from "@/lib/utils"

const KIND_LABELS: Record<string, string> = {
  milestone_delivered: "Milestone delivered",
  milestone_released: "Milestone released",
  milestone_refunded: "Milestone refunded",
  deal_created: "Deal created",
  deal_completed: "Deal completed",
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useNotifications()
  const [open, setOpen] = React.useState(false)

  function handleOpen(next: boolean) {
    setOpen(next)
    if (next && unreadCount > 0) {
      // Mark all read when opened
      setTimeout(markAllRead, 1500)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications">
          <Icon icon={Notification03Icon} size={16} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.slice(0, 20).map((n) => (
              <div
                key={n.id}
                className={cn(
                  "flex flex-col gap-0.5 px-4 py-3 text-sm border-b last:border-0 transition-colors",
                  !n.read && "bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {KIND_LABELS[n.kind] ?? n.kind}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {timeAgo(n.createdAt)}
                  </span>
                </div>
                <span className="truncate text-muted-foreground text-xs">
                  {n.milestoneTitle ? `${n.dealTitle} — ${n.milestoneTitle}` : n.dealTitle}
                </span>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
