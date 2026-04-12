const STORAGE_KEY = "recticontrol_v3_pro";
const SESSION_KEY = "recticontrol_session_v1";
const STATES = ["Ingresado", "En proceso", "Terminado", "Cancelado", "Entregado"];
const PRIORITIES = ["Normal", "Urgente", "Muy urgente"];
const CLOUD_REFRESH_MS = 20000;

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();
const money = (value) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(
    Number(value || 0)
  );

let activeTab = "trabajos";
let currentUser = null;
let toastTimer = null;
let data = loadData();
let cloudPollTimer = null;
let cloudSubscriptions = [];

const cloud = {
  enabled: false,
  client: null,
};

const el = {
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
  quoteItems: document.getElementById("quoteItems"),
  quoteLabor: document.getElementById("quoteLabor"),
  quoteParts: document.getElementById("quoteParts"),
  quoteDate: document.getElementById("quoteDate"),

  jobCardTemplate: document.getElementById("jobCardTemplate"),
};

init();

function init() {
  initCloud();
  if (!cloud.enabled) seedDemoData();
  bindEvents();
  restoreSession();
}

function bindEvents() {
  el.loginForm.addEventListener("submit", onLogin);
  el.logoutBtn.addEventListener("click", onLogout);
  el.searchInput.addEventListener("input", renderActiveTab);
  el.exportDataBtn.addEventListener("click", exportData);
  el.importDataInput.addEventListener("change", importData);

  el.btnNewMotor.addEventListener("click", () => openJobDialog({ type: "motor" }));
  el.btnNewHead.addEventListener("click", () => openJobDialog({ type: "tapa" }));
  el.btnNewPart.addEventListener("click", () => openQuoteDialog({ type: "repuesto" }));
  el.btnNewQuote.addEventListener("click", () => openQuoteDialog({ type: "presupuesto" }));

  el.jobForm.addEventListener("submit", onSaveJob);
  el.clientForm.addEventListener("submit", onSaveClient);
  el.employeeForm.addEventListener("submit", onSaveEmployee);
  el.quoteForm.addEventListener("submit", onSaveQuote);

  el.tabButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      renderActiveTab();
    })
  );

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => document.getElementById(btn.dataset.close).close());
  });
}

function initCloud() {
  const cfg = window.__SUPABASE_CONFIG || {};
  if (!cfg.url || !cfg.anonKey || !window.supabase) {
    setSyncBadge(false, "Local");
    return;
  }
  cloud.client = window.supabase.createClient(cfg.url, cfg.anonKey);
  cloud.enabled = true;
  setSyncBadge(true, "Nube");
}

function setSyncBadge(isOnline, text) {
  el.syncBadge.textContent = text;
  el.syncBadge.classList.toggle("online", isOnline);
  el.syncBadge.classList.toggle("offline", !isOnline);
}

async function pullCloudDataAndRender() {
  if (!cloud.enabled || !cloud.client) return;
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
    data.counters = settingsRes.data?.counters || data.counters || { motor: 0, tapa: 0, repuesto: 0, presupuesto: 0 };
    persist();
    hydrateSelects();
    renderActiveTab();
    setSyncBadge(true, "Nube");
  } catch {
    setSyncBadge(false, "Local");
  }
}

async function pullCloudEmployeesOnly() {
  if (!cloud.enabled || !cloud.client) return;
  const { data: employees, error } = await cloud.client.from("employees").select("*");
  if (error) throw error;
  data.employees = (employees || []).map(fromCloudEmployee);
}

