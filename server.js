'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const XLSX = require('xlsx');
const crypto = require('crypto');
const { query, initDb, pool } = require('./db');
const { parseCommand } = require('./parser');
const { analyzeWorkbook } = require('./amazonTemplateParser');

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = __dirname;
const simulationMode = String(process.env.SIMULATION_MODE || 'true').toLowerCase() !== 'false';
const emergencyLock = String(process.env.EMERGENCY_LOCK || 'true').toLowerCase() !== 'false';
const VERSION = '1.3.0';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.static(publicDir, { extensions: ['html'] }));

function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function actor(req) { return String(req.headers['x-aec-user'] || 'Project Admin').slice(0, 120); }
function role(req) { return String(req.headers['x-aec-role'] || 'ADMIN').toUpperCase(); }
function requireRole(...roles) { return (req, res, next) => roles.includes(role(req)) ? next() : res.status(403).json({ error: `Role ${role(req)} cannot perform this action` }); }
async function audit(who, action, entityType, entityId, details = {}) {
  await query('INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)', [who, action, entityType, String(entityId || ''), JSON.stringify(details)]);
}
function cleanProductBody(body) {
  const numberOrNull = (v) => v === '' || v == null ? null : Number(v);
  return {
    product_name: String(body.product_name || '').trim(), gender: body.gender ? String(body.gender).trim() : null,
    category: body.category ? String(body.category).trim() : null, brand: String(body.brand || 'Now Shoes').trim(),
    description: body.description ? String(body.description).trim() : null,
    bullet_points: Array.isArray(body.bullet_points) ? body.bullet_points.map(String).map(s=>s.trim()).filter(Boolean).slice(0,8) : [],
    search_terms: body.search_terms ? String(body.search_terms).trim() : null,
    price: numberOrNull(body.price), quantity: Number(body.quantity || 0), weight_grams: numberOrNull(body.weight_grams),
    length_cm: numberOrNull(body.length_cm), width_cm: numberOrNull(body.width_cm), height_cm: numberOrNull(body.height_cm),
    country_of_origin: body.country_of_origin ? String(body.country_of_origin).trim() : null,
    fulfillment: ['FBA','MFN'].includes(String(body.fulfillment).toUpperCase()) ? String(body.fulfillment).toUpperCase() : 'FBA'
  };
}


