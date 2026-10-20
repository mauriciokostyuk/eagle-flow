# Eagle Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the OpenWhispr fork as Eagle Flow (Groq-first, pt-BR, hold Alt+Space), ship Mac/Windows installers via GitHub Releases on tags, and link downloads from Eagle Eye's Ferramentas menu.

**Architecture:** Change defaults in the existing settings store/hotkey modules (no new engines: Groq BYOK and local whisper.cpp fallback already exist). Release via the existing `release.yml`, stripped of signing. Eagle Eye gets one nav registry entry + one page.

**Tech Stack:** Electron 41, React 19, Zustand, electron-builder, node:test (eagle-flow); Vite/React 18/Tailwind 3, node:test via backend helper (eagle-eye).

**Spec:** the user request in this session (fork/rebrand, Groq default + whisper.cpp fallback, pt-BR, hold Alt+Space, release on tag v1.0.0, Eagle Eye Ferramentas item + PR, never merge to main).

## Global Constraints

- Product name `Eagle Flow`; appId `com.eaglemidiadigital.eagleflow`; package name `eagle-flow`; version `1.0.0`.
- Brand colors (from eagle-eye `tailwind.config.ts`): primary `#2b62d6`, navy `#020925` / `#0d2662`; font Inter. Icon source: `/Users/felipe/eagle-eye/frontend/public/logo-eagle.webp`.
- Default STT: `cloudTranscriptionMode: "byok"`, provider `groq`, model `whisper-large-v3-turbo`, base URL `https://api.groq.com/openai/v1`, `allowLocalFallback: true` (whisper.cpp, `fallbackWhisperModel: "base"`).
- Groq key only via `GROQ_API_KEY` in `.env` (gitignored) / CI secret. Never commit keys.
- Default `preferredLanguage: "pt"` (Whisper ISO code), UI language `pt`.
- Default `dictationKey: "Alt+Space"`, `activationMode: "push"` (hold).
- Releases: `mauriciokostyuk/eagle-flow`, unsigned Mac (dmg, x64+arm64) + Windows (nsis), published (not draft) on tag `v*`.
- Eagle Eye: branch `feat/eagle-flow`, PR to main, never merge. Commits in Portuguese, conventional.

## Review Focus

- No `GROQ_API_KEY` present → transcription must fall back to local whisper.cpp instead of failing silently (covered by fallback default test, Task 2).
- Existing users with stored settings must not be overwritten (defaults only apply when keys absent) — Task 2 test seeds storage.
- `Alt+Space` must not be rejected by `hotkeyValidator` reserved list — Task 2 test.
- Tag/version mismatch fails release — package.json version `1.0.0` must match tag (Task 3).
- Download links must point exactly to `https://github.com/mauriciokostyuk/eagle-flow/releases/latest` (Task 4 test).

---

### Task 1: Rebrand (name, icon, colors)

**Files:** `package.json` (name, version 1.0.0, description), `electron-builder.json` (appId, productName, protocol `eagleflow`, dmg title, usage strings, publish owner/repo, `releaseType: "release"`, mac `identity: null`, `notarize: false`), `main.js:270`, `src/index.html:18`, `src/locales/*/translation.json` tray tooltip/app name strings, `src/assets/icon.{icns,ico,png}`, `iconTemplate@3x.png`, `logo.svg`, `openwhispr.icon` image, `src/index.css` color tokens, `README.md` header.

- [ ] Step 1: Write `test/branding/eagleFlowBranding.test.js`: asserts `electron-builder.json` productName `"Eagle Flow"`, appId `com.eaglemidiadigital.eagleflow`, publish `{owner:"mauriciokostyuk",repo:"eagle-flow"}`; `package.json` name `eagle-flow`, version `1.0.0`; `src/index.css` contains `--color-primary: #2b62d6`; `src/index.html` title `Eagle Flow`.
- [ ] Step 2: Run `npm test -- ` (or `node --import tsx --test test/branding/*.test.js`) → FAIL.
- [ ] Step 3: Apply changes. Icons: convert logo-eagle.webp (sips/ImageMagick) to 1024 png on navy background, `iconutil` for icns, multi-size ico (`npx png-to-ico`), replace image inside `openwhispr.icon` bundle. Keep internal identifiers (`OPENWHISPR_*` env vars, IPC names) unchanged.
- [ ] Step 4: Test PASS; `npm run build:renderer` succeeds.
- [ ] Step 5: Commit `feat: rebrand para Eagle Flow`.

### Task 2: Defaults (Groq, fallback, pt, hold Alt+Space)

**Files:** `src/stores/settingsStore.ts` (~1503-1604, `DEFAULT_CLOUD_TRANSCRIPTION_PROVIDER` :72), `src/utils/hotkeys.ts:202` (`getDefaultHotkey` → `"Alt+Space"` all platforms), `src/helpers/hotkeyManager.js:17,110`, `src/utils/hotkeyValidator.ts:262` (remove Alt+Space from reserved), `.env.example` (add `GROQ_API_KEY=`), ensure `.gitignore` covers `.env`.

