import type { ModuleName, ModulePermissions } from "./types"

// ===== Navegación del sidebar =====
// Item de navegación. `module` define el permiso requerido; `section` agrupa.
export interface NavItem {
  label: string
  href: string
  icon: string
  module: ModuleName
  section: "principal" | "secundaria" | "admin"
  /** Solo visible para admin (además del permiso de módulo). */
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  // Sección principal — operación diaria
  { label: "Dashboard", href: "/", icon: "LayoutDashboard", module: "dashboard", section: "principal" },
  { label: "Ventas", href: "/ventas", icon: "DollarSign", module: "ventas", section: "principal" },
  { label: "Facturación", href: "/facturacion", icon: "Receipt", module: "facturacion", section: "principal" },
  { label: "Inventario", href: "/inventario", icon: "Package", module: "inventario", section: "principal" },
  { label: "Materias Primas", href: "/materias-primas", icon: "Layers", module: "materias_primas", section: "principal" },
  { label: "Gastos", href: "/gastos", icon: "TrendingDown", module: "gastos", section: "principal" },
  { label: "Caja y Banco", href: "/caja", icon: "Landmark", module: "caja", section: "principal" },
  { label: "Cuentas", href: "/cuentas", icon: "ClipboardList", module: "cuentas", section: "principal" },
  { label: "Socios", href: "/socios", icon: "Users", module: "socios", section: "principal" },

  // Sección secundaria — gestión y herramientas
  { label: "Herramientas", href: "/herramientas", icon: "Wrench", module: "herramientas", section: "secundaria" },
  { label: "Pautas", href: "/pautas", icon: "Megaphone", module: "pautas", section: "secundaria" },
  { label: "Clientes", href: "/clientes", icon: "UserCircle", module: "clientes", section: "secundaria" },
  { label: "Proveedores", href: "/proveedores", icon: "Truck", module: "clientes", section: "secundaria" },
  { label: "Reportes", href: "/reportes", icon: "BarChart3", module: "reportes", section: "secundaria" },
  { label: "Wiki", href: "/wiki", icon: "BookOpen", module: "wiki", section: "secundaria" },

  // Admin
  { label: "Configuración", href: "/configuracion", icon: "Settings", module: "configuracion", section: "admin", adminOnly: true },
]

// Etiquetas legibles de cada sección del sidebar
export const NAV_SECTIONS: Record<NavItem["section"], string> = {
  principal: "Operación",
  secundaria: "Gestión",
  admin: "Administración",
}

// ===== Permisos por defecto según rol =====
export const DEFAULT_PERMISSIONS: Record<string, ModulePermissions> = {
  admin: {
    dashboard: true,
    ventas: true,
    facturacion: true,
    inventario: true,
    materias_primas: true,
    gastos: true,
    caja: true,
    cuentas: true,
    socios: true,
    herramientas: true,
    pautas: true,
    clientes: true,
    reportes: true,
    configuracion: true,
    wiki: true,
  },
  socio: {
    dashboard: true,
    ventas: true,
    facturacion: true,
    inventario: true,
    materias_primas: true,
    gastos: true,
    caja: true,
    cuentas: true,
    socios: true,
    herramientas: true,
    pautas: true,
    clientes: true,
    reportes: true,
    configuracion: false,
    wiki: true,
  },
  contador: {
    dashboard: true,
    ventas: true,
    facturacion: true,
    inventario: false,
    materias_primas: false,
    gastos: true,
    caja: true,
    cuentas: true,
    socios: false,
    herramientas: false,
    pautas: false,
    clientes: false,
    reportes: true,
    configuracion: false,
    wiki: false,
  },
  vendedor: {
    dashboard: true,
    ventas: true,
    facturacion: false,
    inventario: true,
    materias_primas: false,
    gastos: false,
    caja: false,
    cuentas: false,
    socios: false,
    herramientas: false,
    pautas: false,
    clientes: true,
    reportes: false,
    configuracion: false,
    wiki: false,
  },
}

// ===== Etiquetas de roles =====
export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  socio: "Socio",
  contador: "Contador",
  vendedor: "Vendedor",
}

