import { useEffect, useState } from "react";
import { A, type Share } from "./api";
import type { Open } from "./App";
import { fmtDate } from "./util";

export default function Corrections({ onOpen }: { onOpen: (o: Open) => void }) {
  const [s, setS] = useState<Share[] | null>(null);
  useEffect(() => { A.shares().then((r) => setS(r.incoming)); }, []);
  if (!s) return <p className="muted">Chargement…</p>;
  return (
    <div className="files">
      <h3>Documents à corriger</h3>
      <table><tbody>
        {s.map((x) => (
          <tr key={x.id} onClick={() => onOpen({ loc: { share: x.id }, name: x.name + ".doc.html", canWrite: true })}>
            <td>📝 {x.name}</td><td className="muted">{x.ownerName}</td><td className="muted">{fmtDate(x.createdAt)}</td>
            <td>{x.correction ? (x.correction.status === "accepted" ? "✓ corrections acceptées" : "corrigé — en attente de l'élève") : "à corriger"}</td></tr>))}
        {!s.length && <tr><td className="muted">Aucun document reçu.</td></tr>}
      </tbody></table>
    </div>
  );
}
