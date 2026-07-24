const state = {
  dashboard: null,
  approvals: [],
  files: [],
  activity: [],
  products: { seed: [], uploaded: [] },
  transactions: [],
  approvalFilter: "pending",
  productQuery: "",
  orderQuery: "",
  drafts: [],
  amazon: null,
  security: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const DEMO_MODE = true;
const DEMO_STORAGE_KEY = "aec_demo_v11_state";

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function demoNow() { return new Date().toISOString(); }
function loadDemoStore() {
  try {
    const saved = localStorage.getItem(DEMO_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  const seed = previewData();
  seed.activity = [
    { level:"info", title:"AEC Demo initialized", sub:"Protected simulation workspace loaded.", createdAt:demoNow() },
    { level:"safe", title:"Emergency Amazon lock enabled", sub:"No live Amazon write can occur in this demo.", createdAt:demoNow() }
  ];
  seed.integrations = { whatsapp:{configured:false,senderAllowlistEnabled:true}, n8n:{configured:false} };
  saveDemoStore(seed);
  return seed;
}
function saveDemoStore(store) {
  try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store)); } catch {}
}
function demoActivity(store, title, sub, level="info") {
  store.activity = store.activity || [];
  store.activity.unshift({ level, title, sub, createdAt:demoNow() });
  store.activity = store.activity.slice(0, 120);
}
function parseJsonBody(options) {
  if (!options || !options.body || options.body instanceof FormData) return {};
  try { return JSON.parse(options.body); } catch { return {}; }
}
function parseCommand(command) {
  const text = String(command || "").trim();
  const normalized = text
    .replace(/[،؛]/g, ",")
    .replace(/إلى|الي/g, "to")
    .replace(/من/g, "from");
  const sku = (normalized.match(/(?:sku|كود|موديل)\s*[:#-]?\s*([A-Z0-9_-]+)/i) || [])[1] || `AEC${Date.now().toString().slice(-5)}`;
  const price = Number((normalized.match(/(?:price|السعر|سعر)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i) || [])[1] || 499);
  const origin = (normalized.match(/(?:origin|بلد المنشأ|المنشأ)\s*[:=-]?\s*([A-Za-z\u0600-\u06FF ]{2,30})/i) || [])[1]?.trim() || "Egypt";
  const weight = Number((normalized.match(/(?:weight|الوزن)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i) || [])[1] || 50);
  let sizes = [];
  const range = normalized.match(/(?:sizes?|المقاسات?|مقاس)\s*(?:from)?\s*(\d{2})\s*(?:to|-)\s*(\d{2})/i);
  if (range) for (let n=Number(range[1]); n<=Number(range[2]); n++) sizes.push(String(n));
  if (!sizes.length) {
    const m=normalized.match(/(?:sizes?|المقاسات?|مقاس)\s*[:=-]?\s*([0-9,\s]+)/i);
    if (m) sizes=m[1].split(/[\s,]+/).filter(Boolean);
  }
  if (!sizes.length) sizes=["41","42","43","44","45"];
  const colorAliases = [
    ["Black",/\bblack\b|أسود|اسود/i],["Grey",/\bgr(?:e|a)y\b|رمادي|رصاصي/i],["White",/\bwhite\b|أبيض|ابيض/i],
    ["Beige",/\bbeige\b|بيج/i],["Brown",/\bbrown\b|بني/i],["Havan",/\bhavan\b|هافان/i],["Nabity",/\bnabity\b|نبيتي/i],
    ["Ziti",/\bziti\b|زيتي/i],["Navy",/\bnavy(?:\s*blue)?\b|كحلي/i],["Blue",/\bblue\b|أزرق|ازرق/i],["Red",/\bred\b|أحمر|احمر/i]
  ];
  const colors=[];
  for (const [name,re] of colorAliases) if (re.test(normalized)) colors.push(name);
  if (!colors.length) colors.push("Black","Grey","White");
  const uniqueColors=[...new Set(colors)];
  const fulfillment=/\bFBA\b|مخازن امازون|مخازن أمازون/i.test(normalized)?"FBA":"MFN";
  const gender=/women|women's|نسائي|حريمي/i.test(normalized)?"Women's":"Men's";
  const productType=/sandals?|slippers?|صندل|شبشب/i.test(normalized)?"SANDALS":"SHOES";
  const categoryLabel=productType==="SHOES"?"Casual Sneakers":"Casual Sandals";
  const colorMap={Havan:"Brown",Nabity:"Red",Ziti:"Green",Navy:"Blue"};
  const children=[];
  for (const color of uniqueColors) for (const size of sizes) {
    const safe=color.toUpperCase().replace(/\s+/g,"-");
    children.push({
      sku:`${sku}-${safe}-${size}`,
      title:`Now Shoes ${gender} ${categoryLabel} ${sku}, ${color}, ${size}`,
      colorName:color,
      colorMap:colorMap[color]||color,
      sizeName:size,
      price,
      origin,
      weightGrams:weight
    });
  }
  return {
    id:`draft-${Date.now()}`,status:"draft",parentSku:sku,productType,gender,command:text,colors:uniqueColors,sizes,price,origin,weightGrams:weight,fulfillment,
    parent:{title:`Now Shoes ${gender} ${categoryLabel} ${sku}`},children,
    validation:{status:"not_run",issueCount:0,issues:[]},workflow:{command:true,draft:true,validated:false,approved:false,published:false},createdAt:demoNow()
  };
}
async function demoApi(url, options={}) {
  await new Promise(r=>setTimeout(r, 180));
  const store=loadDemoStore();
  const method=(options.method||"GET").toUpperCase();
  const body=parseJsonBody(options);
  if (url.startsWith("/api/dashboard")) {
    store.dashboard.pendingApprovals=store.approvals.filter(x=>x.status==="pending").length;
    store.dashboard.filesProcessed=store.files.length;
    store.dashboard.blockedFiles=store.files.filter(x=>x.validation?.status==="blocked").length;
    return clone(store.dashboard);
  }
  if (url.startsWith("/api/approvals/bulk/simulate")) {
    for (const a of store.approvals) if ((body.ids||[]).includes(a.id) && a.status==="pending") a.simulation={safe:true,preview:`${a.proposedFix?.from||"—"} → ${a.proposedFix?.to||"—"}`,createdAt:demoNow()};
    demoActivity(store,"Bulk simulation completed",`${(body.ids||[]).length} approval proposals simulated.`,"safe"); saveDemoStore(store); return {count:(body.ids||[]).length};
  }
  if (url.startsWith("/api/approvals/bulk/approve")) {
    let count=0; for (const a of store.approvals) if ((body.ids||[]).includes(a.id) && a.status==="pending" && a.simulation) {a.status="approved";a.decidedAt=demoNow();a.decidedBy=body.decidedBy||"Project owner";count++;}
    demoActivity(store,"Bulk approval completed",`${count} proposal(s) approved in demo mode.`,"safe"); saveDemoStore(store); return {count};
  }
  let m=url.match(/^\/api\/approvals\/([^/]+)\/(simulate|approve|reject)$/);
  if (m) {
    const a=store.approvals.find(x=>x.id===m[1]); if(!a) throw new Error("Approval not found.");
    if(m[2]==="simulate") a.simulation={safe:true,before:a.proposedFix?.from||"—",after:a.proposedFix?.to||"—",amazonWrite:false,createdAt:demoNow()};
    if(m[2]==="approve"){if(!a.simulation)throw new Error("Run simulation before approval.");a.status="approved";a.decidedAt=demoNow();a.decidedBy=body.decidedBy||"Project owner";}
    if(m[2]==="reject"){a.status="rejected";a.decidedAt=demoNow();a.decidedBy=body.decidedBy||"Project owner";}
    demoActivity(store,`Approval ${m[2]}`,`${a.sku}: ${a.issue}`,m[2]==="reject"?"warning":"safe"); saveDemoStore(store); return {proposal:clone(a)};
  }
  if (url==="/api/approvals") return clone(store.approvals);
  if (url==="/api/files/upload" && method==="POST") {
    const file=options.body instanceof FormData ? options.body.get("file") : null;
    const id=`f${Date.now()}`; const rows=Math.max(16,Math.round((file?.size||16000)/2500));
    const obj={id,originalName:file?.name||"Amazon_Template_Demo.xlsx",sizeBytes:file?.size||48000,fileType:/transaction/i.test(file?.name||"")?"transactions":"amazon_template",uploadedAt:demoNow(),fingerprint:crypto?.randomUUID?.().replaceAll("-","")||String(Date.now()),validation:{totalRows:rows,validRows:Math.max(0,rows-2),status:"blocked",issueCount:2,counts:{high:1,medium:1,low:0,critical:0},issues:[{rowNumber:8,code:"DEMO_COLOR_MAP",message:"Demo detected an unsafe color dropdown value.",risk:"high"},{rowNumber:9,code:"DEMO_IMAGE_URL",message:"Demo detected a non-direct image URL.",risk:"medium"}]},parsed:{primarySheet:"Template"},appliedPatches:[]};
    store.files.unshift(obj); store.approvals.unshift({id:`a${Date.now()}`,status:"pending",sku:"NEW-SKU-41",risk:"high",issue:"Demo proposal created from uploaded file.",agent:"File Agent",rowNumber:8,createdAt:demoNow(),sourceCode:"DEMO_UPLOAD_FIX",proposedFix:{from:"HAVAN",to:"Brown"}}); demoActivity(store,"File processed",`${obj.originalName} analyzed in offline demo mode.`); saveDemoStore(store); return {file:obj,validation:obj.validation,proposalsCreated:1};
  }
  m=url.match(/^\/api\/files\/([^/]+)$/); if(m){const f=store.files.find(x=>x.id===m[1]);if(!f)throw new Error("File not found.");return clone(f);}
  if (url==="/api/files") return clone(store.files);
  if (url.startsWith("/api/activity")) return clone(store.activity||[]);
  if (url==="/api/listings") return clone(store.products);
  if (url==="/api/transactions") return clone(store.transactions||[]);
  if (url==="/api/product-drafts/from-command" && method==="POST") {const d=parseCommand(body.command);store.drafts.unshift(d);demoActivity(store,"Product draft created",`${d.parentSku}: ${d.children.length} child variations generated.`);saveDemoStore(store);return clone(d);}
  m=url.match(/^\/api\/product-drafts\/([^/]+)\/(validate|approve|publish)$/); if(m){const d=store.drafts.find(x=>x.id===m[1]);if(!d)throw new Error("Draft not found.");if(m[2]==="validate"){
      const issues=[];
      for(const color of d.colors||[]) if(["Havan","Nabity","Ziti"].includes(color)) issues.push({severity:"warning",field:"colorMap",message:`${color} will use Amazon-safe color mapping.`});
      d.status=issues.some(x=>x.severity==="error")?"blocked":"validated";
      d.validation={status:d.status==="blocked"?"blocked":"ready",issueCount:issues.length,issues};
      d.amazonPreview={mode:"DEMO_VALIDATION_PREVIEW",accepted:d.status!=="blocked",issues};
      d.workflow={...(d.workflow||{}),validated:d.status!=="blocked"};
    }if(m[2]==="approve"){if(d.status!=="validated")throw new Error("Validate the draft first.");d.status="approved";d.workflow={...(d.workflow||{}),approved:true};}if(m[2]==="publish"){throw new Error("Live publishing is disabled in the HTML demo. The real Amazon connector will handle this later.");}demoActivity(store,`Draft ${m[2]}`,`${d.parentSku} moved to ${d.status}.`,"safe");saveDemoStore(store);return clone(d);}
  if (url==="/api/product-drafts") return clone(store.drafts||[]);
  if (url==="/api/amazon/test") return {ok:false,demo:true,message:"HTML demo only. No Amazon credentials are used."};
  if (url==="/api/amazon/connection") return clone(store.amazon);
  if (url==="/api/security/emergency-lock" && method==="POST") {store.security.emergencyLock=!!body.locked;store.security.controls.emergencyLock=!!body.locked;store.security.changedAt=demoNow();store.security.changedBy="Project owner";demoActivity(store,body.locked?"Emergency lock enabled":"Emergency lock released",body.reason||"Manual demo change",body.locked?"safe":"warning");saveDemoStore(store);return clone(store.security);}
  if (url==="/api/security/status") return clone(store.security);
  if (url==="/api/integrations/status") return clone(store.integrations||{whatsapp:{configured:false,senderAllowlistEnabled:true},n8n:{configured:false}});
  throw new Error(`Demo route is not implemented: ${url}`);
}

async function api(url, options = {}) {
  if (DEMO_MODE || location.protocol === "file:") return demoApi(url, options);
  const response = await fetch(url, {
    headers: options.body instanceof FormData ? { "X-AEC-User": localStorage.getItem("aecUser") || "Project owner", "X-AEC-Role": localStorage.getItem("aecRole") || "admin", ...(options.headers || {}) } : { "Content-Type": "application/json", "X-AEC-User": localStorage.getItem("aecUser") || "Project owner", "X-AEC-Role": localStorage.getItem("aecRole") || "admin", ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function shortFingerprint(value) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—";
}

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast${error ? " error" : ""}`;
  setTimeout(() => toast.classList.add("hidden"), 3400);
}

function openModal(html) {
  $("#modalContent").innerHTML = html;
  $("#modal").classList.remove("hidden");
}

function closeModal() {
  $("#modal").classList.add("hidden");
}

function navigate(view) {
  const pageMap = { overview:"index.html", products:"products.html", command:"command.html", amazon:"amazon.html", security:"security.html", approvals:"approvals.html", policies:"policies.html", orders:"orders.html", profit:"profit.html", files:"files.html", reports:"reports.html", agents:"agents.html", whatsapp:"whatsapp.html", automation:"automation.html", audit:"audit.html" };
  const current = document.body.dataset.page || "overview";
  if (view !== current && pageMap[view]) { window.location.href = `/${pageMap[view]}`; return; }
  $$(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  if (view === "audit") loadActivity();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function riskPill(risk) {
  return `<span class="risk ${escapeHtml(risk)}">${escapeHtml(risk)}</span>`;
}

function resultPill(result) {
  return `<span class="result-pill ${escapeHtml(result)}">${escapeHtml(result)}</span>`;
}

function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function previewData() {
  const uploaded = [
    { sku:"CK1", title:"", parentage:"parent", colorName:"", sizeName:"", price:"", source:"CK1 Amazon Template" },
    { sku:"CK1-BLACK-41", title:"Now Shoes Men's Casual Lace-Up Sneakers CK1, Black, 41", parentage:"child", parentSku:"CK1", colorName:"Black", colorMap:"Black", sizeName:"41", price:"499", mainImage:"https://lh3.googleusercontent.com/d/demo=s2000", otherImage1:"https://lh3.googleusercontent.com/d/demo2=s2000", source:"CK1 Amazon Template" },
    { sku:"CK1-HAVAN-42", title:"Now Shoes Men's Casual Lace-Up Sneakers CK1, Havan, 42", parentage:"child", parentSku:"CK1", colorName:"Havan", colorMap:"HAVAN", sizeName:"42", price:"499", mainImage:"https://drive.google.com/file/d/demo/view", source:"CK1 Amazon Template" },
    { sku:"CK1-WHITE-43", title:"Now Shoes Men's Lightweight Everyday Sneakers CK1 White 43 for Walking Casual Work and Travel in Egypt", parentage:"child", parentSku:"CK1", colorName:"White", colorMap:"White", sizeName:"43", price:"499", mainImage:"", source:"CK1 Amazon Template" }
  ];
  return {
    dashboard:{mode:"protected",pendingApprovals:3,listingsMonitored:16,listingErrors:4,filesProcessed:2,blockedFiles:1,highRiskApprovals:2,latestFile:{originalName:"CK1_Amazon_Egypt_Completed.xlsm",validation:{issueCount:4}},financial:{orders:128,transactionRows:166,grossSales:63872,sellingFees:-9581,fbaFees:-7024,otherFees:-1180,netTotal:46087},agentStatus:[{name:"File Agent",detail:"Workbook fingerprinting and row detection",status:"Active"},{name:"Product Agent",detail:"SEO, variation and catalog validation",status:"Active"},{name:"Image Agent",detail:"Image URL and sequence compliance",status:"Active"},{name:"Amazon Response Agent",detail:"Processing summary rejection matching",status:"Ready"}]},
    approvals:[{id:"a1",status:"pending",sku:"CK1-HAVAN-42",risk:"high",issue:"Color map HAVAN is not a safe Amazon dropdown value.",agent:"Product Agent",rowNumber:9,createdAt:new Date().toISOString(),sourceCode:"INVALID_COLOR_DROPDOWN",proposedFix:{from:"HAVAN",to:"Brown"}},{id:"a2",status:"pending",sku:"CK1-HAVAN-42",risk:"high",issue:"Google Drive page link must be converted to a direct image URL.",agent:"Image Agent",rowNumber:9,createdAt:new Date().toISOString(),sourceCode:"NON_DIRECT_IMAGE_URL",proposedFix:{from:"drive.google.com/file/...",to:"lh3.googleusercontent.com/d/...=s2000"}},{id:"a3",status:"pending",sku:"CK1-WHITE-43",risk:"high",issue:"Main image is missing.",agent:"Image Agent",rowNumber:10,createdAt:new Date().toISOString(),sourceCode:"MISSING_MAIN_IMAGE",proposedFix:{from:"—",to:"Upload compliant white-background image"}}],
    files:[{id:"f1",originalName:"CK1_Amazon_Egypt_Completed.xlsm",sizeBytes:184320,fileType:"amazon_template",uploadedAt:new Date().toISOString(),fingerprint:"9e857a4e501f2bca9dc2f6b683a40098",validation:{totalRows:16,status:"blocked",issueCount:4},appliedPatches:[]},{id:"f2",originalName:"Transactions.csv",sizeBytes:44120,fileType:"transactions",uploadedAt:new Date(Date.now()-86400000).toISOString(),fingerprint:"6b918f04971d88f6a132a93c6ed22644",validation:{totalRows:166,status:"accepted",issueCount:0},appliedPatches:[]}],
    activity:[], products:{seed:[],uploaded}, transactions:[], amazon:{configured:false,mode:"simulation",marketplaceId:"ARBP9OOSHTCHU",credentialsStoredServerSide:true}, security:{emergencyLock:true,changedAt:new Date().toISOString(),changedBy:"system",reason:"Safe default before Amazon connection",score:78,safeToConnect:false,controls:{authRequired:false,apiKeyConfigured:false,forceHttps:false,corsRestricted:false,encryptionKeyConfigured:false,simulationMode:true,amazonCredentialsConfigured:false,secretsExposedToBrowser:false,auditEnabled:true,twoPersonPublish:true,emergencyLock:true}}, drafts:[{id:"preview-draft",status:"draft",parentSku:"S60",productType:"SHOES",command:"Create SKU S60 men shoes colors Black Grey Havan sizes from 41 to 45 price 549 FBA",colors:["Black","Grey","Havan"],sizes:["41","42","43","44","45"],price:549,fulfillment:"FBA",parent:{title:"Now Shoes Men's Casual Sneakers S60"},children:Array.from({length:15},(_,i)=>({sku:`S60-${["BLACK","GREY","HAVAN"][Math.floor(i/5)]}-${41+(i%5)}`,title:`Now Shoes Men's Casual Sneakers S60, ${["Black","Grey","Havan"][Math.floor(i/5)]}, ${41+(i%5)}`,price:549})),validation:{status:"ready",issueCount:0,issues:[]}}]
  };
}

async function loadAll() {
  try {
    const [dashboard, approvals, files, activity, products, transactions, drafts, amazon, security, integrations] = await Promise.all([
      api("/api/dashboard"), api("/api/approvals"), api("/api/files"), api("/api/activity?limit=80"), api("/api/listings"), api("/api/transactions"), api("/api/product-drafts"), api("/api/amazon/connection"), api("/api/security/status"), api("/api/integrations/status")
    ]);
    Object.assign(state, { dashboard, approvals, files, activity, products, transactions, drafts, amazon, security, integrations });
  } catch (error) {
    Object.assign(state, previewData());
    document.body.classList.add("preview-mode");
  }
  renderAll();
}

function renderAll() {
  renderOverview();
  renderApprovals();
  renderFiles();
  renderProducts();
  renderOrders();
  renderProfit();
  renderReports();
  renderAgents();
  renderDrafts();
  renderAmazon();
  renderAudit();
  renderIntegrations();
}

function renderOverview() {
  const dashboard = state.dashboard;
  if (!dashboard) return;
  $("#modePill").textContent = dashboard.mode === "live" ? "Live mode" : "Protected mode";
  $("#navApprovalCount").textContent = dashboard.pendingApprovals;
  $("#overviewSubtitle").textContent = `Your Amazon Egypt control center is protected. ${dashboard.pendingApprovals} item(s) await a decision.`;
  $("#kpiListings").textContent = dashboard.listingsMonitored.toLocaleString();
  $("#kpiApprovals").textContent = dashboard.pendingApprovals.toLocaleString();
  $("#kpiErrors").textContent = dashboard.listingErrors.toLocaleString();
  $("#kpiFiles").textContent = dashboard.filesProcessed.toLocaleString();
  $("#kpiFilesSub").textContent = `${dashboard.blockedFiles} blocked file(s)`;
  $("#intelligenceText").textContent = dashboard.highRiskApprovals
    ? `${dashboard.highRiskApprovals} high-risk approval(s) require attention before Amazon execution.`
    : dashboard.latestFile
      ? `${dashboard.latestFile.originalName} was processed with ${dashboard.latestFile.validation.issueCount} issue(s).`
      : "Upload an Amazon file to start full-row validation.";
  $("#recommendationText").textContent = dashboard.highRiskApprovals
    ? "Simulate high-risk fixes first. AEC will show the exact field, current value, and proposed safe value."
    : "The File Agent fingerprints every upload, checks all rows, and stores a full audit trail.";

  $("#agentList").innerHTML = dashboard.agentStatus.map(agent => `
    <div class="agent-row">
      <div class="left"><span class="agent-avatar">${escapeHtml(agent.name.split(" ").map(part => part[0]).join("").slice(0,2))}</span><div><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.detail)}</small></div></div>
      <span class="agent-state">${escapeHtml(agent.status)}</span>
    </div>`).join("");

  const pending = state.approvals.filter(item => item.status === "pending").slice(0, 4);
  $("#overviewApprovals").innerHTML = pending.length ? pending.map(item => `
    <div class="stack-item">
      <div class="left"><span class="agent-avatar">${escapeHtml((item.agent || "AI").slice(0,2).toUpperCase())}</span><div><strong>${escapeHtml(item.sku)}</strong><small>${escapeHtml(item.issue)}</small></div></div>
      <div class="action-row">${riskPill(item.risk)}<button class="tiny-btn" data-simulate="${item.id}">Simulate</button></div>
    </div>`).join("") : empty("No pending approvals.");

  $("#overviewFiles").innerHTML = state.files.length ? state.files.slice(0, 5).map(file => `
    <div class="stack-item">
      <div class="left"><span class="agent-avatar">XL</span><div><strong>${escapeHtml(file.originalName)}</strong><small>${file.validation.totalRows} rows • ${shortDate(file.uploadedAt)}</small></div></div>
      ${resultPill(file.validation.status)}
    </div>`).join("") : empty("No persisted files yet.");
}

function approvalCard(item) {
  const simulation = item.simulation ? `<span class="mini-pill">Simulated ${shortDate(item.simulation.simulatedAt)}</span>` : "";
  const before = item.proposedFix?.from ?? "—";
  const after = item.proposedFix?.to ?? "—";
  const actions = item.status === "pending" ? `
    <div class="action-row">
      <button class="tiny-btn" data-simulate="${item.id}">Simulate</button>
      <button class="tiny-btn approve" data-approve="${item.id}" ${item.simulation ? "" : "disabled title=\"Simulation required\""}>Approve</button>
      <button class="tiny-btn reject" data-reject="${item.id}">Reject</button>
    </div>` : `<span class="mini-pill">${escapeHtml(item.status)} ${shortDate(item.decidedAt)}</span>`;
  return `
    <article class="approval-card">
      <div class="approval-top"><div>${riskPill(item.risk)} ${simulation}</div><span class="mono">${escapeHtml(item.sourceCode || item.type)}</span></div>
      <h3>${escapeHtml(item.sku)}</h3>
      <p>${escapeHtml(item.issue)}</p>
      <div class="approval-meta"><span>${escapeHtml(item.agent)}</span><span>Row ${escapeHtml(item.rowNumber || "listing")}</span><span>${shortDate(item.createdAt)}</span></div>
      <div class="change-box"><code>${escapeHtml(before)}</code><span>→</span><code>${escapeHtml(after)}</code></div>
      ${actions}
    </article>`;
}

function renderApprovals() {
  const filter = state.approvalFilter;
  const items = state.approvals.filter(item => filter === "all" || item.status === filter);
  $("#approvalsList").innerHTML = items.length ? items.map(approvalCard).join("") : empty(`No ${filter} approvals.`);
  $$("[data-approval-filter]").forEach(button => button.classList.toggle("active", button.dataset.approvalFilter === filter));
}

function renderFiles() {
  $("#filesTable").innerHTML = state.files.length ? state.files.map(file => `
    <tr>
      <td><strong>${escapeHtml(file.originalName)}</strong><br><small>${(file.sizeBytes / 1024).toFixed(1)} KB</small></td>
      <td>${escapeHtml(file.fileType.replaceAll("_", " "))}</td>
      <td>${file.validation.totalRows}</td>
      <td>${resultPill(file.validation.status)}</td>
      <td>${file.validation.issueCount}</td>
      <td class="mono" title="${escapeHtml(file.fingerprint)}">${shortFingerprint(file.fingerprint)}</td>
      <td>${shortDate(file.uploadedAt)}</td>
      <td><div class="action-row"><button class="tiny-btn" data-file-details="${file.id}">Details</button><button class="tiny-btn" data-demo-download="report">Report</button><button class="tiny-btn" data-demo-download="patches">Patches</button>${(file.appliedPatches || []).length ? `<button class="tiny-btn primary-link" data-demo-download="export">Export corrected</button>` : ""}</div></td>
    </tr>`).join("") : `<tr><td colspan="8">${empty("No files processed yet.")}</td></tr>`;
}

function normalizedProduct(item, source) {
  return {
    sku: item.sku || "—",
    title: item.title || item.itemName || "—",
    parentage: item.parentage || (item.parentSku ? "child" : "standalone"),
    color: item.colorName || item.colorMap || item.attributes?.color_map || "—",
    size: item.sizeName || item.attributes?.size_dropdown || "—",
    price: item.price || "—",
    source
  };
}

function listingMetrics(item) {
  const title = String(item.title || "").trim();
  const titleLength = title.length;
  let seo = titleLength >= 55 && titleLength <= 120 ? 85 : titleLength > 0 && titleLength <= 200 ? 65 : 25;
  if (/\b(size|eu)\b/i.test(title)) seo -= 10;
  if (title.includes(",")) seo += 5;
  const imageFields = [item.mainImage, item.otherImage1, item.otherImage2, item.otherImage3, item.otherImage4, item.otherImage5, item.otherImage6].filter(Boolean);
  const direct = imageFields.filter(url => /^https?:\/\//i.test(String(url)) && !/drive\.google\.com\/(file|folders)/i.test(String(url))).length;
  const imageScore = imageFields.length ? Math.min(100, 35 + direct * 10) : 0;
  const issues = [];
  if (item.parentage !== "parent" && !title) issues.push("Missing title");
  if (item.parentage !== "parent" && !item.mainImage) issues.push("Missing main image");
  if (item.colorMap && !["Black","White","Beige","Grey","Brown","Red","Green","Blue","Yellow","Orange","Pink","Purple","Multicolor","Silver","Gold","Transparent"].includes(item.colorMap)) issues.push("Unsafe color dropdown");
  const health = Math.max(0, Math.round((seo + imageScore + (issues.length ? 35 : 100)) / 3));
  return { seo: Math.max(0,Math.min(100,seo)), imageCount:imageFields.length, imageScore, health, issues, titleLength, direct };
}

function scorePill(value) {
  const tone = value >= 80 ? "accepted" : value >= 60 ? "warning" : "blocked";
  return `<span class="result-pill ${tone}">${value}</span>`;
}

function openProductDrawer(item) {
  const metrics = listingMetrics(item);
  $("#drawerSku").textContent = item.sku || "SKU";
  $("#drawerContent").innerHTML = `
    <div class="drawer-score-grid"><div><span>Listing health</span><strong>${metrics.health}</strong></div><div><span>SEO score</span><strong>${metrics.seo}</strong></div><div><span>Images</span><strong>${metrics.imageCount}/7</strong></div></div>
    <section class="drawer-section"><span class="eyebrow">TITLE ANALYSIS</span><h3>${escapeHtml(item.title || "No title")}</h3><p>${metrics.titleLength} characters • Recommended working range: 55–120 characters.</p></section>
    <section class="drawer-section"><span class="eyebrow">VARIATION</span><div class="detail-grid"><span>Type</span><b>${escapeHtml(item.parentage || "standalone")}</b><span>Parent SKU</span><b>${escapeHtml(item.parentSku || "—")}</b><span>Color</span><b>${escapeHtml(item.colorName || item.colorMap || "—")}</b><span>Size</span><b>${escapeHtml(item.sizeName || "—")}</b></div></section>
    <section class="drawer-section"><span class="eyebrow">IMAGE COMPLIANCE</span><p>${metrics.direct} direct online image(s) detected. First image should show both shoes on pure white; second image one shoe on pure white; remaining images may show worn/model views.</p></section>
    <section class="drawer-section"><span class="eyebrow">DETECTED ISSUES</span>${metrics.issues.length ? metrics.issues.map(issue => `<div class="issue-line">⚠ ${escapeHtml(issue)}</div>`).join("") : `<div class="issue-line ok">✓ No blocking issue detected</div>`}</section>`;
  $("#productDrawer").classList.add("open");
  $("#productDrawer").setAttribute("aria-hidden","false");
}

function renderProducts() {
  const products = [
    ...state.products.seed.map(item => normalizedProduct(item, "Seed listing")),
    ...state.products.uploaded.map(item => normalizedProduct(item, item.source || "Uploaded file"))
  ];
  const query = state.productQuery.toLowerCase();
  const filtered = products.filter(item => !query || Object.values(item).some(value => String(value).toLowerCase().includes(query)));
  $("#productCount").textContent = `${filtered.length} product row(s)`;
  $("#productsTable").innerHTML = filtered.length ? filtered.map(item => `
    <tr class="product-row" data-product-index="${products.indexOf(item)}"><td><strong>${escapeHtml(item.sku)}</strong></td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.parentage)}</td><td>${escapeHtml(item.color)}</td><td>${escapeHtml(item.size)}</td><td>${escapeHtml(item.price)}</td><td>${scorePill(listingMetrics(item).seo)}</td><td>${listingMetrics(item).imageCount}/7</td><td>${scorePill(listingMetrics(item).health)}</td><td>${escapeHtml(item.source)}</td></tr>`).join("") : `<tr><td colspan="10">${empty("No matching products.")}</td></tr>`;
  $$(".product-row").forEach(row => row.addEventListener("click", () => openProductDrawer(products[Number(row.dataset.productIndex)])));
}


function money(value) {
  return new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function renderOrders() {
  const financial = state.dashboard?.financial || {};
  $("#orderCountKpi").textContent = Number(financial.orders || 0).toLocaleString();
  $("#transactionRowsKpi").textContent = Number(financial.transactionRows || 0).toLocaleString();
  $("#orderSalesKpi").textContent = money(financial.grossSales);
  $("#orderNetKpi").textContent = money(financial.netTotal);

  const query = state.orderQuery.toLowerCase();
  const rows = state.transactions.filter(item => !query || Object.values(item).some(value => String(value).toLowerCase().includes(query)));
  $("#orderTableCount").textContent = `${rows.length} transaction row(s)`;
  $("#ordersTable").innerHTML = rows.length ? rows.slice(0, 2000).map(item => {
    const fees = numberValue(item.sellingFees) + numberValue(item.fbaFees) + numberValue(item.otherFees);
    return `<tr>
      <td><strong>${escapeHtml(item.orderId || "—")}</strong></td>
      <td>${escapeHtml(item.transactionDate || "—")}</td>
      <td>${escapeHtml(item.sku || "—")}</td>
      <td>${escapeHtml(item.transactionType || "—")}</td>
      <td>${escapeHtml(item.quantity || "—")}</td>
      <td>${money(item.productSales)}</td>
      <td>${money(fees)}</td>
      <td>${money(item.total)}</td>
      <td>${escapeHtml(item.source || "—")}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="9">${empty("Upload an Amazon transaction CSV to populate orders.")}</td></tr>`;
}

function renderProfit() {
  const financial = state.dashboard?.financial || {};
  const gross = numberValue(financial.grossSales);
  const selling = numberValue(financial.sellingFees);
  const fba = numberValue(financial.fbaFees);
  const other = numberValue(financial.otherFees);
  const net = numberValue(financial.netTotal);
  $("#profitGross").textContent = money(gross);
  $("#profitSellingFees").textContent = money(selling);
  $("#profitFbaFees").textContent = money(fba);
  $("#profitNet").textContent = money(net);
  const max = Math.max(1, Math.abs(gross), Math.abs(selling), Math.abs(fba), Math.abs(net));
  $("#profitGrossBar").style.width = `${Math.min(100, Math.abs(gross) / max * 100)}%`;
  $("#profitSellingBar").style.width = `${Math.min(100, Math.abs(selling) / max * 100)}%`;
  $("#profitFbaBar").style.width = `${Math.min(100, Math.abs(fba) / max * 100)}%`;
  $("#profitNetBar").style.width = `${Math.min(100, Math.abs(net) / max * 100)}%`;
  const feeTotal = Math.abs(selling) + Math.abs(fba) + Math.abs(other);
  const feeRatio = gross ? feeTotal / Math.abs(gross) : 0;
  $("#feeInsight").className = gross ? "upload-result success" : "empty";
  $("#feeInsight").innerHTML = gross
    ? `<div><strong>${(feeRatio * 100).toFixed(1)}% fee pressure</strong><span>Amazon fees total ${money(feeTotal)} against ${money(gross)} gross product sales. This is settlement intelligence, not final accounting profit until COGS and operating expenses are added.</span></div>`
    : "Upload a transaction report to calculate fee pressure.";
  const files = state.files.filter(file => file.fileType === "transactions");
  $("#transactionFiles").innerHTML = files.length ? files.map(file => `
    <div class="stack-item"><div class="left"><span class="agent-avatar">CSV</span><div><strong>${escapeHtml(file.originalName)}</strong><small>${file.validation.totalRows} transaction rows • ${shortDate(file.uploadedAt)}</small></div></div>${resultPill(file.validation.status)}</div>`).join("") : empty("No transaction reports loaded.");
}

function aggregateRisks() {
  const totals = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const file of state.files) {
    for (const key of Object.keys(totals)) totals[key] += file.validation.counts?.[key] || 0;
  }
  return totals;
}

function renderReports() {
  const totals = aggregateRisks();
  const max = Math.max(1, ...Object.values(totals));
  for (const key of Object.keys(totals)) {
    $(`#report${key[0].toUpperCase()}${key.slice(1)}`).textContent = totals[key];
    $(`#bar${key[0].toUpperCase()}${key.slice(1)}`).style.width = `${Math.round((totals[key] / max) * 100)}%`;
  }
  $("#reportFiles").innerHTML = state.files.length ? state.files.map(file => `
    <div class="stack-item"><div class="left"><span class="agent-avatar">${file.validation.status === "accepted" ? "✓" : "!"}</span><div><strong>${escapeHtml(file.originalName)}</strong><small>${file.validation.validRows}/${file.validation.totalRows} rows passed high-risk validation • ${file.validation.issueCount} issues</small></div></div>${resultPill(file.validation.status)}</div>`).join("") : empty("Upload files to generate validation reporting.");
}

function renderAgents() {
  const agents = state.dashboard?.agentStatus || [];
  $("#agentsGrid").innerHTML = agents.map(agent => `
    <article class="policy-card"><span class="policy-icon">${escapeHtml(agent.name.split(" ").map(part => part[0]).join("").slice(0,3))}</span><h3>${escapeHtml(agent.name)}</h3><p>${escapeHtml(agent.detail)}</p><b>${escapeHtml(agent.status)}</b></article>`).join("");
}


function renderAmazon(){ if(!state.amazon)return; const configured=state.amazon.configured; $("#amazonStatus").textContent=configured?"Connected configuration detected":"Not connected"; $("#amazonStatus").className=configured?"connection-ok":"connection-off"; $("#amazonMode").textContent=`${state.amazon.mode.toUpperCase()} MODE`; $("#amazonMarketplace").textContent=state.amazon.marketplaceId||"ARBP9OOSHTCHU"; $("#amazonCredentials").textContent=configured?`Seller ${state.amazon.sellerIdMasked||"configured"}`:"Missing on server"; }

function renderSecurity(){
  const security=state.security; if(!security)return;
  const c=security.controls||{};
  $("#securityScore") && ($("#securityScore").textContent=`${security.score||0}%`);
  $("#securityReadiness") && ($("#securityReadiness").textContent=security.safeToConnect?"Ready for controlled connection":"Not ready for live connection");
  $("#emergencyState") && ($("#emergencyState").textContent=c.emergencyLock?"LOCKED":"UNLOCKED");
  $("#emergencyState") && ($("#emergencyState").className=c.emergencyLock?"connection-off":"connection-ok");
  const controls=[
    ["Authentication required",c.authRequired],["API key configured",c.apiKeyConfigured],["HTTPS enforced",c.forceHttps],["CORS restricted",c.corsRestricted],["Secret encryption key",c.encryptionKeyConfigured],["Simulation mode",c.simulationMode],["Secrets hidden from browser",!c.secretsExposedToBrowser],["Audit logging",c.auditEnabled],["Two-person publishing",c.twoPersonPublish],["Emergency lock",c.emergencyLock]
  ];
  const list=$("#securityControls"); if(list) list.innerHTML=controls.map(([name,ok])=>`<div class="stack-item"><div class="left"><span class="status-dot ${ok?"success":"warning"}"></span><div><strong>${escapeHtml(name)}</strong><small>${ok?"Enabled":"Action required before production"}</small></div></div><b>${ok?"PASS":"SETUP"}</b></div>`).join("");
  $("#securityChanged") && ($("#securityChanged").textContent=`Last change: ${shortDate(security.changedAt)} by ${security.changedBy||"system"}`);
}
function draftIssues(d){return d.validation?.issues||[]}
function workflowHtml(d){const steps=[["Command",true],["Draft",true],["Validate",["validated","approved","published"].includes(d.status)],["Approve",["approved","published"].includes(d.status)],["Publish",d.status==="published"]];return `<div class="workflow-track">${steps.map(([n,ok],i)=>`<span class="${ok?"done":""}"><i>${ok?"✓":i+1}</i>${n}</span>`).join("")}</div>`}
function renderDrafts(){ const drafts=state.drafts||[]; if($("#draftCount"))$("#draftCount").textContent=`${drafts.length} draft${drafts.length===1?"":"s"}`; if(!$("#draftList"))return; $("#draftList").innerHTML=drafts.length?drafts.map(d=>`<article class="draft-card"><div class="draft-top"><div><span class="eyebrow">${escapeHtml(d.productType)} • ${escapeHtml(d.fulfillment||"MFN")}</span><h3>${escapeHtml(d.parentSku)}</h3></div><span class="draft-status ${escapeHtml(d.status)}">${escapeHtml(d.status)}</span></div><p>${escapeHtml(d.parent?.title||d.command)}</p>${workflowHtml(d)}<div class="draft-meta"><span>${d.colors?.length||0} colors</span><span>${d.sizes?.length||0} sizes</span><span>${d.children?.length||0} children</span><span>EGP ${Number(d.price||0).toLocaleString()}</span><span>${escapeHtml(d.origin||"Egypt")}</span></div>${draftIssues(d).length?`<div class="draft-warning">${draftIssues(d).length} validation note(s)</div>`:""}<div class="action-row"><button class="tiny-btn" data-draft-view="${d.id}">Review</button><button class="tiny-btn" data-draft-validate="${d.id}" ${d.status==="published"?"disabled":""}>Validate</button><button class="tiny-btn approve" data-draft-approve="${d.id}" ${d.status!=="validated"?"disabled":""}>Approve</button><button class="tiny-btn publish" data-draft-publish="${d.id}" ${d.status!=="approved"?"disabled":""}>Publish</button></div></article>`).join(""):empty("No product drafts yet. Write a command to create the first one."); }
async function createDraft(){ const command=$("#productCommand").value.trim(); if(!command)return showToast("Write a product command first.",true); try{const draft=await api("/api/product-drafts/from-command",{method:"POST",body:JSON.stringify({command})}); state.drafts.unshift(draft); renderDrafts(); showToast(`${draft.children.length} child variations generated.`);}catch(error){showToast(error.message,true)} }
async function validateDraftAction(id){try{showToast("Running local and Amazon preview validation…"); await api(`/api/product-drafts/${id}/validate`,{method:"POST",body:"{}"}); await loadAll(); showToast("Draft validation completed.");}catch(error){showToast(error.message,true)} }
async function approveDraftAction(id){try{await api(`/api/product-drafts/${id}/approve`,{method:"POST",body:JSON.stringify({approvedBy:"Shady"})}); await loadAll(); showToast("Product draft approved for publishing.");}catch(error){showToast(error.message,true)} }
async function publishDraftAction(id){ const draft=state.drafts.find(d=>d.id===id); openModal(`<span class="eyebrow">FINAL AMAZON WRITE</span><h2>${escapeHtml(draft?.parentSku||"Product")}</h2><p>This action sends ${Number(draft?.children?.length||0)+1} listing payloads to Amazon. It is available only in live mode.</p><button class="primary" id="confirmPublish" data-confirm-publish="${id}">Confirm and publish</button>`); }
function showDraft(id){const d=state.drafts.find(x=>x.id===id); if(!d)return; openModal(`<span class="eyebrow">PRODUCT DRAFT</span><h2>${escapeHtml(d.parentSku)}</h2><p>${escapeHtml(d.command)}</p><pre>${escapeHtml(JSON.stringify({status:d.status,productType:d.productType,colors:d.colors,sizes:d.sizes,price:d.price,fulfillment:d.fulfillment,validation:d.validation,amazonPreview:d.amazonPreview},null,2))}</pre><h3>Generated variations</h3>${(d.children||[]).slice(0,30).map(c=>`<div class="stack-item"><div class="left"><div><strong>${escapeHtml(c.sku)}</strong><small>${escapeHtml(c.title)}</small></div></div><span>EGP ${escapeHtml(c.price)}</span></div>`).join("")}`);}

function renderAudit() {
  $("#auditList").innerHTML = state.activity.length ? state.activity.map(item => `
    <div class="timeline-item ${escapeHtml(item.level)}"><span class="timeline-dot"></span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.sub)}</p></div><time>${shortDate(item.createdAt)}</time></div>`).join("") : empty("No audit events yet.");
}

async function loadActivity() {
  try {
    state.activity = await api("/api/activity?limit=100");
    renderAudit();
  } catch (error) { showToast(error.message, true); }
}

async function uploadFile(file) {
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  $("#uploadProgress").classList.remove("hidden");
  $("#uploadResult").classList.add("hidden");
  try {
    const response = await api("/api/files/upload", { method: "POST", body: formData });
    const result = $("#uploadResult");
    result.className = `upload-result ${response.validation.status === "blocked" ? "error" : "success"}`;
    result.innerHTML = `<strong>${escapeHtml(response.file.originalName)}</strong><span>${response.validation.totalRows} rows • ${response.validation.issueCount} issues • ${response.proposalsCreated} approval proposal(s)</span>`;
    await loadAll();
    showToast("File processed and persisted successfully.");
  } catch (error) {
    const result = $("#uploadResult");
    result.className = "upload-result error";
    result.textContent = error.message;
    showToast(error.message, true);
  } finally {
    $("#uploadProgress").classList.add("hidden");
    $("#uploadResult").classList.remove("hidden");
    $("#fileInput").value = "";
  }
}

async function simulate(id) {
  try {
    const response = await api(`/api/approvals/${id}/simulate`, { method: "POST", body: "{}" });
    const index = state.approvals.findIndex(item => item.id === id);
    if (index >= 0) state.approvals[index] = response.proposal;
    renderOverview();
    renderApprovals();
    openModal(`
      <span class="eyebrow">SIMULATION RESULT</span><h2>${escapeHtml(response.proposal.sku)}</h2>
      <p>No Amazon write was performed. This preview is reversible and stored in the audit trail.</p>
      <pre>${escapeHtml(JSON.stringify(response.proposal.simulation, null, 2))}</pre>
      <div class="change-box"><code>${escapeHtml(response.proposal.proposedFix?.from ?? "—")}</code><span>→</span><code>${escapeHtml(response.proposal.proposedFix?.to ?? "—")}</code></div>`);
  } catch (error) { showToast(error.message, true); }
}

async function approve(id) {
  try {
    await api(`/api/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ decidedBy: "Shady" }) });
    await loadAll();
    showToast("Proposal approved and recorded.");
  } catch (error) { showToast(error.message, true); }
}

async function reject(id) {
  try {
    await api(`/api/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ decidedBy: "Shady" }) });
    await loadAll();
    showToast("Proposal rejected. No change was applied.");
  } catch (error) { showToast(error.message, true); }
}

async function showFileDetails(id) {
  try {
    const file = await api(`/api/files/${id}`);
    const issues = (file.validation.issues || []).slice(0, 50);
    openModal(`
      <span class="eyebrow">FILE EVIDENCE</span><h2>${escapeHtml(file.originalName)}</h2>
      <p>${file.validation.totalRows} rows • ${file.validation.issueCount} issues • ${escapeHtml(file.validation.status)}</p>
      <pre>Fingerprint: ${escapeHtml(file.fingerprint)}\nPrimary sheet: ${escapeHtml(file.parsed.primarySheet)}\nStored locally: yes\nOriginal modified: no</pre>
      <h3>Detected issues</h3>
      ${issues.length ? issues.map(item => `<div class="stack-item"><div class="left"><div><strong>Row ${item.rowNumber} • ${escapeHtml(item.code)}</strong><small>${escapeHtml(item.message)}</small></div></div>${riskPill(item.risk)}</div>`).join("") : empty("No issues detected.")}
    `);
  } catch (error) { showToast(error.message, true); }
}

function renderIntegrations() {
  const data = state.integrations;
  if (!data) return;
  if ($("#waStatus")) $("#waStatus").textContent = data.whatsapp.configured ? "CONFIGURED" : "NOT CONFIGURED";
  if ($("#waAllowlist")) $("#waAllowlist").textContent = data.whatsapp.senderAllowlistEnabled ? "ENABLED" : "REQUIRED";
  if ($("#n8nStatus")) $("#n8nStatus").textContent = data.n8n.configured ? "CONFIGURED" : "NOT CONFIGURED";
}

function bindEvents() {
  $("#nav").addEventListener("click", event => {
    const button = event.target.closest("[data-view]");
    if (button) navigate(button.dataset.view);
  });
  document.addEventListener("click", event => {
    const jump = event.target.closest("[data-view-jump]");
    if (jump) navigate(jump.dataset.viewJump);
    const simulateButton = event.target.closest("[data-simulate]");
    if (simulateButton) simulate(simulateButton.dataset.simulate);
    const approveButton = event.target.closest("[data-approve]");
    if (approveButton && !approveButton.disabled) approve(approveButton.dataset.approve);
    const rejectButton = event.target.closest("[data-reject]");
    if (rejectButton) reject(rejectButton.dataset.reject);
    const fileDetails = event.target.closest("[data-file-details]");
    if (fileDetails) showFileDetails(fileDetails.dataset.fileDetails);
    const demoDownload = event.target.closest("[data-demo-download]");
    if (demoDownload) showToast(`${demoDownload.dataset.demoDownload} export is demonstrated here; the connected backend will generate the real file.`);
    const dv=event.target.closest("[data-draft-view]"); if(dv)showDraft(dv.dataset.draftView);
    const dval=event.target.closest("[data-draft-validate]"); if(dval)validateDraftAction(dval.dataset.draftValidate);
    const dap=event.target.closest("[data-draft-approve]"); if(dap&&!dap.disabled)approveDraftAction(dap.dataset.draftApprove);
    const dpub=event.target.closest("[data-draft-publish]"); if(dpub&&!dpub.disabled)publishDraftAction(dpub.dataset.draftPublish);
    const conf=event.target.closest("[data-confirm-publish]"); if(conf){api(`/api/product-drafts/${conf.dataset.confirmPublish}/publish`,{method:"POST",body:JSON.stringify({confirmation:"PUBLISH"})}).then(()=>{closeModal();return loadAll()}).then(()=>showToast("Published to Amazon.")).catch(error=>showToast(error.message,true));}
  });
  $$("[data-approval-filter]").forEach(button => button.addEventListener("click", () => {
    state.approvalFilter = button.dataset.approvalFilter;
    renderApprovals();
  }));
  $("#browseButton").addEventListener("click", () => $("#fileInput").click());
  $("#heroUploadButton").addEventListener("click", () => { navigate("overview"); $("#fileInput").click(); });
  $("#filePageUploadButton").addEventListener("click", () => { navigate("overview"); $("#fileInput").click(); });
  $("#fileInput").addEventListener("change", event => uploadFile(event.target.files[0]));
  const dropzone = $("#uploadForm");
  ["dragenter", "dragover"].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.remove("dragover"); }));
  dropzone.addEventListener("drop", event => uploadFile(event.dataTransfer.files[0]));
  $("#productSearch").addEventListener("input", event => { state.productQuery = event.target.value; renderProducts(); });
  $("#orderSearch").addEventListener("input", event => { state.orderQuery = event.target.value; renderOrders(); });
  $("#approveAllButton").addEventListener("click", async () => {
    const ids = state.approvals.filter(item => item.status === "pending" && item.simulation).map(item => item.id);
    if (!ids.length) return showToast("Simulate pending approvals first.");
    try {
      const result = await api("/api/approvals/bulk/approve", { method: "POST", body: JSON.stringify({ ids, decidedBy: "Shady" }) });
      await loadAll();
      showToast(`${result.count} proposal(s) approved.`);
    } catch (error) { showToast(error.message, true); }
  });
  $("#simulateAllButton").addEventListener("click", async () => {
    const ids = state.approvals.filter(item => item.status === "pending").map(item => item.id);
    if (!ids.length) return showToast("No pending approvals to simulate.");
    try {
      await api("/api/approvals/bulk/simulate", { method: "POST", body: JSON.stringify({ ids }) });
      await loadAll();
      showToast(`${ids.length} proposal(s) simulated.`);
    } catch (error) { showToast(error.message, true); }
  });
  $("#refreshAudit").addEventListener("click", loadActivity);
  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", event => { if (event.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModal();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#productSearch").focus();
      navigate("products");
    }
  });

  $("#generateDraft")?.addEventListener("click",createDraft);
  $("#commandExample")?.addEventListener("click",()=>{$("#productCommand").value="Create SKU CK1 men's shoes, colors Black Grey White, sizes from 41 to 45, price 499 EGP, origin Egypt, FBA";});
  $("#testAmazon")?.addEventListener("click",async()=>{try{const r=await api("/api/amazon/test",{method:"POST",body:"{}"});showToast(r.ok?"Amazon connection verified.":(r.message||"Connection test completed."),!r.ok);await loadAll();}catch(error){showToast(error.message,true)}});
  $("#commandButton").addEventListener("click", () => { navigate("products"); setTimeout(() => $("#productSearch").focus(), 50); });
}