// ===== Colores de roles =====
export const ROLE_COLORS: Record<string, string> = {
  admin: "bg-gold text-white",
  socio: "bg-info/10 text-info",
  contador: "bg-warning/10 text-warning",
  vendedor: "bg-success/10 text-success",
}

// ===== Estados de venta =====
export const SALE_STATUS_CONFIG = {
  paid: { label: "Pagada", color: "bg-success-bg text-success border-success/20" },
  pending: { label: "Pendiente", color: "bg-warning-bg text-warning border-warning/20" },
  shipped: { label: "Enviada", color: "bg-info-bg text-info border-info/20" },
  delivered: { label: "Entregada", color: "bg-success-bg text-success border-success/20" },
  returned: { label: "Devuelta", color: "bg-error-bg text-error border-error/20" },
}

// ===== Canales de venta =====
export const SALE_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp", icon: "MessageCircle" },
  { value: "instagram", label: "Instagram DM", icon: "Instagram" },
  { value: "presencial", label: "Presencial", icon: "Store" },
  { value: "web", label: "Web", icon: "Globe" },
  { value: "referido", label: "Referido", icon: "UserPlus" },
  { value: "otro", label: "Otro", icon: "MoreHorizontal" },
]

// ===== Métodos de pago =====
export const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo", icon: "Banknote" },
  { value: "bancolombia", label: "Bancolombia", icon: "Building2" },
  { value: "nequi", label: "Nequi", icon: "Smartphone" },
  { value: "daviplata", label: "Daviplata", icon: "Smartphone" },
  { value: "otro", label: "Otro", icon: "CreditCard" },
]

// ===== Categorías de producto =====
export const PRODUCT_CATEGORIES = [
  { value: "camisetas", label: "Camisetas" },
  { value: "busos", label: "Busos / Hoodies" },
  { value: "pantalones", label: "Pantalones" },
  { value: "chaquetas", label: "Chaquetas" },
  { value: "tenis", label: "Tenis / Sneakers" },
  { value: "gorras", label: "Gorras / Caps" },
  { value: "accesorios", label: "Accesorios" },
  { value: "otro", label: "Otro" },
]

// ===== Tallas por categoría =====
export const SIZES_BY_CATEGORY: Record<string, string[]> = {
  camisetas: ["XS", "S", "M", "L", "XL", "XXL"],
  busos: ["XS", "S", "M", "L", "XL", "XXL"],
  pantalones: ["28", "30", "32", "34", "36", "38", "40"],
  chaquetas: ["XS", "S", "M", "L", "XL", "XXL"],
  tenis: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45"],
  gorras: ["S/M", "L/XL", "Unitalla"],
  accesorios: ["Unitalla"],
  otro: ["XS", "S", "M", "L", "XL", "XXL"],
}

// ===== Cortes por categoría =====
export const CUTS_BY_CATEGORY: Record<string, string[]> = {
  camisetas: ["Oversized", "Boxy Fit", "Regular", "Slim Fit", "Crop"],
  busos: ["Oversized", "Regular", "Crop", "Zip Up"],
  pantalones: ["Wide Leg", "Straight", "Cargo", "Jogger", "Slim"],
  chaquetas: ["Oversized", "Regular", "Bomber", "Coach"],
  tenis: ["Low Top", "Mid Top", "High Top"],
  gorras: ["Trucker", "Snapback", "Dad Hat", "Fitted", "Bucket"],
  accesorios: [],
  otro: [],
}

// ===== Tallas genéricas (fallback) =====
export const SIZES = ["S", "M", "L", "XL"]

