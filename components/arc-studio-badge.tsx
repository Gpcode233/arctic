/**
 * "Made in Arc Studio" overlay badge.
 * Pinned to the bottom-right corner of the viewport.
 */
export function ArcStudioBadge() {
  return (
    <a
      href="https://studio.arc.io"
      target="_blank"
      rel="noreferrer"
      className="fixed right-4 bottom-4 z-50 flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-foreground/20 hover:text-foreground"
      aria-label="Made in Arc Studio"
    >
      <span className="flex size-3.5 items-center justify-center rounded-sm bg-foreground text-[8px] font-bold text-background leading-none">
        A
      </span>
      Made in Arc Studio
    </a>
  )
}
