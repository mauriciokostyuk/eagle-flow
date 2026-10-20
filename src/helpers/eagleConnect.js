// Eagle Flow: conecta o app ao Eagle Eye sem a pessoa colar chave nenhuma.
// A página Ferramentas > Eagle Flow do Eagle Eye abre
// `eagleflow://conectar?token=...`; o token é o login da pessoa para o proxy de
// transcrição do Eagle Eye (a chave da OpenAI fica só no servidor).

const EAGLE_EYE_TRANSCRIPTION_BASE_URL = "https://eye.autoeaglemidia.com/api/eagle-flow/v1";
const EAGLE_FLOW_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

function isEagleConnectDeepLink(url, protocol) {
  if (typeof url !== "string" || !protocol) return false;
  const prefix = `${protocol}://`;
  if (!url.startsWith(prefix)) return false;
  return /^conectar(?:[/?#]|$)/.test(url.slice(prefix.length));
}

function parseEagleConnectToken(url) {
  try {
    const token = new URL(url).searchParams.get("token");
    const trimmed = (token || "").trim();
    // JWT: três partes base64url separadas por ponto.
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Salva o token como chave do provedor "custom" e recarrega as janelas, que
 * hidratam a chave do processo principal ao iniciar.
 */
function handleEagleConnectDeepLink(url, { environmentManager, BrowserWindow, Notification, logger }) {
  const token = parseEagleConnectToken(url);
  if (!token || !environmentManager) {
    logger?.warn?.("[EagleConnect] link de conexão inválido");
    return false;
  }
  environmentManager.saveCustomTranscriptionKey(token);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.reload();
  }
  try {
    if (Notification?.isSupported?.()) {
      new Notification({
        title: "Eagle Flow conectado",
        body: "Pronto. Segure Alt+Espaço, fale e solte.",
      }).show();
    }
  } catch {
    // Notificação é só cortesia.
  }
  return true;
}

module.exports = {
  EAGLE_EYE_TRANSCRIPTION_BASE_URL,
  EAGLE_FLOW_TRANSCRIPTION_MODEL,
  isEagleConnectDeepLink,
  parseEagleConnectToken,
  handleEagleConnectDeepLink,
};
