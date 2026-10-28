// Eagle Flow (motor): atalho global, microfone e colar o texto.
// Tela, login, transcrição e regras vêm do Eagle Eye; publicar lá atualiza
// todo mundo sem baixar o app de novo.
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  nativeImage,
  Notification,
  screen,
  session,
  shell,
  systemPreferences,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { createHotkeyMachine } = require("./hotkey");
const { iniciarAtualizador } = require("./atualizador");
const {
  MODIFICADORES_SOZINHOS,
  ehFn,
  ehModificadorSozinho,
  padraoDoSistema,
  rotuloDoAtalho,
  validarAtalho,
} = require("./atalhos");
const {
  appDeReuniaoAberto,
  criarAudioDoSistemaMac,
  criarDetectorDeReuniao,
  criarDetectorPorProcesso,
} = require("./reuniao");

const BASE = (process.env.EAGLE_FLOW_URL || "https://eye.autoeaglemidia.com").replace(/\/$/, "");
const APP_URL = `${BASE}/eagle-flow-app`;
const PILL_URL = `${BASE}/eagle-flow-app/pill`;
const isMac = process.platform === "darwin";

let mainWin = null;
let pillWin = null;
let tray = null;
let uio = null; // uiohook-napi: soltar a tecla, Esc e o Cmd/Ctrl+V
let uioRodando = false;
let gravandoReuniao = false;

// ── Configuração (atalho escolhido) ────────────────────────────────────────

function arquivoConfig() {
  return path.join(app.getPath("userData"), "config.json");
}

function lerConfig() {
  try {
    return JSON.parse(fs.readFileSync(arquivoConfig(), "utf8"));
  } catch {
    return {};
  }
}

function salvarConfig(config) {
  try {
    fs.writeFileSync(arquivoConfig(), JSON.stringify(config));
  } catch (err) {
    console.error("[EagleFlow] não deu pra salvar a configuração:", err?.message);
  }
}

let atalhoAtual = padraoDoSistema(process.platform);

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
  // A gravação de reunião continua com a janela escondida.
  backgroundThrottling: false,
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

function abrirPrincipal({ focar = true } = {}) {
  if (mainWin && !mainWin.isDestroyed()) {
    if (focar) {
      mainWin.show();
      mainWin.focus();
    } else if (!mainWin.isVisible()) mainWin.showInactive();
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
  // A página é do Eagle Eye; a janela continua se chamando Eagle Flow.
  mainWin.on("page-title-updated", (e) => e.preventDefault());
  mainWin.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      mainWin.loadFile(path.join(__dirname, "offline.html"), { query: { url: APP_URL } });
    }
  });
  // Fechar no meio de uma reunião só esconde: a gravação continua.
  mainWin.on("close", (e) => {
    if (gravandoReuniao) {
      e.preventDefault();
      mainWin.hide();
    }
  });
  mainWin.once("ready-to-show", () => (focar ? mainWin.show() : mainWin.showInactive()));
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
  holdSupported: () => (ehFn(atalhoAtual) ? globeRodando : uioRodando),
  tapToggles: () => !ehModificadorSozinho(atalhoAtual),
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
    const teclaSozinha = () =>
      ehModificadorSozinho(atalhoAtual)
        ? UiohookKey[MODIFICADORES_SOZINHOS[atalhoAtual].uiohook]
        : null;
    uIOhook.on("keydown", (e) => {
      if (e.keycode === UiohookKey.Escape) return atalho.escape();
      if (ehFn(atalhoAtual)) return; // Fn vem do leitor próprio
      const sozinha = teclaSozinha();
      if (sozinha === null) return;
      if (e.keycode === sozinha) atalho.press();
      // Outra tecla junto do modificador: a pessoa está usando um atalho de
      // outro app (ex.: Option + letra pra acento), não ditando.
      else if (atalho.state === "holding") atalho.escape();
    });
    uIOhook.on("keyup", (e) => {
      if (ehFn(atalhoAtual)) return;
      const sozinha = teclaSozinha();
      // Combinação: soltar qualquer tecla dela termina; modificador: só ele.
      if (sozinha === null || e.keycode === sozinha) atalho.release();
    });
    uIOhook.start();
    uioRodando = true;
  } catch (err) {
    console.error("[EagleFlow] leitor de teclas indisponível:", err?.message);
  }
}

