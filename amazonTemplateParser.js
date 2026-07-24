'use strict';

const FIELD_ALIASES = {
  sku: ['seller_sku','item_sku','sku','merchant_sku','contribution_sku'],
  parentSku: ['parent_sku','parent_sku_value','parent_sku_id'],
  parentage: ['parentage','parentage_level','parent_child','parent_child_relationship','parent_child_relationship_type'],
  relationship: ['relationship_type','relationship'],
  variationTheme: ['variation_theme','variationtheme'],
  title: ['item_name','product_name','title','item_title'],
  color: ['color_name','color','colour_name','colour'],
  colorMap: ['color_map','colour_map'],
  size: ['size_name','size','shoe_size','footwear_size','size_value'],
  price: ['standard_price','price','list_price','sale_price','our_price','your_price','your_price_egp_sell_on_amazon_eg','purchasable_offer'],
  quantity: ['quantity','fulfillment_center_id','merchant_shipping_group_name'],
  mainImage: ['main_image_url','main_image','image_url','image1','main_image_location'],
  productType: ['product_type','feed_product_type','item_type_keyword'],
  errorCode: ['error_code','error_type','error_number','code'],
  errorMessage: ['error_message','error_description','message','error'],
  amount: ['total','amount','product_sales','net_proceeds','total_amount'],
};

function normalize(value) {
  return String(value ?? '')
    .trim().toLowerCase()
    .replace(/[%&+]/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const ALIAS_TO_FIELD = new Map();
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_FIELD.set(normalize(alias), field);
}

function nonEmpty(value) { return String(value ?? '').trim() !== ''; }
function firstValue(mapped, field) { return mapped[field]; }

function headerCandidateScore(row) {
  const normalized = row.map(normalize).filter(Boolean);
  const matched = new Set(normalized.map(v => ALIAS_TO_FIELD.get(v)).filter(Boolean));
  let score = matched.size * 10;
  if (matched.has('sku')) score += 28;
  if (matched.has('parentage') || matched.has('parentSku')) score += 14;
  if (matched.has('color')) score += 8;
  if (matched.has('size')) score += 8;
  if (matched.has('price')) score += 5;
  if (matched.has('mainImage')) score += 4;
  score += Math.min(normalized.length, 25) * 0.2;
  return { score, matched: [...matched] };
}

function mapRow(headers, values) {
  const canonical = {};
  const raw = {};
  headers.forEach((header, index) => {
    const key = normalize(header);
    if (!key) return;
    const value = values[index] ?? '';
    raw[String(header)] = value;
    const field = ALIAS_TO_FIELD.get(key);
    if (field && !nonEmpty(canonical[field])) canonical[field] = value;
  });
  return { canonical, raw };
}

function detectSheetAndHeader(workbook, XLSX) {
  const candidates = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
    if (!matrix.length) continue;
    let best = { score: -1, index: 0, matched: [] };
    const limit = Math.min(matrix.length, 35);
    for (let i = 0; i < limit; i++) {
      const candidate = headerCandidateScore(matrix[i] || []);
      if (candidate.score > best.score) best = { ...candidate, index: i };
    }
    const dataRows = Math.max(0, matrix.length - best.index - 1);
    const sheetBonus = /template|data|listing|upload|flat|feed/i.test(sheetName) ? 8 : 0;
    candidates.push({ sheetName, matrix, headerIndex: best.index, score: best.score + sheetBonus + Math.min(dataRows, 100) * 0.04, matched: best.matched });
  }
  candidates.sort((a,b) => b.score - a.score);
  return candidates[0] || null;
}

