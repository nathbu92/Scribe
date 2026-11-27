// Martinews Scribe — serveur : comptes, fichiers, partages, corrections, notifications Brevo.
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const DATA = path.resolve(process.env.DATA_DIR || "./data");
const ROOT = path.join(DATA, "Scribe");
fs.mkdirSync(ROOT, { recursive: true });
const secretFile = path.join(DATA, ".jwt-secret");
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (fs.existsSync(secretFile)
    ? fs.readFileSync(secretFile, "utf8")
    : (() => { const s = crypto.randomBytes(48).toString("hex"); fs.writeFileSync(secretFile, s, { mode: 0o600 }); return s; })());

const slug = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "x";
const fail = (status, error) => Object.assign(new Error(error), { status });
const sheetDir = (sheet) => path.join(ROOT, slug(sheet));
const metaFile = (sheet) => path.join(sheetDir(sheet), "_meta.json");
const loadMeta = (sheet) => {
  try { return JSON.parse(fs.readFileSync(metaFile(sheet), "utf8")); } catch { return null; }
};
const saveMeta = (sheet, m) => fs.writeFileSync(metaFile(sheet), JSON.stringify(m, null, 2));
const code6 = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
const rid = () => crypto.randomBytes(8).toString("hex");

// Un chemin relatif reste toujours dans sa racine (pas de ../, pas de fichiers cachés).
function safeJoin(base, rel = "") {
  const parts = String(rel).split(/[\\/]+/).filter((p) => p && p !== ".");
  if (parts.some((p) => p === ".." || p.startsWith("."))) throw fail(400, "Chemin invalide");
  const abs = path.join(base, ...parts);
  if (abs !== base && !abs.startsWith(base + path.sep)) throw fail(400, "Chemin invalide");
  return abs;
}

// ── Brevo ────────────────────────────────────────────────────────────────
async function mail(to, subject, html) {
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL || !to) return;
  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "Martinews Scribe" },
        to: [{ email: to }], subject, htmlContent: html,
      }),
    });
  } catch (e) { console.error("[brevo]", e.message); }
}

// ── Anti force brute (par IP + identifiant) ──────────────────────────────
const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 10 * 60_000);
  if (a.length >= 10) throw fail(429, "Trop d'essais, réessaie dans quelques minutes");
  a.push(now); attempts.set(key, a);
}

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGINS && process.env.CORS_ORIGINS !== "*" ? process.env.CORS_ORIGINS.split(",") : true }));
app.use(express.json({ limit: "2mb" }));
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// ── Authentification ─────────────────────────────────────────────────────
function auth(req, _res, next) {
  const h = req.headers.authorization;
  const t = (h && h.startsWith("Bearer ") ? h.slice(7) : null) || req.query.t;
  try {
    const p = jwt.verify(String(t), JWT_SECRET);
    const meta = loadMeta(p.sheet);
    if (!meta) throw 0;
    const user = p.role === "admin" ? { id: "_admin", name: "Enseignant" } : meta.users[p.id];
    if (!user) throw 0;
    req.me = { sheet: p.sheet, id: p.id, role: p.role, name: user.name, meta };
    next();
  } catch { next(fail(401, "Non connecté")); }
}
const adminOnly = (req, _res, next) => (req.me.role === "admin" ? next() : next(fail(403, "Réservé à l'enseignant")));
const token = (sheet, id, role) => jwt.sign({ sheet, id, role }, JWT_SECRET, { expiresIn: "30d" });

// Création de l'espace, appelée par Presence (Paramètres > créer un espace de travail).
app.post("/api/workspaces", wrap(async (req, res) => {
  const { key, sheetId, sheetName, adminUser, adminPassword, names, teacherEmail } = req.body || {};
  if (!process.env.WORKSPACE_CREATE_KEY || key !== process.env.WORKSPACE_CREATE_KEY) throw fail(403, "Clé de création incorrecte");
  if (!sheetId || !adminUser || !adminPassword || !Array.isArray(names)) throw fail(400, "Paramètres manquants");
  if (String(adminPassword).length < 8) throw fail(400, "Mot de passe admin : 8 caractères minimum");
  if (loadMeta(sheetId)) throw fail(409, "Un espace existe déjà pour cette feuille");
  fs.mkdirSync(path.join(sheetDir(sheetId), "shared"), { recursive: true });
  const meta = {
    name: sheetName || sheetId, created: Date.now(), teacherEmail: teacherEmail || "",
    admin: { user: slug(adminUser), hash: await bcrypt.hash(String(adminPassword), 10) },
    users: {}, shares: [], sharedRules: [],
  };
  const out = [];
  for (const name of names.map((n) => String(n).trim()).filter(Boolean)) {
    let id = slug(name); let i = 2;
    while (meta.users[id]) id = `${slug(name)}.${i++}`;
    const code = code6();
    meta.users[id] = { name, hash: null, codeHash: await bcrypt.hash(code, 8), mustReset: true };
    fs.mkdirSync(path.join(sheetDir(sheetId), id), { recursive: true });
    out.push({ name, user: id, code });
  }
  saveMeta(sheetId, meta);
  res.json({ sheet: slug(sheetId), sheetName: meta.name, users: out });
}));

