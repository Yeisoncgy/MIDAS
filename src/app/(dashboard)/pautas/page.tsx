"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Plus, Megaphone, Pencil, Eye } from "lucide-react"
import { toast } from "sonner"
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
import { formatCOP, formatDateShort, formatNumber } from "@/lib/format"
import { useDebounce } from "@/hooks/use-debounce"
import { CampaignFormDialog } from "./campaign-form-dialog"
import { CampaignDetailDrawer } from "./campaign-detail-drawer"
import type { Campaign, CampaignStatus } from "@/lib/types"

const OBJECTIVE_LABELS: Record<string, string> = {
  interaction: "Interaccion",
  messages: "Mensajes",
  traffic: "Trafico",
  conversions: "Conversiones",
}

function PautasPageInner() {
  const supabase = createClient()
  const params = useSearchParams()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const [statusFilter, setStatusFilter] = useState("all")
  const [platformFilter, setPlatformFilter] = useState("all")

  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .order("start_date", { ascending: false })

    if (error) {
      console.error("Error al cargar campanas:", error)
      toast.error("No se pudieron cargar las campanas")
    }
    if (data) setCampaigns(data as Campaign[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  // Intent de creación desde el command palette (?nuevo=1)
  useEffect(() => {
    if (params.get("nuevo") === "1") {
      setSelectedCampaign(null)
      setShowForm(true)
    }
  }, [params])

  // === Stats ===
  const stats = useMemo(() => {
    const activeCampaigns = campaigns.filter((c) => c.status === "active")
    const inversionActiva = activeCampaigns.reduce((s, c) => s + c.budget, 0)
    const totalSalesAttributed = campaigns.reduce(
      (s, c) => s + (c.sales_attributed || 0),
      0
    )
    const campaignsWithROI = campaigns.filter(
      (c) => c.roi !== null && c.roi !== undefined
    )
    const avgROI =
      campaignsWithROI.length > 0
        ? Math.round(
            campaignsWithROI.reduce((s, c) => s + (c.roi || 0), 0) /
              campaignsWithROI.length
          )
        : 0
    return {
      inversionActiva,
      activeCount: activeCampaigns.length,
      totalSalesAttributed,
      avgROI,
    }
  }, [campaigns])

  // Plataformas unicas para el filtro
  const platforms = useMemo(() => {
    const set = new Set(campaigns.map((c) => c.platform))
    return Array.from(set).sort()
  }, [campaigns])

  // === Filtrado ===
  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      const q = debouncedSearch.toLowerCase()
      const matchesSearch =
        !debouncedSearch ||
        c.name.toLowerCase().includes(q) ||
        c.platform.toLowerCase().includes(q)
      const matchesStatus = statusFilter === "all" || c.status === statusFilter
      const matchesPlatform =
        platformFilter === "all" || c.platform === platformFilter
      return matchesSearch && matchesStatus && matchesPlatform
    })
  }, [campaigns, debouncedSearch, statusFilter, platformFilter])

  const filteredBudgetTotal = useMemo(
    () => filtered.reduce((s, c) => s + c.budget, 0),
    [filtered]
  )

  const hasActiveFilters =
    !!search || statusFilter !== "all" || platformFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setPlatformFilter("all")
  }

  const openCreate = () => {
    setSelectedCampaign(null)
    setShowForm(true)
  }

  const openEdit = (c: Campaign) => {
    setSelectedCampaign(c)
    setShowForm(true)
  }

  const openDetail = (c: Campaign) => {
    setSelectedCampaign(c)
    setShowDetail(true)
  }

  // === Columnas de la tabla ===
  const columns = useMemo<Column<Campaign>[]>(
    () => [
      {
        key: "name",
        header: "Campana",
        sortAccessor: (c) => c.name,
        cell: (c) => (
          <div>
            <p className="text-sm font-medium text-foreground">{c.name}</p>
            <p className="text-xs text-muted-foreground sm:hidden">{c.platform}</p>
          </div>
        ),
      },
      {
        key: "platform",
        header: "Plataforma",
        className: "hidden sm:table-cell text-muted-foreground",
        sortAccessor: (c) => c.platform,
        cell: (c) => c.platform,
      },
      {
        key: "budget",
        header: "Presupuesto",
        align: "right",
        sortAccessor: (c) => c.budget,
        cell: (c) => (
          <span className="font-semibold text-gold">{formatCOP(c.budget)}</span>
        ),
        footer: formatCOP(filteredBudgetTotal),
      },
      {
        key: "objective",
        header: "Objetivo",
        className: "hidden md:table-cell text-muted-foreground",
        cell: (c) => OBJECTIVE_LABELS[c.objective] || c.objective,
      },
      {
        key: "dates",
        header: "Fechas",
        className: "hidden lg:table-cell",
        sortAccessor: (c) => c.start_date,
        cell: (c) => (
          <span className="text-xs text-muted-foreground">
            {formatDateShort(c.start_date)}
            {c.end_date ? ` — ${formatDateShort(c.end_date)}` : " — ..."}
          </span>
        ),
      },
      {
        key: "reach",
        header: "Alcance",
        align: "right",
        className: "hidden md:table-cell",
        sortAccessor: (c) => c.reach ?? -1,
        cell: (c) => (
          <span className="text-muted-foreground">
            {c.reach ? formatNumber(c.reach) : "—"}
          </span>
        ),
      },
      {
        key: "messages",
        header: "Mensajes",
        align: "right",
        className: "hidden xl:table-cell",
        sortAccessor: (c) => c.messages_received ?? -1,
        cell: (c) => (
          <span className="text-muted-foreground">
            {c.messages_received ? formatNumber(c.messages_received) : "—"}
          </span>
        ),
      },
      {
        key: "cac",
        header: "CAC",
        align: "right",
        className: "hidden xl:table-cell",
        sortAccessor: (c) => c.cac ?? -1,
        cell: (c) => (
          <span className="text-muted-foreground">
            {c.cac !== null && c.cac !== undefined ? formatCOP(c.cac) : "—"}
          </span>
        ),
      },
      {
        key: "roi",
        header: "ROI",
        align: "right",
        className: "hidden md:table-cell",
        sortAccessor: (c) => c.roi ?? Number.NEGATIVE_INFINITY,
        cell: (c) =>
          c.roi !== null && c.roi !== undefined ? (
            <span
              className={`font-semibold ${
                c.roi >= 0 ? "text-success" : "text-error"
              }`}
            >
              {c.roi > 0 ? "+" : ""}
              {c.roi}%
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "status",
        header: "Estado",
        align: "center",
        cell: (c) => <StatusBadge status={c.status as CampaignStatus} />,
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (c) => (
          <div
            className="flex items-center justify-end gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => openDetail(c)}
                >
                  <Eye size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ver detalle</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => openEdit(c)}
                >
                  <Pencil size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [filteredBudgetTotal]
  )

  if (loading) {
    return <PageSkeleton stats={4} rows={8} cols={7} />
  }

  return (
    <PageShell
      title="Pautas"
      description="Monitoreo de campanas publicitarias"
      actions={
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-1.5" />
          Nueva campana
        </Button>
      }
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Inversion activa"
          value={stats.inversionActiva}
          icon="DollarSign"
          format="currency"
          borderColor="gold"
          delay={0}
        />
        <StatCard
          label="Campanas activas"
          value={stats.activeCount}
          icon="TrendingUp"
          format="number"
          borderColor="success"
          delay={1}
          active={statusFilter === "active"}
          onClick={() =>
            setStatusFilter((s) => (s === "active" ? "all" : "active"))
          }
        />
        <StatCard
          label="Ventas atribuidas"
          value={stats.totalSalesAttributed}
          icon="ShoppingCart"
          format="number"
          borderColor="info"
          delay={2}
        />
        <StatCard
          label="ROI promedio"
          value={stats.avgROI}
          icon="TrendingUp"
          format="number"
          borderColor="warning"
          delay={3}
          hint="% sobre campanas con ingresos"
        />
      </div>

      {/* Filtros */}
      <FilterBar
        search={
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar campana o plataforma..."
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
            <SelectItem value="finished">Finalizadas</SelectItem>
            <SelectItem value="paused">Pausadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las plataformas</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Tabla */}
      <DataTable
        data={filtered}
        columns={columns}
        rowKey={(c) => c.id}
        onRowClick={openDetail}
        isFiltered={hasActiveFilters}
        pageSize={25}
        showFooter
        empty={{
          icon: Megaphone,
          title: "Sin campanas",
          description:
            "Registra tu primera campana publicitaria para empezar a medir su rendimiento.",
          action: (
            <Button onClick={openCreate}>
              <Plus size={16} className="mr-1.5" />
              Nueva campana
            </Button>
          ),
        }}
      />

      {/* Drawer de detalle. No limpia selectedCampaign al cerrar: lo hace el
          form dialog. Así "Editar campana" (cierra detail → abre form) no pierde
          la campaña seleccionada. */}
      <CampaignDetailDrawer
        open={showDetail}
        onOpenChange={setShowDetail}
        campaign={selectedCampaign}
        onEdit={() => {
          setShowDetail(false)
          setShowForm(true)
        }}
      />

      {/* Dialog de creación / edición */}
      <CampaignFormDialog
        open={showForm}
        onOpenChange={(isOpen) => {
          setShowForm(isOpen)
          if (!isOpen) setSelectedCampaign(null)
        }}
        campaign={selectedCampaign}
        onCompleted={fetchCampaigns}
      />
    </PageShell>
  )
}

export default function PautasPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={4} rows={8} cols={7} />}>
      <PautasPageInner />
    </Suspense>
  )
}