// ── Tecla Fn / Globo (Mac) ─────────────────────────────────────────────────
// Leitor em Swift (native/macos-globe-listener.swift). Enquanto roda, faz o
// Mac ignorar a ação padrão do globo (emoji/ditado) e devolve ao sair.

let globe = null;
let globeRodando = false;

function caminhoGlobe() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "bin", "globe-listener")
    : path.join(__dirname, "build", "bin", "globe-listener");
}

function pararGlobe() {
  if (globe) globe.kill("SIGTERM");
  globe = null;
  globeRodando = false;
}

function iniciarGlobe() {
  if (!isMac || globe) return;
  if (!systemPreferences.isTrustedAccessibilityClient(false)) return;
  const bin = caminhoGlobe();
  if (!fs.existsSync(bin)) return;
  globe = spawn(
    bin,
    [
      "--suppress-system-globe-action",
      "--globe-preference-state",
      path.join(app.getPath("userData"), "globe-state.json"),
    ],
    // stdin precisa ficar aberto: o leitor encerra quando recebe fim de arquivo
    // (é assim que ele percebe que o app fechou e devolve a tecla ao Mac).
    { stdio: ["pipe", "pipe", "ignore"] }
  );
  globeRodando = true;
  let resto = "";
  globe.stdout.on("data", (dados) => {
    resto += dados;
    let i;
    while ((i = resto.indexOf("\n")) >= 0) {
      const linha = resto.slice(0, i).trim();
      resto = resto.slice(i + 1);
      if (!ehFn(atalhoAtual)) continue;
      if (linha === "FN_DOWN") atalho.press();
      else if (linha === "FN_UP") atalho.release();
      else if (linha === "FN_INTERRUPTED") atalho.escape();
    }
  });
  globe.on("exit", () => {
    globe = null;
    globeRodando = false;
  });
}

function registrarAtalho(novo) {
  globalShortcut.unregisterAll();
  if (ehFn(novo)) {
    if (!isMac) return false;
    iniciarGlobe();
    return true;
  }
  pararGlobe();
  if (ehModificadorSozinho(novo)) return true;
  try {
    // No Windows a tecla Windows se chama "Super" pro Electron.
    const acc = isMac ? novo : novo.replace(/\bCommand\b/, "Super");
    return globalShortcut.register(acc, () => atalho.press());
  } catch {
    return false;
  }
}

function aplicarAtalho(novo) {
  const v = validarAtalho(novo);
  if (!v.ok) return v;
  const anterior = atalhoAtual;
  atalho.escape();
  if (!registrarAtalho(novo)) {
    registrarAtalho(anterior);
    return { ok: false, erro: "Esse atalho já é usado por outro app. Escolha outro." };
  }
  atalhoAtual = novo;
  salvarConfig({ ...lerConfig(), atalho: novo });
  tray?.setToolTip(`Eagle Flow: segure ${rotuloDoAtalho(novo, process.platform)} e fale`);
  return { ok: true };
}

function infoAtalho() {
  return {
    atalho: atalhoAtual,
    rotulo: rotuloDoAtalho(atalhoAtual, process.platform),
    // Fn e modificador sozinho só funcionam com o leitor ligado (Acessibilidade).
    pronto: ehFn(atalhoAtual) ? globeRodando : !ehModificadorSozinho(atalhoAtual) || uioRodando,
  };
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

// ── Reuniões ───────────────────────────────────────────────────────────────

function caminhoBin(nome) {
  return app.isPackaged
    ? path.join(process.resourcesPath, "bin", nome)
    : path.join(__dirname, "build", "bin", nome);
}

// Gravações de reunião ficam em disco por uns dias: se a tela ou a transcrição
// falhar, o áudio do computador ainda está aqui.
function pastaDasReunioes() {
  return path.join(app.getPath("userData"), "reunioes");
}

const audioDoSistema = isMac
  ? criarAudioDoSistemaMac(caminhoBin("audio-tap"), { pasta: pastaDasReunioes() })
  : null;
let micListener = null;
let detector = null;

function nossosPids() {
  return new Set([process.pid, ...app.getAppMetrics().map((m) => m.pid)]);
}

function avisarJanela(canal) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(canal);
}

