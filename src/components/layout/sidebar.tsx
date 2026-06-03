"use client"

import { useMemo, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  DollarSign,
  Receipt,
  Package,
  Layers,
  TrendingDown,
  Landmark,
  ClipboardList,
  Users,
  Wrench,
  Megaphone,
  UserCircle,
  BarChart3,
  Settings,
  Truck,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  X,
  Star,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/providers/auth-provider"
import { getInitials } from "@/lib/format"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ROLE_LABELS, NAV_ITEMS, NAV_SECTIONS, type NavItem } from "@/lib/constants"
import { useSidebarPrefs } from "@/hooks/use-sidebar-prefs"

// Mapa de iconos para renderizar dinámicamente
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  DollarSign,
  Receipt,
  Package,
  Layers,
  TrendingDown,
  Landmark,
  ClipboardList,
  Users,
  Wrench,
  Megaphone,
  UserCircle,
  BarChart3,
  Settings,
  Truck,
  BookOpen,
}

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  collapsed?: boolean
  onCollapse?: (collapsed: boolean) => void
  /** Badges por href (ej. { "/cuentas": 3 } para 3 cuentas vencidas). */
  badges?: Record<string, number>
}

export function Sidebar({ isOpen, onClose, collapsed = false, onCollapse, badges }: SidebarProps) {
  const pathname = usePathname()
  const { user, isAdmin, hasPermission, logout } = useAuth()
  const { isFavorite, toggleFavorite, favorites } = useSidebarPrefs()

  // Estado activo robusto: coincidencia exacta para "/", por segmento para el resto
  const isActive = useCallback(
    (href: string) => {
      if (href === "/") return pathname === "/"
      return pathname === href || pathname.startsWith(href + "/")
    },
    [pathname]
  )

  // Items visibles según permisos del usuario
  const visibleItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.adminOnly && !isAdmin) return false
        return hasPermission(item.module)
      }),
    [hasPermission, isAdmin]
  )

  // Agrupar por sección
  const sections = useMemo(() => {
    const groups: Record<NavItem["section"], NavItem[]> = {
      principal: [],
      secundaria: [],
      admin: [],
    }
    for (const item of visibleItems) groups[item.section].push(item)
    return groups
  }, [visibleItems])

  // Favoritos visibles (que el usuario tenga permiso de ver)
  const favoriteItems = useMemo(
    () => visibleItems.filter((item) => favorites.includes(item.href)),
    [visibleItems, favorites]
  )

  const renderNavItem = useCallback(
    (item: NavItem, opts?: { inFavorites?: boolean }) => {
      const Icon = ICON_MAP[item.icon] ?? LayoutDashboard
      const active = isActive(item.href)
      const badge = badges?.[item.href]
      const fav = isFavorite(item.href)

      const linkContent = (
        <Link
          href={item.href}
          onClick={onClose}
          className={cn(
            "group/item relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150",
            active
              ? "bg-sidebar-active text-gold font-medium"
              : "text-[#9CA3AF] hover:bg-sidebar-hover hover:text-white",
            collapsed && "justify-center px-0"
          )}
        >
          {/* Indicador dorado de activo */}
          {active && !collapsed && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gold" />
          )}
          <Icon className={cn("shrink-0", active && "text-gold")} size={19} />
          {!collapsed && (
            <>
              <span className="flex-1 truncate">{item.label}</span>
              {badge != null && badge > 0 && (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-semibold text-white tabular-nums">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              {/* Estrella de favorito (aparece al hover del item) */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleFavorite(item.href)
                }}
                className={cn(
                  "shrink-0 rounded p-0.5 transition-opacity",
                  fav
                    ? "text-gold opacity-100"
                    : "text-[#6B6B6B] opacity-0 hover:text-white group-hover/item:opacity-100"
                )}
                aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
              >
                <Star size={13} className={cn(fav && "fill-gold")} />
              </button>
            </>
          )}
          {/* Badge en modo colapsado: punto rojo */}
          {collapsed && badge != null && badge > 0 && (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-error" />
          )}
        </Link>
      )

      if (collapsed) {
        return (
          <Tooltip key={`${opts?.inFavorites ? "fav-" : ""}${item.href}`}>
            <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        )
      }

      return <div key={`${opts?.inFavorites ? "fav-" : ""}${item.href}`}>{linkContent}</div>
    },
    [isActive, onClose, collapsed, badges, isFavorite, toggleFavorite]
  )

  const renderSection = useCallback(
    (key: NavItem["section"], items: NavItem[]) => {
      if (items.length === 0) return null
      return (
        <div key={key} className="space-y-0.5">
          {!collapsed && (
            <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4A4A4A]">
              {NAV_SECTIONS[key]}
            </p>
          )}
          {collapsed && <div className="my-2 border-t border-[#1A1A1A]" />}
          {items.map((item) => renderNavItem(item))}
        </div>
      )
    },
    [collapsed, renderNavItem]
  )

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={cn("border-b border-[#1A1A1A] px-5 py-5", collapsed && "flex justify-center px-2")}>
        <Link href="/" className="block" onClick={onClose}>
          <h1
            className={cn(
              "font-[family-name:var(--font-display)] font-bold tracking-[0.08em] text-gold",
              collapsed ? "text-lg" : "text-2xl"
            )}
          >
            MIDAS<span className="text-gold/60">·</span>
          </h1>
          {!collapsed && (
            <p className="mt-0.5 text-[11px] tracking-wide text-[#6B6B6B]">Casa Artemisa</p>
          )}
        </Link>
      </div>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {/* Favoritos anclados */}
        {favoriteItems.length > 0 && (
          <div className="space-y-0.5">
            {!collapsed && (
              <p className="flex items-center gap-1 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold/70">
                <Star size={10} className="fill-gold/70" />
                Favoritos
              </p>
            )}
            {collapsed && <div className="mb-2 border-t border-[#1A1A1A]" />}
            {favoriteItems.map((item) => renderNavItem(item, { inFavorites: true }))}
            {!collapsed && <div className="mx-3 mt-2 border-t border-[#1A1A1A]" />}
          </div>
        )}

        {renderSection("principal", sections.principal)}
        {renderSection("secundaria", sections.secundaria)}
        {renderSection("admin", sections.admin)}
      </nav>

      {/* Botón colapsar (solo desktop) */}
      <div className="hidden border-t border-[#1A1A1A] px-3 py-2 lg:block">
        <button
          onClick={() => onCollapse?.(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg py-2 text-[#6B6B6B] transition-colors hover:bg-sidebar-hover hover:text-white"
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Perfil del usuario */}
      {user && (
        <div className={cn("border-t border-[#1A1A1A] px-3 py-3", collapsed && "px-2")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-sidebar-hover",
                  collapsed && "justify-center px-0"
                )}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    isAdmin ? "bg-gold text-white" : "bg-[#374151] text-white"
                  )}
                >
                  {getInitials(user.full_name)}
                </div>
                {!collapsed && (
                  <div className="min-w-0 text-left">
                    <p className="truncate text-sm font-medium text-white">
                      {user.full_name.split(" ")[0]}
                    </p>
                    <p className="text-[11px] text-[#6B6B6B]">{ROLE_LABELS[user.role]}</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/perfil" className="flex items-center gap-2">
                  <User size={16} />
                  Mi perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-error focus:text-error" onClick={logout}>
                <LogOut size={16} />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-[#1A1A1A] bg-sidebar-bg transition-all duration-300 lg:flex",
          collapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar mobile (drawer) */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-[280px] bg-sidebar-bg transition-transform duration-300 lg:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[#6B6B6B] transition-colors hover:text-white"
          aria-label="Cerrar menú"
        >
          <X size={20} />
        </button>
        {sidebarContent}
      </aside>
    </>
  )
}