function startCloudLiveSync() {
  if (!cloud.enabled || !cloud.client) return;
  stopCloudLiveSync();
  const tables = ["employees", "clients", "jobs", "quotes", "history", "app_settings"];
  tables.forEach((table) => {
    const channel = cloud.client
      .channel(`public:${table}:${uid()}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        pullCloudDataAndRender();
      })
      .subscribe();
    cloudSubscriptions.push(channel);
  });
  cloudPollTimer = setInterval(() => pullCloudDataAndRender(), CLOUD_REFRESH_MS);
}

function stopCloudLiveSync() {
  if (cloudPollTimer) clearInterval(cloudPollTimer);
  cloudPollTimer = null;
  if (cloud.client) {
    cloudSubscriptions.forEach((sub) => cloud.client.removeChannel(sub));
  }
  cloudSubscriptions = [];
}

async function pushTableRow(table, row) {
  if (!cloud.enabled || !cloud.client) return;
  const { error } = await cloud.client.from(table).upsert(row);
  if (error) throw error;
}

async function deleteTableRow(table, id) {
  if (!cloud.enabled || !cloud.client) return;
  const { error } = await cloud.client.from(table).delete().eq("id", id);
  if (error) throw error;
}

async function pushCounters() {
  if (!cloud.enabled || !cloud.client) return;
  const payload = { id: 1, counters: data.counters };
  const { error } = await cloud.client.from("app_settings").upsert(payload);
  if (error) throw error;
}

function syncCloudSafely(task) {
  if (!cloud.enabled) return;
  task()
    .then(() => setSyncBadge(true, "Nube"))
    .catch(() => setSyncBadge(false, "Local"));
}

function fromCloudEmployee(row) {
  return {
    id: row.id,
    name: row.name || "",
    username: row.username || "",
    password: row.password || "",
  };
}

function fromCloudClient(row) {
  return {
    id: row.id,
    name: row.name || "",
    phone: row.phone || "",
    email: row.email || "",
    address: row.address || "",
  };
}

function fromCloudJob(row) {
  return {
    id: row.id,
    number: row.number || "",
    type: row.type || "motor",
    vehicle: row.vehicle || "",
    clientId: row.clientid || row.clientId || "",
    priority: row.priority || "Normal",
    assignedEmployeeId: row.assignedemployeeid || row.assignedEmployeeId || "",
    status: row.status || "Ingresado",
    inDate: row.indate || row.inDate || "",
    promisedDate: row.promiseddate || row.promisedDate || "",
    outDate: row.outdate || row.outDate || "",
  };
}

function fromCloudQuote(row) {
  return {
    id: row.id,
    number: row.number || "",
    clientId: row.clientid || row.clientId || "",
    type: row.type || "presupuesto",
    description: row.description || "",
    items: row.items || "",
    labor: Number(row.labor || 0),
    parts: Number(row.parts || 0),
    total: Number(row.total || 0),
    date: row.date || "",
  };
}

function fromCloudHistory(row) {
  return {
    id: row.id,
    message: row.message || "",
    by: row.by || "",
    at: row.at || "",
  };
}

function toCloudEmployee(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    password: row.password,
  };
}

function toCloudClient(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || "",
    address: row.address || "",
  };
}

function toCloudJob(row) {
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    vehicle: row.vehicle,
    clientid: row.clientId,
    priority: row.priority,
    assignedemployeeid: row.assignedEmployeeId || "",
    status: row.status,
    indate: row.inDate || "",
    promiseddate: row.promisedDate || "",
    outdate: row.outDate || "",
  };
}

function toCloudQuote(row) {
  return {
    id: row.id,
    number: row.number,
    clientid: row.clientId,
    type: row.type,
    description: row.description,
    items: row.items || "",
    labor: Number(row.labor || 0),
    parts: Number(row.parts || 0),
    total: Number(row.total || 0),
    date: row.date || "",
  };
}

function toCloudHistory(row) {
  return {
    id: row.id,
    message: row.message,
    by: row.by,
    at: row.at,
  };
}

function syncRowToCloud(collection, payload) {
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
      counters: parsed.counters || { motor: 0, tapa: 0, repuesto: 0, presupuesto: 0 },
    };
  } catch {
    return defaultData();
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function defaultData() {
  return {
    employees: [
      { id: uid(), name: "Juan Perez", username: "juan", password: "1234" },
      { id: uid(), name: "Maria Lopez", username: "maria", password: "1234" },
      { id: uid(), name: "Admin Taller", username: "admin", password: "admin123" },
    ],
    clients: [
      { id: uid(), name: "Taller Lopez", phone: "5491122334455", email: "taller@mail.com", address: "" },
      { id: uid(), name: "Carlos Diaz", phone: "5491188899900", email: "carlos@mail.com", address: "" },
    ],
    jobs: [],
    quotes: [],
    history: [],
    counters: { motor: 0, tapa: 0, repuesto: 0, presupuesto: 0 },
  };
}

function seedDemoData() {
  if (!data.employees.length) data.employees = defaultData().employees;
  if (!data.clients.length) data.clients = defaultData().clients;
  if (data.jobs.length || data.quotes.length) return;

  const q1 = makeQuote({
    clientId: data.clients[0].id,
    type: "presupuesto",
    description: "Rectificado motor Amarok",
    items: "Juntas x1\nAros x1",
    labor: 120000,
    parts: 80000,
    date: today(),
  });
  const q2 = makeQuote({
    clientId: data.clients[1].id,
    type: "repuesto",
    description: "Bielas Toyota 1.8",
    items: "Bielas x4",
    labor: 0,
    parts: 52000,
    date: today(),
  });
  data.quotes.push(q1, q2);

  data.jobs.push(
    makeJob({
      type: "motor",
      vehicle: "Amarok 2.0",
      clientId: data.clients[0].id,
      priority: "Urgente",
      assignedEmployeeId: data.employees[0].id,
      status: "En proceso",
      inDate: today(),
      promisedDate: addDays(today(), 1),
      outDate: "",
    }),
    makeJob({
      type: "tapa",
      vehicle: "Hilux 3.0",
      clientId: data.clients[1].id,
      priority: "Normal",
      assignedEmployeeId: data.employees[1].id,
      status: "Ingresado",
      inDate: today(),
      promisedDate: addDays(today(), 2),
      outDate: "",
    })
  );
  persist();
}

function restoreSession() {
  const savedUserId = localStorage.getItem(SESSION_KEY);
  if (savedUserId) {
    const emp = data.employees.find((e) => e.id === savedUserId);
    if (emp) {
      currentUser = emp;
      showApp();
      return;
    }
  }
  showLogin();
}

async function onLogin(event) {
  event.preventDefault();
  if (cloud.enabled) {
    try {
      await pullCloudEmployeesOnly();
    } catch {
      el.loginError.textContent = "No se pudo conectar con la nube. Revisa internet/Supabase.";
      return;
    }
  }
  const username = el.loginUser.value.trim().toLowerCase();
  const password = el.loginPassword.value.trim();
  const user = data.employees.find((e) => e.username.toLowerCase() === username && e.password === password);
  if (!user) {
    el.loginError.textContent = "Usuario o contrasena incorrectos.";
    return;
  }
  currentUser = user;
  localStorage.setItem(SESSION_KEY, user.id);
  el.loginForm.reset();
  el.loginError.textContent = "";
  showApp();
}

function onLogout() {
  stopCloudLiveSync();
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  if (cloud.enabled) setSyncBadge(true, "Nube");
  showLogin();
}

function showLogin() {
  el.appShell.classList.add("hidden");
  el.loginScreen.classList.remove("hidden");
}

function showApp() {
  el.loginScreen.classList.add("hidden");
  el.appShell.classList.remove("hidden");
  el.loggedAs.textContent = `Empleado: ${currentUser.name}`;
  hydrateSelects();
  renderActiveTab();
  if (cloud.enabled) {
    pullCloudDataAndRender();
    startCloudLiveSync();
  }
}

function hydrateSelects() {
  el.jobStatus.innerHTML = STATES.map((s) => `<option value="${s}">${s}</option>`).join("");
  el.jobPriority.innerHTML = PRIORITIES.map((p) => `<option value="${p}">${p}</option>`).join("");
  fillClientSelect(el.jobClient);
  fillClientSelect(el.quoteClient);
  el.jobAssignedEmployee.innerHTML = data.employees.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
}

function fillClientSelect(selectEl) {
  selectEl.innerHTML = data.clients.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

function renderActiveTab() {
  el.tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === activeTab));
  const showSearch = ["trabajos", "en proceso", "terminados", "entregados", "presupuestos"].includes(activeTab);
  el.searchWrap.classList.toggle("hidden", !showSearch);

  renderCounters();
  if (activeTab === "clientes") {
    renderClientsTab();
    return;
  }
  if (activeTab === "presupuestos") {
    renderBudgetsTab();
    return;
  }
  if (activeTab === "historial") {
    renderHistoryTab();
    return;
  }
  renderJobsTab();
}

function renderCounters() {
  const inProcess = data.jobs.filter((j) => j.status === "En proceso");
  el.countMotorsInProcess.textContent = String(inProcess.filter((j) => j.type === "motor").length);
  el.countHeadsInProcess.textContent = String(inProcess.filter((j) => j.type === "tapa").length);
  el.countDoneToday.textContent = String(
    data.jobs.filter((j) => j.status === "Terminado" && (j.outDate || "") === today()).length
  );
}

function renderJobsTab() {
  const jobs = filterJobsByTab(activeTab, getSearchText());
  const container = document.createElement("div");
  container.className = "cards-grid";
  const title = document.createElement("h3");
  title.className = "section-title";
  title.textContent = tabTitle(activeTab);
  container.append(title);

  if (!jobs.length) {
    container.append(makeEmptyCard("Sin trabajos para mostrar."));
  } else {
    jobs.forEach((job) => container.append(makeJobCard(job)));
  }
  el.mainView.replaceChildren(container);
}

function filterJobsByTab(tab, text) {
  const t = text.toLowerCase();
  let list = [...data.jobs];
  if (tab === "en proceso") list = list.filter((j) => j.status === "En proceso" || j.status === "Ingresado");
  if (tab === "terminados") list = list.filter((j) => j.status === "Terminado");
  if (tab === "entregados") list = list.filter((j) => j.status === "Entregado");
  if (tab === "trabajos") list = list.filter((j) => j.status !== "Entregado");
  list.sort((a, b) => (a.inDate < b.inDate ? 1 : -1));
  if (!t) return list;

  return list.filter((job) => {
    const client = getClient(job.clientId)?.name || "";
    return [job.number, job.vehicle, client].join(" ").toLowerCase().includes(t);
  });
}

function makeJobCard(job) {
  const card = el.jobCardTemplate.content.firstElementChild.cloneNode(true);
  const client = getClient(job.clientId);
  const employee = getEmployee(job.assignedEmployeeId);
  const late = isLate(job);
  const statusClass = normalizeToken(job.status);
  const priorityClass = normalizeToken(job.priority);

  card.querySelector(".job-main").innerHTML = `
    <div>
      <div class="job-number">${escapeHtml(job.number)}</div>
      <div class="job-vehicle">${escapeHtml(job.vehicle)}</div>
    </div>
    <div style="display:flex; gap:0.35rem; align-items:center; flex-wrap:wrap;">
      <span class="chip ${statusClass}">${escapeHtml(job.status)}</span>
      <span class="chip ${priorityClass}">${escapeHtml(job.priority)}</span>
      ${late ? '<span class="late-badge">Atrasado</span>' : ""}
    </div>
  `;

  card.querySelector(".job-meta").innerHTML = `
    <div>Cliente: <strong>${escapeHtml(client?.name || "Sin cliente")}</strong></div>
    <div>Asignado a: <strong>${escapeHtml(employee?.name || "-")}</strong></div>
    <div>Ingreso: ${escapeHtml(job.inDate)} | Prometida: ${escapeHtml(job.promisedDate)} | Salida: ${escapeHtml(
    job.outDate || "-"
  )}</div>
  `;

  const actions = card.querySelector(".job-actions");
  const statusSelect = document.createElement("select");
  statusSelect.className = "status-select";
  statusSelect.innerHTML = STATES.map((s) => `<option value="${s}">${s}</option>`).join("");
  statusSelect.value = job.status;
  statusSelect.addEventListener("change", () => updateJobStatus(job.id, statusSelect.value));

  actions.append(
    statusSelect,
    makeBtn("Terminar", () => updateJobStatus(job.id, "Terminado"), "primary"),
    makeBtn("Cancelar", () => updateJobStatus(job.id, "Cancelado"), "danger"),
    makeBtn("Entregar", () => updateJobStatus(job.id, "Entregado")),
    makeBtn("Editar", () => openJobDialog({ jobId: job.id })),
    makeBtn("Eliminar", () => deleteJob(job.id), "danger")
  );

  return card;
}

function makeBtn(label, onClick, variant = "soft") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = variant === "primary" ? "btn-primary btn-small" : variant === "danger" ? "btn-danger btn-small" : "btn-small";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function renderClientsTab() {
  const wrap = document.createElement("div");
  wrap.className = "cards-grid";

  const top = document.createElement("div");
  top.className = "job-actions";
  top.append(makeBtn("Nuevo cliente", () => openClientDialog(), "primary"));
  top.append(makeBtn("Nuevo empleado/login", () => openEmployeeDialog(), "primary"));

  wrap.append(top);
  wrap.append(makeClientSection());
  wrap.append(makeEmployeeSection());
  el.mainView.replaceChildren(wrap);
}

function makeClientSection() {
  const card = document.createElement("article");
  card.className = "list-card";
  const title = document.createElement("h3");
  title.className = "section-title";
  title.textContent = "Clientes";
  card.append(title);
  if (!data.clients.length) {
    card.append(makeEmptyRow("Sin clientes."));
    return card;
  }
  data.clients.forEach((client) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(client.name)}</strong>
        <div class="job-meta">${escapeHtml(client.phone)} ${client.email ? `| ${escapeHtml(client.email)}` : ""}</div>
      </div>
    `;
    const actions = document.createElement("div");
    actions.className = "job-actions";
    actions.append(
      makeBtn("Editar", () => openClientDialog(client.id)),
      makeBtn("Presupuesto", () => openQuoteDialog({ clientId: client.id }), "primary"),
      makeBtn("Eliminar", () => deleteClient(client.id), "danger")
    );
    row.append(actions);
    card.append(row);
  });
  return card;
}

function makeEmployeeSection() {
  const card = document.createElement("article");
  card.className = "list-card";
  const title = document.createElement("h3");
  title.className = "section-title";
  title.textContent = "Empleados con login";
  card.append(title);
  data.employees.forEach((emp) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(emp.name)}</strong>
        <div class="job-meta">Usuario: ${escapeHtml(emp.username)}</div>
      </div>
    `;
    const actions = document.createElement("div");
    actions.className = "job-actions";
    actions.append(
      makeBtn("Editar", () => openEmployeeDialog(emp.id)),
      makeBtn("Eliminar", () => deleteEmployee(emp.id), "danger")
    );
    row.append(actions);
    card.append(row);
  });
  return card;
}

function renderHistoryTab() {
  const wrap = document.createElement("div");
  wrap.className = "cards-grid";
  const hTitle = document.createElement("h3");
  hTitle.className = "section-title";
  hTitle.textContent = "Historial de cambios";
  wrap.append(hTitle);
  if (!data.history.length) {
    wrap.append(makeEmptyCard("Sin movimientos."));
  } else {
    [...data.history]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 50)
      .forEach((h) => {
        const card = document.createElement("article");
        card.className = "list-card";
        card.innerHTML = `
          <strong>${escapeHtml(h.message)}</strong>
          <div class="job-meta">${escapeHtml(h.at)} | ${escapeHtml(h.by)}</div>
        `;
        wrap.append(card);
      });
  }
  el.mainView.replaceChildren(wrap);
}

function renderBudgetsTab() {
  const wrap = document.createElement("div");
  wrap.className = "cards-grid";
  const title = document.createElement("h3");
  title.className = "section-title";
  title.textContent = "Presupuestos de clientes";
  wrap.append(title);

  const search = getSearchText().toLowerCase();
  let quotes = [...data.quotes].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (search) {
    quotes = quotes.filter((q) => {
      const client = getClient(q.clientId)?.name || "";
      return [q.number, q.description, client].join(" ").toLowerCase().includes(search);
    });
  }
  if (!quotes.length) {
    wrap.append(makeEmptyCard("Sin presupuestos para mostrar."));
  } else {
    quotes.forEach((quote) => wrap.append(makeQuoteCard(quote)));
  }
  el.mainView.replaceChildren(wrap);
}

function makeQuoteCard(quote) {
  const card = document.createElement("article");
  card.className = "job-card";
  const client = getClient(quote.clientId);
  card.innerHTML = `
    <div class="job-main">
      <div>
        <div class="job-number">${escapeHtml(quote.number)}</div>
        <div class="job-vehicle">${escapeHtml(quote.description)}</div>
      </div>
      <span class="chip ${normalizeToken(quote.type === "repuesto" ? "En proceso" : "Ingresado")}">${escapeHtml(
    quote.type
  )}</span>
    </div>
    <div class="job-meta">
      <div>Cliente: <strong>${escapeHtml(client?.name || "Sin cliente")}</strong></div>
      <div>Fecha: ${escapeHtml(quote.date)} | Total: ${money(quote.total)}</div>
      <div>Items: ${escapeHtml((quote.items || "-").replaceAll("\n", " | "))}</div>
    </div>
  `;
  const actions = document.createElement("div");
  actions.className = "job-actions";
  actions.append(
    makeBtn("Enviar online", () => sendQuoteOnline(quote.id), "primary"),
    makeBtn("PDF", () => downloadQuotePdf(quote.id), "primary"),
    makeBtn("Compartir PDF", () => shareQuotePdf(quote.id)),
    makeBtn("Editar", () => openQuoteDialog({ quoteId: quote.id })),
    makeBtn("Eliminar", () => deleteQuote(quote.id), "danger")
  );
  card.append(actions);
  return card;
}

function makeEmptyCard(message) {
  const card = document.createElement("article");
  card.className = "list-card";
  card.textContent = message;
  return card;
}

function makeEmptyRow(message) {
  const row = document.createElement("div");
  row.className = "list-row";
  row.textContent = message;
  return row;
}

function onSaveJob(event) {
  event.preventDefault();
  const isEditing = !!el.jobId.value;
  const existing = isEditing ? getJob(el.jobId.value) : null;
  const payload = {
    id: existing?.id || uid(),
    number: existing?.number || nextNumber(el.jobType.value),
    type: el.jobType.value,
    vehicle: el.jobVehicle.value.trim(),
    clientId: el.jobClient.value,
    priority: el.jobPriority.value,
    assignedEmployeeId: el.jobAssignedEmployee.value,
    status: el.jobStatus.value,
    inDate: el.jobInDate.value || today(),
    promisedDate: el.jobPromisedDate.value || today(),
    outDate: el.jobOutDate.value || "",
  };
  if (!payload.vehicle || !payload.clientId || !payload.assignedEmployeeId) return alert("Completa todos los campos requeridos.");

  upsert("jobs", payload);
  if (!isEditing) addHistory(`Nuevo trabajo ${payload.number} - ${payload.vehicle}`, currentUser.name);
  persist();
  renderActiveTab();
  el.jobDialog.close();
}

function onSaveClient(event) {
  event.preventDefault();
  const payload = {
    id: el.clientId.value || uid(),
    name: el.clientName.value.trim(),
    phone: digits(el.clientPhone.value),
    email: el.clientEmail.value.trim(),
    address: el.clientAddress.value.trim(),
  };
  if (!payload.name || !payload.phone) return alert("Completa nombre y telefono.");
  upsert("clients", payload);
  addHistory(`Cliente guardado: ${payload.name}`, currentUser.name);
  persist();
  hydrateSelects();
  renderActiveTab();
  el.clientDialog.close();
}

function onSaveEmployee(event) {
  event.preventDefault();
  const payload = {
    id: el.employeeId.value || uid(),
    name: el.employeeName.value.trim(),
    username: el.employeeUsername.value.trim(),
    password: el.employeePassword.value.trim(),
  };
  if (!payload.name || !payload.username || !payload.password) return alert("Completa nombre, usuario y contrasena.");
  const duplicated = data.employees.find(
    (e) => e.username.toLowerCase() === payload.username.toLowerCase() && e.id !== payload.id
  );
  if (duplicated) return alert("Ese usuario ya existe.");
  upsert("employees", payload);
  addHistory(`Empleado/login guardado: ${payload.name}`, currentUser.name);
  persist();
  hydrateSelects();
  renderActiveTab();
  el.employeeDialog.close();
}

function onSaveQuote(event) {
  event.preventDefault();
  const isEditing = !!el.quoteId.value;
  const existing = isEditing ? getQuote(el.quoteId.value) : null;
  const labor = Number(el.quoteLabor.value || 0);
  const parts = Number(el.quoteParts.value || 0);
  const payload = {
    id: existing?.id || uid(),
    number: existing?.number || nextNumber(el.quoteType.value),
    clientId: el.quoteClient.value,
    type: el.quoteType.value,
    description: el.quoteDescription.value.trim(),
    items: el.quoteItems.value.trim(),
    labor,
    parts,
    total: labor + parts,
    date: el.quoteDate.value || today(),
  };
  if (!payload.clientId || !payload.description) return alert("Completa cliente y descripcion.");
  upsert("quotes", payload);
  addHistory(`${payload.type} guardado: ${payload.number}`, currentUser.name);
  persist();
  renderActiveTab();
  el.quoteDialog.close();
}

function openJobDialog({ jobId = "", type = "motor" } = {}) {
  el.jobForm.reset();
  el.jobStatus.innerHTML = STATES.map((s) => `<option value="${s}">${s}</option>`).join("");
  const job = jobId ? getJob(jobId) : null;
  el.jobId.value = job?.id || "";
  el.jobType.value = job?.type || type;
  el.jobVehicle.value = job?.vehicle || "";
  if (job?.clientId) el.jobClient.value = job.clientId;
  if (job?.assignedEmployeeId) el.jobAssignedEmployee.value = job.assignedEmployeeId;
  el.jobPriority.value = job?.priority || "Normal";
  el.jobStatus.value = job?.status || "Ingresado";
  el.jobInDate.value = job?.inDate || today();
  el.jobPromisedDate.value = job?.promisedDate || addDays(today(), 2);
  el.jobOutDate.value = job?.outDate || "";
  el.jobDialog.showModal();
}

function openClientDialog(clientId = "") {
  el.clientForm.reset();
  const client = clientId ? getClient(clientId) : null;
  el.clientId.value = client?.id || "";
  el.clientName.value = client?.name || "";
  el.clientPhone.value = client?.phone || "";
  el.clientEmail.value = client?.email || "";
  el.clientAddress.value = client?.address || "";
  el.clientDialog.showModal();
}

function openEmployeeDialog(employeeId = "") {
  el.employeeForm.reset();
  const emp = employeeId ? getEmployee(employeeId) : null;
  el.employeeId.value = emp?.id || "";
  el.employeeName.value = emp?.name || "";
  el.employeeUsername.value = emp?.username || "";
  el.employeePassword.value = emp?.password || "";
  el.employeeDialog.showModal();
}

function openQuoteDialog({ quoteId = "", clientId = "", type = "presupuesto" } = {}) {
  el.quoteForm.reset();
  const quote = quoteId ? getQuote(quoteId) : null;
  el.quoteId.value = quote?.id || "";
  el.quoteType.value = quote?.type || type;
  if (quote?.clientId || clientId) el.quoteClient.value = quote?.clientId || clientId;
  el.quoteDescription.value = quote?.description || "";
  el.quoteItems.value = quote?.items || "";
  el.quoteLabor.value = quote?.labor ?? 0;
  el.quoteParts.value = quote?.parts ?? 0;
  el.quoteDate.value = quote?.date || today();
  el.quoteDialog.showModal();
}

function updateJobStatus(jobId, status) {
  const job = getJob(jobId);
  if (!job || job.status === status) return;
  const before = job.status;
  job.status = status;
  if (status === "Terminado" || status === "Entregado") job.outDate = today();
  syncCloudSafely(() => syncRowToCloud("jobs", job));
  addHistory(`Estado ${job.number}: ${before} -> ${status}`, currentUser.name);
  if (status === "Terminado" || status === "Cancelado") {
    showToastWithSound(`${job.number} ${job.vehicle} paso a ${status} por ${currentUser.name}`);
  }
  persist();
  renderActiveTab();
}

function deleteJob(jobId) {
  if (!confirm("Eliminar este trabajo?")) return;
  const job = getJob(jobId);
  data.jobs = data.jobs.filter((j) => j.id !== jobId);
  syncCloudSafely(() => deleteTableRow("jobs", jobId));
  if (job) addHistory(`Trabajo eliminado: ${job.number}`, currentUser.name);
  persist();
  renderActiveTab();
}

function deleteClient(clientId) {
  if (!confirm("Eliminar este cliente?")) return;
  data.clients = data.clients.filter((c) => c.id !== clientId);
  syncCloudSafely(() => deleteTableRow("clients", clientId));
  addHistory("Cliente eliminado", currentUser.name);
  persist();
  hydrateSelects();
  renderActiveTab();
}

function deleteEmployee(employeeId) {
  if (currentUser?.id === employeeId) {
    alert("No podes eliminar tu propio usuario activo.");
    return;
  }
  if (!confirm("Eliminar este empleado/login?")) return;
  data.employees = data.employees.filter((e) => e.id !== employeeId);
  syncCloudSafely(() => deleteTableRow("employees", employeeId));
  data.jobs = data.jobs.map((j) => ({
    ...j,
    assignedEmployeeId: j.assignedEmployeeId === employeeId ? "" : j.assignedEmployeeId,
  }));
  addHistory("Empleado/login eliminado", currentUser.name);
  persist();
  hydrateSelects();
  renderActiveTab();
}

function deleteQuote(quoteId) {
  if (!confirm("Eliminar este presupuesto/repuesto?")) return;
  const quote = getQuote(quoteId);
  data.quotes = data.quotes.filter((q) => q.id !== quoteId);
  syncCloudSafely(() => deleteTableRow("quotes", quoteId));
  if (quote) addHistory(`Eliminado ${quote.number}`, currentUser.name);
  persist();
  renderActiveTab();
}

function nextNumber(type) {
  if (type === "motor") {
    data.counters.motor += 1;
    syncCloudSafely(() => pushCounters());
    return `Motor-${String(data.counters.motor).padStart(4, "0")}`;
  }
  if (type === "tapa") {
    data.counters.tapa += 1;
    syncCloudSafely(() => pushCounters());
    return `TapaCliente-${String(data.counters.tapa).padStart(4, "0")}`;
  }
  if (type === "repuesto") {
    data.counters.repuesto += 1;
    syncCloudSafely(() => pushCounters());
    return `Repuesto-${String(data.counters.repuesto).padStart(4, "0")}`;
  }
  data.counters.presupuesto += 1;
  syncCloudSafely(() => pushCounters());
  return `Presupuesto-${String(data.counters.presupuesto).padStart(4, "0")}`;
}

function makeJob(dataIn) {
  return {
    id: uid(),
    number: nextNumber(dataIn.type),
    type: dataIn.type,
    vehicle: dataIn.vehicle,
    clientId: dataIn.clientId,
    priority: dataIn.priority || "Normal",
    assignedEmployeeId: dataIn.assignedEmployeeId || "",
    status: dataIn.status || "Ingresado",
    inDate: dataIn.inDate || today(),
    promisedDate: dataIn.promisedDate || today(),
    outDate: dataIn.outDate || "",
  };
}

function makeQuote(dataIn) {
  const type = dataIn.type || "presupuesto";
  const labor = Number(dataIn.labor || 0);
  const parts = Number(dataIn.parts || 0);
  return {
    id: uid(),
    number: nextNumber(type),
    clientId: dataIn.clientId,
    type,
    description: dataIn.description,
    items: dataIn.items || "",
    labor,
    parts,
    total: labor + parts,
    date: dataIn.date || today(),
  };
}

function addHistory(message, by) {
  const entry = {
    id: uid(),
    message,
    by,
    at: new Date().toLocaleString("es-AR"),
  };
  data.history.push(entry);
  syncCloudSafely(() => pushTableRow("history", entry));
}

function sendQuoteOnline(quoteId) {
  const quote = getQuote(quoteId);
  const client = quote ? getClient(quote.clientId) : null;
  if (!quote || !client) return alert("No se encontro cliente/presupuesto.");
  const message = [
    `Hola ${client.name},`,
    `Te compartimos ${quote.type}: ${quote.number}`,
    `Descripcion: ${quote.description}`,
    `Items: ${quote.items || "-"}`,
    `Mano de obra: ${money(quote.labor)}`,
    `Repuestos: ${money(quote.parts)}`,
    `Total: ${money(quote.total)}`,
    `Fecha: ${quote.date}`,
  ].join("\n");
  const url = `https://wa.me/${digits(client.phone)}?text=${encodeURIComponent(message)}`;
  navigator.clipboard.writeText(message).catch(() => null);
  window.open(url, "_blank");
}

function buildQuotePdfDoc(quote) {
  const client = getClient(quote.clientId);
  const jspdf = window.jspdf;
  if (!jspdf?.jsPDF) throw new Error("PDF no disponible");
  const doc = new jspdf.jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  let y = 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("RECTIFICACION PARRA", margin, y);
  y += 8;
  doc.setFontSize(12);
  doc.text("Presupuesto de cliente", margin, y);
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const lines = [
    `Numero: ${quote.number}`,
    `Fecha: ${quote.date}`,
    `Cliente: ${client?.name || "Sin cliente"}`,
    `Telefono: ${client?.phone || "-"}`,
    `Tipo: ${quote.type}`,
    `Descripcion: ${quote.description}`,
    "",
    "Detalle de items:",
    quote.items || "-",
    "",
    `Mano de obra: ${money(quote.labor)}`,
    `Repuestos: ${money(quote.parts)}`,
    `TOTAL: ${money(quote.total)}`,
  ];
  lines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, 180);
    wrapped.forEach((wLine) => {
      if (y > 276) {
        doc.addPage();
        y = 18;
      }
      doc.text(wLine, margin, y);
      y += 6;
    });
  });
  y += 6;
  doc.setFont("helvetica", "italic");
  doc.text("Gracias por confiar en Rectificacion Parra.", margin, y);
  return doc;
}

