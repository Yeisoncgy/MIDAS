"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { ClipboardList, CreditCard, AlertTriangle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { PageShell } from "@/components/shared/page-shell"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { SearchInput } from "@/components/shared/search-input"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCOP, formatDateShort } from "@/lib/format"
import { useDebounce } from "@/hooks/use-debounce"
import { ACCOUNT_STATUS_LABELS } from "@/lib/constants"
import { PaymentDialog, type CxCExpanded, type CxPExpanded } from "./payment-dialog"

// ═══════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════
type TabKey = "por_cobrar" | "por_pagar"

/**
 * Una cuenta está vencida cuando su fecha de vencimiento ya pasó y aún queda
 * saldo pendiente. No depende del campo `status` (que puede no haberse
 * recalculado en BD), así que se evalúa siempre sobre la fecha real.
 */
function isOverdue(dueDate: string | null | undefined, remaining: number): boolean {
  if (!dueDate || remaining <= 0) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dueDate) < today
}

// ═══════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════
export default function CuentasPage() {
  const supabase = createClient()

  // === Tab ===
  const [activeTab, setActiveTab] = useState<TabKey>("por_cobrar")

  // === Data ===
  const [receivables, setReceivables] = useState<CxCExpanded[]>([])
  const [payables, setPayables] = useState<CxPExpanded[]>([])
  const [loadingCxC, setLoadingCxC] = useState(true)
  const [loadingCxP, setLoadingCxP] = useState(true)

  // === Filters CxC ===
  const [searchCxC, setSearchCxC] = useState("")
  const debouncedSearchCxC = useDebounce(searchCxC, 250)
  const [statusFilterCxC, setStatusFilterCxC] = useState("all")

  // === Filters CxP ===
  const [searchCxP, setSearchCxP] = useState("")
  const debouncedSearchCxP = useDebounce(searchCxP, 250)
  const [statusFilterCxP, setStatusFilterCxP] = useState("all")

  // === Dialog ===
  const [showPayment, setShowPayment] = useState(false)
  const [paymentType, setPaymentType] = useState<"receivable" | "payable">("receivable")
  const [selectedCxC, setSelectedCxC] = useState<CxCExpanded | null>(null)
  const [selectedCxP, setSelectedCxP] = useState<CxPExpanded | null>(null)

  // ═══════════════════════════════════════════════════════════
  // Fetch CxC
  // ═══════════════════════════════════════════════════════════
  const fetchReceivables = useCallback(async () => {
    setLoadingCxC(true)

    const { data, error } = await supabase
      .from("accounts_receivable")
      .select(`
        *,
        client:clients(full_name),
        sale:sales(invoice_number)
      `)
      .order("created_at", { ascending: false })

    if (error) console.error("Error cargando CxC:", error)
    if (data) setReceivables(data as unknown as CxCExpanded[])
    setLoadingCxC(false)
  }, [supabase])

  // ═══════════════════════════════════════════════════════════
  // Fetch CxP
  // ═══════════════════════════════════════════════════════════
  const fetchPayables = useCallback(async () => {
    setLoadingCxP(true)

    const { data, error } = await supabase
      .from("accounts_payable")
      .select(`
        *,
        supplier:suppliers(name),
        expense:expenses(concept)
      `)
      .order("created_at", { ascending: false })

    if (error) console.error("Error cargando CxP:", error)
    if (data) setPayables(data as unknown as CxPExpanded[])
    setLoadingCxP(false)
  }, [supabase])

  // ═══════════════════════════════════════════════════════════
  // Effects
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    fetchReceivables()
    fetchPayables()
  }, [fetchReceivables, fetchPayables])

  // ═══════════════════════════════════════════════════════════
  // Filtered data
  // El filtro de estado "overdue" usa la fecha real de vencimiento.
  // ═══════════════════════════════════════════════════════════
  const filteredCxC = useMemo(() => {
    return receivables.filter((r) => {
      if (debouncedSearchCxC) {
        const q = debouncedSearchCxC.toLowerCase()
        const matchClient = r.client?.full_name?.toLowerCase().includes(q)
        const matchInvoice = r.sale?.invoice_number?.toLowerCase().includes(q)
        if (!matchClient && !matchInvoice) return false
      }
      if (statusFilterCxC !== "all") {
        if (statusFilterCxC === "overdue") {
          if (!isOverdue(r.due_date, r.remaining_amount)) return false
        } else if (r.status !== statusFilterCxC) {
          return false
        }
      }
      return true
    })
  }, [receivables, debouncedSearchCxC, statusFilterCxC])

  const filteredCxP = useMemo(() => {
    return payables.filter((p) => {
      if (debouncedSearchCxP) {
        const q = debouncedSearchCxP.toLowerCase()
        const matchSupplier = p.supplier?.name?.toLowerCase().includes(q)
        const matchConcept = p.expense?.concept?.toLowerCase().includes(q)
        if (!matchSupplier && !matchConcept) return false
      }
      if (statusFilterCxP !== "all") {
        if (statusFilterCxP === "overdue") {
          if (!isOverdue(p.due_date, p.remaining_amount)) return false
        } else if (p.status !== statusFilterCxP) {
          return false
        }
      }
      return true
    })
  }, [payables, debouncedSearchCxP, statusFilterCxP])

  // ═══════════════════════════════════════════════════════════
  // Stats (memoizados)
  // ═══════════════════════════════════════════════════════════
  const {
    pendingCxC,
    pendingCxP,
    totalCxCPending,
    totalCxPPending,
    overdueCxCCount,
    overdueCxPCount,
  } = useMemo(() => {
    const pendingCxC = receivables.filter((r) => r.status !== "paid")
    const pendingCxP = payables.filter((p) => p.status !== "paid")
    return {
      pendingCxC,
      pendingCxP,
      totalCxCPending: pendingCxC.reduce((s, r) => s + r.remaining_amount, 0),
      totalCxPPending: pendingCxP.reduce((s, p) => s + p.remaining_amount, 0),
      overdueCxCCount: receivables.filter((r) => isOverdue(r.due_date, r.remaining_amount)).length,
      overdueCxPCount: payables.filter((p) => isOverdue(p.due_date, p.remaining_amount)).length,
    }
  }, [receivables, payables])

  // ═══════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════
  const handleAbonarCxC = useCallback((r: CxCExpanded) => {
    setSelectedCxC(r)
    setSelectedCxP(null)
    setPaymentType("receivable")
    setShowPayment(true)
  }, [])

  const handleAbonarCxP = useCallback((p: CxPExpanded) => {
    setSelectedCxP(p)
    setSelectedCxC(null)
    setPaymentType("payable")
    setShowPayment(true)
  }, [])

  const fetchAll = () => {
    fetchReceivables()
    fetchPayables()
  }

  // === Filtros activos / limpiar (por pestaña activa) ===
  const hasActiveFiltersCxC = !!searchCxC || statusFilterCxC !== "all"
  const hasActiveFiltersCxP = !!searchCxP || statusFilterCxP !== "all"
  const clearFiltersCxC = () => {
    setSearchCxC("")
    setStatusFilterCxC("all")
  }
  const clearFiltersCxP = () => {
    setSearchCxP("")
    setStatusFilterCxP("all")
  }

  // ═══════════════════════════════════════════════════════════
  // Columnas declarativas — compartidas entre CxC y CxP.
  // Una sola fábrica genérica evita duplicar el JSX de ambas tablas.
  // ═══════════════════════════════════════════════════════════
  function buildColumns<T extends CxCExpanded | CxPExpanded>(opts: {
    primaryHeader: string
    primaryValue: (row: T) => string
    secondaryHeader: string
    secondaryValue: (row: T) => string
    pendingTotal: number
    onAbonar: (row: T) => void
  }): Column<T>[] {
    return [
      {
        key: "primary",
        header: opts.primaryHeader,
        sortAccessor: (r) => opts.primaryValue(r),
        cell: (r) => {
          const overdue = isOverdue(r.due_date, r.remaining_amount)
          return (
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              {opts.primaryValue(r)}
              {overdue && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle size={13} className="text-error" />
                  </TooltipTrigger>
                  <TooltipContent>Cuenta vencida</TooltipContent>
                </Tooltip>
              )}
            </span>
          )
        },
      },
      {
        key: "secondary",
        header: opts.secondaryHeader,
        className: "text-muted-foreground hidden md:table-cell",
        sortAccessor: (r) => opts.secondaryValue(r),
        cell: (r) => opts.secondaryValue(r),
      },
      {
        key: "total",
        header: "Total",
        align: "right",
        sortAccessor: (r) => r.total_amount,
        cell: (r) => formatCOP(r.total_amount),
      },
      {
        key: "paid",
        header: "Pagado",
        align: "right",
        className: "hidden lg:table-cell",
        sortAccessor: (r) => r.paid_amount,
        cell: (r) => (
          <span className="font-medium text-success">{formatCOP(r.paid_amount)}</span>
        ),
      },
      {
        key: "remaining",
        header: "Pendiente",
        align: "right",
        sortAccessor: (r) => r.remaining_amount,
        cell: (r) => (
          <span className="font-medium text-error">{formatCOP(r.remaining_amount)}</span>
        ),
        footer: (
          <span className="text-error">{formatCOP(opts.pendingTotal)}</span>
        ),
      },
      {
        key: "progress",
        header: "Progreso",
        className: "w-[140px] hidden sm:table-cell",
        sortAccessor: (r) =>
          r.total_amount > 0 ? r.paid_amount / r.total_amount : 0,
        cell: (r) => {
          const pct = r.total_amount > 0
            ? Math.round((r.paid_amount / r.total_amount) * 100)
            : 0
          const isPaid = r.status === "paid" || r.remaining_amount <= 0
          return (
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full transition-all ${isPaid ? "bg-success" : "bg-gold"}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                {pct}%
              </span>
            </div>
          )
        },
      },
      {
        key: "due",
        header: "Vence",
        sortAccessor: (r) => r.due_date ?? "",
        cell: (r) => {
          const overdue = isOverdue(r.due_date, r.remaining_amount)
          if (!r.due_date) return <span className="text-muted-foreground">—</span>
          return (
            <span className={overdue ? "font-semibold text-error" : "text-muted-foreground"}>
              {formatDateShort(r.due_date)}
            </span>
          )
        },
      },
      {
        key: "status",
        header: "Estado",
        align: "center",
        cell: (r) => {
          const overdue = isOverdue(r.due_date, r.remaining_amount)
          const status = overdue ? "overdue" : r.status
          return (
            <StatusBadge
              status={status as "pending" | "partial" | "paid" | "overdue"}
              label={ACCOUNT_STATUS_LABELS[status] || status}
            />
          )
        },
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (r) => {
          const isPaid = r.status === "paid" || r.remaining_amount <= 0
          if (isPaid) return null
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-gold hover:text-gold"
                    onClick={() => opts.onAbonar(r)}
                  >
                    <CreditCard size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Registrar abono</TooltipContent>
              </Tooltip>
            </div>
          )
        },
      },
    ]
  }

  const cxcPendingFilteredTotal = useMemo(
    () =>
      filteredCxC
        .filter((r) => r.status !== "paid")
        .reduce((s, r) => s + r.remaining_amount, 0),
    [filteredCxC]
  )
  const cxpPendingFilteredTotal = useMemo(
    () =>
      filteredCxP
        .filter((p) => p.status !== "paid")
        .reduce((s, p) => s + p.remaining_amount, 0),
    [filteredCxP]
  )

  const cxcColumns = useMemo<Column<CxCExpanded>[]>(
    () =>
      buildColumns<CxCExpanded>({
        primaryHeader: "Cliente",
        primaryValue: (r) => r.client?.full_name || "—",
        secondaryHeader: "Factura",
        secondaryValue: (r) => r.sale?.invoice_number || "—",
        pendingTotal: cxcPendingFilteredTotal,
        onAbonar: handleAbonarCxC,
      }),
    [cxcPendingFilteredTotal, handleAbonarCxC]
  )

  const cxpColumns = useMemo<Column<CxPExpanded>[]>(
    () =>
      buildColumns<CxPExpanded>({
        primaryHeader: "Proveedor",
        primaryValue: (p) => p.supplier?.name || "—",
        secondaryHeader: "Concepto",
        secondaryValue: (p) => p.expense?.concept || "—",
        pendingTotal: cxpPendingFilteredTotal,
        onAbonar: handleAbonarCxP,
      }),
    [cxpPendingFilteredTotal, handleAbonarCxP]
  )

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════
  return (
    <PageShell
      title="Cuentas"
      description="Cuentas por cobrar y por pagar"
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="CxC pendiente"
          value={totalCxCPending}
          icon="DollarSign"
          format="currency"
          borderColor="warning"
          delay={0}
          hint={`${pendingCxC.length} activa${pendingCxC.length !== 1 ? "s" : ""}${
            overdueCxCCount > 0 ? ` · ${overdueCxCCount} vencida${overdueCxCCount !== 1 ? "s" : ""}` : ""
          }`}
          active={activeTab === "por_cobrar"}
          onClick={() => setActiveTab("por_cobrar")}
        />
        <StatCard
          label="CxP pendiente"
          value={totalCxPPending}
          icon="TrendingDown"
          format="currency"
          borderColor="error"
          delay={1}
          hint={`${pendingCxP.length} activa${pendingCxP.length !== 1 ? "s" : ""}${
            overdueCxPCount > 0 ? ` · ${overdueCxPCount} vencida${overdueCxPCount !== 1 ? "s" : ""}` : ""
          }`}
          active={activeTab === "por_pagar"}
          onClick={() => setActiveTab("por_pagar")}
        />
        <StatCard
          label="Balance neto"
          value={Math.abs(totalCxCPending - totalCxPPending)}
          icon="Wallet"
          format="currency"
          borderColor={totalCxCPending - totalCxPPending >= 0 ? "success" : "error"}
          delay={2}
          hint={totalCxCPending - totalCxPPending >= 0 ? "A favor (nos deben más)" : "En contra (debemos más)"}
        />
        <StatCard
          label="Cuentas vencidas"
          value={overdueCxCCount + overdueCxPCount}
          icon="TrendingDown"
          format="number"
          borderColor="error"
          delay={3}
          hint={`${overdueCxCCount} por cobrar · ${overdueCxPCount} por pagar`}
        />
      </div>

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-lg bg-cream p-1">
        <button
          onClick={() => setActiveTab("por_cobrar")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "por_cobrar"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Por Cobrar
          {pendingCxC.length > 0 && (
            <span className="ml-2 rounded-full bg-warning/10 px-1.5 py-0.5 text-xs font-semibold text-warning">
              {pendingCxC.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("por_pagar")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "por_pagar"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Por Pagar
          {pendingCxP.length > 0 && (
            <span className="ml-2 rounded-full bg-error/10 px-1.5 py-0.5 text-xs font-semibold text-error">
              {pendingCxP.length}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: POR COBRAR (CxC)                                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "por_cobrar" && (
        <div className="space-y-4">
          <FilterBar
            search={
              <SearchInput
                value={searchCxC}
                onValueChange={setSearchCxC}
                placeholder="Buscar cliente, factura..."
                wrapperClassName="max-w-xs"
              />
            }
            hasActiveFilters={hasActiveFiltersCxC}
            onClear={clearFiltersCxC}
          >
            <Select value={statusFilterCxC} onValueChange={setStatusFilterCxC}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="partial">Parciales</SelectItem>
                <SelectItem value="paid">Pagadas</SelectItem>
                <SelectItem value="overdue">Vencidas</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>

          <DataTable
            data={filteredCxC}
            columns={cxcColumns}
            rowKey={(r) => r.id}
            loading={loadingCxC}
            isFiltered={hasActiveFiltersCxC}
            pageSize={25}
            showFooter
            empty={{
              icon: ClipboardList,
              title: "Sin cuentas por cobrar",
              description: "Las cuentas por cobrar se crean al registrar ventas a crédito.",
            }}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: POR PAGAR (CxP)                                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "por_pagar" && (
        <div className="space-y-4">
          <FilterBar
            search={
              <SearchInput
                value={searchCxP}
                onValueChange={setSearchCxP}
                placeholder="Buscar proveedor, concepto..."
                wrapperClassName="max-w-xs"
              />
            }
            hasActiveFilters={hasActiveFiltersCxP}
            onClear={clearFiltersCxP}
          >
            <Select value={statusFilterCxP} onValueChange={setStatusFilterCxP}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="partial">Parciales</SelectItem>
                <SelectItem value="paid">Pagadas</SelectItem>
                <SelectItem value="overdue">Vencidas</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>

          <DataTable
            data={filteredCxP}
            columns={cxpColumns}
            rowKey={(p) => p.id}
            loading={loadingCxP}
            isFiltered={hasActiveFiltersCxP}
            pageSize={25}
            showFooter
            empty={{
              icon: ClipboardList,
              title: "Sin cuentas por pagar",
              description: "Las cuentas por pagar se crean al registrar un gasto con la opción activada.",
            }}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIALOG                                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <PaymentDialog
        open={showPayment}
        onOpenChange={setShowPayment}
        type={paymentType}
        receivable={selectedCxC}
        payable={selectedCxP}
        onCompleted={fetchAll}
      />
    </PageShell>
  )
}
