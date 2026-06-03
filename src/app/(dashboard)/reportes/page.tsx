"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { PageShell } from "@/components/shared/page-shell"
import { PeriodSelector } from "@/components/shared/period-selector"
import { StatCardGridSkeleton, TableSkeleton } from "@/components/shared/skeletons"
import { Button } from "@/components/ui/button"
import { type PeriodKey, getDateRange, toLocalDate } from "@/lib/date-periods"
import { ReportResumen } from "./report-resumen"
import { ReportVentas } from "./report-ventas"
import { ReportGastos } from "./report-gastos"
import { ReportCartera } from "./report-cartera"
import { ReportInventario } from "./report-inventario"
import { exportReportPDF } from "./export-pdf"
import { exportReportExcel, type ReportExcelData } from "./export-excel"

/* eslint-disable @typescript-eslint/no-explicit-any */

type TabKey = "resumen" | "ventas" | "gastos" | "cartera" | "inventario"

const TABS: { key: TabKey; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "ventas", label: "Ventas" },
  { key: "gastos", label: "Gastos" },
  { key: "cartera", label: "Cartera" },
  { key: "inventario", label: "Inventario" },
]

const TAB_TITLES: Record<TabKey, string> = {
  resumen: "Resumen Financiero",
  ventas: "Analisis de Ventas",
  gastos: "Analisis de Gastos",
  cartera: "Cartera CxC + CxP",
  inventario: "Valoracion de Inventario",
}