function classifyListingRow(canonical, rowNumber, seen) {
  const issues = [];
  const sku = String(firstValue(canonical, 'sku') || '').trim();
  const parentSku = String(firstValue(canonical, 'parentSku') || '').trim();
  const relationshipText = `${firstValue(canonical,'parentage') || ''} ${firstValue(canonical,'relationship') || ''}`.toLowerCase();
  const isParent = relationshipText.includes('parent') && !relationshipText.includes('child');
  const isChild = relationshipText.includes('child') || Boolean(parentSku);

  const add = (severity, code, message, field) => issues.push({ severity, code, message, field });
  if (!sku) add('ERROR','MISSING_SKU','Seller SKU is required','sku');
  if (sku && seen.has(sku.toUpperCase())) add('ERROR','DUPLICATE_SKU','SKU appears more than once in the file','sku');
  if (sku) seen.add(sku.toUpperCase());

  if (!isParent) {
    if (!nonEmpty(firstValue(canonical,'color')) && !nonEmpty(firstValue(canonical,'colorMap'))) add('ERROR','MISSING_COLOR','Child row requires a color','color');
    if (!nonEmpty(firstValue(canonical,'size'))) add('ERROR','MISSING_SIZE','Child row requires a size','size');
    if (!parentSku && !relationshipText.includes('parent')) add('ERROR','MISSING_PARENT_SKU','Child row is not linked to a Parent SKU','parentSku');
    if (!nonEmpty(firstValue(canonical,'mainImage'))) add('WARNING','MISSING_MAIN_IMAGE','Main image URL is missing','mainImage');
    const price = firstValue(canonical,'price');
    if (!nonEmpty(price)) add('WARNING','MISSING_PRICE','Standard price is missing','price');
    else if (!Number.isFinite(Number(String(price).replace(/,/g,''))) || Number(String(price).replace(/,/g,'')) <= 0) add('ERROR','INVALID_PRICE','Price must be a positive number','price');
  }
  if (isParent && !nonEmpty(firstValue(canonical,'variationTheme'))) add('WARNING','MISSING_VARIATION_THEME','Parent row has no variation theme','variationTheme');

  return { row: rowNumber, sku: sku || null, parentSku: parentSku || null, rowType: isParent ? 'PARENT' : (isChild ? 'CHILD' : 'UNKNOWN'), issues };
}

function analyzeListing(matrix, headerIndex, options = {}) {
  const headers = matrix[headerIndex] || [];
  const seen = new Set();
  const results = [];
  let dataStartRow = null;
  let parentRows = 0;
  let childRows = 0;
  let validRows = 0;
  let warningRows = 0;
  let blockedRows = 0;
  let ignoredRows = 0;
  const sampleRows = [];

  const requestedStartRow = Number(options.dataStartRow || 0);
  const firstDataIndex = requestedStartRow > 0 ? Math.max(headerIndex + 1, requestedStartRow - 1) : headerIndex + 1;

  for (let i = firstDataIndex; i < matrix.length; i++) {
    const values = matrix[i] || [];
    const { canonical, raw } = mapRow(headers, values);
    const hasProductSignal = ['sku','parentSku','parentage','title','color','size','price'].some(f => nonEmpty(canonical[f]));
    if (!hasProductSignal) { if (values.some(nonEmpty)) ignoredRows++; continue; }
    if (dataStartRow == null) dataStartRow = i + 1;
    const result = classifyListingRow(canonical, i + 1, seen);
    results.push(result);
    if (result.rowType === 'PARENT') parentRows++;
    else childRows++;
    const hasError = result.issues.some(x => x.severity === 'ERROR');
    const hasWarning = result.issues.some(x => x.severity === 'WARNING');
    if (hasError) blockedRows++;
    else if (hasWarning) warningRows++;
    else validRows++;
    if (sampleRows.length < 25) sampleRows.push({ excelRow: i + 1, rowType: result.rowType, ...raw });
  }

  const issueRows = results.filter(r => r.issues.length);
  const warningCounts = new Map();
  for (const row of issueRows) for (const issue of row.issues.filter(x => x.severity === 'WARNING')) warningCounts.set(issue.message, (warningCounts.get(issue.message) || 0) + 1);
  const topWarnings = [...warningCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([message,count])=>({message,count}));
  const totalRows = results.length;
  const fileHealth = totalRows ? Math.round(((validRows + warningRows * 0.65) / totalRows) * 100) : 100;
  return { headers: headers.map(String), dataStartRow: dataStartRow || headerIndex + 2, parentRows, childRows, validRows, accepted: validRows, warningRows, blockedRows, ignoredRows, fileHealth, topWarnings, issues: issueRows.slice(0,500), sampleRows, totalRows };
}

