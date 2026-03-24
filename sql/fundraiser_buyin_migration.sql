-- Migration: Add fundraiser_buyin column to player_seasons
-- Run this in the Supabase SQL editor.

alter table player_seasons
  add column if not exists fundraiser_buyin boolean not null default false;
