// Mises à jour de l'app Tauri : vérification au lancement, signée, depuis les releases GitHub.
export const inTauri = () => "__TAURI_INTERNALS__" in window;
export async function checkForUpdate(ask: (v: string) => boolean) {
  if (!inTauri()) return;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { invoke } = await import("@tauri-apps/api/core");
    const up = await check();
    if (up && ask(up.version)) { await up.downloadAndInstall(); await invoke("restart_app"); }
  } catch (e) { console.warn("[update]", e); }
}
