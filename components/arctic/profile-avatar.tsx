import { cn } from "@/lib/utils"

interface ProfileAvatarProps {
  displayName: string
  avatarColor: string
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
}

function initials(name: string): string {
  // If it looks like a truncated address (0x…abcd) use the last 2 chars
  if (name.startsWith("0x") || name.includes("…")) {
    return name.slice(-2).toUpperCase()
  }
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
}

export function ProfileAvatar({
  displayName,
  avatarColor,
  size = "md",
  className,
}: ProfileAvatarProps) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-semibold text-white",
        avatarColor,
        sizeClasses[size],
        className,
      )}
      aria-label={displayName}
    >
      {initials(displayName)}
    </span>
  )
}
