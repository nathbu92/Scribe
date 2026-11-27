import { useEffect, useState } from "react";
import { A, type Code, type Rule } from "./api";
import { esc, exportPdf } from "./util";

const printCodes = (codes: Code[]) =>
  exportPdf("Codes Scribe", `<h2>Martinews Scribe — codes de première connexion</h2><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>Nom</th><th>Identifiant</th><th>Code</th></tr>${codes.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.user)}</td><td><b>${c.code}</b></td></tr>`).join("")}</table><p>À la première connexion : nom de la feuille + identifiant + code, puis choisis ton mot de passe.</p>`);

export default function Admin() {
  const [users, setUsers] = useState<{ id: string; name: string; pending: boolean }[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => { A.adminUsers().then(setUsers); A.rules().then(setRules); };
  useEffect(load, []);
  const run = (fn: () => Promise<unknown>, ok = "Fait ✓") => fn().then(() => { setMsg(ok); load(); }).catch((e) => setMsg(e.message));

  return (
    <div className="admin">
      {msg && <p className="banner">{msg}</p>}
      <section>
        <h3>Comptes</h3>
        <p className="muted">Réinitialiser = nouveau code à 6 chiffres ; la personne devra choisir un nouveau mot de passe.</p>
        <table><tbody>
          {users.map((u) => (
            <tr key={u.id}><td><input type="checkbox" checked={sel.includes(u.id)} onChange={(e) => setSel(e.target.checked ? [...sel, u.id] : sel.filter((x) => x !== u.id))} /></td>
              <td>{u.name}</td><td className="muted">{u.id}</td><td className="muted">{u.pending ? "n'a pas encore choisi son mot de passe" : "actif"}</td></tr>))}
        </tbody></table>
        <div className="row">
          <button disabled={!sel.length} onClick={() => run(async () => setCodes((await A.regenerate(sel)).users), "Nouveaux codes générés")}>Régénérer le code ({sel.length})</button>
          <button onClick={() => confirm("Régénérer le code de TOUTES les personnes ?") && run(async () => setCodes((await A.regenerate([])).users), "Codes générés")}>Tout régénérer</button>
          <input placeholder="Ajouter une personne" value={name} onChange={(e) => setName(e.target.value)} />
          <button disabled={!name.trim()} onClick={() => run(async () => { setCodes((await A.addUser(name)).users); setName(""); }, "Personne ajoutée")}>Ajouter</button>
        </div>
        {codes.length > 0 && <div className="codes"><b>Codes (affichés une seule fois) :</b>
          <ul>{codes.map((c) => <li key={c.id}>{c.name} — <code>{c.user}</code> — <code>{c.code}</code></li>)}</ul>
          <button className="primary" onClick={() => printCodes(codes)}>Imprimer / enregistrer en PDF</button></div>}
      </section>
      <section>
        <h3>Dossier partagé principal</h3>
        <p className="muted">Personne ne peut le modifier, sauf dans les dossiers que tu ouvres ci-dessous (chemin comme « /Ateliers/Radio »).</p>
        {rules.map((r, i) => (
          <div className="rule" key={i}>
            <input value={r.path} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)))} />
            <label className="check"><input type="checkbox" checked={r.editors.includes("*")} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, editors: e.target.checked ? ["*"] : [] } : x)))} /> Tout le monde</label>
            {!r.editors.includes("*") && <div className="list">{users.map((u) => (
              <label key={u.id} className="check"><input type="checkbox" checked={r.editors.includes(u.id)}
                onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, editors: e.target.checked ? [...x.editors, u.id] : x.editors.filter((y) => y !== u.id) } : x)))} /> {u.name}</label>))}</div>}
            <button className="danger" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Retirer</button>
          </div>))}
        <div className="row"><button onClick={() => setRules([...rules, { path: "/", editors: [] }])}>+ Dossier modifiable</button>
          <button className="primary" onClick={() => run(() => A.saveRules(rules), "Règles enregistrées")}>Enregistrer</button></div>
      </section>
      <section>
        <h3>Notifications</h3>
        <p className="muted">Adresse qui reçoit un mail (Brevo) quand un élève envoie un document.</p>
        <div className="row"><input type="email" placeholder="prof@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button onClick={() => run(() => A.settings(email), "Adresse enregistrée")}>Enregistrer</button></div>
      </section>
    </div>
  );
}
