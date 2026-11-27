import { useEffect, useState } from "react";
import { A } from "./api";
import type { Open } from "./App";
import { download, ext } from "./util";

// Lecteurs intégrés au navigateur/WebView ; VLC et FFmpeg : voir README (lecture des formats exotiques).
export default function Viewer({ open, onClose }: { open: Open; onClose: () => void }) {
  const e = ext(open.name), url = A.fileUrl(open.loc);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { if (["txt", "md", "csv", "json", "log"].includes(e)) A.read(open.loc).then(setText).catch(() => setText("(illisible)")); }, [open, e]);
  const body = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(e) ? <img src={url} className="media" />
    : ["mp4", "webm", "mov", "m4v", "ogv"].includes(e) ? <video src={url} controls className="media" />
    : ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"].includes(e) ? <audio src={url} controls />
    : e === "pdf" ? <iframe src={url} className="pdf" title={open.name} />
    : text !== null ? <pre className="txt">{text}</pre>
    : <p className="muted">Aperçu indisponible pour ce format. Télécharge le fichier pour l'ouvrir (VLC pour les vidéos non lues ici).</p>;
  return (
    <div className="viewer">
      <div className="bar"><button onClick={onClose}>← Retour</button><b>{open.name}</b><span className="grow" />
        <button onClick={async () => { const r = await fetch(url); download(open.name, await r.blob(), "application/octet-stream"); }}>Télécharger</button></div>
      <div className="stage">{body}</div>
    </div>
  );
}
