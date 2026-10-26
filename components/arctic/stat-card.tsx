import type { IconSvgElement } from "@hugeicons/react"

import { Icon } from "@/components/arctic/icon"
import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon: IconSvgElement
  className?: string
}) {
  return (
    <div className={cn("glass rounded-2xl p-5", className)}>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        <span className="flex size-8 items-center justify-center rounded-lg bg-foreground/5">
          <Icon icon={icon} size={16} />
        </span>
      </div>
      <div className="tabular mt-4 text-3xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  )
}
