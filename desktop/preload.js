// Ponte entre o Eagle Eye (tela) e o motor do app. Só o essencial passa aqui.
const { contextBridge, ipcRenderer } = require("electron");

function on(canal, cb) {
  ipcRenderer.on(canal, () => cb());
}

contextBridge.exposeInMainWorld("eagleFlowShell", {
  platform: process.platform,
  version: ipcRenderer.sendSync("ef:version"),
  onStart: (cb) => on("ef:start", cb),
  onStop: (cb) => on("ef:stop", cb),
  onCancel: (cb) => on("ef:cancel", cb),
  paste: (texto) => ipcRenderer.invoke("ef:paste", String(texto)),
  setState: (estado) => ipcRenderer.send("ef:state", String(estado)),
  openMain: () => ipcRenderer.send("ef:open-main"),
  permissoes: () => ipcRenderer.invoke("ef:permissoes"),
  pedirPermissoes: () => ipcRenderer.invoke("ef:pedir-permissoes"),
  getAtalho: () => ipcRenderer.invoke("ef:get-atalho"),
  setAtalho: (atalho) => ipcRenderer.invoke("ef:set-atalho", String(atalho)),
  // Reuniões (motor 2.3+)
  onReuniaoSugerida: (cb) => on("ef:reuniao-sugerida", cb),
  onReuniaoAcabou: (cb) => on("ef:reuniao-acabou", cb),
  setReuniaoGravando: (gravando) => {
    telaDaReuniao(Boolean(gravando));
    return ipcRenderer.invoke("ef:reuniao-estado", Boolean(gravando));
  },
  sistemaIniciar: () => ipcRenderer.invoke("ef:sistema-iniciar"),
  sistemaFatia: () => ipcRenderer.invoke("ef:sistema-fatia"),
  sistemaParar: () => ipcRenderer.invoke("ef:sistema-parar"),
  // Motor 2.3.1+: WAV do áudio do computador gravado em disco (atual ou último).
  sistemaArquivo: () => ipcRenderer.invoke("ef:sistema-arquivo"),
  abrirGravacoes: () => ipcRenderer.invoke("ef:abrir-gravacoes"),
  // Motor 2.4+: a tela pode mandar a transcrição pra ficar guardada em disco
  // (userData/reunioes/<data>-transcricao.txt), sempre a versão mais nova.
  salvarTranscricao: (texto) => ipcRenderer.invoke("ef:salvar-transcricao", String(texto)),
});

// Enquanto a reunião grava, o texto visível da tela vai pro motor a cada 15 s
// (só quando mudou). Se a tela cair, o motor ainda tem a última versão.
let telaTimer = null;
let telaUltima = null;
function mandarTela() {
  try {
    const texto = document.body ? document.body.innerText : "";
    if (texto && texto !== telaUltima) {
      telaUltima = texto;
      ipcRenderer.send("ef:tela-texto", texto);
    }
  } catch {
    // tela sem corpo ainda
  }
}
function telaDaReuniao(gravando) {
  if (gravando && !telaTimer) {
    telaUltima = null;
    telaTimer = setInterval(mandarTela, 15_000);
  } else if (!gravando && telaTimer) {
    mandarTela();
    clearInterval(telaTimer);
    telaTimer = null;
  }
}
