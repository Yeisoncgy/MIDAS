"use client"

import { useState, useCallback, useEffect } from "react"
import { CreditCard, Loader2, CheckCircle, AlertTriangle } from "lucide-react"
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

export interface CxCExpanded {
  id: string
  client_id: string
  sale_id: string
  total_amount: number
  paid_amount: number
  remaining_amount: number
  due_date: string | null
  status: string
  notes: string | null
  created_at: string
  client?: { full_name: string }
  sale?: { invoice_number: string }
}

export interface CxPExpanded {
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

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: "receivable" | "payable"
  receivable?: CxCExpanded | null
  payable?: CxPExpanded | null
  onCompleted: () => void
}

/** Una cuenta está vencida si su fecha de vencimiento ya pasó y aún queda saldo. */
function isOverdue(dueDate: string | null | undefined, remaining: number): boolean {
  if (!dueDate || remaining <= 0) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dueDate) < today
}

export function PaymentDialog({
  open,
  onOpenChange,
  type,
  receivable,
  payable,
  onCompleted,
}: PaymentDialogProps) {
  const { user } = useAuth()
  const supabase = createClient()

  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Live data
  const [liveTotal, setLiveTotal] = useState(0)
  const [livePaid, setLivePaid] = useState(0)
  const [liveRemaining, setLiveRemaining] = useState(0)
  const [liveStatus, setLiveStatus] = useState("")

  // Form (expandido por defecto). MoneyInput entrega number | null.
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState("efectivo")
  const [paymentNotes, setPaymentNotes] = useState("")

  const accountId = type === "receivable" ? receivable?.id : payable?.id
  const tableName = type === "receivable" ? "accounts_receivable" : "accounts_payable"

  // Título y entidad
  const title = type === "receivable" ? "Cuenta por cobrar" : "Cuenta por pagar"
  const entityName = type === "receivable"
    ? receivable?.client?.full_name || "Cliente"
    : payable?.supplier?.name || "Proveedor"
  const reference = type === "receivable"
    ? receivable?.sale?.invoice_number || ""
    : payable?.expense?.concept || ""
  const dueDate = type === "receivable" ? receivable?.due_date : payable?.due_date

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!accountId) return
    setLoading(true)

    // Reload the account
    const joinSelect = type === "receivable"
      ? "*, client:clients(full_name), sale:sales(invoice_number)"
      : "*, supplier:suppliers(name), expense:expenses(concept)"

    const { data: accData } = await supabase
      .from(tableName)
      .select(joinSelect)
      .eq("id", accountId)
      .single()

    if (accData) {
      setLiveTotal(accData.total_amount)
      setLivePaid(accData.paid_amount)
      setLiveRemaining(accData.remaining_amount)
      setLiveStatus(accData.status)
    }

    // Payments
    const { data: payData } = await supabase
      .from("payment_records")
      .select("*")
      .eq("type", type)
      .eq("reference_id", accountId)
      .order("payment_date", { ascending: true })

    if (payData) setPayments(payData as PaymentRecord[])
    setLoading(false)
  }, [accountId, type, tableName, supabase])

  useEffect(() => {
    if (open && accountId) {
      // Init from props
      if (type === "receivable" && receivable) {
        setLiveTotal(receivable.total_amount)
        setLivePaid(receivable.paid_amount)
        setLiveRemaining(receivable.remaining_amount)
        setLiveStatus(receivable.status)
      } else if (type === "payable" && payable) {
        setLiveTotal(payable.total_amount)
        setLivePaid(payable.paid_amount)
        setLiveRemaining(payable.remaining_amount)
        setLiveStatus(payable.status)
      }
      fetchData()
      setPaymentAmount(null)
      setPaymentNotes("")
      setPaymentMethod("efectivo")
    }
  }, [open, accountId, type, receivable, payable, fetchData])

  // Register payment
  const handleRegisterPayment = useCallback(async () => {
    const amount = paymentAmount ?? 0
    if (!accountId || !user || amount <= 0) {
      toast.error("Ingresa un monto válido")
      return
    }

    if (amount > liveRemaining) {
      toast.error(`El monto máximo es ${formatCOP(liveRemaining)}`)
      return
    }

    setSubmitting(true)

    try {
      const cashAccountId = await findAccountForMethod(supabase, paymentMethod)

      // 1. Insert payment record
      const { error: payError } = await supabase.from("payment_records").insert({
        type,
        reference_id: accountId,
        amount,
        payment_method: paymentMethod,
        payment_account_id: cashAccountId,
        payment_date: new Date().toISOString(),
        notes: paymentNotes.trim() || `Abono — ${entityName}`,
        registered_by: user.id,
      })

      if (payError) throw payError

      // 2. Cash movement
      if (cashAccountId) {
        await registerCashMovement(supabase, {
          accountId: cashAccountId,
          type: type === "receivable" ? "in" : "out",
          amount,
          concept: type === "receivable"
            ? `Abono CxC ${reference}`
            : `Pago CxP ${entityName}`,
          referenceType: "payment_record",
          referenceId: accountId,
          createdBy: user.id,
        })
      }

      // 3. Update account
      const newPaid = livePaid + amount
      const newRemaining = liveTotal - newPaid
      const newStatus = newRemaining <= 0 ? "paid" : "partial"

      const { error: updError } = await supabase
        .from(tableName)
        .update({
          paid_amount: newPaid,
          remaining_amount: Math.max(0, newRemaining),
          status: newStatus,
        })
        .eq("id", accountId)

      if (updError) throw updError

      // 4. If CxC paid off, update sale status
      if (type === "receivable" && newRemaining <= 0 && receivable?.sale_id) {
        await supabase
          .from("sales")
          .update({ status: "paid" })
          .eq("id", receivable.sale_id)
      }

      if (newRemaining <= 0) {
        toast.success("Cuenta saldada completamente", {
          description: `${entityName} — ${formatCOP(liveTotal)}`,
        })
      } else {
        toast.success(`Abono de ${formatCOP(amount)} registrado`)
      }

      // Reset
      setPaymentAmount(null)
      setPaymentNotes("")

      await fetchData()
      onCompleted()
    } catch {
      toast.error("Error al registrar el abono")
    } finally {
      setSubmitting(false)
    }
  }, [accountId, user, paymentAmount, paymentMethod, paymentNotes, type, liveTotal, livePaid, liveRemaining, entityName, reference, receivable, tableName, supabase, fetchData, onCompleted])

  if (!accountId) return null

  const progressPercentage = liveTotal > 0
    ? Math.round((livePaid / liveTotal) * 100)
    : 0
  const isPaidOff = liveStatus === "paid" || liveRemaining <= 0
  const overdue = !isPaidOff && isOverdue(dueDate, liveRemaining)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <CreditCard size={22} className="text-gold" />
            <span className="font-[family-name:var(--font-display)] text-xl">
              {title}
            </span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gold" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary */}
            <div className="bg-cream rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
                  Resumen
                </span>
                {isPaidOff ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-success">
                    <CheckCircle size={14} />
                    {type === "receivable" ? "COBRADA" : "SALDADA"}
                  </span>
                ) : overdue ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-error">
                    <AlertTriangle size={14} />
                    VENCIDA
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-warning">
                    {progressPercentage}% pagado
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full bg-border rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isPaidOff ? "bg-success" : overdue ? "bg-error" : "bg-gold"
                  }`}
                  style={{ width: `${Math.min(100, progressPercentage)}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-sm font-semibold tabular-nums">{formatCOP(liveTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pagado</p>
                  <p className="text-sm font-semibold tabular-nums text-success">{formatCOP(livePaid)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pendiente</p>
                  <p className="text-sm font-semibold tabular-nums text-error">{formatCOP(liveRemaining)}</p>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-xs text-muted-foreground pt-2 border-t border-border">
                <div className="flex justify-between">
                  <span>{type === "receivable" ? "Cliente" : "Proveedor"}: {entityName}</span>
                  {dueDate && (
                    <span className={overdue ? "font-semibold text-error" : ""}>
                      Vence: {formatDateShort(dueDate)}
                    </span>
                  )}
                </div>
                {reference && (
                  <span>{type === "receivable" ? "Factura" : "Concepto"}: {reference}</span>
                )}
              </div>
            </div>

            {/* Payment history */}
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
                            {PAYMENT_METHODS.find((m) => m.value === payment.payment_method)?.label || payment.payment_method}
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

            {/* New payment form — expandido por defecto */}
            {!isPaidOff && (
              <div className="bg-cream rounded-lg p-4 space-y-3">
                <h4 className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
                  Nuevo abono
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1">
                      Monto (máx. {formatCOP(liveRemaining)})
                    </Label>
                    <MoneyInput
                      value={paymentAmount}
                      onValueChange={setPaymentAmount}
                      max={liveRemaining}
                      showMaxButton
                      maxButtonLabel="Saldar todo"
                      placeholder="0"
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

                <Button
                  onClick={handleRegisterPayment}
                  disabled={submitting || (paymentAmount ?? 0) <= 0}
                  className="w-full"
                >
                  {submitting && <Loader2 size={16} className="mr-1.5 animate-spin" />}
                  Registrar abono de {formatCOP(paymentAmount ?? 0)}
                </Button>
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
