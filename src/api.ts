// Client du serveur Scribe. L'adresse vient de config.js ou du champ « Serveur » de la connexion.
export type Me = { sheet: string; id: string; role: "admin" | "user"; name: string; sheetName: string; mustReset: boolean };
export type Entry = { name: string; type: "file" | "dir"; size: number; mtime: number };
export type Share = { id: string; name: string; path: string; owner: string; ownerName: string; with: string[]; mode: "view" | "edit"; toTeacher: boolean; createdAt: number; correction: { at: number; status: string } | null };
/** Où se trouve un fichier : mon dossier, le dossier partagé, ou un document partagé avec moi. */
export type Loc = { scope?: "me" | "shared"; path?: string; share?: string };

declare global { interface Window { SCRIBE_CONFIG?: { api: string } } }
export const apiBase = () => (localStorage.getItem("scribe_api") || window.SCRIBE_CONFIG?.api || "http://localhost:8787/api").replace(/\/$/, "");
let token = sessionStorage.getItem("scribe_token") || localStorage.getItem("scribe_token") || "";
export function setToken(t: string, remember: boolean) {
  token = t; sessionStorage.setItem("scribe_token", t);
  if (remember) localStorage.setItem("scribe_token", t); else localStorage.removeItem("scribe_token");
}
export function logout() { token = ""; sessionStorage.removeItem("scribe_token"); localStorage.removeItem("scribe_token"); }
export const hasToken = () => !!token;

const qs = (l: Loc, extra: Record<string, string> = {}) =>
  new URLSearchParams({ ...(l.share ? { share: l.share } : { scope: l.scope || "me", path: l.path || "" }), ...extra }).toString();

async function call<T>(method: string, url: string, body?: unknown, raw?: BodyInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiBase() + url, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch { throw new Error("Serveur injoignable"); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export const A = {
  login: (sheet: string, user: string, secret: string) => call<{ token: string; mustReset: boolean; role: string }>("POST", "/login", { sheet, user, secret }),
  password: (newPassword: string) => call("POST", "/password", { newPassword }),
  me: () => call<Me>("GET", "/me"),
  users: () => call<{ id: string; name: string }[]>("GET", "/users"),
  ls: (l: Loc) => call<{ entries: Entry[]; canWrite: boolean }>("GET", `/ls?${qs(l)}`),
  mkdir: (l: Loc) => call("POST", `/mkdir?${qs(l)}`, {}),
  move: (l: Loc, to: string) => call("POST", `/move?${qs(l)}`, { to }),
  del: (l: Loc) => call("DELETE", `/file?${qs(l)}`),
  read: (l: Loc) => call<string>("GET", `/file?${qs(l)}`),
  write: (l: Loc, data: BodyInit, snap = false) => call("PUT", `/file?${qs(l, snap ? { snap: "1" } : {})}`, undefined, data),
  /** URL directe (audio, vidéo, images…) : le jeton passe dans l'adresse. */
  fileUrl: (l: Loc) => `${apiBase()}/file?${qs(l, { t: token })}`,
  versions: (l: Loc) => call<number[]>("GET", `/versions?${qs(l)}`),
  version: (l: Loc, v: number) => call<string>("GET", `/version?${qs(l, { v: String(v) })}`),
  shares: () => call<{ incoming: Share[]; outgoing: Share[] }>("GET", "/shares"),
  share: (path: string, withUsers: string[], toTeacher: boolean, mode: "view" | "edit") => call("POST", "/shares", { path, withUsers, toTeacher, mode }),
  correction: (id: string) => call<{ base: string; html: string; at: number; status: string } | null>("GET", `/correction?share=${id}`),
  saveCorrection: (id: string, html: string) => call("PUT", `/correction?share=${id}`, { html }),
  acceptCorrection: (id: string) => call("POST", `/correction/accept?share=${id}`, {}),
  adminUsers: () => call<{ id: string; name: string; pending: boolean }[]>("GET", "/admin/users"),
  addUser: (name: string) => call<{ users: Code[] }>("POST", "/admin/users", { name }),
  regenerate: (ids: string[]) => call<{ users: Code[] }>("POST", "/admin/regenerate", { ids }),
  rules: () => call<Rule[]>("GET", "/admin/shared-rules"),
  saveRules: (rules: Rule[]) => call("PUT", "/admin/shared-rules", { rules }),
  settings: (teacherEmail: string) => call("PUT", "/admin/settings", { teacherEmail }),
};
export type Code = { id: string; name: string; user: string; code: string };
export type Rule = { path: string; editors: string[] };
