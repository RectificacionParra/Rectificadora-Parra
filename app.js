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
    { name: "Valvulas De Admision", amount: 0 }
  ],
  presupuesto_motor: [
    { name: "Lavado Bloque", amount: 0 },
    { name: "Alesado de Cilindros", amount: 0 },
    { name: "Plano de Bloque", amount: 0 },
    { name: "Alesado de Bancadas", amount: 0 },
    { name: "Rectificar Cigueñal", amount: 0 },
    { name: "Embuquetar Arbol de Levas", amount: 0 }
  ],
  presupuesto: [],
  repuesto: []
};

let data = { jobs: [], clients: [], employees: [], quotes: [] };
let session = null;
const cloud = { client: null, enabled: false };

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
  jobCardTemplate: document.getElementById("jobCardTemplate")
};

function init() {
  loadLocalData();
  setupEventListeners();
  initCloud();
  checkSession();
  if (cloud.enabled) {
    pullCloudData().then(() => renderActiveTab());
    setInterval(pullCloudData, CLOUD_REFRESH_MS);
  } else {
    renderActiveTab();
  }
}

function loadLocalData() {
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) {
    try { data = JSON.parse(local); } catch (e) { console.error(e); }
  }
  if (!data.jobs) data.jobs = [];
  if (!data.clients) data.clients = [];
  if (!data.employees) data.employees = [];
  if (!data.quotes) data.quotes = [];
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function setupEventListeners() {
  el.loginForm?.addEventListener("submit", onLogin);
  el.logoutBtn?.addEventListener("click", onLogout);
  el.searchInput?.addEventListener("input", renderActiveTab);
  el.exportDataBtn?.addEventListener("click", exportData);
  el.importDataInput?.addEventListener("change", importData);
  el.btnNewMotor?.addEventListener("click", () => openJobDialog({ type: "motor" }));
  el.btnNewHead?.addEventListener("click", () => openJobDialog({ type: "tapa" }));
  el.btnNewPart?.addEventListener("click", () => openQuoteDialog({ type: "repuesto" }));
  el.btnNewQuoteHead?.addEventListener("click", () => openQuoteDialog({ type: "presupuesto_tapa" }));
  el.btnNewQuoteMotor?.addEventListener("click", () => openQuoteDialog({ type: "presupuesto_motor" }));
  el.btnNewQuote?.addEventListener("click", () => openQuoteDialog({ type: "presupuesto" }));
  el.jobForm?.addEventListener("submit", onSaveJob);
  el.clientForm?.addEventListener("submit", onSaveClient);
  el.employeeForm?.addEventListener("submit", onSaveEmployee);
  el.quoteForm?.addEventListener("submit", onSaveQuote);
  el.quoteType?.addEventListener("change", onQuoteTypeChange);
  el.btnAddCatalogService?.addEventListener("click", onAddCatalogService);

  el.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      el.tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderActiveTab();
    });
  });

  document.querySelectorAll("button[data-close]").forEach((btn) => {
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
  if (!el.syncBadge) return;
  el.syncBadge.textContent = text;
  el.syncBadge.classList.toggle("online", isOnline);
  el.syncBadge.classList.toggle("offline", !isOnline);
}

function checkSession() {
  const stored = localStorage.getItem(SESSION_KEY);
  if (stored) {
    try {
      session = JSON.parse(stored);
      showAppShell();
      return;
    } catch (e) { console.error(e); }
  }
  showLoginScreen();
}

function showLoginScreen() {
  el.loginScreen?.classList.remove("hidden");
  el.appShell?.classList.add("hidden");
}

function showAppShell() {
  el.loginScreen?.classList.add("hidden");
  el.appShell?.classList.remove("hidden");
  if (el.loggedAs) el.loggedAs.textContent = `Empleado: ${session?.name || "Desconocido"}`;
}

async function onLogin(e) {
  e.preventDefault();
  const user = el.loginUser.value.trim().toLowerCase();
  const pass = el.loginPassword.value;
  if (el.loginError) el.loginError.classList.add("hidden");

  let found = data.employees.find((emp) => emp.username.toLowerCase() === user && emp.password === pass);

  if (!found && cloud.enabled) {
    try {
      const { data: res, error } = await cloud.client.from("empleados").select("*").eq("usuario", user).eq("contrasena", pass).maybeSingle();
      if (res) {
        found = { id: res.id, name: res.nombre, username: res.usuario, password: res.contrasena };
        if (!data.employees.some(e => e.id === found.id)) {
          data.employees.push(found);
          saveLocalData();
        }
      }
    } catch (err) { console.error(err); }
  }

  if (user === "admin" && pass === "admin123" && !found) {
    found = { id: 9999, name: "Administrador", username: "admin", password: "admin123" };
  }

  if (found) {
    session = found;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    showAppShell();
    renderActiveTab();
  } else {
    if (el.loginError) {
      el.loginError.textContent = "Usuario o contraseña incorrectos";
      el.loginError.classList.remove("hidden");
    }
  }
}

function onLogout() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
  showLoginScreen();
}

