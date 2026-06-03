import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/shared/page-header"

interface PageShellProps {
  title: string
  description?: string
  /** Acciones del header (botón primario, exportar, etc.). */
  actions?: React.ReactNode
  /** Fila de KPIs / StatCards. */
  stats?: React.ReactNode
  /** Barra de filtros (FilterBar) o controles (PeriodSelector + tabs). */
  toolbar?: React.ReactNode
  /** Contenido principal (tabla, grid, etc.). */
  children: React.ReactNode
  className?: string
}

/**
 * Layout estándar de un módulo del ERP. Garantiza ritmo vertical y
 * estructura consistentes en todas las pantallas.
 */
export function PageShell({
  title,
  description,
  actions,
  stats,
  toolbar,
  children,
  className,
}: PageShellProps) {
  return (
    <div className={cn("animate-page-in space-y-6", className)}>
      <PageHeader title={title} description={description}>
        {actions}
      </PageHeader>
      {stats}
      {toolbar}
      {children}
    </div>
  )
}
