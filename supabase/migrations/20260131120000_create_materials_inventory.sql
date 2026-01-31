-- Migration: Create Materials Inventory System
-- Description: Adds tables for tracking packaging materials, linking them to SKUs, and audit logging

BEGIN;

-- =============================================================================
-- Table: materials
-- Description: Catalog of packaging materials (bags, trays, stickers, etc.)
-- =============================================================================
CREATE TABLE public.materials (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    sku_code TEXT,
    material_type TEXT CHECK (material_type IN ('bag_strain', 'bag_generic', 'tray', 'sticker', 'other')),
    current_stock INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for materials
CREATE INDEX idx_materials_name ON public.materials(name);
CREATE INDEX idx_materials_material_type ON public.materials(material_type);
CREATE INDEX idx_materials_sku_code ON public.materials(sku_code);

-- Add updated_at trigger for materials
CREATE TRIGGER update_materials_updated_at
    BEFORE UPDATE ON public.materials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add table comment
COMMENT ON TABLE public.materials IS
'Catalog of packaging materials including bags, trays, stickers, and other materials used in product packaging.';

-- =============================================================================
-- Table: sku_materials
-- Description: Links SKUs to their required materials with quantity per unit
-- =============================================================================
CREATE TABLE public.sku_materials (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sku_id UUID NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    quantity_per_unit INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- Ensure unique material assignments per SKU
    UNIQUE(sku_id, material_id)
);

-- Create indexes for sku_materials
CREATE INDEX idx_sku_materials_sku_id ON public.sku_materials(sku_id);
CREATE INDEX idx_sku_materials_material_id ON public.sku_materials(material_id);

-- Add updated_at trigger for sku_materials
CREATE TRIGGER update_sku_materials_updated_at
    BEFORE UPDATE ON public.sku_materials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add table comment
COMMENT ON TABLE public.sku_materials IS
'Junction table linking SKUs to their required packaging materials. Each entry specifies how many of a material are needed per unit of the SKU.';

-- =============================================================================
-- Table: material_transactions
-- Description: Audit log for all material stock changes (usage, restocks, adjustments)
-- =============================================================================
CREATE TABLE public.material_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('usage', 'restock', 'adjustment')),
    sku_id UUID REFERENCES public.skus(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for material_transactions
CREATE INDEX idx_material_transactions_material_id ON public.material_transactions(material_id);
CREATE INDEX idx_material_transactions_sku_id ON public.material_transactions(sku_id);
CREATE INDEX idx_material_transactions_user_id ON public.material_transactions(user_id);
CREATE INDEX idx_material_transactions_type ON public.material_transactions(transaction_type);
CREATE INDEX idx_material_transactions_created_at ON public.material_transactions(created_at DESC);

-- Add table comment
COMMENT ON TABLE public.material_transactions IS
'Audit log tracking all material stock changes. Negative quantities represent usage, positive quantities represent restocks or positive adjustments.';

-- =============================================================================
-- Row Level Security Policies
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sku_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_transactions ENABLE ROW LEVEL SECURITY;

-- Materials: All authenticated users can view
CREATE POLICY "Authenticated users can view materials"
    ON public.materials
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Materials: Management, admin, and packaging can manage
CREATE POLICY "Management, admin, and packaging can manage materials"
    ON public.materials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('management', 'admin', 'packaging')
        )
    );

-- SKU Materials: All authenticated users can view
CREATE POLICY "Authenticated users can view sku_materials"
    ON public.sku_materials
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- SKU Materials: Management, admin, and packaging can manage
CREATE POLICY "Management, admin, and packaging can manage sku_materials"
    ON public.sku_materials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('management', 'admin', 'packaging')
        )
    );

-- Material Transactions: All authenticated users can view
CREATE POLICY "Authenticated users can view material_transactions"
    ON public.material_transactions
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Material Transactions: Management, admin, and packaging can insert
CREATE POLICY "Management, admin, and packaging can insert material_transactions"
    ON public.material_transactions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('management', 'admin', 'packaging')
        )
    );

COMMIT;
