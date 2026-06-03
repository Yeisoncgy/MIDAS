"use client"

import { useEffect, useState, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Plus, Shield, User as UserIcon } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { useDebounce } from "@/hooks/use-debounce"
import { getInitials, formatRelativeTime } from "@/lib/format"
import { ROLE_LABELS } from "@/lib/constants"
import type { User, UserRole } from "@/lib/types"
import { CreateUserDialog } from "./create-user-dialog"
import { UserDrawer } from "./user-drawer"

const ROLE_CHIP: Record<UserRole, string> = {
  admin: "bg-gold/10 text-gold",
  socio: "bg-info/10 text-info",
  contador: "bg-warning/10 text-warning",
  vendedor: "bg-success/10 text-success",
}

function UsuariosPageInner() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const { isAdmin } = useAuth()
  const supabase = createClient()
  const params = useSearchParams()

  const debouncedSearch = useDebounce(search, 250)

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: true })

    if (!error && data) {
      setUsers(data as User[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Intent de creación desde el command palette (?nuevo=1)
  useEffect(() => {
    if (params.get("nuevo") === "1") setShowCreateDialog(true)
  }, [params])

  // --- Stats ---
  const stats = useMemo(() => {
    const activos = users.filter((u) => u.is_active).length
    const inactivos = users.filter((u) => !u.is_active).length
    const admins = users.filter((u) => u.role === "admin").length
    return { total: users.length, activos, inactivos, admins }
  }, [users])

  // --- Filtros ---
  const filteredUsers = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      const matchesRole = roleFilter === "all" || u.role === roleFilter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && u.is_active) ||
        (statusFilter === "inactive" && !u.is_active)
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, debouncedSearch, roleFilter, statusFilter])

  const hasActiveFilters =
    !!search || roleFilter !== "all" || statusFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setRoleFilter("all")
    setStatusFilter("all")
  }

  // --- Columnas ---
  const columns = useMemo<Column<User>[]>(
    () => [
      {
        key: "user",
        header: "Usuario",
        sortAccessor: (u) => u.full_name,
        cell: (u) => (
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                u.role === "admin" ? "bg-gold text-white" : "bg-muted text-foreground"
              )}
            >
              {getInitials(u.full_name)}
            </div>
            <span className="text-sm font-medium text-foreground">{u.full_name}</span>
          </div>
        ),
      },
      {
        key: "email",
        header: "Email",
        sortAccessor: (u) => u.email,
        className: "text-muted-foreground",
        cell: (u) => u.email,
      },
      {
        key: "role",
        header: "Rol",
        sortAccessor: (u) => ROLE_LABELS[u.role],
        cell: (u) => (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              ROLE_CHIP[u.role]
            )}
          >
            {ROLE_LABELS[u.role]}
          </span>
        ),
      },
      {
        key: "status",
        header: "Estado",
        align: "center",
        sortAccessor: (u) => (u.is_active ? 1 : 0),
        cell: (u) => <StatusBadge status={u.is_active ? "active" : "inactive"} />,
      },
      {
        key: "last_login",
        header: "Último acceso",
        className: "hidden md:table-cell text-muted-foreground",
        sortAccessor: (u) => u.last_login_at ?? "",
        cell: (u) =>
          u.last_login_at ? formatRelativeTime(u.last_login_at) : "Nunca",
      },
    ],
    []
  )

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Shield}
        title="Acceso restringido"
        description="Solo el administrador puede gestionar usuarios."
      />
    )
  }

  if (loading) {
    return <PageSkeleton stats={4} rows={6} cols={5} />
  }

  return (
    <PageShell
      title="Usuarios"
      description="Gestión de cuentas y permisos del sistema"
      actions={
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus size={16} className="mr-1.5" />
          Crear usuario
        </Button>
      }
    >
      {/* Stat Cards — clicables para filtrar */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total usuarios"
          value={stats.total}
          icon="Users"
          format="number"
          borderColor="gold"
          delay={0}
        />
        <StatCard
          label="Activos"
          value={stats.activos}
          icon="Users"
          format="number"
          borderColor="success"
          delay={1}
          active={statusFilter === "active"}
          onClick={() =>
            setStatusFilter((s) => (s === "active" ? "all" : "active"))
          }
        />
        <StatCard
          label="Inactivos"
          value={stats.inactivos}
          icon="Users"
          format="number"
          borderColor="warning"
          delay={2}
          active={statusFilter === "inactive"}
          onClick={() =>
            setStatusFilter((s) => (s === "inactive" ? "all" : "inactive"))
          }
        />
        <StatCard
          label="Administradores"
          value={stats.admins}
          icon="Users"
          format="number"
          borderColor="info"
          delay={3}
          active={roleFilter === "admin"}
          onClick={() => setRoleFilter((r) => (r === "admin" ? "all" : "admin"))}
        />
      </div>

      {/* Filtros */}
      <FilterBar
        search={
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por nombre o email..."
            wrapperClassName="max-w-sm"
          />
        }
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      >
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los roles</SelectItem>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        data={filteredUsers}
        columns={columns}
        rowKey={(u) => u.id}
        onRowClick={setSelectedUser}
        isFiltered={hasActiveFilters}
        pageSize={25}
        empty={{
          icon: UserIcon,
          title: "Sin usuarios",
          description: "Crea el primer usuario del sistema.",
          action: (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus size={16} className="mr-1.5" />
              Crear usuario
            </Button>
          ),
        }}
      />

      {/* Modal crear usuario */}
      <CreateUserDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={fetchUsers}
      />

      {/* Drawer detalle usuario */}
      <UserDrawer
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onUpdated={fetchUsers}
      />
    </PageShell>
  )
}

export default function UsuariosPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={4} rows={6} cols={5} />}>
      <UsuariosPageInner />
    </Suspense>
  )
}
