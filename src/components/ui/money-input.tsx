"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"

interface MoneyInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  /** Valor numérico real (en pesos, sin decimales). null/undefined = vacío. */
  value: number | null | undefined
  /** Devuelve el número entero de pesos (o null si está vacío). */
  onValueChange: (value: number | null) => void
  /** Monto máximo permitido (ej. saldo pendiente). Recorta al perder foco. */
  max?: number
  /** Muestra un botón "Total" que rellena con `max`. */
  showMaxButton?: boolean
  /** Texto del botón de máximo. */
  maxButtonLabel?: string
}

/**
 * Input de dinero para pesos colombianos.
 * El usuario ve "$ 150.000" mientras escribe; el componente entrega 150000.
 * Evita errores de ceros en montos grandes (problema transversal del ERP).
 */
function MoneyInput({
  value,
  onValueChange,
  max,
  showMaxButton = false,
  maxButtonLabel = "Total",
  className,
  disabled,
  ...props
}: MoneyInputProps) {
  // Texto visible derivado del valor numérico
  const display = value === null || value === undefined ? "" : formatNumber(value)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Quitar todo lo que no sea dígito
    const digits = e.target.value.replace(/\D/g, "")
    if (digits === "") {
      onValueChange(null)
      return
    }
    let num = parseInt(digits, 10)
    if (Number.isNaN(num)) {
      onValueChange(null)
      return
    }
    if (max !== undefined && num > max) num = max
    onValueChange(num)
  }

  const handleMax = () => {
    if (max !== undefined) onValueChange(max)
  }

  return (
    <div className="relative">
      <span
        className={cn(
          "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium",
          value ? "text-foreground" : "text-muted-foreground"
        )}
        aria-hidden
      >
        $
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        data-slot="money-input"
        value={display}
        onChange={handleChange}
        disabled={disabled}
        className={cn(
          "border-input h-9 w-full min-w-0 rounded-md border bg-transparent pl-7 py-1 text-right text-sm tabular-nums shadow-xs outline-none transition-[color,box-shadow]",
          "placeholder:text-muted-foreground placeholder:font-normal",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          showMaxButton && max !== undefined ? "pr-16" : "pr-3",
          className
        )}
        {...props}
      />
      {showMaxButton && max !== undefined && (
        <button
          type="button"
          onClick={handleMax}
          disabled={disabled}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold transition-colors hover:bg-gold-light disabled:opacity-50"
        >
          {maxButtonLabel}
        </button>
      )}
    </div>
  )
}

export { MoneyInput }
