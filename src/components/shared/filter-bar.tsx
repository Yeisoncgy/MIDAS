"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

interface FilterBarProps {
  /** Slot de búsqueda (normalmente <SearchInput />). */
  search?: React.ReactNode
  /** Slots de filtros (Selects). */
  children?: React.ReactNode
  /** Hay al menos un filtro activo → muestra botón "Limpiar". */
  hasActiveFilters?: boolean
  /** Limpia todos los filtros. */
  onClear?: () => void
  /** Acciones a la derecha (ej. botón de exportar). */
  actions?: React.ReactNode
  className?: string
}

/**
 * Barra de filtros estándar: búsqueda + selects + limpiar + acciones.
 * Unifica la cabecera de todos los listados del ERP.
 */
export function FilterBar({
  search,
  children,
  hasActiveFilters = false,
  onClear,
  actions,
  className,
}: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center",
        className
      )}
    >
      {search}
      {children}
      {hasActiveFilters && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={15} />
          Limpiar
        </button>
      )}
      {actions && <div className="sm:ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  )
}
