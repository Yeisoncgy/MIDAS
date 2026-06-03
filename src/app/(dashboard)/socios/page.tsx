"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Users,
  Plus,
  Banknote,
  Pencil,
  Trash2,
  AlertTriangle,
  FileSpreadsheet,
  History,
  Wallet,
  Receipt,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { PageShell } from "@/components/shared/page-shell"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { SearchInput } from "@/components/shared/search-input"
import { PageSkeleton } from "@/components/shared/skeletons"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCOP, formatDateShort } from "@/lib/format"
import { PAYMENT_METHODS } from "@/lib/constants"
import { useDebounce } from "@/hooks/use-debounce"
import { PeriodSelector } from "@/components/shared/period-selector"
import { type PeriodKey, getDateRange } from "@/lib/date-periods"
import { PartnerFormDialog } from "./partner-form-dialog"
import { WithdrawalFormDialog } from "./withdrawal-form-dialog"
import { DeleteWithdrawalDialog } from "./delete-withdrawal-dialog"
import { DeletePartnerDialog } from "./delete-partner-dialog"
import { exportWithdrawalsToExcel } from "./export-withdrawals"
import type { Partner, PartnerWithdrawal } from "@/lib/types"

type WithdrawalExpanded = PartnerWithdrawal & {
  partner?: { name: string }
}

type TabKey = "socios" | "retiros" | "historial"

interface MonthlyPartnerData {
  utilidad: number
  retirado: number
  disponible: number
}

interface MonthlyHistory {
  label: string
  from: string
  to: string
  ventas: number
  gastos: number
  utilidad: number
  partners: Record<string, MonthlyPartnerData>
}

