const STORAGE_KEY = "recticontrol_v3_pro";
const SESSION_KEY = "recticontrol_session_v1";
const STATES = ["Ingresado", "En proceso", "Terminado", "Cancelado", "Entregado"];
const PRIORITIES = ["Normal", "Urgente", "Muy urgente"];
const CLOUD_REFRESH_MS = 20000;

// Variables globales protegidas
let data = { employees: [], clients: [], jobs: [], quotes: [], history: [], counters: { motor: 0, tapa: 0, repuesto: 0, presupuesto: 0 } };
let currentUser = null;
const cloud = { client: null, enabled: false };
let el = {};

// --- INICIALIZACIÓN SEGURA ---
window.addEventListener("DOMContentLoaded", () => {
    // Mapeo seguro de elementos del DOM
    el = {
        loginScreen: document.getElementById("loginScreen"),
        appShell: document.getElementById("appShell"),
        loginForm: document.getElementById("loginForm"),
        loginUser: document.getElementById("loginUser"),
        loginPassword: document.getElementById("loginPassword"),
        searchInput: document.getElementById("searchInput"),
        logoutBtn: document.getElementById("logoutBtn"),
        // ...resto de elementos
    };

    data = loadData();
    initCloud();
    bindEvents();
    restoreSession();
});

function bindEvents() {
    if (el.loginForm) el.loginForm.addEventListener("submit", onLogin);
    if (el.logoutBtn) el.logoutBtn.addEventListener("click", onLogout);
    if (el.searchInput) el.searchInput.addEventListener("input", renderActiveTab);
}

function initCloud() {
    // Usamos las variables globales definidas en tu HTML
    if (window.SUPABASE_URL && window.SUPABASE_KEY && window.supabase) {
        cloud.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        cloud.enabled = true;
    }
}

function restoreSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
        currentUser = JSON.parse(raw);
        showApp();
    } else {
        showLogin();
    }
}

function showLogin() {
    if (el.loginScreen) el.loginScreen.classList.remove("hidden");
    if (el.appShell) el.appShell.classList.add("hidden");
}

function showApp() {
    if (el.loginScreen) el.loginScreen.classList.add("hidden");
    if (el.appShell) el.appShell.classList.remove("hidden");
    renderActiveTab();
}

async function onLogin(e) {
    e.preventDefault();
    const user = el.loginUser.value;
    const pass = el.loginPassword.value;

    // Intento de autenticación en nube
    if (cloud.enabled) {
        const { data: userRecord, error } = await cloud.client
            .from('employees')
            .select('*')
            .eq('username', user)
            .eq('password', pass)
            .maybeSingle();

        if (userRecord) {
            currentUser = userRecord;
            localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
            showApp();
            return;
        }
    }
    alert("Usuario o clave incorrecta");
}

function onLogout() {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
}

function renderActiveTab() {
    if (!el.searchInput) return;
    // ...resto de lógica de renderizado
}

function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : data;
}
