-- ============================================================
-- Simpatico HR Platform — 004 Migration
-- Run in Supabase SQL editor
-- Adds syndication tracking columns to the jobs table
-- ============================================================

-- 1. Track syndication status (none, queued, syndicated, failed)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS syndication_status TEXT DEFAULT 'none';

-- 2. Track which platforms have been successfully syndicated
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS syndicated_platforms TEXT[] DEFAULT '{}';
