// Eagle Flow (motor): atalho global, microfone e colar o texto.
// Tela, login, transcrição e regras vêm do Eagle Eye; publicar lá atualiza
// todo mundo sem baixar o app de novo.
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  session,
  shell,
  systemPreferences,
} = require("electron");
const path = require("path");
const { execFile } = require("child_process");
const { createHotkeyMachine } = require("./hotkey");

const BASE = (process.env.EAGLE_FLOW_URL || "https://eye.autoeaglemidia.com").replace(/\/$/, "");
const APP_URL = `${BASE}/eagle-flow-app`;
const PILL_URL = `${BASE}/eagle-flow-app/pill`;
const ATALHO = "Alt+Space";
const isMac = process.platform === "darwin";

let mainWin = null;
let pillWin = null;
let tray = null;
let uio = null; // uiohook-napi: soltar a tecla, Esc e o Cmd/Ctrl+V
let uioRodando = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function deEagleEye(url) {
  try {
    return new URL(url).origin === new URL(BASE).origin;
  } catch {
    return false;
  }
}

function remetenteValido(event) {
  return deEagleEye(event.senderFrame?.url || "");
}

// ── Janelas ────────────────────────────────────────────────────────────────

const webPrefs = {
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
};

function carregar(win, url) {
  win.loadURL(url).catch(() => {});
}

function protegerNavegacao(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!deEagleEye(url) && !url.startsWith("file:")) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
}

function abrirPrincipal() {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.show();
    mainWin.focus();
    return;
  }
  mainWin = new BrowserWindow({
    width: 720,
    height: 760,
    minWidth: 420,
    minHeight: 520,
    title: "Eagle Flow",
    backgroundColor: "#020925",
    show: false,
    webPreferences: webPrefs,
  });
  protegerNavegacao(mainWin);
  mainWin.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      mainWin.loadFile(path.join(__dirname, "offline.html"), { query: { url: APP_URL } });
    }
  });
  mainWin.once("ready-to-show", () => mainWin.show());
  carregar(mainWin, APP_URL);
}

function criarPilula() {
  pillWin = new BrowserWindow({
    width: 360,
    height: 64,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: { ...webPrefs, backgroundThrottling: false },
  });
  pillWin.setAlwaysOnTop(true, "screen-saver");
  pillWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pillWin.setIgnoreMouseEvents(true);
  protegerNavegacao(pillWin);
  pillWin.webContents.on("did-fail-load", (_e, code, _d, _u, isMainFrame) => {
    if (isMainFrame && code !== -3) setTimeout(() => carregar(pillWin, PILL_URL), 30000);
  });
  carregar(pillWin, PILL_URL);
}

function posicionarPilula() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const [w, h] = pillWin.getSize();
  pillWin.setPosition(Math.round(x + (width - w) / 2), Math.round(y + height - h - 24));
}

// ── Atalho ─────────────────────────────────────────────────────────────────

function enviarPilula(canal) {
  if (pillWin && !pillWin.isDestroyed()) pillWin.webContents.send(canal);
}

const atalho = createHotkeyMachine({
  holdSupported: () => uioRodando,
  onStart: () => {
    posicionarPilula();
    pillWin.showInactive();
    enviarPilula("ef:start");
  },
  onStop: () => enviarPilula("ef:stop"),
  onCancel: () => enviarPilula("ef:cancel"),
});

function iniciarLeitorDeTeclas() {
  if (uioRodando) return;
  if (isMac && !systemPreferences.isTrustedAccessibilityClient(false)) return;
  try {
    uio = uio || require("uiohook-napi");
    const { uIOhook, UiohookKey } = uio;
    const soltar = new Set([UiohookKey.Space, UiohookKey.Alt, UiohookKey.AltRight]);
    uIOhook.on("keyup", (e) => {
      if (soltar.has(e.keycode)) atalho.release();
    });
    uIOhook.on("keydown", (e) => {
      if (e.keycode === UiohookKey.Escape) atalho.escape();
    });
    uIOhook.start();
    uioRodando = true;
  } catch (err) {
    console.error("[EagleFlow] leitor de teclas indisponível:", err?.message);
  }
}

// ── Colar ──────────────────────────────────────────────────────────────────

