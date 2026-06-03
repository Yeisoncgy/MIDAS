"use client"

import Link from "next/link"
import { Users, Truck, ChevronRight, Shield } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useAuth } from "@/components/providers/auth-provider"
import { PageShell } from "@/components/shared/page-shell"
import { EmptyState } from "@/components/shared/empty-state"
import { Card } from "@/components/ui/card"

interface ConfigSection {
  title: string
  description: string
  href: string
  icon: LucideIcon
  borderColor: string
  iconColor: string
}

const SECTIONS: ConfigSection[] = [
  {
    title: "Usuarios",
    description: "Gestión de cuentas, roles y permisos del sistema",
    href: "/configuracion/usuarios",
    icon: Users,
    borderColor: "border-l-gold",
    iconColor: "text-gold",
  },
  {
    title: "Proveedores",
    description: "Directorio de proveedores de productos e insumos",
    href: "/configuracion/proveedores",
    icon: Truck,
    borderColor: "border-l-info",
    iconColor: "text-info",
  },
]

export default function ConfiguracionPage() {
  const { isAdmin } = useAuth()

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Shield}
        title="Acceso restringido"
        description="Solo el administrador puede acceder a la configuración."
      />
    )
  }

  return (
    <PageShell
      title="Configuración"
      description="Administra usuarios, proveedores y los ajustes generales del sistema"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card
              className={`group relative cursor-pointer border-l-[3px] ${section.borderColor} p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <section.icon size={20} className={section.iconColor} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {section.title}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className="mt-1 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-gold"
                />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  )
}
