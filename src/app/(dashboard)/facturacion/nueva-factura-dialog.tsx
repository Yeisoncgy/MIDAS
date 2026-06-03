"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  X,
  UserPlus,
  Loader2,
  ShoppingCart,
  CreditCard,
  User,
  Receipt,
  Minus,
  Plus,
} from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { MoneyInput } from "@/components/ui/money-input"
import { SearchInput } from "@/components/shared/search-input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCOP } from "@/lib/format"
import { useDebounce } from "@/hooks/use-debounce"
import { PAYMENT_METHODS, SALE_CHANNELS } from "@/lib/constants"
import { registerCashMovement, findAccountForMethod } from "@/lib/cash-movements"
import type { Client, ProductVariant, Product } from "@/lib/types"
import { Switch } from "@/components/ui/switch"
import { printReceipt, type SaleExpanded } from "./recibo-termico"

// === Tipo de variante con producto incluido ===
interface VariantWithProduct extends ProductVariant {
  product: Product
}

// === Item del carrito de la factura ===
interface CartItem {
  variantId: string
  variant: VariantWithProduct
  quantity: number
  unitPrice: number
  subtotal: number
}

interface NuevaFacturaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}

/**
 * Diálogo completo para crear una nueva factura.
 * Incluye selección de cliente, productos, descuentos, envío y método de pago.
 */
