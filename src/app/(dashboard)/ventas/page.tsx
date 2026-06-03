"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import {
  ShoppingCart,
  Eye,
  ArrowRightLeft,
  RotateCcw,
  Download,
  BarChart3,
  List,
  CreditCard,
} from "lucide-react"
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
import { formatCOP, formatDateShort, getTotalItems } from "@/lib/format"
import { useDebounce } from "@/hooks/use-debounce"
import { SALE_STATUS_CONFIG, SALE_CHANNELS, PAYMENT_METHODS } from "@/lib/constants"
import { type PeriodKey, toLocalDate, getDateRange } from "@/lib/date-periods"
import type { SaleStatus } from "@/lib/types"
import { PeriodSelector } from "@/components/shared/period-selector"
import { type SaleExpanded } from "../facturacion/recibo-termico"
import { SalesCharts } from "./sales-charts"
import { SaleDetailDrawer } from "./sale-detail-drawer"
import { ChangeStatusDialog } from "./change-status-dialog"
import { ProcessReturnDialog } from "./process-return-dialog"
import { exportSalesToExcel } from "./export-sales"

type TabKey = "listado" | "analisis"

export default function VentasPage() {
  const supabase = createClient()

  const [sales, setSales] = useState<SaleExpanded[]>([])
  const [loading, setLoading] = useState(true)

  const [period, setPeriod] = useState<PeriodKey>("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const [statusFilter, setStatusFilter] = useState("all")
  const [channelFilter, setChannelFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")

  const [activeTab, setActiveTab] = useState<TabKey>("listado")

  const [showDetail, setShowDetail] = useState(false)
  const [showChangeStatus, setShowChangeStatus] = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  const [selectedSale, setSelectedSale] = useState<SaleExpanded | null>(null)

  const [creditPending, setCreditPending] = useState(0)

  const fetchSales = useCallback(async () => {
    setLoading(true)

    let dateFrom: string
    let dateTo: string

    if (period === "custom") {
      dateFrom = customFrom || ""
      if (customTo) {
        const nextDay = new Date(customTo + "T00:00:00")
        nextDay.setDate(nextDay.getDate() + 1)
        dateTo = toLocalDate(nextDay)
      } else {
        dateTo = ""
      }
    } else {
      const range = getDateRange(period)
      dateFrom = range.from
      dateTo = range.to
    }

    let query = supabase
      .from("sales")
      .select(`
        *,
        client:clients(*),
        items:sale_items(
          *,
          variant:product_variants(
            *,
            product:products(*)
          )
        )
      `)
      .order("created_at", { ascending: false })

    if (dateFrom) query = query.gte("sale_date", dateFrom)
    if (dateTo) query = query.lt("sale_date", dateTo)

    const { data, error } = await query

    if (!error && data) {
      setSales(data as unknown as SaleExpanded[])
    } else {
      console.error("Error al cargar ventas:", error)
      toast.error("No se pudieron cargar las ventas")
    }

    setLoading(false)
  }, [supabase, period, customFrom, customTo])

  const fetchCreditPending = useCallback(async () => {
    const { data } = await supabase
      .from("accounts_receivable")
      .select("remaining_amount")
      .gt("remaining_amount", 0)
      .in("status", ["pending", "partial", "overdue"])

    if (data) {
      setCreditPending(data.reduce((sum, r) => sum + (r.remaining_amount || 0), 0))
    }
  }, [supabase])

  useEffect(() => {
    fetchSales()
    fetchCreditPending()
  }, [fetchSales, fetchCreditPending])

  const stats = useMemo(() => {
    const activeSales = sales.filter((s) => s.status !== "returned")
    const returnedSales = sales.filter((s) => s.status === "returned")

    const totalVendido = activeSales.reduce((sum, s) => sum + s.total, 0)
    const cantidadVentas = activeSales.length
    const ticketPromedio = cantidadVentas > 0 ? Math.round(totalVendido / cantidadVentas) : 0
    const unidadesVendidas = activeSales.reduce(
      (sum, s) => sum + (s.items || []).reduce((q, i) => q + i.quantity, 0),
      0
    )
    const devoluciones = returnedSales.length

    return { totalVendido, cantidadVentas, ticketPromedio, unidadesVendidas, devoluciones }
  }, [sales])

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const searchLower = debouncedSearch.toLowerCase()
      const matchesSearch =
        !debouncedSearch ||
        sale.invoice_number?.toLowerCase().includes(searchLower) ||
        sale.client?.full_name?.toLowerCase().includes(searchLower)

      const matchesStatus = statusFilter === "all" || sale.status === statusFilter
      const matchesChannel = channelFilter === "all" || sale.sale_channel === channelFilter
      const matchesPayment = paymentFilter === "all" || sale.payment_method === paymentFilter

      return matchesSearch && matchesStatus && matchesChannel && matchesPayment
    })
  }, [sales, debouncedSearch, statusFilter, channelFilter, paymentFilter])

  const hasActiveFilters =
    !!search || statusFilter !== "all" || channelFilter !== "all" || paymentFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setChannelFilter("all")
    setPaymentFilter("all")
  }

  const handleViewDetail = (sale: SaleExpanded) => {
    setSelectedSale(sale)
    setShowDetail(true)
  }

  const handleChangeStatus = (sale: SaleExpanded) => {
    setSelectedSale(sale)
    setShowChangeStatus(true)
  }

  const handleProcessReturn = (sale: SaleExpanded) => {
    setSelectedSale(sale)
    setShowReturn(true)
  }

  const handleSaleUpdated = () => {
    fetchSales()
    fetchCreditPending()
  }

  // === Columnas de la tabla ===
  const columns = useMemo<Column<SaleExpanded>[]>(
    () => [
      {
        key: "invoice",
        header: "# Factura",
        sortAccessor: (s) => s.invoice_number ?? "",
        cell: (sale) => (
          <span className="flex items-center gap-1.5 font-semibold text-gold">
            {sale.invoice_number}
            {sale.is_credit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <CreditCard size={13} className="text-warning" />
                </TooltipTrigger>
                <TooltipContent>Venta a crédito</TooltipContent>
              </Tooltip>
            )}
          </span>
        ),
      },
      {
        key: "date",
        header: "Fecha",
        sortAccessor: (s) => s.sale_date || s.created_at,
        cell: (sale) => (
          <span className="text-muted-foreground">
            {formatDateShort(sale.sale_date || sale.created_at)}
          </span>
        ),
      },
      {
        key: "client",
        header: "Cliente",
        sortAccessor: (s) => s.client?.full_name ?? "",
        cell: (sale) => sale.client?.full_name || "—",
      },
      {
        key: "channel",
        header: "Canal",
        className: "hidden md:table-cell text-muted-foreground",
        cell: (sale) =>
          SALE_CHANNELS.find((c) => c.value === sale.sale_channel)?.label ||
          sale.sale_channel,
      },
      {
        key: "items",
        header: "Items",
        align: "center",
        cell: (sale) => getTotalItems(sale.items),
      },
      {
        key: "total",
        header: "Total",
        align: "right",
        sortAccessor: (s) => s.total,
        cell: (sale) => (
          <span className="font-semibold text-gold">{formatCOP(sale.total)}</span>
        ),
        footer: formatCOP(filteredSales.reduce((sum, s) => sum + s.total, 0)),
      },
      {
        key: "payment",
        header: "M. Pago",
        className: "hidden lg:table-cell text-muted-foreground",
        cell: (sale) =>
          PAYMENT_METHODS.find((m) => m.value === sale.payment_method)?.label ||
          sale.payment_method,
      },
      {
        key: "status",
        header: "Estado",
        align: "center",
        cell: (sale) => <StatusBadge status={sale.status} />,
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (sale) => (
          <div
            className="flex items-center justify-end gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={() => handleViewDetail(sale)}>
                  <Eye size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ver detalle</TooltipContent>
            </Tooltip>
            {sale.status !== "returned" && sale.status !== "delivered" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" onClick={() => handleChangeStatus(sale)}>
                    <ArrowRightLeft size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cambiar estado</TooltipContent>
              </Tooltip>
            )}
            {sale.status !== "returned" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-error hover:text-error"
                    onClick={() => handleProcessReturn(sale)}
                  >
                    <RotateCcw size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Procesar devolución</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      },
    ],
    [filteredSales]
  )

  if (loading) {
    return <PageSkeleton stats={6} rows={8} cols={7} />
  }

  return (
    <PageShell
      title="Ventas"
      description="Gestión y análisis de ventas"
      actions={
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await exportSalesToExcel(filteredSales)
              toast.success("Reporte descargado correctamente")
            } catch {
              toast.error("Error al generar el reporte")
            }
          }}
          disabled={filteredSales.length === 0}
        >
          <Download size={16} className="mr-1.5" />
          Descargar reporte
        </Button>
      }
    >
      {/* Selector de periodo */}
      <PeriodSelector
        selectedPeriod={period}
        onPeriodChange={setPeriod}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {/* Stat Cards — clicables para filtrar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total vendido"
          value={stats.totalVendido}
          icon="DollarSign"
          format="currency"
          borderColor="gold"
          delay={0}
        />
        <StatCard
          label="Cantidad de ventas"
          value={stats.cantidadVentas}
          icon="ShoppingCart"
          format="number"
          borderColor="gold"
          delay={1}
        />
        <StatCard
          label="Ticket promedio"
          value={stats.ticketPromedio}
          icon="DollarSign"
          format="currency"
          borderColor="info"
          delay={2}
        />
        <StatCard
          label="Unidades vendidas"
          value={stats.unidadesVendidas}
          icon="Package"
          format="units"
          borderColor="gold"
          delay={3}
        />
        <StatCard
          label="Devoluciones"
          value={stats.devoluciones}
          icon="ShoppingCart"
          format="number"
          borderColor="error"
          delay={4}
          active={statusFilter === "returned"}
          onClick={() =>
            setStatusFilter((s) => (s === "returned" ? "all" : "returned"))
          }
        />
        <StatCard
          label="Crédito pendiente"
          value={creditPending}
          icon="DollarSign"
          format="currency"
          borderColor="warning"
          delay={5}
        />
      </div>

      {/* Tabs */}
      <div className="flex w-fit items-center gap-1 rounded-lg bg-cream p-1">
        <button
          onClick={() => setActiveTab("listado")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "listado"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <List size={15} />
          Listado
        </button>
        <button
          onClick={() => setActiveTab("analisis")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "analisis"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 size={15} />
          Análisis
        </button>
      </div>

      {activeTab === "analisis" && <SalesCharts sales={sales} />}

      {activeTab === "listado" && (
        <div className="space-y-4">
          <FilterBar
            search={
              <SearchInput
                value={search}
                onValueChange={setSearch}
                placeholder="Buscar factura o cliente..."
                wrapperClassName="max-w-sm"
              />
            }
            hasActiveFilters={hasActiveFilters}
            onClear={clearFilters}
          >
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {(Object.keys(SALE_STATUS_CONFIG) as SaleStatus[]).map((status) => (
                  <SelectItem key={status} value={status}>
                    {SALE_STATUS_CONFIG[status].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los canales</SelectItem>
                {SALE_CHANNELS.map((ch) => (
                  <SelectItem key={ch.value} value={ch.value}>
                    {ch.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Método pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los métodos</SelectItem>
                {PAYMENT_METHODS.map((pm) => (
                  <SelectItem key={pm.value} value={pm.value}>
                    {pm.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBar>

          <DataTable
            data={filteredSales}
            columns={columns}
            rowKey={(s) => s.id}
            onRowClick={handleViewDetail}
            isFiltered={hasActiveFilters}
            pageSize={25}
            showFooter
            empty={{
              icon: ShoppingCart,
              title: "Sin ventas",
              description: "No hay ventas registradas en el periodo seleccionado.",
            }}
          />
        </div>
      )}

      {/* Drawers y diálogos */}
      <SaleDetailDrawer
        open={showDetail}
        onOpenChange={(isOpen) => {
          setShowDetail(isOpen)
          if (!isOpen) setSelectedSale(null)
        }}
        sale={selectedSale}
        onChangeStatus={() => {
          setShowDetail(false)
          setShowChangeStatus(true)
        }}
        onProcessReturn={() => {
          setShowDetail(false)
          setShowReturn(true)
        }}
        onSaleUpdated={handleSaleUpdated}
      />

      <ChangeStatusDialog
        open={showChangeStatus}
        onOpenChange={(isOpen) => {
          setShowChangeStatus(isOpen)
          if (!isOpen) setSelectedSale(null)
        }}
        sale={selectedSale}
        onStatusChanged={handleSaleUpdated}
      />

      <ProcessReturnDialog
        open={showReturn}
        onOpenChange={(isOpen) => {
          setShowReturn(isOpen)
          if (!isOpen) setSelectedSale(null)
        }}
        sale={selectedSale}
        onReturnProcessed={handleSaleUpdated}
      />
    </PageShell>
  )
}
