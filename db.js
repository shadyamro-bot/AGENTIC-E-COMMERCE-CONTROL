'use strict';
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = connectionString ? new Pool({ connectionString, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }) : null;
async function query(text, params = []) { if (!pool) throw new Error('DATABASE_URL is not configured'); return pool.query(text, params); }
async function addColumn(table, definition) { await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${definition}`); }

async function initDb() {
  if (!pool) return { connected: false, reason: 'DATABASE_URL missing' };
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('CREATOR','REVIEWER','PUBLISHER','ADMIN')),
      active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY, parent_sku TEXT NOT NULL UNIQUE, product_name TEXT NOT NULL,
      gender TEXT, category TEXT, brand TEXT NOT NULL DEFAULT 'Now Shoes', description TEXT,
      bullet_points JSONB NOT NULL DEFAULT '[]'::jsonb, search_terms TEXT, price NUMERIC(12,2),
      currency TEXT NOT NULL DEFAULT 'EGP', quantity INTEGER NOT NULL DEFAULT 0,
      weight_grams NUMERIC(12,2), length_cm NUMERIC(12,2), width_cm NUMERIC(12,2), height_cm NUMERIC(12,2),
      country_of_origin TEXT, fulfillment TEXT NOT NULL DEFAULT 'FBA', status TEXT NOT NULL DEFAULT 'DRAFT',
      validation_status TEXT NOT NULL DEFAULT 'NOT_RUN', validation_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
      source TEXT NOT NULL DEFAULT 'COMMAND_CENTER', raw_command TEXT, created_by TEXT NOT NULL DEFAULT 'Project Admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS variants (
      id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku TEXT NOT NULL UNIQUE, color TEXT NOT NULL, size TEXT NOT NULL, price NUMERIC(12,2),
      quantity INTEGER NOT NULL DEFAULT 0, title TEXT, image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'DRAFT', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      action TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', requested_by TEXT NOT NULL DEFAULT 'Creator',
      reviewed_by TEXT, before_value JSONB NOT NULL DEFAULT '{}'::jsonb, proposed_value JSONB NOT NULL DEFAULT '{}'::jsonb,
      risk_level TEXT NOT NULL DEFAULT 'MEDIUM', notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL,
      entity_id TEXT, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id BIGSERIAL PRIMARY KEY, original_name TEXT NOT NULL, file_type TEXT NOT NULL, mime_type TEXT,
      size_bytes BIGINT NOT NULL DEFAULT 0, sha256 TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PROCESSED',
      sheet_name TEXT, row_count INTEGER NOT NULL DEFAULT 0, accepted_rows INTEGER NOT NULL DEFAULT 0,
      rejected_rows INTEGER NOT NULL DEFAULT 0, headers JSONB NOT NULL DEFAULT '[]'::jsonb,
      issues JSONB NOT NULL DEFAULT '[]'::jsonb, sample_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      uploaded_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY, user_name TEXT, type TEXT NOT NULL DEFAULT 'INFO', title TEXT NOT NULL,
      message TEXT NOT NULL, read_at TIMESTAMPTZ, entity_type TEXT, entity_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS integration_events (
      id BIGSERIAL PRIMARY KEY, channel TEXT NOT NULL, direction TEXT NOT NULL DEFAULT 'INBOUND',
      status TEXT NOT NULL, external_id TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  for (const [table, definition] of [
    ['users', 'email TEXT UNIQUE'], ['users', 'active BOOLEAN NOT NULL DEFAULT TRUE'],
    ['products', 'category TEXT'], ['products', "brand TEXT NOT NULL DEFAULT 'Now Shoes'"], ['products', 'description TEXT'],
    ['products', "bullet_points JSONB NOT NULL DEFAULT '[]'::jsonb"], ['products', 'search_terms TEXT'], ['products', 'quantity INTEGER NOT NULL DEFAULT 0'],
    ['products', 'weight_grams NUMERIC(12,2)'], ['products', 'length_cm NUMERIC(12,2)'], ['products', 'width_cm NUMERIC(12,2)'], ['products', 'height_cm NUMERIC(12,2)'],
    ['products', "validation_issues JSONB NOT NULL DEFAULT '[]'::jsonb"],
    ['variants', "image_urls JSONB NOT NULL DEFAULT '[]'::jsonb"], ['variants', 'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()'],
    ['approvals', "before_value JSONB NOT NULL DEFAULT '{}'::jsonb"], ['approvals', "proposed_value JSONB NOT NULL DEFAULT '{}'::jsonb"], ['approvals', "risk_level TEXT NOT NULL DEFAULT 'MEDIUM'"],
    ['uploaded_files', 'header_row INTEGER'], ['uploaded_files', 'data_start_row INTEGER'], ['uploaded_files', 'parent_rows INTEGER NOT NULL DEFAULT 0'], ['uploaded_files', 'child_rows INTEGER NOT NULL DEFAULT 0'], ['uploaded_files', 'warning_rows INTEGER NOT NULL DEFAULT 0'], ['uploaded_files', "analysis_version TEXT NOT NULL DEFAULT '1.2.0'"]
  ]) await addColumn(table, definition);
  const count = await query('SELECT COUNT(*)::int AS count FROM users');
  if (count.rows[0].count === 0) {
    await query(`INSERT INTO users(name,email,role) VALUES
      ('Project Admin','admin@aec.local','ADMIN'),('Listing Creator','creator@aec.local','CREATOR'),
      ('Quality Reviewer','reviewer@aec.local','REVIEWER'),('Amazon Publisher','publisher@aec.local','PUBLISHER')`);
  } else await query("UPDATE users SET email=LOWER(REPLACE(name,' ','_')) || '@aec.local' WHERE email IS NULL");
  return { connected: true };
}
module.exports = { query, initDb, pool };
