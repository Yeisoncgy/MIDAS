"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
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
import { MoneyInput } from "@/components/ui/money-input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Subscription } from "@/lib/types"

interface SubscriptionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription: Subscription | null
  onCompleted: () => void
}

const BILLING_CYCLES = [
  { value: "monthly", label: "Mensual" },
  { value: "annual", label: "Anual" },
]

const STATUS_OPTIONS = [
  { value: "active", label: "Activa" },
  { value: "paused", label: "Pausada" },
  { value: "cancelled", label: "Cancelada" },
]

export function SubscriptionFormDialog({
  open,
  onOpenChange,
  subscription,
  onCompleted,
}: SubscriptionFormDialogProps) {
  const supabase = createClient()
  const isEditing = !!subscription

  const [toolName, setToolName] = useState("")
  const [monthlyCost, setMonthlyCost] = useState<number | null>(null)
  const [currency, setCurrency] = useState("COP")
  const [billingCycle, setBillingCycle] = useState("monthly")
  const [startDate, setStartDate] = useState("")
  const [nextRenewalDate, setNextRenewalDate] = useState("")
  const [status, setStatus] = useState("active")
  const [category, setCategory] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      if (subscription) {
        setToolName(subscription.tool_name)
        setMonthlyCost(subscription.monthly_cost)
        setCurrency(subscription.currency)
        setBillingCycle(subscription.billing_cycle)
        setStartDate(subscription.start_date?.split("T")[0] || "")
        setNextRenewalDate(subscription.next_renewal_date?.split("T")[0] || "")
        setStatus(subscription.status)
        setCategory(subscription.category || "")
        setNotes(subscription.notes || "")
      } else {
        setToolName("")
        setMonthlyCost(null)
        setCurrency("COP")
        setBillingCycle("monthly")
        setStartDate(new Date().toISOString().split("T")[0])
        setNextRenewalDate("")
        setStatus("active")
        setCategory("")
        setNotes("")
      }
    }
  }, [open, subscription])

  const handleSubmit = async () => {
    if (!toolName.trim()) {
      toast.error("El nombre de la herramienta es obligatorio")
      return
    }
    if (!monthlyCost || monthlyCost <= 0) {
      toast.error("El costo mensual debe ser mayor a 0")
      return
    }
    if (!startDate) {
      toast.error("La fecha de inicio es obligatoria")
      return
    }
    if (!nextRenewalDate) {
      toast.error("La fecha de proxima renovacion es obligatoria")
      return
    }

    setLoading(true)

    try {
      const payload = {
        tool_name: toolName.trim(),
        monthly_cost: monthlyCost,
        currency,
        billing_cycle: billingCycle,
        start_date: startDate,
        next_renewal_date: nextRenewalDate,
        status,
        category: category.trim() || null,
        notes: notes.trim() || null,
      }

      if (isEditing) {
        const { error } = await supabase
          .from("subscriptions")
          .update(payload)
          .eq("id", subscription.id)
        if (error) throw error
        toast.success("Suscripcion actualizada")
      } else {
        const { error } = await supabase.from("subscriptions").insert(payload)
        if (error) throw error
        toast.success("Suscripcion creada", { description: toolName.trim() })
      }

      onOpenChange(false)
      onCompleted()
    } catch {
      toast.error("Error al guardar la suscripcion")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] text-xl">
            {isEditing ? "Editar suscripcion" : "Nueva suscripcion"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1">Herramienta *</Label>
            <Input
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="Ej: Midjourney, Claude Pro, Canva..."
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Costo mensual *</Label>
              <MoneyInput
                value={monthlyCost}
                onValueChange={setMonthlyCost}
                placeholder="0"
                disabled={loading}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Moneda</Label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="COP"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Ciclo de facturacion</Label>
              <Select value={billingCycle} onValueChange={setBillingCycle}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Categoria</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ej: Diseno, IA..."
                disabled={loading}
              />
            </div>
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
              <Label className="text-xs text-muted-foreground mb-1">Proxima renovacion *</Label>
              <Input
                type="date"
                value={nextRenewalDate}
                onChange={(e) => setNextRenewalDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {isEditing && (
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
          )}

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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 size={16} className="mr-1.5 animate-spin" />}
            {isEditing ? "Guardar cambios" : "Crear suscripcion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
