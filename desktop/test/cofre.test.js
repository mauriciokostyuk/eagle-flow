const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { criarCofre, limparTextosAntigos } = require("../cofre");

function pastaTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cofre-"));
}

const QUIETO = () => {};

test("microfone vira WAV em disco com cabeçalho certo, mesmo sem parar()", () => {
  const pasta = pastaTemp();
  const c = criarCofre({ pasta, log: QUIETO, agora: () => new Date("2026-11-11T13:00:00Z") });
  c.iniciar();
  c.microfone(Buffer.alloc(3200, 1));
  c.microfone(Buffer.alloc(1600, 2));
  const arq = path.join(pasta, "2026-11-11T13-00-00-microfone.wav");
  const wav = fs.readFileSync(arq); // ainda aberto: um app que caiu deixaria assim
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(40), 4800);
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.length, 44 + 4800);
  assert.equal(c.bytesDoMicrofone, 4800);
  const arquivos = c.parar();
  assert.deepEqual(arquivos, [arq]);
  assert.equal(c.gravando, false);
});

test("texto da tela só grava quando muda; transcrição sobrescreve", () => {
  const pasta = pastaTemp();
  const c = criarCofre({ pasta, log: QUIETO, agora: () => new Date("2026-11-11T13:00:00Z") });
  c.iniciar();
  assert.equal(c.tela("Reunião\nJoão: oi"), true);
  assert.equal(c.tela("Reunião\nJoão: oi"), false);
  assert.equal(c.tela("Reunião\nJoão: oi\nMaria: tudo bem"), true);
  assert.equal(c.transcricao("João: oi"), true);
  assert.equal(c.transcricao("João: oi\nMaria: tudo bem"), true);
  const b = path.join(pasta, "2026-11-11T13-00-00");
  assert.equal(fs.readFileSync(`${b}-tela.txt`, "utf8"), "Reunião\nJoão: oi\nMaria: tudo bem\n");
  assert.equal(fs.readFileSync(`${b}-transcricao.txt`, "utf8"), "João: oi\nMaria: tudo bem\n");
  assert.deepEqual(c.parar(), [`${b}-tela.txt`, `${b}-transcricao.txt`]);
});

test("reunião sem áudio nem texto não deixa arquivo", () => {
  const pasta = pastaTemp();
  const c = criarCofre({ pasta, log: QUIETO });
  c.iniciar();
  c.tela("");
  assert.deepEqual(c.parar(), []);
  assert.deepEqual(fs.readdirSync(pasta), []);
});

test("fora de uma reunião nada é gravado", () => {
  const pasta = pastaTemp();
  const c = criarCofre({ pasta, log: QUIETO });
  c.microfone(Buffer.alloc(100));
  assert.equal(c.tela("x"), false);
  assert.equal(c.transcricao("x"), false);
  assert.deepEqual(fs.readdirSync(pasta), []);
});

test("textos velhos somem, recentes ficam", () => {
  const pasta = pastaTemp();
  const velho = path.join(pasta, "velho-tela.txt");
  const novo = path.join(pasta, "novo-tela.txt");
  fs.writeFileSync(velho, "a");
  fs.writeFileSync(novo, "b");
  const antes = Date.now() - 8 * 86_400_000;
  fs.utimesSync(velho, antes / 1000, antes / 1000);
  limparTextosAntigos(pasta, 7);
  assert.deepEqual(fs.readdirSync(pasta), ["novo-tela.txt"]);
});

test("segunda reunião ganha arquivos novos e parar() lista só os dela", () => {
  const pasta = pastaTemp();
  let t = new Date("2026-11-11T13:00:00Z");
  const c = criarCofre({ pasta, log: QUIETO, agora: () => t });
  c.iniciar();
  c.microfone(Buffer.alloc(320, 1));
  c.parar();
  t = new Date("2026-11-11T15:00:00Z");
  c.iniciar();
  c.sistema(Buffer.alloc(320, 1));
  assert.deepEqual(c.parar(), [path.join(pasta, "2026-11-11T15-00-00-sistema.wav")]);
  assert.equal(fs.readdirSync(pasta).length, 2);
});
