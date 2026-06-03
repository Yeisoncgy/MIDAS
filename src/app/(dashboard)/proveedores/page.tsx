"use client"

import { useEffect, useState, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Plus,
  Truck,
  Phone,
  Mail,
  Pencil,
  Package,
  Receipt,
  Power,
  PowerOff,
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
import { useDebounce } from "@/hooks/use-debounce"
import type { Supplier } from "@/lib/types"
import { SupplierFormDialog } from "./supplier-form-dialog"

function ProveedoresPageInner() {
  const supabase = createClient()
  const params = useSearchParams()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const [statusFilter, setStatusFilter] = useState("all")

  const [showForm, setShowForm] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Contadores de uso
  const [materialCounts, setMaterialCounts] = useState<Record<string, number>>({})
  const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({})

  const fetchSuppliers = useCallback(async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name")

    if (!error && data) {
      setSuppliers(data as unknown as Supplier[])
    } else if (error) {
      console.error("Error al cargar proveedores:", error)
      toast.error("No se pudieron cargar los proveedores")
    }
    setLoading(false)
  }, [supabase])

  const fetchUsageCounts = useCallback(async () => {
    // Contar materiales por proveedor
    const { data: matData } = await supabase
      .from("raw_materials")
      .select("supplier_id")
      .not("supplier_id", "is", null)

    if (matData) {
      const counts: Record<string, number> = {}
      matData.forEach((m) => {
        const id = m.supplier_id as string
        counts[id] = (counts[id] || 0) + 1
      })
      setMaterialCounts(counts)
    }

    // Contar gastos por proveedor
    const { data: expData } = await supabase
      .from("expenses")
      .select("supplier_id")
      .not("supplier_id", "is", null)

    if (expData) {
      const counts: Record<string, number> = {}
      expData.forEach((e) => {
        const id = e.supplier_id as string
        counts[id] = (counts[id] || 0) + 1
      })
      setExpenseCounts(counts)
    }
  }, [supabase])

  useEffect(() => {
    fetchSuppliers()
    fetchUsageCounts()
  }, [fetchSuppliers, fetchUsageCounts])

  // Intent de creación (?nuevo=1 desde el command palette)
  useEffect(() => {
    if (params.get("nuevo") === "1") {
      setSelectedSupplier(null)
      setShowForm(true)
    }
  }, [params])

  // --- Stats ---
  const stats = useMemo(() => {
    const totalSuppliers = suppliers.filter((s) => s.is_active).length
    const inactiveSuppliers = suppliers.filter((s) => !s.is_active).length
    const withContact = suppliers.filter(
      (s) => s.is_active && (s.phone || s.email)
    ).length
    const linkedToMaterials = Object.keys(materialCounts).length
    return { totalSuppliers, inactiveSuppliers, withContact, linkedToMaterials }
  }, [suppliers, materialCounts])

  // --- Filtros ---
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const q = debouncedSearch.toLowerCase()
      const matchesSearch =
        !debouncedSearch ||
        s.name.toLowerCase().includes(q) ||
        (s.contact_name || "").toLowerCase().includes(q) ||
        (s.supplies_description || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && s.is_active) ||
        (statusFilter === "inactive" && !s.is_active)

      return matchesSearch && matchesStatus
    })
  }, [suppliers, debouncedSearch, statusFilter])

  const hasActiveFilters = !!search || statusFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
  }

  // --- Acciones ---
  const openCreate = () => {
    setSelectedSupplier(null)
    setShowForm(true)
  }

  const openEdit = (s: Supplier) => {
    setSelectedSupplier(s)
    setShowForm(true)
  }

  const handleToggleActive = async (s: Supplier) => {
    setTogglingId(s.id)
    const nextActive = !s.is_active
    const { error } = await supabase
      .from("suppliers")
      .update({ is_active: nextActive })
      .eq("id", s.id)

    if (error) {
      toast.error("No se pudo actualizar el proveedor", { description: error.message })
    } else {
      // Actualización optimista del estado local
      setSuppliers((prev) =>
        prev.map((p) => (p.id === s.id ? { ...p, is_active: nextActive } : p))
      )
      toast.success(nextActive ? "Proveedor activado" : "Proveedor desactivado", {
        description: s.name,
      })
    }
    setTogglingId(null)
  }

  const handleCompleted = () => {
    fetchSuppliers()
    fetchUsageCounts()
  }

  // === Columnas de la tabla ===
  const columns = useMemo<Column<Supplier>[]>(
    () => [
      {
        key: "name",
        header: "Proveedor",
        sortAccessor: (s) => s.name,
        cell: (s) => (
          <div>
            <p className="text-sm font-medium text-foreground">{s.name}</p>
            <div className="mt-0.5 flex items-center gap-3">
              {s.phone && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone size={11} />
                  {s.phone}
                </span>
              )}
              {s.email && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground md:hidden">
                  <Mail size={11} />
                  {s.email}
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        key: "contact",
        header: "Contacto",
        className: "hidden md:table-cell",
        sortAccessor: (s) => s.contact_name ?? "",
        cell: (s) => (
          <div className="space-y-0.5">
            {s.contact_name && <p className="text-sm text-foreground">{s.contact_name}</p>}
            {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
            {!s.contact_name && !s.email && (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </div>
        ),
      },
      {
        key: "supplies",
        header: "Suministra",
        className: "hidden lg:table-cell text-muted-foreground",
        cell: (s) => (
          <span className="block max-w-[220px] truncate text-sm text-muted-foreground">
            {s.supplies_description || "—"}
          </span>
        ),
      },
      {
        key: "usage",
        header: "Uso",
        align: "center",
        sortAccessor: (s) => (materialCounts[s.id] || 0) + (expenseCounts[s.id] || 0),
        cell: (s) => {
          const matCount = materialCounts[s.id] || 0
          const expCount = expenseCounts[s.id] || 0
          if (matCount === 0 && expCount === 0) {
            return <span className="text-xs text-muted-foreground">—</span>
          }
          return (
            <div className="flex items-center justify-center gap-2">
              {matCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-xs text-info">
                      <Package size={11} />
                      {matCount}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {matCount} material{matCount !== 1 ? "es" : ""}
                  </TooltipContent>
                </Tooltip>
              )}
              {expCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
                      <Receipt size={11} />
                      {expCount}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {expCount} gasto{expCount !== 1 ? "s" : ""}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )
        },
      },
      {
        key: "status",
        header: "Estado",
        align: "center",
        sortAccessor: (s) => (s.is_active ? 1 : 0),
        cell: (s) => (
          <StatusBadge
            status={s.is_active ? "active" : "inactive"}
            label={s.is_active ? "Activo" : "Inactivo"}
          />
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (s) => (
          <div
            className="flex items-center justify-end gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={() => openEdit(s)}>
                  <Pencil size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={togglingId === s.id}
                  className={
                    s.is_active
                      ? "text-warning hover:text-warning"
                      : "text-success hover:text-success"
                  }
                  onClick={() => handleToggleActive(s)}
                >
                  {s.is_active ? <PowerOff size={15} /> : <Power size={15} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {s.is_active ? "Desactivar proveedor" : "Activar proveedor"}
              </TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [materialCounts, expenseCounts, togglingId]
  )

  if (loading) {
    return <PageSkeleton stats={4} rows={8} cols={6} />
  }

  return (
    <PageShell
      title="Proveedores"
      description="Directorio de proveedores de productos e insumos"
      actions={
        <Button onClick={openCreate}>
          <Plus size={18} className="mr-1.5" />
          Nuevo proveedor
        </Button>
      }
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Proveedores activos"
          value={stats.totalSuppliers}
          icon="Users"
          format="number"
          borderColor="gold"
          delay={0}
          active={statusFilter === "active"}
          onClick={() =>
            setStatusFilter((f) => (f === "active" ? "all" : "active"))
          }
        />
        <StatCard
          label="Con datos de contacto"
          value={stats.withContact}
          icon="Users"
          format="number"
          borderColor="success"
          delay={1}
        />
        <StatCard
          label="Vinculados a materiales"
          value={stats.linkedToMaterials}
          icon="Package"
          format="number"
          borderColor="info"
          delay={2}
        />
        <StatCard
          label="Inactivos"
          value={stats.inactiveSuppliers}
          icon="Users"
          format="number"
          borderColor="warning"
          delay={3}
          active={statusFilter === "inactive"}
          onClick={() =>
            setStatusFilter((f) => (f === "inactive" ? "all" : "inactive"))
          }
        />
      </div>

      {/* Filtros */}
      <FilterBar
        search={
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por nombre, contacto o suministros..."
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
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Tabla */}
      <DataTable
        data={filteredSuppliers}
        columns={columns}
        rowKey={(s) => s.id}
        onRowClick={openEdit}
        isFiltered={hasActiveFilters}
        pageSize={25}
        empty={{
          icon: Truck,
          title: hasActiveFilters ? "Sin resultados" : "Sin proveedores",
          description: hasActiveFilters
            ? "No se encontraron proveedores con los filtros aplicados."
            : "Registra tu primer proveedor para empezar a organizar tus compras.",
          action: (
            <Button onClick={openCreate}>
              <Plus size={18} className="mr-1.5" />
              Nuevo proveedor
            </Button>
          ),
        }}
      />

      {/* Form Dialog */}
      <SupplierFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        supplier={selectedSupplier}
        onCompleted={handleCompleted}
      />
    </PageShell>
  )
}

export default function ProveedoresPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={4} rows={8} cols={6} />}>
      <ProveedoresPageInner />
    </Suspense>
  )
}
