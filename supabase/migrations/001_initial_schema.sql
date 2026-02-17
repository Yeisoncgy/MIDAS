-- ============================================================================
-- MIDAS - Sistema de Gestión Integral
-- Migración 001: Esquema inicial de base de datos
-- Descripción: Creación de todos los tipos ENUM, tablas, restricciones e índices
-- ============================================================================

-- ============================================================================
-- EXTENSIONES REQUERIDAS
-- ============================================================================

-- Extensión para búsqueda difusa de texto (fuzzy search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Extensión para generación de UUIDs (disponible por defecto en Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- TIPOS ENUMERADOS (ENUMS)
-- ============================================================================

-- Roles de usuario del sistema
CREATE TYPE user_role AS ENUM ('admin', 'socio', 'contador', 'vendedor');

-- Estados posibles de una venta
CREATE TYPE sale_status AS ENUM ('paid', 'pending', 'shipped', 'delivered', 'returned');

-- Métodos de pago aceptados
CREATE TYPE payment_method_type AS ENUM ('efectivo', 'bancolombia', 'nequi', 'daviplata', 'otro');

-- Canales de venta disponibles
CREATE TYPE sale_channel_type AS ENUM ('whatsapp', 'instagram', 'presencial', 'web', 'referido', 'otro');

-- Tipos de descuento aplicables
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed');

-- Tipos de movimiento de inventario
CREATE TYPE movement_type AS ENUM ('entry', 'exit', 'return', 'adjustment');

-- Tipos de cuenta financiera
CREATE TYPE account_type AS ENUM ('cash', 'bank', 'digital');

-- Tipos de movimiento en caja/bancos
CREATE TYPE cash_movement_type AS ENUM ('in', 'out', 'transfer');

-- Estados de cuentas por cobrar/pagar
CREATE TYPE account_status AS ENUM ('pending', 'partial', 'paid', 'overdue');

-- Tipos de registro de pago
CREATE TYPE payment_record_type AS ENUM ('receivable', 'payable');

-- Ciclos de facturación para suscripciones
CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual');

-- Estados de suscripción
CREATE TYPE subscription_status AS ENUM ('active', 'paused', 'cancelled');

-- Estados de campañas publicitarias
CREATE TYPE campaign_status AS ENUM ('active', 'finished', 'paused');

-- Objetivos de campañas publicitarias
CREATE TYPE campaign_objective AS ENUM ('interaction', 'messages', 'traffic', 'conversions');

-- ============================================================================
-- TABLAS
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. USUARIOS
-- Almacena los usuarios del sistema con sus roles y permisos
-- --------------------------------------------------------------------------
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    full_name   TEXT NOT NULL,
    role        user_role NOT NULL DEFAULT 'vendedor',
    avatar_url  TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    -- Permisos granulares por módulo en formato JSON
    module_permissions JSONB NOT NULL DEFAULT '{}',
    last_login_at      TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'Usuarios del sistema MIDAS con roles y permisos';
COMMENT ON COLUMN users.module_permissions IS 'Permisos granulares por módulo, ej: {"ventas": true, "gastos": false}';

-- --------------------------------------------------------------------------
-- 2. PRODUCTOS
-- Catálogo principal de productos (información base)
-- --------------------------------------------------------------------------
CREATE TABLE products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT,
    category    TEXT NOT NULL DEFAULT 'Camisetas',
    base_price  NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
    base_cost   NUMERIC(12, 2) NOT NULL CHECK (base_cost >= 0),
    sku         TEXT UNIQUE NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    image_url   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE products IS 'Catálogo principal de productos con precios base';

-- --------------------------------------------------------------------------
-- 3. VARIANTES DE PRODUCTO
-- Cada combinación de color, talla y corte de un producto
-- --------------------------------------------------------------------------
CREATE TABLE product_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color           TEXT NOT NULL,
    color_hex       TEXT NOT NULL,
    size            TEXT NOT NULL,
    cut             TEXT NOT NULL,
    stock           INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    min_stock_alert INTEGER NOT NULL DEFAULT 5 CHECK (min_stock_alert >= 0),
    cost_per_unit   NUMERIC(12, 2) NOT NULL,
    sku_variant     TEXT UNIQUE NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Restricción de unicidad: no puede haber dos variantes iguales del mismo producto
    UNIQUE (product_id, color, size, cut)
);

COMMENT ON TABLE product_variants IS 'Variantes de producto por combinación de color, talla y corte';
COMMENT ON COLUMN product_variants.color_hex IS 'Código hexadecimal del color para visualización en la UI';
COMMENT ON COLUMN product_variants.min_stock_alert IS 'Cantidad mínima antes de generar alerta de stock bajo';

-- --------------------------------------------------------------------------
-- 4. CLIENTES
-- Información completa de clientes y su origen
-- --------------------------------------------------------------------------
CREATE TABLE clients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           TEXT NOT NULL,
    cedula_nit          TEXT,
    phone_whatsapp      TEXT NOT NULL,
    email               TEXT,
    address             TEXT,
    neighborhood        TEXT,
    city                TEXT NOT NULL DEFAULT 'Bogotá',
    department          TEXT NOT NULL DEFAULT 'Cundinamarca',
    postal_code         TEXT,
    birth_date          DATE,
    gender              TEXT,
    -- Origen del cliente para trazabilidad de marketing
    source_channel      TEXT,
    source_detail       TEXT,
    first_contact_date  DATE,
    first_purchase_date DATE,
    -- Etiquetas para segmentación
    tags                TEXT[] NOT NULL DEFAULT '{}',
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE clients IS 'Base de datos de clientes con información de contacto y origen';
COMMENT ON COLUMN clients.source_channel IS 'Canal de origen del cliente (ej: Instagram, WhatsApp, Referido)';
COMMENT ON COLUMN clients.tags IS 'Etiquetas para segmentación de clientes';

-- --------------------------------------------------------------------------
-- 12. CUENTAS DE CAJA Y BANCOS
-- Se crea antes de ventas y gastos porque es referenciada por ambas
-- --------------------------------------------------------------------------
CREATE TABLE cash_bank_accounts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT UNIQUE NOT NULL,
    type       account_type NOT NULL,
    balance    NUMERIC(14, 2) NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cash_bank_accounts IS 'Cuentas de caja, bancos y billeteras digitales';

-- --------------------------------------------------------------------------
-- 20. CAMPAÑAS PUBLICITARIAS
-- Se crea antes de ventas porque es referenciada por la tabla sales
-- --------------------------------------------------------------------------
CREATE TABLE campaigns (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT NOT NULL,
    platform           TEXT NOT NULL,
    start_date         DATE NOT NULL,
    end_date           DATE,
    budget             NUMERIC(12, 2) NOT NULL,
    objective          campaign_objective NOT NULL,
    status             campaign_status NOT NULL DEFAULT 'active',
    -- Métricas de rendimiento
    reach              INTEGER DEFAULT 0,
    impressions        INTEGER DEFAULT 0,
    clicks             INTEGER DEFAULT 0,
    messages_received  INTEGER DEFAULT 0,
    cost_per_message   NUMERIC(10, 2),
    sales_attributed   INTEGER DEFAULT 0,
    revenue_generated  NUMERIC(14, 2) DEFAULT 0,
    roi                NUMERIC(8, 2),
    cac                NUMERIC(10, 2),
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE campaigns IS 'Campañas publicitarias con métricas de rendimiento y atribución de ventas';
COMMENT ON COLUMN campaigns.roi IS 'Retorno sobre la inversión de la campaña';
COMMENT ON COLUMN campaigns.cac IS 'Costo de adquisición de cliente';

-- --------------------------------------------------------------------------
-- 5. VENTAS
-- Registro principal de ventas con toda la información transaccional
-- --------------------------------------------------------------------------
CREATE TABLE sales (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number     TEXT UNIQUE NOT NULL,
    client_id          UUID REFERENCES clients(id),
    sale_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal           NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    discount_type      discount_type,
    discount_value     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
    shipping_cost      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
    total              NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
    payment_method     payment_method_type NOT NULL,
    payment_account_id UUID REFERENCES cash_bank_accounts(id),
    sale_channel       sale_channel_type NOT NULL,
    seller_user_id     UUID REFERENCES users(id),
    status             sale_status NOT NULL DEFAULT 'pending',
    shipping_address   TEXT,
    tracking_number    TEXT,
    notes              TEXT,
    campaign_id        UUID REFERENCES campaigns(id),
    created_by         UUID NOT NULL REFERENCES users(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE sales IS 'Registro principal de ventas con información de pago, envío y atribución';
COMMENT ON COLUMN sales.campaign_id IS 'Campaña publicitaria a la que se atribuye esta venta (opcional)';

-- --------------------------------------------------------------------------
-- 6. ÍTEMS DE VENTA
-- Detalle de productos incluidos en cada venta
-- --------------------------------------------------------------------------
CREATE TABLE sale_items (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id            UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity           INTEGER NOT NULL CHECK (quantity > 0),
    unit_price         NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal           NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE sale_items IS 'Líneas de detalle de cada venta con producto, cantidad y precio';

-- --------------------------------------------------------------------------
-- 7. FACTURAS
-- Documentos de facturación generados a partir de las ventas
-- --------------------------------------------------------------------------
CREATE TABLE invoices (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id          UUID NOT NULL REFERENCES sales(id),
    invoice_number   TEXT NOT NULL,
    invoice_date     TIMESTAMPTZ NOT NULL DEFAULT now(),
    pdf_url          TEXT,
    thermal_printed  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE invoices IS 'Facturas generadas, con soporte para impresión térmica y PDF';

-- --------------------------------------------------------------------------
-- 8. CATEGORÍAS DE GASTOS
-- Clasificación de los gastos del negocio
-- --------------------------------------------------------------------------
CREATE TABLE expense_categories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT UNIQUE NOT NULL,
    icon       TEXT NOT NULL,
    color      TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE expense_categories IS 'Categorías para clasificación de gastos operativos';

-- --------------------------------------------------------------------------
-- 10. PROVEEDORES
-- Se crea antes de gastos porque es referenciada por la tabla expenses
-- --------------------------------------------------------------------------
CREATE TABLE suppliers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    contact_name        TEXT,
    phone               TEXT,
    email               TEXT,
    supplies_description TEXT,
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE suppliers IS 'Proveedores de productos, materiales e insumos';

-- --------------------------------------------------------------------------
-- 9. GASTOS
-- Registro detallado de todos los gastos del negocio
-- --------------------------------------------------------------------------
CREATE TABLE expenses (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    category_id             UUID NOT NULL REFERENCES expense_categories(id),
    concept                 TEXT NOT NULL,
    supplier_id             UUID REFERENCES suppliers(id),
    amount                  NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method          payment_method_type NOT NULL,
    payment_account_id      UUID REFERENCES cash_bank_accounts(id),
    supplier_invoice_number TEXT,
    receipt_image_url       TEXT,
    notes                   TEXT,
    is_recurring            BOOLEAN NOT NULL DEFAULT FALSE,
    registered_by           UUID NOT NULL REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE expenses IS 'Registro de gastos operativos categorizados';

-- --------------------------------------------------------------------------
-- 11. MOVIMIENTOS DE INVENTARIO
-- Historial de todos los movimientos de stock
-- --------------------------------------------------------------------------
CREATE TABLE inventory_movements (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_variant_id UUID NOT NULL REFERENCES product_variants(id),
    movement_type      movement_type NOT NULL,
    quantity           INTEGER NOT NULL,
    previous_stock     INTEGER NOT NULL,
    new_stock          INTEGER NOT NULL,
    reference_type     TEXT,
    reference_id       UUID,
    notes              TEXT,
    created_by         UUID NOT NULL REFERENCES users(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory_movements IS 'Historial de movimientos de inventario para trazabilidad completa';
COMMENT ON COLUMN inventory_movements.reference_type IS 'Tipo de referencia: sale, purchase, adjustment, etc.';
COMMENT ON COLUMN inventory_movements.reference_id IS 'ID del registro que originó este movimiento';

-- --------------------------------------------------------------------------
-- 13. MOVIMIENTOS DE CAJA Y BANCOS
-- Historial de transacciones en las cuentas financieras
-- --------------------------------------------------------------------------
CREATE TABLE cash_bank_movements (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id             UUID NOT NULL REFERENCES cash_bank_accounts(id),
    movement_type          cash_movement_type NOT NULL,
    amount                 NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    previous_balance       NUMERIC(14, 2) NOT NULL,
    new_balance            NUMERIC(14, 2) NOT NULL,
    concept                TEXT NOT NULL,
    reference_type         TEXT,
    reference_id           UUID,
    transfer_to_account_id UUID REFERENCES cash_bank_accounts(id),
    created_by             UUID NOT NULL REFERENCES users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cash_bank_movements IS 'Movimientos financieros en cuentas de caja, bancos y billeteras';
COMMENT ON COLUMN cash_bank_movements.transfer_to_account_id IS 'Cuenta destino en caso de transferencias entre cuentas';

-- --------------------------------------------------------------------------
-- 14. CUENTAS POR COBRAR
-- Seguimiento de deudas de clientes
-- --------------------------------------------------------------------------
CREATE TABLE accounts_receivable (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id        UUID NOT NULL REFERENCES clients(id),
    sale_id          UUID NOT NULL REFERENCES sales(id),
    total_amount     NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
    paid_amount      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    remaining_amount NUMERIC(12, 2) NOT NULL CHECK (remaining_amount >= 0),
    due_date         DATE,
    status           account_status NOT NULL DEFAULT 'pending',
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE accounts_receivable IS 'Cuentas por cobrar a clientes con seguimiento de pagos parciales';

-- --------------------------------------------------------------------------
-- 15. CUENTAS POR PAGAR
-- Seguimiento de deudas con proveedores
-- --------------------------------------------------------------------------
CREATE TABLE accounts_payable (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id      UUID NOT NULL REFERENCES suppliers(id),
    expense_id       UUID REFERENCES expenses(id),
    total_amount     NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
    paid_amount      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    remaining_amount NUMERIC(12, 2) NOT NULL CHECK (remaining_amount >= 0),
    due_date         DATE,
    status           account_status NOT NULL DEFAULT 'pending',
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE accounts_payable IS 'Cuentas por pagar a proveedores con seguimiento de pagos parciales';

-- --------------------------------------------------------------------------
-- 16. REGISTROS DE PAGO
-- Pagos realizados contra cuentas por cobrar o por pagar
-- --------------------------------------------------------------------------
CREATE TABLE payment_records (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type               payment_record_type NOT NULL,
    reference_id       UUID NOT NULL,
    amount             NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method     payment_method_type NOT NULL,
    payment_account_id UUID REFERENCES cash_bank_accounts(id),
    payment_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    notes              TEXT,
    registered_by      UUID NOT NULL REFERENCES users(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE payment_records IS 'Registros individuales de pagos aplicados a cuentas por cobrar o pagar';

-- --------------------------------------------------------------------------
-- 17. SOCIOS
-- Socios del negocio con participación porcentual
-- --------------------------------------------------------------------------
CREATE TABLE partners (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID UNIQUE REFERENCES users(id),
    name                     TEXT NOT NULL,
    distribution_percentage  NUMERIC(5, 2) NOT NULL CHECK (distribution_percentage >= 0 AND distribution_percentage <= 100),
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE partners IS 'Socios del negocio con porcentaje de distribución de utilidades';

-- --------------------------------------------------------------------------
-- 18. RETIROS DE SOCIOS
-- Registro de retiros de utilidades por parte de los socios
-- --------------------------------------------------------------------------
CREATE TABLE partner_withdrawals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id      UUID NOT NULL REFERENCES partners(id),
    amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    method          payment_method_type NOT NULL,
    withdrawal_date DATE NOT NULL DEFAULT CURRENT_DATE,
    approved_by     UUID NOT NULL REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE partner_withdrawals IS 'Retiros de utilidades realizados por los socios del negocio';

-- --------------------------------------------------------------------------
-- 19. SUSCRIPCIONES
-- Herramientas y servicios con pagos recurrentes
-- --------------------------------------------------------------------------
CREATE TABLE subscriptions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name         TEXT NOT NULL,
    monthly_cost      NUMERIC(12, 2) NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'COP',
    billing_cycle     billing_cycle NOT NULL DEFAULT 'monthly',
    start_date        DATE NOT NULL,
    next_renewal_date DATE NOT NULL,
    status            subscription_status NOT NULL DEFAULT 'active',
    category          TEXT,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscriptions IS 'Suscripciones a herramientas y servicios con pagos recurrentes';

-- --------------------------------------------------------------------------
-- 21. REGISTRO DE ACTIVIDAD (AUDITORÍA)
-- Log de todas las acciones realizadas en el sistema
-- --------------------------------------------------------------------------
CREATE TABLE activity_log (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES users(id),
    action_type    TEXT NOT NULL,
    module         TEXT NOT NULL,
    description    TEXT NOT NULL,
    reference_type TEXT,
    reference_id   UUID,
    metadata       JSONB,
    ip_address     INET,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE activity_log IS 'Registro de auditoría de todas las acciones en el sistema';

-- --------------------------------------------------------------------------
-- 22. CONFIGURACIÓN DEL SISTEMA
-- Pares clave-valor para configuración global
-- --------------------------------------------------------------------------
CREATE TABLE settings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key        TEXT UNIQUE NOT NULL,
    value      JSONB NOT NULL,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE settings IS 'Configuración global del sistema en formato clave-valor';

-- ============================================================================
-- ÍNDICES
-- ============================================================================

-- Índices para la tabla de ventas (consultas frecuentes)
CREATE INDEX idx_sales_invoice_number ON sales (invoice_number);
CREATE INDEX idx_sales_client_id ON sales (client_id);
CREATE INDEX idx_sales_sale_date ON sales (sale_date DESC);
CREATE INDEX idx_sales_status ON sales (status);
CREATE INDEX idx_sales_seller_user_id ON sales (seller_user_id);
CREATE INDEX idx_sales_campaign_id ON sales (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_sales_created_at ON sales (created_at DESC);

-- Índices para la tabla de clientes (búsqueda rápida y fuzzy)
CREATE INDEX idx_clients_cedula_nit ON clients (cedula_nit);
CREATE INDEX idx_clients_phone_whatsapp ON clients (phone_whatsapp);
-- Índice GIN con pg_trgm para búsqueda difusa por nombre
CREATE INDEX idx_clients_full_name_trgm ON clients USING GIN (full_name gin_trgm_ops);
CREATE INDEX idx_clients_city ON clients (city);

-- Índices para la tabla de gastos
CREATE INDEX idx_expenses_expense_date ON expenses (expense_date DESC);
CREATE INDEX idx_expenses_category_id ON expenses (category_id);
CREATE INDEX idx_expenses_supplier_id ON expenses (supplier_id);

-- Índices para movimientos de inventario
CREATE INDEX idx_inventory_movements_variant ON inventory_movements (product_variant_id);
CREATE INDEX idx_inventory_movements_created ON inventory_movements (created_at DESC);
CREATE INDEX idx_inventory_movements_type ON inventory_movements (movement_type);

-- Índices para movimientos de caja/bancos
CREATE INDEX idx_cash_bank_movements_account ON cash_bank_movements (account_id);
CREATE INDEX idx_cash_bank_movements_created ON cash_bank_movements (created_at DESC);

-- Índices para el registro de actividad (auditoría)
CREATE INDEX idx_activity_log_user_id ON activity_log (user_id);
CREATE INDEX idx_activity_log_created ON activity_log (created_at DESC);
CREATE INDEX idx_activity_log_module ON activity_log (module);

-- Índices para variantes de producto
CREATE INDEX idx_product_variants_product_id ON product_variants (product_id);

-- Índices para ítems de venta
CREATE INDEX idx_sale_items_sale_id ON sale_items (sale_id);

-- Índices para cuentas por cobrar
CREATE INDEX idx_accounts_receivable_status ON accounts_receivable (status);

-- Índices para cuentas por pagar
CREATE INDEX idx_accounts_payable_status ON accounts_payable (status);

-- Índices para campañas
CREATE INDEX idx_campaigns_status ON campaigns (status);
CREATE INDEX idx_campaigns_platform ON campaigns (platform);

-- ============================================================================
-- FIN DE LA MIGRACIÓN 001
-- ============================================================================