export default function ReportesPage() {
  const supabase = createClient()
  const reportRef = useRef<HTMLDivElement>(null)

  // State
  const [activeTab, setActiveTab] = useState<TabKey>("resumen")
  const [period, setPeriod] = useState<PeriodKey>("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null)

  // Data
  const [sales, setSales] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [receivables, setReceivables] = useState<any[]>([])
  const [payables, setPayables] = useState<any[]>([])
  const [variants, setVariants] = useState<any[]>([])
  const [rawMaterials, setRawMaterials] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [withdrawals, setWithdrawals] = useState<any[]>([])
  const [subscriptions, setSubscriptions] = useState<any[]>([])

  // Period range
  const { from, to } = useMemo(() => {
    if (period === "custom") {
      return {
        from: customFrom || toLocalDate(new Date()),
        to: customTo || toLocalDate(new Date()),
      }
    }
    return getDateRange(period)
  }, [period, customFrom, customTo])

  const periodLabel = useMemo(() => {
    if (!from || !to) return ""
    const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })
    return `${fmtDate(from)} — ${fmtDate(to)}`
  }, [from, to])

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!from || !to) return
    setLoading(true)

    try {
      const [
        salesRes, expensesRes, arRes, apRes, variantsRes, rmRes,
        campaignsRes, withdrawalsRes, subsRes,
      ] = await Promise.all([
        // Sales with items, client, product info
        supabase
          .from("sales")
          .select("*, client:clients(full_name, id), items:sale_items(id, quantity, unit_price, subtotal, variant:product_variants(id, color, size, cost_per_unit, product:products(name, category)))")
          .gte("sale_date", from)
          .lt("sale_date", to)
          .order("sale_date", { ascending: false }),

        // Expenses with category + supplier
        supabase
          .from("expenses")
          .select("*, category:expense_categories(id, name), supplier:suppliers(id, name)")
          .gte("expense_date", from)
          .lt("expense_date", to)
          .order("expense_date", { ascending: false }),

        // Accounts Receivable (all non-paid)
        supabase
          .from("accounts_receivable")
          .select("*, client:clients(full_name), sale:sales(invoice_number)")
          .neq("status", "paid")
          .order("due_date", { ascending: true }),

        // Accounts Payable (all non-paid)
        supabase
          .from("accounts_payable")
          .select("*, supplier:suppliers(name)")
          .neq("status", "paid")
          .order("due_date", { ascending: true }),

        // Product Variants (snapshot actual)
        supabase
          .from("product_variants")
          .select("*, product:products(name, category)")
          .eq("is_active", true)
          .order("product_id"),

        // Raw Materials (snapshot actual)
        supabase
          .from("raw_materials")
          .select("*")
          .eq("is_active", true)
          .order("name"),

        // Campaigns in period
        supabase
          .from("campaigns")
          .select("*")
          .gte("start_date", from)
          .lt("start_date", to),

        // Partner withdrawals in period
        supabase
          .from("partner_withdrawals")
          .select("*, partner:partners(name)")
          .gte("withdrawal_date", from)
          .lt("withdrawal_date", to),

        // Active subscriptions
        supabase
          .from("subscriptions")
          .select("*")
          .eq("status", "active"),
      ])

      setSales(salesRes.data || [])
      setExpenses(expensesRes.data || [])
      setReceivables(arRes.data || [])
      setPayables(apRes.data || [])
      setVariants(variantsRes.data || [])
      setRawMaterials(rmRes.data || [])
      setCampaigns(campaignsRes.data || [])
      setWithdrawals(withdrawalsRes.data || [])
      setSubscriptions(subsRes.data || [])
    } catch {
      toast.error("Error cargando datos del reporte")
    } finally {
      setLoading(false)
    }
  }, [from, to, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // KPIs for Excel export
  const kpis = useMemo(() => {
    const activeSales = sales.filter((s: any) => s.status !== "returned")
    const ventasBrutas = activeSales.reduce((s: number, v: any) => s + (v.total || 0), 0)
    const costoVentas = activeSales.reduce((s: number, v: any) =>
      s + (v.items || []).reduce((q: number, i: any) => q + i.quantity * (i.variant?.cost_per_unit || 0), 0)
    , 0)
    const gananciaBruta = ventasBrutas - costoVentas
    const gastosOperativos = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0)
    const gananciaNeta = gananciaBruta - gastosOperativos
    const margenNeto = ventasBrutas > 0 ? (gananciaNeta / ventasBrutas) * 100 : 0
    const totalCxC = receivables.reduce((s: number, r: any) => s + (r.remaining_amount || 0), 0)
    const totalCxP = payables.reduce((s: number, p: any) => s + (p.remaining_amount || 0), 0)
    const valorInventario = variants.reduce((s: number, v: any) => s + (v.stock || 0) * (v.cost_per_unit || 0), 0)
    const valorMateriasPrimas = rawMaterials.reduce((s: number, rm: any) => s + (rm.stock || 0) * (rm.cost_per_unit || 0), 0)
    return { ventasBrutas, costoVentas, gananciaBruta, gastosOperativos, gananciaNeta, margenNeto, totalCxC, totalCxP, valorInventario, valorMateriasPrimas }
  }, [sales, expenses, receivables, payables, variants, rawMaterials])

  // Export PDF
  const handleExportPDF = async () => {
    if (!reportRef.current) return
    setExporting("pdf")
    try {
      await exportReportPDF(reportRef.current, TAB_TITLES[activeTab], periodLabel)
      toast.success("PDF descargado")
    } catch (err) {
      console.error("PDF export error:", err)
      toast.error("Error al generar PDF", { description: err instanceof Error ? err.message : "Error desconocido" })
    } finally {
      setExporting(null)
    }
  }

  // Export Excel
  const handleExportExcel = async () => {
    setExporting("excel")
    try {
      const data: ReportExcelData = {
        period: periodLabel,
        kpis,
        sales,
        expenses,
        receivables,
        payables,
        variants,
        rawMaterials,
      }
      await exportReportExcel(data)
      toast.success("Excel descargado")
    } catch (err) {
      console.error("Excel export error:", err)
      toast.error("Error al generar Excel", { description: err instanceof Error ? err.message : "Error desconocido" })
    } finally {
      setExporting(null)
    }
  }

  return (
    <PageShell
      title="Reportes"
      description="Reportes financieros y operativos"
      actions={
        <>
          <Button variant="outline" onClick={handleExportExcel} disabled={loading || !!exporting}>
            {exporting === "excel" ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <FileSpreadsheet size={16} className="mr-1.5" />}
            Excel
          </Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={loading || !!exporting}>
            {exporting === "pdf" ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <FileText size={16} className="mr-1.5" />}
            PDF
          </Button>
        </>
      }
    >
      {/* Period selector */}
      <PeriodSelector
        selectedPeriod={period}
        onPeriodChange={setPeriod}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {/* Tabs */}
      <div className="bg-cream p-1 rounded-lg inline-flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report content */}
      {loading ? (
        <div className="space-y-6">
          <StatCardGridSkeleton count={4} />
          <TableSkeleton rows={8} cols={5} />
        </div>
      ) : (
        <div ref={reportRef} id="report-content">
          {activeTab === "resumen" && (
            <ReportResumen
              sales={sales}
              expenses={expenses}
              campaigns={campaigns}
              withdrawals={withdrawals}
              subscriptions={subscriptions}
              receivables={receivables}
              payables={payables}
              from={from}
              to={to}
            />
          )}
          {activeTab === "ventas" && (
            <ReportVentas sales={sales} from={from} to={to} />
          )}
          {activeTab === "gastos" && (
            <ReportGastos expenses={expenses} from={from} to={to} />
          )}
          {activeTab === "cartera" && (
            <ReportCartera receivables={receivables} payables={payables} />
          )}
          {activeTab === "inventario" && (
            <ReportInventario variants={variants} rawMaterials={rawMaterials} />
          )}
        </div>
      )}
    </PageShell>
  )
}