// 1re connexion : feuille + user + code à 6 chiffres → mustReset ; ensuite mot de passe.
app.post("/api/login", wrap(async (req, res) => {
  const { sheet, user, secret } = req.body || {};
  if (!sheet || !user || !secret) throw fail(400, "Champs manquants");
  throttle(`${req.ip}|${slug(sheet)}|${slug(user)}`);
  const meta = loadMeta(sheet);
  const bad = fail(401, "Identifiants incorrects");
  if (!meta) throw bad;
  if (slug(user) === meta.admin.user && (await bcrypt.compare(String(secret), meta.admin.hash)))
    return res.json({ token: token(sheet, "_admin", "admin"), mustReset: false, role: "admin" });
  const u = meta.users[slug(user)];
  if (!u) throw bad;
  if (u.mustReset) {
    if (!u.codeHash || !(await bcrypt.compare(String(secret), u.codeHash))) throw bad;
    return res.json({ token: token(sheet, slug(user), "user"), mustReset: true, role: "user" });
  }
  if (!u.hash || !(await bcrypt.compare(String(secret), u.hash))) throw bad;
  res.json({ token: token(sheet, slug(user), "user"), mustReset: false, role: "user" });
}));

// Choix du mot de passe : le code est supprimé et remplacé par le mot de passe.
app.post("/api/password", auth, wrap(async (req, res) => {
  const { newPassword } = req.body || {};
  if (String(newPassword || "").length < 8) throw fail(400, "Mot de passe : 8 caractères minimum");
  const { sheet, id, role, meta } = req.me;
  if (role === "admin") meta.admin.hash = await bcrypt.hash(newPassword, 10);
  else { const u = meta.users[id]; u.hash = await bcrypt.hash(newPassword, 10); u.codeHash = null; u.mustReset = false; }
  saveMeta(sheet, meta);
  res.json({ ok: true });
}));

app.get("/api/me", auth, (req, res) => {
  const { sheet, id, role, name, meta } = req.me;
  res.json({ sheet, id, role, name, sheetName: meta.name, mustReset: role === "user" && meta.users[id].mustReset });
});
app.get("/api/users", auth, (req, res) =>
  res.json(Object.entries(req.me.meta.users).filter(([id]) => id !== req.me.id).map(([id, u]) => ({ id, name: u.name }))));

// ── Résolution d'une cible : mon dossier, dossier partagé, ou un document partagé ─────
function target(req) {
  const { sheet, id, role, meta } = req.me;
  const q = { ...req.query, ...(req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body) ? req.body : {}) };
  const sd = sheetDir(sheet);
  if (q.share) {
    const s = meta.shares.find((x) => x.id === q.share);
    if (!s) throw fail(404, "Partage introuvable");
    const isOwner = s.owner === id, invited = s.with.includes(id), teacher = role === "admin" && s.toTeacher;
    if (!isOwner && !invited && !teacher) throw fail(403, "Accès refusé");
    return { abs: safeJoin(path.join(sd, s.owner), s.path), owner: s.owner, rel: s.path, share: s,
      canWrite: isOwner || (invited && s.mode === "edit"), base: path.join(sd, s.owner) };
  }
  const rel = String(q.path || "");
  if (q.scope === "shared") {
    const base = path.join(sd, "shared");
    let canWrite = role === "admin";
    if (!canWrite) {
      const norm = "/" + rel.split(/[\\/]+/).filter(Boolean).join("/");
      const rule = meta.sharedRules.filter((r) => norm === r.path || norm.startsWith(r.path + "/")).sort((a, b) => b.path.length - a.path.length)[0];
      canWrite = !!rule && (rule.editors.includes("*") || rule.editors.includes(id));
    }
    return { abs: safeJoin(base, rel), owner: "shared", rel, canWrite, base };
  }
  if (role === "admin") throw fail(400, "L'enseignant utilise le dossier partagé ou les partages");
  const base = path.join(sd, id);
  return { abs: safeJoin(base, rel), owner: id, rel, canWrite: true, base };
}
const needWrite = (t) => { if (!t.canWrite) throw fail(403, "Lecture seule"); };
const isDoc = (p) => p.endsWith(".doc.html");

