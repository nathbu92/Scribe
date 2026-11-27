import { diffWords } from "diff";

export const isDoc = (n: string) => n.endsWith(".doc.html");
export const docTitle = (n: string) => n.replace(/\.doc\.html$/, "");
export const ext = (n: string) => n.split(".").pop()!.toLowerCase();
export const join = (a: string, b: string) => (a ? `${a}/${b}` : b);
export const parent = (p: string) => p.split("/").slice(0, -1).join("/");
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const wordWrap = (title: string, html: string) =>
  `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>${html}</body></html>`;
/** Export Word : un .doc (HTML) que Word, LibreOffice et Google Docs ouvrent tel quel. */
export const exportWord = (title: string, html: string) => download(`${title}.doc`, wordWrap(title, html), "application/msword");
export const exportHtml = (title: string, html: string) => download(`${title}.html`, wordWrap(title, html).replace("<html ", "<html lang=\"fr\" "), "text/html");
export function exportPdf(title: string, html: string) {
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(`<title>${esc(title)}</title><body style="font:12pt Georgia,serif;max-width:170mm;margin:auto">${html}</body>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

/** Texte brut d'un document, un retour à la ligne par bloc. */
export function plain(html: string) {
  const d = new DOMParser().parseFromString(html, "text/html");
  d.querySelectorAll("p,div,li,h1,h2,h3,h4,br,blockquote").forEach((e) => e.append("\n"));
  return (d.body.textContent || "").replace(/\n{3,}/g, "\n\n");
}
/** Marque les corrections façon GitHub : ancien texte barré en rouge, nouveau en vert, le reste intact. */
export function diffHtml(before: string, after: string) {
  return diffWords(plain(before), plain(after))
    .map((p) => (p.added ? `<ins>${esc(p.value)}</ins>` : p.removed ? `<del>${esc(p.value)}</del>` : esc(p.value)))
    .join("");
}
export const fmtDate = (t: number) => new Date(t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
export const fmtSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : n > 1e3 ? `${Math.round(n / 1e3)} Ko` : `${n} o`);
