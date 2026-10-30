import { cn } from "@/lib/utils"
import type { DealStatus, MilestoneStatus } from "@/lib/types"

const labels: Record<DealStatus | MilestoneStatus, string> = {
  funded: "Funded",
  in_progress: "In progress",
  completed: "Completed",
  pending: "Pending",
  submitted: "Awaiting release",
  released: "Released",
  refunded: "Refunded",
  disputed: "Disputed",
}

const tones: Record<DealStatus | MilestoneStatus, string> = {
  funded: "text-foreground",
  in_progress: "text-foreground",
  completed: "text-foreground",
  pending: "text-muted-foreground",
  submitted: "text-foreground",
  released: "text-foreground",
  refunded: "text-muted-foreground",
  disputed: "text-destructive",
}

export function StatusBadge({
  status,
  className,
}: {
  status: DealStatus | MilestoneStatus
  className?: string
}) {
  const live = status === "in_progress" || status === "submitted"
  return (
    <span
      className={cn(
        "glass inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        tones[status],
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          live && "animate-[pulse-dot_1.6s_ease-in-out_infinite]",
          !live && status !== "completed" && status !== "released" && "opacity-40",
        )}
      />
      {labels[status]}
    </span>
  )
}
