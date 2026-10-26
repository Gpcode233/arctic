"use client"

import { Wallet01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Icon } from "@/components/arctic/icon"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavUser() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          onClick={() => toast("Wallet connection arrives with the contract wiring")}
        >
          <span className="glass flex size-8 shrink-0 items-center justify-center rounded-lg">
            <Icon icon={Wallet01Icon} size={16} />
          </span>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">Connect wallet</span>
            <span className="truncate text-xs text-muted-foreground">Arc mainnet</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
