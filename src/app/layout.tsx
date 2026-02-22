import type { Metadata } from "next"
import { Space_Grotesk, Sora } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import { CookieConsent } from "@/components/shared/cookie-consent"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "MIDAS · Casa Artemisa",
  description: "Sistema de gestión contable y de negocio para Casa Artemisa",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${sora.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider delayDuration={300}>
          {children}
        </TooltipProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            duration: 4000,
          }}
        />
        <CookieConsent />
      </body>
    </html>
  )
}