// Historique : un instantané au plus toutes les 2 minutes (ou sur demande), 100 versions max.
const vDir = (t) => path.join(t.base, ".versions", crypto.createHash("sha1").update(t.rel).digest("hex").slice(0, 16));
function snapshot(t, force) {
  if (!fs.existsSync(t.abs)) return;
  const d = vDir(t); fs.mkdirSync(d, { recursive: true });
  const list = fs.readdirSync(d).sort();
  const last = list.length ? Number(list[list.length - 1].split(".")[0]) : 0;
  if (!force && Date.now() - last < 120_000) return;
  fs.copyFileSync(t.abs, path.join(d, `${Date.now()}.html`));
  for (const old of list.slice(0, Math.max(0, list.length + 1 - 100))) fs.rmSync(path.join(d, old));
}

app.get("/api/ls", auth, wrap((req, res) => {
  const t = target(req);
  if (!fs.existsSync(t.abs)) { if (!t.rel) fs.mkdirSync(t.abs, { recursive: true }); else throw fail(404, "Introuvable"); }
  const entries = fs.readdirSync(t.abs, { withFileTypes: true }).filter((e) => !e.name.startsWith(".") && !e.name.startsWith("_"))
    .map((e) => { const st = fs.statSync(path.join(t.abs, e.name));
      return { name: e.name, type: e.isDirectory() ? "dir" : "file", size: st.size, mtime: st.mtimeMs }; })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "fr") : a.type === "dir" ? -1 : 1));
  res.json({ entries, canWrite: t.canWrite });
}));
app.post("/api/mkdir", auth, wrap((req, res) => { const t = target(req); needWrite(t); fs.mkdirSync(t.abs, { recursive: true }); res.json({ ok: true }); }));
app.post("/api/move", auth, wrap((req, res) => {
  const t = target(req); needWrite(t);
  const to = safeJoin(t.base, req.body.to);
  if (!fs.existsSync(t.abs) || fs.existsSync(to)) throw fail(409, "Source absente ou destination existante");
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(t.abs, to); res.json({ ok: true });
}));
app.delete("/api/file", auth, wrap((req, res) => {
  const t = target(req); needWrite(t);
  if (!t.rel) throw fail(400, "Impossible de supprimer la racine");
  fs.rmSync(t.abs, { recursive: true, force: true }); res.json({ ok: true });
}));
app.get("/api/file", auth, wrap((req, res) => {
  const t = target(req);
  if (!fs.existsSync(t.abs) || fs.statSync(t.abs).isDirectory()) throw fail(404, "Introuvable");
  res.sendFile(t.abs, { headers: { "Cache-Control": "no-store" } }); // gère aussi Range (audio/vidéo)
}));
app.put("/api/file", auth, express.raw({ type: () => true, limit: "500mb" }), wrap((req, res) => {
  const t = target(req); needWrite(t);
  if (!t.rel) throw fail(400, "Chemin manquant");
  fs.mkdirSync(path.dirname(t.abs), { recursive: true });
  if (isDoc(t.abs)) snapshot(t, req.query.snap === "1");
  fs.writeFileSync(t.abs, req.body);
  res.json({ ok: true, mtime: Date.now() });
}));
app.get("/api/versions", auth, wrap((req, res) => {
  const t = target(req); const d = vDir(t);
  res.json(fs.existsSync(d) ? fs.readdirSync(d).sort().reverse().map((f) => Number(f.split(".")[0])) : []);
}));
app.get("/api/version", auth, wrap((req, res) => {
  const t = target(req); const f = path.join(vDir(t), `${Number(req.query.v)}.html`);
  if (!fs.existsSync(f)) throw fail(404, "Version introuvable");
  res.type("text/html").send(fs.readFileSync(f));
}));

