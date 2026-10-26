import { HugeiconsIcon } from "@hugeicons/react"
import type { ComponentProps } from "react"

type IconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "size"> & {
  size?: number
}

export function Icon({ size = 16, strokeWidth = 1.6, ...props }: IconProps) {
  return <HugeiconsIcon size={size} strokeWidth={strokeWidth} {...props} />
}
