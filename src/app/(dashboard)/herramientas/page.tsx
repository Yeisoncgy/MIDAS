"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Plus, Wrench, Pencil, CalendarClock, AlertTriangle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { PageShell } from "@/components/shared/page-shell"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { SearchInput } from "@/components/shared/search-input"
import { PageSkeleton } from "@/components/shared/skeletons"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatCOP, formatDateShort } from "@/lib/format"
import { useDebounce } from "@/hooks/use-debounce"
import { SubscriptionFormDialog } from "./subscription-form-dialog"
import type { Subscription } from "@/lib/types"

const CYCLE_LABELS: Record<string, string> = {
  monthly: "Mensual",
  annual: "Anual",
}

/** Umbral (en días) para considerar una renovación "próxima". */
const SOON_THRESHOLD_DAYS = 7

/**
 * Días que faltan para la renovación (negativo = ya venció).
 * Parsea la fecha como medianoche LOCAL (evita el desfase de un día que
 * provoca `new Date("2026-06-15")`, que se interpreta en UTC).
 */
function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number)
  const target = new Date(y, (m || 1) - 1, d || 1)

  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

type Urgency = "overdue" | "soon" | "upcoming" | "none"

/** Clasifica la urgencia de una renovación según los días restantes. */
function renewalUrgency(sub: Subscription): { urgency: Urgency; days: number } {
  const days = daysUntil(sub.next_renewal_date)
  // Solo las suscripciones activas requieren atención.
  if (sub.status !== "active") return { urgency: "none", days }
  if (days < 0) return { urgency: "overdue", days }
  if (days <= SOON_THRESHOLD_DAYS) return { urgency: "soon", days }
  if (days <= 30) return { urgency: "upcoming", days }
  return { urgency: "none", days }
}

