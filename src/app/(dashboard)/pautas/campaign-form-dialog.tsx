"use client"

import { useState, useEffect } from "react"
import { Loader2, ChevronDown, ChevronUp, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MoneyInput } from "@/components/ui/money-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCOP } from "@/lib/format"
import type { Campaign } from "@/lib/types"

interface CampaignFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: Campaign | null
  onCompleted: () => void
}

const PLATFORMS = [
  { value: "Instagram", label: "Instagram" },
  { value: "Meta Ads", label: "Meta Ads" },
  { value: "TikTok Ads", label: "TikTok Ads" },
  { value: "Google Ads", label: "Google Ads" },
  { value: "Otro", label: "Otro" },
]

const OBJECTIVES = [
  { value: "interaction", label: "Interaccion" },
  { value: "messages", label: "Mensajes" },
  { value: "traffic", label: "Trafico" },
  { value: "conversions", label: "Conversiones" },
]

const STATUS_OPTIONS = [
  { value: "active", label: "Activa" },
  { value: "finished", label: "Finalizada" },
  { value: "paused", label: "Pausada" },
]

export function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
  onCompleted,
}: CampaignFormDialogProps) {
  const supabase = createClient()
  const isEditing = !!campaign

  // Basicos
  const [name, setName] = useState("")
  const [platform, setPlatform] = useState("Instagram")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [budget, setBudget] = useState<number | null>(null)
  const [objective, setObjective] = useState("messages")
  const [status, setStatus] = useState("active")
  const [notes, setNotes] = useState("")

  // Metricas
  const [showMetrics, setShowMetrics] = useState(false)
  const [reach, setReach] = useState(0)
  const [impressions, setImpressions] = useState(0)
  const [clicks, setClicks] = useState(0)
  const [messagesReceived, setMessagesReceived] = useState(0)
  const [salesAttributed, setSalesAttributed] = useState(0)
  const [revenueGenerated, setRevenueGenerated] = useState<number | null>(null)

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      if (campaign) {
        setName(campaign.name)
        setPlatform(campaign.platform)
        setStartDate(campaign.start_date?.split("T")[0] || "")
        setEndDate(campaign.end_date?.split("T")[0] || "")
        setBudget(campaign.budget)
        setObjective(campaign.objective)
        setStatus(campaign.status)
        setNotes(campaign.notes || "")
        setReach(campaign.reach || 0)
        setImpressions(campaign.impressions || 0)
        setClicks(campaign.clicks || 0)
        setMessagesReceived(campaign.messages_received || 0)
        setSalesAttributed(campaign.sales_attributed || 0)
        setRevenueGenerated(campaign.revenue_generated || 0)
        setShowMetrics(
          !!(campaign.reach || campaign.impressions || campaign.clicks || campaign.messages_received)
        )
      } else {
        setName("")
        setPlatform("Instagram")
        setStartDate(new Date().toISOString().split("T")[0])
        setEndDate("")
        setBudget(null)
        setObjective("messages")
        setStatus("active")
        setNotes("")
        setReach(0)
        setImpressions(0)
        setClicks(0)
        setMessagesReceived(0)
        setSalesAttributed(0)
        setRevenueGenerated(null)
        setShowMetrics(false)
      }
    }
  }, [open, campaign])

  // Previsualizacion en vivo de las metricas derivadas (mismo calculo que al guardar)
  const budgetNum = budget || 0
  const revenueNum = revenueGenerated || 0
  const previewCostPerMessage = messagesReceived > 0 ? Math.round(budgetNum / messagesReceived) : null
  const previewRoi =
    revenueNum > 0 && budgetNum > 0
      ? Math.round(((revenueNum - budgetNum) / budgetNum) * 100 * 100) / 100
      : null
  const previewCac = salesAttributed > 0 ? Math.round((budgetNum / salesAttributed) * 100) / 100 : null

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("El nombre de la campana es obligatorio")
      return
    }
    if (!budget || budget <= 0) {
      toast.error("El presupuesto debe ser mayor a 0")
      return
    }
    if (!startDate) {
      toast.error("La fecha de inicio es obligatoria")
      return
    }

    setLoading(true)

    try {
      // Auto-calc metricas derivadas
      const costPerMessage = messagesReceived > 0 ? budget / messagesReceived : null
      const roi = revenueNum > 0 && budget > 0
        ? Math.round(((revenueNum - budget) / budget) * 100 * 100) / 100
        : null
      const cac = salesAttributed > 0 ? Math.round((budget / salesAttributed) * 100) / 100 : null

      const payload = {
        name: name.trim(),
        platform,
        start_date: startDate,
        end_date: endDate || null,
        budget,
        objective,
        status,
        notes: notes.trim() || null,
        reach: reach || 0,
        impressions: impressions || 0,
        clicks: clicks || 0,
        messages_received: messagesReceived || 0,
        cost_per_message: costPerMessage,
        sales_attributed: salesAttributed || 0,
        revenue_generated: revenueNum || 0,
        roi,
        cac,
      }

      if (isEditing) {
        const { error } = await supabase
          .from("campaigns")
          .update(payload)
          .eq("id", campaign.id)
        if (error) throw error
        toast.success("Campana actualizada")
      } else {
        const { error } = await supabase.from("campaigns").insert(payload)
        if (error) throw error
        toast.success("Campana creada", { description: name.trim() })
      }

      onOpenChange(false)
      onCompleted()
    } catch {
      toast.error("Error al guardar la campana")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] text-xl">
            {isEditing ? "Editar campana" : "Nueva campana"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1">Nombre *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Lanzamiento coleccion verano"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Plataforma *</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Objetivo</Label>
              <Select value={objective} onValueChange={setObjective}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1">Presupuesto *</Label>
            <MoneyInput
              value={budget}
              onValueChange={setBudget}
              placeholder="0"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Fecha inicio *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Fecha fin (opcional)</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1">Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1">Notas (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionales..."
              rows={2}
              disabled={loading}
            />
          </div>

          {/* Metricas - seccion colapsable (disponible al crear y al editar) */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 bg-cream hover:bg-cream-dark/50 transition-colors text-sm font-semibold text-muted-foreground"
              onClick={() => setShowMetrics(!showMetrics)}
            >
              <span className="text-xs uppercase tracking-[0.05em]">Metricas de rendimiento</span>
              {showMetrics ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showMetrics && (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1">Alcance</Label>
                    <Input
                      type="number"
                      min={0}
                      value={reach || ""}
                      onChange={(e) => setReach(parseInt(e.target.value) || 0)}
                      placeholder="0"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1">Impresiones</Label>
                    <Input
                      type="number"
                      min={0}
                      value={impressions || ""}
                      onChange={(e) => setImpressions(parseInt(e.target.value) || 0)}
                      placeholder="0"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1">Clicks</Label>
                    <Input
                      type="number"
                      min={0}
                      value={clicks || ""}
                      onChange={(e) => setClicks(parseInt(e.target.value) || 0)}
                      placeholder="0"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1">Mensajes</Label>
                    <Input
                      type="number"
                      min={0}
                      value={messagesReceived || ""}
                      onChange={(e) => setMessagesReceived(parseInt(e.target.value) || 0)}
                      placeholder="0"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1">Ventas atribuidas</Label>
                    <Input
                      type="number"
                      min={0}
                      value={salesAttributed || ""}
                      onChange={(e) => setSalesAttributed(parseInt(e.target.value) || 0)}
                      placeholder="0"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1">Ingresos generados</Label>
                    <MoneyInput
                      value={revenueGenerated}
                      onValueChange={setRevenueGenerated}
                      placeholder="0"
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Preview en vivo de metricas derivadas */}
                {(previewRoi !== null || previewCac !== null || previewCostPerMessage !== null) ? (
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      <Sparkles size={12} className="text-gold" />
                      Calculado automaticamente
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[11px] text-muted-foreground">ROI</p>
                        <p
                          className={`text-sm font-semibold tabular-nums ${
                            previewRoi === null
                              ? "text-muted-foreground"
                              : previewRoi >= 0
                              ? "text-success"
                              : "text-error"
                          }`}
                        >
                          {previewRoi === null
                            ? "—"
                            : `${previewRoi > 0 ? "+" : ""}${previewRoi}%`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">CAC</p>
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {previewCac === null ? "—" : formatCOP(previewCac)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Costo/mensaje</p>
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {previewCostPerMessage === null ? "—" : formatCOP(previewCostPerMessage)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    ROI, CAC y costo por mensaje se calculan automaticamente al guardar.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 size={16} className="mr-1.5 animate-spin" />}
            {isEditing ? "Guardar cambios" : "Crear campana"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
