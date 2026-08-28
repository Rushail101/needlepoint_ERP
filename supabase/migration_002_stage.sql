-- Migration: adds a "stage" field to track where each garment is in production.
-- Run this once in Supabase SQL Editor on your existing database.

alter table products add column if not exists stage text default 'cutting';
-- stage values: cutting | printing_embroidery | stitching | qc | packed
