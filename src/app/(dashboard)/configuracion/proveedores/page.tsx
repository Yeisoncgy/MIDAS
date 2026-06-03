"use client"

import { useEffect, useState, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Plus,
  Truck,
  Phone,
  Mail,
  Pencil,
  Shield,
  Package,
  Receipt,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
import { PageShell } from "@/components/shared/page-shell"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { SearchInput } from "@/components/shared/search-input"
import { PageSkeleton } from "@/components/shared/skeletons"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDebounce } from "@/hooks/use-debounce"
import type { Supplier } from "@/lib/types"
import { SupplierFormDialog } from "./supplier-form-dialog"

function ProveedoresPageInner() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [showForm, setShowForm] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)

  // Contadores de uso
  const [materialCounts, setMaterialCounts] = useState<Record<string, number>>({})
  const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({})

  const { isAdmin } = useAuth()
  const supabase = createClient()
  const params = useSearchParams()

  const debouncedSearch = useDebounce(search, 250)

  const fetchSuppliers = useCallback(async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name")

    if (!error && data) {
      setSuppliers(data as unknown as Supplier[])
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

  // Intent de creación desde el command palette (?nuevo=1)
  useEffect(() => {
    if (params.get("nuevo") === "1") {
      setSelectedSupplier(null)
      setShowForm(true)
    }
  }, [params])

  // --- Stats ---
  const totalSuppliers = suppliers.filter((s) => s.is_active).length
  const inactiveSuppliers = suppliers.filter((s) => !s.is_active).length
  const withContact = suppliers.filter(
    (s) => s.is_active && (s.phone || s.email)
  ).length
  const linkedToMaterials = Object.keys(materialCounts).length

  // --- Filtros ---
  const filteredSuppliers = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return suppliers.filter((s) => {
      const matchesSearch =
        !q ||
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

  const handleCompleted = () => {
    fetchSuppliers()
    fetchUsageCounts()
  }

  // --- Columnas ---
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
            {s.contact_name && <p className="text-sm">{s.contact_name}</p>}
            {s.email && (
              <p className="text-xs text-muted-foreground">{s.email}</p>
            )}
            {!s.contact_name && !s.email && (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </div>
        ),
      },
      {
        key: "supplies",
        header: "Suministra",
        className: "hidden lg:table-cell max-w-[200px] truncate text-muted-foreground",
        cell: (s) => s.supplies_description || "—",
      },
      {
        key: "usage",
        header: "Uso",
        align: "center",
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
        cell: (s) => <StatusBadge status={s.is_active ? "active" : "inactive"} />,
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (s) => (
          <div
            className="flex items-center justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={() => openEdit(s)}>
                  <Pencil size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar proveedor</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [materialCounts, expenseCounts]
  )

  // --- Acceso restringido ---
  if (!isAdmin) {
    return (
      <EmptyState
        icon={Shield}
        title="Acceso restringido"
        description="Solo el administrador puede gestionar proveedores."
      />
    )
  }

  // --- Loading ---
  if (loading) {
    return <PageSkeleton stats={4} rows={6} cols={6} />
  }

  return (
    <PageShell
      title="Proveedores"
      description="Directorio de proveedores de productos e insumos"
      actions={
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-1.5" />
          Nuevo proveedor
        </Button>
      }
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Proveedores activos"
          value={totalSuppliers}
          icon="Users"
          format="number"
          borderColor="gold"
          delay={0}
        />
        <StatCard
          label="Con datos de contacto"
          value={withContact}
          icon="Users"
          format="number"
          borderColor="success"
          delay={1}
        />
        <StatCard
          label="Vinculados a materiales"
          value={linkedToMaterials}
          icon="Package"
          format="number"
          borderColor="info"
          delay={2}
        />
        <StatCard
          label="Inactivos"
          value={inactiveSuppliers}
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
          title: "Sin proveedores",
          description:
            "Registra tu primer proveedor para empezar a organizar tus compras.",
          action: (
            <Button onClick={openCreate}>
              <Plus size={16} className="mr-1.5" />
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
    <Suspense fallback={<PageSkeleton stats={4} rows={6} cols={6} />}>
      <ProveedoresPageInner />
    </Suspense>
  )
}
