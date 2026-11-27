import { useCallback, useEffect, useState } from "react";
import { A, hasToken, logout, type Loc, type Me } from "./api";
import Admin from "./Admin";
import Corrections from "./Corrections";
import Editor from "./Editor";
import Files from "./Files";
import Login from "./Login";
import SharedWithMe from "./SharedWithMe";
import { checkForUpdate } from "./update";
import Viewer from "./Viewer";
import { isDoc } from "./util";

type Tab = "me" | "shared" | "incoming" | "corrections" | "admin";
export type Open = { loc: Loc; name: string; canWrite: boolean };

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(hasToken());
  const [tab, setTab] = useState<Tab>("me");
  const [open, setOpen] = useState<Open | null>(null);

  const load = useCallback(async () => {
    try { const m = await A.me(); if (m.mustReset) throw new Error(); setMe(m); setTab(m.role === "admin" ? "corrections" : "me"); }
    catch { logout(); setMe(null); } finally { setChecking(false); }
  }, []);
  useEffect(() => { if (hasToken()) load(); }, [load]);
  useEffect(() => { checkForUpdate((v) => confirm(`Une nouvelle version (${v}) de Scribe est disponible. L'installer maintenant ?`)); }, []);

  if (checking) return <div className="center">Chargement…</div>;
  if (!me) return <Login onDone={load} />;

  const tabs: [Tab, string][] = me.role === "admin"
    ? [["corrections", "Corrections"], ["shared", "Dossier partagé"], ["admin", "Administration"]]
    : [["me", "Mes documents"], ["incoming", "Partagés avec moi"], ["shared", "Dossier partagé"]];
  const go = (t: Tab) => { setTab(t); setOpen(null); };

  return (
    <div className="app">
      <header>
        <b className="brand">Martinews <span>Scribe</span></b>
        <nav>{tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{l}</button>)}</nav>
        <span className="grow" />
        <span className="muted">{me.name} · {me.sheetName}</span>
        <button onClick={() => { logout(); setMe(null); }}>Déconnexion</button>
      </header>
      <main>
        {open ? (
          isDoc(open.name)
            ? <Editor key={JSON.stringify(open.loc)} me={me} open={open} onClose={() => setOpen(null)} />
            : <Viewer open={open} onClose={() => setOpen(null)} />
        ) : tab === "me" ? <Files key="me" me={me} scope="me" onOpen={setOpen} />
          : tab === "shared" ? <Files key="sh" me={me} scope="shared" onOpen={setOpen} />
          : tab === "incoming" ? <SharedWithMe onOpen={setOpen} />
          : tab === "corrections" ? <Corrections onOpen={setOpen} />
          : <Admin />}
      </main>
    </div>
  );
}
