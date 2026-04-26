-- Fix RLS policy for the companies table
-- This script replaces any restrictive UPDATE policies on the companies table 
-- with a safe policy that allows company owners or admins to update their company settings.

DO $$ 
BEGIN
    -- Drop any existing UPDATE or ALL policies that might be causing the "new row violates RLS" error
    DROP POLICY IF EXISTS "Enable update for users based on email" ON companies;
    DROP POLICY IF EXISTS "Enable update for authenticated users only" ON companies;
    DROP POLICY IF EXISTS "Users can update their own company" ON companies;
    DROP POLICY IF EXISTS "tenant_update_companies" ON companies;
    DROP POLICY IF EXISTS "owner_update_companies" ON companies;
    DROP POLICY IF EXISTS "Enable ALL for authenticated users" ON companies;
    DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON companies;
    
    -- Create a new UPDATE policy for the companies table
    -- This allows an authenticated user to update the company if they are the owner
    -- OR if their user profile links them to this company (tenant_id/company_id).
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'companies') THEN
        EXECUTE '
        CREATE POLICY "tenant_update_companies" ON companies
        FOR UPDATE TO authenticated
        USING (
            owner_id = auth.uid() 
            OR id IN (SELECT company_id FROM users WHERE auth_id = auth.uid())
        )
        WITH CHECK (
            owner_id = auth.uid() 
            OR id IN (SELECT company_id FROM users WHERE auth_id = auth.uid())
        );';
    END IF;
END $$;
