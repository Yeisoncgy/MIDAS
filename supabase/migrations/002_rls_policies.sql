-- ============================================================================
-- MIDAS - Sistema de Gestión Integral
-- Migración 002: Políticas de Seguridad a Nivel de Fila (RLS)
-- Descripción: Habilita RLS en todas las tablas y define políticas por rol
-- ============================================================================

-- ============================================================================
-- FUNCIONES AUXILIARES EN ESQUEMA PUBLIC
-- ============================================================================

-- Obtiene el rol del usuario logueado
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM public.users
    WHERE id = auth.uid();
$$;

-- Verifica si el usuario tiene permiso en un módulo
CREATE OR REPLACE FUNCTION public.has_module_permission(module_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT (module_permissions ->> module_name)::boolean
         FROM public.users
         WHERE id = auth.uid()),
        TRUE
    );
$$;

-- ============================================================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_bank_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLÍTICAS PARA: users
-- Admin: CRUD completo
-- Socio: CRUD completo (con permisos de módulo)
-- Contador: Solo lectura
-- Vendedor: Solo lectura de su propio perfil
-- ============================================================================

-- Admin: acceso total a usuarios
CREATE POLICY admin_all_users ON users
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

-- Socio: acceso total a usuarios si tiene permiso del módulo
CREATE POLICY socio_all_users ON users
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('usuarios'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('usuarios'));

-- Contador: solo lectura de usuarios
CREATE POLICY contador_select_users ON users
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- Vendedor: solo puede ver su propio perfil
CREATE POLICY vendedor_select_own_user ON users
    FOR SELECT
    USING (public.get_user_role() = 'vendedor' AND id = auth.uid());

-- ============================================================================
-- POLÍTICAS PARA: products
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Solo lectura
-- ============================================================================

CREATE POLICY admin_all_products ON products
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_products ON products
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('productos'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('productos'));

CREATE POLICY contador_select_products ON products
    FOR SELECT
    USING (public.get_user_role() = 'contador');

CREATE POLICY vendedor_select_products ON products
    FOR SELECT
    USING (public.get_user_role() = 'vendedor');

-- ============================================================================
-- POLÍTICAS PARA: product_variants
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Solo lectura
-- ============================================================================

CREATE POLICY admin_all_product_variants ON product_variants
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_product_variants ON product_variants
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('productos'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('productos'));

CREATE POLICY contador_select_product_variants ON product_variants
    FOR SELECT
    USING (public.get_user_role() = 'contador');

CREATE POLICY vendedor_select_product_variants ON product_variants
    FOR SELECT
    USING (public.get_user_role() = 'vendedor');

-- ============================================================================
-- POLÍTICAS PARA: clients
-- Admin/Socio: CRUD completo
-- Contador: Sin acceso (no maneja clientes)
-- Vendedor: INSERT y SELECT
-- ============================================================================

CREATE POLICY admin_all_clients ON clients
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_clients ON clients
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('clientes'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('clientes'));

-- Vendedor: puede ver todos los clientes
CREATE POLICY vendedor_select_clients ON clients
    FOR SELECT
    USING (public.get_user_role() = 'vendedor');

-- Vendedor: puede crear nuevos clientes
CREATE POLICY vendedor_insert_clients ON clients
    FOR INSERT
    WITH CHECK (public.get_user_role() = 'vendedor');

-- ============================================================================
-- POLÍTICAS PARA: sales
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: INSERT y SELECT
-- ============================================================================

CREATE POLICY admin_all_sales ON sales
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_sales ON sales
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('ventas'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('ventas'));

CREATE POLICY contador_select_sales ON sales
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- Vendedor: puede ver todas las ventas
CREATE POLICY vendedor_select_sales ON sales
    FOR SELECT
    USING (public.get_user_role() = 'vendedor');

-- Vendedor: puede registrar nuevas ventas
CREATE POLICY vendedor_insert_sales ON sales
    FOR INSERT
    WITH CHECK (public.get_user_role() = 'vendedor');

-- ============================================================================
-- POLÍTICAS PARA: sale_items
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura (a través de ventas)
-- Vendedor: INSERT y SELECT
-- ============================================================================

CREATE POLICY admin_all_sale_items ON sale_items
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_sale_items ON sale_items
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('ventas'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('ventas'));

CREATE POLICY contador_select_sale_items ON sale_items
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- Vendedor: puede ver ítems de venta
CREATE POLICY vendedor_select_sale_items ON sale_items
    FOR SELECT
    USING (public.get_user_role() = 'vendedor');

-- Vendedor: puede agregar ítems a ventas
CREATE POLICY vendedor_insert_sale_items ON sale_items
    FOR INSERT
    WITH CHECK (public.get_user_role() = 'vendedor');

-- ============================================================================
-- POLÍTICAS PARA: invoices
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Solo lectura
-- ============================================================================

CREATE POLICY admin_all_invoices ON invoices
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_invoices ON invoices
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('ventas'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('ventas'));

