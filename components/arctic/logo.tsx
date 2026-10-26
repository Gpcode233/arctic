import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-5", className)}
      aria-hidden
    >
      <path
        d="M16 3 4 27h6.2L16 14.8 21.8 27H28L16 3Z"
        fill="currentColor"
      />
      <path d="M11 27h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-medium tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
        <LogoMark className="size-4" />
      </span>
      Arctic
    </span>
  )
}
