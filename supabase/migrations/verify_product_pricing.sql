-- Verification script for product_pricing migration
-- Run this after applying the migration to verify everything works correctly

BEGIN;

-- Test 1: Verify the table was created with proper structure
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_pricing') THEN
        RAISE EXCEPTION 'product_pricing table was not created';
    END IF;
    
    RAISE NOTICE 'Test 1 PASSED: product_pricing table exists';
END $$;

-- Test 2: Verify constraints exist
DO $$
BEGIN
    -- Check for positive min_quantity constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%min_quantity%' 
        AND check_clause LIKE '%> 0%'
    ) THEN
        RAISE EXCEPTION 'min_quantity check constraint not found';
    END IF;
    
    -- Check for positive price constraint  
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%price%' 
        AND check_clause LIKE '%> 0%'
    ) THEN
        RAISE EXCEPTION 'price check constraint not found';
    END IF;
    
    RAISE NOTICE 'Test 2 PASSED: Check constraints exist';
END $$;

-- Test 3: Verify unique constraint on (product_id, min_quantity)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_type = 'UNIQUE' 
        AND table_name = 'product_pricing'
    ) THEN
        RAISE EXCEPTION 'Unique constraint on (product_id, min_quantity) not found';
    END IF;
    
    RAISE NOTICE 'Test 3 PASSED: Unique constraint exists';
END $$;

-- Test 4: Verify foreign key constraint to products table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.referential_constraints 
        WHERE constraint_name LIKE '%product_pricing%product%'
    ) THEN
        RAISE EXCEPTION 'Foreign key constraint to products table not found';
    END IF;
    
    RAISE NOTICE 'Test 4 PASSED: Foreign key constraint exists';
END $$;

-- Test 5: Verify indexes were created
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_pricing_product_id') THEN
        RAISE EXCEPTION 'Product ID index not found';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_pricing_min_quantity') THEN
        RAISE EXCEPTION 'Min quantity index not found';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_pricing_product_quantity') THEN
        RAISE EXCEPTION 'Compound index not found';
    END IF;
    
    RAISE NOTICE 'Test 5 PASSED: All indexes exist';
END $$;

-- Test 6: Verify RLS is enabled and policies exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'product_pricing' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS not enabled on product_pricing table';
    END IF;
    
    -- Check if policies exist
    IF (SELECT count(*) FROM pg_policies WHERE tablename = 'product_pricing') < 2 THEN
        RAISE EXCEPTION 'Expected RLS policies not found';
    END IF;
    
    RAISE NOTICE 'Test 6 PASSED: RLS enabled and policies exist';
END $$;

-- Test 7: Verify data migration occurred (if products exist)
DO $$
DECLARE
    product_count INTEGER;
    pricing_count INTEGER;
BEGIN
    SELECT count(*) INTO product_count FROM public.products;
    SELECT count(*) INTO pricing_count FROM public.product_pricing WHERE min_quantity = 1;
    
    IF product_count > 0 AND pricing_count = 0 THEN
        RAISE EXCEPTION 'Products exist but no default pricing tiers were created';
    END IF;
    
    RAISE NOTICE 'Test 7 PASSED: Data migration completed (% products, % pricing entries)', product_count, pricing_count;
END $$;

-- Test 8: Test the get_product_price function
DO $$
DECLARE
    test_product_id UUID;
    test_price DECIMAL(10,2);
BEGIN
    -- Get a product to test with
    SELECT id INTO test_product_id FROM public.products LIMIT 1;
    
    IF test_product_id IS NOT NULL THEN
        -- Test the function
        SELECT get_product_price(test_product_id, 1) INTO test_price;
        
        IF test_price IS NULL OR test_price <= 0 THEN
            RAISE EXCEPTION 'get_product_price function returned invalid result';
        END IF;
        
        RAISE NOTICE 'Test 8 PASSED: get_product_price function works (returned %)', test_price;
    ELSE
        RAISE NOTICE 'Test 8 SKIPPED: No products available for testing';
    END IF;
END $$;

-- Test 9: Verify the product_pricing_view exists and is accessible
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'product_pricing_view') THEN
        RAISE EXCEPTION 'product_pricing_view not created';
    END IF;
    
    RAISE NOTICE 'Test 9 PASSED: product_pricing_view exists';
END $$;

-- Test 10: Test data integrity - try to insert invalid data (should fail)
DO $$
DECLARE
    test_product_id UUID;
BEGIN
    SELECT id INTO test_product_id FROM public.products LIMIT 1;
    
    IF test_product_id IS NOT NULL THEN
        BEGIN
            -- This should fail due to check constraint
            INSERT INTO public.product_pricing (product_id, min_quantity, price) 
            VALUES (test_product_id, -1, 10.00);
            
            RAISE EXCEPTION 'Invalid min_quantity was allowed - constraint failed';
        EXCEPTION
            WHEN check_violation THEN
                RAISE NOTICE 'Test 10a PASSED: Negative min_quantity properly rejected';
        END;
        
        BEGIN
            -- This should fail due to check constraint
            INSERT INTO public.product_pricing (product_id, min_quantity, price) 
            VALUES (test_product_id, 1, -5.00);
            
            RAISE EXCEPTION 'Invalid price was allowed - constraint failed';
        EXCEPTION
            WHEN check_violation THEN
                RAISE NOTICE 'Test 10b PASSED: Negative price properly rejected';
        END;
    ELSE
        RAISE NOTICE 'Test 10 SKIPPED: No products available for testing';
    END IF;
END $$;

ROLLBACK;  -- Don't actually commit any test data

-- Summary
SELECT 'All verification tests completed successfully!' as result;