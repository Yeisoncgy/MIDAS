"use client"

import { useState, useEffect } from "react"
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
import { MoneyInput } from "@/components/ui/money-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SALE_CHANNELS } from "@/lib/constants"
import type { Client } from "@/lib/types"

interface ClientFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: Client | null
  onCompleted: () => void
}

const GENDER_OPTIONS = [
  { value: "none", label: "Sin especificar" },
  { value: "Masculino", label: "Masculino" },
  { value: "Femenino", label: "Femenino" },
  { value: "Otro", label: "Otro" },
]

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onCompleted,
}: ClientFormDialogProps) {
  const supabase = createClient()
  const isEditing = !!client

  // Basicos
  const [fullName, setFullName] = useState("")
  const [phoneWhatsapp, setPhoneWhatsapp] = useState("")
  const [cedulaNit, setCedulaNit] = useState("")
  const [email, setEmail] = useState("")

  // Ubicacion
  const [address, setAddress] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [city, setCity] = useState("Bogota")
  const [department, setDepartment] = useState("Cundinamarca")
  const [postalCode, setPostalCode] = useState("")

  // Perfil
  const [birthDate, setBirthDate] = useState("")
  const [gender, setGender] = useState("none")
  const [sourceChannel, setSourceChannel] = useState("none")
  const [sourceDetail, setSourceDetail] = useState("")

  // Credito
  const [creditEnabled, setCreditEnabled] = useState(false)
  const [creditLimit, setCreditLimit] = useState<number | null>(null)

  // Otros
  const [notes, setNotes] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      if (client) {
        setFullName(client.full_name)
        setPhoneWhatsapp(client.phone_whatsapp)
        setCedulaNit(client.cedula_nit || "")
        setEmail(client.email || "")
        setAddress(client.address || "")
        setNeighborhood(client.neighborhood || "")
        setCity(client.city || "Bogota")
        setDepartment(client.department || "Cundinamarca")
        setPostalCode(client.postal_code || "")
        setBirthDate(client.birth_date?.split("T")[0] || "")
        setGender(client.gender || "none")
        setSourceChannel(client.source_channel || "none")
        setSourceDetail(client.source_detail || "")
        setCreditEnabled(client.credit_enabled)
        setCreditLimit(client.credit_limit || null)
        setNotes(client.notes || "")
        setIsActive(client.is_active)
      } else {
        setFullName("")
        setPhoneWhatsapp("")
        setCedulaNit("")
        setEmail("")
        setAddress("")
        setNeighborhood("")
        setCity("Bogota")
        setDepartment("Cundinamarca")
        setPostalCode("")
        setBirthDate("")
        setGender("none")
        setSourceChannel("none")
        setSourceDetail("")
        setCreditEnabled(false)
        setCreditLimit(null)
        setNotes("")
        setIsActive(true)
      }
    }
  }, [open, client])

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast.error("El nombre es obligatorio")
      return
    }
    if (!phoneWhatsapp.trim()) {
      toast.error("El telefono/WhatsApp es obligatorio")
      return
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("El email no tiene un formato valido")
      return
    }

    setLoading(true)

    try {
      const payload = {
        full_name: fullName.trim(),
        phone_whatsapp: phoneWhatsapp.trim(),
        cedula_nit: cedulaNit.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        neighborhood: neighborhood.trim() || null,
        city: city.trim() || "Bogota",
        department: department.trim() || "Cundinamarca",
        postal_code: postalCode.trim() || null,
        birth_date: birthDate || null,
        gender: gender === "none" ? null : gender,
        source_channel: sourceChannel === "none" ? null : sourceChannel,
        source_detail: sourceDetail.trim() || null,
        credit_enabled: creditEnabled,
        credit_limit: creditEnabled ? creditLimit ?? 0 : 0,
        notes: notes.trim() || null,
        is_active: isActive,
      }

      if (isEditing) {
        const { error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", client.id)
        if (error) throw error
        toast.success("Cliente actualizado")
      } else {
        const { error } = await supabase.from("clients").insert(payload)
        if (error) throw error
        toast.success("Cliente creado", { description: fullName.trim() })
      }

      onOpenChange(false)
      onCompleted()
    } catch {
      toast.error("Error al guardar el cliente")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] text-xl">
            {isEditing ? "Editar cliente" : "Nuevo cliente"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Datos basicos */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
              Datos basicos
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Nombre completo *</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nombre y apellido"
                  disabled={loading}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Telefono / WhatsApp *</Label>
                <Input
                  value={phoneWhatsapp}
                  onChange={(e) => setPhoneWhatsapp(e.target.value)}
                  placeholder="300 123 4567"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Cedula / NIT</Label>
                <Input
                  value={cedulaNit}
                  onChange={(e) => setCedulaNit(e.target.value)}
                  placeholder="1234567890"
                  disabled={loading}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Ubicacion */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
              Ubicacion
            </h4>
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Direccion</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle / Carrera / Transversal..."
                disabled={loading}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Barrio</Label>
                <Input
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Barrio"
                  disabled={loading}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Ciudad</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Bogota"
                  disabled={loading}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Departamento</Label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Cundinamarca"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Perfil */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
              Perfil
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Fecha de nacimiento</Label>
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Genero</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Canal de origen</Label>
                <Select value={sourceChannel} onValueChange={setSourceChannel}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin especificar</SelectItem>
                    {SALE_CHANNELS.map((ch) => (
                      <SelectItem key={ch.value} value={ch.value}>
                        {ch.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Detalle origen</Label>
                <Input
                  value={sourceDetail}
                  onChange={(e) => setSourceDetail(e.target.value)}
                  placeholder="Ej: @usuario_ig"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Credito */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.05em] font-semibold text-muted-foreground">
              Credito
            </h4>
            <div className="flex items-center justify-between rounded-lg bg-cream p-3">
              <div>
                <Label className="text-sm font-medium">Credito habilitado</Label>
                <p className="text-xs text-muted-foreground">
                  Permite ventas a credito para este cliente
                </p>
              </div>
              <Switch checked={creditEnabled} onCheckedChange={setCreditEnabled} />
            </div>
            {creditEnabled && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Limite de credito</Label>
                <MoneyInput
                  value={creditLimit}
                  onValueChange={setCreditLimit}
                  placeholder="0"
                  disabled={loading}
                />
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1">Notas (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas sobre el cliente..."
              rows={2}
              disabled={loading}
            />
          </div>

          {/* Estado (solo editar) */}
          {isEditing && (
            <div className="flex items-center justify-between rounded-lg bg-cream p-3">
              <div>
                <Label className="text-sm font-medium">Cliente activo</Label>
                <p className="text-xs text-muted-foreground">
                  Clientes inactivos no aparecen en la facturacion
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 size={16} className="mr-1.5 animate-spin" />}
            {isEditing ? "Guardar cambios" : "Crear cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
