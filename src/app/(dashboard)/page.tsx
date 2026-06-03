"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/providers/auth-provider"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { getGreeting, formatCurrentDate, formatCOP, formatRelativeTime } from "@/lib/format"
import { PAYMENT_METHODS } from "@/lib/constants"
import type { DashboardStats, RecentSale, DailyData, Debtor } from "@/lib/types"
import { CreditCard, PackageCheck, Wallet, Plus, Receipt, TrendingDown, Landmark } from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

export default function DashboardPage() {
  const { user, loading: authLoading, hasPermission } = useAuth()
  const router = useRouter()

  const quickActions = [
    { label: "Nueva venta", href: "/facturacion?nuevo=1", icon: Receipt, module: "facturacion" as const },
    { label: "Registrar gasto", href: "/gastos?nuevo=1", icon: TrendingDown, module: "gastos" as const },
    { label: "Movimiento caja", href: "/caja?nuevo=1", icon: Landmark, module: "caja" as const },
  ].filter((a) => hasPermission(a.module))
  const [stats, setStats] = useState<DashboardStats>({
    ventasMes: 0,
    gastosMes: 0,
    cuentasPorCobrar: 0,
    unidadesVendidas: 0,
    dineroCaja: 0,
    dineroBanco: 0,
    liquidezTotal: 0,
  })
  const [ordersStatus, setOrdersStatus] = useState({ paid: 0, pending: 0, shipped: 0, delivered: 0, returned: 0 })
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [dailyData, setDailyData] = useState<DailyData[]>([])
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDashboardData = useCallback(async () => {
    const supabase = createClient()

    // Primer y último día del mes actual
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

    // Ejecutar todas las consultas en paralelo
    const [
      salesRes,
      expensesRes,
      unitsRes,
      cashRes,
      bankRes,
      recentRes,
      debtorsRes,
      allDebtorsRes,
    ] = await Promise.all([
      // 1. Total ventas del mes con status
      supabase
        .from("sales")
        .select("total, status, sale_date")
        .gte("sale_date", firstDay)
        .lte("sale_date", lastDay),

      // 2. Total gastos del mes
      supabase
        .from("expenses")
        .select("amount, expense_date")
        .gte("expense_date", firstDay)
        .lte("expense_date", lastDay),

      // 3. Unidades vendidas del mes (sumando items de ventas del mes)
      supabase
        .from("sale_items")
        .select("quantity, sale:sales!inner(sale_date)")
        .gte("sale.sale_date", firstDay)
        .lte("sale.sale_date", lastDay),

      // 4. Dinero en caja (cuentas tipo cash)
      supabase
        .from("cash_bank_accounts")
        .select("balance")
        .eq("type", "cash")
        .eq("is_active", true),

      // 5. Dinero en banco (cuentas tipo bank + digital)
      supabase
        .from("cash_bank_accounts")
        .select("balance")
        .in("type", ["bank", "digital"])
        .eq("is_active", true),

      // 6. Ventas recientes (últimas 8)
      supabase
        .from("sales")
        .select("id, invoice_number, total, status, payment_method, created_at, client:clients(full_name)")
        .order("created_at", { ascending: false })
        .limit(8),

      // 7. Clientes que nos deben (cuentas por cobrar pendientes, top 6)
      supabase
        .from("accounts_receivable")
        .select("id, total_amount, paid_amount, remaining_amount, client:clients(full_name), sale:sales(invoice_number)")
        .gt("remaining_amount", 0)
        .order("remaining_amount", { ascending: false })
        .limit(6),

      // 8. Total deuda (todos)
      supabase
        .from("accounts_receivable")
        .select("remaining_amount")
        .gt("remaining_amount", 0),
    ])

    // Procesar estado de órdenes del mes
    const statuses = { paid: 0, pending: 0, shipped: 0, delivered: 0, returned: 0 }
    let ventasMes = 0

    for (const s of salesRes.data || []) {
      ventasMes += Number(s.total)
      const st = s.status as keyof typeof statuses
      if (st in statuses) statuses[st]++
    }
    setOrdersStatus(statuses)

    // Calcular estadísticas principales
    const gastosMes = (expensesRes.data || []).reduce((sum, e) => sum + Number(e.amount), 0)
    const unidadesVendidas = (unitsRes.data || []).reduce((sum, i) => sum + Number(i.quantity), 0)
    const dineroCaja = (cashRes.data || []).reduce((sum, a) => sum + Number(a.balance), 0)
    const dineroBanco = (bankRes.data || []).reduce((sum, a) => sum + Number(a.balance), 0)
    const cuentasPorCobrar = (allDebtorsRes.data || []).reduce((sum, d) => sum + Number(d.remaining_amount), 0)
    const liquidezTotal = dineroCaja + dineroBanco

    setStats({
      ventasMes,
      gastosMes,
      cuentasPorCobrar,
      unidadesVendidas,
      dineroCaja,
      dineroBanco,
      liquidezTotal,
    })

    // Ventas recientes
    setRecentSales((recentRes.data || []) as unknown as RecentSale[])

    // Generar datos diarios para la gráfica de área
    const dailyMap = new Map<string, { ventas: number; gastos: number }>()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d)
      dailyMap.set(dayStr, { ventas: 0, gastos: 0 })
    }

    for (const sale of salesRes.data || []) {
      const day = String(new Date(sale.sale_date).getDate())
      const entry = dailyMap.get(day)
      if (entry) entry.ventas += Number(sale.total)
    }

    for (const expense of expensesRes.data || []) {
      const day = String(new Date(expense.expense_date).getDate())
      const entry = dailyMap.get(day)
      if (entry) entry.gastos += Number(expense.amount)
    }

    // Mostrar días hasta hoy para la gráfica
    const todayDay = now.getDate()
    const chartData: DailyData[] = []
    for (let d = 1; d <= todayDay; d++) {
      const dayStr = String(d)
      const entry = dailyMap.get(dayStr)!
      chartData.push({ day: dayStr, ventas: entry.ventas, gastos: entry.gastos })
    }
    setDailyData(chartData)

    // Procesar deudores top
    const debtorsRaw = (debtorsRes.data || []) as unknown as Array<{
      id: string
      total_amount: number
      paid_amount: number
      remaining_amount: number
      client: { full_name: string } | null
      sale: { invoice_number: string } | null
    }>
    setDebtors(
      debtorsRaw.map((d) => ({
        id: d.id,
        clientName: d.client?.full_name || "Sin nombre",
        totalAmount: Number(d.total_amount),
        paidAmount: Number(d.paid_amount),
        remainingAmount: Number(d.remaining_amount),
        invoiceNumber: d.sale?.invoice_number || "",
      }))
    )

    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authLoading) {
      fetchDashboardData()
    }
  }, [authLoading, fetchDashboardData])

  if (authLoading || loading) {
    return <DashboardSkeleton />
  }

  const totalOrders = Object.values(ordersStatus).reduce((a, b) => a + b, 0)
  const fulfillmentProgress = totalOrders > 0
    ? Math.round(((ordersStatus.shipped + ordersStatus.delivered) / totalOrders) * 100)
    : 0

  return (
    <div className="space-y-6 md:space-y-8 animate-page-in pb-12">
      {/* Saludo personalizado premium */}
      <div className="relative overflow-hidden rounded-3xl bg-white/40 backdrop-blur-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 md:p-8 isolate group">
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/4 w-[400px] h-[400px] bg-gold/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-gold/15 transition-colors duration-1000" />
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 relative z-10">
          <div>
            <span className="inline-block py-1 px-3 rounded-full bg-gold/10 text-gold text-xs font-bold uppercase tracking-widest mb-3 border border-gold/20 shadow-sm">
              Panel Financiero OTC
            </span>
            <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-5xl font-extrabold text-foreground tracking-tight transition-all">
              {getGreeting()}, <span className="bg-clip-text text-transparent bg-gradient-to-r from-gold to-[#B8923E]">{user?.full_name?.split(" ")[0] || "Usuario"}</span>
            </h1>
            <p className="text-base text-muted-foreground mt-2 capitalize font-medium">
              {formatCurrentDate()} — Resumen de operaciones Order-to-Cash
            </p>
          </div>

          {/* Accesos rápidos a las tareas del día */}
          {quickActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon
                return (
                  <Button
                    key={action.href}
                    size="sm"
                    variant="outline"
                    className="bg-white/60 backdrop-blur"
                    onClick={() => router.push(action.href)}
                  >
                    <Icon size={15} className="mr-1.5" />
                    {action.label}
                  </Button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bento Grid Superior - KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="lg:col-span-2">
          <StatCard
            label="Liquidez Disponible (Caja + Bancos)"
            value={stats.liquidezTotal}
            icon="Wallet"
            variant="bento"
            borderColor="gold"
            delay={0}
            onClick={hasPermission("caja") ? () => router.push("/caja") : undefined}
          />
        </div>
        <StatCard
          label="Ingresos Brutos"
          value={stats.ventasMes}
          icon="TrendingUp"
          variant="bento"
          borderColor="success"
          delay={1}
          onClick={hasPermission("ventas") ? () => router.push("/ventas") : undefined}
        />
        <StatCard
          label="Cuentas por Cobrar"
          value={stats.cuentasPorCobrar}
          icon="Users"
          variant="bento"
          borderColor="warning"
          delay={2}
          onClick={hasPermission("cuentas") ? () => router.push("/cuentas") : undefined}
        />
      </div>

      {/* Grid Secundario - Métricas Desglosadas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          label="Gastos Operativos"
          value={stats.gastosMes}
          icon="TrendingDown"
          borderColor="error"
          delay={3}
          onClick={hasPermission("gastos") ? () => router.push("/gastos") : undefined}
        />
        <StatCard
          label="Dinero en Cajón"
          value={stats.dineroCaja}
          icon="Banknote"
          borderColor="info"
          delay={4}
          onClick={hasPermission("caja") ? () => router.push("/caja") : undefined}
        />
        <StatCard
          label="Dinero en Bancos"
          value={stats.dineroBanco}
          icon="Building2"
          borderColor="info"
          delay={5}
          onClick={hasPermission("caja") ? () => router.push("/caja") : undefined}
        />
        <StatCard
          label="Unidades Vendidas"
          value={stats.unidadesVendidas}
          icon="Package"
          format="units"
          borderColor="gold"
          delay={6}
          onClick={hasPermission("inventario") ? () => router.push("/inventario") : undefined}
        />
      </div>

      {/* Gráficas y Fulfillment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Flujo de Dinero - Gráfica de Área */}
        <div className="lg:col-span-2 bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 p-6 md:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] relative overflow-hidden group hover:shadow-[0_16px_60px_rgba(201,165,92,0.08)] transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 relative z-10">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Flujo de Capital</h2>
              <p className="text-sm font-medium text-muted-foreground mt-1">Ventas vs Gastos del mes actual</p>
            </div>
          </div>

          {dailyData.some((d) => d.ventas > 0 || d.gastos > 0) ? (
            <div className="h-[320px] w-full relative z-10">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C9A55C" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#C9A55C" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#DC2626" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" opacity={0.6} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)", fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={12}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)", fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(255, 255, 255, 0.9)",
                      border: "1px solid rgba(255,255,255,0.6)",
                      borderRadius: "16px",
                      boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1)",
                      fontSize: "14px",
                      fontWeight: 600,
                      backdropFilter: "blur(12px)",
                      padding: "12px 16px"
                    }}
                    formatter={(value: any) => [formatCOP(Number(value))]}
                    labelFormatter={(label) => `Día ${label}`}
                  />
                  <Area type="monotone" dataKey="ventas" stroke="#C9A55C" strokeWidth={4} fillOpacity={1} fill="url(#colorVentas)" name="Ventas" />
                  <Area type="monotone" dataKey="gastos" stroke="#DC2626" strokeWidth={3} fillOpacity={1} fill="url(#colorGastos)" name="Gastos" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm bg-white/40 rounded-2xl border border-dashed border-white/60">
              Aún no hay datos financieros registrados este mes
            </div>
          )}
        </div>

        {/* Estado de Órdenes (Fulfillment) */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 p-6 md:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] relative overflow-hidden group hover:shadow-[0_16px_60px_rgba(37,99,235,0.08)] transition-all duration-500 flex flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-info/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

          <h2 className="text-xl font-extrabold tracking-tight mb-1 relative z-10 flex items-center gap-2">
            <div className="p-2 bg-info/10 rounded-xl text-info">
              <PackageCheck size={20} className="text-info" />
            </div>
            Fulfillment
          </h2>
          <p className="text-sm font-medium text-muted-foreground mb-8 relative z-10">Despachos mensuales (Order-to-Cash)</p>

          <div className="flex-1 flex flex-col justify-center relative z-10">
            {/* Circular Progress */}
            <div className="flex justify-center mb-10">
              <div className="relative size-44 flex items-center justify-center rounded-full bg-white/50 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] border border-white/60">
                <svg className="w-full h-full transform -rotate-90 absolute inset-0 drop-shadow-xl">
                  <circle cx="88" cy="88" r="76" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-black/5" />
                  <circle
                    cx="88" cy="88" r="76"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 76}
                    strokeDashoffset={2 * Math.PI * 76 * (1 - fulfillmentProgress / 100)}
                    className="text-info transition-all duration-1500 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="text-center">
                  <span className="text-4xl font-[family-name:var(--font-display)] font-extrabold text-foreground tracking-tighter">{fulfillmentProgress}%</span>
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground tracking-[0.2em] mt-1">Enviado</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 px-1">
              <div className="flex items-center justify-between text-sm p-3 rounded-xl bg-white/80 border border-white shadow-sm hover:scale-[1.02] transition-transform">
                <span className="flex items-center gap-3 font-semibold text-muted-foreground"><div className="w-2.5 h-2.5 rounded-full bg-warning shadow-[0_0_8px_rgba(217,119,6,0.6)]" /> Pendientes</span>
                <span className="font-extrabold text-warning text-base">{ordersStatus.pending}</span>
              </div>
              <div className="flex items-center justify-between text-sm p-3 rounded-xl bg-white/80 border border-white shadow-sm hover:scale-[1.02] transition-transform">
                <span className="flex items-center gap-3 font-semibold text-muted-foreground"><div className="w-2.5 h-2.5 rounded-full bg-info shadow-[0_0_8px_rgba(37,99,235,0.6)]" /> Enviados</span>
                <span className="font-extrabold text-info text-base">{ordersStatus.shipped}</span>
              </div>
              <div className="flex items-center justify-between text-sm p-3 rounded-xl bg-white/80 border border-white shadow-sm hover:scale-[1.02] transition-transform">
                <span className="flex items-center gap-3 font-semibold text-muted-foreground"><div className="w-2.5 h-2.5 rounded-full bg-success shadow-[0_0_8px_rgba(5,150,105,0.6)]" /> Entregados</span>
                <span className="font-extrabold text-success text-base">{ordersStatus.delivered}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Inferior - Listas Detalladas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Actividad reciente */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 p-6 md:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

          <h2 className="text-xl font-extrabold tracking-tight mb-6 relative z-10 flex items-center gap-2">
            <div className="p-2 bg-gold/10 rounded-xl">
              <Wallet size={20} className="text-gold" />
            </div>
            Últimas Transacciones
          </h2>
          {recentSales.length > 0 ? (
            <div className="space-y-3 relative z-10">
              {recentSales.map((sale) => {
                const metodo = PAYMENT_METHODS.find((m) => m.value === sale.payment_method)?.label || sale.payment_method
                return (
                  <Link
                    href="/ventas"
                    key={sale.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-white/60 border border-white shadow-sm hover:bg-white/90 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group/item gap-3 sm:gap-0"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="size-11 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center text-gold font-extrabold text-sm shrink-0 border border-gold/20 shadow-[0_4px_10px_rgba(201,165,92,0.15)] group-hover/item:scale-110 group-hover/item:rotate-3 transition-transform duration-300">
                        {sale.client?.full_name?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[15px] font-bold text-foreground truncate group-hover/item:text-gold transition-colors">
                          {sale.client?.full_name || "Venta de mostrador"}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground mt-1">
                          <span className="text-gold bg-gold/10 px-1.5 py-0.5 rounded uppercase tracking-wider">{sale.invoice_number}</span>
                          <span className="opacity-50">&bull;</span>
                          <span>{metodo}</span>
                          <span className="opacity-50">&bull;</span>
                          <span>{formatRelativeTime(sale.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 sm:gap-1.5 shrink-0 px-1">
                      <span className="font-[family-name:var(--font-display)] text-[17px] font-extrabold text-foreground tabular-nums tracking-tight">
                        {formatCOP(sale.total)}
                      </span>
                      <StatusBadge status={sale.status as any} />
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm bg-white/40 rounded-2xl border border-dashed border-white/60 mt-2">
              <Wallet size={32} className="mb-3 opacity-20" />
              Aún no hay transacciones recientes
            </div>
          )}
        </div>

        {/* Clientes que nos deben */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 p-6 md:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-warning/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

          <div className="flex items-center justify-between mb-6 relative z-10 w-full">
            <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
              <div className="p-2 bg-warning/10 rounded-xl">
                <CreditCard size={20} className="text-warning" />
              </div>
              Atención de Cobro
            </h2>
            <div className="text-right">
              <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Deuda Total</span>
              <span className="text-lg font-[family-name:var(--font-display)] font-extrabold text-warning tabular-nums bg-white shadow-sm px-3 py-1 rounded-lg border border-warning/20">
                {formatCOP(stats.cuentasPorCobrar)}
              </span>
            </div>
          </div>

          {debtors.length > 0 ? (
            <div className="space-y-3 relative z-10">
              {debtors.map((debtor) => {
                const progress = Math.round((debtor.paidAmount / debtor.totalAmount) * 100)
                return (
                  <Link href="/cuentas" key={debtor.id} className="block p-5 rounded-2xl bg-white/60 border border-white shadow-sm hover:bg-white/90 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group/item space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 pr-4">
                        <p className="text-[15px] font-bold truncate group-hover/item:text-warning transition-colors">{debtor.clientName}</p>
                        <p className="text-xs font-semibold text-muted-foreground mt-1.5 flex items-center gap-1.5">
                          Ref: <span className="text-gold bg-gold/10 px-1.5 py-0.5 rounded tracking-wider">{debtor.invoiceNumber}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0 bg-error/5 p-2 rounded-xl border border-error/10">
                        <span className="block text-sm font-[family-name:var(--font-display)] font-extrabold text-error tabular-nums">
                          {formatCOP(debtor.remainingAmount)}
                        </span>
                        <span className="text-[9px] font-bold text-error/70 uppercase tracking-[0.1em] mt-1 block">Saldo pend.</span>
                      </div>
                    </div>

                    {/* Barra de progreso de pago y stats */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-2 font-bold text-muted-foreground/80 uppercase tracking-wide">
                        <span>Abonado: {formatCOP(debtor.paidAmount)}</span>
                        <span>Total: {formatCOP(debtor.totalAmount)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-black/5 rounded-full h-2.5 overflow-hidden shadow-inner">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-warning to-gold transition-all duration-1500 ease-out shadow-[0_0_10px_rgba(217,119,6,0.5)]"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-extrabold text-warning tabular-nums w-11 text-center bg-white shadow-sm border border-warning/10 py-0.5 rounded-md">
                          {progress}%
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm bg-white/40 rounded-2xl border border-dashed border-white/60 mt-2">
              <CreditCard size={32} className="mb-3 opacity-20 text-success" />
              <span className="text-success font-semibold text-base">¡Excelente! Nadie te debe dinero actualmente.</span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 md:space-y-8 pb-12">
      <div className="flex justify-between">
        <div>
          <Skeleton className="h-12 w-64 md:w-96 skeleton-shimmer rounded-2xl" />
          <Skeleton className="h-5 w-56 mt-4 skeleton-shimmer rounded-lg" />
        </div>
      </div>

      {/* Bento Skeleton Superior */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Skeleton className="lg:col-span-2 h-[160px] rounded-3xl skeleton-shimmer" />
        <Skeleton className="h-[160px] rounded-3xl skeleton-shimmer" />
        <Skeleton className="h-[160px] rounded-3xl skeleton-shimmer" />
      </div>

      {/* Skeleton Inferior */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[130px] rounded-3xl skeleton-shimmer" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-[420px] rounded-3xl skeleton-shimmer" />
        <Skeleton className="h-[420px] rounded-3xl skeleton-shimmer" />
      </div>
    </div>
  )
}