const expandedRoles = ['CREATOR','LISTING_SPECIALIST','REVIEWER','OPERATIONS_MANAGER','PUBLISHER','ANALYST','VIEWER','ADMIN'];
const roleCapabilities = {
  VIEWER:['READ_DASHBOARD','READ_PRODUCTS','READ_FILES'],
  ANALYST:['READ_DASHBOARD','READ_PRODUCTS','READ_FILES','READ_REPORTS','READ_AUDIT'],
  CREATOR:['READ_DASHBOARD','READ_PRODUCTS','READ_FILES','CREATE_DRAFT','EDIT_DRAFT','CREATE_APPROVAL'],
  LISTING_SPECIALIST:['READ_DASHBOARD','READ_PRODUCTS','READ_FILES','CREATE_DRAFT','EDIT_DRAFT','CREATE_APPROVAL','MANAGE_IMAGES','ANALYZE_FILES'],
  REVIEWER:['READ_DASHBOARD','READ_PRODUCTS','READ_FILES','REVIEW_APPROVAL','VALIDATE_LISTING','READ_AUDIT'],
  OPERATIONS_MANAGER:['READ_DASHBOARD','READ_PRODUCTS','READ_FILES','CREATE_DRAFT','EDIT_DRAFT','CREATE_APPROVAL','REVIEW_APPROVAL','VALIDATE_LISTING','MANAGE_IMAGES','ANALYZE_FILES','READ_AUDIT'],
  PUBLISHER:['READ_DASHBOARD','READ_PRODUCTS','READ_FILES','AUTHORIZE_PUBLISH','READ_AUDIT'],
  ADMIN:['*']
};
function can(req, capability){const caps=roleCapabilities[role(req)]||[];return caps.includes('*')||caps.includes(capability)}
function requireCapability(capability){return (req,res,next)=>can(req,capability)?next():res.status(403).json({error:`Role ${role(req)} lacks ${capability}`})}
function compactContext(rows, fields){return rows.map(r=>Object.fromEntries(fields.map(f=>[f,r[f]]))).slice(0,25)}
async function callOpenAI(message, context){
  if(!process.env.OPENAI_API_KEY) return null;
  const model=process.env.OPENAI_MODEL||'gpt-5-mini';
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'system',content:[{type:'input_text',text:'You are the AEC Operations Agent for Amazon Egypt. Be concise, factual and operational. You may recommend actions, but never claim a publish occurred. Live publishing is disabled. Any change must become a draft or approval.'}]},{role:'user',content:[{type:'input_text',text:`User request: ${message}\nSystem context: ${JSON.stringify(context)}`}]}],max_output_tokens:900})});
  if(!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
  const data=await response.json();
  return data.output_text || (data.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join(' ').trim();
}
async function localAgent(message, req){
  const text=String(message||'').trim(); const lower=text.toLowerCase();
  if(!text) return {reply:'Write an instruction for the AEC Agent.',actions:[]};
  const actions=[];
  if(/(create|انشئ|اعمل|أنشئ).*(sku|منتج)/i.test(text)){
    const parsed=parseCommand(text);
    if(parsed.errors.length) return {reply:`I could not create the draft: ${parsed.errors.join(', ')}`,actions};
    if(!can(req,'CREATE_DRAFT')) return {reply:'Your current role can analyze this command but cannot create drafts.',preview:parsed,actions};
    const existing=await query('SELECT id FROM products WHERE parent_sku=$1',[parsed.parentSku]);
    if(existing.rowCount) return {reply:`SKU ${parsed.parentSku} already exists. I did not create a duplicate.`,preview:parsed,actions};
    const client=await pool.connect();
    try{await client.query('BEGIN');const product=await client.query(`INSERT INTO products(parent_sku,product_name,gender,price,country_of_origin,fulfillment,raw_command,created_by,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'AI_AGENT') RETURNING *`,[parsed.parentSku,parsed.productName,parsed.gender,parsed.price,parsed.countryOfOrigin,parsed.fulfillment,text,actor(req)]);for(const v of parsed.variants)await client.query(`INSERT INTO variants(product_id,sku,color,size,price,quantity,title) VALUES($1,$2,$3,$4,$5,$6,$7)`,[product.rows[0].id,v.sku,v.color,v.size,v.price,v.quantity,v.title]);await client.query(`INSERT INTO approvals(product_id,action,status,requested_by,before_value,proposed_value,risk_level,notes) VALUES($1,'CREATE_LISTING','PENDING',$2,'{}',$3,'HIGH','Created by AEC AI Agent — draft only')`,[product.rows[0].id,actor(req),JSON.stringify(parsed)]);await client.query('COMMIT');actions.push({type:'DRAFT_CREATED',productId:product.rows[0].id,parentSku:parsed.parentSku,variants:parsed.variants.length});await audit(actor(req),'AI_DRAFT_CREATED','PRODUCT',product.rows[0].id,{parentSku:parsed.parentSku,variants:parsed.variants.length});return {reply:`Draft ${parsed.parentSku} was created with ${parsed.variants.length} Child SKUs. It is waiting for validation and approval.`,actions,preview:parsed};}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }
  if(/(last|latest|اخر|آخر).*(file|ملف)/i.test(text)){const f=await query('SELECT id,original_name,row_count,valid_rows,warning_rows,rejected_rows,file_health,created_at FROM uploaded_files ORDER BY created_at DESC LIMIT 1');if(!f.rowCount)return {reply:'No uploaded files were found.',actions};const x=f.rows[0];return {reply:`Latest file: ${x.original_name}. Health ${x.file_health}%. Valid ${x.valid_rows}, warnings ${x.warning_rows}, blocked ${x.rejected_rows}.`,actions,data:x}}
  if(/(warning|تحذير|blocked|مرفوض|error|خطأ)/i.test(text)){const f=await query('SELECT id,original_name,warning_rows,rejected_rows,file_health,warning_summary FROM uploaded_files ORDER BY created_at DESC LIMIT 10');return {reply:`I found ${f.rowCount} recent analyzed files. Open File Center to review row-level issues and create approvals for fixable warnings.`,actions,data:f.rows}}
  if(/(product|منتج|sku)/i.test(text)){const ps=await query('SELECT parent_sku,product_name,status,validation_status,price,updated_at FROM products ORDER BY updated_at DESC LIMIT 10');return {reply:`There are ${ps.rowCount} recent products in this view. I can create a draft, summarize validation, or locate a SKU.`,actions,data:ps.rows}}
  return {reply:'I can create product drafts, summarize uploaded Amazon files, identify warnings, review products, and prepare approval requests. Live Amazon publishing remains disabled.',actions};
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  const db = await query('SELECT NOW() AS now');
  res.json({ ok: true, version: VERSION, database: true, databaseTime: db.rows[0].now, simulationMode, emergencyLock });
}));
app.get('/api/users', asyncRoute(async (_req, res) => res.json((await query('SELECT id,name,email,role,active FROM users WHERE active=TRUE ORDER BY id')).rows)));
app.get('/api/dashboard', asyncRoute(async (_req, res) => {
  const [p,v,a,l,approved,failed,files,unread,recent] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM products'), query('SELECT COUNT(*)::int AS count FROM variants'),
    query("SELECT COUNT(*)::int AS count FROM approvals WHERE status='PENDING'"), query('SELECT COUNT(*)::int AS count FROM audit_logs'),
    query("SELECT COUNT(*)::int AS count FROM products WHERE status='APPROVED'"), query("SELECT COUNT(*)::int AS count FROM products WHERE validation_status='FAILED'"),
    query('SELECT COUNT(*)::int AS count FROM uploaded_files'), query('SELECT COUNT(*)::int AS count FROM notifications WHERE read_at IS NULL'),
    query('SELECT actor,action,entity_type,entity_id,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 6')
  ]);
  res.json({ products:p.rows[0].count, variants:v.rows[0].count, pendingApprovals:a.rows[0].count, auditEvents:l.rows[0].count,
    approvedProducts:approved.rows[0].count, failedValidation:failed.rows[0].count, uploadedFiles:files.rows[0].count, unreadNotifications:unread.rows[0].count, recent:recent.rows, simulationMode, emergencyLock });
}));

