"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Search, X } from "lucide-react"

interface SearchInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value: string
  onValueChange: (value: string) => void
  /** Texto guía. */
  placeholder?: string
  className?: string
  /** Ancho del contenedor (por defecto crece). */
  wrapperClassName?: string
}

/**
 * Input de búsqueda con icono y botón de limpiar.
 * Reemplaza el patrón "input con icono absoluto" repetido en 16 módulos.
 */
export function SearchInput({
  value,
  onValueChange,
  placeholder = "Buscar...",
  className,
  wrapperClassName,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn("relative flex-1 min-w-[180px]", wrapperClassName)}>
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "border-input h-9 w-full rounded-md border bg-card pl-9 pr-9 text-sm shadow-xs outline-none transition-[color,box-shadow]",
          "placeholder:text-muted-foreground",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          className
        )}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onValueChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Limpiar búsqueda"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
