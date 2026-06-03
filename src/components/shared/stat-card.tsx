"use client"

import { useEffect, useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { formatCOP, formatNumber } from "@/lib/format"
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Package,
  Banknote,
  Building2,
  Users,
  ShoppingCart,
  Wallet,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from "lucide-react"

// Mapa de iconos disponibles para las stat cards
const ICON_MAP: Record<string, LucideIcon> = {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Package,
  Banknote,
  Building2,
  Users,
  ShoppingCart,
  Wallet,
}

interface StatCardProps {
  label: string
  value: number
  icon: string
  format?: "currency" | "number" | "units"
  borderColor?: "gold" | "success" | "error" | "warning" | "info"
  trend?: {
    value: number
    isPositive: boolean
  }
  delay?: number
  variant?: "default" | "bento"
  /** Hace la tarjeta clicable (ej. para filtrar la tabla por este KPI). */
  onClick?: () => void
  /** Marca la tarjeta como filtro activo. */
  active?: boolean
  /** Sufijo opcional bajo el valor (ej. "3 cuentas"). */
  hint?: string
}

// Colores del borde según estado
const BORDER_COLORS = {
  default: {
    gold: "border-l-gold",
    success: "border-l-success",
    error: "border-l-error",
    warning: "border-l-warning",
    info: "border-l-info",
  },
  bento: {
    gold: "border-b-gold",
    success: "border-b-success",
    error: "border-b-error",
    warning: "border-b-warning",
    info: "border-b-info",
  }
}

const BG_GLOW = {
  gold: "from-gold/5 to-transparent",
  success: "from-success/5 to-transparent",
  error: "from-error/5 to-transparent",
  warning: "from-warning/5 to-transparent",
  info: "from-info/5 to-transparent",
}

export function StatCard({
  label,
  value,
  icon,
  format = "currency",
  borderColor = "gold",
  trend,
  delay = 0,
  variant = "default",
  onClick,
  active = false,
  hint,
}: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  // Animación de visibilidad + count-up consolidados en un solo efecto
  useEffect(() => {
    const visibilityTimer = setTimeout(() => {
      setIsVisible(true)

      if (value === 0) return

      const duration = 800
      const steps = 30
      const stepTime = duration / steps
      let current = 0

      const counter = setInterval(() => {
        current++
        const progress = current / steps
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplayValue(Math.round(value * eased))

        if (current >= steps) {
          setDisplayValue(value)
          clearInterval(counter)
        }
      }, stepTime)

      // Limpiar interval si el componente se desmonta durante la animación
      return () => clearInterval(counter)
    }, delay * 50)

    return () => clearTimeout(visibilityTimer)
  }, [delay, value])

  const Icon = ICON_MAP[icon] || DollarSign

  const formattedValue = useMemo(() => {
    switch (format) {
      case "currency":
        return formatCOP(displayValue)
      case "number":
        return formatNumber(displayValue)
      case "units":
        return `${formatNumber(displayValue)} und.`
      default:
        return formatNumber(displayValue)
    }
  }, [format, displayValue])

  const interactive = !!onClick

  return (
    <Card
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      aria-pressed={interactive ? active : undefined}
      className={cn(
        "relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group bg-card border-border",
        variant === "default" ? "border-l-[3px] p-5" : "border-b-[4px] p-6 rounded-2xl",
        BORDER_COLORS[variant][borderColor],
        interactive && "cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active && "ring-2 ring-gold ring-offset-1 ring-offset-background",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}
      style={{ transitionDelay: `${delay * 50}ms` }}
    >
      {/* Background Gradient Glow */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-50 pointer-events-none transition-opacity duration-300 group-hover:opacity-100",
        BG_GLOW[borderColor]
      )} />

      {/* Glassmorphism shine effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/40 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <p className={cn(
            "font-semibold uppercase tracking-[0.05em] text-muted-foreground",
            variant === "bento" ? "text-sm" : "text-[13px] mb-2"
          )}>
            {label}
          </p>
          <div className={cn(
            "p-2 rounded-xl bg-background shadow-sm border border-border transition-transform group-hover:scale-110",
            variant === "bento" ? "size-10 flex items-center justify-center" : "size-8 flex items-center justify-center"
          )}>
            <Icon
              size={variant === "bento" ? 20 : 16}
              className={cn(
                borderColor === "gold" ? "text-gold" :
                  borderColor === "success" ? "text-success" :
                    borderColor === "error" ? "text-error" :
                      borderColor === "warning" ? "text-warning" : "text-info"
              )}
            />
          </div>
        </div>

        {/* Valor principal */}
        <p className={cn(
          "font-[family-name:var(--font-display)] font-bold text-foreground tabular-nums",
          variant === "bento" ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"
        )}>
          {formattedValue}
        </p>

        {/* Sufijo / contexto opcional */}
        {hint && (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        )}

        {/* Tendencia comparativa */}
        {trend && (
          <div className="flex items-center gap-1.5 mt-3 bg-background/50 w-fit px-2 py-1 rounded-md border border-border/50">
            {trend.isPositive ? (
              <ArrowUp size={14} className="text-success" />
            ) : (
              <ArrowDown size={14} className="text-error" />
            )}
            <span
              className={cn(
                "text-xs font-semibold",
                trend.isPositive ? "text-success" : "text-error"
              )}
            >
              {trend.value > 0 ? "+" : ""}
              {trend.value}% vs mes anterior
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}
