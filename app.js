const STORAGE_KEY = "recticontrol_v3_pro";
const SESSION_KEY = "recticontrol_session_v1";
const STATES = ["Ingresado", "En proceso", "Terminado", "Cancelado", "Entregado"];
const CLOUD_REFRESH_MS = 20000;

// Variables globales
let data = { jobs: [], clients: [], employees: [], quotes: [], history: [], counters: { motor: 0, tapa: 0, repuesto: 0, presupuesto: 0 } };
let currentUser = null;
const cloud = { client: null, enabled: false };
let toastTimer = null;
let lastLocalStatusMutationAt = 0;

// Elementos DOM (Se mapean al iniciar)
let el = {};

// --- INICIALIZACIÓN ---
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
    quoteDate: document.getElementById("quoteDate")
  };

  data = loadData();
  initCloud();
  bindEvents();
  restoreSession();
});

// --- FUNCIONES CORE ---
function bindEvents() {
  if (el.loginForm) el.loginForm.addEventListener("submit", onLogin);
  if (el.logoutBtn) el.logoutBtn.addEventListener("click", onLogout);
  if (el.searchInput) el.searchInput.addEventListener("input", renderActiveTab);
  if (el.btnNewMotor) el.btnNewMotor.addEventListener("click", () => openJobDialog({ type: "motor" }));
  if (el.btnNewHead) el.btnNewHead.addEventListener("click", () => openJobDialog({ type: "tapa" }));
  if (el.btnNewPart) el.btnNewPart.addEventListener("click", () => openQuoteDialog({ type: "repuesto" }));
  
  el.tabButtons.forEach(b => b.addEventListener("click", () => {
    el.tabButtons.forEach(btn => btn.classList.remove("active"));
    b.classList.add("active");
    renderActiveTab();
  }));
}

function initCloud() {
  const cfg = window.__SUPABASE_CONFIG || {};
  if (cfg.url && cfg.anonKey && window.supabase) {
    cloud.client = window.supabase.createClient(cfg.url, cfg.anonKey);
    cloud.enabled = true;
    setSyncBadge(true, "Nube");
  } else {
    setSyncBadge(false, "Local");
  }
}

function setSyncBadge(online, text) {
  if (!el.syncBadge) return;
  el.syncBadge.textContent = text;
  el.syncBadge.classList.toggle("online", online);
  el.syncBadge.classList.toggle("offline", !online);
}

function restoreSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) {
    currentUser = JSON.parse(raw);
    enterApp();
  } else {
    exitApp();
  }
}

async function onLogin(e) {
  e.preventDefault();
  const user = el.loginUser.value.trim().toLowerCase();
  const pass = el.loginPassword.value;
  
  // Login Admin de respaldo
  if (user === "admin" && pass === "admin123") {
    currentUser = { id: 9999, name: "Administrador", username: "admin" };
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    enterApp();
    return;
  }
  
  if (cloud.enabled) {
    const { data: emp } = await cloud.client.from("employees").select("*").eq("username", user).eq("password", pass).maybeSingle();
    if (emp) {
      currentUser = emp;
      localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
      enterApp();
      return;
    }
  }
  alert("Credenciales incorrectas.");
}

function enterApp() {
  el.loginScreen.classList.add("hidden");
  el.appShell.classList.remove("hidden");
  if(el.loggedAs) el.loggedAs.textContent = `Operario: ${currentUser.name}`;
  renderActiveTab();
  if (cloud.enabled) {
    pullCloudDataAndRender();
    setInterval(pullCloudDataAndRender, CLOUD_REFRESH_MS);
  }
}

function exitApp() {
  el.appShell.classList.add("hidden");
  el.loginScreen.classList.remove("hidden");
}

function renderActiveTab() {
  if (!currentUser || !el.mainView) return;
  const activeTab = el.tabButtons.find(b => b.classList.contains("active"))?.dataset.tab || "trabajos";
  
  // Renderizado dinámico con colores
  let list = data.jobs;
  if(activeTab === "en proceso") list = data.jobs.filter(j => j.status === "Ingresado" || j.status === "En proceso");
  if(activeTab === "terminados") list = data.jobs.filter(j => j.status === "Terminado");
  
  el.mainView.innerHTML = `<h3>${activeTab.toUpperCase()}</h3>`;
  const grid = document.createElement("div");
  grid.className = "jobs-grid";
  
  list.forEach(job => {
    const card = document.createElement("article");
    const stateClass = job.status === "Terminado" ? "state-terminado" : job.status === "En proceso" ? "state-proceso" : "state-ingresado";
    card.className = `job-card ${stateClass}`;
    card.innerHTML = `
      <h4>${job.vehicle}</h4>
      <p>Estado: ${job.status}</p>
      <button class="btn-whatsapp" onclick="sendWhatsApp('${job.clientId}', '${job.vehicle}', '${job.status}')">💬 Avisar</button>
    `;
    grid.appendChild(card);
  });
  el.mainView.appendChild(grid);
}

function sendWhatsApp(clientId, vehicle, status) {
  const client = data.clients.find(c => c.id == clientId);
  const phone = client ? client.phone : "";
  if (!phone) { alert("Sin teléfono"); return; }
  const msg = `Hola, tu trabajo (${vehicle}) está ${status}.`;
  window.open(`https://wa.me/54${phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`);
}

// Helpers obligatorios
function loadData() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { jobs: [], clients: [], employees: [], quotes: [] }; } catch { return { jobs: [], clients: [], employees: [], quotes: [] }; } }
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
async function pullCloudDataAndRender() { /* lógica sincronización */ }
