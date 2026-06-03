"use client"

import { useEffect, useState, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Receipt,
  Plus,
  Eye,
  Printer,
  CreditCard,
} from "lucide-react"
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
import { SALE_STATUS_CONFIG } from "@/lib/constants"
import type { SaleStatus } from "@/lib/types"
import { NuevaFacturaDialog } from "./nueva-factura-dialog"
import { FacturaDetailDialog } from "./factura-detail-dialog"
import { AbonosDialog } from "./abonos-dialog"
import { printReceipt, type SaleExpanded } from "./recibo-termico"

function FacturacionPageInner() {
  const params = useSearchParams()

  // === Estado principal ===
  const [sales, setSales] = useState<SaleExpanded[]>([])
  const [loading, setLoading] = useState(true)

  // === Filtros ===
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const [statusFilter, setStatusFilter] = useState("all")

  // === Diálogos ===
  const [showNuevaFactura, setShowNuevaFactura] = useState(false)
  const [showDetalle, setShowDetalle] = useState(false)
  const [showAbonos, setShowAbonos] = useState(false)
  const [selectedSale, setSelectedSale] = useState<SaleExpanded | null>(null)

  const supabase = createClient()

  // === Cargar ventas desde Supabase ===
  const fetchSales = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
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

    if (!error && data) {
      setSales(data as unknown as SaleExpanded[])
    } else {
      console.error("Error al cargar facturas:", error)
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchSales()
  }, [fetchSales])

  // === Intent ?nuevo=1 — abrir el form de nueva factura ===
  useEffect(() => {
    if (params.get("nuevo") === "1") setShowNuevaFactura(true)
  }, [params])

  // === Estadísticas del mes actual ===
  const stats = useMemo(() => {
    const ahora = new Date()
    const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)

    // Filtrar ventas del mes actual
    const ventasDelMes = sales.filter((s) => {
      const fecha = new Date(s.sale_date || s.created_at)
      return fecha >= primerDiaMes
    })

    const totalFacturado = ventasDelMes.reduce((sum, s) => sum + s.total, 0)
    const cantidadFacturas = ventasDelMes.length
    const promedio = cantidadFacturas > 0 ? Math.round(totalFacturado / cantidadFacturas) : 0
    const pendientes = ventasDelMes.filter((s) => s.status === "pending").length

    return { cantidadFacturas, totalFacturado, promedio, pendientes }
  }, [sales])

  // === Filtrado de ventas ===
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Filtro por búsqueda (número de factura o nombre de cliente)
      const searchLower = debouncedSearch.toLowerCase()
      const matchesSearch =
        !debouncedSearch ||
        sale.invoice_number?.toLowerCase().includes(searchLower) ||
        sale.client?.full_name?.toLowerCase().includes(searchLower)

      // Filtro por estado
      const matchesStatus =
        statusFilter === "all" || sale.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [sales, debouncedSearch, statusFilter])

  const hasActiveFilters = !!search || statusFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
  }

  // === Calcular el descuento visible ===
  const getDiscountDisplay = (sale: SaleExpanded): string => {
    if (!sale.discount_value || sale.discount_value <= 0) return "-"
    if (sale.discount_type === "percentage") {
      const valor = Math.round(sale.subtotal * (sale.discount_value / 100))
      return `-${formatCOP(valor)}`
    }
    return `-${formatCOP(sale.discount_value)}`
  }

  // === Abrir detalle de una factura ===
  const handleViewDetail = (sale: SaleExpanded) => {
    setSelectedSale(sale)
    setShowDetalle(true)
  }

  // === Imprimir recibo térmico ===
  const handlePrint = (sale: SaleExpanded) => {
    printReceipt(sale)
  }

  // === Abrir panel de abonos ===
  const handleViewAbonos = (sale: SaleExpanded) => {
    setSelectedSale(sale)
    setShowAbonos(true)
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
        key: "items",
        header: "Items",
        align: "center",
        cell: (sale) => getTotalItems(sale.items),
      },
      {
        key: "subtotal",
        header: "Subtotal",
        align: "right",
        className: "hidden md:table-cell text-muted-foreground",
        sortAccessor: (s) => s.subtotal,
        cell: (sale) => formatCOP(sale.subtotal),
      },
      {
        key: "discount",
        header: "Descuento",
        align: "right",
        className: "hidden lg:table-cell text-muted-foreground",
        cell: (sale) => getDiscountDisplay(sale),
      },
      {
        key: "shipping",
        header: "Envío",
        align: "right",
        className: "hidden lg:table-cell text-muted-foreground",
        cell: (sale) => (sale.shipping_cost > 0 ? formatCOP(sale.shipping_cost) : "-"),
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={() => handlePrint(sale)}>
                  <Printer size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Imprimir recibo</TooltipContent>
            </Tooltip>
            {sale.is_credit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-gold hover:text-gold"
                    onClick={() => handleViewAbonos(sale)}
                  >
                    <CreditCard size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver abonos</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      },
    ],
    [filteredSales]
  )

  // === Estado de carga (skeleton) ===
  if (loading) {
    return <PageSkeleton stats={4} rows={8} cols={7} />
  }

  return (
    <PageShell
      title="Facturación"
      description="Gestión de facturas y recibos térmicos"
      actions={
        <Button onClick={() => setShowNuevaFactura(true)}>
          <Plus size={18} className="mr-1.5" />
          Nueva Factura
        </Button>
      }
    >
      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Facturas del mes"
          value={stats.cantidadFacturas}
          icon="ShoppingCart"
          format="number"
          borderColor="gold"
          delay={0}
        />
        <StatCard
          label="Total facturado"
          value={stats.totalFacturado}
          icon="DollarSign"
          format="currency"
          borderColor="gold"
          delay={1}
        />
        <StatCard
          label="Promedio por factura"
          value={stats.promedio}
          icon="DollarSign"
          format="currency"
          borderColor="info"
          delay={2}
        />
        <StatCard
          label="Facturas pendientes"
          value={stats.pendientes}
          icon="ShoppingCart"
          format="number"
          borderColor="warning"
          delay={3}
          active={statusFilter === "pending"}
          onClick={() =>
            setStatusFilter((s) => (s === "pending" ? "all" : "pending"))
          }
        />
      </div>

      {/* Filtros */}
      <FilterBar
        search={
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por # factura o cliente..."
            wrapperClassName="max-w-sm"
          />
        }
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
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
      </FilterBar>

      {/* Tabla de facturas */}
      <DataTable
        data={filteredSales}
        columns={columns}
        rowKey={(s) => s.id}
        onRowClick={handleViewDetail}
        isFiltered={hasActiveFilters}
        pageSize={25}
        showFooter
        empty={{
          icon: Receipt,
          title: "Sin facturas",
          description:
            "Aún no se han creado facturas. Crea la primera para empezar.",
          action: (
            <Button onClick={() => setShowNuevaFactura(true)}>
              <Plus size={18} className="mr-1.5" />
              Crear primera factura
            </Button>
          ),
        }}
      />

      {/* ============================================================ */}
      {/* DIÁLOGOS */}
      {/* ============================================================ */}

      {/* Diálogo de nueva factura */}
      <NuevaFacturaDialog
        open={showNuevaFactura}
        onOpenChange={setShowNuevaFactura}
        onCompleted={fetchSales}
      />

      {/* Diálogo de detalle de factura */}
      <FacturaDetailDialog
        open={showDetalle}
        onOpenChange={(isOpen) => {
          setShowDetalle(isOpen)
          if (!isOpen) setSelectedSale(null)
        }}
        sale={selectedSale}
      />

      {/* Diálogo de abonos (crédito) */}
      <AbonosDialog
        open={showAbonos}
        onOpenChange={(isOpen) => {
          setShowAbonos(isOpen)
          if (!isOpen) setSelectedSale(null)
        }}
        sale={selectedSale}
        onPaymentRegistered={fetchSales}
      />
    </PageShell>
  )
}

export default function FacturacionPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={4} rows={8} cols={7} />}>
      <FacturacionPageInner />
    </Suspense>
  )
}