// ===== Colores de producto (paleta streetwear completa) =====
export const PRODUCT_COLORS = [
  // --- Neutros ---
  { name: "Blanco", hex: "#F5F5F5" },
  { name: "Crema", hex: "#F5F0DC" },
  { name: "Marfil", hex: "#FFFFF0" },
  { name: "Arena", hex: "#C2B280" },
  { name: "Beige", hex: "#D4C5A9" },
  { name: "Khaki", hex: "#BDB76B" },
  { name: "Avena", hex: "#D2C6A5" },

  // --- Grises ---
  { name: "Gris Claro", hex: "#D3D3D3" },
  { name: "Gris Medio", hex: "#A9A9A9" },
  { name: "Gris Rata", hex: "#8E8E82" },
  { name: "Gris Oscuro", hex: "#555555" },
  { name: "Gris Carbón", hex: "#36454F" },
  { name: "Ceniza", hex: "#B2BEB5" },
  { name: "Slate", hex: "#708090" },

  // --- Negros ---
  { name: "Negro", hex: "#0A0A0A" },
  { name: "Negro Lavado", hex: "#1C1C1C" },

  // --- Marrones / Tierra ---
  { name: "Café", hex: "#6F4E37" },
  { name: "Chocolate", hex: "#3B2F2F" },
  { name: "Marrón", hex: "#795548" },
  { name: "Camel", hex: "#C19A6B" },
  { name: "Terracota", hex: "#CC6644" },
  { name: "Óxido", hex: "#B7410E" },
  { name: "Tabaco", hex: "#71543E" },

  // --- Verdes ---
  { name: "Verde Oliva", hex: "#556B2F" },
  { name: "Verde Militar", hex: "#4B5320" },
  { name: "Verde Bosque", hex: "#228B22" },
  { name: "Verde Salvia", hex: "#B2AC88" },
  { name: "Verde Menta", hex: "#98FB98" },
  { name: "Verde Esmeralda", hex: "#50C878" },
  { name: "Verde Musgo", hex: "#8A9A5B" },

  // --- Azules ---
  { name: "Azul Marino", hex: "#001F3F" },
  { name: "Azul Acero", hex: "#4682B4" },
  { name: "Azul Bebé", hex: "#89CFF0" },
  { name: "Azul Cielo", hex: "#87CEEB" },
  { name: "Azul Índigo", hex: "#3F51B5" },
  { name: "Azul Royal", hex: "#2D5DA1" },
  { name: "Azul Denim", hex: "#1560BD" },
  { name: "Azul Petróleo", hex: "#004953" },

  // --- Rojos ---
  { name: "Rojo", hex: "#CC0000" },
  { name: "Rojo Ladrillo", hex: "#CB4154" },
  { name: "Borgoña", hex: "#800020" },
  { name: "Vino", hex: "#722F37" },
  { name: "Granate", hex: "#6C0E23" },

  // --- Morados / Lilas ---
  { name: "Morado", hex: "#6A0DAD" },
  { name: "Lavanda", hex: "#B57EDC" },
  { name: "Lila", hex: "#C8A2C8" },
  { name: "Ciruela", hex: "#673147" },

  // --- Rosados ---
  { name: "Rosa Palo", hex: "#DABEB5" },
  { name: "Rosa Viejo", hex: "#C08081" },
  { name: "Rosa Chicle", hex: "#FF69B4" },
  { name: "Salmón", hex: "#FA8072" },
  { name: "Coral", hex: "#FF7F50" },

  // --- Amarillos / Naranjas ---
  { name: "Amarillo Mantequilla", hex: "#FAEAB5" },
  { name: "Amarillo Mostaza", hex: "#FFDB58" },
  { name: "Mostaza", hex: "#D4A017" },
  { name: "Naranja", hex: "#FF8C00" },
  { name: "Naranja Quemado", hex: "#CC5500" },
  { name: "Durazno", hex: "#FFDAB9" },
]

// ===== Cortes genéricos (fallback) =====
export const PRODUCT_CUTS = ["Oversized", "Boxy Fit", "Regular", "Slim Fit"]