- [ ] Step 1: Write `test/stores/eagleFlowDefaults.test.js` following `test/stores/localServerPrefs.test.js` harness, empty storage: assert `cloudTranscriptionMode==="byok"`, `cloudTranscriptionProvider==="groq"`, `cloudTranscriptionModel==="whisper-large-v3-turbo"`, `cloudTranscriptionBaseUrl==="https://api.groq.com/openai/v1"`, `allowLocalFallback===true`, `preferredLanguage==="pt"`, `activationMode==="push"`; seeded storage `preferredLanguage:"en"` stays `"en"`. Add test: `getDefaultHotkey()==="Alt+Space"` and validator accepts `"Alt+Space"`.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement defaults. Verify push mode works with `Alt+Space` on macOS/Windows (native key listeners provide keyup); if mac needs a native path for keyup, use the existing push-to-talk mechanism for non-Globe keys.
- [ ] Step 4: Full `npm test` PASS (update existing tests asserting old defaults only where they assert defaults).
- [ ] Step 5: Commit `feat: padrao Groq whisper-large-v3-turbo, fallback whisper.cpp, pt-BR e segurar Alt+Espaco`.

### Task 3: Release workflow (unsigned Mac + Windows on tag)

**Files:** `.github/workflows/release.yml`; disable/remove upstream-only workflows that would fail on the fork (`update-winget.yml`, `update-nix.yml`, `llm-canary.yml`, `stt-canary.yml`, `mobile-ci.yml`) — delete them.

- [ ] Step 1: Edit `release.yml`: trigger `push: tags: ['v*']`; drop `build-linux`; drop Apple/Azure signing steps & env; Windows uses `--config electron-builder.unsigned-win.json`; mac `CSC_IDENTITY_AUTO_DISCOVERY: false`; tokens `${{ secrets.GH_TOKEN || github.token }}`; `BRAND_FONTS_REQUIRED: "0"`; remove required `MICROSOFT_CALENDAR_CLIENT_ID` check; write `GROQ_API_KEY=${{ secrets.GROQ_API_KEY }}` into build `.env` when set; verify step uses `Eagle Flow.app`.
- [ ] Step 2: Validate YAML (`npx yaml-lint` or `ruby -ryaml -e`), `npm test` PASS.
- [ ] Step 3: Commit `ci: release de instaladores Mac e Windows a cada tag`, push main, `git tag v1.0.0 && git push origin v1.0.0`, `gh run watch`; fix failures until a Release with .dmg and .exe exists.

### Task 4: Eagle Eye Ferramentas item

**Files (in /Users/felipe/eagle-eye, branch `feat/eagle-flow`):** `frontend/src/lib/nav/registry.ts` (new entry `eagleFlow`, `path: '/eagle-flow'`, icon `Mic`, `defaultGroup: G_FERRAMENTAS`, `alwaysVisible: true` with an existing broad permission — no new permission key), `frontend/src/lib/nav/icons.ts` (add `Mic` if missing), `frontend/src/lib/eagleFlow.ts` (pure: `EAGLE_FLOW_RELEASES_URL`, `EAGLE_FLOW_DOWNLOADS: {os:'mac'|'windows',label,href}[]`), `frontend/src/pages/EagleFlow.tsx` (container `mx-auto max-w-7xl p-4 sm:p-6`, existing Tailwind/eagle tokens, lucide icons, two `<a>` buttons, 44px targets), `frontend/src/App.tsx` route, `backend/test/eagle-flow-menu.test.mjs`.

- [ ] Step 1: Write `backend/test/eagle-flow-menu.test.mjs` via `importarDoFront`: `setorDaTela('eagleFlow')==='Ferramentas'`; every `EAGLE_FLOW_DOWNLOADS[].href === 'https://github.com/mauriciokostyuk/eagle-flow/releases/latest'`; os set `['mac','windows']`.
- [ ] Step 2: Run `cd backend && npm run build && node --test test/eagle-flow-menu.test.mjs` → FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Test PASS, existing `menu-por-setor`/`nav-menu-por-conta` PASS, `cd frontend && npm run build` PASS.
- [ ] Step 5: Commit `feat: adiciona Eagle Flow em Ferramentas`, push branch, `gh pr create --base main`. Never merge.

## Addendum (2026-10-19, updated spec)

- Task 2: fallback whisper.cpp must work with no Groq key (no key → go straight to local, no error).
- Task 3a (new): run local Mac build (`npm run build:mac` unsigned, `CSC_IDENTITY_AUTO_DISCOVERY=false`) and fix until `dist/` has `Eagle Flow.app`/.dmg.
- Task 3: after tag v1.0.0, confirm workflow passed (`gh run watch`), Release has .dmg + .exe.
- Task 4: page also shows Mac instruction: "No Mac, na primeira vez: clique com o botão direito no app > Abrir" (unsigned app). After PR: run build+tests, if green merge PR into eagle-eye main and confirm deploy run is green.
- Final: print a short informal PT-BR team message (launch, voice dictation typing in any app, unlimited, hold Alt+Espaço/talk/release, download in Eagle Eye > Ferramentas).
