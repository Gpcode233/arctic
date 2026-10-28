import { AppBreadcrumb } from "@/components/arctic/app-breadcrumb"
import { NotificationBell } from "@/components/arctic/notification-bell"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="relative overflow-hidden">
          <div className="bg-glow pointer-events-none absolute inset-x-0 top-0 h-80" />
          <header className="relative flex h-16 shrink-0 items-center gap-2">
            <div className="flex flex-1 items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-vertical:h-4 data-vertical:self-auto"
              />
              <AppBreadcrumb />
            </div>
            <div className="flex items-center gap-2 pr-4">
              <NotificationBell />
            </div>
          </header>
          <main className="relative flex flex-1 flex-col gap-6 p-4 pt-0 md:p-6 md:pt-0">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </>
  )
}
