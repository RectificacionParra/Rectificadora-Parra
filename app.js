const STORAGE_KEY = "recticontrol_v3_pro";
const SESSION_KEY = "recticontrol_session_v1";

// 1. Usamos una variable global para 'el'
let el = {};

// 2. Envolvemos toda la inicialización en DOMContentLoaded
window.addEventListener("DOMContentLoaded", () => {
    // Mapeamos los elementos una vez que sabemos que existen en el HTML
    el = {
        searchInput: document.getElementById("searchInput"),
        // ... (resto de tus elementos aquí)
    };

    // Ahora sí, llamamos a lo que necesites inicializar
    initApp();
});

function initApp() {
    // Verificamos que 'el.searchInput' exista antes de usarlo
    if (el.searchInput) {
        el.searchInput.addEventListener("input", renderActiveTab);
    }
    
    // ... resto de tu lógica de inicio
}

function getSearchText() {
    // Protección extra: si no existe, devuelve vacío en vez de romper
    return el.searchInput ? el.searchInput.value.trim() : "";
}

// ... (resto de tus funciones existentes)
