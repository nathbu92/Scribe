import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "scribe-"));
process.env.WORKSPACE_CREATE_KEY = "k";
const { app } = await import("../src/index.js");

test("parcours complet : espace, 1re connexion, mot de passe, fichiers, correction", async () => {
  const srv = app.listen(0); const B = `http://localhost:${srv.address().port}/api`;
  const j = async (m, u, body, tok, raw) => {
    const r = await fetch(B + u, { method: m, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    return { status: r.status, body: await r.text().then((t) => { try { return JSON.parse(t); } catch { return t; } }) };
  };
  try {
    assert.equal((await j("POST", "/workspaces", { key: "x", sheetId: "A", adminUser: "p", adminPassword: "12345678", names: [] })).status, 403);
    const ws = (await j("POST", "/workspaces", { key: "k", sheetId: "A", adminUser: "prof", adminPassword: "12345678", names: ["Léa Martin"] })).body;
    const { user, code } = ws.users[0];
    assert.match(code, /^\d{6}$/);
    const first = (await j("POST", "/login", { sheet: "A", user, secret: code })).body;
    assert.equal(first.mustReset, true);
    await j("POST", "/password", { newPassword: "nouveaumdp1" }, first.token);
    assert.equal((await j("POST", "/login", { sheet: "A", user, secret: code })).status, 401, "le code est supprimé");
    const t = (await j("POST", "/login", { sheet: "A", user, secret: "nouveaumdp1" })).body.token;
    assert.equal((await j("PUT", "/file?path=a.doc.html", undefined, t, "<p>Bonjour</p>")).status, 200);
    assert.equal((await j("GET", "/file?path=../x", undefined, t)).status, 400);
    assert.equal((await j("PUT", "/file?scope=shared&path=x.txt", undefined, t, "x")).status, 403);
    await j("POST", "/shares", { path: "a.doc.html", toTeacher: true }, t);
    const at = (await j("POST", "/login", { sheet: "A", user: "prof", secret: "12345678" })).body.token;
    const sid = (await j("GET", "/shares", undefined, at)).body.incoming[0].id;
    await j("PUT", `/correction?share=${sid}`, { html: "<p>Bonjour !</p>" }, at);
    await j("POST", `/correction/accept?share=${sid}`, {}, t);
    assert.equal((await j("GET", "/file?path=a.doc.html", undefined, t)).body, "<p>Bonjour !</p>");
  } finally { srv.close(); }
});
