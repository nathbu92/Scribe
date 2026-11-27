import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { A, type Me } from "./api";
import type { Open } from "./App";
import { diffHtml, docTitle, exportHtml, exportPdf, exportWord, fmtDate } from "./util";

type Corr = { base: string; html: string; at: number; status: string } | null;

export default function Editor({ me, open, onClose }: { me: Me; open: Open; onClose: () => void }) {
  const { loc } = open;
  const corrector = me.role === "admin" && !!loc.share; // l'enseignant corrige : l'original est conservé
  const editable = corrector || open.canWrite;
  const [state, setState] = useState<"loading" | "saved" | "dirty" | "saving" | "error">("loading");
  const [msg, setMsg] = useState("");
  const [corr, setCorr] = useState<Corr>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [versions, setVersions] = useState<number[] | null>(null);
  const [preview, setPreview] = useState<{ v: number; html: string } | null>(null);
  const timer = useRef<number>();
  const ready = useRef(false);
  const shareId = useRef<string | undefined>(loc.share);

  const editor = useEditor({
    extensions: [StarterKit, Underline, Link.configure({ openOnClick: false }), Image, TextAlign.configure({ types: ["heading", "paragraph"] })],
    editable,
    onUpdate: () => { if (ready.current && editable) { setState("dirty"); schedule(); } },
  }, [editable]);

  const save = useCallback(async (snap = false) => {
    if (!editor || !editable) return;
    setState("saving");
    try {
      const html = editor.getHTML();
      if (corrector) await A.saveCorrection(loc.share!, html); else await A.write(loc, html, snap);
      setState("saved"); setMsg("");
      if (corrector) A.correction(loc.share!).then(setCorr);
    } catch (e) { setState("error"); setMsg((e as Error).message); }
  }, [editor, editable, corrector, loc]);
  const schedule = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => save(), 1500); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { // enregistre en quittant
    const h = () => { if (state === "dirty") save(); };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [state, save]);

  useEffect(() => { // chargement
    if (!editor) return;
    (async () => {
      try {
        let html = await A.read(loc);
        if (!shareId.current && me.role === "user") shareId.current = (await A.shares()).outgoing.find((s) => s.path === loc.path)?.id;
        const c = shareId.current ? await A.correction(shareId.current).catch(() => null) : null;
        setCorr(c);
        if (corrector && c?.status === "pending") html = c.html;
        editor.commands.setContent(html, false); ready.current = true; setState("saved");
      } catch (e) { setState("error"); setMsg((e as Error).message); }
    })();
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const diff = useMemo(() => (corr ? diffHtml(corr.base, corr.html) : ""), [corr]);
  const title = docTitle(open.name);
  const pending = corr?.status === "pending";

  const openVersions = async () => setVersions(await A.versions(loc));
  const pickVersion = async (v: number) => setPreview({ v, html: await A.version(loc, v) });
  const insertImage = () => {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
    i.onchange = () => { const f = i.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => editor?.chain().focus().setImage({ src: String(r.result) }).run(); r.readAsDataURL(f); };
    i.click();
  };
  const T = ({ on, act, label, title: t }: { on?: boolean; act: () => void; label: string; title: string }) =>
    <button type="button" title={t} className={on ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); act(); }}>{label}</button>;
  const c = () => editor!.chain().focus();

  return (
    <div className="editor">
      <div className="bar">
        <button onClick={async () => { if (state === "dirty") await save(); onClose(); }}>← Retour</button>
        <b>{title}</b>{corrector && <span className="tag">mode correction</span>}{!editable && <span className="tag">lecture seule</span>}
        <span className="grow" />
        <span className={`muted st-${state}`}>{{ loading: "Chargement…", saved: "Enregistré ✓", dirty: "Modifié…", saving: "Enregistrement…", error: "Erreur" }[state]}{msg && ` — ${msg}`}</span>
        <button onClick={openVersions}>Historique</button>
        <button onClick={() => editor && exportWord(title, editor.getHTML())}>Word</button>
        <button onClick={() => editor && exportHtml(title, editor.getHTML())}>HTML</button>
        <button onClick={() => editor && exportPdf(title, editor.getHTML())}>PDF</button>
      </div>
      {editor && editable && (
        <div className="toolbar">
          <T title="Annuler" label="↶" act={() => c().undo().run()} /><T title="Rétablir" label="↷" act={() => c().redo().run()} />
          <i />
          <T title="Gras" label="G" on={editor.isActive("bold")} act={() => c().toggleBold().run()} />
          <T title="Italique" label="I" on={editor.isActive("italic")} act={() => c().toggleItalic().run()} />
          <T title="Souligné" label="S̲" on={editor.isActive("underline")} act={() => c().toggleUnderline().run()} />
          <T title="Barré" label="S̶" on={editor.isActive("strike")} act={() => c().toggleStrike().run()} />
          <i />
          <T title="Titre" label="H1" on={editor.isActive("heading", { level: 1 })} act={() => c().toggleHeading({ level: 1 }).run()} />
          <T title="Sous-titre" label="H2" on={editor.isActive("heading", { level: 2 })} act={() => c().toggleHeading({ level: 2 }).run()} />
          <T title="Liste" label="• —" on={editor.isActive("bulletList")} act={() => c().toggleBulletList().run()} />
          <T title="Liste numérotée" label="1." on={editor.isActive("orderedList")} act={() => c().toggleOrderedList().run()} />
          <T title="Citation" label="❝" on={editor.isActive("blockquote")} act={() => c().toggleBlockquote().run()} />
          <i />
          <T title="Gauche" label="⯇" act={() => c().setTextAlign("left").run()} /><T title="Centré" label="≡" act={() => c().setTextAlign("center").run()} /><T title="Droite" label="⯈" act={() => c().setTextAlign("right").run()} />
          <i />
          <T title="Lien" label="🔗" act={() => { const u = prompt("Adresse du lien (vide pour l'enlever)"); if (u === null) return; u ? c().setLink({ href: u }).run() : c().unsetLink().run(); }} />
          <T title="Image" label="🖼" act={insertImage} />
          <T title="Enregistrer une version" label="💾" act={() => save(true)} />
        </div>
      )}
      {pending && (
        <div className="banner">
          {corrector ? "Corrections enregistrées : l'élève les verra marquées." : "Ton enseignant a corrigé ce document."}{" "}
          <button onClick={() => setShowDiff(!showDiff)}>{showDiff ? "Revenir au texte" : "Voir les corrections"}</button>
          {!corrector && me.role === "user" && <button className="primary" onClick={async () => { try { await A.acceptCorrection(shareId.current!); editor?.commands.setContent(corr!.html, false); setCorr({ ...corr!, status: "accepted" }); setShowDiff(false); } catch (e) { setMsg((e as Error).message); } }}>Accepter les corrections</button>}
        </div>
      )}
      <div className="page">
        {showDiff && corr ? <div className="diff" dangerouslySetInnerHTML={{ __html: diff }} /> : <EditorContent editor={editor} />}
      </div>
      {versions && (
        <aside className="versions">
          <div className="bar"><b>Historique</b><span className="grow" /><button onClick={() => { setVersions(null); setPreview(null); }}>✕</button></div>
          {!versions.length && <p className="muted">Pas encore de version enregistrée.</p>}
          {versions.map((v) => <div key={v} className={preview?.v === v ? "on" : ""} onClick={() => pickVersion(v)}>{fmtDate(v)}</div>)}
          {preview && <>
            <iframe sandbox="" srcDoc={preview.html} title="version" />
            {editable && !corrector && <button className="primary" onClick={() => { editor?.commands.setContent(preview.html, true); setPreview(null); }}>Restaurer cette version</button>}
          </>}
        </aside>
      )}
    </div>
  );
}
