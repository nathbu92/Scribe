import { useEffect, useState } from "react";
import { A, type Share } from "./api";
import type { Open } from "./App";
import { fmtDate } from "./util";

export default function SharedWithMe({ onOpen }: { onOpen: (o: Open) => void }) {
  const [s, setS] = useState<{ incoming: Share[]; outgoing: Share[] } | null>(null);
  useEffect(() => { A.shares().then(setS); }, []);
  if (!s) return <p className="muted">Chargement…</p>;
  return (
    <div className="files">
      <h3>Partagés avec moi</h3>
      <table><tbody>
        {s.incoming.map((x) => (
          <tr key={x.id} onClick={() => onOpen({ loc: { share: x.id }, name: x.name + ".doc.html", canWrite: x.mode === "edit" })}>
            <td>📝 {x.name}</td><td className="muted">de {x.ownerName}</td><td className="muted">{x.mode === "edit" ? "modifiable" : "lecture"}</td><td className="muted">{fmtDate(x.createdAt)}</td></tr>))}
        {!s.incoming.length && <tr><td className="muted">Rien pour l'instant.</td></tr>}
      </tbody></table>
      <h3>Que j'ai partagés</h3>
      <table><tbody>
        {s.outgoing.map((x) => (
          <tr key={x.id} onClick={() => onOpen({ loc: { share: x.id }, name: x.name + ".doc.html", canWrite: true })}>
            <td>📝 {x.name}</td><td className="muted">{x.with.length} personne(s){x.toTeacher ? " + enseignant" : ""}</td>
            <td className="muted">{x.correction?.status === "pending" ? "⚠ corrections à relire" : x.correction ? "corrigé ✓" : ""}</td></tr>))}
        {!s.outgoing.length && <tr><td className="muted">Rien pour l'instant.</td></tr>}
      </tbody></table>
    </div>
  );
}
