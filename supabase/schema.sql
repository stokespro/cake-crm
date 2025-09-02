-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles
CREATE TYPE user_role AS ENUM ('agent', 'management', 'admin');

-- Create enum for task status
CREATE TYPE task_status AS ENUM ('pending', 'complete');

-- Create enum for order status  
CREATE TYPE order_status AS ENUM ('pending', 'submitted', 'approved');

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role user_role DEFAULT 'agent',
    full_name TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Dispensary Profiles Table
CREATE TABLE public.dispensary_profiles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_name TEXT NOT NULL,
    address TEXT,
    phone_number TEXT,
    email TEXT,
    omma_license TEXT,
    ob_license TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Products Table
CREATE TABLE public.products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    strain_name TEXT NOT NULL UNIQUE,
    price_per_unit DECIMAL(10,2) NOT NULL,
    description TEXT,
    thc_percentage DECIMAL(5,2),
    cbd_percentage DECIMAL(5,2),
    category TEXT,
    in_stock BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Communications Table
CREATE TABLE public.communications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    dispensary_id UUID REFERENCES public.dispensary_profiles(id) ON DELETE CASCADE,
    client_name TEXT,
    interaction_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    notes TEXT NOT NULL,
    contact_method TEXT, -- 'phone', 'email', 'in-person', 'text'
    follow_up_required BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tasks Table
CREATE TABLE public.tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    dispensary_id UUID REFERENCES public.dispensary_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    status task_status DEFAULT 'pending',
    priority INTEGER DEFAULT 3, -- 1=high, 2=medium, 3=low
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Orders Table
CREATE TABLE public.orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id TEXT UNIQUE, -- Assigned by fulfillment manager
    dispensary_id UUID REFERENCES public.dispensary_profiles(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    order_notes TEXT,
    requested_delivery_date DATE,
    final_delivery_date DATE, -- Editable by fulfillment manager
    status order_status DEFAULT 'pending',
    total_price DECIMAL(10,2) DEFAULT 0,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Order Items Table (for order details)
CREATE TABLE public.order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    strain_name TEXT NOT NULL, -- Denormalized for historical data
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX idx_communications_agent_id ON public.communications(agent_id);
CREATE INDEX idx_communications_dispensary_id ON public.communications(dispensary_id);
CREATE INDEX idx_communications_interaction_date ON public.communications(interaction_date DESC);

CREATE INDEX idx_tasks_agent_id ON public.tasks(agent_id);
CREATE INDEX idx_tasks_dispensary_id ON public.tasks(dispensary_id);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_tasks_status ON public.tasks(status);

CREATE INDEX idx_orders_dispensary_id ON public.orders(dispensary_id);
CREATE INDEX idx_orders_agent_id ON public.orders(agent_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_order_date ON public.orders(order_date DESC);

CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);

-- Row Level Security (RLS) Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensary_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admin can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Dispensary profiles policies
CREATE POLICY "All authenticated users can view dispensaries" ON public.dispensary_profiles
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Management and admin can manage dispensaries" ON public.dispensary_profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('management', 'admin')
        )
    );

-- Products policies
CREATE POLICY "All authenticated users can view products" ON public.products
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Management and admin can manage products" ON public.products
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('management', 'admin')
        )
    );

-- Communications policies
CREATE POLICY "Agents can view their own communications" ON public.communications
    FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY "Agents can create their own communications" ON public.communications
    FOR INSERT WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Agents can update their own communications" ON public.communications
    FOR UPDATE USING (agent_id = auth.uid());

CREATE POLICY "Management and admin can view all communications" ON public.communications
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('management', 'admin')
        )
    );

-- Tasks policies
CREATE POLICY "Agents can view their own tasks" ON public.tasks
    FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY "Agents can create their own tasks" ON public.tasks
    FOR INSERT WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Agents can update their own tasks" ON public.tasks
    FOR UPDATE USING (agent_id = auth.uid());

CREATE POLICY "Management and admin can manage all tasks" ON public.tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('management', 'admin')
        )
    );

-- Orders policies
CREATE POLICY "Agents can view their own orders" ON public.orders
    FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY "Agents can create their own orders" ON public.orders
    FOR INSERT WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Agents can update their pending orders" ON public.orders
    FOR UPDATE USING (agent_id = auth.uid() AND status = 'pending');

CREATE POLICY "Management and admin can manage all orders" ON public.orders
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('management', 'admin')
        )
    );

-- Order items policies
CREATE POLICY "Users can view order items for their orders" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
            AND (orders.agent_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role IN ('management', 'admin')
                ))
        )
    );

CREATE POLICY "Users can manage order items for their pending orders" ON public.order_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
            AND ((orders.agent_id = auth.uid() AND orders.status = 'pending') OR
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role IN ('management', 'admin')
                ))
        )
    );

-- Functions and Triggers

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dispensary_profiles_updated_at BEFORE UPDATE ON public.dispensary_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communications_updated_at BEFORE UPDATE ON public.communications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate order total
CREATE OR REPLACE FUNCTION calculate_order_total()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.orders
    SET total_price = (
        SELECT COALESCE(SUM(line_total), 0)
        FROM public.order_items
        WHERE order_id = NEW.order_id
    )
    WHERE id = NEW.order_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update order total when items change
CREATE TRIGGER update_order_total_on_insert
AFTER INSERT ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION calculate_order_total();

CREATE TRIGGER update_order_total_on_update
AFTER UPDATE ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION calculate_order_total();

CREATE TRIGGER update_order_total_on_delete
AFTER DELETE ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION calculate_order_total();

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (new.id, new.email, 'agent');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();