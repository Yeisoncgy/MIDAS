"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import {
  Package,
  Plus,
  ArrowUpDown,
  Boxes,
} from "lucide-react"
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
import { cn } from "@/lib/utils"
import { formatCOP } from "@/lib/format"
import { useDebounce } from "@/hooks/use-debounce"
import { AddStockDialog } from "./add-stock-dialog"
import { AdjustStockDialog } from "./adjust-stock-dialog"

interface VariantWithProduct {
  id: string
  product_id: string
  color: string
  color_hex: string
  size: string
  cut: string
  stock: number
  min_stock_alert: number
  cost_per_unit: number
  sku_variant: string
  is_active: boolean
  product: { name: string; base_price: number } | null
}

export default function InventarioPage() {
  const [variants, setVariants] = useState<VariantWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const [colorFilter, setColorFilter] = useState("all")
  const [stockFilter, setStockFilter] = useState("all")
  const [showAddStock, setShowAddStock] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<VariantWithProduct | null>(null)
  const supabase = createClient()

  const fetchVariants = useCallback(async () => {
    const { data, error } = await supabase
      .from("product_variants")
      .select("*, product:products(name, base_price)")
      .eq("is_active", true)
      .order("product_id")
      .order("color")
      .order("size")

    if (!error && data) {
      setVariants(data as unknown as VariantWithProduct[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchVariants()
  }, [fetchVariants])

  const totalUnits = variants.reduce((sum, v) => sum + v.stock, 0)
  const totalValue = variants.reduce((sum, v) => sum + v.stock * v.cost_per_unit, 0)
  const lowStock = variants.filter((v) => v.stock > 0 && v.stock <= v.min_stock_alert).length
  const outOfStock = variants.filter((v) => v.stock === 0).length

  const filteredVariants = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return variants.filter((v) => {
      const matchesSearch =
        v.product?.name?.toLowerCase().includes(q) ||
        v.sku_variant?.toLowerCase().includes(q) ||
        v.color.toLowerCase().includes(q)
      const matchesColor = colorFilter === "all" || v.color === colorFilter
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "ok" && v.stock > v.min_stock_alert) ||
        (stockFilter === "low" && v.stock > 0 && v.stock <= v.min_stock_alert) ||
        (stockFilter === "out" && v.stock === 0)
      return matchesSearch && matchesColor && matchesStock
    })
  }, [variants, debouncedSearch, colorFilter, stockFilter])

  const uniqueColors = useMemo(() => [...new Set(variants.map((v) => v.color))], [variants])

  const getStockLevel = (stock: number, minAlert: number) => {
    if (stock === 0) return { color: "bg-error", percent: 0 }
    if (stock <= minAlert) return { color: "bg-warning", percent: 30 }
    return { color: "bg-success", percent: Math.min(100, (stock / (minAlert * 4)) * 100) }
  }

  const hasActiveFilters = !!search || colorFilter !== "all" || stockFilter !== "all"
  const clearFilters = () => {
    setSearch("")
    setColorFilter("all")
    setStockFilter("all")
  }

  const openAdjust = (v: VariantWithProduct) => {
    setSelectedVariant(v)
    setShowAdjust(true)
  }

  const columns = useMemo<Column<VariantWithProduct>[]>(
    () => [
      {
        key: "product",
        header: "Producto",
        sortAccessor: (v) => v.product?.name ?? "",
        cell: (v) => <span className="font-medium">{v.product?.name || "—"}</span>,
      },
      {
        key: "color",
        header: "Color",
        sortAccessor: (v) => v.color,
        cell: (v) => (
          <div className="flex items-center gap-2">
            <span
              className="size-3.5 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: v.color_hex }}
            />
            <span>{v.color}</span>
          </div>
        ),
      },
      { key: "size", header: "Talla", cell: (v) => v.size },
      { key: "cut", header: "Corte", className: "hidden md:table-cell", cell: (v) => v.cut },
      {
        key: "stock",
        header: "Stock",
        sortAccessor: (v) => v.stock,
        cell: (v) => {
          const level = getStockLevel(v.stock, v.min_stock_alert)
          return (
            <div className="flex min-w-[120px] items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", level.color)}
                  style={{ width: `${level.percent}%` }}
                />
              </div>
              <span
                className={cn(
                  "min-w-[24px] text-right text-sm font-semibold tabular-nums",
                  v.stock === 0 && "text-error",
                  v.stock > 0 && v.stock <= v.min_stock_alert && "text-warning"
                )}
              >
                {v.stock}
              </span>
            </div>
          )
        },
      },
      {
        key: "cost",
        header: "Costo ud.",
        align: "right",
        className: "hidden md:table-cell text-muted-foreground",
        sortAccessor: (v) => v.cost_per_unit,
        cell: (v) => formatCOP(v.cost_per_unit),
      },
      {
        key: "value",
        header: "Valor total",
        align: "right",
        className: "hidden lg:table-cell",
        sortAccessor: (v) => v.stock * v.cost_per_unit,
        cell: (v) => (
          <span className="font-semibold text-gold">{formatCOP(v.stock * v.cost_per_unit)}</span>
        ),
        footer: formatCOP(
          filteredVariants.reduce((s, v) => s + v.stock * v.cost_per_unit, 0)
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (v) => (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={(e) => {
              e.stopPropagation()
              openAdjust(v)
            }}
          >
            Ajustar
          </Button>
        ),
      },
    ],
    [filteredVariants]
  )

  if (loading) return <PageSkeleton stats={4} rows={8} cols={7} />

  return (
    <PageShell
      title="Inventario"
      description="Control de stock y variantes de producto"
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href="/inventario/productos">
              <Boxes size={18} className="mr-1.5" />
              Catálogo
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/inventario/movimientos">
              <ArrowUpDown size={18} className="mr-1.5" />
              Movimientos
            </Link>
          </Button>
          <Button onClick={() => setShowAddStock(true)}>
            <Plus size={18} className="mr-1.5" />
            Entrada de stock
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total unidades" value={totalUnits} icon="Package" format="number" borderColor="gold" delay={0} />
        <StatCard label="Valor del inventario" value={totalValue} icon="DollarSign" format="currency" borderColor="info" delay={1} />
        <StatCard
          label="Stock bajo"
          value={lowStock}
          icon="Package"
          format="number"
          borderColor="warning"
          delay={2}
          active={stockFilter === "low"}
          onClick={() => setStockFilter((s) => (s === "low" ? "all" : "low"))}
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
        />
      </div>

      <FilterBar
        search={
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por producto, SKU o color..."
            wrapperClassName="max-w-sm"
          />
        }
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      >
        <Select value={colorFilter} onValueChange={setColorFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Color" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los colores</SelectItem>
            {uniqueColors.map((color) => (
              <SelectItem key={color} value={color}>
                {color}
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

      <DataTable
        data={filteredVariants}
        columns={columns}
        rowKey={(v) => v.id}
        onRowClick={openAdjust}
        isFiltered={hasActiveFilters}
        pageSize={25}
        showFooter
        empty={{
          icon: Package,
          title: "Sin inventario",
          description:
            "Agrega productos desde el catálogo para empezar a gestionar inventario.",
          action: (
            <Button asChild>
              <Link href="/inventario/productos">Ir al catálogo</Link>
            </Button>
          ),
        }}
      />

      <AddStockDialog open={showAddStock} onOpenChange={setShowAddStock} onCompleted={fetchVariants} />

      {selectedVariant && (
        <AdjustStockDialog
          open={showAdjust}
          onOpenChange={(open) => {
            setShowAdjust(open)
            if (!open) setSelectedVariant(null)
          }}
          variant={selectedVariant}
          onCompleted={fetchVariants}
        />
      )}
    </PageShell>
  )
}