function SociosPageInner() {
  const supabase = createClient()
  const searchParams = useSearchParams()

  // Data
  const [partners, setPartners] = useState<Partner[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalExpanded[]>([])
  const [utilidadMes, setUtilidadMes] = useState(0)
  const [retirosTotalMes, setRetirosTotalMes] = useState(0)

  // Historial
  const [historyData, setHistoryData] = useState<MonthlyHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Loading
  const [loadingPartners, setLoadingPartners] = useState(true)
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true)

  // UI
  const [activeTab, setActiveTab] = useState<TabKey>("socios")
  const [showPartnerForm, setShowPartnerForm] = useState(false)
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false)
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null)
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalExpanded | null>(null)
  const [showDeleteWithdrawal, setShowDeleteWithdrawal] = useState(false)
  const [showDeletePartner, setShowDeletePartner] = useState(false)

  // Filtros retiros
  const [searchWithdrawal, setSearchWithdrawal] = useState("")
  const debouncedSearch = useDebounce(searchWithdrawal, 250)
  const [partnerFilter, setPartnerFilter] = useState("all")
  const [methodFilter, setMethodFilter] = useState("all")

  // ═══ Período dinámico ═══
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const { dateFrom, dateTo } = useMemo(() => {
    if (selectedPeriod === "custom" && customFrom && customTo) {
      return { dateFrom: customFrom, dateTo: customTo }
    }
    const range = getDateRange(selectedPeriod)
    return { dateFrom: range.from, dateTo: range.to }
  }, [selectedPeriod, customFrom, customTo])

  // ═══ Fetch socios ═══
  const fetchPartners = useCallback(async () => {
    setLoadingPartners(true)
    const { data } = await supabase
      .from("partners")
      .select("*")
      .order("distribution_percentage", { ascending: false })

    if (data) setPartners(data as Partner[])
    setLoadingPartners(false)
  }, [supabase])

  // ═══ Fetch retiros del mes ═══
  const fetchWithdrawals = useCallback(async () => {
    setLoadingWithdrawals(true)
    const { data } = await supabase
      .from("partner_withdrawals")
      .select("*, partner:partners(name)")
      .gte("withdrawal_date", dateFrom)
      .lte("withdrawal_date", dateTo)
      .order("withdrawal_date", { ascending: false })

    if (data) {
      setWithdrawals(data as WithdrawalExpanded[])
      const total = data.reduce((sum: number, w: WithdrawalExpanded) => sum + w.amount, 0)
      setRetirosTotalMes(total)
    }
    setLoadingWithdrawals(false)
  }, [supabase, dateFrom, dateTo])

  // ═══ Fetch utilidad del mes ═══
  const fetchUtilidad = useCallback(async () => {
    // Ventas del mes
    const { data: salesData } = await supabase
      .from("sales")
      .select("total")
      .gte("sale_date", dateFrom)
      .lte("sale_date", dateTo)

    const ventasMes = (salesData || []).reduce((sum, s) => sum + s.total, 0)

    // Gastos del mes
    const { data: expData } = await supabase
      .from("expenses")
      .select("amount")
      .gte("expense_date", dateFrom)
      .lte("expense_date", dateTo)

    const gastosMes = (expData || []).reduce((sum, e) => sum + e.amount, 0)

    setUtilidadMes(ventasMes - gastosMes)
  }, [supabase, dateFrom, dateTo])

  // ═══ Fetch historial (últimos 6 meses) ═══
  const fetchHistory = useCallback(async () => {
    if (partners.length === 0) return
    setLoadingHistory(true)

    const now = new Date()
    const months: MonthlyHistory[] = []

    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const from = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-01`
      const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
      const to = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`
      const label = monthDate.toLocaleDateString("es-CO", { month: "short", year: "numeric" })

      // Ventas
      const { data: salesData } = await supabase
        .from("sales")
        .select("total")
        .gte("sale_date", from)
        .lt("sale_date", to)

      const ventas = (salesData || []).reduce((s, v) => s + v.total, 0)

      // Gastos
      const { data: expData } = await supabase
        .from("expenses")
        .select("amount")
        .gte("expense_date", from)
        .lt("expense_date", to)

      const gastos = (expData || []).reduce((s, e) => s + e.amount, 0)
      const utilidad = ventas - gastos

      // Retiros por socio en este mes
      const { data: wData } = await supabase
        .from("partner_withdrawals")
        .select("partner_id, amount")
        .gte("withdrawal_date", from)
        .lt("withdrawal_date", to)

      const retiroMap: Record<string, number> = {}
      for (const w of wData || []) {
        retiroMap[w.partner_id] = (retiroMap[w.partner_id] || 0) + w.amount
      }

      const partnersData: Record<string, MonthlyPartnerData> = {}
      for (const p of partners) {
        const util = utilidad * (p.distribution_percentage / 100)
        const ret = retiroMap[p.id] || 0
        partnersData[p.id] = { utilidad: util, retirado: ret, disponible: util - ret }
      }

      months.push({ label, from, to, ventas, gastos, utilidad, partners: partnersData })
    }

    setHistoryData(months)
    setLoadingHistory(false)
  }, [supabase, partners])

  // ═══ Retiros por socio (para calcular disponible) ═══
  const retirosPorSocio = useMemo(() => {
    const map: Record<string, number> = {}
    for (const w of withdrawals) {
      map[w.partner_id] = (map[w.partner_id] || 0) + w.amount
    }
    return map
  }, [withdrawals])

  // Utilidad disponible por socio
  const partnerUtilities = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of partners) {
      const utilidadProporcional = utilidadMes * (p.distribution_percentage / 100)
      const retirado = retirosPorSocio[p.id] || 0
      map[p.id] = utilidadProporcional - retirado
    }
    return map
  }, [partners, utilidadMes, retirosPorSocio])

  // ═══ Load ═══
  useEffect(() => {
    fetchPartners()
    fetchWithdrawals()
    fetchUtilidad()
  }, [fetchPartners, fetchWithdrawals, fetchUtilidad])

  const fetchAll = useCallback(() => {
    fetchPartners()
    fetchWithdrawals()
    fetchUtilidad()
    setHistoryData([])
  }, [fetchPartners, fetchWithdrawals, fetchUtilidad])

  // Cargar historial cuando se abre el tab
  useEffect(() => {
    if (activeTab === "historial" && historyData.length === 0) {
      fetchHistory()
    }
  }, [activeTab, historyData.length, fetchHistory])

  // ═══ Intent de creación (?nuevo=1 → registrar retiro) ═══
  useEffect(() => {
    if (searchParams.get("nuevo") === "1") {
      setSelectedWithdrawal(null)
      setSelectedPartner(null)
      setShowWithdrawalForm(true)
    }
  }, [searchParams])

  // ═══ Derived ═══
  const activePartners = useMemo(() => partners.filter((p) => p.is_active), [partners])
  const totalPercentage = useMemo(
    () => partners.reduce((s, p) => s + p.distribution_percentage, 0),
    [partners]
  )
  const utilidadDisponible = utilidadMes - retirosTotalMes

  // ═══ Handlers ═══
  const openNewWithdrawal = useCallback((partner?: Partner) => {
    setSelectedWithdrawal(null)
    setSelectedPartner(partner ?? null)
    setShowWithdrawalForm(true)
  }, [])

  const openNewPartner = useCallback(() => {
    setSelectedPartner(null)
    setShowPartnerForm(true)
  }, [])

  const openEditPartner = useCallback((p: Partner) => {
    setSelectedPartner(p)
    setShowPartnerForm(true)
  }, [])

  const openEditWithdrawal = useCallback((w: WithdrawalExpanded) => {
    setSelectedWithdrawal(w)
    setShowWithdrawalForm(true)
  }, [])

  const openDeleteWithdrawal = useCallback((w: WithdrawalExpanded) => {
    setSelectedWithdrawal(w)
    setShowDeleteWithdrawal(true)
  }, [])

  const openDeletePartner = useCallback((p: Partner) => {
    setSelectedPartner(p)
    setShowDeletePartner(true)
  }, [])

  // ═══ Filtrado de retiros ═══
  const filteredWithdrawals = useMemo(() => {
    let list = [...withdrawals]

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(
        (w) =>
          w.partner?.name?.toLowerCase().includes(q) ||
          w.notes?.toLowerCase().includes(q)
      )
    }

    if (partnerFilter !== "all") {
      list = list.filter((w) => w.partner_id === partnerFilter)
    }

    if (methodFilter !== "all") {
      list = list.filter((w) => w.method === methodFilter)
    }

    return list
  }, [withdrawals, debouncedSearch, partnerFilter, methodFilter])

  const filteredWithdrawalsTotal = useMemo(
    () => filteredWithdrawals.reduce((s, w) => s + w.amount, 0),
    [filteredWithdrawals]
  )

  const hasActiveFilters =
    !!searchWithdrawal || partnerFilter !== "all" || methodFilter !== "all"
  const clearFilters = () => {
    setSearchWithdrawal("")
    setPartnerFilter("all")
    setMethodFilter("all")
  }

  // ═══ Columnas: Retiros ═══
  const withdrawalColumns = useMemo<Column<WithdrawalExpanded>[]>(
    () => [
      {
        key: "date",
        header: "Fecha",
        className: "w-[120px]",
        sortAccessor: (w) => w.withdrawal_date,
        cell: (w) => (
          <span className="text-muted-foreground tabular-nums">
            {formatDateShort(w.withdrawal_date)}
          </span>
        ),
      },
      {
        key: "partner",
        header: "Socio",
        sortAccessor: (w) => w.partner?.name ?? "",
        cell: (w) => (
          <span className="font-medium text-foreground">{w.partner?.name || "—"}</span>
        ),
      },
      {
        key: "amount",
        header: "Monto",
        align: "right",
        sortAccessor: (w) => w.amount,
        cell: (w) => (
          <span className="font-semibold text-error">−{formatCOP(w.amount)}</span>
        ),
        footer: <span className="text-error">−{formatCOP(filteredWithdrawalsTotal)}</span>,
      },
      {
        key: "method",
        header: "Método",
        className: "hidden md:table-cell",
        sortAccessor: (w) => w.method,
        cell: (w) =>
          PAYMENT_METHODS.find((m) => m.value === w.method)?.label || w.method,
      },
      {
        key: "notes",
        header: "Notas",
        className: "hidden lg:table-cell max-w-[180px]",
        cell: (w) => (
          <span className="block truncate text-xs text-muted-foreground">
            {w.notes || "—"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (w) => (
          <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={() => openEditWithdrawal(w)}>
                  <Pencil size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar retiro</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-error hover:text-error"
                  onClick={() => openDeleteWithdrawal(w)}
                >
                  <Trash2 size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Eliminar retiro</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [filteredWithdrawalsTotal, openEditWithdrawal, openDeleteWithdrawal]
  )

  // ═══ Columnas: Socios (gestión) ═══
  const partnerColumns = useMemo<Column<Partner>[]>(
    () => [
      {
        key: "name",
        header: "Socio",
        sortAccessor: (p) => p.name,
        cell: (p) => (
          <span className={`font-medium ${p.is_active ? "text-foreground" : "text-muted-foreground"}`}>
            {p.name}
          </span>
        ),
      },
      {
        key: "percentage",
        header: "% Distribución",
        sortAccessor: (p) => p.distribution_percentage,
        cell: (p) => (
          <div className="flex items-center gap-2">
            <div className="w-20 overflow-hidden rounded-full bg-border h-1.5">
              <div
                className="h-full rounded-full bg-gold"
                style={{ width: `${Math.min(100, p.distribution_percentage)}%` }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {p.distribution_percentage}%
            </span>
          </div>
        ),
        footer: (
          <span className={totalPercentage > 100 ? "text-error" : "text-foreground"}>
            {totalPercentage}%
          </span>
        ),
      },
      {
        key: "utilidad",
        header: "Utilidad periodo",
        align: "right",
        className: "hidden md:table-cell",
        sortAccessor: (p) => utilidadMes * (p.distribution_percentage / 100),
        cell: (p) => (
          <span className="tabular-nums text-muted-foreground">
            {formatCOP(utilidadMes * (p.distribution_percentage / 100))}
          </span>
        ),
      },
      {
        key: "disponible",
        header: "Disponible",
        align: "right",
        sortAccessor: (p) => partnerUtilities[p.id] || 0,
        cell: (p) => {
          const disp = partnerUtilities[p.id] || 0
          return (
            <span
              className={`font-semibold tabular-nums ${
                disp > 0 ? "text-success" : disp < 0 ? "text-error" : "text-muted-foreground"
              }`}
            >
              {formatCOP(disp)}
            </span>
          )
        },
      },
      {
        key: "status",
        header: "Estado",
        align: "center",
        cell: (p) => <StatusBadge status={p.is_active ? "active" : "inactive"} />,
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (p) => (
          <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            {p.is_active && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" onClick={() => openNewWithdrawal(p)}>
                    <Banknote size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Registrar retiro</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={() => openEditPartner(p)}>
                  <Pencil size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar socio</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-error hover:text-error"
                  onClick={() => openDeletePartner(p)}
                >
                  <Trash2 size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Eliminar socio</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [
      totalPercentage,
      utilidadMes,
      partnerUtilities,
      openNewWithdrawal,
      openEditPartner,
      openDeletePartner,
    ]
  )

  // ═══ Columnas: Historial ═══
  const historyColumns = useMemo<Column<MonthlyHistory>[]>(() => {
    const base: Column<MonthlyHistory>[] = [
      {
        key: "month",
        header: "Mes",
        className: "capitalize font-medium",
        cell: (m) => <span className="capitalize">{m.label}</span>,
      },
      {
        key: "ventas",
        header: "Ventas",
        align: "right",
        sortAccessor: (m) => m.ventas,
        cell: (m) => <span className="tabular-nums">{formatCOP(m.ventas)}</span>,
      },
      {
        key: "gastos",
        header: "Gastos",
        align: "right",
        sortAccessor: (m) => m.gastos,
        cell: (m) => <span className="tabular-nums text-error">{formatCOP(m.gastos)}</span>,
      },
      {
        key: "utilidad",
        header: "Utilidad",
        align: "right",
        sortAccessor: (m) => m.utilidad,
        cell: (m) => (
          <span
            className={`font-semibold tabular-nums ${m.utilidad >= 0 ? "text-success" : "text-error"}`}
          >
            {formatCOP(m.utilidad)}
          </span>
        ),
      },
    ]

    const partnerCols: Column<MonthlyHistory>[] = activePartners.map((p) => ({
      key: `partner-${p.id}`,
      header: (
        <span>
          {p.name}{" "}
          <span className="font-normal normal-case text-muted-foreground">
            ({p.distribution_percentage}%)
          </span>
        </span>
      ),
      align: "center" as const,
      className: "min-w-[130px]",
      cell: (m: MonthlyHistory) => {
        const pd = m.partners[p.id]
        if (!pd) return <span className="text-xs text-muted-foreground">—</span>
        return (
          <div className="space-y-0.5">
            <p className="text-xs tabular-nums">{formatCOP(pd.utilidad)}</p>
            <p className="text-[10px] tabular-nums text-error">−{formatCOP(pd.retirado)}</p>
            <p
              className={`text-xs font-semibold tabular-nums ${pd.disponible >= 0 ? "text-success" : "text-error"}`}
            >
              {formatCOP(pd.disponible)}
            </p>
          </div>
        )
      },
    }))

    return [...base, ...partnerCols]
  }, [activePartners])

  if (loadingPartners && loadingWithdrawals && partners.length === 0) {
    return <PageSkeleton stats={4} rows={6} cols={5} />
  }

  return (
    <PageShell
      title="Socios"
      description="Distribución de utilidades y retiros entre socios"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportWithdrawalsToExcel(filteredWithdrawals, partners, utilidadMes)}
            disabled={filteredWithdrawals.length === 0}
          >
            <FileSpreadsheet size={16} className="mr-1.5" />
            Exportar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-gold/30 text-gold hover:bg-gold/5"
            onClick={() => openNewWithdrawal()}
          >
            <Banknote size={16} className="mr-1.5" />
            Registrar retiro
          </Button>
          <Button size="sm" onClick={openNewPartner}>
            <Plus size={16} className="mr-1.5" />
            Nuevo socio
          </Button>
        </>
      }
    >
      {/* Selector de período (afecta todos los cálculos del periodo) */}
      <PeriodSelector
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {/* ═══ Stat Cards ═══ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Utilidad del periodo"
          value={utilidadMes}
          icon="TrendingUp"
          borderColor="success"
          delay={0}
        />
        <StatCard
          label="Retiros del periodo"
          value={retirosTotalMes}
          icon="Banknote"
          borderColor="error"
          delay={1}
        />
        <StatCard
          label="Utilidad disponible"
          value={utilidadDisponible}
          icon="DollarSign"
          borderColor="gold"
          delay={2}
        />
        <StatCard
          label="Socios activos"
          value={activePartners.length}
          icon="Users"
          format="number"
          borderColor="info"
          delay={3}
        />
      </div>

      {/* ═══ Tabs ═══ */}
      <div className="flex w-fit items-center gap-1 rounded-lg bg-cream p-1">
        <TabButton active={activeTab === "socios"} onClick={() => setActiveTab("socios")} icon={Users}>
          Socios
          <span className="ml-1.5 rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {partners.length}
          </span>
        </TabButton>
        <TabButton active={activeTab === "retiros"} onClick={() => setActiveTab("retiros")} icon={Receipt}>
          Retiros
        </TabButton>
        <TabButton active={activeTab === "historial"} onClick={() => setActiveTab("historial")} icon={History}>
          Historial
        </TabButton>
      </div>

      {/* ═══ Tab: Socios ═══ */}
      {activeTab === "socios" && (
        <div className="space-y-4">
          {totalPercentage > 100 && (
            <div className="flex items-center gap-2 rounded-lg border border-error/20 bg-error-bg p-3 text-sm text-error">
              <AlertTriangle size={16} />
              <span>
                La suma de porcentajes ({totalPercentage}%) supera el 100%. Ajusta la distribución.
              </span>
            </div>
          )}

          {/* Tarjetas de socio: resumen visual del periodo */}
          {activePartners.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activePartners.map((p) => {
                const utilidadProporcional = utilidadMes * (p.distribution_percentage / 100)
                const retirado = retirosPorSocio[p.id] || 0
                const disponible = utilidadProporcional - retirado
                return (
                  <Card key={p.id} className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground">{p.name}</h3>
                      <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold tabular-nums">
                        {p.distribution_percentage}%
                      </span>
                    </div>

                    <div className="overflow-hidden rounded-full bg-border h-1.5">
                      <div
                        className="h-full rounded-full bg-gold transition-all duration-500"
                        style={{ width: `${Math.min(100, p.distribution_percentage)}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Utilidad</p>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatCOP(utilidadProporcional)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Retirado</p>
                        <p className="text-sm font-semibold tabular-nums text-error">
                          {formatCOP(retirado)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Disponible</p>
                        <p
                          className={`text-sm font-semibold tabular-nums ${
                            disponible > 0
                              ? "text-success"
                              : disponible < 0
                                ? "text-error"
                                : "text-muted-foreground"
                          }`}
                        >
                          {formatCOP(disponible)}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-full text-xs"
                      onClick={() => openNewWithdrawal(p)}
                    >
                      <Banknote size={14} className="mr-1" />
                      Registrar retiro
                    </Button>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Tabla de gestión de socios (incluye inactivos) */}
          <DataTable
            data={partners}
            columns={partnerColumns}
            rowKey={(p) => p.id}
            loading={loadingPartners}
            showFooter
            empty={{
              icon: Users,
              title: "Sin socios",
              description: "Agrega socios para distribuir las utilidades.",
              action: (
                <Button size="sm" onClick={openNewPartner}>
                  <Plus size={16} className="mr-1.5" />
                  Nuevo socio
                </Button>
              ),
            }}
          />
        </div>
      )}

      {/* ═══ Tab: Retiros ═══ */}
      {activeTab === "retiros" && (
        <div className="space-y-4">
          <FilterBar
            search={
              <SearchInput
                value={searchWithdrawal}
                onValueChange={setSearchWithdrawal}
                placeholder="Buscar por socio o nota..."
                wrapperClassName="max-w-xs"
              />
            }
            hasActiveFilters={hasActiveFilters}
            onClear={clearFilters}
          >
            <Select value={partnerFilter} onValueChange={setPartnerFilter}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Socio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los socios</SelectItem>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Método" />
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
            data={filteredWithdrawals}
            columns={withdrawalColumns}
            rowKey={(w) => w.id}
            loading={loadingWithdrawals}
            isFiltered={hasActiveFilters}
            pageSize={25}
            showFooter
            empty={{
              icon: Banknote,
              title: "Sin retiros",
              description: "No se encontraron retiros en este período.",
              action: (
                <Button size="sm" onClick={() => openNewWithdrawal()}>
                  <Banknote size={16} className="mr-1.5" />
                  Registrar retiro
                </Button>
              ),
            }}
          />
        </div>
      )}

      {/* ═══ Tab: Historial ═══ */}
      {activeTab === "historial" && (
        <div className="space-y-3">
          <DataTable
            data={historyData}
            columns={historyColumns}
            rowKey={(m) => m.from}
            loading={loadingHistory}
            empty={{
              icon: History,
              title: "Sin datos",
              description: "No hay datos históricos disponibles.",
            }}
          />
          {historyData.length > 0 && (
            <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
              <Wallet size={13} />
              Por socio: <span className="text-foreground">Utilidad</span> /{" "}
              <span className="text-error">Retirado</span> /{" "}
              <span className="font-semibold text-success">Disponible</span>
            </p>
          )}
        </div>
      )}

      {/* ═══ Dialogs ═══ */}
      <PartnerFormDialog
        open={showPartnerForm}
        onOpenChange={setShowPartnerForm}
        partner={selectedPartner}
        onCompleted={fetchAll}
      />
      <WithdrawalFormDialog
        open={showWithdrawalForm}
        onOpenChange={(open) => {
          setShowWithdrawalForm(open)
          if (!open) {
            setSelectedWithdrawal(null)
            setSelectedPartner(null)
          }
        }}
        partners={partners}
        partnerUtilities={partnerUtilities}
        withdrawal={selectedWithdrawal}
        defaultPartnerId={!selectedWithdrawal && selectedPartner ? selectedPartner.id : undefined}
        onCompleted={fetchAll}
      />
      <DeleteWithdrawalDialog
        open={showDeleteWithdrawal}
        onOpenChange={(open) => {
          setShowDeleteWithdrawal(open)
          if (!open) setSelectedWithdrawal(null)
        }}
        withdrawal={selectedWithdrawal}
        onCompleted={fetchAll}
      />
      <DeletePartnerDialog
        open={showDeletePartner}
        onOpenChange={(open) => {
          setShowDeletePartner(open)
          if (!open) setSelectedPartner(null)
        }}
        partner={selectedPartner}
        onCompleted={fetchAll}
      />
    </PageShell>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Users
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon size={15} />
      {children}
    </button>
  )
}

export default function SociosPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={4} rows={6} cols={5} />}>
      <SociosPageInner />
    </Suspense>
  )
}