function reuniaoDetectada() {
  if (gravandoReuniao) return;
  abrirPrincipal({ focar: false });
  // A tela pode ainda estar carregando: avisa de novo quando terminar.
  setTimeout(() => avisarJanela("ef:reuniao-sugerida"), 1500);
  avisarJanela("ef:reuniao-sugerida");
  if (Notification.isSupported()) {
    const n = new Notification({
      title: "Reunião detectada",
      body: "Clique para transcrever com o Eagle Flow.",
      silent: true,
    });
    n.on("click", () => {
      abrirPrincipal();
      avisarJanela("ef:reuniao-sugerida");
    });
    n.show();
  }
}

function reuniaoAcabou() {
  avisarJanela("ef:reuniao-acabou");
}

function iniciarDetectorDeReuniao() {
  if (isMac) {
    const bin = caminhoBin("mic-listener");
    if (!fs.existsSync(bin)) return;
    detector = criarDetectorDeReuniao({
      ehNosso: (pid) => nossosPids().has(pid),
      appDeReuniaoAberto,
      onSugerir: reuniaoDetectada,
      onAcabou: reuniaoAcabou,
    });
    const ligar = () => {
      micListener = spawn(bin, [], { stdio: ["ignore", "pipe", "ignore"] });
      let resto = "";
      micListener.stdout.on("data", (d) => {
        resto += d;
        let i;
        while ((i = resto.indexOf("\n")) >= 0) {
          detector.linha(resto.slice(0, i));
          resto = resto.slice(i + 1);
        }
      });
      micListener.on("error", () => {});
      micListener.on("exit", () => {
        micListener = null;
        if (!app.isQuitting) setTimeout(ligar, 10_000);
      });
    };
    ligar();
  } else if (process.platform === "win32") {
    detector = criarDetectorPorProcesso({
      appDeReuniaoAberto,
      onSugerir: reuniaoDetectada,
      onAcabou: reuniaoAcabou,
    });
  }
  if (detector) setInterval(() => void detector.tick().catch(() => {}), 5000);
}

ipcMain.handle("ef:reuniao-estado", (e, gravando) => {
  if (remetenteValido(e)) gravandoReuniao = Boolean(gravando);
});
ipcMain.handle("ef:sistema-iniciar", async (e) => {
  if (!remetenteValido(e)) return { ok: false };
  // Windows: o áudio do computador vem pela tela (loopback) direto na página.
  if (!isMac) return { ok: true, modo: "pagina" };
  if (!fs.existsSync(caminhoBin("audio-tap"))) return { ok: false, motivo: "unsupported_os" };
  const r = await audioDoSistema.iniciar();
  if (!r.ok && r.motivo === "permission_denied") {
    void shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture"
    );
  }
  return { ...r, modo: "motor" };
});
ipcMain.handle("ef:sistema-fatia", (e) =>
  remetenteValido(e) && audioDoSistema ? audioDoSistema.fatia() : null
);
ipcMain.handle("ef:sistema-parar", async (e) =>
  remetenteValido(e) && audioDoSistema ? audioDoSistema.parar() : null
);
ipcMain.handle("ef:sistema-arquivo", (e) =>
  remetenteValido(e) && audioDoSistema ? audioDoSistema.arquivo : null
);
ipcMain.handle("ef:abrir-gravacoes", async (e) => {
  if (!remetenteValido(e)) return;
  await abrirGravacoes();
});

