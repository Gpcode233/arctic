"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  Alert02Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"

import { Icon } from "@/components/arctic/icon"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "dark" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <Icon icon={CheckmarkCircle02Icon} />
        ),
        info: (
          <Icon icon={InformationCircleIcon} />
        ),
        warning: (
          <Icon icon={Alert02Icon} />
        ),
        error: (
          <Icon icon={CancelCircleIcon} />
        ),
        loading: (
          <Icon icon={Loading03Icon} className="animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