function analyzeProcessingSummary(matrix, headerIndex) {
  const headers = matrix[headerIndex] || [];
  const issues = [];
  const sampleRows = [];
  let totalRows = 0, validRows = 0, blockedRows = 0;
  let dataStartRow = null;
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const { canonical, raw } = mapRow(headers, matrix[i] || []);
    if (!Object.values(canonical).some(nonEmpty)) continue;
    if (dataStartRow == null) dataStartRow = i + 1;
    totalRows++;
    const message = canonical.errorMessage;
    const code = canonical.errorCode;
    if (nonEmpty(message) || nonEmpty(code)) {
      blockedRows++;
      issues.push({ row:i+1, sku:String(canonical.sku||'').trim()||null, rowType:'PROCESSING_RESULT', issues:[{severity:'ERROR',code:String(code||'AMAZON_REJECTION'),message:String(message||'Amazon processing error'),field:null}] });
    } else validRows++;
    if (sampleRows.length < 25) sampleRows.push({ excelRow:i+1, ...raw });
  }
  const fileHealth = totalRows ? Math.round((validRows / totalRows) * 100) : 100;
  return { headers:headers.map(String), dataStartRow:dataStartRow||headerIndex+2, parentRows:0, childRows:0, validRows, accepted:validRows, warningRows:0, blockedRows, ignoredRows:0, fileHealth, topWarnings:[], issues, sampleRows, totalRows };
}

function analyzeTransactions(matrix, headerIndex) {
  const headers = matrix[headerIndex] || [];
  const issues = [];
  const sampleRows = [];
  let totalRows=0, validRows=0, blockedRows=0, dataStartRow=null;
  for (let i=headerIndex+1;i<matrix.length;i++) {
    const { canonical, raw } = mapRow(headers,matrix[i]||[]);
    if (!Object.values(raw).some(nonEmpty)) continue;
    if (dataStartRow==null) dataStartRow=i+1;
    totalRows++;
    const amount=canonical.amount;
    const rowIssues=[];
    if (nonEmpty(amount) && !Number.isFinite(Number(String(amount).replace(/[,$\s]/g,'')))) rowIssues.push({severity:'ERROR',code:'INVALID_AMOUNT',message:'Transaction amount is not numeric',field:'amount'});
    if (rowIssues.length) { blockedRows++; issues.push({row:i+1,sku:null,rowType:'TRANSACTION',issues:rowIssues}); } else validRows++;
    if(sampleRows.length<25) sampleRows.push({excelRow:i+1,...raw});
  }
  const fileHealth = totalRows ? Math.round((validRows / totalRows) * 100) : 100;
  return {headers:headers.map(String),dataStartRow:dataStartRow||headerIndex+2,parentRows:0,childRows:0,validRows,accepted:validRows,warningRows:0,blockedRows,ignoredRows:0,fileHealth,topWarnings:[],issues,sampleRows,totalRows};
}

function analyzeWorkbook(workbook, XLSX, fileType='LISTING') {
  const detected = detectSheetAndHeader(workbook, XLSX);
  if (!detected) throw new Error('Workbook has no readable sheets');
  let analysis;
  if (fileType === 'PROCESSING_SUMMARY') analysis = analyzeProcessingSummary(detected.matrix, detected.headerIndex);
  else if (fileType === 'TRANSACTIONS') analysis = analyzeTransactions(detected.matrix, detected.headerIndex);
  else {
    // Amazon Egypt category templates use row 4 for user-facing headers,
    // row 5 for internal attribute names, row 6 for examples, and real data from row 7.
    const isAmazonTemplate = /template/i.test(detected.sheetName) && detected.headerIndex <= 4;
    analysis = analyzeListing(detected.matrix, detected.headerIndex, { dataStartRow: isAmazonTemplate ? 7 : 0 });
  }
  return {
    ...analysis,
    sheetName: detected.sheetName,
    headerRow: detected.headerIndex + 1,
    matchedFields: detected.matched,
    analysisVersion: '1.2.2'
  };
}

module.exports = { analyzeWorkbook, normalize, detectSheetAndHeader };
