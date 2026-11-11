// Ponte da janela escondida do gravador (gravador.html) com o motor.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gravador", {
  platform: process.platform,
  pcm: (fonte, bytes) => ipcRenderer.send("ef:gravador-pcm", String(fonte), bytes),
  aviso: (fonte, texto) => ipcRenderer.send("ef:gravador-aviso", String(fonte), String(texto)),
  onParar: (cb) => ipcRenderer.on("ef:gravador-parar", () => cb()),
});
