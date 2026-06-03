"use client"

import { useState, useCallback, useEffect } from "react"
import { CreditCard, Plus, Loader2, CheckCircle } from "lucide-react"
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
import { MoneyInput } from "@/components/ui/money-input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCOP, formatDateShort } from "@/lib/format"
import { PAYMENT_METHODS } from "@/lib/constants"
import { registerCashMovement, findAccountForMethod } from "@/lib/cash-movements"

interface PaymentRecord {
  id: string
  amount: number
  payment_method: string
  payment_date: string
  notes: string | null
  created_at: string
}

export interface AccountPayableExpanded {
  id: string
  supplier_id: string
  expense_id: string | null
  total_amount: number
  paid_amount: number
  remaining_amount: number
  due_date: string | null
  status: string
  notes: string | null
  created_at: string
  supplier?: { name: string }
  expense?: { concept: string }
}

interface APPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: AccountPayableExpanded | null
  onPaymentRegistered: () => void
}

export function APPaymentDialog({
  open,
  onOpenChange,
  account,
  onPaymentRegistered,
}: APPaymentDialogProps) {
  const { user } = useAuth()
  const supabase = createClient()

  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Formulario nuevo abono
  const [showNewPayment, setShowNewPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState("efectivo")
  const [paymentNotes, setPaymentNotes] = useState("")

  // Datos actualizados de la cuenta
  const [currentAccount, setCurrentAccount] = useState<AccountPayableExpanded | null>(null)

  // Cargar datos
  const fetchData = useCallback(async () => {
    if (!account?.id) return
    setLoading(true)

    // Recargar la cuenta por pagar
    const { data: apData } = await supabase
      .from("accounts_payable")
      .select("*, supplier:suppliers(name), expense:expenses(concept)")
      .eq("id", account.id)
      .single()

    if (apData) {
      setCurrentAccount(apData as unknown as AccountPayableExpanded)

      // Obtener pagos registrados
      const { data: payData } = await supabase
        .from("payment_records")
        .select("*")
        .eq("type", "payable")
        .eq("reference_id", apData.id)
        .order("payment_date", { ascending: true })

      if (payData) setPayments(payData as PaymentRecord[])
    }

    setLoading(false)
  }, [account?.id, supabase])

  useEffect(() => {
    if (open && account) {
      setCurrentAccount(account)
      fetchData()
      setShowNewPayment(false)
      setPaymentAmount(null)
      setPaymentNotes("")
    }
  }, [open, account, fetchData])

  // Registrar abono
  const handleRegisterPayment = useCallback(async () => {
    if (!currentAccount || !user || paymentAmount === null || paymentAmount <= 0) {
      toast.error("Ingresa un monto válido")
      return
    }

    const abono = paymentAmount

    if (abono > currentAccount.remaining_amount) {
      toast.error(`El monto máximo es ${formatCOP(currentAccount.remaining_amount)}`)
      return
    }

    setSubmitting(true)

    try {
      // Obtener cuenta de pago según método
      const accountId = await findAccountForMethod(supabase, paymentMethod)

      // 1. Registrar pago
      const { error: payError } = await supabase.from("payment_records").insert({
        type: "payable",
        reference_id: currentAccount.id,
        amount: abono,
        payment_method: paymentMethod,
        payment_account_id: accountId,
        payment_date: new Date().toISOString(),
        notes: paymentNotes.trim() || `Abono — ${currentAccount.supplier?.name || "Proveedor"}`,
        registered_by: user.id,
      })

      if (payError) throw payError

      // 1b. Registrar movimiento de caja (egreso)
      if (accountId) {
        await registerCashMovement(supabase, {
          accountId,
          type: "out",
          amount: abono,
          concept: `Pago CxP ${currentAccount.supplier?.name || "Proveedor"}`,
          referenceType: "payment_record",
          referenceId: currentAccount.id,
          createdBy: user.id,
        })
      }

      // 2. Actualizar cuenta por pagar
      const newPaid = currentAccount.paid_amount + abono
      const newRemaining = currentAccount.total_amount - newPaid
      const newStatus = newRemaining <= 0 ? "paid" : "partial"

      const { error: apError } = await supabase
        .from("accounts_payable")
        .update({
          paid_amount: newPaid,
          remaining_amount: Math.max(0, newRemaining),
          status: newStatus,
        })
        .eq("id", currentAccount.id)

      if (apError) throw apError

      if (newRemaining <= 0) {
        toast.success("Cuenta saldada completamente", {
          description: `${currentAccount.supplier?.name} — ${formatCOP(currentAccount.total_amount)}`,
        })
      } else {
        toast.success(`Abono de ${formatCOP(abono)} registrado`)
      }

      // Reset form
      setPaymentAmount(null)
      setPaymentNotes("")
      setShowNewPayment(false)

      // Recargar
      await fetchData()
      onPaymentRegistered()
    } catch {
      toast.error("Error al registrar el abono")
    } finally {
      setSubmitting(false)
    }
  }, [currentAccount, user, paymentAmount, paymentMethod, paymentNotes, supabase, fetchData, onPaymentRegistered])

  if (!account) return null

  const displayAccount = currentAccount || account
  const progressPercentage = Math.round(
    (displayAccount.paid_amount / displayAccount.total_amount) * 100
  )
  const isPaidOff = displayAccount.remaining_amount <= 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <CreditCard size={22} className="text-gold" />
            <span className="font-[family-name:var(--font-display)] text-xl">
              Cuenta por pagar
            </span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gold" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Resumen de la deuda */}
            <div className="bg-cream rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
                  Resumen de deuda
                </span>
                {isPaidOff ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-success">
                    <CheckCircle size={14} />
                    SALDADA
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-warning">
                    {progressPercentage}% pagado
                  </span>
                )}
              </div>

              {/* Barra de progreso */}
              <div className="w-full bg-border rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isPaidOff ? "bg-success" : "bg-gold"
                  }`}
                  style={{ width: `${Math.min(100, progressPercentage)}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Total deuda</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatCOP(displayAccount.total_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pagado</p>
                  <p className="text-sm font-semibold tabular-nums text-success">
                    {formatCOP(displayAccount.paid_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pendiente</p>
                  <p className="text-sm font-semibold tabular-nums text-error">
                    {formatCOP(displayAccount.remaining_amount)}
                  </p>
                </div>
              </div>

              {/* Info proveedor y concepto */}
              <div className="flex flex-col gap-1 text-xs text-muted-foreground pt-2 border-t border-border">
                <div className="flex justify-between">
                  <span>Proveedor: {displayAccount.supplier?.name || "—"}</span>
                  {displayAccount.due_date && (
                    <span>Vence: {formatDateShort(displayAccount.due_date)}</span>
                  )}
                </div>
                {displayAccount.expense?.concept && (
                  <span>Concepto: {displayAccount.expense.concept}</span>
                )}
              </div>
            </div>

            {/* Historial de pagos */}
            {payments.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground mb-2">
                  Historial de pagos
                </h4>
                <div className="bg-card rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-cream hover:bg-cream">
                        <TableHead className="text-xs font-semibold text-muted-foreground">Fecha</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground">Método</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground text-right">Monto</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground">Nota</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="text-sm">
                            {formatDateShort(payment.payment_date)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {PAYMENT_METHODS.find((m) => m.value === payment.payment_method)?.label ||
                              payment.payment_method}
                          </TableCell>
                          <TableCell className="text-sm text-right font-semibold text-success tabular-nums">
                            {formatCOP(payment.amount)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                            {payment.notes || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Formulario de nuevo abono */}
            {!isPaidOff && (
              <div>
                {!showNewPayment ? (
                  <Button
                    variant="outline"
                    className="w-full border-gold/30 text-gold hover:bg-gold/5"
                    onClick={() => setShowNewPayment(true)}
                  >
                    <Plus size={16} className="mr-1.5" />
                    Registrar abono
                  </Button>
                ) : (
                  <div className="bg-cream rounded-lg p-4 space-y-3">
                    <h4 className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
                      Nuevo abono
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Monto (máx. {formatCOP(displayAccount.remaining_amount)})
                        </Label>
                        <MoneyInput
                          value={paymentAmount}
                          onValueChange={setPaymentAmount}
                          max={displayAccount.remaining_amount}
                          showMaxButton
                          maxButtonLabel="Saldar todo"
                          placeholder="0"
                          disabled={submitting}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1">Método de pago</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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

                    <div>
                      <Label className="text-xs text-muted-foreground mb-1">Nota (opcional)</Label>
                      <Input
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        placeholder="Nota del abono..."
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleRegisterPayment}
                        disabled={submitting || !paymentAmount || paymentAmount <= 0}
                        className="flex-1"
                      >
                        {submitting && <Loader2 size={16} className="mr-1.5 animate-spin" />}
                        Registrar abono de {formatCOP(paymentAmount || 0)}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setShowNewPayment(false)
                          setPaymentAmount(null)
                          setPaymentNotes("")
                        }}
                        disabled={submitting}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
