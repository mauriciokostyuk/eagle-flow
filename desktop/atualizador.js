// Atualização automática do motor.
//
// Windows: electron-updater (instalador NSIS, funciona sem assinatura).
// Mac: o atualizador oficial exige assinatura da Apple, então o app baixa o
// zip da versão nova do GitHub, troca o próprio .app e reabre sozinho.
// Só atualiza com o ditado parado, pra não cortar ninguém no meio da fala.

const { app, net } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { versaoMaisNova } = require("./versao");

const REPO = "mauriciokostyuk/eagle-flow";
const INTERVALO_MS = 4 * 60 * 60 * 1000;

function log(...a) {
  console.log("[EagleFlow] atualizador:", ...a);
}

async function baixarJson(url) {
  const r = await net.fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
  return r.json();
}

async function baixarArquivo(url, destino) {
  const r = await net.fetch(url);
  if (!r.ok) throw new Error(`download respondeu ${r.status}`);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

function rodar(cmd, args) {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, (err) => (err ? reject(err) : resolve()))
  );
}

/** Pasta do .app que está rodando (…/Eagle Flow.app). */
function pastaDoApp() {
  return path.resolve(process.execPath, "..", "..", "..");
}

async function atualizarMac(podeAtualizar) {
  const release = await baixarJson(`https://api.github.com/repos/${REPO}/releases/latest`);
  const nova = String(release.tag_name || "").replace(/^v/, "");
  if (!versaoMaisNova(nova, app.getVersion())) return;

  const nome = `EagleFlow-mac-${process.arch === "arm64" ? "arm64" : "x64"}.zip`;
  const asset = (release.assets || []).find((a) => a.name === nome);
  if (!asset) return log(`release ${nova} sem ${nome}`);

  const destinoApp = pastaDoApp();
  if (!destinoApp.endsWith(".app")) return log("não está rodando de um .app, pulando");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eagleflow-"));
  const zip = path.join(tmp, nome);
  log(`baixando ${nova}`);
  await baixarArquivo(asset.browser_download_url, zip);
  await rodar("/usr/bin/ditto", ["-x", "-k", zip, tmp]);
  const novoApp = path.join(tmp, "Eagle Flow.app");
  if (!fs.existsSync(novoApp)) throw new Error("zip sem Eagle Flow.app");
  await rodar("/usr/bin/xattr", ["-dr", "com.apple.quarantine", novoApp]).catch(() => {});

  // Espera o ditado parar antes de trocar.
  while (!podeAtualizar()) await new Promise((r) => setTimeout(r, 5000));

  // Um script separado troca o .app depois que este processo fechar e reabre.
  const script = [
    `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done`,
    `rm -rf "${destinoApp}"`,
    `mv "${novoApp}" "${destinoApp}"`,
    `open "${destinoApp}"`,
    `rm -rf "${tmp}"`,
  ].join(" && ");
  spawn("/bin/sh", ["-c", script], { detached: true, stdio: "ignore" }).unref();
  log(`trocando para ${nova}`);
  app.quit();
}

function atualizarWindows(podeAtualizar) {
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", async () => {
    while (!podeAtualizar()) await new Promise((r) => setTimeout(r, 5000));
    autoUpdater.quitAndInstall(true, true);
  });
  autoUpdater.on("error", (err) => log(err?.message));
  return autoUpdater.checkForUpdates();
}

function iniciarAtualizador({ podeAtualizar }) {
  if (!app.isPackaged) return;
  const verificar = () => {
    const tarefa =
      process.platform === "darwin"
        ? atualizarMac(podeAtualizar)
        : process.platform === "win32"
          ? atualizarWindows(podeAtualizar)
          : null;
    Promise.resolve(tarefa).catch((err) => log(err?.message));
  };
  setTimeout(verificar, 15000);
  setInterval(verificar, INTERVALO_MS);
}

module.exports = { iniciarAtualizador };
