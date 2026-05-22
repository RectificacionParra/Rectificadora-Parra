const STORAGE_KEY = "recticontrol_v3_pro";
const SESSION_KEY = "recticontrol_session_v1";
const STATES = ["Ingresado", "En proceso", "Terminado", "Cancelado", "Entregado"];
const PRIORITIES = ["Normal", "Urgente", "Muy urgente"];
const CLOUD_REFRESH_MS = 20000;

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();
// ID corto para evitar problemas con Supabase
const generateId = () => Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000); 

const money = (value) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(
    Number(value || 0)
  );

const DEFAULT_SERVICE_CATALOG = {
  presupuesto_tapa: [
    { name: "Lavado Potasa", amount: 0 },
    { name: "Servicio de Tapa", amount: 0 },
    { name: "Prueba Hidraulica", amount: 0 },
    { name: "Embujado", amount: 0 },
    { name: "Plano De Tapa", amount: 0 },
    { name: "Plano De Tapa Trasero", amount: 0 },
    { name: "Plano de Tapa Lateral", amount: 0 },
    { name: "Arbol de leva", amount: 0 },
    { name: "Botadores", amount: 0 },
    { name: "Valvulas De Escape", amount: 0 },
    { name: "Valvulas De Admision", amount: 0 },
  ],
  presupuesto_motor: [
    { name: "Lavado Bloque", amount: 0 },
    { name: "Alesado de Cilindros", amount: 0 },
    { name: "Plano de Bloque", amount: 0 },
    { name: "Alesado de Bancadas", amount: 0 },
    { name: "Rectificar Cigueñal", amount: 0 },
    { name: "Embuquetar Arbol de Levas", amount: 0 },
  ],
  presupuesto: [],
  repuesto: [],
};

// Variables globales del sistema
let el = {};
let data = { employees: [], clients: [], jobs: [], quotes: [], history: [], serviceCatalog: { ...DEFAULT_SERVICE_CATALOG }, counters: { motor: 0, tapa: 0, repuesto: 0, presupuesto: 0 } };
let currentUser = null;
const cloud = { client: null, enabled: false };
let toastTimer = null;
let lastLocalStatusMutationAt = 0;

// --- INICIALIZACIÓN SUPER SEGURA ---
window.addEventListener("DOMContentLoaded", () => {
  el = {
    loginScreen: document.getElementById("loginScreen"),
    appShell: document.getElementById("appShell"),
    loginForm: document.getElementById("loginForm"),
    loginUser: document.getElementById("loginUser"),
    loginPassword: document.getElementById("loginPassword"),
    loginError: document.getElementById("loginError"),
    loggedAs: document.getElementById("loggedAs"),
    logoutBtn: document.getElementById("logoutBtn"),
    exportDataBtn: document.getElementById("exportDataBtn"),
    importDataInput: document.getElementById("importDataInput"),
    syncBadge: document.getElementById("syncBadge"),
    countMotorsInProcess: document.getElementById("countMotorsInProcess"),
    countHeadsInProcess: document.getElementById("countHeadsInProcess"),
    countDoneToday: document.getElementById("countDoneToday"),
    btnNewMotor: document.getElementById("btnNewMotor"),
    btnNewHead: document.getElementById("btnNewHead"),
    btnNewPart: document.getElementById("btnNewPart"),
    btnNewQuoteHead: document.getElementById("btnNewQuoteHead"),
    btnNewQuoteMotor: document.getElementById("btnNewQuoteMotor"),
    btnNewQuote: document.getElementById("btnNewQuote"),
    searchWrap: document.getElementById("searchWrap"),
    searchInput: document.getElementById("searchInput"),
    mainView: document.getElementById("mainView"),
    tabButtons: [...document.querySelectorAll(".tab-btn")],
    toast: document.getElementById("toast"),
    jobDialog: document.getElementById("jobDialog"),
    jobForm: document.getElementById("jobForm"),
    jobId: document.getElementById("jobId"),
    jobType: document.getElementById("jobType"),
    jobVehicle: document.getElementById("jobVehicle"),
    jobClient: document.getElementById("jobClient"),
    jobPriority: document.getElementById("jobPriority"),
    jobAssignedEmployee: document.getElementById("jobAssignedEmployee"),
    jobStatus: document.getElementById("jobStatus"),
    jobInDate: document.getElementById("jobInDate"),
    jobPromisedDate: document.getElementById("jobPromisedDate"),
    jobObservations: document.getElementById("jobObservations"),
    jobOutDate: document.getElementById("jobOutDate"),
    clientDialog: document.getElementById("clientDialog"),
    clientForm: document.getElementById("clientForm"),
    clientId: document.getElementById("clientId"),
    clientName: document.getElementById("clientName"),
    clientPhone: document.getElementById("clientPhone"),
    clientEmail: document.getElementById("clientEmail"),
    clientAddress: document.getElementById("clientAddress"),
    employeeDialog: document.getElementById("employeeDialog"),
    employeeForm: document.getElementById("employeeForm"),
    employeeId: document.getElementById("employeeId"),
    employeeName: document.getElementById("employeeName"),
    employeeUsername: document.getElementById("employeeUsername"),
    employeePassword: document.getElementById("employeePassword"),
    quoteDialog: document.getElementById("quoteDialog"),
    quoteForm: document.getElementById("quoteForm"),
    quoteId: document.getElementById("quoteId"),
    quoteClient: document.getElementById("quoteClient"),
    quoteType: document.getElementById("quoteType"),
    quoteDescription: document.getElementById("quoteDescription"),
    quoteCatalogSection: document.getElementById("quoteCatalogSection"),
    quoteCatalogTitle: document.getElementById("quoteCatalogTitle"),
    quoteCatalogList: document.getElementById("quoteCatalogList"),
    btnAddCatalogService: document.getElementById("btnAddCatalogService"),
    quoteItems: document.getElementById("quoteItems"),
    quoteTotal: document.getElementById("quoteTotal"),
    quoteDate: document.getElementById("quoteDate"),
  };

  data = loadData();
  initCloud();
  if (!cloud.enabled) seedDemoData();
  bindEvents();
  restoreSession();
});

