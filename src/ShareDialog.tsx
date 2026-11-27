import { useEffect, useState } from "react";
import { A } from "./api";

export default function ShareDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [teacher, setTeacher] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [err, setErr] = useState("");
  useEffect(() => {
    A.users().then(setUsers);
    A.shares().then((s) => { const x = s.outgoing.find((o) => o.path === path); if (x) { setSel(x.with); setTeacher(x.toTeacher); setMode(x.mode); } });
  }, [path]);
  const save = () => A.share(path, sel, teacher, mode).then(onClose).catch((e) => setErr(e.message));
  return (
    <div className="modal" onClick={onClose}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <h3>Partager « {path.split("/").pop()?.replace(/\.doc\.html$/, "")} »</h3>
        <p className="muted">Avec les personnes de ta feuille d'appel, puis avec l'enseignant pour correction.</p>
        <div className="list">
          {users.map((u) => (
            <label key={u.id} className="check"><input type="checkbox" checked={sel.includes(u.id)}
              onChange={(e) => setSel(e.target.checked ? [...sel, u.id] : sel.filter((x) => x !== u.id))} /> {u.name}</label>
          ))}
        </div>
        <label>Droits des personnes choisies
          <select value={mode} onChange={(e) => setMode(e.target.value as "view" | "edit")}>
            <option value="view">Lecture seule</option><option value="edit">Peuvent modifier</option></select></label>
        <label className="check"><input type="checkbox" checked={teacher} onChange={(e) => setTeacher(e.target.checked)} /> Envoyer à l'enseignant pour correction (il reçoit un mail)</label>
        {err && <p className="err">{err}</p>}
        <div className="row"><button onClick={onClose}>Annuler</button><button className="primary" onClick={save}>Enregistrer</button></div>
      </div>
    </div>
  );
}
