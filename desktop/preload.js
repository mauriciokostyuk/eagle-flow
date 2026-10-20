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
});