// Agregados 'if' para evitar el error de "Cannot read properties of null"
function bindEvents() {
  if (el.loginForm) el.loginForm.addEventListener("submit", onLogin);
  if (el.logoutBtn) el.logoutBtn.addEventListener("click", onLogout);
  if (el.searchInput) el.searchInput.addEventListener("input", renderActiveTab);
  if (el.exportDataBtn) el.exportDataBtn.addEventListener("click", exportData);
  if (el.importDataInput) el.importDataInput.addEventListener("change", importData);

  if (el.btnNewMotor) el.btnNewMotor.addEventListener("click", () => openJobDialog({ type: "motor" }));
  if (el.btnNewHead) el.btnNewHead.addEventListener("click", () => openJobDialog({ type: "tapa" }));
  if (el.btnNewPart) el.btnNewPart.addEventListener("click", () => openQuoteDialog({ type: "repuesto" }));
  if (el.btnNewQuoteHead) el.btnNewQuoteHead.addEventListener("click", () => openQuoteDialog({ type: "presupuesto_tapa" }));
  if (el.btnNewQuoteMotor) el.btnNewQuoteMotor.addEventListener("click", () => openQuoteDialog({ type: "presupuesto_motor" }));
  if (el.btnNewQuote) el.btnNewQuote.addEventListener("click", () => openQuoteDialog({ type: "presupuesto" }));

  if (el.jobForm) el.jobForm.addEventListener("submit", onSaveJob);
  if (el.clientForm) el.clientForm.addEventListener("submit", onSaveClient);
  if (el.employeeForm) el.employeeForm.addEventListener("submit", onSaveEmployee);
  if (el.quoteForm) el.quoteForm.addEventListener("submit", onSaveQuote);

  if (el.quoteType) el.quoteType.addEventListener("change", onQuoteTypeChange);
  if (el.btnAddCatalogService) el.btnAddCatalogService.addEventListener("click", onAddCatalogService);

  if (el.tabButtons && el.tabButtons.length > 0) {
    el.tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        el.tabButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderActiveTab();
      });
    });
  }

  document.querySelectorAll("button[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dialogId = btn.getAttribute("data-close");
      const dialog = document.getElementById(dialogId);
      if (dialog) dialog.close();
    });
  });
}

function initCloud() {
  const url = window.SUPABASE_URL || (window.__SUPABASE_CONFIG && window.__SUPABASE_CONFIG.url);
  const anonKey = window.SUPABASE_KEY || (window.__SUPABASE_CONFIG && window.__SUPABASE_CONFIG.anonKey);

  if (!url || !anonKey || !window.supabase) {
    setSyncBadge(false, "Local");
    return;
  }
  cloud.client = window.supabase.createClient(url, anonKey);
  cloud.enabled = true;
  setSyncBadge(true, "Nube");
}

function setSyncBadge(isOnline, text) {
  if (!el.syncBadge) return;
  el.syncBadge.textContent = text;
  el.syncBadge.classList.toggle("online", isOnline);
  el.syncBadge.classList.toggle("offline", !isOnline);
}

