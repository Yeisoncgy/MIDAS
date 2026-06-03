"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
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
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Partner } from "@/lib/types"

interface PartnerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  partner: Partner | null
  onCompleted: () => void
}

interface AvailableUser {
  id: string
  full_name: string
  email: string
}

export function PartnerFormDialog({
  open,
  onOpenChange,
  partner,
  onCompleted,
}: PartnerFormDialogProps) {
  const supabase = createClient()
  const isEditing = !!partner

  const [name, setName] = useState("")
  const [userId, setUserId] = useState<string>("none")
  const [percentage, setPercentage] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([])
  const [existingSum, setExistingSum] = useState(0)

  const fetchFormData = useCallback(async () => {
    // Obtener usuarios con rol 'socio' que no están vinculados a otro partner
    const { data: socioUsers } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("role", "socio")
      .eq("is_active", true)

    // Obtener partners existentes para ver cuáles users ya están vinculados
    const { data: existingPartners } = await supabase
      .from("partners")
      .select("id, user_id, distribution_percentage")

    const linkedUserIds = new Set(
      (existingPartners || [])
        .filter((p) => p.user_id && p.id !== partner?.id)
        .map((p) => p.user_id)
    )

    // Filtrar users no vinculados (o el actual si estamos editando)
    const filtered = (socioUsers || []).filter(
      (u) => !linkedUserIds.has(u.id) || u.id === partner?.user_id
    )
    setAvailableUsers(filtered)

    // Calcular suma de porcentajes existentes (excluyendo el partner actual)
    const sum = (existingPartners || [])
      .filter((p) => p.id !== partner?.id)
      .reduce((acc, p) => acc + (p.distribution_percentage || 0), 0)
    setExistingSum(sum)
  }, [supabase, partner])

  useEffect(() => {
    if (open) {
      if (partner) {
        setName(partner.name)
        setUserId(partner.user_id || "none")
        setPercentage(partner.distribution_percentage)
        setIsActive(partner.is_active)
      } else {
        setName("")
        setUserId("none")
        setPercentage(null)
        setIsActive(true)
      }
      fetchFormData()
    }
  }, [open, partner, fetchFormData])

  const maxPercentage = 100 - existingSum
  const percentageValue = percentage ?? 0
  const overMax = percentageValue > maxPercentage

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("El nombre es obligatorio")
      return
    }
    if (percentageValue <= 0 || percentageValue > 100) {
      toast.error("El porcentaje debe estar entre 1 y 100")
      return
    }
    if (percentageValue > maxPercentage) {
      toast.error(
        `El porcentaje máximo disponible es ${maxPercentage}%. La suma total no puede superar 100%.`
      )
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        name: name.trim(),
        user_id: userId === "none" ? null : userId,
        distribution_percentage: percentageValue,
        is_active: isActive,
      }

      if (isEditing) {
        const { error } = await supabase
          .from("partners")
          .update(payload)
          .eq("id", partner.id)
        if (error) throw error
        toast.success("Socio actualizado")
      } else {
        const { error } = await supabase.from("partners").insert(payload)
        if (error) throw error
        toast.success("Socio creado exitosamente")
      }

      onOpenChange(false)
      onCompleted()
    } catch {
      toast.error("Error al guardar el socio")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] text-xl">
            {isEditing ? "Editar socio" : "Nuevo socio"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1">Nombre *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del socio"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1">
              Usuario vinculado (opcional)
            </Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin vincular" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin vincular</SelectItem>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1">
              % Distribución (disponible: {maxPercentage}%)
            </Label>
            <div className="relative">
              <Input
                type="number"
                min={1}
                max={maxPercentage}
                value={percentage ?? ""}
                onChange={(e) => {
                  const v = e.target.value
                  setPercentage(v === "" ? null : Math.max(0, Math.min(100, parseInt(v) || 0)))
                }}
                placeholder="0"
                aria-invalid={overMax}
                className="pr-8 tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                %
              </span>
            </div>
            {overMax ? (
              <p className="text-xs text-error mt-1">
                Supera el máximo disponible ({maxPercentage}%). La suma total no puede pasar de 100%.
              </p>
            ) : existingSum > 0 ? (
              <p className="text-xs text-muted-foreground mt-1">
                Otros socios suman {existingSum}% — queda {maxPercentage}% disponible
              </p>
            ) : null}
          </div>

          {isEditing && (
            <div className="flex items-center justify-between rounded-lg bg-cream p-3">
              <div>
                <Label className="text-sm font-medium">Estado activo</Label>
                <p className="text-xs text-muted-foreground">
                  Socios inactivos no reciben distribución
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || percentageValue <= 0 || overMax}
          >
            {submitting && <Loader2 size={16} className="mr-1.5 animate-spin" />}
            {isEditing ? "Guardar cambios" : "Crear socio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