// ── Partages ─────────────────────────────────────────────────────────────
app.get("/api/shares", auth, (req, res) => {
  const { id, role, meta } = req.me;
  const label = (s) => ({ id: s.id, name: s.name, path: s.path, owner: s.owner, ownerName: meta.users[s.owner]?.name || s.owner,
    with: s.with, mode: s.mode, toTeacher: s.toTeacher, createdAt: s.createdAt, correction: s.correction ? { at: s.correction.at, status: s.correction.status } : null });
  res.json({
    incoming: meta.shares.filter((s) => (role === "admin" ? s.toTeacher : s.with.includes(id))).map(label),
    outgoing: role === "admin" ? [] : meta.shares.filter((s) => s.owner === id).map(label),
  });
});
app.post("/api/shares", auth, wrap(async (req, res) => {
  const { sheet, id, role, meta } = req.me;
  if (role === "admin") throw fail(400, "Réservé aux élèves");
  const { path: rel, withUsers = [], toTeacher = false, mode = "view" } = req.body || {};
  const abs = safeJoin(path.join(sheetDir(sheet), id), rel);
  if (!rel || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) throw fail(404, "Document introuvable");
  const ids = withUsers.filter((u) => meta.users[u] && u !== id); // uniquement la même feuille d'appel
  let s = meta.shares.find((x) => x.owner === id && x.path === rel);
  if (!s) { s = { id: rid(), owner: id, path: rel, name: path.basename(rel).replace(/\.doc\.html$/, ""), with: [], mode: "view", toTeacher: false, createdAt: Date.now() }; meta.shares.push(s); }
  s.with = ids; s.mode = mode === "edit" ? "edit" : "view";
  const newlyTeacher = !!toTeacher && !s.toTeacher;
  s.toTeacher = !!toTeacher;
  if (!s.with.length && !s.toTeacher) meta.shares = meta.shares.filter((x) => x !== s);
  saveMeta(sheet, meta);
  if (newlyTeacher) mail(meta.teacherEmail, `Scribe : « ${s.name} » partagé par ${req.me.name}`,
    `<p><b>${req.me.name}</b> a partagé le document « ${s.name} » avec vous dans Martinews Scribe (onglet Corrections).</p>`);
  res.json({ ok: true, id: s.id });
}));
// Correction par l'enseignant : le texte d'origine est conservé pour marquer les changements.
app.put("/api/correction", auth, adminOnly, wrap((req, res) => {
  const t = target(req); const s = t.share;
  if (!s || !s.toTeacher) throw fail(400, "Partage invalide");
  const original = s.correction?.status === "pending" ? s.correction.base : fs.readFileSync(t.abs, "utf8");
  s.correction = { base: original, html: String(req.body.html || ""), at: Date.now(), status: "pending" };
  saveMeta(req.me.sheet, req.me.meta); res.json({ ok: true });
}));
app.get("/api/correction", auth, wrap((req, res) => { const t = target(req); res.json(t.share?.correction || null); }));
app.post("/api/correction/accept", auth, wrap((req, res) => {
  const t = target(req); const s = t.share;
  if (!s || s.owner !== req.me.id || !s.correction) throw fail(400, "Rien à accepter");
  snapshot(t, true); fs.writeFileSync(t.abs, s.correction.html);
  s.correction = { ...s.correction, status: "accepted" }; saveMeta(req.me.sheet, req.me.meta); res.json({ ok: true });
}));

// ── Administration (enseignant) ──────────────────────────────────────────
app.get("/api/admin/users", auth, adminOnly, (req, res) =>
  res.json(Object.entries(req.me.meta.users).map(([id, u]) => ({ id, name: u.name, pending: u.mustReset }))));
app.post("/api/admin/users", auth, adminOnly, wrap(async (req, res) => {
  const { meta, sheet } = req.me; const name = String(req.body.name || "").trim(); if (!name) throw fail(400, "Nom manquant");
  let id = slug(name), i = 2; while (meta.users[id]) id = `${slug(name)}.${i++}`;
  const code = code6();
  meta.users[id] = { name, hash: null, codeHash: await bcrypt.hash(code, 8), mustReset: true };
  fs.mkdirSync(path.join(sheetDir(sheet), id), { recursive: true }); saveMeta(sheet, meta);
  res.json({ users: [{ id, name, user: id, code }] });
}));
// Réinitialiser le mot de passe = nouveau code à 6 chiffres + changement obligatoire.
app.post("/api/admin/regenerate", auth, adminOnly, wrap(async (req, res) => {
  const { meta, sheet } = req.me; const ids = Array.isArray(req.body.ids) && req.body.ids.length ? req.body.ids : Object.keys(meta.users);
  const out = [];
  for (const id of ids) { const u = meta.users[id]; if (!u) continue;
    const code = code6(); u.codeHash = await bcrypt.hash(code, 8); u.hash = null; u.mustReset = true;
    out.push({ id, name: u.name, user: id, code }); }
  saveMeta(sheet, meta); res.json({ users: out });
}));
app.put("/api/admin/shared-rules", auth, adminOnly, (req, res) => {
  const rules = (Array.isArray(req.body.rules) ? req.body.rules : []).map((r) => ({
    path: "/" + String(r.path || "").split(/[\\/]+/).filter(Boolean).join("/"),
    editors: Array.isArray(r.editors) ? r.editors.map(String) : [] }));
  req.me.meta.sharedRules = rules; saveMeta(req.me.sheet, req.me.meta); res.json({ ok: true });
});
app.get("/api/admin/shared-rules", auth, adminOnly, (req, res) => res.json(req.me.meta.sharedRules));
app.put("/api/admin/settings", auth, adminOnly, (req, res) => {
  req.me.meta.teacherEmail = String(req.body.teacherEmail || ""); saveMeta(req.me.sheet, req.me.meta); res.json({ ok: true });
});
app.get("/api/health", (_q, r) => r.json({ ok: true }));

app.use((err, _req, res, _next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "Erreur serveur" });
});
export { app };
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname))
  app.listen(PORT, () => console.log(`Scribe server sur :${PORT} — données : ${ROOT}`));
