# Martinews Scribe

Espace d'écriture collaboratif lié à **Presence** : un compte par personne de la feuille d'appel,
documents type Word (TipTap) avec enregistrement auto et historique, partage dans la feuille,
corrections de l'enseignant marquées façon GitHub, dossier partagé en lecture seule.

```
docs/        site web (GitHub Pages) — build du front, config.js = adresse du serveur
src/         front React + TypeScript (partagé web + Tauri)
src-tauri/   app Windows / macOS / Linux (Tauri 2, mises à jour signées via GitHub Releases)
server/      serveur Node : comptes, fichiers, partages, corrections, mails Brevo
.github/     CI + Release (repris de Pieride, sans Discord)
```

## Serveur
```
cd server && npm ci && cp .env.example .env   # remplir WORKSPACE_CREATE_KEY, BREVO_*
node --env-file=.env src/index.js
```
Données : `DATA_DIR/Scribe/<feuille>/<personne>/…` (+ `shared/` = dossier partagé principal).
Le serveur doit être en **HTTPS** pour le site GitHub Pages (ex. Tailscale Funnel, comme Presence).

## Site web
`npm ci && npm run build:web` régénère `docs/`. Adresse du serveur : `docs/config.js`
(modifiable sans rebuild). GitHub : Settings > Pages > branche main, dossier `/docs`.

## App Tauri
`npm ci && npm run tauri dev` / `npm run tauri build`. Avant la 1re release :
1. `npm run tauri signer generate -- -w ~/.tauri/scribe.key`, coller la clé **publique** dans `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
2. Secrets du dépôt : `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`).
3. Adapter `plugins.updater.endpoints` au dépôt (`bunath/Scribe` par défaut).
4. Release : brouillon `v0.1.0` sur GitHub, branche `release/0.1.0`, Actions > Release.

## Flux
Presence > Admin > « Martinews Scribe » (identifiant + mot de passe admin, clé de création, mail prof)
→ comptes + **PDF des codes**. 1re connexion : nom de la feuille + identifiant + code → choix du mot de passe
(le code est supprimé). L'enseignant peut régénérer un/plusieurs/tous les codes (Administration).
