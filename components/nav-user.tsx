"use client"

import Link from "next/link"
import { Copy01Icon, Logout01Icon, UserIcon, Wallet01Icon } from "@hugeicons/core-free-icons"
import { ConnectKitButton } from "connectkit"
import { toast } from "sonner"
import { useAccount, useDisconnect } from "wagmi"

import { ProfileAvatar } from "@/components/arctic/profile-avatar"
import { Icon } from "@/components/arctic/icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useProfile } from "@/lib/profile-store"

export function NavUser() {
  const { address, isConnected, chain } = useAccount()
  const { disconnect } = useDisconnect()
  const { profile } = useProfile()

  const networkLabel =
    chain?.id === 5042
      ? "Arc mainnet"
      : chain?.id === 5042002
        ? "Arc testnet"
        : "Select network"
  const wrongNetwork =
    isConnected && chain?.id !== 5042 && chain?.id !== 5042002

  if (!isConnected) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <SidebarMenuButton size="lg" onClick={show}>
                <span className="glass flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Icon icon={Wallet01Icon} size={16} />
                </span>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Connect wallet</span>
                  <span className="truncate text-xs text-muted-foreground">{networkLabel}</span>
                </div>
              </SidebarMenuButton>
            )}
          </ConnectKitButton.Custom>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  if (wrongNetwork) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <SidebarMenuButton size="lg" onClick={show}>
                <span className="glass flex size-8 shrink-0 items-center justify-center rounded-lg text-amber-400">
                  <Icon icon={Wallet01Icon} size={16} />
                </span>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium text-amber-400">Wrong network</span>
                  <span className="truncate text-xs text-muted-foreground">Switch to Arc</span>
                </div>
              </SidebarMenuButton>
            )}
          </ConnectKitButton.Custom>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              {profile ? (
                <ProfileAvatar
                  displayName={profile.displayName}
                  avatarColor={profile.avatarColor}
                  size="sm"
                />
              ) : (
                <span className="glass flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Icon icon={Wallet01Icon} size={16} />
                </span>
              )}
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {profile?.displayName ?? (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "")}
                </span>
                <span className="truncate text-xs text-muted-foreground">{networkLabel}</span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <Icon icon={UserIcon} size={14} className="mr-2" />
                Edit profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (address) {
                  navigator.clipboard?.writeText(address)
                  toast.success("Address copied")
                }
              }}
            >
              <Icon icon={Copy01Icon} size={14} className="mr-2" />
              Copy address
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => disconnect()}
              className="text-destructive focus:text-destructive"
            >
              <Icon icon={Logout01Icon} size={14} className="mr-2" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
