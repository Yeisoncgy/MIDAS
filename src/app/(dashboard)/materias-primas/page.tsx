"use client"

import { useEffect, useState, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Layers,
  Plus,
  Pencil,
  PlusCircle,
  SlidersHorizontal,
  History,
  Download,
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { StatCard } from "@/components/shared/stat-card"
import { PageShell } from "@/components/shared/page-shell"
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
import { cn } from "@/lib/utils"
import { formatCOP, formatNumber, formatRelativeTime } from "@/lib/format"
import { useDebounce } from "@/hooks/use-debounce"
import { RAW_MATERIAL_CATEGORIES } from "@/lib/constants"
import type { RawMaterial } from "@/lib/types"
import { MaterialFormDialog } from "./material-form-dialog"
import { AddStockDialog } from "./add-stock-dialog"
import { AdjustStockDialog } from "./adjust-stock-dialog"
import { MovementsDialog } from "./movements-dialog"
import { exportMaterialsToExcel } from "./export-materials"

function MateriasPrimasPageInner() {
  const params = useSearchParams()

  // --- Estado del componente ---
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [stockFilter, setStockFilter] = useState("all")

  // --- Estado de diálogos ---
  const [showForm, setShowForm] = useState(false)
  const [showAddStock, setShowAddStock] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [showMovements, setShowMovements] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<RawMaterial | null>(null)

  // --- Último movimiento ---
  const [lastMovementDate, setLastMovementDate] = useState<string | null>(null)

  const supabase = createClient()

  // --- Carga de datos desde Supabase ---
  const fetchMaterials = useCallback(async () => {
    const { data, error } = await supabase
      .from("raw_materials")
      .select("*, supplier:suppliers(name)")
      .eq("is_active", true)
      .order("category")
      .order("name")

    if (!error && data) {
      setMaterials(data as unknown as RawMaterial[])
    }
    setLoading(false)
  }, [supabase])

  const fetchLastMovement = useCallback(async () => {
    const { data } = await supabase
      .from("raw_material_movements")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (data) {
      setLastMovementDate(data.created_at)
    }
  }, [supabase])

  useEffect(() => {
    fetchMaterials()
    fetchLastMovement()
  }, [fetchMaterials, fetchLastMovement])

  // --- Intent de creación desde el command palette (?nuevo=1) ---
  useEffect(() => {
    if (params.get("nuevo") === "1") {
      setSelectedMaterial(null)
      setShowForm(true)
    }
  }, [params])

  // --- Cálculos de estadísticas (memoizados) ---
  const { totalMaterials, lowStock, totalValue, outOfStock } = useMemo(() => ({
    totalMaterials: materials.length,
    lowStock: materials.filter((m) => m.stock > 0 && m.stock <= m.min_stock_alert).length,
    totalValue: materials.reduce((sum, m) => sum + m.stock * m.cost_per_unit, 0),
    outOfStock: materials.filter((m) => m.stock === 0).length,
  }), [materials])

  // --- Filtros (memoizados) ---
  const filteredMaterials = useMemo(() => materials.filter((m) => {
    const q = debouncedSearch.toLowerCase()
    const matchesSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)

    const matchesCategory =
      categoryFilter === "all" || m.category === categoryFilter

    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "ok" && m.stock > m.min_stock_alert) ||
      (stockFilter === "low" && m.stock > 0 && m.stock <= m.min_stock_alert) ||
      (stockFilter === "out" && m.stock === 0)

    return matchesSearch && matchesCategory && matchesStock
  }), [materials, debouncedSearch, categoryFilter, stockFilter])

  // --- Totales del listado filtrado (para footers) ---
  const filteredTotals = useMemo(
    () => ({
      units: filteredMaterials.reduce((s, m) => s + m.stock, 0),
      value: filteredMaterials.reduce((s, m) => s + m.stock * m.cost_per_unit, 0),
    }),
    [filteredMaterials]
  )

  // --- Nivel de stock visual ---
  const getStockLevel = (stock: number, minAlert: number) => {
    if (stock === 0) return { color: "bg-error", percent: 0, label: "Agotado" }
    if (stock <= minAlert)
      return { color: "bg-warning", percent: 30, label: "Bajo" }
    return {
      color: "bg-success",
      percent: Math.min(100, (stock / (minAlert * 4)) * 100),
      label: "OK",
    }
  }

  // --- Obtener etiqueta legible de la categoría ---
  const getCategoryLabel = (value: string) => {
    const cat = RAW_MATERIAL_CATEGORIES.find((c) => c.value === value)
    return cat ? cat.label : value
  }

  // --- Filtros activos / limpiar ---
  const hasActiveFilters =
    !!search || categoryFilter !== "all" || stockFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setCategoryFilter("all")
    setStockFilter("all")
  }

  // --- Acciones de diálogos ---
  const openCreate = () => {
    setSelectedMaterial(null)
    setShowForm(true)
  }

  const openEdit = (m: RawMaterial) => {
    setSelectedMaterial(m)
    setShowForm(true)
  }

  const openAddStock = (m: RawMaterial) => {
    setSelectedMaterial(m)
    setShowAddStock(true)
  }

  const openAdjust = (m: RawMaterial) => {
    setSelectedMaterial(m)
    setShowAdjust(true)
  }

  const openMovements = (m: RawMaterial) => {
    setSelectedMaterial(m)
    setShowMovements(true)
  }

  const handleCompleted = () => {
    fetchMaterials()
    fetchLastMovement()
  }

  // --- Columnas de la tabla ---
  const columns = useMemo<Column<RawMaterial>[]>(
    () => [
      {
        key: "material",
        header: "Material",
        sortAccessor: (m) => m.name,
        cell: (m) => (
          <div>
            <p className="font-medium text-foreground">{m.name}</p>
            {m.supplier && (
              <p className="text-xs text-muted-foreground">
                {(m.supplier as unknown as { name: string }).name}
              </p>
            )}
          </div>
        ),
        footer: (
          <span className="text-muted-foreground">
            {filteredMaterials.length} material{filteredMaterials.length !== 1 ? "es" : ""}
          </span>
        ),
      },
      {
        key: "category",
        header: "Categoría",
        className: "text-muted-foreground",
        sortAccessor: (m) => getCategoryLabel(m.category),
        cell: (m) => getCategoryLabel(m.category),
      },
      {
        key: "stock",
        header: "Stock actual",
        sortAccessor: (m) => m.stock,
        cell: (m) => {
          const stockLevel = getStockLevel(m.stock, m.min_stock_alert)
          return (
            <div className="flex items-center gap-3 min-w-[120px]">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", stockLevel.color)}
                  style={{ width: `${stockLevel.percent}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums min-w-[24px] text-right",
                  m.stock === 0 && "text-error",
                  m.stock > 0 && m.stock <= m.min_stock_alert && "text-warning"
                )}
              >
                {m.stock}
              </span>
            </div>
          )
        },
        footer: (
          <span className="text-foreground">
            {formatNumber(filteredTotals.units)} und.
          </span>
        ),
      },
      {
        key: "unit",
        header: "Unidad",
        className: "text-muted-foreground",
        cell: (m) => m.unit,
      },
      {
        key: "min_stock",
        header: "Stock mínimo",
        align: "right",
        className: "hidden md:table-cell text-muted-foreground",
        sortAccessor: (m) => m.min_stock_alert,
        cell: (m) => m.min_stock_alert,
      },
      {
        key: "cost",
        header: "Costo unitario",
        align: "right",
        className: "hidden md:table-cell text-muted-foreground",
        sortAccessor: (m) => m.cost_per_unit,
        cell: (m) => formatCOP(m.cost_per_unit),
      },
      {
        key: "value",
        header: "Valor total",
        align: "right",
        className: "hidden lg:table-cell",
        sortAccessor: (m) => m.stock * m.cost_per_unit,
        cell: (m) => (
          <span className="font-semibold text-gold">
            {formatCOP(m.stock * m.cost_per_unit)}
          </span>
        ),
        footer: (
          <span className="text-gold">{formatCOP(filteredTotals.value)}</span>
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (m) => (
          <div
            className="flex items-center justify-end gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={() => openEdit(m)}>
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
                  className="text-success hover:text-success"
                  onClick={() => openAddStock(m)}
                >
                  <PlusCircle size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Agregar stock</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-warning hover:text-warning"
                  onClick={() => openAdjust(m)}
                >
                  <SlidersHorizontal size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ajustar stock</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={() => openMovements(m)}>
                  <History size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Movimientos</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [filteredMaterials.length, filteredTotals]
  )

  // --- Estado de carga ---
  if (loading) {
    return <PageSkeleton stats={4} rows={8} cols={6} />
  }

  return (
    <PageShell
      title="Materias Primas"
      description="Control de insumos y materiales de producción"
      actions={
        <>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await exportMaterialsToExcel(filteredMaterials)
                toast.success("Reporte descargado correctamente")
              } catch {
                toast.error("Error al generar el reporte")
              }
            }}
            disabled={filteredMaterials.length === 0}
          >
            <Download size={16} className="mr-1.5" />
            Descargar reporte
          </Button>
          <Button onClick={openCreate}>
            <Plus size={18} className="mr-1.5" />
            Agregar material
          </Button>
        </>
      }
    >
      {/* Cards de resumen — clicables para filtrar por estado de stock */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total materiales"
          value={totalMaterials}
          icon="Package"
          format="number"
          borderColor="gold"
          delay={0}
        />
        <StatCard
          label="Stock bajo"
          value={lowStock}
          icon="Package"
          format="number"
          borderColor="warning"
          delay={1}
          active={stockFilter === "low"}
          onClick={() => setStockFilter((s) => (s === "low" ? "all" : "low"))}
          hint="Toca para filtrar"
        />
        <StatCard
          label="Valor en inventario"
          value={totalValue}
          icon="DollarSign"
          format="currency"
          borderColor="info"
          delay={2}
        />
        <StatCard
          label="Agotados"
          value={outOfStock}
          icon="Package"
          format="number"
          borderColor="error"
          delay={3}
          active={stockFilter === "out"}
          onClick={() => setStockFilter((s) => (s === "out" ? "all" : "out"))}
          hint="Toca para filtrar"
        />
      </div>

      {/* Info último movimiento */}
      {lastMovementDate && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Último movimiento: {formatRelativeTime(lastMovementDate)}
        </p>
      )}

      {/* Filtros */}
      <FilterBar
        search={
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por nombre o categoría..."
            wrapperClassName="max-w-sm"
          />
        }
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      >
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {RAW_MATERIAL_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo el stock</SelectItem>
            <SelectItem value="ok">Stock OK</SelectItem>
            <SelectItem value="low">Stock bajo</SelectItem>
            <SelectItem value="out">Agotado</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Tabla de materias primas */}
      <DataTable
        data={filteredMaterials}
        columns={columns}
        rowKey={(m) => m.id}
        onRowClick={openMovements}
        isFiltered={hasActiveFilters}
        pageSize={25}
        showFooter
        empty={{
          icon: Layers,
          title: "Sin materiales",
          description:
            "Agrega materiales para empezar a gestionar tus insumos de producción.",
          action: (
            <Button onClick={openCreate}>
              <Plus size={18} className="mr-1.5" />
              Agregar material
            </Button>
          ),
        }}
      />

      {/* ===== Diálogos ===== */}
      <MaterialFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        material={selectedMaterial}
        onCompleted={handleCompleted}
      />
      <AddStockDialog
        open={showAddStock}
        onOpenChange={setShowAddStock}
        material={selectedMaterial}
        onCompleted={handleCompleted}
      />
      <AdjustStockDialog
        open={showAdjust}
        onOpenChange={setShowAdjust}
        material={selectedMaterial}
        onCompleted={handleCompleted}
      />
      <MovementsDialog
        open={showMovements}
        onOpenChange={setShowMovements}
        material={selectedMaterial}
      />
    </PageShell>
  )
}

export default function MateriasPrimasPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={4} rows={8} cols={6} />}>
      <MateriasPrimasPageInner />
    </Suspense>
  )
}
