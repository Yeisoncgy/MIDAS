import { cn } from "@/lib/utils"

/** Bloque base con shimmer. */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-md", className)} />
}

/** Grid de KPIs en carga — debe coincidir con el grid real para evitar saltos. */
export function StatCardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border-l-[3px] border-border border-l-muted bg-card p-5"
        >
          <div className="mb-4 flex items-start justify-between">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="size-8 rounded-xl" />
          </div>
          <Shimmer className="h-8 w-32" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton de tabla (cabecera + N filas). */
export function TableSkeleton({
  rows = 8,
  cols = 5,
}: {
  rows?: number
  cols?: number
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex gap-4 border-b border-border bg-cream/60 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-border px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Shimmer key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Skeleton de página completa: header + KPIs + tabla. */
export function PageSkeleton({
  stats = 4,
  rows = 8,
  cols = 5,
}: {
  stats?: number
  rows?: number
  cols?: number
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Shimmer className="h-7 w-48" />
          <Shimmer className="h-4 w-64" />
        </div>
        <Shimmer className="h-9 w-32 rounded-md" />
      </div>
      <StatCardGridSkeleton count={stats} />
      <TableSkeleton rows={rows} cols={cols} />
    </div>
  )
}
