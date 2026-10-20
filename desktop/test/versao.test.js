const test = require("node:test");
const assert = require("node:assert");
const { versaoMaisNova } = require("../versao");

test("só atualiza pra versão maior", () => {
  assert.equal(versaoMaisNova("2.3.0", "2.2.0"), true);
  assert.equal(versaoMaisNova("2.10.0", "2.9.9"), true);
  assert.equal(versaoMaisNova("2.2.0", "2.2.0"), false);
  assert.equal(versaoMaisNova("1.0.1", "2.2.0"), false);
});

test("versão estranha nunca atualiza", () => {
  assert.equal(versaoMaisNova("", "2.2.0"), false);
  assert.equal(versaoMaisNova("v2.3.0", "2.2.0"), false);
  assert.equal(versaoMaisNova("2.3", "2.2.0"), false);
});
