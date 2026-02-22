"use client"

import { useState, useEffect } from "react"
import { Cookie, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const COOKIE_CONSENT_KEY = "midas-cookie-consent"

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      const consent = localStorage.getItem(COOKIE_CONSENT_KEY)
      if (!consent) setIsVisible(true)
    }, 1200)

    return () => clearTimeout(timer)
  }, [])

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted")
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <div
      role="dialog"
      aria-label="Consentimiento de cookies"
      className={cn(
        "fixed bottom-4 left-4 right-4 z-50",
        "mx-auto max-w-lg",
        "bg-white/80 backdrop-blur-2xl",
        "border border-white/60",
        "rounded-2xl",
        "shadow-[0_12px_32px_rgba(0,0,0,0.08)]",
        "p-4 sm:p-5",
        "animate-slide-up"
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-transparent rounded-2xl pointer-events-none" />

      <button
        onClick={handleAccept}
        className="absolute top-3 right-3 z-20 text-muted-foreground/50 hover:text-foreground transition-colors"
        aria-label="Cerrar"
      >
        <X size={16} />
      </button>

      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex-shrink-0 size-10 rounded-xl bg-gold/10 flex items-center justify-center border border-gold/20">
          <Cookie size={20} className="text-gold" />
        </div>

        <p className="text-sm text-foreground/80 leading-relaxed flex-1 pr-4 sm:pr-0">
          Usamos cookies para mantener tu sesión activa y mejorar tu experiencia en MIDAS.
          Al continuar navegando, aceptas su uso.
        </p>

        <Button
          onClick={handleAccept}
          size="sm"
          className="flex-shrink-0 bg-gold hover:bg-gold-hover text-white font-semibold rounded-xl shadow-sm px-6"
        >
          Aceptar
        </Button>
      </div>
    </div>
  )
}
