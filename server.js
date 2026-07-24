'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { query, initDb } = require('./db');
const { parseCommand } = require('./parser');

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, '..', 'public');
const simulationMode = String(process.env.SIMULATION_MODE || 'true').toLowerCase() !== 'false';
const emergencyLock = String(process.env.EMERGENCY_LOCK || 'true').toLowerCase() !== 'false';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir, { extensions: ['html'] }));

function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
async function audit(actor, action, entityType, entityId, details = {}) {
  await query('INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)', [actor, action, entityType, String(entityId || ''), JSON.stringify(details)]);
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  const db = await query('SELECT NOW() AS now');
  res.json({ ok: true, version: '1.0.0', database: true, databaseTime: db.rows[0].now, simulationMode, emergencyLock });
}));

app.get('/api/dashboard', asyncRoute(async (_req, res) => {
  const [p, v, a, l] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM products'), query('SELECT COUNT(*)::int AS count FROM variants'),
    query("SELECT COUNT(*)::int AS count FROM approvals WHERE status='PENDING'"), query('SELECT COUNT(*)::int AS count FROM audit_logs')
  ]);
  res.json({ products: p.rows[0].count, variants: v.rows[0].count, pendingApprovals: a.rows[0].count, auditEvents: l.rows[0].count, simulationMode, emergencyLock });
}));

app.get('/api/products', asyncRoute(async (_req, res) => {
  const result = await query(`SELECT p.*, COUNT(v.id)::int AS variant_count FROM products p LEFT JOIN variants v ON v.product_id=p.id GROUP BY p.id ORDER BY p.created_at DESC`);
  res.json(result.rows);
}));
app.get('/api/products/:id', asyncRoute(async (req, res) => {
  const p = await query('SELECT * FROM products WHERE id=$1', [req.params.id]);
  if (!p.rowCount) return res.status(404).json({ error: 'Product not found' });
  const variants = await query('SELECT * FROM variants WHERE product_id=$1 ORDER BY color,size', [req.params.id]);
  res.json({ ...p.rows[0], variants: variants.rows });
}));

app.post('/api/commands/preview', (req, res) => {
  const command = String(req.body.command || '').trim();
  if (!command) return res.status(400).json({ error: 'Command is required' });
  res.json(parseCommand(command));
});
app.post('/api/commands/create', asyncRoute(async (req, res) => {
  const command = String(req.body.command || '').trim();
  const parsed = parseCommand(command);
  if (parsed.errors.length) return res.status(422).json(parsed);
  const client = await require('./db').pool.connect();
  try {
    await client.query('BEGIN');
    const product = await client.query(`INSERT INTO products(parent_sku,product_name,gender,price,country_of_origin,fulfillment,raw_command) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [parsed.parentSku, parsed.productName, parsed.gender, parsed.price, parsed.countryOfOrigin, parsed.fulfillment, command]);
    for (const v of parsed.variants) await client.query(`INSERT INTO variants(product_id,sku,color,size,price,quantity,title) VALUES($1,$2,$3,$4,$5,$6,$7)`, [product.rows[0].id, v.sku, v.color, v.size, v.price, v.quantity, v.title]);
    await client.query(`INSERT INTO approvals(product_id,action,status,requested_by,notes) VALUES($1,'CREATE_LISTING','PENDING','Listing Creator','Generated from Command Center')`, [product.rows[0].id]);
    await client.query(`INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('Listing Creator','PRODUCT_DRAFT_CREATED','PRODUCT',$1,$2)`, [String(product.rows[0].id), JSON.stringify({ parentSku: parsed.parentSku, variants: parsed.variants.length })]);
    await client.query('COMMIT');
    res.status(201).json({ product: product.rows[0], parsed });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

app.post('/api/products/:id/validate', asyncRoute(async (req, res) => {
  const product = await query('SELECT * FROM products WHERE id=$1', [req.params.id]);
  if (!product.rowCount) return res.status(404).json({ error: 'Product not found' });
  const variants = await query('SELECT * FROM variants WHERE product_id=$1', [req.params.id]);
  const issues = [];
  if (!variants.rowCount) issues.push({ severity: 'ERROR', message: 'No variants found' });
  for (const v of variants.rows) {
    if (!v.title || v.title.length < 30) issues.push({ severity: 'WARNING', sku: v.sku, message: 'Title is too short' });
    if (!v.price || Number(v.price) <= 0) issues.push({ severity: 'ERROR', sku: v.sku, message: 'Invalid price' });
  }
  const status = issues.some(i => i.severity === 'ERROR') ? 'FAILED' : 'PASSED';
  await query('UPDATE products SET validation_status=$1, updated_at=NOW() WHERE id=$2', [status, req.params.id]);
  await audit('Quality Reviewer', 'PRODUCT_VALIDATED', 'PRODUCT', req.params.id, { status, issueCount: issues.length });
  res.json({ status, issues, amazonPreview: 'NOT_CONNECTED' });
}));

app.get('/api/approvals', asyncRoute(async (_req, res) => {
  const result = await query(`SELECT a.*,p.parent_sku,p.product_name,p.validation_status FROM approvals a JOIN products p ON p.id=a.product_id ORDER BY a.created_at DESC`);
  res.json(result.rows);
}));
app.post('/api/approvals/:id/decision', asyncRoute(async (req, res) => {
  const decision = String(req.body.decision || '').toUpperCase();
  if (!['APPROVED','REJECTED'].includes(decision)) return res.status(400).json({ error: 'decision must be APPROVED or REJECTED' });
  const approval = await query('SELECT * FROM approvals WHERE id=$1', [req.params.id]);
  if (!approval.rowCount) return res.status(404).json({ error: 'Approval not found' });
  await query('UPDATE approvals SET status=$1, reviewed_by=$2, notes=COALESCE($3,notes), reviewed_at=NOW() WHERE id=$4', [decision, 'Quality Reviewer', req.body.notes || null, req.params.id]);
  await query('UPDATE products SET status=$1, updated_at=NOW() WHERE id=$2', [decision === 'APPROVED' ? 'APPROVED' : 'REJECTED', approval.rows[0].product_id]);
  await audit('Quality Reviewer', `APPROVAL_${decision}`, 'APPROVAL', req.params.id, { productId: approval.rows[0].product_id });
  res.json({ ok: true, status: decision });
}));

app.post('/api/products/:id/publish', asyncRoute(async (_req, res) => {
  if (emergencyLock) return res.status(423).json({ error: 'Emergency Lock is active' });
  if (simulationMode) return res.status(423).json({ error: 'Simulation Mode is active' });
  return res.status(501).json({ error: 'Amazon live publishing is not enabled in this release' });
}));

app.get('/api/audit', asyncRoute(async (_req, res) => {
  const result = await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 250');
  res.json(result.rows);
}));

app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.use((error, _req, res, _next) => {
  console.error(error);
  const message = error.code === '23505' ? 'A product or SKU with the same value already exists' : 'Internal server error';
  res.status(error.code === '23505' ? 409 : 500).json({ error: message });
});

initDb().then((status) => {
  console.log('Database status:', status);
  app.listen(port, '0.0.0.0', () => console.log(`AEC running on port ${port}`));
}).catch((error) => { console.error('Database initialization failed:', error); process.exit(1); });
