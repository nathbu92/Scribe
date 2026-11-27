import { useCallback, useEffect, useRef, useState } from "react";
import mammoth from "mammoth";
import { A, type Entry, type Me } from "./api";
import type { Open } from "./App";
import ShareDialog from "./ShareDialog";
import { docTitle, ext, fmtDate, fmtSize, isDoc, join, parent } from "./util";

export default function Files({ me, scope, onOpen }: { me: Me; scope: "me" | "shared"; onOpen: (o: Open) => void }) {
  const [dir, setDir] = useState("");
  const [list, setList] = useState<Entry[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [err, setErr] = useState("");
  const [sharing, setSharing] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try { const r = await A.ls({ scope, path: dir }); setList(r.entries); setCanWrite(r.canWrite); setErr(""); }
    catch (e) { setErr((e as Error).message); }
  }, [scope, dir]);
  useEffect(() => { refresh(); }, [refresh]);
  const run = (fn: () => Promise<unknown>) => fn().then(refresh).catch((e) => setErr((e as Error).message));

  const upload = (files: FileList | File[]) => run(async () => {
    for (const f of Array.from(files)) {
      const e = ext(f.name);
      if (e === "docx") { // Word → document Scribe
        const { value } = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
        await A.write({ scope, path: join(dir, f.name.replace(/\.docx$/i, "") + ".doc.html") }, value);
      } else if (["html", "htm"].includes(e) || (e === "txt" && f.size < 2e6)) {
        const t = await f.text();
        const html = e === "txt" ? t.split(/\n+/).map((l) => `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("") : t.replace(/^[\s\S]*?<body[^>]*>|<\/body>[\s\S]*$/gi, "");
        await A.write({ scope, path: join(dir, f.name.replace(/\.[^.]+$/, "") + ".doc.html") }, html);
      } else await A.write({ scope, path: join(dir, f.name) }, f); // n'importe quel autre fichier
    }
  });

  const crumbs = dir ? dir.split("/") : [];
  return (
    <div className={`files ${drag ? "drag" : ""}`}
      onDragOver={(e) => { if (canWrite) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (canWrite) upload(e.dataTransfer.files); }}>
      <div className="bar">
        <span className="crumbs"><a onClick={() => setDir("")}>{scope === "shared" ? "Dossier partagé" : "Mon espace"}</a>
          {crumbs.map((c, i) => <span key={i}> / <a onClick={() => setDir(crumbs.slice(0, i + 1).join("/"))}>{c}</a></span>)}</span>
        <span className="grow" />
        {canWrite && <>
          <button onClick={() => { const n = prompt("Nom du document ?"); if (n) run(async () => { await A.write({ scope, path: join(dir, `${n}.doc.html`) }, "<p></p>"); onOpen({ loc: { scope, path: join(dir, `${n}.doc.html`) }, name: `${n}.doc.html`, canWrite }); }); }}>+ Document</button>
          <button onClick={() => { const n = prompt("Nom du dossier ?"); if (n) run(() => A.mkdir({ scope, path: join(dir, n) })); }}>+ Dossier</button>
          <button onClick={() => input.current?.click()}>Importer</button>
          <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files).then(() => (e.target.value = ""))} />
        </>}
      </div>
      {!canWrite && scope === "shared" && <p className="muted">Lecture seule{me.role === "user" ? " (sauf dossiers ouverts par l'enseignant)." : "."}</p>}
      {err && <p className="err">{err}</p>}
      <table>
        <tbody>
          {dir && <tr onClick={() => setDir(parent(dir))}><td colSpan={4}>📁 ..</td></tr>}
          {list.map((e) => {
            const p = join(dir, e.name);
            return (
              <tr key={e.name} onClick={() => e.type === "dir" ? setDir(p) : onOpen({ loc: { scope, path: p }, name: e.name, canWrite })}>
                <td>{e.type === "dir" ? "📁" : isDoc(e.name) ? "📝" : "📄"} {e.type === "file" && isDoc(e.name) ? docTitle(e.name) : e.name}</td>
                <td className="muted">{e.type === "file" ? fmtSize(e.size) : ""}</td>
                <td className="muted">{fmtDate(e.mtime)}</td>
                <td className="acts" onClick={(ev) => ev.stopPropagation()}>
                  {scope === "me" && e.type === "file" && isDoc(e.name) && <button onClick={() => setSharing(p)}>Partager</button>}
                  {canWrite && <button onClick={() => { const n = prompt("Nouveau nom / chemin ?", p); if (n && n !== p) run(() => A.move({ scope, path: p }, n)); }}>Renommer</button>}
                  {canWrite && <button className="danger" onClick={() => confirm(`Supprimer « ${e.name} » ?`) && run(() => A.del({ scope, path: p }))}>Supprimer</button>}
                </td>
              </tr>
            );
          })}
          {!list.length && <tr><td colSpan={4} className="muted">Dossier vide{canWrite ? " — crée un document ou glisse des fichiers ici." : "."}</td></tr>}
        </tbody>
      </table>
      {sharing && <ShareDialog path={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}
