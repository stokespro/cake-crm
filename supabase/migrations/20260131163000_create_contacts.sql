-- Create contacts table for dispensary contacts
CREATE TABLE public.contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dispensary_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT CHECK (role IN ('owner', 'manager', 'inventory_manager', 'buyer', 'other')),
    is_primary BOOLEAN DEFAULT false,
    comm_email BOOLEAN DEFAULT true,
    comm_sms BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create index for faster lookups by dispensary
CREATE INDEX idx_contacts_dispensary_id ON public.contacts(dispensary_id);

-- Create trigger to auto-update updated_at timestamp
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "view_contacts" ON public.contacts FOR SELECT USING (true);
CREATE POLICY "manage_contacts" ON public.contacts FOR ALL USING (true);
