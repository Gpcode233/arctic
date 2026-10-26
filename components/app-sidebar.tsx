"use client"

import * as React from "react"
import Link from "next/link"
import {
  BankIcon,
  Book02Icon,
  DashboardSquare01Icon,
  HelpCircleIcon,
  PlusSignIcon,
  SentIcon,
} from "@hugeicons/core-free-icons"

import { Icon } from "@/components/arctic/icon"
import { Wordmark } from "@/components/arctic/logo"
import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const navMain = [
  { title: "Dashboard", url: "/dashboard", icon: <Icon icon={DashboardSquare01Icon} /> },
  { title: "Deals", url: "/deals", icon: <Icon icon={BankIcon} /> },
]

const navSecondary = [
  { title: "Docs", url: "https://docs.arc.io", icon: <Icon icon={Book02Icon} /> },
  { title: "Support", url: "#", icon: <Icon icon={HelpCircleIcon} /> },
  { title: "Feedback", url: "#", icon: <Icon icon={SentIcon} /> },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <Wordmark className="text-base" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="New deal"
              className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground"
            >
              <Link href="/deals/new">
                <Icon icon={PlusSignIcon} />
                <span>New deal</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavProjects />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
