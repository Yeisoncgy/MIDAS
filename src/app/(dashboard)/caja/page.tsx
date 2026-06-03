"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import {
  Landmark,
  Banknote,
  Building2,
  Smartphone,
  Wallet,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Pencil,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { StatusBadge } from "@/components/shared/status-badge"
import { PageShell } from "@/components/shared/page-shell"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { SearchInput } from "@/components/shared/search-input"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCOP, formatDateTime } from "@/lib/format"
import { useDebounce } from "@/hooks/use-debounce"
import { type PeriodKey, toLocalDate, getDateRange } from "@/lib/date-periods"
import type {
  CashBankAccount,
  CashMovementType,
  AccountType,
  MovementExpanded,
} from "@/lib/types"
import { PeriodSelector } from "@/components/shared/period-selector"
import { MovementFormDialog } from "./movement-form-dialog"
import { AccountFormDialog } from "./account-form-dialog"

type TabKey = "movimientos" | "cuentas"

const MOVEMENT_CONFIG: Record<
  CashMovementType,
  { label: string; color: string; sign: string; icon: typeof ArrowDownLeft }
> = {
  in: { label: "Ingreso", color: "bg-success/10 text-success", sign: "+", icon: ArrowDownLeft },
  out: { label: "Egreso", color: "bg-error/10 text-error", sign: "−", icon: ArrowUpRight },
  transfer: { label: "Transferencia", color: "bg-info/10 text-info", sign: "↔", icon: ArrowRightLeft },
}

const ACCOUNT_TYPE_CONFIG: Record<
  AccountType,
  { label: string; icon: typeof Banknote; borderColor: string; chip: string }
> = {
  cash: { label: "Efectivo", icon: Banknote, borderColor: "border-l-success", chip: "bg-success/10 text-success" },
  bank: { label: "Banco", icon: Building2, borderColor: "border-l-info", chip: "bg-info/10 text-info" },
  digital: { label: "Digital", icon: Smartphone, borderColor: "border-l-warning", chip: "bg-warning/10 text-warning" },
}

