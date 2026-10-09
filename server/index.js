import { URL } from "node:url";
import { connect, isReady, mapShow, shows, toId, users } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const STATUSES = new Set(["viendo", "pendiente", "terminada"]);
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }
function intOf(value, max, fallback) { const n = Math.round(Number(value)); if (!Number.isFinite(n) || n < 1) return fallback; return Math.min(max, n); }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    return sendJson(res, 200, { user });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/shows") {
    const status = String(searchParams.get("status") || "");
    const query = { userId };
    if (STATUSES.has(status)) query.status = status;
    const rows = await shows().find(query).sort({ title: 1 }).limit(100).toArray();
    return sendJson(res, 200, { shows: rows.map(mapShow) });
  }
  if (method === "POST" && pathname === "/api/shows") {
    const body = await readJson(req);
    const title = String(body.title || "").trim();
    if (!title) return sendJson(res, 400, { error: "El titulo es obligatorio" });
    const result = await shows().insertOne({ userId, title: title.slice(0, 80), season: intOf(body.season, 50, 1), episode: 0, total: intOf(body.total, 100, 10), status: "viendo", createdAt: new Date() });
    return sendJson(res, 201, { show: mapShow(await shows().findOne({ _id: result.insertedId })) });
  }
  const next = pathname.match(/^\/api\/shows\/([a-fA-F0-9]{24})\/next$/);
  if (next && method === "POST") {
    const row = await shows().findOne({ _id: toId(next[1]), userId });
    if (!row) return sendJson(res, 404, { error: "Serie no encontrada" });
    const episode = Math.min(row.total, row.episode + 1);
    const status = episode >= row.total ? "terminada" : "viendo";
    await shows().updateOne({ _id: row._id }, { $set: { episode, status } });
    return sendJson(res, 200, { show: mapShow(await shows().findOne({ _id: row._id })) });
  }
  const match = pathname.match(/^\/api\/shows\/([a-fA-F0-9]{24})$/);
  if (match && method === "DELETE") {
    const result = await shows().deleteOne({ _id: toId(match[1]), userId });
    if (!result.deletedCount) return sendJson(res, 404, { error: "Serie no encontrada" });
    return sendEmpty(res, 204);
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Series en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
