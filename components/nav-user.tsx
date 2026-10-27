"use client"

import { Copy01Icon, Logout01Icon, Wallet01Icon } from "@hugeicons/core-free-icons"
import { ConnectKitButton } from "connectkit"
import { toast } from "sonner"
import { useAccount, useDisconnect } from "wagmi"

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
import { CHAIN_ID } from "@/lib/arc"
import { shortAddress } from "@/lib/format"

const networkLabel = CHAIN_ID === 5042 ? "Arc mainnet" : "Arc testnet"

export function NavUser() {
  const { address, isConnected, chain } = useAccount()
  const { disconnect } = useDisconnect()

  const wrongNetwork = isConnected && chain?.id !== CHAIN_ID

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
              <span className="glass flex size-8 shrink-0 items-center justify-center rounded-lg">
                <Icon icon={Wallet01Icon} size={16} />
              </span>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{address ? shortAddress(address) : ""}</span>
                <span className="truncate text-xs text-muted-foreground">{networkLabel}</span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
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