async function pullCloudDataAndRender(options = {}) {
  if (!cloud.enabled || !cloud.client) return;
  const previousStatuses = new Map((data.jobs || []).map((j) => [j.id, j.status]));
  try {
    const [employeesRes, clientsRes, jobsRes, quotesRes, historyRes, settingsRes] = await Promise.all([
      cloud.client.from("employees").select("*"),
      cloud.client.from("clients").select("*"),
      cloud.client.from("jobs").select("*"),
      cloud.client.from("quotes").select("*"),
      cloud.client.from("history").select("*"),
      cloud.client.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (employeesRes.error || clientsRes.error || jobsRes.error || quotesRes.error || historyRes.error) {
      throw new Error("Error de lectura nube");
    }
    data.employees = (employeesRes.data || []).map(fromCloudEmployee);
    data.clients = (clientsRes.data || []).map(fromCloudClient);
    data.jobs = (jobsRes.data || []).map(fromCloudJob);
    data.quotes = (quotesRes.data || []).map(fromCloudQuote);
    data.history = (historyRes.data || []).map(fromCloudHistory);
    data.counters = {
      motor: Number(settingsRes.data?.counters?.motor ?? data.counters?.motor ?? 0),
      tapa: Number(settingsRes.data?.counters?.tapa ?? data.counters?.tapa ?? 0),
      repuesto: Number(settingsRes.data?.counters?.repuesto ?? data.counters?.repuesto ?? 0),
      presupuesto: Number(settingsRes.data?.counters?.presupuesto ?? data.counters?.presupuesto ?? 0),
    };
    data.serviceCatalog = normalizeServiceCatalog(settingsRes.data?.counters?.serviceCatalog || data.serviceCatalog);
    persist();
    hydrateSelects();
    renderActiveTab();
    if (options.notifyRemote && currentUser) {
      const changed = data.jobs.filter((j) => previousStatuses.has(j.id) && previousStatuses.get(j.id) !== j.status);
      const hasRecentLocalChange = Date.now() - lastLocalStatusMutationAt < 2500;
      if (changed.length && !hasRecentLocalChange) {
        const first = changed[0];
        showToast(`Estado actualizado remotamente: ${first.number} -> ${first.status}`);
      }
    }
    setSyncBadge(true, "Nube");
  } catch {
    setSyncBadge(false, "Local");
  }
}

function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      currentUser = JSON.parse(raw);
      enterApp();
      return;
    }
  } catch {}
  exitApp();
}

async function onLogin(e) {
  e.preventDefault();
  const user = el.loginUser.value.trim().toLowerCase();
  const pass = el.loginPassword.value;
  if (el.loginError) el.loginError.classList.add("hidden");

  let found = data.employees.find((x) => x.username.toLowerCase() === user && x.password === pass);
  if (!found && user === "admin" && pass === "admin123") {
    found = { id: 999, name: "Administrador", username: "admin", role: "admin" };
  }
  if (found) {
    currentUser = found;
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    enterApp();
  } else {
    if (el.loginError) {
      el.loginError.textContent = "Credenciales incorrectas o usuario inexistente.";
      el.loginError.classList.remove("hidden");
    }
  }
}

function onLogout() {
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  exitApp();
}

function enterApp() {
  if (el.loginScreen) el.loginScreen.classList.add("hidden");
  if (el.appShell) el.appShell.classList.remove("hidden");
  if (el.loggedAs) el.loggedAs.textContent = `Operario: ${currentUser.name}`;
  hydrateSelects();
  renderActiveTab();
  if (cloud.enabled) {
    pullCloudDataAndRender();
    setInterval(() => pullCloudDataAndRender({ notifyRemote: true }), CLOUD_REFRESH_MS);
  }
}

function exitApp() {
  if (el.appShell) el.appShell.classList.add("hidden");
  if (el.loginScreen) el.loginScreen.classList.remove("hidden");
  if (el.loginUser) el.loginUser.value = "";
  if (el.loginPassword) el.loginPassword.value = "";
}

// Mapeos a la nube con protección "null" para evitar rechazos de DB
function fromCloudEmployee(row) { return { id: row.id, name: row.name || "", username: row.username || "", password: row.password || "", role: row.role || "user" }; }
function fromCloudClient(row) { return { id: row.id, name: row.name || "", phone: row.phone || "", email: row.email || "", address: row.address || "" }; }
function fromCloudJob(row) {
  return {
    id: row.id, number: row.number || "", type: row.type || "motor", vehicle: row.vehicle || "",
    clientId: row.clientid || row.clientId || "", priority: row.priority || "Normal",
    assignedEmployeeId: row.assignedemployeeid || row.assignedEmployeeId || "", status: row.status || "Ingresado",
    inDate: row.indate || row.inDate || "", promisedDate: row.promiseddate || row.promisedDate || "",
    observations: row.observations || "", outDate: row.outdate || row.outDate || "",
  };
}
function fromCloudQuote(row) { return { id: row.id, number: row.number || "", clientId: row.clientid || row.clientId || "", type: row.type || "presupuesto", description: row.description || "", items: row.items || "", total: Number(row.total || 0), date: row.date || "" }; }
function fromCloudHistory(row) { return { id: row.id, jobId: row.jobid || row.jobId || "", employeeId: row.employeeid || row.employeeId || "", action: row.action || "", timestamp: row.timestamp || "" }; }