function downloadQuotePdf(quoteId) {
  const quote = getQuote(quoteId);
  if (!quote) return;
  try {
    const doc = buildQuotePdfDoc(quote);
    doc.save(`${quote.number}.pdf`);
  } catch {
    alert("No se pudo generar el PDF en este navegador.");
  }
}

async function shareQuotePdf(quoteId) {
  const quote = getQuote(quoteId);
  if (!quote) return;
  try {
    const doc = buildQuotePdfDoc(quote);
    const blob = doc.output("blob");
    const file = new File([blob], `${quote.number}.pdf`, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `Presupuesto ${quote.number}`,
        text: "Adjunto presupuesto en PDF",
        files: [file],
      });
    } else {
      downloadQuotePdf(quoteId);
      showToast("Este celular no soporta compartir archivos directo. Se descargo el PDF.");
    }
  } catch {
    alert("No se pudo compartir el PDF.");
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recticontrol-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (
        !Array.isArray(parsed.employees) ||
        !Array.isArray(parsed.clients) ||
        !Array.isArray(parsed.jobs) ||
        !Array.isArray(parsed.quotes)
      ) {
        throw new Error("Formato invalido");
      }
      data = {
        employees: parsed.employees,
        clients: parsed.clients,
        jobs: parsed.jobs,
        quotes: parsed.quotes,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        counters: parsed.counters || { motor: 0, tapa: 0, repuesto: 0, presupuesto: 0 },
      };
      persist();
      hydrateSelects();
      renderActiveTab();
      showToast("Datos importados correctamente.");
      if (cloud.enabled) {
        syncCloudSafely(async () => {
          await Promise.all([
            ...data.employees.map((x) => pushTableRow("employees", toCloudEmployee(x))),
            ...data.clients.map((x) => pushTableRow("clients", toCloudClient(x))),
            ...data.jobs.map((x) => pushTableRow("jobs", toCloudJob(x))),
            ...data.quotes.map((x) => pushTableRow("quotes", toCloudQuote(x))),
            ...data.history.map((x) => pushTableRow("history", toCloudHistory(x))),
          ]);
          await pushCounters();
        });
      }
    } catch {
      alert("Archivo de respaldo invalido.");
    } finally {
      el.importDataInput.value = "";
    }
  };
  reader.readAsText(file);
}