function HerramientasPageInner() {
  const supabase = createClient()
  const params = useSearchParams()

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const [statusFilter, setStatusFilter] = useState("all")
  const [cycleFilter, setCycleFilter] = useState("all")
  const [renewalFilter, setRenewalFilter] = useState<"all" | "soon">("all")
  const [showForm, setShowForm] = useState(false)
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null)

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .order("tool_name")

    if (data) setSubscriptions(data as Subscription[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchSubscriptions()
  }, [fetchSubscriptions])

  // === Stats ===
  const stats = useMemo(() => {
    const activeSubs = subscriptions.filter((s) => s.status === "active")
    const pausedSubs = subscriptions.filter((s) => s.status === "paused")
    const totalMensual = activeSubs.reduce((s, sub) => s + sub.monthly_cost, 0)
    const gastoAnual = totalMensual * 12
    const renovacionesProximas = activeSubs.filter((s) => {
      const { urgency } = renewalUrgency(s)
      return urgency === "soon" || urgency === "overdue"
    }).length

    return {
      activeCount: activeSubs.length,
      pausedCount: pausedSubs.length,
      totalMensual,
      gastoAnual,
      renovacionesProximas,
    }
  }, [subscriptions])

  // === Filtrado ===
  const filtered = useMemo(() => {
    return subscriptions.filter((s) => {
      const q = debouncedSearch.toLowerCase()
      const matchesSearch =
        !q ||
        s.tool_name.toLowerCase().includes(q) ||
        (s.category || "").toLowerCase().includes(q)

      const matchesStatus = statusFilter === "all" || s.status === statusFilter
      const matchesCycle = cycleFilter === "all" || s.billing_cycle === cycleFilter

      const matchesRenewal =
        renewalFilter === "all" ||
        (() => {
          const { urgency } = renewalUrgency(s)
          return urgency === "soon" || urgency === "overdue"
        })()

      return matchesSearch && matchesStatus && matchesCycle && matchesRenewal
    })
  }, [subscriptions, debouncedSearch, statusFilter, cycleFilter, renewalFilter])

  const filteredMonthlyTotal = filtered
    .filter((s) => s.status === "active")
    .reduce((s, sub) => s + sub.monthly_cost, 0)

  const hasActiveFilters =
    !!search ||
    statusFilter !== "all" ||
    cycleFilter !== "all" ||
    renewalFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setCycleFilter("all")
    setRenewalFilter("all")
  }

  const openCreate = useCallback(() => {
    setSelectedSub(null)
    setShowForm(true)
  }, [])

  const openEdit = (s: Subscription) => {
    setSelectedSub(s)
    setShowForm(true)
  }

  // Soporte para intent de creación (?nuevo=1 desde el command palette)
  useEffect(() => {
    if (params.get("nuevo") === "1") openCreate()
  }, [params, openCreate])

  // === Columnas de la tabla ===
  const columns = useMemo<Column<Subscription>[]>(
    () => [
      {
        key: "tool_name",
        header: "Herramienta",
        sortAccessor: (s) => s.tool_name,
        cell: (sub) => (
          <div>
            <p className="text-sm font-medium text-foreground">{sub.tool_name}</p>
            <p className="text-xs text-muted-foreground md:hidden">
              {sub.category || "—"}
            </p>
          </div>
        ),
      },
      {
        key: "category",
        header: "Categoría",
        className: "hidden md:table-cell text-muted-foreground",
        sortAccessor: (s) => s.category ?? "",
        cell: (sub) => sub.category || "—",
      },
      {
        key: "monthly_cost",
        header: "Costo mensual",
        align: "right",
        sortAccessor: (s) => s.monthly_cost,
        cell: (sub) => (
          <span className="font-semibold text-gold">{formatCOP(sub.monthly_cost)}</span>
        ),
        footer: formatCOP(filteredMonthlyTotal),
      },
      {
        key: "billing_cycle",
        header: "Ciclo",
        className: "hidden sm:table-cell text-muted-foreground",
        cell: (sub) => CYCLE_LABELS[sub.billing_cycle] || sub.billing_cycle,
      },
      {
        key: "next_renewal_date",
        header: "Próxima renovación",
        sortAccessor: (s) => s.next_renewal_date,
        cell: (sub) => {
          const { urgency, days } = renewalUrgency(sub)
          const date = (
            <span className="tabular-nums">
              {formatDateShort(sub.next_renewal_date)}
            </span>
          )

          if (urgency === "overdue") {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1.5 font-medium text-error">
                    <AlertTriangle size={13} />
                    {date}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Renovación vencida hace {Math.abs(days)} día
                  {Math.abs(days) !== 1 ? "s" : ""}
                </TooltipContent>
              </Tooltip>
            )
          }

          if (urgency === "soon") {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1.5 font-medium text-warning">
                    <CalendarClock size={13} />
                    {date}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {days === 0
                    ? "Renueva hoy"
                    : `Renueva en ${days} día${days !== 1 ? "s" : ""}`}
                </TooltipContent>
              </Tooltip>
            )
          }

          return (
            <span
              className={cn(
                urgency === "upcoming" ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {date}
            </span>
          )
        },
      },
      {
        key: "status",
        header: "Estado",
        align: "center",
        cell: (sub) => (
          <StatusBadge
            status={sub.status as "active" | "paused" | "cancelled"}
          />
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (sub) => (
          <div
            className="flex items-center justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={() => openEdit(sub)}>
                  <Pencil size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar suscripción</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [filteredMonthlyTotal]
  )

  if (loading) {
    return <PageSkeleton stats={4} rows={8} cols={7} />
  }

  return (
    <PageShell
      title="Herramientas"
      description="Suscripciones y herramientas del negocio"
      actions={
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-1.5" />
          Nueva suscripción
        </Button>
      }
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Costo mensual"
          value={stats.totalMensual}
          icon="DollarSign"
          format="currency"
          borderColor="gold"
          hint={`${stats.activeCount} activa${stats.activeCount !== 1 ? "s" : ""}`}
          delay={0}
        />
        <StatCard
          label="Gasto anual estimado"
          value={stats.gastoAnual}
          icon="Banknote"
          format="currency"
          borderColor="info"
          delay={1}
        />
        <StatCard
          label="Renovaciones próximas"
          value={stats.renovacionesProximas}
          icon="TrendingDown"
          format="number"
          borderColor="warning"
          hint={`Próximos ${SOON_THRESHOLD_DAYS} días`}
          active={renewalFilter === "soon"}
          onClick={() =>
            setRenewalFilter((r) => (r === "soon" ? "all" : "soon"))
          }
          delay={2}
        />
        <StatCard
          label="Pausadas"
          value={stats.pausedCount}
          icon="Package"
          format="number"
          borderColor="warning"
          active={statusFilter === "paused"}
          onClick={() =>
            setStatusFilter((s) => (s === "paused" ? "all" : "paused"))
          }
          delay={3}
        />
      </div>

      {/* Filtros */}
      <FilterBar
        search={
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por nombre o categoría..."
            wrapperClassName="max-w-sm"
          />
        }
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activas</SelectItem>
            <SelectItem value="paused">Pausadas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cycleFilter} onValueChange={setCycleFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Ciclo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los ciclos</SelectItem>
            <SelectItem value="monthly">Mensual</SelectItem>
            <SelectItem value="annual">Anual</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={renewalFilter}
          onValueChange={(v) => setRenewalFilter(v as "all" | "soon")}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Renovación" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las renovaciones</SelectItem>
            <SelectItem value="soon">Próximas / vencidas</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Tabla */}
      <DataTable
        data={filtered}
        columns={columns}
        rowKey={(s) => s.id}
        onRowClick={openEdit}
        isFiltered={hasActiveFilters}
        pageSize={25}
        showFooter
        empty={{
          icon: Wrench,
          title: "Sin suscripciones",
          description:
            "Registra tu primera suscripción para llevar el control de costos.",
          action: (
            <Button onClick={openCreate}>
              <Plus size={16} className="mr-1.5" />
              Nueva suscripción
            </Button>
          ),
        }}
      />

      {/* Dialog */}
      <SubscriptionFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        subscription={selectedSub}
        onCompleted={fetchSubscriptions}
      />
    </PageShell>
  )
}

export default function HerramientasPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={4} rows={8} cols={6} />}>
      <HerramientasPageInner />
    </Suspense>
  )
}