function toCloudEmployee(row) { return { id: row.id, name: row.name, username: row.username, password: row.password, role: row.role }; }
function toCloudClient(row) { return { id: row.id, name: row.name, phone: row.phone ? String(row.phone) : "", email: row.email, address: row.address }; }
function toCloudJob(row) {
  return {
    id: row.id, number: row.number, type: row.type, vehicle: row.vehicle, 
    clientid: row.clientId || null, priority: row.priority, 
    assignedemployeeid: row.assignedEmployeeId || null, status: row.status,
    indate: row.inDate || null, promiseddate: row.promisedDate || null, 
    observations: row.observations || "", outdate: row.outDate || null,
  };
}
function toCloudQuote(row) { 
  return { 
    id: row.id, number: row.number, clientid: row.clientId || null, type: row.type, 
    description: row.description, items: row.items || "", total: row.total, date: row.date || null 
  }; 
}
function toCloudHistory(row) { return { id: row.id, jobid: row.jobId, employeeid: row.employeeId, action: row.action, timestamp: row.timestamp }; }

function syncCloudSafely(fn) {
  if (!cloud.enabled) return;
  fn().catch(() => setSyncBadge(false, "Local"));
}

async function pushTableRow(collection, payload) {
  if (!cloud.enabled || !cloud.client) return;
  await cloud.client.from(collection).upsert(payload);
}

async function pushCounters() {
  if (!cloud.enabled || !cloud.client) return;
  await cloud.client.from("app_settings").upsert({ id: 1, counters: { motor: data.counters.motor, tapa: data.counters.tapa, repuesto: data.counters.repuesto, presupuesto: data.counters.presupuesto, serviceCatalog: data.serviceCatalog } });
}

function syncMutation(collection, payload) {
  persist();
  syncCloudSafely(() => syncRowToCloud(collection, payload));
}

async function syncRowToCloud(collection, payload) {
  if (collection === "employees") return pushTableRow("employees", toCloudEmployee(payload));
  if (collection === "clients") return pushTableRow("clients", toCloudClient(payload));
  if (collection === "jobs") return pushTableRow("jobs", toCloudJob(payload));
  if (collection === "quotes") return pushTableRow("quotes", toCloudQuote(payload));
  if (collection === "history") return pushTableRow("history", toCloudHistory(payload));
  return Promise.resolve();
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return {
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      serviceCatalog: normalizeServiceCatalog(parsed.serviceCatalog),
      counters: parsed.counters || { motor: 0, tapa: 0, repuesto: 0, presupuesto: 0 },
    };
  } catch {
    return defaultData();
  }
}

function defaultData() {
  return { employees: [], clients: [], jobs: [], quotes: [], history: [], serviceCatalog: { ...DEFAULT_SERVICE_CATALOG }, counters: { motor: 0, tapa: 0, repuesto: 0, presupuesto: 0 } };
}

function normalizeServiceCatalog(obj) {
  const base = { ...DEFAULT_SERVICE_CATALOG };
  if (!obj) return base;
  for (const k in base) {
    if (Array.isArray(obj[k])) base[k] = obj[k];
  }
  return base;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function seedDemoData() {
  if (data.employees.length > 0) return;
  data.employees.push({ id: 101, name: "Gómez Carlos", username: "carlos", password: "123", role: "user" });
  persist();
}

function hydrateSelects() {
  if (el.jobClient) populateSelect(el.jobClient, data.clients, (x) => `${x.name}`);
  if (el.quoteClient) populateSelect(el.quoteClient, data.clients, (x) => `${x.name}`);
  if (el.jobAssignedEmployee) populateSelect(el.jobAssignedEmployee, data.employees.filter((x) => x.role !== "admin"), (x) => x.name);
  if (el.jobStatus) {
    el.jobStatus.innerHTML = STATES.map((s) => `<option value="${s}">${s}</option>`).join("");
  }
}

function populateSelect(selectEl, list, labelFn) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">-- Seleccionar --</option>` + list.map((x) => `<option value="${x.id}">${escapeHtml(labelFn(x))}</option>`).join("");
  selectEl.value = current;
}

function renderActiveTab() {
  if (!currentUser) return;
  const activeTab = el.tabButtons.find((b) => b.classList.contains("active"))?.dataset.tab || "trabajos";
  renderCountersWidget();
  if (activeTab === "clientes") { renderClientsView(); return; }
  if (activeTab === "presupuestos") { renderQuotesView(); return; }
  renderJobsView(activeTab);
}

function renderCountersWidget() {
  if (!el.countMotorsInProcess) return;
  const motors = data.jobs.filter((j) => j.type === "motor" && (j.status === "Ingresado" || j.status === "En proceso")).length;
  const heads = data.jobs.filter((j) => j.type === "tapa" && (j.status === "Ingresado" || j.status === "En proceso")).length;
  const doneToday = data.jobs.filter((j) => j.status === "Terminado" && j.outDate === today()).length;
  el.countMotorsInProcess.textContent = motors;
  el.countHeadsInProcess.textContent = heads;
  el.countDoneToday.textContent = doneToday;
}

