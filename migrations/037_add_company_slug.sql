-- Migration 037: Add slug column to companies table for clean URLs
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Backfill slugs for existing companies
UPDATE public.companies 
SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6)
WHERE slug IS NULL;