app.get('/api/products', asyncRoute(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const values = []; let where = '';
  if (search) { values.push(`%${search}%`); where = 'WHERE p.parent_sku ILIKE $1 OR p.product_name ILIKE $1'; }
  const result = await query(`SELECT p.*, COUNT(v.id)::int AS variant_count FROM products p LEFT JOIN variants v ON v.product_id=p.id ${where} GROUP BY p.id ORDER BY p.updated_at DESC`, values);
  res.json(result.rows);
}));
app.get('/api/products/:id', asyncRoute(async (req, res) => {
  const p = await query('SELECT * FROM products WHERE id=$1', [req.params.id]);
  if (!p.rowCount) return res.status(404).json({ error: 'Product not found' });
  const [variants, approvals] = await Promise.all([
    query('SELECT * FROM variants WHERE product_id=$1 ORDER BY color,size', [req.params.id]),
    query('SELECT * FROM approvals WHERE product_id=$1 ORDER BY created_at DESC', [req.params.id])
  ]);
  res.json({ ...p.rows[0], variants: variants.rows, approvals: approvals.rows });
}));
app.put('/api/products/:id', requireRole('CREATOR','ADMIN'), asyncRoute(async (req, res) => {
  const existing = await query('SELECT * FROM products WHERE id=$1', [req.params.id]);
  if (!existing.rowCount) return res.status(404).json({ error: 'Product not found' });
  const b = cleanProductBody(req.body);
  if (!b.product_name) return res.status(400).json({ error: 'Product name is required' });
  const updated = await query(`UPDATE products SET product_name=$1,gender=$2,category=$3,brand=$4,description=$5,bullet_points=$6,search_terms=$7,price=$8,quantity=$9,weight_grams=$10,length_cm=$11,width_cm=$12,height_cm=$13,country_of_origin=$14,fulfillment=$15,validation_status='NOT_RUN',updated_at=NOW() WHERE id=$16 RETURNING *`,
    [b.product_name,b.gender,b.category,b.brand,b.description,JSON.stringify(b.bullet_points),b.search_terms,b.price,b.quantity,b.weight_grams,b.length_cm,b.width_cm,b.height_cm,b.country_of_origin,b.fulfillment,req.params.id]);
  if (b.price != null) await query('UPDATE variants SET price=$1,updated_at=NOW() WHERE product_id=$2',[b.price,req.params.id]);
  await query(`INSERT INTO approvals(product_id,action,status,requested_by,before_value,proposed_value,risk_level,notes) VALUES($1,'UPDATE_LISTING','PENDING',$2,$3,$4,'MEDIUM','Product editor update')`, [req.params.id,actor(req),JSON.stringify(existing.rows[0]),JSON.stringify(updated.rows[0])]);
  await audit(actor(req),'PRODUCT_UPDATED','PRODUCT',req.params.id,{changedFields:Object.keys(req.body)});
  res.json(updated.rows[0]);
}));
app.put('/api/variants/:id', requireRole('CREATOR','ADMIN'), asyncRoute(async (req,res)=>{
  const v = await query('SELECT * FROM variants WHERE id=$1',[req.params.id]);
  if (!v.rowCount) return res.status(404).json({error:'Variant not found'});
  const body=req.body; const images=Array.isArray(body.image_urls)?body.image_urls.map(String).map(s=>s.trim()).filter(Boolean).slice(0,9):v.rows[0].image_urls;
  const updated=await query(`UPDATE variants SET title=COALESCE($1,title),price=COALESCE($2,price),quantity=COALESCE($3,quantity),image_urls=$4,updated_at=NOW() WHERE id=$5 RETURNING *`,[body.title?String(body.title).trim():null,body.price==null?null:Number(body.price),body.quantity==null?null:Number(body.quantity),JSON.stringify(images),req.params.id]);
  await audit(actor(req),'VARIANT_UPDATED','VARIANT',req.params.id,{sku:v.rows[0].sku}); res.json(updated.rows[0]);
}));