function colarPeloSistema() {
  return new Promise((resolve) => {
    if (isMac) {
      execFile(
        "osascript",
        ["-e", 'tell application "System Events" to keystroke "v" using command down'],
        (err) => resolve(!err)
      );
    } else if (process.platform === "win32") {
      execFile(
        "powershell",
        ["-NoProfile", "-Command", "(New-Object -ComObject WScript.Shell).SendKeys('^v')"],
        (err) => resolve(!err)
      );
    } else {
      resolve(false);
    }
  });
}

async function colar(texto) {
  const anterior = clipboard.readText();
  clipboard.writeText(texto);
  if (isMac && !systemPreferences.isTrustedAccessibilityClient(false)) {
    return { ok: false, motivo: "acessibilidade" };
  }
  await new Promise((r) => setTimeout(r, 40));
  let ok = false;
  if (uioRodando) {
    try {
      const { uIOhook, UiohookKey } = uio;
      uIOhook.keyTap(UiohookKey.V, [isMac ? UiohookKey.Meta : UiohookKey.Ctrl]);
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok) ok = await colarPeloSistema();
  // Devolve o que a pessoa tinha copiado antes.
  if (ok) setTimeout(() => clipboard.writeText(anterior), 900);
  return ok ? { ok: true } : { ok: false, motivo: "colar" };
}

// ── Permissões ─────────────────────────────────────────────────────────────

function permissoes() {
  return {
    microfone:
      process.platform === "linux" ||
      systemPreferences.getMediaAccessStatus("microphone") === "granted",
    acessibilidade: isMac ? systemPreferences.isTrustedAccessibilityClient(false) : true,
  };
}

async function pedirPermissoes() {
  if (!isMac) return;
  if (systemPreferences.getMediaAccessStatus("microphone") !== "granted") {
    const ok = await systemPreferences.askForMediaAccess("microphone");
    if (!ok) {
      void shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
      );
    }
  }
  if (!systemPreferences.isTrustedAccessibilityClient(true)) {
    void shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    );
  }
}

// ── IPC ────────────────────────────────────────────────────────────────────

ipcMain.on("ef:version", (e) => {
  e.returnValue = app.getVersion();
});
ipcMain.handle("ef:paste", (e, texto) => (remetenteValido(e) ? colar(String(texto)) : { ok: false }));
ipcMain.on("ef:state", (e, estado) => {
  if (!remetenteValido(e) || !pillWin) return;
  if (estado === "idle") pillWin.hide();
  else if (!pillWin.isVisible()) {
    posicionarPilula();
    pillWin.showInactive();
  }
});
ipcMain.on("ef:open-main", (e) => {
  if (remetenteValido(e)) abrirPrincipal();
});
ipcMain.handle("ef:permissoes", (e) => (remetenteValido(e) ? permissoes() : null));
ipcMain.handle("ef:pedir-permissoes", async (e) => {
  if (remetenteValido(e)) await pedirPermissoes();
});

// ── App ────────────────────────────────────────────────────────────────────

function criarBandeja() {
  const icone = nativeImage
    .createFromPath(path.join(__dirname, "build", isMac ? "trayTemplate@3x.png" : "icon.png"))
    .resize({ width: 18, height: 18 });
  if (isMac) icone.setTemplateImage(true);
  tray = new Tray(icone);
  tray.setToolTip(`Eagle Flow: segure ${isMac ? "Option" : "Alt"}+Espaço e fale`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Eagle Flow", click: abrirPrincipal },
      { type: "separator" },
      { label: "Sair", click: () => app.quit() },
    ])
  );
  tray.on("click", abrirPrincipal);
}

app.on("second-instance", abrirPrincipal);

app.whenReady().then(() => {
  // Microfone só para o Eagle Eye.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === "media" && deEagleEye(wc.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => {
    return permission === "media" && deEagleEye(origin || wc?.getURL() || "");
  });

  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

  criarBandeja();
  criarPilula();
  abrirPrincipal();

  if (!globalShortcut.register(ATALHO, () => atalho.press())) {
    console.error("[EagleFlow] não deu pra registrar", ATALHO);
  }
  iniciarLeitorDeTeclas();
  // No Mac o leitor só liga depois de liberar Acessibilidade.
  const tentar = setInterval(() => {
    iniciarLeitorDeTeclas();
    if (uioRodando) clearInterval(tentar);
  }, 3000);
});

// Fechar a janela não fecha o app: ele fica na barra (bandeja).
app.on("window-all-closed", () => {});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (uioRodando) {
    try {
      uio.uIOhook.stop();
    } catch {
      // saindo de qualquer jeito
    }
  }
});
