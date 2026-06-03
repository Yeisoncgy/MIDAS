"use client"

import { useState } from "react"
import { User, Mail, Shield, Clock, Save, KeyRound, Loader2, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
import { PageShell } from "@/components/shared/page-shell"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { getInitials, formatDateTime } from "@/lib/format"
import { ROLE_LABELS } from "@/lib/constants"
import { cn } from "@/lib/utils"

export default function PerfilPage() {
  const supabase = createClient()
  const { user, isAdmin } = useAuth()

  const [fullName, setFullName] = useState(user?.full_name ?? "")
  const [savingName, setSavingName] = useState(false)

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  if (!user) {
    return (
      <PageShell title="Mi Perfil" description="Información personal y contraseña">
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-gold" size={28} />
        </div>
      </PageShell>
    )
  }

  const handleSaveName = async () => {
    const trimmed = fullName.trim()
    if (!trimmed) {
      toast.error("El nombre no puede estar vacío")
      return
    }
    if (trimmed === user.full_name) return

    setSavingName(true)
    const { error } = await supabase
      .from("users")
      .update({ full_name: trimmed })
      .eq("id", user.id)

    if (error) {
      toast.error("No se pudo actualizar el nombre", { description: error.message })
    } else {
      toast.success("Nombre actualizado", {
        description: "Recarga la página para verlo en todos lados.",
      })
    }
    setSavingName(false)
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden")
      return
    }

    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      toast.error("No se pudo cambiar la contraseña", { description: error.message })
    } else {
      toast.success("Contraseña actualizada correctamente")
      setNewPassword("")
      setConfirmPassword("")
    }
    setSavingPassword(false)
  }

  const infoRows = [
    { icon: Mail, label: "Correo", value: user.email },
    { icon: Shield, label: "Rol", value: ROLE_LABELS[user.role] },
    {
      icon: Clock,
      label: "Último acceso",
      value: user.last_login_at ? formatDateTime(user.last_login_at) : "—",
    },
  ]

  return (
    <PageShell title="Mi Perfil" description="Información personal y contraseña">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tarjeta de identidad */}
        <Card className="flex flex-col items-center p-6 text-center lg:col-span-1">
          <div
            className={cn(
              "flex size-20 items-center justify-center rounded-full text-2xl font-semibold",
              isAdmin ? "bg-gold text-white" : "bg-muted text-foreground"
            )}
          >
            {getInitials(user.full_name)}
          </div>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-lg font-bold text-foreground">
            {user.full_name}
          </h2>
          <span
            className={cn(
              "mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
              isAdmin ? "bg-gold/10 text-gold" : "bg-muted text-muted-foreground"
            )}
          >
            {ROLE_LABELS[user.role]}
          </span>

          <div className="mt-6 w-full space-y-3 text-left">
            {infoRows.map((row) => {
              const Icon = row.icon
              return (
                <div key={row.label} className="flex items-start gap-3">
                  <Icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className="truncate text-sm font-medium text-foreground">{row.value}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Formularios */}
        <div className="space-y-6 lg:col-span-2">
          {/* Datos personales */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <User size={18} className="text-gold" />
              <h3 className="font-semibold text-foreground">Datos personales</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="full-name">Nombre completo</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={savingName}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Correo electrónico</Label>
                <Input value={user.email} disabled className="opacity-60" />
                <p className="text-xs text-muted-foreground">
                  El correo no se puede modificar desde aquí.
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveName}
                  disabled={savingName || fullName.trim() === user.full_name}
                >
                  {savingName ? (
                    <Loader2 size={16} className="mr-1.5 animate-spin" />
                  ) : (
                    <Save size={16} className="mr-1.5" />
                  )}
                  Guardar cambios
                </Button>
              </div>
            </div>
          </Card>

          {/* Cambiar contraseña */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound size={18} className="text-gold" />
              <h3 className="font-semibold text-foreground">Cambiar contraseña</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    disabled={savingPassword}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? "Ocultar" : "Mostrar"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  disabled={savingPassword}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleChangePassword}
                  disabled={savingPassword || !newPassword || !confirmPassword}
                >
                  {savingPassword ? (
                    <Loader2 size={16} className="mr-1.5 animate-spin" />
                  ) : (
                    <KeyRound size={16} className="mr-1.5" />
                  )}
                  Actualizar contraseña
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
