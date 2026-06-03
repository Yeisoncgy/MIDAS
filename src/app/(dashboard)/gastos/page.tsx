"use client"

import { Suspense, useEffect, useState, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import {
  TrendingDown,
  Plus,
  Download,
  Pencil,
  Trash2,
  CreditCard,
  List,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { PageShell } from "@/components/shared/page-shell"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { SearchInput } from "@/components/shared/search-input"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
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
import { formatCOP, formatDateShort } from "@/lib/format"
import { useDebounce } from "@/hooks/use-debounce"
import { PAYMENT_METHODS } from "@/lib/constants"
import { type PeriodKey, toLocalDate, getDateRange } from "@/lib/date-periods"
import type { Expense, ExpenseCategory } from "@/lib/types"
import { PeriodSelector } from "@/components/shared/period-selector"
import { ExpenseFormDialog } from "./expense-form-dialog"
import { APPaymentDialog, type AccountPayableExpanded } from "./ap-payment-dialog"
import { exportExpensesToExcel, type ExpenseForExport } from "./export-expenses"

// ═══════════════════════════════════════════════════════════
// Tabs
// ═══════════════════════════════════════════════════════════
type TabKey = "gastos" | "cuentas_por_pagar"

// ═══════════════════════════════════════════════════════════
// Expanded types (con joins)
// ═══════════════════════════════════════════════════════════
type ExpenseExpanded = Omit<Expense, "category" | "supplier"> & {
  category?: ExpenseCategory
  supplier?: { name: string }
}

const AP_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  partial: "Parcial",
  paid: "Pagada",
  overdue: "Vencida",
}

// ═══════════════════════════════════════════════════════════
// Page Component (interno) — envuelto en <Suspense> por useSearchParams
// ═══════════════════════════════════════════════════════════
function GastosPageInner() {
  const supabase = createClient()
  const params = useSearchParams()

  // === Tab ===
  const [activeTab, setActiveTab] = useState<TabKey>("gastos")

  // === Periodo ===
  const [period, setPeriod] = useState<PeriodKey>("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  // === Data ===
  const [expenses, setExpenses] = useState<ExpenseExpanded[]>([])
  const [accounts, setAccounts] = useState<AccountPayableExpanded[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loadingExpenses, setLoadingExpenses] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(true)

  // === Filtros gastos ===
  const [searchExpense, setSearchExpense] = useState("")
  const debouncedExpenseSearch = useDebounce(searchExpense, 250)
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all")

  // === Filtros AP ===
  const [searchAP, setSearchAP] = useState("")
  const debouncedAPSearch = useDebounce(searchAP, 250)
  const [statusFilter, setStatusFilter] = useState("all")

  // === Dialogs ===
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [showAPPayment, setShowAPPayment] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<AccountPayableExpanded | null>(null)
  const [expenseToDelete, setExpenseToDelete] = useState<ExpenseExpanded | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ═══════════════════════════════════════════════════════════
  // Fetch categories
  // ═══════════════════════════════════════════════════════════
  const fetchCategories = useCallback(async () => {
    const { data } = await supabase
      .from("expense_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
    if (data) setCategories(data as ExpenseCategory[])
  }, [supabase])

  // ═══════════════════════════════════════════════════════════
  // Fetch expenses
  // ═══════════════════════════════════════════════════════════
  const fetchExpenses = useCallback(async () => {
    setLoadingExpenses(true)

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
      .from("expenses")
      .select(`
        *,
        category:expense_categories(*),
        supplier:suppliers(name)
      `)
      .order("expense_date", { ascending: false })

    if (dateFrom) query = query.gte("expense_date", dateFrom)
    if (dateTo) query = query.lt("expense_date", dateTo)

    const { data, error } = await query

    if (!error && data) {
      setExpenses(data as unknown as ExpenseExpanded[])
    }

    setLoadingExpenses(false)
  }, [supabase, period, customFrom, customTo])

  // ═══════════════════════════════════════════════════════════
  // Fetch accounts payable
  // ═══════════════════════════════════════════════════════════
  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true)

    const { data } = await supabase
      .from("accounts_payable")
      .select(`
        *,
        supplier:suppliers(name),
        expense:expenses(concept)
      `)
      .order("created_at", { ascending: false })

    if (data) {
      setAccounts(data as unknown as AccountPayableExpanded[])
    }

    setLoadingAccounts(false)
  }, [supabase])

  // ═══════════════════════════════════════════════════════════
  // Effects
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    fetchCategories()
    fetchAccounts()
  }, [fetchCategories, fetchAccounts])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  // Intent de creación desde el command palette (?nuevo=1)
  useEffect(() => {
    if (params.get("nuevo") === "1") {
      setSelectedExpense(null)
      setShowExpenseForm(true)
    }
  }, [params])

  // ═══════════════════════════════════════════════════════════
  // Filtered data
  // ═══════════════════════════════════════════════════════════
  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      if (debouncedExpenseSearch) {
        const q = debouncedExpenseSearch.toLowerCase()
        const matchConcept = exp.concept.toLowerCase().includes(q)
        const matchSupplier = exp.supplier?.name?.toLowerCase().includes(q)
        const matchInvoice = exp.supplier_invoice_number?.toLowerCase().includes(q)
        if (!matchConcept && !matchSupplier && !matchInvoice) return false
      }
      if (categoryFilter !== "all" && exp.category_id !== categoryFilter) return false
      if (paymentMethodFilter !== "all" && exp.payment_method !== paymentMethodFilter) return false
      return true
    })
  }, [expenses, debouncedExpenseSearch, categoryFilter, paymentMethodFilter])

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (debouncedAPSearch) {
        const q = debouncedAPSearch.toLowerCase()
        const matchSupplier = acc.supplier?.name?.toLowerCase().includes(q)
        const matchConcept = acc.expense?.concept?.toLowerCase().includes(q)
        if (!matchSupplier && !matchConcept) return false
      }
      if (statusFilter !== "all" && acc.status !== statusFilter) return false
      return true
    })
  }, [accounts, debouncedAPSearch, statusFilter])

  // ═══════════════════════════════════════════════════════════
  // Stats (memoizados) — coherentes con el periodo y filtros activos
  // ═══════════════════════════════════════════════════════════
  const totalGastos = useMemo(
    () => filteredExpenses.reduce((s, e) => s + e.amount, 0),
    [filteredExpenses]
  )
  const numGastos = filteredExpenses.length

  // CxP pendientes — no dependen del periodo de gastos (deuda viva total)
  const apPendingAccounts = useMemo(
    () => accounts.filter((a) => a.status !== "paid"),
    [accounts]
  )
  const apPendingTotal = useMemo(
    () => apPendingAccounts.reduce((s, a) => s + a.remaining_amount, 0),
    [apPendingAccounts]
  )

  const categoryTop = useMemo(() => {
    const totals: Record<string, number> = {}
    filteredExpenses.forEach((e) => {
      const name = e.category?.name || "Otros"
      totals[name] = (totals[name] || 0) + e.amount
    })
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
    return sorted[0]?.[0] || "—"
  }, [filteredExpenses])

  // ═══════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════
  const handleEditExpense = (exp: ExpenseExpanded) => {
    setSelectedExpense(exp as unknown as Expense)
    setShowExpenseForm(true)
  }

  const handleNewExpense = () => {
    setSelectedExpense(null)
    setShowExpenseForm(true)
  }

  // Eliminación con confirmación (antes borraba al instante)
  const handleConfirmDelete = async () => {
    if (!expenseToDelete) return
    setDeleting(true)
    const { error } = await supabase.from("expenses").delete().eq("id", expenseToDelete.id)
    if (error) {
      toast.error("Error al eliminar gasto", { description: error.message })
    } else {
      toast.success("Gasto eliminado", { description: expenseToDelete.concept })
      setExpenseToDelete(null)
      fetchAll()
    }
    setDeleting(false)
  }

  const handleAbonar = (acc: AccountPayableExpanded) => {
    setSelectedAccount(acc)
    setShowAPPayment(true)
  }

  const handleExport = async () => {
    if (filteredExpenses.length === 0) {
      toast.error("No hay gastos para exportar")
      return
    }
    toast.promise(exportExpensesToExcel(filteredExpenses as ExpenseForExport[]), {
      loading: "Generando reporte...",
      success: "Reporte descargado",
      error: "Error al generar reporte",
    })
  }

  const fetchAll = () => {
    fetchExpenses()
    fetchAccounts()
  }

  // === Filtros activos ===
  const hasExpenseFilters =
    !!searchExpense || categoryFilter !== "all" || paymentMethodFilter !== "all"
  const clearExpenseFilters = () => {
    setSearchExpense("")
    setCategoryFilter("all")
    setPaymentMethodFilter("all")
  }

  const hasAPFilters = !!searchAP || statusFilter !== "all"
  const clearAPFilters = () => {
    setSearchAP("")
    setStatusFilter("all")
  }

  // ═══════════════════════════════════════════════════════════
  // Columnas: Gastos
  // ═══════════════════════════════════════════════════════════
  const expenseColumns = useMemo<Column<ExpenseExpanded>[]>(
    () => [
      {
        key: "date",
        header: "Fecha",
        className: "w-[110px]",
        sortAccessor: (e) => e.expense_date,
        cell: (exp) => (
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatDateShort(exp.expense_date)}
          </span>
        ),
      },
      {
        key: "concept",
        header: "Concepto",
        sortAccessor: (e) => e.concept,
        cell: (exp) => (
          <div>
            <p className="text-sm font-medium text-foreground">{exp.concept}</p>
            {exp.supplier?.name && (
              <p className="text-xs text-muted-foreground">{exp.supplier.name}</p>
            )}
          </div>
        ),
      },
      {
        key: "category",
        header: "Categoría",
        className: "w-[150px]",
        sortAccessor: (e) => e.category?.name ?? "",
        cell: (exp) =>
          exp.category ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: exp.category.color }}
              />
              {exp.category.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        key: "amount",
        header: "Monto",
        align: "right",
        className: "w-[130px]",
        sortAccessor: (e) => e.amount,
        cell: (exp) => (
          <span className="font-semibold text-gold">{formatCOP(exp.amount)}</span>
        ),
        footer: formatCOP(totalGastos),
      },
      {
        key: "method",
        header: "Método",
        className: "hidden md:table-cell w-[120px]",
        sortAccessor: (e) => e.payment_method,
        cell: (exp) => (
          <span className="text-sm text-muted-foreground">
            {PAYMENT_METHODS.find((m) => m.value === exp.payment_method)?.label ||
              exp.payment_method}
          </span>
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        className: "w-[90px]",
        cell: (exp) => (
          <div
            className="flex items-center justify-end gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleEditExpense(exp)}
                >
                  <Pencil size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar gasto</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-error hover:text-error"
                  onClick={() => setExpenseToDelete(exp)}
                >
                  <Trash2 size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Eliminar gasto</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [totalGastos]
  )

  // ═══════════════════════════════════════════════════════════
  // Columnas: Cuentas por pagar
  // ═══════════════════════════════════════════════════════════
  const apTotalPendienteVisible = useMemo(
    () =>
      filteredAccounts
        .filter((a) => a.status !== "paid")
        .reduce((s, a) => s + a.remaining_amount, 0),
    [filteredAccounts]
  )

  const apColumns = useMemo<Column<AccountPayableExpanded>[]>(
    () => [
      {
        key: "supplier",
        header: "Proveedor",
        sortAccessor: (a) => a.supplier?.name ?? "",
        cell: (acc) => (
          <span className="text-sm font-medium text-foreground">
            {acc.supplier?.name || "—"}
          </span>
        ),
      },
      {
        key: "concept",
        header: "Concepto",
        className: "hidden md:table-cell",
        sortAccessor: (a) => a.expense?.concept ?? "",
        cell: (acc) => (
          <span className="text-sm text-muted-foreground">
            {acc.expense?.concept || "—"}
          </span>
        ),
      },
      {
        key: "total",
        header: "Total",
        align: "right",
        className: "w-[110px]",
        sortAccessor: (a) => a.total_amount,
        cell: (acc) => (
          <span className="text-sm tabular-nums">{formatCOP(acc.total_amount)}</span>
        ),
      },
      {
        key: "paid",
        header: "Pagado",
        align: "right",
        className: "hidden lg:table-cell w-[110px]",
        sortAccessor: (a) => a.paid_amount,
        cell: (acc) => (
          <span className="text-sm font-medium tabular-nums text-success">
            {formatCOP(acc.paid_amount)}
          </span>
        ),
      },
      {
        key: "remaining",
        header: "Pendiente",
        align: "right",
        className: "w-[120px]",
        sortAccessor: (a) => a.remaining_amount,
        cell: (acc) => (
          <span className="text-sm font-semibold tabular-nums text-error">
            {formatCOP(acc.remaining_amount)}
          </span>
        ),
        footer: formatCOP(apTotalPendienteVisible),
      },
      {
        key: "progress",
        header: "Progreso",
        className: "hidden md:table-cell w-[130px]",
        sortAccessor: (a) =>
          a.total_amount > 0 ? a.paid_amount / a.total_amount : 0,
        cell: (acc) => {
          const pct =
            acc.total_amount > 0
              ? Math.round((acc.paid_amount / acc.total_amount) * 100)
              : 0
          const isPaid = acc.status === "paid"
          return (
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full transition-all ${
                    isPaid ? "bg-success" : "bg-gold"
                  }`}
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
        className: "hidden lg:table-cell w-[100px]",
        sortAccessor: (a) => a.due_date ?? "",
        cell: (acc) => (
          <span className="text-sm text-muted-foreground tabular-nums">
            {acc.due_date ? formatDateShort(acc.due_date) : "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Estado",
        align: "center",
        className: "w-[100px]",
        cell: (acc) => (
          <StatusBadge
            status={acc.status as "pending" | "partial" | "paid" | "overdue"}
            label={AP_STATUS_LABEL[acc.status] || acc.status}
          />
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        className: "w-[70px]",
        cell: (acc) => {
          if (acc.status === "paid") return null
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-gold hover:text-gold"
                    onClick={() => handleAbonar(acc)}
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
    ],
    [apTotalPendienteVisible]
  )

  // ═══════════════════════════════════════════════════════════
  // Loading inicial (primera carga)
  // ═══════════════════════════════════════════════════════════
  if (loadingExpenses && expenses.length === 0 && loadingAccounts && accounts.length === 0) {
    return <PageSkeleton stats={4} rows={8} cols={6} />
  }

  const apPendingCount = apPendingAccounts.length

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════
  return (
    <PageShell
      title="Gastos"
      description="Control de gastos y cuentas por pagar"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download size={16} className="mr-1.5" />
            Descargar reporte
          </Button>
          <Button size="sm" onClick={handleNewExpense}>
            <Plus size={16} className="mr-1.5" />
            Registrar gasto
          </Button>
        </>
      }
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total gastos"
          value={totalGastos}
          icon="TrendingDown"
          format="currency"
          borderColor="error"
          delay={0}
          hint={categoryTop !== "—" && numGastos > 0 ? `Mayor: ${categoryTop}` : undefined}
        />
        <StatCard
          label="# Gastos"
          value={numGastos}
          icon="ShoppingCart"
          format="number"
          borderColor="gold"
          delay={1}
        />
        <StatCard
          label="CxP pendientes"
          value={apPendingTotal}
          icon="Banknote"
          format="currency"
          borderColor="warning"
          delay={2}
          hint={`${apPendingCount} cuenta${apPendingCount !== 1 ? "s" : ""}`}
          active={activeTab === "cuentas_por_pagar"}
          onClick={() => setActiveTab("cuentas_por_pagar")}
        />
        <StatCard
          label="# Cuentas CxP"
          value={apPendingCount}
          icon="DollarSign"
          format="number"
          borderColor="info"
          delay={3}
        />
      </div>

      {/* Tabs */}
      <div className="flex w-fit items-center gap-1 rounded-lg bg-cream p-1">
        <button
          onClick={() => setActiveTab("gastos")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "gastos"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <List size={15} />
          Gastos
        </button>
        <button
          onClick={() => setActiveTab("cuentas_por_pagar")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "cuentas_por_pagar"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Wallet size={15} />
          Cuentas por Pagar
          {apPendingCount > 0 && (
            <span className="ml-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-xs font-semibold text-warning">
              {apPendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: GASTOS                                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "gastos" && (
        <div className="space-y-4">
          <PeriodSelector
            selectedPeriod={period}
            onPeriodChange={setPeriod}
            customFrom={customFrom}
            onCustomFromChange={setCustomFrom}
            customTo={customTo}
            onCustomToChange={setCustomTo}
          />

          <FilterBar
            search={
              <SearchInput
                value={searchExpense}
                onValueChange={setSearchExpense}
                placeholder="Buscar concepto, proveedor..."
                wrapperClassName="max-w-xs"
              />
            }
            hasActiveFilters={hasExpenseFilters}
            onClear={clearExpenseFilters}
          >
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
              <SelectTrigger className="h-9 w-[160px]">
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
            data={filteredExpenses}
            columns={expenseColumns}
            rowKey={(e) => e.id}
            loading={loadingExpenses}
            onRowClick={handleEditExpense}
            isFiltered={hasExpenseFilters}
            pageSize={25}
            showFooter
            empty={{
              icon: TrendingDown,
              title: "Sin gastos en este periodo",
              description: "Registra un gasto para comenzar a llevar el control.",
              action: (
                <Button size="sm" onClick={handleNewExpense}>
                  <Plus size={16} className="mr-1.5" />
                  Registrar gasto
                </Button>
              ),
            }}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: CUENTAS POR PAGAR                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "cuentas_por_pagar" && (
        <div className="space-y-4">
          <FilterBar
            search={
              <SearchInput
                value={searchAP}
                onValueChange={setSearchAP}
                placeholder="Buscar proveedor, concepto..."
                wrapperClassName="max-w-xs"
              />
            }
            hasActiveFilters={hasAPFilters}
            onClear={clearAPFilters}
          >
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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
            data={filteredAccounts}
            columns={apColumns}
            rowKey={(a) => a.id}
            loading={loadingAccounts}
            isFiltered={hasAPFilters}
            pageSize={25}
            showFooter
            empty={{
              icon: CreditCard,
              title: "Sin cuentas por pagar",
              description:
                "Las cuentas por pagar se crean al registrar un gasto con la opción activada.",
            }}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIALOGS                                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <ExpenseFormDialog
        open={showExpenseForm}
        onOpenChange={setShowExpenseForm}
        expense={selectedExpense}
        onCompleted={fetchAll}
      />

      <APPaymentDialog
        open={showAPPayment}
        onOpenChange={setShowAPPayment}
        account={selectedAccount}
        onPaymentRegistered={fetchAll}
      />

      <ConfirmDialog
        open={!!expenseToDelete}
        onOpenChange={(open) => !open && setExpenseToDelete(null)}
        title="Eliminar gasto"
        description={
          expenseToDelete
            ? `Se eliminará "${expenseToDelete.concept}" (${formatCOP(
                expenseToDelete.amount
              )}). Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar"
        variant="destructive"
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </PageShell>
  )
}

// ═══════════════════════════════════════════════════════════
// Default export — envuelve en <Suspense> por useSearchParams (Next 16)
// ═══════════════════════════════════════════════════════════
export default function GastosPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={4} rows={8} cols={6} />}>
      <GastosPageInner />
    </Suspense>
  )
}
