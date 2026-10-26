"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useDeals } from "@/lib/deals-store"
import { usdc } from "@/lib/format"

export function NavProjects() {
  const { deals } = useDeals()
  const pathname = usePathname()

  if (deals.length === 0) return null

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recent deals</SidebarGroupLabel>
      <SidebarMenu>
        {deals.slice(0, 4).map((deal) => (
          <SidebarMenuItem key={deal.id}>
            <SidebarMenuButton
              asChild
              isActive={pathname === `/deals/${deal.id}`}
              className="pr-16"
            >
              <Link href={`/deals/${deal.id}`}>
                <span className="truncate">{deal.title}</span>
              </Link>
            </SidebarMenuButton>
            <SidebarMenuBadge className="tabular text-muted-foreground">${usdc(deal.total, 0)}</SidebarMenuBadge>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
