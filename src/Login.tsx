import { useState } from "react";
import { A, apiBase, setToken } from "./api";

export default function Login({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ sheet: localStorage.getItem("scribe_sheet") || "", user: "", secret: "" });
  const [server, setServer] = useState(apiBase());
  const [pw, setPw] = useState({ a: "", b: "" });
  const [first, setFirst] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => { setErr(""); setBusy(true); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };

  const login = () => run(async () => {
    localStorage.setItem("scribe_api", server.trim()); localStorage.setItem("scribe_sheet", f.sheet);
    const r = await A.login(f.sheet.trim(), f.user.trim(), f.secret);
    setToken(r.token, remember && !r.mustReset);
    if (r.mustReset) setFirst(true); else onDone();
  });
  const reset = () => run(async () => {
    if (pw.a !== pw.b) throw new Error("Les deux mots de passe sont différents");
    await A.password(pw.a); setToken((await A.login(f.sheet.trim(), f.user.trim(), pw.a)).token, remember); onDone();
  });

  return (
    <div className="login">
      <h1>Martinews <span>Scribe</span></h1>
      {!first ? (
        <form onSubmit={(e) => { e.preventDefault(); login(); }}>
          <p className="muted">Première connexion : utilise le code à 6 chiffres remis par ton enseignant.</p>
          <label>Nom de la feuille<input value={f.sheet} onChange={(e) => setF({ ...f, sheet: e.target.value })} autoFocus required /></label>
          <label>Identifiant<input value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} autoCapitalize="none" required /></label>
          <label>Mot de passe ou code à 6 chiffres<input type="password" value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} required /></label>
          <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Rester connecté</label>
          <details><summary>Serveur</summary><input value={server} onChange={(e) => setServer(e.target.value)} /></details>
          {err && <p className="err">{err}</p>}
          <button className="primary" disabled={busy}>Se connecter</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); reset(); }}>
          <p>Choisis ton mot de passe (8 caractères minimum). Le code à 6 chiffres sera supprimé.</p>
          <label>Nouveau mot de passe<input type="password" minLength={8} value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} required /></label>
          <label>Confirmer<input type="password" minLength={8} value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} required /></label>
          {err && <p className="err">{err}</p>}
          <button className="primary" disabled={busy}>Enregistrer et entrer</button>
        </form>
      )}
    </div>
  );
}