function renderJobsView(tab) {
  let list = [];
  if (tab === "trabajos") list = data.jobs;
  else if (tab === "en proceso") list = data.jobs.filter((j) => j.status === "Ingresado" || j.status === "En proceso");
  else if (tab === "terminados") list = data.jobs.filter((j) => j.status === "Terminado");
  else if (tab === "entregados") list = data.jobs.filter((j) => j.status === "Entregado");
  else if (tab === "historial") list = data.jobs.filter((j) => j.status === "Entregado" || j.status === "Cancelado");

  const query = getSearchText().toLowerCase();
  if (query) {
    list = list.filter((j) => {
      const c = getClient(j.clientId);
      return j.vehicle.toLowerCase().includes(query) || j.number.toLowerCase().includes(query) || (c && c.name.toLowerCase().includes(query));
    });
  }

  list.sort((a, b) => b.id - a.id);
  if (!el.mainView) return;
  el.mainView.innerHTML = `<h3>${tabTitle(tab)}</h3>`;
  if (!list.length) {
    el.mainView.innerHTML += `<p class="empty-msg">No se encontraron órdenes en esta sección.</p>`;
    return;
  }
  const grid = document.createElement("div");
  grid.className = "jobs-grid";

  list.forEach((job) => {
    const client = getClient(job.clientId);
    const emp = getEmployee(job.assignedEmployeeId);
    const card = document.createElement("article");

    let stateClass = "state-default";
    if (job.status === "Ingresado") stateClass = "state-ingresado";
    else if (job.status === "En proceso") stateClass = "state-proceso";
    else if (job.status === "Terminado") stateClass = "state-terminado";
    else if (job.status === "Entregado") stateClass = "state-entregado";

    card.className = `job-card ${stateClass} ${isLate(job) ? "job-late" : ""}`;
    card.innerHTML = `
      <div class="job-main">
        <span class="job-id">#${job.number}</span>
        <h4>${escapeHtml(job.vehicle.toUpperCase())}</h4>
        <p class="job-type-badge">${job.type === "motor" ? "⚙️ MOTOR" : "🔩 TAPA"}</p>
        <p><strong>Cliente:</strong> ${client ? escapeHtml(client.name) : "No asignado"}</p>
      </div>
      <div class="job-meta">
        <div class="status-selector-wrap">
          <label>Estado:</label>
          <select class="status-select" data-id="${job.id}">
            ${STATES.map((s) => `<option value="${s}" ${job.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="job-actions">
        <button class="btn-edit-job btn-soft" data-id="${job.id}">Editar</button>
      </div>
    `;

    card.querySelector(".status-select").addEventListener("change", (e) => updateJobStatus(job.id, e.target.value));
    card.querySelector(".btn-edit-job").addEventListener("click", () => openJobDialog(job));
    grid.appendChild(card);
  });
  el.mainView.appendChild(grid);
}

function updateJobStatus(id, newStatus) {
  const job = getJob(id);
  if (!job) return;
  job.status = newStatus;
  if (newStatus === "Entregado" || newStatus === "Cancelado") job.outDate = today();
  lastLocalStatusMutationAt = Date.now();
  syncMutation("jobs", job);
  renderActiveTab();
  showToast(`Trabajo #${job.number} -> ${newStatus}`);
}

function openJobDialog(job) {
  hydrateSelects();
  if (job && job.id) {
    if (el.jobId) el.jobId.value = job.id;
    if (el.jobType) el.jobType.value = job.type;
    if (el.jobVehicle) el.jobVehicle.value = job.vehicle;
    if (el.jobClient) el.jobClient.value = job.clientId;
    if (el.jobPriority) el.jobPriority.value = job.priority;
    if (el.jobAssignedEmployee) el.jobAssignedEmployee.value = job.assignedEmployeeId;
    if (el.jobStatus) el.jobStatus.value = job.status;
    if (el.jobInDate) el.jobInDate.value = job.inDate;
    if (el.jobPromisedDate) el.jobPromisedDate.value = job.promisedDate || "";
    if (el.jobObservations) el.jobObservations.value = job.observations;
    if (el.jobOutDate) el.jobOutDate.value = job.outDate || "";
  } else {
    if (el.jobId) el.jobId.value = "";
    if (el.jobType) el.jobType.value = job?.type || "motor";
    if (el.jobVehicle) el.jobVehicle.value = "";
    if (el.jobClient) el.jobClient.value = "";
    if (el.jobPriority) el.jobPriority.value = "Normal";
    if (el.jobAssignedEmployee) el.jobAssignedEmployee.value = "";
    if (el.jobStatus) el.jobStatus.value = "Ingresado";
    if (el.jobInDate) el.jobInDate.value = today();
    if (el.jobPromisedDate) el.jobPromisedDate.value = "";
    if (el.jobObservations) el.jobObservations.value = "";
    if (el.jobOutDate) el.jobOutDate.value = "";
  }
  if (el.jobDialog) el.jobDialog.showModal();
}

function onSaveJob(e) {
  e.preventDefault();
  const id = el.jobId.value ? Number(el.jobId.value) : generateId();
  const isNew = !el.jobId.value;
  let job = getJob(id);
  if (isNew) {
    const t = el.jobType.value;
    data.counters[t] = (data.counters[t] || 0) + 1;
    const prefix = t === "motor" ? "MOT" : "TAP";
    const numStr = String(data.counters[t]).padStart(4, "0");
    job = { id, number: `${prefix}-${numStr}` };
    data.jobs.push(job);
    syncCloudSafely(() => pushCounters());
  }
  job.type = el.jobType.value;
  job.vehicle = el.jobVehicle.value.trim();
  job.clientId = el.jobClient.value ? Number(el.jobClient.value) : "";
  job.priority = el.jobPriority.value;
  job.assignedEmployeeId = el.jobAssignedEmployee.value ? Number(el.jobAssignedEmployee.value) : "";
  job.status = el.jobStatus.value;
  job.inDate = el.jobInDate.value;
  job.promisedDate = el.jobPromisedDate.value;
  job.observations = el.jobObservations.value.trim();
  job.outDate = el.jobOutDate.value;

  syncMutation("jobs", job);
  if (el.jobDialog) el.jobDialog.close();
  renderActiveTab();
  showToast("Orden procesada y guardada.");
}

function renderClientsView() {
  if (!el.mainView) return;
  el.mainView.innerHTML = `<div class="view-header-row"><h3>Clientes</h3><button id="btnNewClient" class="btn-primary">+ Nuevo</button></div>`;
  document.getElementById("btnNewClient")?.addEventListener("click", () => openClientDialog());
  if (!data.clients.length) return;
  
  const wrap = document.createElement("div");
  wrap.className = "table-responsive";
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Nombre</th><th>Teléfono</th><th>Acciones</th></tr></thead>
      <tbody>
        ${data.clients.map((c) => `
          <tr>
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>${escapeHtml(c.phone || "-")}</td>
            <td><button class="btn-edit-client btn-soft" data-id="${c.id}">Editar</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll(".btn-edit-client").forEach((btn) => {
    btn.addEventListener("click", () => openClientDialog(data.clients.find(x => x.id == btn.dataset.id)));
  });
  el.mainView.appendChild(wrap);
}

function openClientDialog(c) {
  if (c) {
    if (el.clientId) el.clientId.value = c.id;
    if (el.clientName) el.clientName.value = c.name;
    if (el.clientPhone) el.clientPhone.value = c.phone;
    if (el.clientAddress) el.clientAddress.value = c.address || "";
  } else {
    if (el.clientId) el.clientId.value = "";
    if (el.clientName) el.clientName.value = "";
    if (el.clientPhone) el.clientPhone.value = "";
    if (el.clientAddress) el.clientAddress.value = "";
  }
  if (el.clientDialog) el.clientDialog.showModal();
}

function onSaveClient(e) {
  e.preventDefault();
  const id = el.clientId.value ? Number(el.clientId.value) : generateId();
  const isNew = !el.clientId.value;
  let c = data.clients.find((x) => x.id === id);
  if (isNew) { c = { id }; data.clients.push(c); }
  c.name = el.clientName.value.trim();
  c.phone = el.clientPhone.value.trim();
  c.address = el.clientAddress.value.trim();

  syncMutation("clients", c);
  if (el.clientDialog) el.clientDialog.close();
  renderClientsView();
  showToast("Cliente guardado.");
}

function renderQuotesView() {
  if (!el.mainView) return;
  el.mainView.innerHTML = `<h3>Presupuestos y Comprobantes</h3>`;
  if (!data.quotes.length) {
    el.mainView.innerHTML += `<p class="empty-msg">No hay presupuestos creados.</p>`;
    return;
  }
  const grid = document.createElement("div");
  grid.className = "jobs-grid";
  data.quotes.forEach((q) => {
    const c = getClient(q.clientId);
    const card = document.createElement("article");
    card.className = "job-card quote-card-item";
    
    card.innerHTML = `
      <div class="job-main">
        <span class="job-id">#${q.number}</span>
        <h4>${escapeHtml(q.description.toUpperCase())}</h4>
        <p class="job-type-badge quote-label">${String(q.type).replace("_", " ").toUpperCase()}</p>
        <p><strong>Cliente:</strong> ${c ? escapeHtml(c.name) : "Desconocido"}</p>
        <p><strong>Total:</strong> <strong style="color:var(--green); font-size:1.1rem;">${money(q.total)}</strong></p>
      </div>
      <div class="job-meta"><p><small>Fecha: ${q.date}</small></p></div>
      <div class="job-actions" style="display: flex; gap: 5px; flex-wrap: wrap;">
        <button class="btn-download-pdf btn-soft" data-id="${q.id}">📄 PDF</button>
        <button class="btn-wa-pdf" style="background:#25D366; color:white; border:none; padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer;" data-id="${q.id}">💬 Enviar WA</button>
        <button class="btn-edit-quote btn-soft" data-id="${q.id}">Editar</button>
      </div>
    `;
    card.querySelector(".btn-edit-quote").addEventListener("click", () => openQuoteDialog(q));
    card.querySelector(".btn-download-pdf").addEventListener("click", () => generatePDF(q));
    card.querySelector(".btn-wa-pdf").addEventListener("click", () => sendWhatsAppQuote(q));
    grid.appendChild(card);
  });
  el.mainView.appendChild(grid);
}

function sendWhatsAppQuote(q) {
  const client = getClient(q.clientId);
  if (!client || !client.phone) {
    alert("Para enviar por WhatsApp, el cliente debe tener un teléfono cargado.");
    return;
  }
  let cleanPhone = String(client.phone).replace(/\D+/g, "");
  if (!cleanPhone.startsWith("54")) cleanPhone = "54" + cleanPhone;

  const msg = `Hola ${client.name}, te escribimos de *Rectificación Parra*.\n\nTe envío el detalle de tu presupuesto (#${q.number}) por el trabajo de ${q.description}.\n\n*Total estimado:* ${money(q.total)}\n\n(Te adjunto el comprobante en formato PDF aquí abajo 👇)`;
  const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;

  generatePDF(q);
  setTimeout(() => { window.open(url, "_blank"); }, 600);
}

function openQuoteDialog(q) {
  hydrateSelects();
  if (q && q.id) {
    if (el.quoteId) el.quoteId.value = q.id;
    if (el.quoteClient) el.quoteClient.value = q.clientId;
    if (el.quoteType) el.quoteType.value = q.type;
    if (el.quoteDescription) el.quoteDescription.value = q.description;
    if (el.quoteItems) el.quoteItems.value = q.items;
    if (el.quoteTotal) el.quoteTotal.value = q.total;
    if (el.quoteDate) el.quoteDate.value = q.date;
  } else {
    if (el.quoteId) el.quoteId.value = "";
    if (el.quoteClient) el.quoteClient.value = "";
    if (el.quoteType) el.quoteType.value = q?.type || "presupuesto";
    if (el.quoteDescription) el.quoteDescription.value = "";
    if (el.quoteItems) el.quoteItems.value = "";
    if (el.quoteTotal) el.quoteTotal.value = 0;
    if (el.quoteDate) el.quoteDate.value = today();
  }
  onQuoteTypeChange();
  if (el.quoteDialog) el.quoteDialog.showModal();
}

function onQuoteTypeChange() {
  if (!el.quoteType) return;
  const t = el.quoteType.value;
  if (t === "presupuesto_tapa" || t === "presupuesto_motor") {
    if (el.quoteCatalogSection) el.quoteCatalogSection.classList.remove("hidden");
    if (el.quoteCatalogTitle) el.quoteCatalogTitle.textContent = t === "presupuesto_tapa" ? "Servicios Tapa de Cilindros" : "Servicios Motor Bloque";
    renderCatalogList(t);
  } else {
    if (el.quoteCatalogSection) el.quoteCatalogSection.classList.add("hidden");
  }
}

function renderCatalogList(type) {
  const defaults = data.serviceCatalog[type] || [];
  let currentItems = [];
  try { currentItems = JSON.parse(el.quoteItems.value || "[]"); } catch {}
  if (!el.quoteCatalogList) return;
  el.quoteCatalogList.innerHTML = defaults.map((def) => {
    const match = currentItems.find((i) => i.name === def.name);
    const checked = !!match;
    const p = match ? match.amount : def.amount;
    return `
      <div class="catalog-row">
        <label class="catalog-label">
          <input type="checkbox" class="catalog-check" data-name="${escapeHtml(def.name)}" ${checked ? "checked" : ""}> 
          <span>${escapeHtml(def.name)}</span>
        </label>
        <div class="catalog-price-wrap">
          <span class="currency-symbol">$</span>
          <input type="number" class="catalog-price-input" data-name="${escapeHtml(def.name)}" value="${p}" min="0" ${!checked ? "disabled" : ""}>
        </div>
      </div>
    `;
  }).join("");
  
  el.quoteCatalogList.querySelectorAll(".catalog-check").forEach((chk) => {
    chk.addEventListener("change", () => {
      const pInput = el.quoteCatalogList.querySelector(`.catalog-price-input[data-name="${chk.dataset.name}"]`);
      if (pInput) pInput.disabled = !chk.checked;
      syncQuoteItemsFromCatalog();
    });
  });
  el.quoteCatalogList.querySelectorAll(".catalog-price-input").forEach((inp) => {
    inp.addEventListener("input", syncQuoteItemsFromCatalog);
  });
}

function onAddCatalogService() {
  const n = prompt("Nombre del servicio personalizado:");
  if (!n) return;
  const t = el.quoteType.value;
  data.serviceCatalog[t].push({ name: n, amount: 0 });
  persist();
  syncCloudSafely(() => pushCounters());
  renderCatalogList(t);
}

function syncQuoteItemsFromCatalog() {
  const arr = [];
  let sum = 0;
  if (!el.quoteCatalogList) return;
  el.quoteCatalogList.querySelectorAll(".catalog-row").forEach((row) => {
    const chk = row.querySelector(".catalog-check");
    const inp = row.querySelector(".catalog-price-input");
    if (chk && chk.checked) {
      const amount = Number(inp.value || 0);
      arr.push({ name: chk.dataset.name, amount });
      sum += amount;
    }
  });
  if (el.quoteItems) el.quoteItems.value = JSON.stringify(arr);
  if (el.quoteTotal) el.quoteTotal.value = sum.toFixed(2);
}

function onSaveQuote(e) {
  e.preventDefault();
  const id = el.quoteId.value ? Number(el.quoteId.value) : generateId();
  const isNew = !el.quoteId.value;
  let q = data.quotes.find((x) => x.id === id);
  if (isNew) {
    const t = el.quoteType.value.startsWith("presupuesto") ? "presupuesto" : "repuesto";
    data.counters[t] = (data.counters[t] || 0) + 1;
    const pfx = t === "presupuesto" ? "PRE" : "REP";
    q = { id, number: `${pfx}-${String(data.counters[t]).padStart(4, "0")}` };
    data.quotes.push(q);
    syncCloudSafely(() => pushCounters());
  }
  q.clientId = el.quoteClient.value ? Number(el.quoteClient.value) : "";
  q.type = el.quoteType.value;
  q.description = el.quoteDescription.value.trim();
  q.items = el.quoteItems.value;
  q.total = Number(el.quoteTotal.value || 0);
  q.date = el.quoteDate.value;

  syncMutation("quotes", q);
  if (el.quoteDialog) el.quoteDialog.close();
  renderQuotesView();
  showToast("Comprobante guardado.");
}

function generatePDF(q) {
  if (!window.jspdf) { showToast("Error al generar PDF"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const client = getClient(q.clientId);

  doc.setFillColor(31, 63, 120);
  doc.rect(0, 0, 210, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(22);
  doc.text("RECTIFICACIÓN PARRA", 15, 25);

  doc.setFontSize(10);
  doc.setFont("Helvetica", "normal");
  doc.text("Motores y Tapas de Cilindros", 15, 32);

  doc.text(`COMPROBANTE #${q.number}`, 150, 20);
  doc.text(`Fecha: ${q.date}`, 150, 28);

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(12);
  doc.setFont("Helvetica", "bold");
  doc.text("DATOS DEL CLIENTE", 15, 55);
  doc.line(15, 57, 195, 57);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Cliente: ${client ? client.name : "Asignación libre"}`, 15, 64);
  doc.text(`Teléfono: ${client ? client.phone || "-" : "-"}`, 15, 71);
  doc.text(`Detalle principal: ${q.description}`, 15, 78);

  doc.setFont("Helvetica", "bold");
  doc.text("DETALLE DE TRABAJOS Y MATERIALES", 15, 100);
  doc.line(15, 102, 195, 102);

  let y = 110;
  doc.setFont("Helvetica", "normal");

  try {
    const list = JSON.parse(q.items || "[]");
    if (Array.isArray(list) && list.length > 0) {
      list.forEach((item) => {
        doc.text(item.name, 15, y);
        doc.text(money(item.amount), 160, y, { align: "right" });
        y += 8;
      });
    } else {
      doc.text(q.items || "Sin especificación de ítems.", 15, y);
      y += 12;
    }
  } catch (e) {
    doc.text(q.items || "Sin especificación de ítems.", 15, y);
    y += 12;
  }

  y += 5;
  doc.line(15, y, 195, y);
  y += 10;
  doc.setFontSize(14);
  doc.setFont("Helvetica", "bold");
  doc.text("TOTAL NETO A PAGAR:", 15, y);
  doc.setTextColor(31, 63, 120);
  doc.text(money(q.total), 195, y, { align: "right" });

  doc.save(`Comprobante_Parra_${q.number}.pdf`);
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_${today()}.json`;
  a.click();
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (parsed.jobs) {
        data = parsed;
        persist();
        renderActiveTab();
      }
    } catch { alert("Archivo inválido."); }
  };
  reader.readAsText(file);
}

function showToast(m) {
  if (!el.toast) return;
  el.toast.textContent = m;
  el.toast.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast?.classList.add("hidden"), 3800);
}

function onSaveEmployee(e) { e.preventDefault(); }
function getClient(id) { return data.clients.find((c) => c.id === Number(id)); }
function getEmployee(id) { return data.employees.find((e) => e.id === Number(id)); }
function getJob(id) { return data.jobs.find((j) => j.id === Number(id)); }
function getQuote(id) { return data.quotes.find((q) => q.id === Number(id)); }

function tabTitle(tab) {
  if (tab === "presupuestos") return "Presupuestos de clientes";
  return "Trabajos";
}

function isLate(job) {
  if (!job.promisedDate) return false;
  return job.status !== "Terminado" && job.status !== "Entregado" && job.status !== "Cancelado" && job.promisedDate < today();
}

function getSearchText() { return el.searchInput ? el.searchInput.value.trim() : ""; }
function escapeHtml(raw) { return String(raw || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
