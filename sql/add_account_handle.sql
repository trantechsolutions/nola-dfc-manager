-- Migration: Add handle column to accounts table
-- Run this in the Supabase SQL editor.
--
-- Adds a free-text handle/identifier field per account so that team managers
-- can store payment handles (e.g. @TeamVenmo, treasurer@email.com, $TeamTag)
-- directly on the account record instead of in the unstructured payment_info text.

alter table accounts add column if not exists handle text not null default '';
