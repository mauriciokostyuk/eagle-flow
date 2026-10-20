const test = require("node:test");
const assert = require("node:assert");
const { validarAtalho, rotuloDoAtalho, padraoDoSistema } = require("../atalhos");

test("padrão não conflita: tecla modificadora direita sozinha", () => {
  assert.equal(padraoDoSistema("darwin"), "RightOption");
  assert.equal(padraoDoSistema("win32"), "RightCtrl");
});

test("aceita modificador sozinho e combinações com modificador", () => {
  assert.equal(validarAtalho("RightOption").ok, true);
  assert.equal(validarAtalho("Control+Shift+Space").ok, true);
  assert.equal(validarAtalho("Alt+F9").ok, true);
});

test("recusa tecla solta, modificador repetido e lixo", () => {
  assert.equal(validarAtalho("Space").ok, false);
  assert.equal(validarAtalho("A").ok, false);
  assert.equal(validarAtalho("Alt+Alt+A").ok, false);
  assert.equal(validarAtalho("Banana+A").ok, false);
  assert.equal(validarAtalho("Control+Escape").ok, false);
  assert.equal(validarAtalho(42).ok, false);
});

test("rótulo por sistema", () => {
  assert.equal(rotuloDoAtalho("RightOption", "darwin"), "Option direito");
  assert.equal(rotuloDoAtalho("Alt+Space", "darwin"), "Option + Espaço");
  assert.equal(rotuloDoAtalho("Control+Shift+Space", "win32"), "Ctrl + Shift + Espaço");
});
