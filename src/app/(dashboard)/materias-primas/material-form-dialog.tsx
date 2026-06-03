"use client"

import { useState, useEffect } from "react"
import { Loader2, Plus } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { RAW_MATERIAL_CATEGORIES } from "@/lib/constants"
import type { RawMaterial, RawMaterialUnit, Supplier } from "@/lib/types"
import { SupplierFormDialog } from "@/app/(dashboard)/proveedores/supplier-form-dialog"

const UNITS: { value: RawMaterialUnit; label: string }[] = [
  { value: "unidades", label: "Unidades" },
  { value: "metros", label: "Metros" },
  { value: "rollos", label: "Rollos" },
  { value: "hojas", label: "Hojas" },
  { value: "kilogramos", label: "Kilogramos" },
  { value: "litros", label: "Litros" },
]

interface MaterialFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  material: RawMaterial | null
  onCompleted: () => void
}

export function MaterialFormDialog({
  open,
  onOpenChange,
  material,
  onCompleted,
}: MaterialFormDialogProps) {
  const isEditing = !!material
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  const [unit, setUnit] = useState<RawMaterialUnit>("unidades")
  const [initialStock, setInitialStock] = useState("")
  const [minStockAlert, setMinStockAlert] = useState("")
  const [costPerUnit, setCostPerUnit] = useState<number | null>(null)
  const [supplierId, setSupplierId] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [showSupplierForm, setShowSupplierForm] = useState(false)

  const supabase = createClient()
  const { user } = useAuth()

  // Cargar proveedores
  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from("suppliers")
      .select("*")
      .eq("is_active", true)
      .order("name")
    if (data) setSuppliers(data as Supplier[])
  }

  useEffect(() => {
    if (open) fetchSuppliers()
  }, [open])

  // Rellenar al editar
  useEffect(() => {
    if (material) {
      setName(material.name)
      setCategory(material.category)
      setDescription(material.description || "")
      setUnit(material.unit)
      setInitialStock("")
      setMinStockAlert(String(material.min_stock_alert))
      setCostPerUnit(material.cost_per_unit)
      setSupplierId(material.supplier_id || "")
      setIsActive(material.is_active)
    } else {
      setName("")
      setCategory("")
      setDescription("")
      setUnit("unidades")
      setInitialStock("")
      setMinStockAlert("10")
      setCostPerUnit(null)
      setSupplierId("")
      setIsActive(true)
    }
  }, [material, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || !category) {
      toast.error("Nombre y categoría son requeridos")
      return
    }

    setLoading(true)

    try {
      const cost = costPerUnit ?? 0
      const minAlert = minStockAlert ? parseInt(minStockAlert) : 10

      if (isEditing && material) {
        // Actualizar metadata (no stock directo)
        const { error } = await supabase
          .from("raw_materials")
          .update({
            name: name.trim(),
            category,
            description: description.trim() || null,
            unit,
            min_stock_alert: minAlert,
            cost_per_unit: cost,
            supplier_id: supplierId && supplierId !== "none" ? supplierId : null,
            is_active: isActive,
          })
          .eq("id", material.id)

        if (error) throw error
        toast.success("Material actualizado")
      } else {
        // Crear material
        const stock = initialStock ? parseInt(initialStock) : 0

        const { data: newMaterial, error } = await supabase
          .from("raw_materials")
          .insert({
            name: name.trim(),
            category,
            description: description.trim() || null,
            stock,
            unit,
            min_stock_alert: minAlert,
            cost_per_unit: cost,
            supplier_id: supplierId && supplierId !== "none" ? supplierId : null,
            is_active: true,
          })
          .select()
          .single()

        if (error) throw error

        // Si hay stock inicial, crear movimiento de entrada
        if (stock > 0) {
          await supabase.from("raw_material_movements").insert({
            raw_material_id: newMaterial.id,
            movement_type: "entry",
            quantity: stock,
            previous_stock: 0,
            new_stock: stock,
            notes: "Stock inicial al crear material",
            created_by: user?.id,
          })
        }

        toast.success("Material creado", {
          description: `${name.trim()} — ${stock} ${unit}`,
        })
      }

      onOpenChange(false)
      onCompleted()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error desconocido"
      toast.error("Error al guardar material", { description: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Editar material" : "Nuevo material"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label htmlFor="mat-name">Nombre del material *</Label>
              <Input
                id="mat-name"
                placeholder="Ej: Caja kraft 30x20x10"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>

            {/* Categoría */}
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona categoría..." />
                </SelectTrigger>
                <SelectContent>
                  {RAW_MATERIAL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Descripción */}
            <div className="space-y-1.5">
              <Label htmlFor="mat-desc">Descripción (opcional)</Label>
              <Textarea
                id="mat-desc"
                placeholder="Detalles del material..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                disabled={loading}
              />
            </div>

            {/* Unidad de medida + Stock inicial (solo crear) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Unidad de medida</Label>
                <Select value={unit} onValueChange={(v) => setUnit(v as RawMaterialUnit)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!isEditing && (
                <div className="space-y-1.5">
                  <Label htmlFor="mat-stock">Stock inicial</Label>
                  <Input
                    id="mat-stock"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={initialStock}
                    onChange={(e) => setInitialStock(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}
              {isEditing && (
                <div className="space-y-1.5">
                  <Label>Stock actual</Label>
                  <Input
                    value={`${material?.stock ?? 0} ${material?.unit ?? ""}`}
                    disabled
                    className="bg-muted"
                  />
                </div>
              )}
            </div>

            {/* Stock mínimo + Costo unitario */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="mat-min">Stock mínimo alerta</Label>
                <Input
                  id="mat-min"
                  type="number"
                  min="0"
                  placeholder="10"
                  value={minStockAlert}
                  onChange={(e) => setMinStockAlert(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mat-cost">Costo unitario (COP)</Label>
                <MoneyInput
                  id="mat-cost"
                  placeholder="0"
                  value={costPerUnit}
                  onValueChange={setCostPerUnit}
                  disabled={loading}
                />
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
                      onClick={() => setShowSupplierForm(true)}
                    >
                      <Plus size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Crear proveedor</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Estado activo (solo editar) */}
            {isEditing && (
              <div className="flex items-center justify-between py-2">
                <Label htmlFor="mat-active">Material activo</Label>
                <Switch
                  id="mat-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
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
                {isEditing ? "Guardar cambios" : "Crear material"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick-add proveedor — como hermano, NO anidado */}
      <SupplierFormDialog
        open={showSupplierForm}
        onOpenChange={setShowSupplierForm}
        supplier={null}
        onCompleted={(newSupplier) => {
          fetchSuppliers()
          if (newSupplier) setSupplierId(newSupplier.id)
        }}
      />
    </>
  )
}
