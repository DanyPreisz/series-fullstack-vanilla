import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const filters = document.querySelector("#filters");
const formError = document.querySelector("#form-error");
let mode = "login";
let status = "";
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll("#auth-view .tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
function paintFilters() {
  filters.innerHTML = "";
  ["", "viendo", "pendiente", "terminada"].forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab${status === name ? " active" : ""}`;
    button.textContent = name || "Todas";
    button.addEventListener("click", async () => { status = name; await refresh(); });
    filters.append(button);
  });
}
async function refresh() {
  paintFilters();
  const data = await api(`/api/shows?status=${encodeURIComponent(status)}`);
  listEl.innerHTML = "";
  data.shows.forEach((show) => {
    const li = document.createElement("li");
    li.className = "item";
    const text = document.createElement("span");
    text.textContent = `${show.title} \u00b7 T${show.season} E${show.episode}/${show.total} \u00b7 ${show.status}`;
    const next = document.createElement("button");
    next.type = "button";
    next.className = "primary";
    next.textContent = "Visto";
    next.addEventListener("click", async () => { await api(`/api/shows/${show.id}/next`, { method: "POST" }); await refresh(); });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/shows/${show.id}`, { method: "DELETE" }); await refresh(); });
    li.append(text, next, del);
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll("#auth-view .tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
document.querySelector("#show-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/shows", { method: "POST", body: JSON.stringify({ title: document.querySelector("#title").value.trim(), season: document.querySelector("#season").value, total: document.querySelector("#total").value }) });
    document.querySelector("#title").value = "";
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