export default function CajaPage() {
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<TabKey>("movimientos")

  const [period, setPeriod] = useState<PeriodKey>("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const [accounts, setAccounts] = useState<CashBankAccount[]>([])
  const [movements, setMovements] = useState<MovementExpanded[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [loadingMovements, setLoadingMovements] = useState(true)

  const [searchMovement, setSearchMovement] = useState("")
  const debouncedSearch = useDebounce(searchMovement, 250)
  const [accountFilter, setAccountFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  const [showMovementForm, setShowMovementForm] = useState(false)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<CashBankAccount | null>(null)
  const [movementToVoid, setMovementToVoid] = useState<MovementExpanded | null>(null)
  const [voiding, setVoiding] = useState(false)

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    const { data, error } = await supabase
      .from("cash_bank_accounts")
      .select("*")
      .order("created_at")

    if (error) {
      console.error("Error cargando cuentas:", error)
      toast.error("Error al cargar cuentas")
    }
    if (data) setAccounts(data as CashBankAccount[])
    setLoadingAccounts(false)
  }, [supabase])

  const fetchMovements = useCallback(async () => {
    setLoadingMovements(true)

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
      .from("cash_bank_movements")
      .select(`*, account:cash_bank_accounts(name, type)`)
      .order("created_at", { ascending: false })

    if (dateFrom) query = query.gte("created_at", dateFrom)
    if (dateTo) query = query.lt("created_at", dateTo)

    const { data, error } = await query
    if (error) console.error("Error cargando movimientos:", error)
    if (data) setMovements(data as unknown as MovementExpanded[])
    setLoadingMovements(false)
  }, [supabase, period, customFrom, customTo])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  useEffect(() => {
    fetchMovements()
  }, [fetchMovements])

  const filteredMovements = useMemo(() => {
    return movements.filter((mov) => {
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        const matchConcept = mov.concept.toLowerCase().includes(q)
        const matchAccount = mov.account?.name?.toLowerCase().includes(q)
        if (!matchConcept && !matchAccount) return false
      }
      if (accountFilter !== "all" && mov.account_id !== accountFilter) return false
      if (typeFilter !== "all" && mov.movement_type !== typeFilter) return false
      return true
    })
  }, [movements, debouncedSearch, accountFilter, typeFilter])

  const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts])
  const totalBalance = useMemo(
    () => activeAccounts.reduce((s, a) => s + a.balance, 0),
    [activeAccounts]
  )

  const { totalIngresos, totalEgresos } = useMemo(
    () => ({
      totalIngresos: filteredMovements
        .filter((m) => m.movement_type === "in")
        .reduce((s, m) => s + m.amount, 0),
      totalEgresos: filteredMovements
        .filter((m) => m.movement_type === "out")
        .reduce((s, m) => s + m.amount, 0),
    }),
    [filteredMovements]
  )

  const hasActiveFilters =
    !!searchMovement || accountFilter !== "all" || typeFilter !== "all"
  const clearFilters = () => {
    setSearchMovement("")
    setAccountFilter("all")
    setTypeFilter("all")
  }

  const handleNewAccount = () => {
    setSelectedAccount(null)
    setShowAccountForm(true)
  }
  const handleEditAccount = (acc: CashBankAccount) => {
    setSelectedAccount(acc)
    setShowAccountForm(true)
  }
  const fetchAll = () => {
    fetchAccounts()
    fetchMovements()
  }

  const handleVoidMovement = async () => {
    if (!movementToVoid) return
    setVoiding(true)
    const { error } = await supabase.rpc("void_cash_movement", {
      p_movement_id: movementToVoid.id,
    })
    if (error) {
      toast.error("No se pudo anular el movimiento", { description: error.message })
    } else {
      toast.success("Movimiento anulado y balance revertido")
      setMovementToVoid(null)
      fetchAll()
    }
    setVoiding(false)
  }

  // === Columnas movimientos ===
  const movementColumns = useMemo<Column<MovementExpanded>[]>(
    () => [
      {
        key: "date",
        header: "Fecha",
        sortAccessor: (m) => m.created_at,
        className: "w-[160px]",
        cell: (mov) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDateTime(mov.created_at)}
          </span>
        ),
      },
      {
        key: "concept",
        header: "Concepto",
        sortAccessor: (m) => m.concept,
        cell: (mov) => (
          <div>
            <p className="text-sm font-medium text-foreground">{mov.concept}</p>
            {mov.transfer_to_account_id && (
              <p className="text-xs text-muted-foreground">Transferencia entre cuentas</p>
            )}
          </div>
        ),
      },
      {
        key: "account",
        header: "Cuenta",
        sortAccessor: (m) => m.account?.name ?? "",
        cell: (mov) => mov.account?.name || "—",
      },
      {
        key: "type",
        header: "Tipo",
        align: "center",
        cell: (mov) => {
          const config = MOVEMENT_CONFIG[mov.movement_type]
          const MovIcon = config.icon
          return (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${config.color}`}
            >
              <MovIcon size={12} />
              {config.label}
            </span>
          )
        },
      },
      {
        key: "amount",
        header: "Monto",
        align: "right",
        sortAccessor: (m) => m.amount,
        cell: (mov) => {
          const config = MOVEMENT_CONFIG[mov.movement_type]
          return (
            <span
              className={`font-semibold ${
                mov.movement_type === "in"
                  ? "text-success"
                  : mov.movement_type === "out"
                  ? "text-error"
                  : "text-info"
              }`}
            >
              {config.sign} {formatCOP(mov.amount)}
            </span>
          )
        },
      },
      {
        key: "balance",
        header: "Balance",
        align: "right",
        className: "hidden md:table-cell",
        cell: (mov) => (
          <span className="text-muted-foreground">{formatCOP(mov.new_balance)}</span>
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (mov) => {
          // Solo se pueden anular movimientos manuales (sin origen en otro módulo).
          // Los movimientos espejo de transferencia (reference_type 'transfer') tampoco
          // se anulan directamente: se anula el de salida que los origina.
          const isManual = !mov.reference_type
          if (!isManual) return null
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-error hover:text-error"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMovementToVoid(mov)
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Anular movimiento</TooltipContent>
            </Tooltip>
          )
        },
      },
    ],
    []
  )

  // === Columnas cuentas ===
  const accountColumns = useMemo<Column<CashBankAccount>[]>(
    () => [
      {
        key: "name",
        header: "Nombre",
        sortAccessor: (a) => a.name,
        cell: (acc) => {
          const config = ACCOUNT_TYPE_CONFIG[acc.type]
          const Icon = config.icon
          return (
            <div className="flex items-center gap-2.5">
              <div className={`flex size-8 items-center justify-center rounded-lg ${config.chip}`}>
                <Icon size={16} />
              </div>
              <span className="text-sm font-medium text-foreground">{acc.name}</span>
            </div>
          )
        },
      },
      {
        key: "type",
        header: "Tipo",
        cell: (acc) => {
          const config = ACCOUNT_TYPE_CONFIG[acc.type]
          return (
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${config.chip}`}>
              {config.label}
            </span>
          )
        },
      },
      {
        key: "balance",
        header: "Balance",
        align: "right",
        sortAccessor: (a) => a.balance,
        cell: (acc) => (
          <span className="font-semibold text-gold">{formatCOP(acc.balance)}</span>
        ),
        footer: formatCOP(totalBalance),
      },
      {
        key: "status",
        header: "Estado",
        align: "center",
        cell: (acc) => (
          <StatusBadge
            status={acc.is_active ? "active" : "inactive"}
            label={acc.is_active ? "Activa" : "Inactiva"}
          />
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (acc) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  handleEditAccount(acc)
                }}
              >
                <Pencil size={15} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Editar cuenta</TooltipContent>
          </Tooltip>
        ),
      },
    ],
    [totalBalance]
  )

  return (
    <PageShell
      title="Caja y Banco"
      description="Movimientos de efectivo y cuentas bancarias"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={handleNewAccount}>
            <Plus size={16} className="mr-1.5" />
            Nueva cuenta
          </Button>
          <Button size="sm" onClick={() => setShowMovementForm(true)}>
            <Plus size={16} className="mr-1.5" />
            Nuevo movimiento
          </Button>
        </>
      }
    >
      {/* Account Cards */}
      {loadingAccounts ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] w-full rounded-xl skeleton-shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Card className="relative border-l-[3px] border-l-gold bg-gradient-to-br from-gold/5 to-transparent p-4">
            <Wallet size={18} className="absolute right-3 top-3 text-gold/50" />
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Total consolidado
            </p>
            <p className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums text-gold md:text-2xl">
              {formatCOP(totalBalance)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {activeAccounts.length} cuenta{activeAccounts.length !== 1 ? "s" : ""} activa
              {activeAccounts.length !== 1 ? "s" : ""}
            </p>
          </Card>

          {activeAccounts.map((acc) => {
            const config = ACCOUNT_TYPE_CONFIG[acc.type]
            const Icon = config.icon
            return (
              <Card
                key={acc.id}
                className={`relative cursor-pointer border-l-[3px] ${config.borderColor} p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover`}
                onClick={() => handleEditAccount(acc)}
              >
                <Icon size={18} className="absolute right-3 top-3 text-muted-foreground/40" />
                <p className="mb-1 truncate pr-6 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                  {acc.name}
                </p>
                <p className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums text-gold md:text-xl">
                  {formatCOP(acc.balance)}
                </p>
                <span className={`mt-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${config.chip}`}>
                  {config.label}
                </span>
              </Card>
            )
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-lg bg-cream p-1">
        <button
          onClick={() => setActiveTab("movimientos")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "movimientos"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Movimientos
        </button>
        <button
          onClick={() => setActiveTab("cuentas")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "cuentas"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Cuentas
          <span className="ml-2 rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {accounts.length}
          </span>
        </button>
      </div>

      {/* TAB: MOVIMIENTOS */}
      {activeTab === "movimientos" && (
        <div className="space-y-4">
          <PeriodSelector
            selectedPeriod={period}
            onPeriodChange={setPeriod}
            customFrom={customFrom}
            onCustomFromChange={setCustomFrom}
            customTo={customTo}
            onCustomToChange={setCustomTo}
          />

          {/* Resumen ingresos/egresos/neto */}
          {filteredMovements.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <div className="flex items-center gap-1.5">
                <ArrowDownLeft size={14} className="text-success" />
                <span className="text-muted-foreground">Ingresos:</span>
                <span className="font-semibold tabular-nums text-success">{formatCOP(totalIngresos)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ArrowUpRight size={14} className="text-error" />
                <span className="text-muted-foreground">Egresos:</span>
                <span className="font-semibold tabular-nums text-error">{formatCOP(totalEgresos)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Neto:</span>
                <span
                  className={`font-semibold tabular-nums ${
                    totalIngresos - totalEgresos >= 0 ? "text-success" : "text-error"
                  }`}
                >
                  {totalIngresos - totalEgresos >= 0 ? "+" : ""}
                  {formatCOP(totalIngresos - totalEgresos)}
                </span>
              </div>
            </div>
          )}

          <FilterBar
            search={
              <SearchInput
                value={searchMovement}
                onValueChange={setSearchMovement}
                placeholder="Buscar concepto, cuenta..."
                wrapperClassName="max-w-xs"
              />
            }
            hasActiveFilters={hasActiveFilters}
            onClear={clearFilters}
          >
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Cuenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cuentas</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="in">Ingresos</SelectItem>
                <SelectItem value="out">Egresos</SelectItem>
                <SelectItem value="transfer">Transferencias</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>

          <DataTable
            data={filteredMovements}
            columns={movementColumns}
            rowKey={(m) => m.id}
            loading={loadingMovements}
            isFiltered={hasActiveFilters}
            pageSize={30}
            empty={{
              icon: Landmark,
              title: "Sin movimientos en este periodo",
              description: "Registra un movimiento para comenzar a llevar el control de caja.",
              action: (
                <Button size="sm" onClick={() => setShowMovementForm(true)}>
                  <Plus size={16} className="mr-1.5" />
                  Nuevo movimiento
                </Button>
              ),
            }}
          />
        </div>
      )}

      {/* TAB: CUENTAS */}
      {activeTab === "cuentas" && (
        <DataTable
          data={accounts}
          columns={accountColumns}
          rowKey={(a) => a.id}
          loading={loadingAccounts}
          onRowClick={handleEditAccount}
          showFooter
          empty={{
            icon: Landmark,
            title: "Sin cuentas registradas",
            description: "Crea una cuenta de efectivo, bancaria o digital para empezar.",
            action: (
              <Button size="sm" onClick={handleNewAccount}>
                <Plus size={16} className="mr-1.5" />
                Nueva cuenta
              </Button>
            ),
          }}
        />
      )}

      {/* Dialogs */}
      <MovementFormDialog
        open={showMovementForm}
        onOpenChange={setShowMovementForm}
        accounts={accounts}
        onCompleted={fetchAll}
      />

      <AccountFormDialog
        open={showAccountForm}
        onOpenChange={setShowAccountForm}
        account={selectedAccount}
        onCompleted={fetchAll}
      />

      <ConfirmDialog
        open={!!movementToVoid}
        onOpenChange={(open) => !open && setMovementToVoid(null)}
        title="Anular movimiento"
        description={
          movementToVoid
            ? `Se eliminará "${movementToVoid.concept}" (${formatCOP(
                movementToVoid.amount
              )}) y se revertirá el balance de la cuenta. Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Anular"
        variant="destructive"
        loading={voiding}
        onConfirm={handleVoidMovement}
      />
    </PageShell>
  )
}