$("#todayLabel").textContent = new Intl.DateTimeFormat("en-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
bindEvents();
navigate(document.body.dataset.page || "overview");
$("#enableEmergencyLock")?.addEventListener("click",async()=>{try{await api("/api/security/emergency-lock",{method:"POST",body:JSON.stringify({locked:true,reason:"Manual safety lock from Security Center"})});await loadAll();showToast("Amazon publishing is locked.");}catch(error){showToast(error.message,true)}});
$("#releaseEmergencyLock")?.addEventListener("click",async()=>{try{const confirmation=prompt('Type UNLOCK to release the emergency lock. Simulation mode should remain enabled.');if(confirmation!=="UNLOCK")return;await api("/api/security/emergency-lock",{method:"POST",body:JSON.stringify({locked:false,reason:"Released by project owner after review"})});await loadAll();showToast("Emergency lock released. Live mode remains separately controlled.");}catch(error){showToast(error.message,true)}});

loadAll().catch(error => showToast(error.message, true));

$("#closeDrawer")?.addEventListener("click", () => { $("#productDrawer").classList.remove("open"); $("#productDrawer").setAttribute("aria-hidden","true"); });
function downloadText(filename, text, type="application/json") {
  const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function mountDemoTools(){
  if(document.getElementById("demoTools"))return;
  const box=document.createElement("div"); box.id="demoTools"; box.className="demo-tools";
  box.innerHTML=`<button data-demo-tour title="How the demo works">?</button><button data-demo-export title="Export demo data">⇩</button><button data-demo-reset title="Reset demo">↺</button>`;
  document.body.appendChild(box);
  box.addEventListener("click",e=>{
    if(e.target.closest("[data-demo-tour]")) openModal(`<span class="eyebrow">GUIDED DEMO</span><h2>How to test AEC</h2><div class="tour-steps"><div><b>1</b><span>Open Command Center and create a product.</span></div><div><b>2</b><span>Validate the generated Parent and Children.</span></div><div><b>3</b><span>Approve the draft after reviewing warnings.</span></div><div><b>4</b><span>Publish remains blocked because this is a safe demo.</span></div><div><b>5</b><span>Try File Center, Approvals, WhatsApp and n8n pages.</span></div></div>`);
    if(e.target.closest("[data-demo-export]")) downloadText(`AEC-demo-backup-${Date.now()}.json`,JSON.stringify(loadDemoStore(),null,2));
    if(e.target.closest("[data-demo-reset]")){ if(confirm("Reset all demo changes?")){localStorage.removeItem(DEMO_STORAGE_KEY);location.reload();}}
  });
}