function showToastWithSound(message) {
  showToast(message);
  playNotificationBeep();
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 3800);
}

function playNotificationBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.32);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.34);
  } catch {
    // Sin soporte de audio en este navegador.
  }
}

function upsert(collection, payload) {
  const idx = data[collection].findIndex((x) => x.id === payload.id);
  if (idx === -1) data[collection].push(payload);
  else data[collection][idx] = payload;
  syncCloudSafely(() => syncRowToCloud(collection, payload));
}

function getClient(id) {
  return data.clients.find((c) => c.id === id);
}

function getEmployee(id) {
  return data.employees.find((e) => e.id === id);
}

function getJob(id) {
  return data.jobs.find((j) => j.id === id);
}

function getQuote(id) {
  return data.quotes.find((q) => q.id === id);
}

function tabTitle(tab) {
  if (tab === "en proceso") return "Trabajos ingresados y en proceso";
  if (tab === "terminados") return "Trabajos terminados";
  if (tab === "entregados") return "Trabajos entregados";
  if (tab === "presupuestos") return "Presupuestos de clientes";
  return "Todos los trabajos";
}

function isLate(job) {
  if (!job.promisedDate) return false;
  if (job.status === "Terminado" || job.status === "Entregado" || job.status === "Cancelado") return false;
  return job.promisedDate < today();
}

function digits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function getSearchText() {
  return el.searchInput.value.trim();
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(" ", "-");
}

function addDays(dateIso, days) {
  const date = new Date(dateIso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeHtml(raw) {
  return String(raw || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
