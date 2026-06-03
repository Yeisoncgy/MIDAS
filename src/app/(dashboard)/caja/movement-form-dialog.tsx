"use client"

import { useState } from "react"
import { Loader2, ArrowDownLeft, ArrowUpRight, ArrowRightLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCOP } from "@/lib/format"
import { toLocalDate } from "@/lib/date-periods"
import type { CashBankAccount, CashMovementType } from "@/lib/types"

const MOVEMENT_TYPES: { value: CashMovementType; label: string; icon: typeof ArrowDownLeft; color: string }[] = [
  { value: "in", label: "Ingreso", icon: ArrowDownLeft, color: "text-success border-success/30 bg-success/5" },
  { value: "out", label: "Egreso", icon: ArrowUpRight, color: "text-error border-error/30 bg-error/5" },
  { value: "transfer", label: "Transferencia", icon: ArrowRightLeft, color: "text-info border-info/30 bg-info/5" },
]

interface MovementFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: CashBankAccount[]
  onCompleted: () => void
}

export function MovementFormDialog({
  open,
  onOpenChange,
  accounts,
  onCompleted,
}: MovementFormDialogProps) {
  const supabase = createClient()
  const { user } = useAuth()

  const [movementType, setMovementType] = useState<CashMovementType>("in")
  const [accountId, setAccountId] = useState("")
  const [destAccountId, setDestAccountId] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [concept, setConcept] = useState("")
  const [movementDate, setMovementDate] = useState(() => toLocalDate(new Date()))
  const [loading, setLoading] = useState(false)

  const activeAccounts = accounts.filter((a) => a.is_active)
  const selectedAccount = activeAccounts.find((a) => a.id === accountId)
  const destOptions = activeAccounts.filter((a) => a.id !== accountId)

  const resetForm = () => {
    setMovementType("in")
    setAccountId("")
    setDestAccountId("")
    setAmount(null)
    setConcept("")
    setMovementDate(toLocalDate(new Date()))
  }

  // Si el usuario elige una fecha distinta de hoy, registramos con esa fecha
  // (a mediodía local para evitar saltos de día por zona horaria).
  const resolveTimestamp = (): string | undefined => {
    const today = toLocalDate(new Date())
    if (!movementDate || movementDate === today) return undefined
    return new Date(`${movementDate}T12:00:00`).toISOString()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!accountId || !amount || !concept.trim()) {
      toast.error("Cuenta, monto y concepto son requeridos")
      return
    }

    const parsedAmount = amount
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("El monto debe ser mayor a 0")
      return
    }

    if (movementType === "transfer" && !destAccountId) {
      toast.error("Selecciona una cuenta destino")
      return
    }

    if (movementType === "transfer" && accountId === destAccountId) {
      toast.error("La cuenta origen y destino no pueden ser la misma")
      return
    }

    // Obtener balance actual de la cuenta origen
    const { data: srcAccount } = await supabase
      .from("cash_bank_accounts")
      .select("balance")
      .eq("id", accountId)
      .single()

    if (!srcAccount) {
      toast.error("No se pudo obtener el balance de la cuenta")
      return
    }

    const currentBalance = srcAccount.balance

    // Validar fondos para egreso y transferencia
    if ((movementType === "out" || movementType === "transfer") && currentBalance < parsedAmount) {
      toast.error(`Fondos insuficientes. Balance actual: ${formatCOP(currentBalance)}`)
      return
    }

    setLoading(true)
    const customTimestamp = resolveTimestamp()

    try {
      if (movementType === "in") {
        // === INGRESO ===
        const newBalance = currentBalance + parsedAmount

        const { error: movError } = await supabase.from("cash_bank_movements").insert({
          account_id: accountId,
          movement_type: "in",
          amount: parsedAmount,
          previous_balance: currentBalance,
          new_balance: newBalance,
          concept: concept.trim(),
          created_by: user?.id,
          ...(customTimestamp ? { created_at: customTimestamp } : {}),
        })
        if (movError) throw movError

        const { error: accError } = await supabase
          .from("cash_bank_accounts")
          .update({ balance: newBalance })
          .eq("id", accountId)
        if (accError) throw accError

        toast.success(`Ingreso de ${formatCOP(parsedAmount)} registrado`, {
          description: concept.trim(),
        })
      } else if (movementType === "out") {
        // === EGRESO ===
        const newBalance = currentBalance - parsedAmount

        const { error: movError } = await supabase.from("cash_bank_movements").insert({
          account_id: accountId,
          movement_type: "out",
          amount: parsedAmount,
          previous_balance: currentBalance,
          new_balance: newBalance,
          concept: concept.trim(),
          created_by: user?.id,
          ...(customTimestamp ? { created_at: customTimestamp } : {}),
        })
        if (movError) throw movError

        const { error: accError } = await supabase
          .from("cash_bank_accounts")
          .update({ balance: newBalance })
          .eq("id", accountId)
        if (accError) throw accError

        toast.success(`Egreso de ${formatCOP(parsedAmount)} registrado`, {
          description: concept.trim(),
        })
      } else {
        // === TRANSFERENCIA ===
        // 1. Obtener balance de cuenta destino
        const { data: dstAccount } = await supabase
          .from("cash_bank_accounts")
          .select("balance")
          .eq("id", destAccountId)
          .single()

        if (!dstAccount) throw new Error("No se pudo obtener la cuenta destino")

        const srcNewBalance = currentBalance - parsedAmount
        const dstCurrentBalance = dstAccount.balance
        const dstNewBalance = dstCurrentBalance + parsedAmount

        const destName = activeAccounts.find((a) => a.id === destAccountId)?.name || ""
        const srcName = selectedAccount?.name || ""

        // 2. Movimiento salida (origen)
        const { error: outError } = await supabase.from("cash_bank_movements").insert({
          account_id: accountId,
          movement_type: "out",
          amount: parsedAmount,
          previous_balance: currentBalance,
          new_balance: srcNewBalance,
          concept: `Transferencia a ${destName} — ${concept.trim()}`,
          transfer_to_account_id: destAccountId,
          created_by: user?.id,
          ...(customTimestamp ? { created_at: customTimestamp } : {}),
        })
        if (outError) throw outError

        // 3. Movimiento entrada (destino)
        const { error: inError } = await supabase.from("cash_bank_movements").insert({
          account_id: destAccountId,
          movement_type: "in",
          amount: parsedAmount,
          previous_balance: dstCurrentBalance,
          new_balance: dstNewBalance,
          concept: `Transferencia desde ${srcName} — ${concept.trim()}`,
          reference_type: "transfer",
          reference_id: accountId,
          created_by: user?.id,
          ...(customTimestamp ? { created_at: customTimestamp } : {}),
        })
        if (inError) throw inError

        // 4. Actualizar balances
        const { error: srcUpdate } = await supabase
          .from("cash_bank_accounts")
          .update({ balance: srcNewBalance })
          .eq("id", accountId)
        if (srcUpdate) throw srcUpdate

        const { error: dstUpdate } = await supabase
          .from("cash_bank_accounts")
          .update({ balance: dstNewBalance })
          .eq("id", destAccountId)
        if (dstUpdate) throw dstUpdate

        toast.success(`Transferencia de ${formatCOP(parsedAmount)} realizada`, {
          description: `${srcName} → ${destName}`,
        })
      }

      resetForm()
      onOpenChange(false)
      onCompleted()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error desconocido"
      toast.error("Error al registrar movimiento", { description: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) resetForm(); onOpenChange(isOpen) }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nuevo movimiento</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo de movimiento */}
          <div className="space-y-1.5">
            <Label>Tipo de movimiento</Label>
            <div className="grid grid-cols-3 gap-2">
              {MOVEMENT_TYPES.map((mt) => {
                const Icon = mt.icon
                const isSelected = movementType === mt.value
                return (
                  <button
                    key={mt.value}
                    type="button"
                    onClick={() => setMovementType(mt.value)}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-sm font-medium transition-all ${
                      isSelected ? mt.color + " border-current" : "border-border text-muted-foreground hover:border-foreground/20"
                    }`}
                  >
                    <Icon size={18} />
                    {mt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cuenta origen */}
          <div className="space-y-1.5">
            <Label>{movementType === "transfer" ? "Cuenta origen" : "Cuenta"}</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona cuenta..." />
              </SelectTrigger>
              <SelectContent>
                {activeAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name} — {formatCOP(acc.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAccount && (
              <p className="text-xs text-muted-foreground">
                Balance actual: <span className="font-semibold text-foreground">{formatCOP(selectedAccount.balance)}</span>
              </p>
            )}
          </div>

          {/* Cuenta destino (solo transferencia) */}
          {movementType === "transfer" && (
            <div className="space-y-1.5">
              <Label>Cuenta destino</Label>
              <Select value={destAccountId} onValueChange={setDestAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona destino..." />
                </SelectTrigger>
                <SelectContent>
                  {destOptions.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name} — {formatCOP(acc.balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Monto y fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mov-amount">Monto (COP) *</Label>
              <MoneyInput
                id="mov-amount"
                value={amount}
                onValueChange={setAmount}
                placeholder="0"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mov-date">Fecha</Label>
              <Input
                id="mov-date"
                type="date"
                value={movementDate}
                max={toLocalDate(new Date())}
                onChange={(e) => setMovementDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Concepto */}
          <div className="space-y-1.5">
            <Label htmlFor="mov-concept">Concepto *</Label>
            <Input
              id="mov-concept"
              placeholder={
                movementType === "in" ? "Ej: Venta del día" :
                movementType === "out" ? "Ej: Compra de insumos" :
                "Ej: Paso a Bancolombia"
              }
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              disabled={loading}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 size={16} className="animate-spin mr-1.5" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
