"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
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
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/money-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable, type Column } from "@/components/shared/data-table"
import { formatCOP, formatDateShort } from "@/lib/format"
import { PAYMENT_METHODS } from "@/lib/constants"
import { registerCashMovement, findAccountForMethod } from "@/lib/cash-movements"
import type { SaleExpanded } from "./recibo-termico"

interface PaymentRecord {
  id: string
  amount: number
  payment_method: string
  payment_date: string
  notes: string | null
  registered_by: string
  created_at: string
}

interface AccountReceivable {
  id: string
  total_amount: number
  paid_amount: number
  remaining_amount: number
  status: string
}

interface AbonosDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sale: SaleExpanded | null
  onPaymentRegistered: () => void
}

/**
 * Diálogo para gestionar abonos de ventas a crédito.
 * Muestra el historial de pagos y permite registrar nuevos abonos.
 */
export function AbonosDialog({ open, onOpenChange, sale, onPaymentRegistered }: AbonosDialogProps) {
  const { user } = useAuth()
  const supabase = createClient()

  const [accountReceivable, setAccountReceivable] = useState<AccountReceivable | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Formulario de nuevo abono
  const [showNewPayment, setShowNewPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState("nequi")
  const [paymentNotes, setPaymentNotes] = useState("")

  // Cargar cuenta por cobrar y pagos cuando se abre
  const fetchData = useCallback(async () => {
    if (!sale?.id) return
    setLoading(true)

    // Obtener la cuenta por cobrar de esta venta
    const { data: arData } = await supabase
      .from("accounts_receivable")
      .select("*")
      .eq("sale_id", sale.id)
      .single()

    if (arData) {
      setAccountReceivable(arData as AccountReceivable)

      // Obtener los pagos registrados
      const { data: payData } = await supabase
        .from("payment_records")
        .select("*")
        .eq("type", "receivable")
        .eq("reference_id", arData.id)
        .order("payment_date", { ascending: true })

      if (payData) {
        setPayments(payData as PaymentRecord[])
      }
    }

    setLoading(false)
  }, [sale?.id, supabase])

  useEffect(() => {
    if (open && sale?.is_credit) {
      fetchData()
    }
  }, [open, sale?.is_credit, fetchData])

  // Registrar nuevo abono
  const handleRegisterPayment = useCallback(async () => {
    if (!accountReceivable || !user || paymentAmount <= 0) {
      toast.error("Ingresa un monto válido")
      return
    }

    if (paymentAmount > accountReceivable.remaining_amount) {
      toast.error(`El monto máximo es ${formatCOP(accountReceivable.remaining_amount)}`)
      return
    }

    setSubmitting(true)

    try {
      // Obtener cuenta de pago según método
      const accountId = await findAccountForMethod(supabase, paymentMethod)

      // 1. Registrar el pago
      await supabase.from("payment_records").insert({
        type: "receivable",
        reference_id: accountReceivable.id,
        amount: paymentAmount,
        payment_method: paymentMethod,
        payment_account_id: accountId,
        payment_date: new Date().toISOString(),
        notes: paymentNotes.trim() || `Abono - ${sale?.invoice_number}`,
        registered_by: user.id,
      })

      // 1b. Registrar movimiento de caja (ingreso)
      if (accountId) {
        await registerCashMovement(supabase, {
          accountId,
          type: "in",
          amount: paymentAmount,
          concept: `Abono CxC ${sale?.invoice_number || ""}`,
          referenceType: "payment_record",
          referenceId: accountReceivable.id,
          createdBy: user.id,
        })
      }

      // 2. Actualizar cuenta por cobrar
      const newPaid = accountReceivable.paid_amount + paymentAmount
      const newRemaining = accountReceivable.total_amount - newPaid
      const newStatus = newRemaining <= 0 ? "paid" : "partial"

      await supabase
        .from("accounts_receivable")
        .update({
          paid_amount: newPaid,
          remaining_amount: Math.max(0, newRemaining),
          status: newStatus,
        })
        .eq("id", accountReceivable.id)

      // 3. Si la deuda se pagó completamente, actualizar el estado de la venta
      if (newRemaining <= 0 && sale?.id) {
        await supabase
          .from("sales")
          .update({ status: "paid" })
          .eq("id", sale.id)
      }

      toast.success(`Abono de ${formatCOP(paymentAmount)} registrado`)

      // Resetear formulario
      setPaymentAmount(0)
      setPaymentNotes("")
      setShowNewPayment(false)

      // Recargar datos
      await fetchData()
      onPaymentRegistered()
    } catch {
      toast.error("Error al registrar el abono")
    } finally {
      setSubmitting(false)
    }
  }, [accountReceivable, user, paymentAmount, paymentMethod, paymentNotes, sale, supabase, fetchData, onPaymentRegistered])

  // === Columnas del historial de pagos ===
  const paymentColumns = useMemo<Column<PaymentRecord>[]>(
    () => [
      {
        key: "date",
        header: "Fecha",
        sortAccessor: (p) => p.payment_date,
        cell: (payment) => (
          <span className="text-muted-foreground">{formatDateShort(payment.payment_date)}</span>
        ),
      },
      {
        key: "method",
        header: "Método",
        cell: (payment) =>
          PAYMENT_METHODS.find((m) => m.value === payment.payment_method)?.label ||
          payment.payment_method,
      },
      {
        key: "amount",
        header: "Monto",
        align: "right",
        sortAccessor: (p) => p.amount,
        cell: (payment) => (
          <span className="font-semibold text-success">{formatCOP(payment.amount)}</span>
        ),
      },
      {
        key: "notes",
        header: "Nota",
        className: "max-w-[140px]",
        cell: (payment) => (
          <span className="block truncate text-xs text-muted-foreground">
            {payment.notes || "—"}
          </span>
        ),
      },
    ],
    []
  )

  if (!sale?.is_credit) return null

  const progressPercentage = accountReceivable
    ? Math.round((accountReceivable.paid_amount / accountReceivable.total_amount) * 100)
    : 0

  const isPaidOff = accountReceivable?.remaining_amount === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <CreditCard size={22} className="text-gold" />
            <span className="font-[family-name:var(--font-display)] text-xl">
              Abonos — {sale.invoice_number}
            </span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gold" />
          </div>
        ) : accountReceivable ? (
          <div className="space-y-5">
            {/* Resumen del crédito */}
            <div className="bg-cream rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
                  Resumen de crédito
                </span>
                {isPaidOff ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-success">
                    <CheckCircle size={14} />
                    PAGADO
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
                  <p className="text-sm font-semibold tabular-nums">{formatCOP(accountReceivable.total_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pagado</p>
                  <p className="text-sm font-semibold tabular-nums text-success">{formatCOP(accountReceivable.paid_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pendiente</p>
                  <p className="text-sm font-semibold tabular-nums text-error">{formatCOP(accountReceivable.remaining_amount)}</p>
                </div>
              </div>

              {/* Info del crédito */}
              <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                <span>Cliente: {sale.client?.full_name}</span>
                <span>Comisión: {sale.credit_fee_percentage}%</span>
              </div>
            </div>

            {/* Historial de pagos */}
            {payments.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground mb-2">
                  Historial de pagos
                </h4>
                <DataTable
                  data={payments}
                  columns={paymentColumns}
                  rowKey={(p) => p.id}
                  density="compact"
                />
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
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Monto (máx. {formatCOP(accountReceivable.remaining_amount)})
                        </Label>
                        <MoneyInput
                          value={paymentAmount || null}
                          onValueChange={(v) => setPaymentAmount(v ?? 0)}
                          max={accountReceivable.remaining_amount}
                          showMaxButton
                          maxButtonLabel="Saldar"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Método de pago</Label>
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
                        disabled={submitting || paymentAmount <= 0}
                        className="flex-1"
                      >
                        {submitting && <Loader2 size={16} className="mr-1.5 animate-spin" />}
                        Registrar abono de {formatCOP(paymentAmount || 0)}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setShowNewPayment(false)
                          setPaymentAmount(0)
                          setPaymentNotes("")
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No se encontró la cuenta por cobrar para esta venta.</p>
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
