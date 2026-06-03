"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/shared/empty-state"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  type LucideIcon,
} from "lucide-react"

export type Align = "left" | "center" | "right"
export type Density = "compact" | "default" | "comfortable"

export interface Column<T> {
  /** Identificador único de la columna. */
  key: string
  /** Encabezado visible. */
  header: React.ReactNode
  /** Render de la celda. */
  cell: (row: T, index: number) => React.ReactNode
  /** Alineación del contenido (números → right). */
  align?: Align
  /** Habilita ordenar por esta columna; recibe la fila y devuelve un valor comparable. */
  sortAccessor?: (row: T) => string | number | null | undefined
  /** Clases extra para la celda (ej. ocultar en móvil: "hidden md:table-cell"). */
  className?: string
  /** Clases extra para el encabezado. */
  headerClassName?: string
  /** Render del pie de columna (total). */
  footer?: React.ReactNode
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  /** Clave estable por fila. */
  rowKey: (row: T, index: number) => string
  /** Acción al hacer clic en la fila (toda la fila clicable). */
  onRowClick?: (row: T) => void
  /** Estado de carga → muestra skeleton de filas. */
  loading?: boolean
  /** Filas de skeleton a mostrar mientras carga. */
  skeletonRows?: number
  /** Configuración del estado vacío. */
  empty?: {
    icon?: LucideIcon
    title?: string
    description?: string
    action?: React.ReactNode
  }
  /** Distingue "sin datos" de "sin resultados de filtro". */
  isFiltered?: boolean
  /** Densidad de fila. */
  density?: Density
  /** Activa paginación cliente con N filas por página. */
  pageSize?: number
  /** Muestra el footer de totales. */
  showFooter?: boolean
  className?: string
}

const ROW_HEIGHT: Record<Density, string> = {
  compact: "h-10",
  default: "h-12",
  comfortable: "h-14",
}

const ALIGN_CLASS: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  onRowClick,
  loading = false,
  skeletonRows = 8,
  empty,
  isFiltered = false,
  density = "default",
  pageSize,
  showFooter = false,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(null)
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc")
  const [page, setPage] = React.useState(0)

  // Resetear a la primera página cuando cambian los datos (ej. tras filtrar)
  React.useEffect(() => {
    setPage(0)
  }, [data.length, sortKey, sortDir])

  const sorted = React.useMemo(() => {
    if (!sortKey) return data
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sortAccessor) return data
    const accessor = col.sortAccessor
    const dir = sortDir === "asc" ? 1 : -1
    return [...data].sort((a, b) => {
      const va = accessor(a)
      const vb = accessor(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir
      return String(va).localeCompare(String(vb), "es") * dir
    })
  }, [data, columns, sortKey, sortDir])

  const totalPages = pageSize ? Math.ceil(sorted.length / pageSize) : 1
  const paged = React.useMemo(() => {
    if (!pageSize) return sorted
    const start = page * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, pageSize, page])

  const toggleSort = (col: Column<T>) => {
    if (!col.sortAccessor) return
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(col.key)
      setSortDir("asc")
    }
  }

  // Estado vacío (sin loading)
  if (!loading && sorted.length === 0) {
    return (
      <div className={cn("rounded-xl border border-border bg-card", className)}>
        <EmptyState
          icon={empty?.icon}
          title={
            empty?.title ?? (isFiltered ? "Sin resultados" : "No hay datos")
          }
          description={
            empty?.description ??
            (isFiltered
              ? "No encontramos coincidencias para tu búsqueda o filtros. Prueba ajustarlos."
              : "Aún no se han registrado datos en esta sección.")
          }
        >
          {!isFiltered && empty?.action}
        </EmptyState>
      </div>
    )
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border bg-cream/60">
            {columns.map((col) => {
              const sortable = !!col.sortAccessor
              const isSorted = sortKey === col.key
              return (
                <TableHead
                  key={col.key}
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground",
                    ALIGN_CLASS[col.align ?? "left"],
                    sortable && "cursor-pointer select-none hover:text-foreground",
                    col.headerClassName,
                    col.className
                  )}
                  onClick={sortable ? () => toggleSort(col) : undefined}
                  aria-sort={
                    isSorted ? (sortDir === "asc" ? "ascending" : "descending") : undefined
                  }
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      col.align === "right" && "flex-row-reverse"
                    )}
                  >
                    {col.header}
                    {sortable &&
                      (isSorted ? (
                        sortDir === "asc" ? (
                          <ChevronUp size={13} className="text-gold" />
                        ) : (
                          <ChevronDown size={13} className="text-gold" />
                        )
                      ) : (
                        <ChevronsUpDown size={13} className="opacity-40" />
                      ))}
                  </span>
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>

        <TableBody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, i) => (
                <TableRow key={`sk-${i}`} className={cn(ROW_HEIGHT[density], "border-border")}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      <div className="skeleton-shimmer h-4 rounded w-full max-w-[120px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : paged.map((row, i) => (
                <TableRow
                  key={rowKey(row, i)}
                  className={cn(
                    ROW_HEIGHT[density],
                    "border-border",
                    onRowClick && "cursor-pointer"
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        "px-3 text-sm",
                        col.align === "right" && "text-right tabular-nums",
                        col.align === "center" && "text-center",
                        col.className
                      )}
                    >
                      {col.cell(row, i)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>

        {showFooter && !loading && columns.some((c) => c.footer != null) && (
          <TableFooter className="bg-cream/80 border-border">
            <TableRow className="hover:bg-transparent border-0">
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn(
                    "px-3 text-sm font-semibold",
                    col.align === "right" && "text-right tabular-nums",
                    col.align === "center" && "text-center",
                    col.className
                  )}
                >
                  {col.footer}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>

      {pageSize && totalPages > 1 && !loading && (
        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} de{" "}
            {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              aria-label="Página anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2 text-xs font-medium tabular-nums text-foreground">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              aria-label="Página siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
