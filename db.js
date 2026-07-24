'use strict';
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = connectionString ? new Pool({ connectionString, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }) : null;

async function query(text, params = []) {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  return pool.query(text, params);
}

async function initDb() {
  if (!pool) return { connected: false, reason: 'DATABASE_URL missing' };
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('CREATOR','REVIEWER','PUBLISHER','ADMIN')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      parent_sku TEXT NOT NULL UNIQUE,
      product_name TEXT NOT NULL,
      gender TEXT,
      price NUMERIC(12,2),
      currency TEXT NOT NULL DEFAULT 'EGP',
      country_of_origin TEXT,
      fulfillment TEXT NOT NULL DEFAULT 'FBA',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      validation_status TEXT NOT NULL DEFAULT 'NOT_RUN',
      source TEXT NOT NULL DEFAULT 'COMMAND_CENTER',
      raw_command TEXT,
      created_by TEXT NOT NULL DEFAULT 'Project Admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS variants (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      size TEXT NOT NULL,
      price NUMERIC(12,2),
      quantity INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_by TEXT NOT NULL DEFAULT 'Creator',
      reviewed_by TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const count = await query('SELECT COUNT(*)::int AS count FROM users');
  if (count.rows[0].count === 0) {
    await query(`INSERT INTO users(name, role) VALUES ('Project Admin','ADMIN'),('Listing Creator','CREATOR'),('Quality Reviewer','REVIEWER'),('Amazon Publisher','PUBLISHER')`);
  }
  return { connected: true };
}

module.exports = { query, initDb, pool };
