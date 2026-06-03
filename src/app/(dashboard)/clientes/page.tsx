"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Plus,
  Pencil,
  UserCircle,
  MessageCircle,
  Copy,
  Phone,
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { PageShell } from "@/components/shared/page-shell"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { SearchInput } from "@/components/shared/search-input"
import { PageSkeleton } from "@/components/shared/skeletons"
import { Button } from "@/components/ui/button"
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
import { SALE_CHANNELS } from "@/lib/constants"
import { ClientFormDialog } from "./client-form-dialog"
import type { Client } from "@/lib/types"

const CHANNEL_LABELS: Record<string, string> = {}
for (const ch of SALE_CHANNELS) {
  CHANNEL_LABELS[ch.value] = ch.label
}

/**
 * Normaliza un teléfono colombiano para WhatsApp:
 * quita todo lo que no sea dígito y antepone 57 si no lo tiene.
 */
function toWhatsappNumber(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "")
  if (!digits) return ""
  // Quitar 0 inicial (marcación nacional) si existe
  const clean = digits.replace(/^0+/, "")
  return clean.startsWith("57") ? clean : `57${clean}`
}

function ClientesPageInner() {
  const supabase = createClient()
  const params = useSearchParams()

  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const [statusFilter, setStatusFilter] = useState("all")
  const [creditFilter, setCreditFilter] = useState("all")
  const [showForm, setShowForm] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("clients")
      .select("*")
      .order("full_name")

    if (data) setClients(data as Client[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  // Intent de creación (?nuevo=1) desde el command palette
  useEffect(() => {
    if (params.get("nuevo") === "1") {
      setSelectedClient(null)
      setShowForm(true)
    }
  }, [params])

  // === Stats ===
  const stats = useMemo(() => {
    const activeClients = clients.filter((c) => c.is_active)
    const inactiveClients = clients.filter((c) => !c.is_active)
    const withCredit = clients.filter((c) => c.is_active && c.credit_enabled)

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const newThisMonth = clients.filter((c) => c.created_at >= monthStart).length

    return {
      active: activeClients.length,
      inactive: inactiveClients.length,
      withCredit: withCredit.length,
      newThisMonth,
    }
  }, [clients])

  // === Filtrado ===
  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const q = debouncedSearch.toLowerCase()
      const matchesSearch =
        !q ||
        c.full_name.toLowerCase().includes(q) ||
        c.phone_whatsapp.toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.cedula_nit || "").toLowerCase().includes(q)

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && c.is_active) ||
        (statusFilter === "inactive" && !c.is_active)

      const matchesCredit =
        creditFilter === "all" ||
        (creditFilter === "with" && c.credit_enabled) ||
        (creditFilter === "without" && !c.credit_enabled)

      return matchesSearch && matchesStatus && matchesCredit
    })
  }, [clients, debouncedSearch, statusFilter, creditFilter])

  const hasActiveFilters =
    !!search || statusFilter !== "all" || creditFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setCreditFilter("all")
  }

  const openCreate = () => {
    setSelectedClient(null)
    setShowForm(true)
  }

  const openEdit = (c: Client) => {
    setSelectedClient(c)
    setShowForm(true)
  }

  const handleCopyPhone = useCallback(async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone)
      toast.success("Teléfono copiado", { description: phone })
    } catch {
      toast.error("No se pudo copiar el teléfono")
    }
  }, [])

  const totalCreditLimit = useMemo(
    () =>
      filtered
        .filter((c) => c.credit_enabled)
        .reduce((sum, c) => sum + (c.credit_limit || 0), 0),
    [filtered]
  )

  // === Columnas ===
  const columns = useMemo<Column<Client>[]>(
    () => [
      {
        key: "name",
        header: "Nombre",
        sortAccessor: (c) => c.full_name,
        cell: (c) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {c.full_name}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground sm:hidden">
              <Phone size={11} />
              {c.phone_whatsapp}
            </p>
          </div>
        ),
      },
      {
        key: "phone",
        header: "Teléfono",
        className: "hidden sm:table-cell",
        sortAccessor: (c) => c.phone_whatsapp,
        cell: (c) => (
          <span className="tabular-nums text-foreground">{c.phone_whatsapp}</span>
        ),
      },
      {
        key: "city",
        header: "Ciudad",
        className: "hidden md:table-cell text-muted-foreground",
        sortAccessor: (c) => c.city ?? "",
        cell: (c) => c.city || "—",
      },
      {
        key: "channel",
        header: "Canal origen",
        className: "hidden lg:table-cell text-muted-foreground",
        cell: (c) =>
          c.source_channel
            ? CHANNEL_LABELS[c.source_channel] || c.source_channel
            : "—",
      },
      {
        key: "credit",
        header: "Crédito",
        align: "center",
        className: "hidden md:table-cell",
        sortAccessor: (c) => (c.credit_enabled ? c.credit_limit || 1 : 0),
        cell: (c) =>
          c.credit_enabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center rounded-full border border-info/20 bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                  {c.credit_limit > 0 ? formatCOP(c.credit_limit) : "Sí"}
                </span>
              </TooltipTrigger>
              <TooltipContent>Crédito habilitado</TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        footer: totalCreditLimit > 0 ? formatCOP(totalCreditLimit) : undefined,
      },
      {
        key: "status",
        header: "Estado",
        align: "center",
        cell: (c) => <StatusBadge status={c.is_active ? "active" : "inactive"} />,
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (c) => {
          const wa = toWhatsappNumber(c.phone_whatsapp)
          return (
            <div
              className="flex items-center justify-end gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {wa && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon-xs"
                      className="text-success hover:text-success"
                    >
                      <a
                        href={`https://wa.me/${wa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Escribir por WhatsApp"
                      >
                        <MessageCircle size={15} />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Escribir por WhatsApp</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleCopyPhone(c.phone_whatsapp)}
                  >
                    <Copy size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copiar teléfono</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => openEdit(c)}
                  >
                    <Pencil size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar cliente</TooltipContent>
              </Tooltip>
            </div>
          )
        },
      },
    ],
    [handleCopyPhone, totalCreditLimit]
  )

  if (loading) {
    return <PageSkeleton stats={4} rows={8} cols={6} />
  }

  return (
    <PageShell
      title="Clientes"
      description="Base de datos de clientes (CRM)"
      actions={
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-1.5" />
          Nuevo cliente
        </Button>
      }
    >
      {/* Stat Cards — clicables para filtrar */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Clientes activos"
          value={stats.active}
          icon="Users"
          format="number"
          borderColor="gold"
          delay={0}
          active={statusFilter === "active"}
          onClick={() =>
            setStatusFilter((s) => (s === "active" ? "all" : "active"))
          }
        />
        <StatCard
          label="Con crédito"
          value={stats.withCredit}
          icon="DollarSign"
          format="number"
          borderColor="info"
          delay={1}
          active={creditFilter === "with"}
          onClick={() =>
            setCreditFilter((c) => (c === "with" ? "all" : "with"))
          }
        />
        <StatCard
          label="Nuevos este mes"
          value={stats.newThisMonth}
          icon="TrendingUp"
          format="number"
          borderColor="success"
          delay={2}
        />
        <StatCard
          label="Inactivos"
          value={stats.inactive}
          icon="Users"
          format="number"
          borderColor="warning"
          delay={3}
          active={statusFilter === "inactive"}
          onClick={() =>
            setStatusFilter((s) => (s === "inactive" ? "all" : "inactive"))
          }
        />
      </div>

      {/* Filtros */}
      <FilterBar
        search={
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por nombre, teléfono, email o cédula..."
            wrapperClassName="max-w-sm"
          />
        }
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={creditFilter} onValueChange={setCreditFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Crédito" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Crédito (todos)</SelectItem>
            <SelectItem value="with">Con crédito</SelectItem>
            <SelectItem value="without">Sin crédito</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Tabla */}
      <DataTable
        data={filtered}
        columns={columns}
        rowKey={(c) => c.id}
        onRowClick={openEdit}
        isFiltered={hasActiveFilters}
        pageSize={25}
        showFooter
        empty={{
          icon: UserCircle,
          title: hasActiveFilters ? "Sin resultados" : "Sin clientes",
          description: hasActiveFilters
            ? "No se encontraron clientes con los filtros aplicados. Prueba ajustarlos."
            : "Registra tu primer cliente para empezar a construir tu CRM.",
          action: (
            <Button onClick={openCreate}>
              <Plus size={16} className="mr-1.5" />
              Nuevo cliente
            </Button>
          ),
        }}
      />

      {/* Dialog */}
      <ClientFormDialog
        open={showForm}
        onOpenChange={(isOpen) => {
          setShowForm(isOpen)
          if (!isOpen) setSelectedClient(null)
        }}
        client={selectedClient}
        onCompleted={fetchClients}
      />
    </PageShell>
  )
}

export default function ClientesPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={4} rows={8} cols={6} />}>
      <ClientesPageInner />
    </Suspense>
  )
}
