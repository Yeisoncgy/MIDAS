"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { formatCOP } from "@/lib/format"
import type { RawMaterial } from "@/lib/types"

interface AddStockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  material: RawMaterial | null
  onCompleted: () => void
}

export function AddStockDialog({
  open,
  onOpenChange,
  material,
  onCompleted,
}: AddStockDialogProps) {
  const [quantity, setQuantity] = useState("")
  const [costPerUnit, setCostPerUnit] = useState<number | null>(null)
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const { user } = useAuth()

  if (!material) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const qty = parseInt(quantity)
    if (isNaN(qty) || qty <= 0) {
      toast.error("La cantidad debe ser un número positivo")
      return
    }

    const cost = costPerUnit ?? material.cost_per_unit

    setLoading(true)

    try {
      const newStock = material.stock + qty

      // Actualizar stock y costo
      const { error: stockError } = await supabase
        .from("raw_materials")
        .update({
          stock: newStock,
          cost_per_unit: cost,
        })
        .eq("id", material.id)

      if (stockError) throw stockError

      // Registrar movimiento de entrada
      const { error: movError } = await supabase
        .from("raw_material_movements")
        .insert({
          raw_material_id: material.id,
          movement_type: "entry",
          quantity: qty,
          previous_stock: material.stock,
          new_stock: newStock,
          notes: notes || null,
          created_by: user?.id,
        })

      if (movError) throw movError

      toast.success("Stock actualizado", {
        description: `+${qty} ${material.unit} de ${material.name}`,
      })

      // Limpiar y cerrar
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
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Entrada de stock</DialogTitle>
          <DialogDescription>
            {material.name} — Stock actual: {material.stock} {material.unit}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cantidad y costo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rm-qty">Cantidad a agregar</Label>
              <Input
                id="rm-qty"
                type="number"
                min="1"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rm-cost">Costo unitario (COP)</Label>
              <MoneyInput
                id="rm-cost"
                placeholder={String(material.cost_per_unit)}
                value={costPerUnit}
                onValueChange={setCostPerUnit}
                disabled={loading}
              />
              {costPerUnit === null && (
                <p className="text-xs text-muted-foreground">
                  Actual: {formatCOP(material.cost_per_unit)}
                </p>
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="rm-entry-notes">Notas (opcional)</Label>
            <Textarea
              id="rm-entry-notes"
              placeholder="Ej: Compra a proveedor XYZ..."
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
