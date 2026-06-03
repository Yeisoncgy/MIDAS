"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCOP } from "@/lib/format"

interface Variant {
  id: string
  product: { name: string }
  color: string
  color_hex: string
  size: string
  cut: string
  stock: number
  cost_per_unit: number
  sku_variant: string
}

interface AddStockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}

export function AddStockDialog({ open, onOpenChange, onCompleted }: AddStockDialogProps) {
  const [variants, setVariants] = useState<Variant[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [costPerUnit, setCostPerUnit] = useState<number | null>(null)
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingVariants, setLoadingVariants] = useState(true)
  const supabase = createClient()
  const { user } = useAuth()

  useEffect(() => {
    if (open) {
      fetchVariants()
    }
  }, [open])

  const fetchVariants = async () => {
    setLoadingVariants(true)
    const { data } = await supabase
      .from("product_variants")
      .select("id, color, color_hex, size, cut, stock, cost_per_unit, sku_variant, product:products(name)")
      .eq("is_active", true)
      .order("product_id")
      .order("color")
      .order("size")

    if (data) setVariants(data as unknown as Variant[])
    setLoadingVariants(false)
  }

  const selectedVariant = variants.find((v) => v.id === selectedId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedId || !quantity) {
      toast.error("Selecciona una variante y la cantidad")
      return
    }

    const qty = parseInt(quantity)
    if (isNaN(qty) || qty <= 0) {
      toast.error("La cantidad debe ser un número positivo")
      return
    }

    const cost = costPerUnit != null ? costPerUnit : selectedVariant?.cost_per_unit || 0

    setLoading(true)

    try {
      const variant = variants.find((v) => v.id === selectedId)
      if (!variant) return

      const newStock = variant.stock + qty

      // Actualizar stock
      const { error: stockError } = await supabase
        .from("product_variants")
        .update({
          stock: newStock,
          cost_per_unit: cost,
        })
        .eq("id", selectedId)

      if (stockError) throw stockError

      // Registrar movimiento
      const { error: movError } = await supabase
        .from("inventory_movements")
        .insert({
          product_variant_id: selectedId,
          movement_type: "entry",
          quantity: qty,
          previous_stock: variant.stock,
          new_stock: newStock,
          reference_type: "manual_entry",
          notes: notes || null,
          created_by: user?.id,
        })

      if (movError) throw movError

      toast.success("Stock actualizado", {
        description: `+${qty} unidades de ${variant.product?.name} ${variant.color} ${variant.size}`,
      })

      // Limpiar y cerrar
      setSelectedId("")
      setQuantity("")
      setCostPerUnit(null)
      setNotes("")
      onOpenChange(false)
      onCompleted()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error desconocido"
      toast.error("Error al registrar entrada", { description: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Entrada de stock</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selector de variante */}
          <div className="space-y-1.5">
            <Label>Variante de producto</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un producto..." />
              </SelectTrigger>
              <SelectContent>
                {loadingVariants ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Cargando...
                  </div>
                ) : (
                  variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="size-3 rounded-full border border-border shrink-0"
                          style={{ backgroundColor: v.color_hex }}
                        />
                        <span>
                          {v.product?.name} — {v.color} {v.size} {v.cut}
                        </span>
                        <span className="text-muted-foreground ml-1">
                          (stock: {v.stock})
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Cantidad */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qty">Cantidad a agregar</Label>
              <Input
                id="qty"
                type="number"
                min="1"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost">Costo unitario (COP)</Label>
              <MoneyInput
                id="cost"
                value={costPerUnit}
                onValueChange={setCostPerUnit}
                placeholder={selectedVariant ? String(selectedVariant.cost_per_unit) : "0"}
                disabled={loading}
              />
              {selectedVariant && costPerUnit == null && (
                <p className="text-xs text-muted-foreground">
                  Actual: {formatCOP(selectedVariant.cost_per_unit)}
                </p>
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="entry-notes">Notas (opcional)</Label>
            <Textarea
              id="entry-notes"
              placeholder="Ej: Lote de producción #3..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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
              Registrar entrada
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
