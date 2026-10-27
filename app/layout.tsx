import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { Providers } from "@/app/providers"
import { ArcStudioBadge } from "@/components/arc-studio-badge"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Arctic — programmable USDC escrow",
  description:
    "Escrow, vesting and split payouts. Built on Arc, settled in USDC.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <Providers>
          <ThemeProvider
            defaultTheme="dark"
            forcedTheme="dark"
            enableSystem={false}
          >
            <TooltipProvider>
              {children}
              <ArcStudioBadge />
            </TooltipProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  )
}