CREATE POLICY contador_select_invoices ON invoices
    FOR SELECT
    USING (public.get_user_role() = 'contador');

CREATE POLICY vendedor_select_invoices ON invoices
    FOR SELECT
    USING (public.get_user_role() = 'vendedor');

-- ============================================================================
-- POLÍTICAS PARA: expense_categories
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_expense_categories ON expense_categories
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_expense_categories ON expense_categories
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('gastos'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('gastos'));

CREATE POLICY contador_select_expense_categories ON expense_categories
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: expenses
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_expenses ON expenses
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_expenses ON expenses
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('gastos'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('gastos'));

CREATE POLICY contador_select_expenses ON expenses
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: suppliers
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_suppliers ON suppliers
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_suppliers ON suppliers
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('proveedores'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('proveedores'));

CREATE POLICY contador_select_suppliers ON suppliers
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: inventory_movements
-- Admin/Socio: CRUD completo
-- Contador: Sin acceso
-- Vendedor: Solo lectura (puede ver movimientos, no crearlos)
-- ============================================================================

CREATE POLICY admin_all_inventory_movements ON inventory_movements
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_inventory_movements ON inventory_movements
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('inventario'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('inventario'));

-- Vendedor: solo puede ver movimientos de inventario (sin crear)
CREATE POLICY vendedor_select_inventory_movements ON inventory_movements
    FOR SELECT
    USING (public.get_user_role() = 'vendedor');

-- ============================================================================
-- POLÍTICAS PARA: cash_bank_accounts
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_cash_bank_accounts ON cash_bank_accounts
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_cash_bank_accounts ON cash_bank_accounts
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('caja'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('caja'));

CREATE POLICY contador_select_cash_bank_accounts ON cash_bank_accounts
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: cash_bank_movements
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_cash_bank_movements ON cash_bank_movements
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_cash_bank_movements ON cash_bank_movements
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('caja'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('caja'));

CREATE POLICY contador_select_cash_bank_movements ON cash_bank_movements
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: accounts_receivable
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_accounts_receivable ON accounts_receivable
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_accounts_receivable ON accounts_receivable
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('cuentas'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('cuentas'));

CREATE POLICY contador_select_accounts_receivable ON accounts_receivable
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: accounts_payable
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_accounts_payable ON accounts_payable
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_accounts_payable ON accounts_payable
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('cuentas'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('cuentas'));

CREATE POLICY contador_select_accounts_payable ON accounts_payable
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: payment_records
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_payment_records ON payment_records
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_payment_records ON payment_records
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('cuentas'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('cuentas'));

CREATE POLICY contador_select_payment_records ON payment_records
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: partners
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_partners ON partners
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_partners ON partners
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('socios'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('socios'));

CREATE POLICY contador_select_partners ON partners
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: partner_withdrawals
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_partner_withdrawals ON partner_withdrawals
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_partner_withdrawals ON partner_withdrawals
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('socios'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('socios'));

CREATE POLICY contador_select_partner_withdrawals ON partner_withdrawals
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: subscriptions
-- Admin/Socio: CRUD completo
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_subscriptions ON subscriptions
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_subscriptions ON subscriptions
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('suscripciones'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('suscripciones'));

CREATE POLICY contador_select_subscriptions ON subscriptions
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- POLÍTICAS PARA: campaigns
-- Admin/Socio: CRUD completo
-- Contador: Sin acceso
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_campaigns ON campaigns
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_all_campaigns ON campaigns
    FOR ALL
    USING (public.get_user_role() = 'socio' AND public.has_module_permission('campanas'))
    WITH CHECK (public.get_user_role() = 'socio' AND public.has_module_permission('campanas'));

-- ============================================================================
-- POLÍTICAS PARA: activity_log
-- Admin: CRUD completo
-- Socio: Solo lectura
-- Contador: Sin acceso
-- Vendedor: Sin acceso (el sistema inserta automáticamente)
-- ============================================================================

CREATE POLICY admin_all_activity_log ON activity_log
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_select_activity_log ON activity_log
    FOR SELECT
    USING (public.get_user_role() = 'socio');

-- Política para permitir inserciones del sistema (funciones con SECURITY DEFINER)
-- Las funciones que registran actividad se ejecutan como superusuario
CREATE POLICY system_insert_activity_log ON activity_log
    FOR INSERT
    WITH CHECK (TRUE);

-- ============================================================================
-- POLÍTICAS PARA: settings
-- Admin: CRUD completo
-- Socio: Solo lectura
-- Contador: Solo lectura
-- Vendedor: Sin acceso
-- ============================================================================

CREATE POLICY admin_all_settings ON settings
    FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY socio_select_settings ON settings
    FOR SELECT
    USING (public.get_user_role() = 'socio');

CREATE POLICY contador_select_settings ON settings
    FOR SELECT
    USING (public.get_user_role() = 'contador');

-- ============================================================================
-- FIN DE LA MIGRACIÓN 002
-- ============================================================================
