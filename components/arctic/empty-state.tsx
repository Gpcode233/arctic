import type { IconSvgElement } from "@hugeicons/react"

import { Icon } from "@/components/arctic/icon"

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconSvgElement
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="glass flex flex-col items-center rounded-2xl px-6 py-16 text-center">
      <span className="glass-strong flex size-12 items-center justify-center rounded-xl">
        <Icon icon={icon} size={20} />
      </span>
      <h2 className="mt-5 font-medium">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