app.post('/api/commands/preview', (req, res) => { const command=String(req.body.command||'').trim(); if(!command)return res.status(400).json({error:'Command is required'}); res.json(parseCommand(command)); });
app.post('/api/commands/create', requireRole('CREATOR','ADMIN'), asyncRoute(async (req, res) => {
  const command=String(req.body.command||'').trim(); const parsed=parseCommand(command); if(parsed.errors.length)return res.status(422).json(parsed);
  const client=await pool.connect(); try { await client.query('BEGIN');
    const product=await client.query(`INSERT INTO products(parent_sku,product_name,gender,price,country_of_origin,fulfillment,raw_command,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[parsed.parentSku,parsed.productName,parsed.gender,parsed.price,parsed.countryOfOrigin,parsed.fulfillment,command,actor(req)]);
    for(const v of parsed.variants) await client.query(`INSERT INTO variants(product_id,sku,color,size,price,quantity,title) VALUES($1,$2,$3,$4,$5,$6,$7)`,[product.rows[0].id,v.sku,v.color,v.size,v.price,v.quantity,v.title]);
    await client.query(`INSERT INTO approvals(product_id,action,status,requested_by,before_value,proposed_value,risk_level,notes) VALUES($1,'CREATE_LISTING','PENDING',$2,'{}',$3,'HIGH','Generated from Command Center')`,[product.rows[0].id,actor(req),JSON.stringify({parentSku:parsed.parentSku,variants:parsed.variants.length})]);
    await client.query(`INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES($1,'PRODUCT_DRAFT_CREATED','PRODUCT',$2,$3)`,[actor(req),String(product.rows[0].id),JSON.stringify({parentSku:parsed.parentSku,variants:parsed.variants.length})]);
    await client.query(`INSERT INTO notifications(type,title,message,entity_type,entity_id) VALUES('INFO','New product draft',$1,'PRODUCT',$2)`,[`Draft ${parsed.parentSku} created with ${parsed.variants.length} variants`,String(product.rows[0].id)]);
    await client.query('COMMIT'); res.status(201).json({product:product.rows[0],parsed});
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}));
app.post('/api/products/:id/validate', requireRole('REVIEWER','ADMIN'), asyncRoute(async (req,res)=>{
  const product=await query('SELECT * FROM products WHERE id=$1',[req.params.id]); if(!product.rowCount)return res.status(404).json({error:'Product not found'});
  const variants=await query('SELECT * FROM variants WHERE product_id=$1',[req.params.id]); const issues=[];
  if(!variants.rowCount)issues.push({severity:'ERROR',field:'variants',message:'No variants found'});
  if(!product.rows[0].country_of_origin)issues.push({severity:'ERROR',field:'country_of_origin',message:'Country of origin is required'});
  if(!product.rows[0].category)issues.push({severity:'WARNING',field:'category',message:'Category is not selected'});
  if(!product.rows[0].description)issues.push({severity:'WARNING',field:'description',message:'Description is empty'});
  for(const v of variants.rows){ if(!v.title||v.title.length<30)issues.push({severity:'WARNING',sku:v.sku,field:'title',message:'Title is too short'}); if(!v.price||Number(v.price)<=0)issues.push({severity:'ERROR',sku:v.sku,field:'price',message:'Invalid price'}); if(!Array.isArray(v.image_urls)||v.image_urls.length===0)issues.push({severity:'WARNING',sku:v.sku,field:'images',message:'No images assigned'}); }
  const status=issues.some(i=>i.severity==='ERROR')?'FAILED':'PASSED'; await query('UPDATE products SET validation_status=$1,validation_issues=$2,updated_at=NOW() WHERE id=$3',[status,JSON.stringify(issues),req.params.id]);
  await audit(actor(req),'PRODUCT_VALIDATED','PRODUCT',req.params.id,{status,issueCount:issues.length}); res.json({status,issues,amazonPreview:'NOT_CONNECTED'});
}));

app.get('/api/approvals', asyncRoute(async (_req,res)=>res.json((await query(`
  SELECT 'PRODUCT' AS approval_kind,a.id,a.action,a.status,a.requested_by,a.reviewed_by,a.before_value,a.proposed_value,a.risk_level,a.notes,a.created_at,a.reviewed_at,
         p.parent_sku AS entity_ref,p.product_name AS entity_name,p.validation_status,p.status AS product_status
  FROM approvals a JOIN products p ON p.id=a.product_id
  UNION ALL
  SELECT 'FILE' AS approval_kind,fa.id,fa.action,fa.status,fa.requested_by,fa.reviewed_by,fa.before_value,fa.proposed_value,fa.risk_level,fa.notes,fa.created_at,fa.reviewed_at,
         uf.original_name AS entity_ref,CONCAT('Row ',fa.excel_row,' · ',COALESCE(fa.sku,'Parent')) AS entity_name,'NOT_APPLICABLE' AS validation_status,uf.status AS product_status
  FROM file_approvals fa JOIN uploaded_files uf ON uf.id=fa.file_id
  ORDER BY CASE WHEN status='PENDING' THEN 0 ELSE 1 END,created_at DESC
`)).rows)));
app.post('/api/approvals/:id/decision', requireRole('REVIEWER','ADMIN'), asyncRoute(async (req,res)=>{
  const decision=String(req.body.decision||'').toUpperCase(); if(!['APPROVED','REJECTED'].includes(decision))return res.status(400).json({error:'decision must be APPROVED or REJECTED'});
  const approval=await query('SELECT * FROM approvals WHERE id=$1',[req.params.id]); if(!approval.rowCount)return res.status(404).json({error:'Approval not found'}); if(approval.rows[0].status!=='PENDING')return res.status(409).json({error:'Approval already reviewed'});
  await query('UPDATE approvals SET status=$1,reviewed_by=$2,notes=COALESCE($3,notes),reviewed_at=NOW() WHERE id=$4',[decision,actor(req),req.body.notes||null,req.params.id]);
  await query('UPDATE products SET status=$1,updated_at=NOW() WHERE id=$2',[decision==='APPROVED'?'APPROVED':'REJECTED',approval.rows[0].product_id]);
  await query(`INSERT INTO notifications(type,title,message,entity_type,entity_id) VALUES($1,$2,$3,'APPROVAL',$4)`,[decision==='APPROVED'?'SUCCESS':'WARNING',`Approval ${decision.toLowerCase()}`,`Approval #${req.params.id} was ${decision.toLowerCase()} by ${actor(req)}`,String(req.params.id)]);
  await audit(actor(req),`APPROVAL_${decision}`,'APPROVAL',req.params.id,{productId:approval.rows[0].product_id}); res.json({ok:true,status:decision});
}));
app.post('/api/products/:id/publish', requireRole('PUBLISHER','ADMIN'), asyncRoute(async (_req,res)=>{ if(emergencyLock)return res.status(423).json({error:'Emergency Lock is active'}); if(simulationMode)return res.status(423).json({error:'Simulation Mode is active'}); return res.status(501).json({error:'Amazon live publishing is not enabled in this release'}); }));

app.post('/api/files/upload', requireRole('CREATOR','ADMIN'), upload.single('file'), asyncRoute(async (req,res)=>{
  if (!req.file) return res.status(400).json({error:'File is required'});
  const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
  if (!['xlsx','xlsm','xls','csv'].includes(ext)) return res.status(415).json({error:'Supported formats: XLSX, XLSM, XLS, CSV'});
  const fileType = String(req.body.file_type || 'LISTING').toUpperCase();
  if (!['LISTING','PROCESSING_SUMMARY','TRANSACTIONS'].includes(fileType)) return res.status(400).json({error:'Invalid file type'});
  const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const duplicate = await query('SELECT id,original_name,created_at FROM uploaded_files WHERE sha256=$1',[hash]);
  if (duplicate.rowCount) return res.status(409).json({error:'This exact file was already uploaded',duplicate:duplicate.rows[0]});
  const workbook = XLSX.read(req.file.buffer,{type:'buffer',cellDates:true,bookVBA:ext==='xlsm'});
  const analysis = analyzeWorkbook(workbook, XLSX, fileType);
  const inserted = await query(`INSERT INTO uploaded_files(original_name,file_type,mime_type,size_bytes,sha256,sheet_name,row_count,accepted_rows,rejected_rows,headers,issues,sample_rows,uploaded_by,header_row,data_start_row,parent_rows,child_rows,warning_rows,valid_rows,ignored_rows,file_health,warning_summary,analysis_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,[
    req.file.originalname,fileType,req.file.mimetype,req.file.size,hash,analysis.sheetName,analysis.totalRows,analysis.validRows ?? analysis.accepted,analysis.blockedRows,JSON.stringify(analysis.headers),JSON.stringify(analysis.issues),JSON.stringify(analysis.sampleRows),actor(req),analysis.headerRow,analysis.dataStartRow,analysis.parentRows,analysis.childRows,analysis.warningRows,analysis.validRows ?? analysis.accepted,analysis.ignoredRows || 0,analysis.fileHealth ?? 100,JSON.stringify(analysis.topWarnings || []),'1.3.0'
  ]);
  await query(`INSERT INTO notifications(type,title,message,entity_type,entity_id) VALUES($1,'File processed',$2,'FILE',$3)`,[analysis.blockedRows?'WARNING':'SUCCESS',`${req.file.originalname}: ${analysis.validRows ?? analysis.accepted} valid, ${analysis.warningRows} accepted with warnings, ${analysis.blockedRows} blocked`,String(inserted.rows[0].id)]);
  await audit(actor(req),'FILE_UPLOADED','FILE',inserted.rows[0].id,{name:req.file.originalname,fileType,sheet:analysis.sheetName,headerRow:analysis.headerRow,rows:analysis.totalRows,warnings:analysis.warningRows,blocked:analysis.blockedRows,analysisVersion:'1.3.0',health:analysis.fileHealth});
  res.status(201).json(inserted.rows[0]);
}));
app.get('/api/files', asyncRoute(async (_req,res)=>res.json((await query(`
  SELECT uf.id,uf.original_name,uf.file_type,uf.size_bytes,uf.status,uf.sheet_name,uf.row_count,uf.accepted_rows,uf.rejected_rows,
         GREATEST(uf.warning_rows-COALESCE(fa.approved_fixes,0),0)::int AS warning_rows,
         (uf.valid_rows+COALESCE(fa.approved_fixes,0))::int AS valid_rows,uf.ignored_rows,
         CASE WHEN uf.row_count>0 THEN ROUND((((uf.valid_rows+COALESCE(fa.approved_fixes,0)) + GREATEST(uf.warning_rows-COALESCE(fa.approved_fixes,0),0)*0.65)/uf.row_count)*100)::int ELSE 100 END AS file_health,
         uf.warning_summary,uf.parent_rows,uf.child_rows,uf.header_row,uf.data_start_row,uf.analysis_version,uf.uploaded_by,uf.created_at,COALESCE(fa.approved_fixes,0)::int AS approved_fixes
  FROM uploaded_files uf
  LEFT JOIN (SELECT file_id,COUNT(*)::int AS approved_fixes FROM file_approvals WHERE status='APPROVED' GROUP BY file_id) fa ON fa.file_id=uf.id
  ORDER BY uf.created_at DESC
`)).rows)));
app.get('/api/files/:id', asyncRoute(async (req,res)=>{
  const r=await query('SELECT * FROM uploaded_files WHERE id=$1',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'File not found'});
  const fixes=await query('SELECT * FROM file_approvals WHERE file_id=$1 ORDER BY created_at DESC',[req.params.id]);
  const approvedKeys=new Set(fixes.rows.filter(x=>x.status==='APPROVED').map(x=>`${x.excel_row}:${x.rule_code}`));
  const file={...r.rows[0]};
  file.issues=(file.issues||[]).map(row=>({...row,issues:(row.issues||[]).filter(issue=>!approvedKeys.has(`${row.row}:${issue.code}`))})).filter(row=>(row.issues||[]).length);
  const approvedCount=fixes.rows.filter(x=>x.status==='APPROVED').length;
  file.warning_rows=Math.max(0,Number(file.warning_rows||0)-approvedCount);
  file.valid_rows=Number(file.valid_rows||0)+approvedCount;
  file.file_health=file.row_count?Math.round(((file.valid_rows+file.warning_rows*0.65)/file.row_count)*100):100;
  file.fix_approvals=fixes.rows;
  res.json(file);
}));
app.post('/api/files/:id/fixes/variation-theme', requireRole('CREATOR','ADMIN'), asyncRoute(async (req,res)=>{
  const file=await query('SELECT * FROM uploaded_files WHERE id=$1',[req.params.id]); if(!file.rowCount)return res.status(404).json({error:'File not found'});
  const excelRow=Number(req.body.excel_row); const sku=String(req.body.sku||'').trim()||null;
  const issue=(file.rows[0].issues||[]).flatMap(r=>(r.issues||[]).map(i=>({...i,row:r.row,sku:r.sku}))).find(i=>i.row===excelRow&&i.code==='MISSING_VARIATION_THEME');
  if(!issue)return res.status(404).json({error:'Fixable variation theme warning was not found on this row'});
  const suggested=String(issue.suggestedValue||'SizeColor');
  const created=await query(`INSERT INTO file_approvals(file_id,excel_row,sku,rule_code,action,status,requested_by,before_value,proposed_value,patch,risk_level,notes)
    VALUES($1,$2,$3,'PARENT_VARIATION_THEME_MISSING','PATCH_FILE','PENDING',$4,$5,$6,$7,'LOW','Auto-suggested from Child color and size attributes')
    ON CONFLICT(file_id,excel_row,rule_code) DO UPDATE SET requested_by=EXCLUDED.requested_by,proposed_value=EXCLUDED.proposed_value,patch=EXCLUDED.patch,status=CASE WHEN file_approvals.status='REJECTED' THEN 'PENDING' ELSE file_approvals.status END RETURNING *`,
    [req.params.id,excelRow,sku,actor(req),JSON.stringify({variationTheme:''}),JSON.stringify({variationTheme:suggested}),JSON.stringify({sheetName:file.rows[0].sheet_name,excelRow,field:'variationTheme',value:suggested})]);
  await audit(actor(req),'FILE_FIX_APPROVAL_CREATED','FILE',req.params.id,{approvalId:created.rows[0].id,excelRow,ruleCode:'PARENT_VARIATION_THEME_MISSING',suggested});
  res.status(201).json(created.rows[0]);
}));
app.post('/api/file-approvals/:id/decision', requireRole('REVIEWER','ADMIN'), asyncRoute(async (req,res)=>{
  const decision=String(req.body.decision||'').toUpperCase(); if(!['APPROVED','REJECTED'].includes(decision))return res.status(400).json({error:'decision must be APPROVED or REJECTED'});
  const a=await query('SELECT * FROM file_approvals WHERE id=$1',[req.params.id]); if(!a.rowCount)return res.status(404).json({error:'File approval not found'}); if(a.rows[0].status!=='PENDING')return res.status(409).json({error:'Approval already reviewed'});
  const updated=await query('UPDATE file_approvals SET status=$1,reviewed_by=$2,notes=COALESCE($3,notes),reviewed_at=NOW() WHERE id=$4 RETURNING *',[decision,actor(req),req.body.notes||null,req.params.id]);
  await query(`INSERT INTO notifications(type,title,message,entity_type,entity_id) VALUES($1,$2,$3,'FILE_APPROVAL',$4)`,[decision==='APPROVED'?'SUCCESS':'WARNING',`File correction ${decision.toLowerCase()}`,`Variation Theme correction was ${decision.toLowerCase()} by ${actor(req)}`,String(req.params.id)]);
  await audit(actor(req),`FILE_APPROVAL_${decision}`,'FILE_APPROVAL',req.params.id,{fileId:a.rows[0].file_id,patch:a.rows[0].patch});
  res.json(updated.rows[0]);
}));
app.get('/api/files/:id/patch', asyncRoute(async (req,res)=>{
  const f=await query('SELECT original_name,sheet_name FROM uploaded_files WHERE id=$1',[req.params.id]); if(!f.rowCount)return res.status(404).json({error:'File not found'});
  const fixes=await query("SELECT id,excel_row,sku,rule_code,proposed_value,patch,reviewed_by,reviewed_at FROM file_approvals WHERE file_id=$1 AND status='APPROVED' ORDER BY excel_row",[req.params.id]);
  const payload={sourceFile:f.rows[0].original_name,sheetName:f.rows[0].sheet_name,generatedAt:new Date().toISOString(),approvedFixes:fixes.rows};
  res.setHeader('Content-Disposition',`attachment; filename=\"${path.parse(f.rows[0].original_name).name}-AEC-PATCH.json\"`); res.json(payload);
}));
app.get('/api/notifications', asyncRoute(async (req,res)=>{const onlyUnread=String(req.query.unread||'')==='true';res.json((await query(`SELECT * FROM notifications ${onlyUnread?'WHERE read_at IS NULL':''} ORDER BY created_at DESC LIMIT 100`)).rows)}));
app.post('/api/notifications/:id/read', asyncRoute(async (req,res)=>{await query('UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1',[req.params.id]);res.json({ok:true});}));
app.post('/api/notifications/read-all', asyncRoute(async (_req,res)=>{await query('UPDATE notifications SET read_at=NOW() WHERE read_at IS NULL');res.json({ok:true});}));
app.get('/api/integrations/status', asyncRoute(async (_req,res)=>res.json({
  amazon:{configured:Boolean(process.env.LWA_CLIENT_ID&&process.env.LWA_CLIENT_SECRET&&process.env.LWA_REFRESH_TOKEN&&process.env.SP_API_SELLER_ID),simulationMode,emergencyLock,marketplaceId:process.env.SP_API_MARKETPLACE_ID||'ARBP9OOSHTCHU'},
  whatsapp:{configured:Boolean(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_VERIFY_TOKEN),webhookReady:Boolean(process.env.WHATSAPP_VERIFY_TOKEN)},
  n8n:{configured:Boolean(process.env.N8N_WEBHOOK_SECRET),webhookUrlConfigured:Boolean(process.env.N8N_BASE_URL)}
})));
app.post('/api/integrations/test-draft', requireRole('ADMIN'), asyncRoute(async (req,res)=>{const channel=String(req.body.channel||'N8N').toUpperCase();if(!['N8N','WHATSAPP'].includes(channel))return res.status(400).json({error:'Invalid channel'});const event=await query(`INSERT INTO integration_events(channel,status,payload) VALUES($1,'SIMULATED',$2) RETURNING *`,[channel,JSON.stringify({message:req.body.message||'Test product command',safeMode:true})]);await audit(actor(req),'INTEGRATION_TEST',channel,event.rows[0].id,{safeMode:true});res.json(event.rows[0]);}));

app.get('/api/permissions', asyncRoute(async (_req,res)=>res.json({roles:expandedRoles,capabilities:roleCapabilities,publishDisabled:true,simulationMode,emergencyLock})));
app.get('/api/ai/status', asyncRoute(async (_req,res)=>res.json({enabled:String(process.env.AI_AGENT_ENABLED||'true').toLowerCase()!=='false',providerConfigured:Boolean(process.env.OPENAI_API_KEY),model:process.env.OPENAI_MODEL||'gpt-5-mini',defaultRole:process.env.AI_AGENT_DEFAULT_ROLE||'DRAFT_AGENT',publishDisabled:true,safeActions:['READ','ANALYZE','CREATE_DRAFT','CREATE_APPROVAL']})));
app.get('/api/ai/conversations', asyncRoute(async (_req,res)=>res.json((await query('SELECT * FROM ai_conversations ORDER BY updated_at DESC LIMIT 50')).rows)));
app.get('/api/ai/conversations/:id/messages', asyncRoute(async (req,res)=>res.json((await query('SELECT * FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at',[req.params.id])).rows)));
app.post('/api/ai/chat', asyncRoute(async (req,res)=>{
  if(String(process.env.AI_AGENT_ENABLED||'true').toLowerCase()==='false') return res.status(503).json({error:'AI Agent is disabled'});
  const message=String(req.body.message||'').trim(); if(!message)return res.status(400).json({error:'message is required'});
  let conversationId=req.body.conversation_id?Number(req.body.conversation_id):null;
  if(!conversationId){const c=await query('INSERT INTO ai_conversations(title,created_by) VALUES($1,$2) RETURNING id',[message.slice(0,80),actor(req)]);conversationId=c.rows[0].id}
  await query("INSERT INTO ai_messages(conversation_id,role,content,metadata) VALUES($1,'user',$2,$3)",[conversationId,message,JSON.stringify({actor:actor(req),role:role(req)})]);
  const [products,files,pending]=await Promise.all([query('SELECT parent_sku,product_name,status,validation_status,price FROM products ORDER BY updated_at DESC LIMIT 15'),query('SELECT original_name,row_count,valid_rows,warning_rows,rejected_rows,file_health FROM uploaded_files ORDER BY created_at DESC LIMIT 10'),query("SELECT COUNT(*)::int count FROM approvals WHERE status='PENDING'")]);
  const context={products:compactContext(products.rows,['parent_sku','product_name','status','validation_status','price']),files:compactContext(files.rows,['original_name','row_count','valid_rows','warning_rows','rejected_rows','file_health']),pendingApprovals:pending.rows[0].count,simulationMode,emergencyLock,userRole:role(req)};
  const local=await localAgent(message,req); let providerReply=null;
  try{if(process.env.OPENAI_API_KEY && !local.actions.length) providerReply=await callOpenAI(message,{...context,localResult:local})}catch(e){console.error('AI provider error',e.message)}
  const reply=providerReply||local.reply;
  await query("INSERT INTO ai_messages(conversation_id,role,content,metadata) VALUES($1,'assistant',$2,$3)",[conversationId,reply,JSON.stringify({actions:local.actions||[],provider:providerReply?'openai':'local-safe-agent',publishDisabled:true})]);
  await query('UPDATE ai_conversations SET updated_at=NOW() WHERE id=$1',[conversationId]);
  await audit(actor(req),'AI_AGENT_MESSAGE','AI_CONVERSATION',conversationId,{actions:local.actions||[],provider:providerReply?'openai':'local'});
  res.json({conversation_id:conversationId,reply,actions:local.actions||[],data:local.data||null,preview:local.preview||null,publishDisabled:true});
}));

app.get('/api/audit', asyncRoute(async (req,res)=>{const limit=Math.min(Number(req.query.limit||250),500);res.json((await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1',[limit])).rows)}));

app.get('*', (_req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.use((error,_req,res,_next)=>{console.error(error);const message=error.code==='23505'?'A product or SKU with the same value already exists':'Internal server error';res.status(error.code==='23505'?409:500).json({error:message});});
initDb().then(status=>{console.log('Database status:',status);app.listen(port,'0.0.0.0',()=>console.log(`AEC v${VERSION} running on port ${port}`));}).catch(error=>{console.error('Database initialization failed:',error);process.exit(1);});