function showToast(msg) {
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.remove("hidden");
  setTimeout(() => el.toast.classList.add("hidden"), 3000);
}

function sendWhatsAppNotification(job) {
  const client = getClient(job.clientId);
  if (!client || !client.phone) {
    showToast("El cliente no tiene un teléfono registrado.");
    return;
  }
  let cleanPhone = client.phone.replace(/\D+/g, "");
  if (!cleanPhone.startsWith("54")) {
    cleanPhone = "54" + cleanPhone;
  }
  const message = `Hola ${client.name}, te avisamos de *Rectificación Parra* que el trabajo de tu vehículo *${job.vehicle}* (${job.type === "motor" ? "Motor" : "Tapa de Cilindros"}) ya se encuentra en estado: *${job.status.toUpperCase()}*. ¡Saludos!`;
  const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

function renderActiveTab() {
  if (!session) return;
  const activeTab = el.tabButtons.find((b) => b.classList.contains("active"))?.dataset.tab || "trabajos";
  updateCounters();
  
  let list = [];
  if (activeTab === "clientes") { renderClientsView(); return; }
  if (activeTab === "presupuestos") { renderQuotesView(); return; }
  
  if (activeTab === "trabajos") list = data.jobs;
  else if (activeTab === "en proceso") list = data.jobs.filter((j) => j.status === "Ingresado" || j.status === "En proceso");
  else if (activeTab === "terminados") list = data.jobs.filter((j) => j.status === "Terminado");
  else if (activeTab === "entregados") list = data.jobs.filter((j) => j.status === "Entregado");
  else if (activeTab === "historial") list = data.jobs.filter((j) => j.status === "Entregado" || j.status === "Cancelado");

  // USAMOS LA VALIDACIÓN SEGURA DE TU CÓDIGO ANTERIOR
  const query = el.searchInput ? el.searchInput.value.trim().toLowerCase() : "";
  if (query) {
    list = list.filter((j) => {
      const client = getClient(j.clientId);
      return j.vehicle.toLowerCase().includes(query) || (client && client.name.toLowerCase().includes(query)) || String(j.id).includes(query);
    });
  }

  list.sort((a, b) => new Date(b.inDate) - new Date(a.inDate));

  el.mainView.innerHTML = `<h3>${tabTitle(activeTab)}</h3>`;
  if (list.length === 0) {
    el.mainView.innerHTML += `<p class="empty-msg">No se encontraron trabajos en esta sección.</p>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "jobs-grid";

  list.forEach((job) => {
    const client = getClient(job.clientId);
    const emp = getEmployee(job.assignedEmployee);
    const card = document.createElement("article");
    
    let stateClass = "state-default";
    if (job.status === "Ingresado") stateClass = "state-ingresado";
    else if (job.status === "En proceso") stateClass = "state-proceso";
    else if (job.status === "Terminado") stateClass = "state-terminado";
    else if (job.status === "Entregado") stateClass = "state-entregado";

    card.className = `job-card ${stateClass} ${isLate(job) ? "job-late" : ""}`;

    card.innerHTML = `
      <div class="job-main">
        <span class="job-id">#${job.id}</span>
        <h4>${job.vehicle.toUpperCase()}</h4>
        <p class="job-type-badge">${job.type === "motor" ? "⚙️ MOTOR" : "🔩 TAPA"}</p>
        <p><strong>Cliente:</strong> ${client ? client.name : "No asignado"}</p>
        <p><strong>Operario:</strong> ${emp ? emp.name : "No asignado"}</p>
      </div>
      <div class="job-meta">
        <div class="status-selector-wrap">
          <label>Estado:</label>
          <select class="status-select" data-id="${job.id}">
            ${STATES.map(s => `<option value="${s}" ${job.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <p><small>Ingreso: ${job.inDate}</small></p>
        ${job.promisedDate ? `<p><small class="${isLate(job) ? "text-danger" : ""}">Promesa: ${job.promisedDate} ${isLate(job) ? "⚠️" : ""}</small></p>` : ""}
      </div>
      <div class="job-actions">
        <button class="btn-edit-job btn-soft" data-id="${job.id}">Editar</button>
        <button class="btn-whatsapp btn-success-action" data-id="${job.id}" title="Enviar aviso por WhatsApp">💬 Avisar</button>
      </div>
    `;

    card.querySelector(".status-select").addEventListener("change", (e) => {
      updateJobStatus(job.id, e.target.value);
    });
    card.querySelector(".btn-edit-job").addEventListener("click", () => {
      openJobDialog(job);
    });
    card.querySelector(".btn-whatsapp").addEventListener("click", () => {
      sendWhatsAppNotification(job);
    });

    grid.appendChild(card);
  });

  el.mainView.appendChild(grid);
}

function updateCounters() {
  if (!el.countMotorsInProcess) return;
  const motors = data.jobs.filter((j) => j.type === "motor" && (j.status === "Ingresado" || j.status === "En process" || j.status === "En proceso")).length;
  const heads = data.jobs.filter((j) => j.type === "tapa" && (j.status === "Ingresado" || j.status === "En process" || j.status === "En proceso")).length;
  const doneToday = data.jobs.filter((j) => j.status === "Terminado").length;

  el.countMotorsInProcess.textContent = motors;
  el.countHeadsInProcess.textContent = heads;
  el.countDoneToday.textContent = doneToday;
}

function updateJobStatus(id, newStatus) {
  const job = data.jobs.find((j) => j.id === id);
  if (job) {
    job.status = newStatus;
    if (newStatus === "Entregado" || newStatus === "Cancelado") {
      job.outDate = today();
    }
    saveLocalData();
    renderActiveTab();
    if (cloud.enabled) {
      const payload = { id: job.id, tipo: job.type, vehiculo: job.vehicle, cliente_id: job.clientId, prioridad: job.priority, asignado_a: job.assignedEmployee, estado: job.status, fecha_ingreso: job.inDate, fecha_prometida: job.promisedDate, observaciones: job.observations, fecha_salida: job.outDate };
      syncRowToCloud("trabajos", payload);
    }
    showToast(`Trabajo #${id} actualizado a ${newStatus}`);
  }
}

function openJobDialog(job) {
  populateDropdowns();
  if (job && job.id) {
    el.jobId.value = job.id;
    el.jobType.value = job.type;
    el.jobVehicle.value = job.vehicle;
    el.jobClient.value = job.clientId || "";
    el.jobPriority.value = job.priority || "Normal";
    el.jobAssignedEmployee.value = job.assignedEmployee || "";
    el.jobStatus.value = job.status;
    el.jobInDate.value = job.inDate;
    el.jobPromisedDate.value = job.promisedDate || "";
    el.jobObservations.value = job.observations || "";
    el.jobOutDate.value = job.outDate || "";
  } else {
    el.jobId.value = "";
    el.jobType.value = job?.type || "motor";
    el.jobVehicle.value = "";
    el.jobClient.value = "";
    el.jobPriority.value = "Normal";
    el.jobAssignedEmployee.value = "";
    el.jobStatus.value = "Ingresado";
    el.jobInDate.value = today();
    el.jobPromisedDate.value = "";
    el.jobObservations.value = "";
    el.jobOutDate.value = "";
  }
  el.jobDialog.showModal();
}

function populateDropdowns() {
  const clientOpts = `<option value="">-- Seleccionar --</option>` + data.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  const empOpts = `<option value="">-- Seleccionar --</option>` + data.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join("");

  if (el.jobClient) el.jobClient.innerHTML = clientOpts;
  if (el.jobAssignedEmployee) el.jobAssignedEmployee.innerHTML = empOpts;
  if (el.quoteClient) el.quoteClient.innerHTML = clientOpts;

  if (el.jobStatus) {
    el.jobStatus.innerHTML = STATES.map(s => `<option value="${s}">${s}</option>`).join("");
  }
}

function onSaveJob(e) {
  e.preventDefault();
  const id = el.jobId.value ? Number(el.jobId.value) : Date.now();
  const isNew = !el.jobId.value;

  const job = {
    id,
    type: el.jobType.value,
    vehicle: el.jobVehicle.value.trim(),
    clientId: el.jobClient.value ? Number(el.jobClient.value) : null,
    priority: el.jobPriority.value,
    assignedEmployee: el.jobAssignedEmployee.value ? Number(el.jobAssignedEmployee.value) : null,
    status: el.jobStatus.value,
    inDate: el.jobInDate.value,
    promisedDate: el.jobPromisedDate.value || null,
    observations: el.jobObservations.value.trim(),
    outDate: el.jobOutDate.value || null
  };

  if (isNew) data.jobs.push(job);
  else {
    const idx = data.jobs.findIndex(j => j.id === id);
    if (idx !== -1) data.jobs[idx] = job;
  }

  saveLocalData();
  el.jobDialog.close();
  renderActiveTab();

  if (cloud.enabled) {
    const payload = { id: job.id, tipo: job.type, vehiculo: job.vehicle, cliente_id: job.clientId, prioridad: job.priority, asignado_a: job.assignedEmployee, estado: job.status, fecha_ingreso: job.inDate, fecha_prometida: job.promisedDate, observaciones: job.observations, fecha_salida: job.outDate };
    syncRowToCloud("trabajos", payload);
  }
  showToast(isNew ? "Trabajo ingresado correctamente" : "Trabajo actualizado");
}

function renderClientsView() {
  el.mainView.innerHTML = `
    <div class="view-header-row">
      <h3>Clientes Registrados</h3>
      <button id="btnNewClient" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.9rem;">+ Nuevo Cliente</button>
    </div>
  `;
  document.getElementById("btnNewClient").addEventListener("click", () => openClientDialog());

  if (data.clients.length === 0) {
    el.mainView.innerHTML += `<p class="empty-msg">No hay clientes cargados en el sistema.</p>`;
    return;
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "table-responsive";
  tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Teléfono</th>
          <th>Dirección</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${data.clients.map(c => `
          <tr>
            <td><strong>${c.name}</strong></td>
            <td>${c.phone || "-"}</td>
            <td>${c.address || "-"}</td>
            <td><button class="btn-edit-client btn-soft" data-id="${c.id}">Editar</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  tableWrap.querySelectorAll(".btn-edit-client").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = data.clients.find(cli => cli.id === Number(btn.dataset.id));
      if (c) openClientDialog(c);
    });
  });

  el.mainView.appendChild(tableWrap);
}

function openClientDialog(c) {
  if (c) {
    el.clientId.value = c.id;
    el.clientName.value = c.name;
    el.clientPhone.value = c.phone || "";
    el.clientEmail.value = c.email || "";
    el.clientAddress.value = c.address || "";
  } else {
    el.clientId.value = "";
    el.clientName.value = "";
    el.clientPhone.value = "";
    el.clientEmail.value = "";
    el.clientAddress.value = "";
  }
  el.clientDialog.showModal();
}

function onSaveClient(e) {
  e.preventDefault();
  const id = el.clientId.value ? Number(el.clientId.value) : Date.now();
  const isNew = !el.clientId.value;

  const client = {
    id,
    name: el.clientName.value.trim(),
    phone: el.clientPhone.value.trim(),
    email: el.clientEmail.value.trim() || null,
    address: el.clientAddress.value.trim() || null
  };

  if (isNew) data.clients.push(client);
  else {
    const idx = data.clients.findIndex(c => c.id === id);
    if (idx !== -1) data.clients[idx] = client;
  }

  saveLocalData();
  el.clientDialog.close();
  renderClientsView();

  if (cloud.enabled) {
    const payload = { id: client.id, nombre: client.name, telefono: client.phone, email: client.email, direccion: client.address };
    syncRowToCloud("clientes", payload);
  }
  showToast(isNew ? "Cliente registrado" : "Cliente actualizado");
}

function renderQuotesView() {
  el.mainView.innerHTML = `<h3>Presupuestos y Comprobantes</h3>`;
  if (data.quotes.length === 0) {
    el.mainView.innerHTML += `<p class="empty-msg">No hay presupuestos creados todavía.</p>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "jobs-grid";

  data.quotes.forEach(q => {
    const client = getClient(q.clientId);
    const card = document.createElement("article");
    card.className = "job-card quote-card-item";
    card.innerHTML = `
      <div class="job-main">
        <span class="job-id">#${q.id}</span>
        <h4>${q.description.toUpperCase()}</h4>
        <p class="job-type-badge quote-label">${String(q.type).replace("_", " ").toUpperCase()}</p>
        <p><strong>Cliente:</strong> ${client ? client.name : "Desconocido"}</p>
        <p><strong>Total:</strong> <strong style="color:var(--green); font-size:1.1rem;">${money(q.total)}</strong></p>
      </div>
      <div class="job-meta">
        <p><small>Fecha: ${q.date}</small></p>
      </div>
      <div class="job-actions">
        <button class="btn-download-pdf btn-soft" data-id="${q.id}">📄 PDF</button>
        <button class="btn-edit-quote btn-soft" data-id="${q.id}">Editar</button>
      </div>
    `;

    card.querySelector(".btn-edit-quote").addEventListener("click", () => openQuoteDialog(q));
    card.querySelector(".btn-download-pdf").addEventListener("click", () => generatePDF(q));
    grid.appendChild(card);
  });

  el.mainView.appendChild(grid);
}

function openQuoteDialog(q) {
  populateDropdowns();
  if (q && q.id) {
    el.quoteId.value = q.id;
    el.quoteClient.value = q.clientId || "";
    el.quoteType.value = q.type;
    el.quoteDescription.value = q.description;
    el.quoteItems.value = q.items || "";
    el.quoteTotal.value = q.total;
    el.quoteDate.value = q.date;
  } else {
    el.quoteId.value = "";
    el.quoteClient.value = "";
    el.quoteType.value = q?.type || "presupuesto";
    el.quoteDescription.value = "";
    el.quoteItems.value = "";
    el.quoteTotal.value = 0;
    el.quoteDate.value = today();
  }
  onQuoteTypeChange();
  el.quoteDialog.showModal();
}

function onQuoteTypeChange() {
  const type = el.quoteType.value;
  if (type === "presupuesto_tapa" || type === "presupuesto_motor") {
    el.quoteCatalogSection.classList.remove("hidden");
    el.quoteCatalogTitle.textContent = type === "presupuesto_tapa" ? "Servicios Tapa de Cilindros" : "Servicios Motor Bloque";
    renderCatalogList(type);
  } else {
    el.quoteCatalogSection.classList.add("hidden");
  }
}

function renderCatalogList(type) {
  const defaults = DEFAULT_SERVICE_CATALOG[type] || [];
  let currentItems = [];
  try { currentItems = JSON.parse(el.quoteItems.value || "[]"); } catch (e) { currentItems = []; }

  el.quoteCatalogList.innerHTML = defaults.map(def => {
    const match = currentItems.find(i => i.name === def.name);
    const checked = !!match;
    const price = match ? match.amount : def.amount;
    return `
      <div class="catalog-row">
        <label><input type="checkbox" class="catalog-check" data-name="${def.name}" ${checked ? "checked" : ""}> ${def.name}</label>
        <input type="number" class="catalog-price-input" data-name="${def.name}" value="${price}" min="0" ${!checked ? "disabled" : ""}>
      </div>
    `;
  }).join("");

  el.quoteCatalogList.querySelectorAll(".catalog-check").forEach(chk => {
    chk.addEventListener("change", (e) => {
      const priceInput = el.quoteCatalogList.querySelector(`.catalog-price-input[data-name="${chk.dataset.name}"]`);
      priceInput.disabled = !chk.checked;
      syncQuoteItemsFromCatalog();
    });
  });

  el.quoteCatalogList.querySelectorAll(".catalog-price-input").forEach(inp => {
    inp.addEventListener("input", syncQuoteItemsFromCatalog);
  });
}

function onAddCatalogService() {
  const name = prompt("Nombre del servicio personalizado:");
  if (!name) return;
  const type = el.quoteType.value;
  if (!DEFAULT_SERVICE_CATALOG[type]) DEFAULT_SERVICE_CATALOG[type] = [];
  DEFAULT_SERVICE_CATALOG[type].push({ name, amount: 0 });
  renderCatalogList(type);
}

function syncQuoteItemsFromCatalog() {
  const items = [];
  let total = 0;
  el.quoteCatalogList.querySelectorAll(".catalog-row").forEach(row => {
    const chk = row.querySelector(".catalog-check");
    const num = row.querySelector(".catalog-price-input");
    if (chk && chk.checked) {
      const amount = Number(num.value || 0);
      items.push({ name: chk.dataset.name, amount });
      total += amount;
    }
  });
  el.quoteItems.value = JSON.stringify(items);
  el.quoteTotal.value = total.toFixed(2);
}

function onSaveQuote(e) {
  e.preventDefault();
  const id = el.quoteId.value ? Number(el.quoteId.value) : Date.now();
  const isNew = !el.quoteId.value;

  const quote = {
    id,
    clientId: el.quoteClient.value ? Number(el.quoteClient.value) : null,
    type: el.quoteType.value,
    description: el.quoteDescription.value.trim(),
    items: el.quoteItems.value,
    total: Number(el.quoteTotal.value || 0),
    date: el.quoteDate.value
  };

  if (isNew) data.quotes.push(quote);
  else {
    const idx = data.quotes.findIndex(q => q.id === id);
    if (idx !== -1) data.quotes[idx] = quote;
  }

  saveLocalData();
  el.quoteDialog.close();
  renderQuotesView();

  if (cloud.enabled) {
    const payload = { id: quote.id, cliente_id: quote.clientId, tipo: quote.type, descripcion: quote.description, items: quote.items, total: quote.total, fecha: quote.date };
    syncRowToCloud("presupuestos", payload);
  }
  showToast(isNew ? "Comprobante guardado" : "Comprobante actualizado");
}

function generatePDF(q) {
  if (!window.jspdf) { showToast("Error al cargar generador de PDF"); return; }
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

  doc.text(`COMPROBANTE #${q.id}`, 150, 20);
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
  doc.text(`Tipo de comprobante: ${String(q.type).replace("_", " ").toUpperCase()}`, 15, 85);

  doc.setFont("Helvetica", "bold");
  doc.text("DETALLE DE TRABAJOS Y MATERIALES", 15, 100);
  doc.line(15, 102, 195, 102);

  let y = 110;
  doc.setFont("Helvetica", "normal");

  try {
    const list = JSON.parse(q.items || "[]");
    if (Array.isArray(list) && list.length > 0) {
      list.forEach(item => {
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

  doc.save(`Comprobante_Parra_${q.id}.pdf`);
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recticontrol_backup_${today()}.json`;
  a.click();
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (parsed.jobs && parsed.clients) {
        data = parsed;
        saveLocalData();
        renderActiveTab();
        showToast("Datos importados con éxito");
      }
    } catch (err) { showToast("Archivo JSON no válido"); }
  };
  reader.readAsText(file);
}

async function syncRowToCloud(table, payload) {
  if (!cloud.enabled) return;
  try {
    const { error } = await cloud.client.from(table).upsert(payload);
    if (error) console.error(`Error sincronizando fila en ${table}:`, error);
  } catch (err) { console.error(err); }
}

async function pullCloudData() {
  if (!cloud.enabled) return;
  try {
    const { data: cList } = await cloud.client.from("clientes").select("*");
    if (cList) {
      data.clients = cList.map(c => ({ id: c.id, name: c.nombre, phone: c.telefono, email: c.email, address: c.direccion }));
    }
    const { data: eList } = await cloud.client.from("empleados").select("*");
    if (eList) {
      data.employees = eList.map(e => ({ id: e.id, name: e.nombre, username: e.usuario, password: e.contrasena }));
    }
    const { data: jList } = await cloud.client.from("trabajos").select("*");
    if (jList) {
      data.jobs = jList.map(j => ({ id: j.id, type: j.tipo, vehicle: j.vehiculo, clientId: j.cliente_id, priority: j.prioridad, assignedEmployee: j.asignado_a, status: j.estado, inDate: j.fecha_ingreso, promisedDate: j.fecha_prometida, observations: j.observaciones, outDate: j.fecha_salida }));
    }
    const { data: qList } = await cloud.client.from("presupuestos").select("*");
    if (qList) {
      data.quotes = qList.map(q => ({ id: q.id, clientId: q.cliente_id, type: q.tipo, description: q.descripcion, items: q.items, total: Number(q.total || 0), date: q.fecha }));
    }
    saveLocalData();
    updateCounters();
  } catch (err) { console.error("Error trayendo datos de la nube:", err); }
}

function getClient(id) { return data.clients.find((c) => c.id === id); }
function getEmployee(id) { return data.employees.find((e) => e.id === id); }
function getJob(id) { return data.jobs.find((j) => j.id === id); }
function getQuote(id) { return data.quotes.find((q) => q.id === id); }

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

function digits(value) { return String(value || "").replace(/\D+/g, ""); }
function getSearchText() { return el.searchInput ? el.searchInput.value.trim() : ""; }
function normalizeToken(value) { return String(value || "").toLowerCase().replaceAll(" ", "-"); }
function addDays(dateIso, days) { const d = new Date(dateIso); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function escapeHtml(raw) { return String(raw || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

window.addEventListener("DOMContentLoaded", init);
