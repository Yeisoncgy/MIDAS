"use client"

import { useState, useEffect } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCOP } from "@/lib/format"
import { PAYMENT_METHODS } from "@/lib/constants"
import { registerCashMovement, findAccountForMethod } from "@/lib/cash-movements"
import type { Partner, PartnerWithdrawal } from "@/lib/types"

type WithdrawalExpanded = PartnerWithdrawal & {
  partner?: { name: string }
}

interface WithdrawalFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  partners: Partner[]
  partnerUtilities: Record<string, number>
  withdrawal?: WithdrawalExpanded | null
  defaultPartnerId?: string
  onCompleted: () => void
}

export function WithdrawalFormDialog({
  open,
  onOpenChange,
  partners,
  partnerUtilities,
  withdrawal,
  defaultPartnerId,
  onCompleted,
}: WithdrawalFormDialogProps) {
  const { user } = useAuth()
  const supabase = createClient()

  const isEditing = !!withdrawal

  const [partnerId, setPartnerId] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState("efectivo")
  const [withdrawalDate, setWithdrawalDate] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const activePartners = partners.filter((p) => p.is_active)
  const selectedPartner = activePartners.find((p) => p.id === partnerId)
  const disponible = selectedPartner ? (partnerUtilities[selectedPartner.id] || 0) : 0

  // En modo edición, sumar el monto original de vuelta al disponible (ya fue descontado)
  const disponibleAjustado = isEditing && withdrawal.partner_id === partnerId
    ? disponible + withdrawal.amount
    : disponible

  const amountValue = amount ?? 0
  const excedente =
    amountValue > 0 && amountValue > disponibleAjustado
      ? amountValue - disponibleAjustado
      : 0
  // Sobre-retiro BLOQUEANTE: no se permite retirar más de lo disponible.
  const sobreRetiro = excedente > 0
  const disponibleParaRetiro = Math.max(0, disponibleAjustado)

  useEffect(() => {
    if (open) {
      if (withdrawal) {
        // Modo edición: prellenar con datos existentes
        setPartnerId(withdrawal.partner_id)
        setAmount(withdrawal.amount)
        setMethod(withdrawal.method)
        setWithdrawalDate(withdrawal.withdrawal_date)
        setNotes(withdrawal.notes || "")
      } else {
        // Modo creación
        setPartnerId(
          defaultPartnerId || (activePartners.length === 1 ? activePartners[0].id : "")
        )
        setAmount(null)
        setMethod("efectivo")
        setWithdrawalDate(new Date().toISOString().split("T")[0])
        setNotes("")
      }
    }
  }, [open, withdrawal, defaultPartnerId, activePartners.length])

  const handleSubmit = async () => {
    if (!partnerId) {
      toast.error("Selecciona un socio")
      return
    }
    if (!user) {
      toast.error("Sesión no válida")
      return
    }
    if (amountValue <= 0) {
      toast.error("Ingresa un monto válido")
      return
    }
    // Validación BLOQUEANTE de sobre-retiro
    if (sobreRetiro) {
      toast.error("El retiro excede la utilidad disponible", {
        description: `Máximo disponible: ${formatCOP(disponibleParaRetiro)}`,
      })
      return
    }

    setSubmitting(true)

    try {
      const partnerName = selectedPartner?.name || "Socio"

      if (isEditing) {
        // ═══ MODO EDICIÓN ═══
        const { error: wErr } = await supabase
          .from("partner_withdrawals")
          .update({
            partner_id: partnerId,
            amount: amountValue,
            method,
            withdrawal_date: withdrawalDate,
            notes: notes.trim() || null,
          })
          .eq("id", withdrawal.id)

        if (wErr) throw wErr

        // Si cambió monto o método, revertir movimiento anterior y crear uno nuevo
        if (amountValue !== withdrawal.amount || method !== withdrawal.method) {
          // Buscar y eliminar movimiento de caja anterior
          const { data: oldMovements } = await supabase
            .from("cash_bank_movements")
            .select("id, account_id, amount")
            .eq("reference_type", "partner_withdrawal")
            .eq("reference_id", withdrawal.partner_id)
            .eq("amount", withdrawal.amount)
            .order("created_at", { ascending: false })
            .limit(1)

          if (oldMovements && oldMovements.length > 0) {
            const oldMov = oldMovements[0]

            // Revertir balance de la cuenta anterior
            const { data: oldAccount } = await supabase
              .from("cash_bank_accounts")
              .select("balance")
              .eq("id", oldMov.account_id)
              .single()

            if (oldAccount) {
              await supabase
                .from("cash_bank_accounts")
                .update({ balance: oldAccount.balance + oldMov.amount })
                .eq("id", oldMov.account_id)
            }

            await supabase
              .from("cash_bank_movements")
              .delete()
              .eq("id", oldMov.id)
          }

          // Crear nuevo movimiento con los datos actualizados
          const cashAccountId = await findAccountForMethod(supabase, method)
          if (cashAccountId) {
            await registerCashMovement(supabase, {
              accountId: cashAccountId,
              type: "out",
              amount: amountValue,
              concept: `Retiro socio: ${partnerName}`,
              referenceType: "partner_withdrawal",
              referenceId: partnerId,
              createdBy: user.id,
            })
          }
        }

        toast.success("Retiro actualizado", {
          description: `${formatCOP(amountValue)} — ${partnerName}`,
        })
      } else {
        // ═══ MODO CREACIÓN ═══
        const { error: wErr } = await supabase.from("partner_withdrawals").insert({
          partner_id: partnerId,
          amount: amountValue,
          method,
          withdrawal_date: withdrawalDate,
          approved_by: user.id,
          notes: notes.trim() || null,
        })

        if (wErr) throw wErr

        // Registrar movimiento de caja (egreso)
        const cashAccountId = await findAccountForMethod(supabase, method)
        if (cashAccountId) {
          await registerCashMovement(supabase, {
            accountId: cashAccountId,
            type: "out",
            amount: amountValue,
            concept: `Retiro socio: ${partnerName}`,
            referenceType: "partner_withdrawal",
            referenceId: partnerId,
            createdBy: user.id,
          })
        }

        toast.success(`Retiro de ${formatCOP(amountValue)} registrado`, {
          description: partnerName,
        })
      }

      onOpenChange(false)
      onCompleted()
    } catch {
      toast.error(isEditing ? "Error al actualizar el retiro" : "Error al registrar el retiro")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] text-xl">
            {isEditing ? "Editar retiro" : "Registrar retiro"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1">Socio *</Label>
            <Select
              value={partnerId}
              onValueChange={setPartnerId}
              disabled={!!defaultPartnerId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar socio" />
              </SelectTrigger>
              <SelectContent>
                {activePartners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.distribution_percentage}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPartner && (
            <div className="bg-cream rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Utilidad disponible</span>
                <span className={`font-semibold tabular-nums ${disponibleAjustado > 0 ? "text-success" : disponibleAjustado < 0 ? "text-error" : "text-muted-foreground"}`}>
                  {formatCOP(disponibleAjustado)}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Monto *</Label>
              <MoneyInput
                value={amount}
                onValueChange={setAmount}
                placeholder="0"
                max={selectedPartner ? disponibleParaRetiro : undefined}
                showMaxButton={!!selectedPartner && disponibleParaRetiro > 0}
                maxButtonLabel="Máx"
                aria-invalid={sobreRetiro}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Método de pago</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((pm) => (
                    <SelectItem key={pm.value} value={pm.value}>
                      {pm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Alerta BLOQUEANTE de sobre-retiro */}
          {sobreRetiro && (
            <div className="flex items-start gap-2.5 bg-error-bg border border-error/20 rounded-lg p-3 text-sm">
              <AlertTriangle size={16} className="text-error shrink-0 mt-0.5" />
              <p className="text-error">
                El retiro excede la utilidad disponible por{" "}
                <span className="font-semibold">{formatCOP(excedente)}</span>. El monto
                máximo permitido es{" "}
                <span className="font-semibold">{formatCOP(disponibleParaRetiro)}</span>.
              </p>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground mb-1">Fecha</Label>
            <Input
              type="date"
              value={withdrawalDate}
              onChange={(e) => setWithdrawalDate(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1">Notas (opcional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nota del retiro..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || amountValue <= 0 || !partnerId || sobreRetiro}
          >
            {submitting && <Loader2 size={16} className="mr-1.5 animate-spin" />}
            {isEditing ? "Guardar cambios" : `Registrar retiro de ${formatCOP(amountValue)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