// ===== Grupos de colores (para el selector visual) =====
export const COLOR_GROUPS = [
  { label: "Neutros", colors: ["Blanco", "Crema", "Marfil", "Arena", "Beige", "Khaki", "Avena"] },
  { label: "Grises", colors: ["Gris Claro", "Gris Medio", "Gris Rata", "Gris Oscuro", "Gris Carbón", "Ceniza", "Slate"] },
  { label: "Negros", colors: ["Negro", "Negro Lavado"] },
  { label: "Tierra", colors: ["Café", "Chocolate", "Marrón", "Camel", "Terracota", "Óxido", "Tabaco"] },
  { label: "Verdes", colors: ["Verde Oliva", "Verde Militar", "Verde Bosque", "Verde Salvia", "Verde Menta", "Verde Esmeralda", "Verde Musgo"] },
  { label: "Azules", colors: ["Azul Marino", "Azul Acero", "Azul Bebé", "Azul Cielo", "Azul Índigo", "Azul Royal", "Azul Denim", "Azul Petróleo"] },
  { label: "Rojos", colors: ["Rojo", "Rojo Ladrillo", "Borgoña", "Vino", "Granate"] },
  { label: "Morados", colors: ["Morado", "Lavanda", "Lila", "Ciruela"] },
  { label: "Rosados", colors: ["Rosa Palo", "Rosa Viejo", "Rosa Chicle", "Salmón", "Coral"] },
  { label: "Cálidos", colors: ["Amarillo Mantequilla", "Amarillo Mostaza", "Mostaza", "Naranja", "Naranja Quemado", "Durazno"] },
]

// ===== Etiquetas de estado de cuenta (CxC/CxP) =====
export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  partial: "Parcial",
  paid: "Pagada",
  overdue: "Vencida",
}

// ===== Etiquetas de módulos (para permisos) =====
export const MODULE_LABELS: Record<ModuleName, string> = {
  dashboard: "Dashboard",
  ventas: "Ventas",
  facturacion: "Facturación",
  inventario: "Inventario",
  materias_primas: "Materias Primas",
  gastos: "Gastos",
  caja: "Caja y Banco",
  cuentas: "Cuentas por cobrar/pagar",
  socios: "Socios",
  herramientas: "Herramientas",
  pautas: "Pautas publicitarias",
  clientes: "Clientes",
  reportes: "Reportes",
  configuracion: "Configuración",
  wiki: "Wiki",
}

// ===== Categorías de gastos por defecto =====
export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Producción", icon: "Factory", color: "#8B5CF6" },
  { name: "Packaging", icon: "PackageOpen", color: "#F59E0B" },
  { name: "Herramientas y suscripciones", icon: "Wrench", color: "#3B82F6" },
  { name: "Pautas publicitarias", icon: "Megaphone", color: "#EF4444" },
  { name: "Envíos y logística", icon: "Truck", color: "#10B981" },
  { name: "Operación", icon: "Building", color: "#6B7280" },
  { name: "Otros", icon: "MoreHorizontal", color: "#9CA3AF" },
]

// ===== Categorías de materias primas =====
export const RAW_MATERIAL_CATEGORIES = [
  { value: "cajas", label: "Cajas", icon: "Package" },
  { value: "etiquetas", label: "Etiquetas", icon: "Tag" },
  { value: "marquillas", label: "Marquillas", icon: "Bookmark" },
  { value: "dtf", label: "DTF", icon: "Image" },
  { value: "vinilos", label: "Vinilos", icon: "Palette" },
  { value: "bolsas", label: "Bolsas", icon: "ShoppingBag" },
  { value: "papel_seda", label: "Papel de seda", icon: "FileText" },
  { value: "stickers", label: "Stickers", icon: "Sticker" },
  { value: "hilos", label: "Hilos", icon: "Scissors" },
  { value: "otro", label: "Otro", icon: "MoreHorizontal" },
]

// ===== Categorías del Wiki =====
export const WIKI_CATEGORIES = [
  { value: "notas", label: "Notas", icon: "FileText", color: "#3B82F6" },
  { value: "credenciales", label: "Credenciales", icon: "KeyRound", color: "#EF4444" },
  { value: "ideas", label: "Ideas", icon: "Lightbulb", color: "#F59E0B" },
  { value: "tareas", label: "Tareas", icon: "ListTodo", color: "#10B981" },
  { value: "enlaces", label: "Enlaces", icon: "Link2", color: "#8B5CF6" },
  { value: "identidad", label: "Identidad", icon: "Palette", color: "#C9A55C" },
] as const

export const WIKI_TASK_STATUS_OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_progreso", label: "En progreso" },
  { value: "completada", label: "Completada" },
] as const

export const WIKI_TASK_PRIORITY_OPTIONS = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
] as const