async function abrirGravacoes() {
  const pasta = pastaDasReunioes();
  fs.mkdirSync(pasta, { recursive: true });
  await shell.openPath(pasta);
}

// ── IPC ────────────────────────────────────────────────────────────────────

ipcMain.on("ef:version", (e) => {
  e.returnValue = app.getVersion();
});
ipcMain.handle("ef:paste", (e, texto) =>
  remetenteValido(e) ? colar(String(texto)) : { ok: false }
);
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
ipcMain.handle("ef:get-atalho", (e) => (remetenteValido(e) ? infoAtalho() : null));
ipcMain.handle("ef:set-atalho", (e, novo) =>
  remetenteValido(e) ? aplicarAtalho(String(novo)) : { ok: false }
);
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
  tray.setToolTip(`Eagle Flow: segure ${rotuloDoAtalho(atalhoAtual, process.platform)} e fale`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Eagle Flow", click: abrirPrincipal },
      { label: "Gravações de reunião…", click: () => void abrirGravacoes() },
      { type: "separator" },
      { label: "Sair", click: () => app.quit() },
    ])
  );
  tray.on("click", abrirPrincipal);
}

app.on("second-instance", abrirPrincipal);
// Clique no ícone do Dock reabre a janela.
app.on("activate", abrirPrincipal);

app.whenReady().then(async () => {
  // A tela vem do Eagle Eye, que é um PWA com cache próprio. Limpa esse cache
  // na abertura pra cada ajuste publicado chegar na hora (o login fica).
  await session.defaultSession
    .clearStorageData({ storages: ["serviceworkers", "cachestorage"] })
    .catch(() => {});
  await session.defaultSession.clearCache().catch(() => {});

  // Microfone só para o Eagle Eye.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb((permission === "media" || permission === "display-capture") && deEagleEye(wc.getURL()));
  });
  // Windows: áudio do computador para gravar reunião. Só o som é usado.
  if (process.platform === "win32") {
    session.defaultSession.setDisplayMediaRequestHandler((req, callback) => {
      if (!deEagleEye(req.frame?.url || "")) return callback(null);
      desktopCapturer
        .getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } })
        .then((fontes) => callback(fontes[0] ? { video: fontes[0], audio: "loopback" } : null))
        .catch(() => callback(null));
    });
  }
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => {
    return permission === "media" && deEagleEye(origin || wc?.getURL() || "");
  });

  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

  const salvo = lerConfig().atalho;
  if (salvo && validarAtalho(salvo).ok) atalhoAtual = salvo;

  // Pede o microfone uma vez já na abertura (no Mac, o pedido sai do motor).
  if (isMac && systemPreferences.getMediaAccessStatus("microphone") === "not-determined") {
    void systemPreferences.askForMediaAccess("microphone");
  }

  criarBandeja();
  criarPilula();
  abrirPrincipal();

  if (!registrarAtalho(atalhoAtual)) {
    console.error("[EagleFlow] não deu pra registrar", atalhoAtual);
  }
  iniciarLeitorDeTeclas();
  // No Mac o leitor só liga depois de liberar Acessibilidade.
  // Motor se atualiza sozinho (só com o ditado parado).
  iniciarAtualizador({
    podeAtualizar: () =>
      atalho.state === "idle" && !gravandoReuniao && !(pillWin && pillWin.isVisible()),
  });

  iniciarDetectorDeReuniao();

  // Também religa o leitor do Fn se ele cair.
  setInterval(() => {
    iniciarLeitorDeTeclas();
    if (ehFn(atalhoAtual)) iniciarGlobe();
  }, 3000);
});

// Fechar a janela não fecha o app: ele fica na barra (bandeja).
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  app.isQuitting = true;
  gravandoReuniao = false;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (micListener) micListener.kill("SIGTERM");
  if (audioDoSistema) void audioDoSistema.parar();
  pararGlobe();
  if (uioRodando) {
    try {
      uio.uIOhook.stop();
    } catch {
      // saindo de qualquer jeito
    }
  }
});
