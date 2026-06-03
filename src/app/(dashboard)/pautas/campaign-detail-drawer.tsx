"use client"

import {
  Megaphone,
  Pencil,
  Target,
  Eye,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Users,
  MousePointerClick,
  MessageSquare,
  ShoppingCart,
  DollarSign,
  CalendarDays,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/status-badge"
import { formatCOP, formatNumber, formatDateShort } from "@/lib/format"
import type { Campaign, CampaignStatus } from "@/lib/types"

const OBJECTIVE_LABELS: Record<string, string> = {
  interaction: "Interaccion",
  messages: "Mensajes",
  traffic: "Trafico",
  conversions: "Conversiones",
}

interface CampaignDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: Campaign | null
  onEdit: () => void
}

function MetricRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon size={15} className="text-muted-foreground/70" />
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums text-foreground">{value}</span>
    </div>
  )
}

export function CampaignDetailDrawer({
  open,
  onOpenChange,
  campaign,
  onEdit,
}: CampaignDetailDrawerProps) {
  if (!campaign) return null

  const c = campaign
  const hasMetrics = !!(c.reach || c.impressions || c.clicks || c.messages_received)
  const roiPositive = (c.roi ?? 0) >= 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start justify-between gap-3 pr-6">
            <span className="font-[family-name:var(--font-display)] text-xl leading-tight">
              {c.name}
            </span>
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-0.5 text-xs font-medium text-foreground">
              <Megaphone size={12} className="text-gold" />
              {c.platform}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <Target size={12} />
              {OBJECTIVE_LABELS[c.objective] || c.objective}
            </span>
            <StatusBadge status={c.status as CampaignStatus} />
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Resumen: presupuesto + fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border-l-[3px] border-l-gold bg-gradient-to-br from-gold/5 to-transparent p-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                Presupuesto
              </p>
              <p className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums text-gold">
                {formatCOP(c.budget)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                <CalendarDays size={12} />
                Periodo
              </p>
              <p className="text-sm font-medium text-foreground">
                {formatDateShort(c.start_date)}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.end_date ? `hasta ${formatDateShort(c.end_date)}` : "en curso"}
              </p>
            </div>
          </div>

          {/* Metricas derivadas: ROI, CAC, costo por mensaje */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              <Sparkles size={12} className="text-gold" />
              Rendimiento calculado
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="mb-1 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                  {roiPositive ? (
                    <TrendingUp size={12} className="text-success" />
                  ) : (
                    <TrendingDown size={12} className="text-error" />
                  )}
                  ROI
                </p>
                <p
                  className={`text-base font-bold tabular-nums ${
                    c.roi === null || c.roi === undefined
                      ? "text-muted-foreground"
                      : roiPositive
                      ? "text-success"
                      : "text-error"
                  }`}
                >
                  {c.roi === null || c.roi === undefined
                    ? "—"
                    : `${c.roi > 0 ? "+" : ""}${c.roi}%`}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="mb-1 text-[11px] text-muted-foreground">CAC</p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {c.cac === null || c.cac === undefined ? "—" : formatCOP(c.cac)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="mb-1 text-[11px] text-muted-foreground">Costo/msj</p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {c.cost_per_message === null || c.cost_per_message === undefined
                    ? "—"
                    : formatCOP(c.cost_per_message)}
                </p>
              </div>
            </div>
          </div>

          {/* Metricas crudas */}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Metricas de campana
            </p>
            {hasMetrics || c.sales_attributed || c.revenue_generated ? (
              <div className="divide-y divide-border rounded-xl border border-border bg-card px-3">
                <MetricRow icon={Users} label="Alcance" value={c.reach ? formatNumber(c.reach) : "—"} />
                <MetricRow
                  icon={Eye}
                  label="Impresiones"
                  value={c.impressions ? formatNumber(c.impressions) : "—"}
                />
                <MetricRow
                  icon={MousePointerClick}
                  label="Clicks"
                  value={c.clicks ? formatNumber(c.clicks) : "—"}
                />
                <MetricRow
                  icon={MessageSquare}
                  label="Mensajes recibidos"
                  value={c.messages_received ? formatNumber(c.messages_received) : "—"}
                />
                <MetricRow
                  icon={ShoppingCart}
                  label="Ventas atribuidas"
                  value={c.sales_attributed ? formatNumber(c.sales_attributed) : "—"}
                />
                <MetricRow
                  icon={DollarSign}
                  label="Ingresos generados"
                  value={c.revenue_generated ? formatCOP(c.revenue_generated) : "—"}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
                Aun no se han registrado metricas para esta campana.
              </div>
            )}
          </div>

          {/* Notas */}
          {c.notes && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                Notas
              </p>
              <p className="rounded-xl border border-border bg-cream/50 p-3 text-sm text-foreground">
                {c.notes}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={onEdit}>
            <Pencil size={15} className="mr-1.5" />
            Editar campana
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
