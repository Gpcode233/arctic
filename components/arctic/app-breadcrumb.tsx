"use client"

import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useDeals } from "@/lib/deals-store"

const titles: Record<string, string> = {
  dashboard: "Dashboard",
  deals: "Deals",
  new: "New deal",
}

export function AppBreadcrumb() {
  const pathname = usePathname()
  const { deals } = useDeals()
  const parts = pathname.split("/").filter(Boolean)

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="/dashboard">Arctic</BreadcrumbLink>
        </BreadcrumbItem>
        {parts.map((part, i) => {
          const href = `/${parts.slice(0, i + 1).join("/")}`
          const label = titles[part] ?? deals.find((d) => d.id === part)?.title ?? part
          const last = i === parts.length - 1
          return (
            <span key={href} className="contents">
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                {last ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={href}>{label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