export function NuevaFacturaDialog({ open, onOpenChange, onCompleted }: NuevaFacturaDialogProps) {
  const { user } = useAuth()
  const supabase = createClient()

  // === Estado del cliente ===
  const [clientSearch, setClientSearch] = useState("")
  const [clientResults, setClientResults] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [searchingClients, setSearchingClients] = useState(false)
  const [showClientDropdown, setShowClientDropdown] = useState(false)

  // === Estado de creación rápida de cliente ===
  const [showQuickClient, setShowQuickClient] = useState(false)
  const [quickClientName, setQuickClientName] = useState("")
  const [quickClientPhone, setQuickClientPhone] = useState("")
  const [creatingClient, setCreatingClient] = useState(false)

  // === Estado de productos (catálogo visual) ===
  const [catalogVariants, setCatalogVariants] = useState<VariantWithProduct[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState("")
  const debouncedCatalogSearch = useDebounce(catalogSearch, 250)
  const [cartItems, setCartItems] = useState<CartItem[]>([])

  // === Estado de totales y pagos ===
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage")
  const [discountValue, setDiscountValue] = useState(0)
  const [shippingCost, setShippingCost] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState("nequi")
  const [saleChannel, setSaleChannel] = useState("whatsapp")
  const [notes, setNotes] = useState("")

  // === Cuenta de pago por defecto ===
  const [defaultAccountId, setDefaultAccountId] = useState<string | null>(null)

  // === Estado de crédito / fiado ===
  const [isCredit, setIsCredit] = useState(false)
  const [creditInstallments, setCreditInstallments] = useState(1)
  const [initialPayment, setInitialPayment] = useState(0)

  // === Estado de envío del formulario ===
  const [submitting, setSubmitting] = useState(false)

  // === Cálculos de totales ===
  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.subtotal, 0),
    [cartItems]
  )

  const discountAmount = useMemo(() => {
    if (discountValue <= 0) return 0
    if (discountType === "percentage") {
      return Math.round(subtotal * (discountValue / 100))
    }
    return discountValue
  }, [subtotal, discountType, discountValue])

  const total = useMemo(
    () => Math.max(0, subtotal - discountAmount + shippingCost),
    [subtotal, discountAmount, shippingCost]
  )

  // === Cálculos de crédito ===
  const CREDIT_FEE_PERCENTAGE = 5

  const creditFeeAmount = useMemo(
    () => (isCredit ? Math.round(total * (CREDIT_FEE_PERCENTAGE / 100)) : 0),
    [total, isCredit]
  )

  const totalWithFee = useMemo(
    () => total + creditFeeAmount,
    [total, creditFeeAmount]
  )

  const creditRemaining = useMemo(
    () => Math.max(0, totalWithFee - initialPayment),
    [totalWithFee, initialPayment]
  )

  const installmentAmount = useMemo(
    () => (creditInstallments > 0 ? Math.round(creditRemaining / creditInstallments) : 0),
    [creditRemaining, creditInstallments]
  )

  // === Obtener cuenta de pago según método seleccionado ===
  useEffect(() => {
    if (!open) return
    const fetchAccount = async () => {
      const id = await findAccountForMethod(supabase, paymentMethod)
      if (id) setDefaultAccountId(id)
    }
    fetchAccount()
  }, [open, supabase, paymentMethod])

  // === Buscar clientes con debounce ===
  useEffect(() => {
    // No buscar si ya hay un cliente seleccionado o el texto es muy corto
    if (selectedClient || clientSearch.length < 2) {
      setClientResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearchingClients(true)
      const { data } = await supabase
        .from("clients")
        .select("*")
        .or(`full_name.ilike.%${clientSearch}%,phone_whatsapp.ilike.%${clientSearch}%`)
        .limit(10)

      if (data) {
        setClientResults(data as Client[])
        setShowClientDropdown(true)
      }
      setSearchingClients(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [clientSearch, selectedClient, supabase])

  // === Cargar catálogo de variantes al abrir el diálogo ===
  useEffect(() => {
    if (!open) return
    const loadCatalog = async () => {
      setLoadingCatalog(true)
      const { data } = await supabase
        .from("product_variants")
        .select("*, product:products(*)")
        .eq("is_active", true)
        .gt("stock", 0)
        .order("product_id")
      if (data) setCatalogVariants(data as unknown as VariantWithProduct[])
      setLoadingCatalog(false)
    }
    loadCatalog()
  }, [open, supabase])

  // === Productos agrupados y filtrados para el catálogo ===
  const catalogProducts = useMemo(() => {
    const searchLower = debouncedCatalogSearch.toLowerCase()
    const idsInCart = new Set(cartItems.map((ci) => ci.variantId))

    const filtered = catalogVariants.filter((v) => {
      if (idsInCart.has(v.id)) return false
      if (!debouncedCatalogSearch) return true
      return (
        v.product.name?.toLowerCase().includes(searchLower) ||
        v.color?.toLowerCase().includes(searchLower) ||
        v.sku_variant?.toLowerCase().includes(searchLower)
      )
    })

    const groups = new Map<string, { product: Product; variants: VariantWithProduct[] }>()
    for (const v of filtered) {
      const existing = groups.get(v.product_id)
      if (existing) {
        existing.variants.push(v)
      } else {
        groups.set(v.product_id, { product: v.product, variants: [v] })
      }
    }

    return Array.from(groups.values())
  }, [catalogVariants, debouncedCatalogSearch, cartItems])

  // === Crear cliente rápido ===
  const handleQuickCreateClient = useCallback(async () => {
    if (!quickClientName.trim()) {
      toast.error("El nombre del cliente es obligatorio")
      return
    }

    setCreatingClient(true)
    const { data, error } = await supabase
      .from("clients")
      .insert({
        full_name: quickClientName.trim(),
        phone_whatsapp: quickClientPhone.trim() || null,
        city: "Medellín",
        department: "Antioquia",
      })
      .select()
      .single()

    if (error) {
      toast.error("Error al crear el cliente")
      setCreatingClient(false)
      return
    }

    // Seleccionar el cliente recién creado
    setSelectedClient(data as Client)
    setClientSearch(data.full_name)
    setShowQuickClient(false)
    setQuickClientName("")
    setQuickClientPhone("")
    setCreatingClient(false)
    toast.success(`Cliente "${data.full_name}" creado`)
  }, [quickClientName, quickClientPhone, supabase])

  // === Seleccionar un cliente del dropdown ===
  const handleSelectClient = useCallback((client: Client) => {
    setSelectedClient(client)
    setClientSearch(client.full_name)
    setShowClientDropdown(false)
    setClientResults([])
    // Resetear crédito si el nuevo cliente no tiene crédito habilitado
    if (!client.credit_enabled) {
      setIsCredit(false)
      setInitialPayment(0)
      setCreditInstallments(1)
    }
  }, [])

  // === Limpiar selección de cliente ===
  const handleClearClient = useCallback(() => {
    setSelectedClient(null)
    setClientSearch("")
    setClientResults([])
    setIsCredit(false)
    setInitialPayment(0)
    setCreditInstallments(1)
  }, [])

  // === Agregar variante al carrito ===
  const handleAddVariant = useCallback((variant: VariantWithProduct) => {
    const nuevoItem: CartItem = {
      variantId: variant.id,
      variant,
      quantity: 1,
      unitPrice: variant.product.base_price,
      subtotal: variant.product.base_price,
    }
    setCartItems((prev) => [...prev, nuevoItem])
  }, [])

  // === Actualizar cantidad de un item ===
  const handleUpdateQuantity = useCallback((index: number, newQty: number) => {
    setCartItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        // No superar el stock disponible
        const qty = Math.max(1, Math.min(newQty, item.variant.stock))
        return { ...item, quantity: qty, subtotal: qty * item.unitPrice }
      })
    )
  }, [])

  // === Actualizar precio unitario de un item ===
  const handleUpdatePrice = useCallback((index: number, newPrice: number) => {
    setCartItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const price = Math.max(0, newPrice)
        return { ...item, unitPrice: price, subtotal: item.quantity * price }
      })
    )
  }, [])

  // === Eliminar item del carrito ===
  const handleRemoveItem = useCallback((index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // === Resetear formulario ===
  const resetForm = useCallback(() => {
    setSelectedClient(null)
    setClientSearch("")
    setClientResults([])
    setShowQuickClient(false)
    setQuickClientName("")
    setQuickClientPhone("")
    setCartItems([])
    setCatalogSearch("")
    setDiscountType("percentage")
    setDiscountValue(0)
    setShippingCost(0)
    setPaymentMethod("nequi")
    setSaleChannel("whatsapp")
    setNotes("")
    setIsCredit(false)
    setCreditInstallments(1)
    setInitialPayment(0)
  }, [])

  // === Enviar formulario — Crear factura ===
  const handleSubmit = useCallback(async () => {
    // Validaciones
    if (!selectedClient) {
      toast.error("Selecciona un cliente")
      return
    }
    if (cartItems.length === 0) {
      toast.error("Agrega al menos un producto")
      return
    }
    if (!user) {
      toast.error("Sesión no válida. Recarga la página.")
      return
    }

    setSubmitting(true)

    try {
      // 1. Generar número de factura
      const { data: invoiceNumber, error: rpcError } = await supabase.rpc("generate_invoice_number")

      if (rpcError || !invoiceNumber) {
        toast.error("Error al generar número de factura")
        setSubmitting(false)
        return
      }

      // 2. Insertar la venta en la tabla sales
      // Campos base (siempre presentes)
      const saleInsert: Record<string, unknown> = {
        invoice_number: invoiceNumber,
        client_id: selectedClient.id,
        sale_date: new Date().toLocaleDateString("en-CA"), // YYYY-MM-DD local, sin conversión UTC
        subtotal,
        discount_type: discountValue > 0 ? discountType : null,
        discount_value: discountValue > 0 ? discountValue : 0,
        shipping_cost: shippingCost,
        total,
        payment_method: paymentMethod,
        payment_account_id: defaultAccountId,
        sale_channel: saleChannel,
        seller_user_id: user.id,
        status: isCredit ? "pending" : "paid",
        notes: notes.trim() || null,
        created_by: user.id,
      }

      // Campos de crédito (solo si es venta a crédito — requiere migración 007)
      if (isCredit) {
        saleInsert.is_credit = true
        saleInsert.credit_fee_percentage = CREDIT_FEE_PERCENTAGE
        saleInsert.credit_fee_amount = creditFeeAmount
        saleInsert.credit_installments = creditInstallments
        saleInsert.initial_payment = initialPayment
        saleInsert.total_with_fee = totalWithFee
      }

      const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .insert(saleInsert)
        .select()
        .single()

      if (saleError || !saleData) {
        console.error("Error al crear venta:", saleError)
        toast.error("Error al crear la factura")
        setSubmitting(false)
        return
      }

      // 3. Insertar los items de la venta
      const saleItems = cartItems.map((item) => ({
        sale_id: saleData.id,
        product_variant_id: item.variantId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.subtotal,
      }))

      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(saleItems)

      if (itemsError) {
        console.error("Error al insertar items:", itemsError)
        toast.error("Factura creada pero hubo un error con los items")
      }

      // 4. Actualizar stock y registrar movimientos de inventario
      for (const item of cartItems) {
        const previousStock = item.variant.stock
        const newStock = previousStock - item.quantity

        // Decrementar stock de la variante
        await supabase
          .from("product_variants")
          .update({ stock: newStock })
          .eq("id", item.variantId)

        // Crear movimiento de inventario (salida por venta)
        await supabase.from("inventory_movements").insert({
          product_variant_id: item.variantId,
          movement_type: "exit",
          quantity: -item.quantity,
          previous_stock: previousStock,
          new_stock: newStock,
          reference_type: "sale",
          reference_id: saleData.id,
          notes: `Venta ${invoiceNumber}`,
          created_by: user.id,
        })
      }

      // 5. Registrar movimiento de caja (ingreso)
      if (!isCredit && defaultAccountId) {
        // Venta pagada completa → ingreso por el total
        await registerCashMovement(supabase, {
          accountId: defaultAccountId,
          type: "in",
          amount: total,
          concept: `Venta ${invoiceNumber}`,
          referenceType: "sale",
          referenceId: saleData.id,
          createdBy: user.id,
        })
      }

      // 6. Si es crédito, crear cuenta por cobrar y registrar abono inicial
      if (isCredit) {
        const arStatus = initialPayment > 0 ? "partial" : "pending"
        const { data: arData } = await supabase
          .from("accounts_receivable")
          .insert({
            client_id: selectedClient.id,
            sale_id: saleData.id,
            total_amount: totalWithFee,
            paid_amount: initialPayment,
            remaining_amount: totalWithFee - initialPayment,
            status: arStatus,
            notes: `Crédito ${creditInstallments} cuota(s) - Comisión ${CREDIT_FEE_PERCENTAGE}%`,
          })
          .select()
          .single()

        // Si hay abono inicial, registrar el pago + movimiento de caja
        if (initialPayment > 0 && arData) {
          await supabase.from("payment_records").insert({
            type: "receivable",
            reference_id: arData.id,
            amount: initialPayment,
            payment_method: paymentMethod,
            payment_account_id: defaultAccountId,
            payment_date: new Date().toISOString(),
            notes: `Abono inicial - ${invoiceNumber}`,
            registered_by: user.id,
          })

          if (defaultAccountId) {
            await registerCashMovement(supabase, {
              accountId: defaultAccountId,
              type: "in",
              amount: initialPayment,
              concept: `Abono inicial crédito ${invoiceNumber}`,
              referenceType: "payment_record",
              referenceId: arData.id,
              createdBy: user.id,
            })
          }
        }
      }

      // 7. Notificar éxito
      toast.success(`Factura ${invoiceNumber} creada exitosamente${isCredit ? " (crédito)" : ""}`)

      // 8. Construir el objeto de venta completo para imprimir
      const ventaParaRecibo: SaleExpanded = {
        ...saleData,
        client: selectedClient,
        items: cartItems.map((item) => ({
          id: "",
          sale_id: saleData.id,
          product_variant_id: item.variantId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          subtotal: item.subtotal,
          variant: item.variant,
        })),
      }

      // 8. Cerrar diálogo, resetear y notificar al padre
      onOpenChange(false)
      resetForm()
      onCompleted()

      // 9. Abrir recibo térmico automáticamente
      setTimeout(() => {
        printReceipt(ventaParaRecibo)
      }, 500)
    } catch (err) {
      console.error("Error inesperado:", err)
      toast.error("Error inesperado al crear la factura")
    } finally {
      setSubmitting(false)
    }
  }, [
    selectedClient,
    cartItems,
    user,
    supabase,
    subtotal,
    discountType,
    discountValue,
    shippingCost,
    total,
    paymentMethod,
    defaultAccountId,
    saleChannel,
    notes,
    isCredit,
    creditFeeAmount,
    creditInstallments,
    initialPayment,
    totalWithFee,
    onOpenChange,
    resetForm,
    onCompleted,
  ])

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm()
        onOpenChange(isOpen)
      }}
    >
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 font-[family-name:var(--font-display)] text-xl">
            <span className="flex size-9 items-center justify-center rounded-lg bg-gold/10 text-gold">
              <Receipt size={18} />
            </span>
            Nueva Factura
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* ============================================================ */}
          {/* SECCIÓN: CLIENTE */}
          {/* ============================================================ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User size={15} className="text-gold" />
              <Label className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
                Cliente
              </Label>
            </div>

            {/* Cliente seleccionado */}
            {selectedClient ? (
              <div className="flex items-center justify-between rounded-lg border border-gold/30 bg-gold/5 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-gold/15 text-gold">
                    <User size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{selectedClient.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[selectedClient.phone_whatsapp, selectedClient.city]
                        .filter(Boolean)
                        .join(" \u00B7 ") || "Sin datos de contacto"}
                    </p>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-xs" onClick={handleClearClient}>
                      <X size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Quitar cliente</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Buscador de clientes */}
                <div className="relative">
                  <SearchInput
                    value={clientSearch}
                    onValueChange={setClientSearch}
                    placeholder="Buscar por nombre o teléfono..."
                    wrapperClassName="w-full"
                    onFocus={() => {
                      if (clientResults.length > 0) setShowClientDropdown(true)
                    }}
                    onBlur={() => {
                      // Delay para permitir el clic en un resultado
                      setTimeout(() => setShowClientDropdown(false), 200)
                    }}
                  />
                  {searchingClients && (
                    <Loader2 size={16} className="absolute right-9 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
                  )}

                  {/* Dropdown de resultados */}
                  {showClientDropdown && clientResults.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {clientResults.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent transition-colors text-sm"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectClient(client)}
                        >
                          <span className="font-medium">{client.full_name}</span>
                          {client.phone_whatsapp && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              {client.phone_whatsapp}
                            </span>
                          )}
                          {client.city && (
                            <span className="text-muted-foreground ml-1 text-xs">
                              {"\u00B7"} {client.city}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Botón crear cliente rápido */}
                {!showQuickClient ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setShowQuickClient(true)}
                  >
                    <UserPlus size={14} className="mr-1" />
                    Crear cliente rápido
                  </Button>
                ) : (
                  <div className="bg-cream rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Nombre *</Label>
                        <Input
                          placeholder="Nombre completo"
                          value={quickClientName}
                          onChange={(e) => setQuickClientName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Teléfono</Label>
                        <Input
                          placeholder="300 123 4567"
                          value={quickClientPhone}
                          onChange={(e) => setQuickClientPhone(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleQuickCreateClient}
                        disabled={creatingClient}
                      >
                        {creatingClient && <Loader2 size={14} className="mr-1 animate-spin" />}
                        Crear
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowQuickClient(false)
                          setQuickClientName("")
                          setQuickClientPhone("")
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

          {/* ============================================================ */}
          {/* SECCIÓN: PRODUCTOS */}
          {/* ============================================================ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={15} className="text-gold" />
                <Label className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
                  Productos
                </Label>
              </div>
              {cartItems.length > 0 && (
                <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold">
                  {cartItems.length} en el carrito
                </span>
              )}
            </div>

            {/* Items del carrito */}
            {cartItems.length > 0 && (
              <div className="space-y-2">
                {cartItems.map((item, index) => (
                  <div
                    key={item.variantId}
                    className="rounded-lg border border-border bg-card p-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      {/* Info del producto */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {item.variant.product.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="size-2.5 rounded-full border border-border shrink-0"
                            style={{ backgroundColor: item.variant.color_hex }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {item.variant.color} {"\u00B7"} {item.variant.size} {"\u00B7"} {item.variant.cut}
                          </span>
                          <span className="text-xs text-muted-foreground/60 ml-1">
                            (Stock: {item.variant.stock})
                          </span>
                        </div>
                      </div>

                      {/* Botón eliminar */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-error shrink-0"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <X size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Quitar del carrito</TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Controles de cantidad y precio */}
                    <div className="grid grid-cols-3 gap-2 mt-2 items-end">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Cantidad</Label>
                        <div className="flex h-9 items-center rounded-md border border-input bg-transparent">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(index, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="flex size-8 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                            aria-label="Disminuir cantidad"
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateQuantity(
                                index,
                                parseInt(e.target.value.replace(/\D/g, "")) || 1
                              )
                            }
                            className="w-full min-w-0 flex-1 bg-transparent text-center text-sm tabular-nums outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(index, item.quantity + 1)}
                            disabled={item.quantity >= item.variant.stock}
                            className="flex size-8 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                            aria-label="Aumentar cantidad"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Precio unitario</Label>
                        <MoneyInput
                          value={item.unitPrice}
                          onValueChange={(v) => handleUpdatePrice(index, v ?? 0)}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Subtotal</Label>
                        <div className="flex h-9 items-center justify-end text-sm font-semibold text-gold tabular-nums">
                          {formatCOP(item.subtotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Subtotal del carrito */}
                <div className="flex justify-end px-3">
                  <span className="text-sm text-muted-foreground mr-2">Subtotal:</span>
                  <span className="text-sm font-semibold tabular-nums">{formatCOP(subtotal)}</span>
                </div>
              </div>
            )}

            {/* Catálogo visual de productos */}
            <div className="space-y-2">
              <SearchInput
                value={catalogSearch}
                onValueChange={setCatalogSearch}
                placeholder="Filtrar productos..."
                wrapperClassName="w-full"
              />

              {loadingCatalog ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-gold" />
                </div>
              ) : catalogProducts.length > 0 ? (
                <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
                  {catalogProducts.map(({ product, variants }) => (
                    <div key={product.id} className="bg-cream rounded-lg p-3">
                      {/* Header del producto */}
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold">{product.name}</p>
                          <p className="text-xs text-gold font-semibold tabular-nums">
                            {formatCOP(product.base_price)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {Array.from(new Set(variants.map((v) => v.color_hex))).map((hex) => (
                            <span
                              key={hex}
                              className="size-3 rounded-full border border-border"
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                          <span className="text-[10px] text-muted-foreground ml-1">
                            {variants.reduce((s, v) => s + v.stock, 0)} und.
                          </span>
                        </div>
                      </div>

                      {/* Variantes como botones clickeables */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {variants.map((variant) => (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => handleAddVariant(variant)}
                            className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-card border border-border hover:border-gold hover:bg-gold/5 transition-all text-left group"
                          >
                            <span
                              className="size-3 rounded-full border border-border shrink-0"
                              style={{ backgroundColor: variant.color_hex }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                {variant.color} · {variant.size}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{variant.cut}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] text-muted-foreground tabular-nums">
                                {variant.stock} und.
                              </p>
                              <p className="text-[10px] font-semibold text-gold opacity-0 group-hover:opacity-100 transition-opacity">
                                + Agregar
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <ShoppingCart size={24} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {catalogSearch
                      ? "No se encontraron productos con ese filtro"
                      : "No hay productos con stock disponible"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECCIÓN: DESCUENTO Y ENVÍO */}
          {/* ============================================================ */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
              Descuento y envío
            </Label>

            <div className="grid grid-cols-3 gap-3">
              {/* Tipo de descuento */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Tipo descuento</Label>
                <Select
                  value={discountType}
                  onValueChange={(val) => setDiscountType(val as "percentage" | "fixed")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                    <SelectItem value="fixed">Valor fijo ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Valor del descuento */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  {discountType === "percentage" ? "% Descuento" : "Valor descuento"}
                </Label>
                {discountType === "percentage" ? (
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={discountValue || ""}
                      onChange={(e) => setDiscountValue(parseInt(e.target.value) || 0)}
                      placeholder="0"
                      className="pr-7 text-right tabular-nums"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                      %
                    </span>
                  </div>
                ) : (
                  <MoneyInput
                    value={discountValue || null}
                    onValueChange={(v) => setDiscountValue(v ?? 0)}
                    max={subtotal}
                    placeholder="0"
                  />
                )}
              </div>

              {/* Costo de envío */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Costo envío</Label>
                <MoneyInput
                  value={shippingCost || null}
                  onValueChange={(v) => setShippingCost(v ?? 0)}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Resumen de totales */}
            <div className="bg-cream rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCOP(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Descuento
                    {discountType === "percentage" ? ` (${discountValue}%)` : ""}
                  </span>
                  <span className="tabular-nums text-error">-{formatCOP(discountAmount)}</span>
                </div>
              )}
              {shippingCost > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Envío</span>
                  <span className="tabular-nums">{formatCOP(shippingCost)}</span>
                </div>
              )}
              <div className="border-t border-border pt-2">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-base">TOTAL</span>
                  <span className="font-[family-name:var(--font-display)] text-2xl font-bold text-gold tabular-nums">
                    {formatCOP(total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECCIÓN: CRÉDITO / FIADO */}
          {/* ============================================================ */}
          {selectedClient && (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
                Crédito / Fiado
              </Label>

              {/* Toggle de crédito */}
              <div className="flex items-center justify-between bg-cream rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <CreditCard size={20} className="text-gold" />
                  <div>
                    <p className="text-sm font-semibold">Venta a crédito (fiado)</p>
                    <p className="text-xs text-muted-foreground">
                      Comisión {CREDIT_FEE_PERCENTAGE}% · Máximo 3 cuotas
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isCredit}
                  onCheckedChange={(checked) => {
                    setIsCredit(checked)
                    if (!checked) {
                      setInitialPayment(0)
                      setCreditInstallments(1)
                    }
                  }}
                />
              </div>

              {/* Detalle de crédito */}
              {isCredit && (
                <div className="bg-cream rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Cuotas */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Número de cuotas</Label>
                      <Select
                        value={String(creditInstallments)}
                        onValueChange={(val) => setCreditInstallments(parseInt(val))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 cuota</SelectItem>
                          <SelectItem value="2">2 cuotas</SelectItem>
                          <SelectItem value="3">3 cuotas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Abono inicial */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Abono inicial</Label>
                      <MoneyInput
                        value={initialPayment || null}
                        onValueChange={(v) => setInitialPayment(v ?? 0)}
                        max={totalWithFee}
                        showMaxButton
                        maxButtonLabel="Total"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Resumen de crédito */}
                  <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total base</span>
                      <span className="tabular-nums">{formatCOP(total)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">+ Comisión crédito ({CREDIT_FEE_PERCENTAGE}%)</span>
                      <span className="tabular-nums text-warning font-medium">+{formatCOP(creditFeeAmount)}</span>
                    </div>
                    <div className="border-t border-warning/20 pt-2">
                      <div className="flex justify-between text-sm font-semibold">
                        <span>Total con comisión</span>
                        <span className="tabular-nums">{formatCOP(totalWithFee)}</span>
                      </div>
                    </div>
                    {initialPayment > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">- Abono inicial</span>
                        <span className="tabular-nums text-success">-{formatCOP(initialPayment)}</span>
                      </div>
                    )}
                    <div className="border-t border-warning/20 pt-2">
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-sm text-error">Saldo pendiente</span>
                        <span className="font-[family-name:var(--font-display)] text-lg font-bold text-error tabular-nums">
                          {formatCOP(creditRemaining)}
                        </span>
                      </div>
                      {creditInstallments > 1 && creditRemaining > 0 && (
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>{creditInstallments} cuotas de</span>
                          <span className="tabular-nums font-medium">~{formatCOP(installmentAmount)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* SECCIÓN: MÉTODO DE PAGO Y CANAL */}
          {/* ============================================================ */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
              Pago y canal
            </Label>

            <div className="grid grid-cols-2 gap-3">
              {/* Método de pago */}
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

              {/* Canal de venta */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Canal de venta</Label>
                <Select value={saleChannel} onValueChange={setSaleChannel}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SALE_CHANNELS.map((ch) => (
                      <SelectItem key={ch.value} value={ch.value}>
                        {ch.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECCIÓN: NOTAS */}
          {/* ============================================================ */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
              Notas (opcional)
            </Label>
            <Textarea
              placeholder="Notas adicionales sobre esta venta..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
        </div>

        {/* ============================================================ */}
        {/* ACCIONES DEL FORMULARIO */}
        {/* ============================================================ */}
        <DialogFooter className="flex-row items-center sm:justify-between gap-3 border-t border-border pt-4">
          <div className="hidden sm:flex flex-col">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {isCredit ? "Saldo a financiar" : "Total a cobrar"}
            </span>
            <span className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums text-gold">
              {formatCOP(isCredit ? totalWithFee : total)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                resetForm()
                onOpenChange(false)
              }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !selectedClient || cartItems.length === 0}
            >
              {submitting && <Loader2 size={18} className="mr-1.5 animate-spin" />}
              Crear Factura
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
