"use client"

import { useState, useEffect } from "react"
import { Loader2, Plus, ChevronDown } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PAYMENT_METHODS } from "@/lib/constants"
import { registerCashMovement } from "@/lib/cash-movements"
import { toLocalDate } from "@/lib/date-periods"
import type { Expense, ExpenseCategory, Supplier, CashBankAccount } from "@/lib/types"
import { SupplierFormDialog } from "@/app/(dashboard)/proveedores/supplier-form-dialog"

interface ExpenseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense: Expense | null
  onCompleted: () => void
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  onCompleted,
}: ExpenseFormDialogProps) {
  const isEditing = !!expense
  const supabase = createClient()
  const { user } = useAuth()

  // Form state
  const [expenseDate, setExpenseDate] = useState(toLocalDate(new Date()))
  const [concept, setConcept] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState("efectivo")
  const [paymentAccountId, setPaymentAccountId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [supplierInvoice, setSupplierInvoice] = useState("")
  const [notes, setNotes] = useState("")
  const [isRecurring, setIsRecurring] = useState(false)

  // AP section (solo al crear)
  const [generateAP, setGenerateAP] = useState(false)
  const [apDueDate, setApDueDate] = useState("")

  // Data sources
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [accounts, setAccounts] = useState<CashBankAccount[]>([])

  // UI
  const [loading, setLoading] = useState(false)
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [hideForSupplier, setHideForSupplier] = useState(false)
  const [showAPSection, setShowAPSection] = useState(false)

  // Cargar datos de referencia
  const fetchReferenceData = async () => {
    const [catRes, supRes, accRes] = await Promise.all([
      supabase.from("expense_categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("suppliers").select("*").eq("is_active", true).order("name"),
      supabase.from("cash_bank_accounts").select("*").eq("is_active", true).order("name"),
    ])

    if (catRes.error) console.error("Error cargando categorías:", catRes.error)
    if (supRes.error) console.error("Error cargando proveedores:", supRes.error)
    if (accRes.error) console.error("Error cargando cuentas:", accRes.error)

    if (catRes.data) setCategories(catRes.data as ExpenseCategory[])
    if (supRes.data) setSuppliers(supRes.data as Supplier[])
    if (accRes.data) setAccounts(accRes.data as CashBankAccount[])
  }

  useEffect(() => {
    if (open) fetchReferenceData()
  }, [open])

  // Rellenar al editar
  useEffect(() => {
    if (expense) {
      setExpenseDate(expense.expense_date)
      setConcept(expense.concept)
      setCategoryId(expense.category_id)
      setAmount(expense.amount)
      setPaymentMethod(expense.payment_method)
      setPaymentAccountId(expense.payment_account_id || "")
      setSupplierId(expense.supplier_id || "")
      setSupplierInvoice(expense.supplier_invoice_number || "")
      setNotes(expense.notes || "")
      setIsRecurring(expense.is_recurring)
      setGenerateAP(false)
      setApDueDate("")
      setShowAPSection(false)
    } else {
      setExpenseDate(toLocalDate(new Date()))
      setConcept("")
      setCategoryId("")
      setAmount(null)
      setPaymentMethod("efectivo")
      setPaymentAccountId("")
      setSupplierId("")
      setSupplierInvoice("")
      setNotes("")
      setIsRecurring(false)
      setGenerateAP(false)
      setApDueDate("")
      setShowAPSection(false)
    }
  }, [expense, open])

  // Auto-seleccionar cuenta de pago según método
  useEffect(() => {
    if (accounts.length === 0) return
    const methodToAccount: Record<string, string> = {
      efectivo: "Efectivo",
      bancolombia: "Bancolombia",
      nequi: "Nequi",
      daviplata: "Daviplata",
    }
    const accountName = methodToAccount[paymentMethod]
    if (accountName) {
      const found = accounts.find((a) => a.name.toLowerCase() === accountName.toLowerCase())
      if (found) setPaymentAccountId(found.id)
    }
  }, [paymentMethod, accounts])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!concept.trim() || !categoryId || amount === null) {
      toast.error("Concepto, categoría y monto son requeridos")
      return
    }

    const parsedAmount = amount
    if (parsedAmount <= 0) {
      toast.error("El monto debe ser mayor a 0")
      return
    }

    if (generateAP && (!supplierId || supplierId === "none")) {
      toast.error("Selecciona un proveedor para generar la cuenta por pagar")
      return
    }

    setLoading(true)

    try {
      const expenseData = {
        expense_date: expenseDate,
        concept: concept.trim(),
        category_id: categoryId,
        amount: parsedAmount,
        payment_method: paymentMethod,
        payment_account_id: paymentAccountId || null,
        supplier_id: supplierId && supplierId !== "none" ? supplierId : null,
        supplier_invoice_number: supplierInvoice.trim() || null,
        notes: notes.trim() || null,
        is_recurring: isRecurring,
      }

      if (isEditing && expense) {
        const { error } = await supabase
          .from("expenses")
          .update(expenseData)
          .eq("id", expense.id)

        if (error) throw error
        toast.success("Gasto actualizado")
      } else {
        const { data: newExpense, error } = await supabase
          .from("expenses")
          .insert({ ...expenseData, registered_by: user?.id })
          .select()
          .single()

        if (error) throw error

        // Registrar movimiento de caja (egreso) solo si NO es cuenta por pagar
        if (!generateAP && paymentAccountId && newExpense) {
          await registerCashMovement(supabase, {
            accountId: paymentAccountId,
            type: "out",
            amount: parsedAmount,
            concept: `Gasto: ${concept.trim()}`,
            referenceType: "expense",
            referenceId: newExpense.id,
            createdBy: user?.id,
          })
        }

        // Crear cuenta por pagar si se marcó
        if (generateAP && newExpense) {
          const { error: apError } = await supabase
            .from("accounts_payable")
            .insert({
              supplier_id: supplierId,
              expense_id: newExpense.id,
              total_amount: parsedAmount,
              paid_amount: 0,
              remaining_amount: parsedAmount,
              due_date: apDueDate || null,
              status: "pending",
            })

          if (apError) throw apError
          toast.success("Gasto registrado con cuenta por pagar", {
            description: `${concept.trim()} — $${parsedAmount.toLocaleString("es-CO")}`,
          })
        } else {
          toast.success("Gasto registrado", {
            description: `${concept.trim()} — $${parsedAmount.toLocaleString("es-CO")}`,
          })
        }
      }

      onOpenChange(false)
      onCompleted()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error desconocido"
      toast.error("Error al guardar gasto", { description: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open && !hideForSupplier} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Editar gasto" : "Registrar gasto"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Fecha + Concepto */}
            <div className="grid grid-cols-[140px_1fr] gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="exp-date">Fecha *</Label>
                <Input
                  id="exp-date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-concept">Concepto *</Label>
                <Input
                  id="exp-concept"
                  placeholder="Ej: Compra telas algodón"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>

            {/* Categoría + Monto */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Categoría *</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          {cat.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-amount">Monto (COP) *</Label>
                <MoneyInput
                  id="exp-amount"
                  value={amount}
                  onValueChange={setAmount}
                  placeholder="0"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Método de pago + Cuenta */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Método de pago</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
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
              <div className="space-y-1.5">
                <Label>Cuenta de pago</Label>
                <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Proveedor */}
            <div className="space-y-1.5">
              <Label>Proveedor (opcional)</Label>
              <div className="flex gap-2">
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Sin proveedor asignado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        setHideForSupplier(true)
                        setShowSupplierForm(true)
                      }}
                    >
                      <Plus size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Crear proveedor</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* # Factura proveedor */}
            <div className="space-y-1.5">
              <Label htmlFor="exp-invoice"># Factura proveedor (opcional)</Label>
              <Input
                id="exp-invoice"
                placeholder="Ej: FAC-001234"
                value={supplierInvoice}
                onChange={(e) => setSupplierInvoice(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <Label htmlFor="exp-notes">Notas (opcional)</Label>
              <Textarea
                id="exp-notes"
                placeholder="Detalles adicionales..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                disabled={loading}
              />
            </div>

            {/* Es recurrente */}
            <div className="flex items-center justify-between py-1">
              <Label htmlFor="exp-recurring">Gasto recurrente</Label>
              <Switch
                id="exp-recurring"
                checked={isRecurring}
                onCheckedChange={setIsRecurring}
              />
            </div>

            {/* Sección Cuenta por Pagar (solo al crear) */}
            {!isEditing && (
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors text-sm font-medium"
                  onClick={() => setShowAPSection(!showAPSection)}
                >
                  <span>Cuenta por pagar</span>
                  <ChevronDown
                    size={16}
                    className={`text-muted-foreground transition-transform ${showAPSection ? "rotate-180" : ""}`}
                  />
                </button>

                {showAPSection && (
                  <div className="px-4 py-3 space-y-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="exp-ap" className="text-sm">
                        Generar cuenta por pagar
                      </Label>
                      <Switch
                        id="exp-ap"
                        checked={generateAP}
                        onCheckedChange={setGenerateAP}
                      />
                    </div>

                    {generateAP && (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Se creará una deuda pendiente con el proveedor seleccionado por el monto del gasto.
                        </p>
                        {(!supplierId || supplierId === "none") && (
                          <p className="text-xs text-error font-medium">
                            Debes seleccionar un proveedor arriba para generar la cuenta por pagar.
                          </p>
                        )}
                        <div className="space-y-1.5">
                          <Label htmlFor="exp-ap-due">Fecha vencimiento (opcional)</Label>
                          <Input
                            id="exp-ap-due"
                            type="date"
                            value={apDueDate}
                            onChange={(e) => setApDueDate(e.target.value)}
                            disabled={loading}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

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
                {isEditing ? "Guardar cambios" : "Registrar gasto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick-add proveedor — cierra expense dialog para evitar dual-dialog focus trap */}
      <SupplierFormDialog
        open={showSupplierForm}
        onOpenChange={(isOpen) => {
          setShowSupplierForm(isOpen)
          if (!isOpen) setHideForSupplier(false)
        }}
        supplier={null}
        onCompleted={(newSupplier) => {
          fetchReferenceData()
          if (newSupplier) setSupplierId(newSupplier.id)
        }}
      />
    </>
  )
}
