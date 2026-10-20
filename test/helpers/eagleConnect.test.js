const test = require("node:test");
const assert = require("node:assert");
const {
  isEagleConnectDeepLink,
  parseEagleConnectToken,
  handleEagleConnectDeepLink,
} = require("../../src/helpers/eagleConnect");

const JWT = "aaa.bbb.ccc";

test("reconhece só o link de conexão do próprio protocolo", () => {
  assert.equal(isEagleConnectDeepLink(`eagleflow://conectar?token=${JWT}`, "eagleflow"), true);
  assert.equal(isEagleConnectDeepLink("eagleflow://conectar", "eagleflow"), true);
  assert.equal(isEagleConnectDeepLink("eagleflow://conectarx", "eagleflow"), false);
  assert.equal(isEagleConnectDeepLink("eagleflow://notes/1", "eagleflow"), false);
  assert.equal(isEagleConnectDeepLink(`outro://conectar?token=${JWT}`, "eagleflow"), false);
});

test("aceita só token no formato JWT", () => {
  assert.equal(parseEagleConnectToken(`eagleflow://conectar?token=${JWT}`), JWT);
  assert.equal(parseEagleConnectToken("eagleflow://conectar?token=nao-e-jwt"), null);
  assert.equal(parseEagleConnectToken("eagleflow://conectar"), null);
});

test("salva o token como chave custom e recarrega as janelas", () => {
  const saved = [];
  let reloads = 0;
  const win = { isDestroyed: () => false, webContents: { reload: () => reloads++ } };
  const ok = handleEagleConnectDeepLink(`eagleflow://conectar?token=${JWT}`, {
    environmentManager: { saveCustomTranscriptionKey: (k) => saved.push(k) },
    BrowserWindow: { getAllWindows: () => [win, win] },
    Notification: null,
  });
  assert.equal(ok, true);
  assert.deepEqual(saved, [JWT]);
  assert.equal(reloads, 2);
});

test("link inválido não toca na chave", () => {
  const saved = [];
  const ok = handleEagleConnectDeepLink("eagleflow://conectar?token=x", {
    environmentManager: { saveCustomTranscriptionKey: (k) => saved.push(k) },
    BrowserWindow: { getAllWindows: () => [] },
  });
  assert.equal(ok, false);
  assert.deepEqual(saved, []);
});
