const test = require("node:test");
const assert = require("node:assert");
const { criarDetectorDeReuniao, criarDetectorPorProcesso, wav } = require("../reuniao");

function montar({ nossos = [], appAberto = false } = {}) {
  let t = 0;
  const eventos = [];
  const d = criarDetectorDeReuniao({
    ehNosso: (pid) => nossos.includes(pid),
    appDeReuniaoAberto: async () => appAberto,
    onSugerir: () => eventos.push("sugerir"),
    onAcabou: () => eventos.push("acabou"),
    agora: () => t,
    sustentarMs: 15_000,
    fimMs: 60_000,
  });
  return { d, eventos, passar: (ms) => (t += ms) };
}

test("outro app no microfone por 15s sugere uma vez e avisa quando acaba", async () => {
  const { d, eventos, passar } = montar();
  d.linha("CAPABILITY PID");
  d.linha("MIC_START 500");
  await d.tick();
  passar(10_000);
  await d.tick();
  assert.deepEqual(eventos, []);
  passar(5_000);
  await d.tick();
  passar(5_000);
  await d.tick();
  assert.deepEqual(eventos, ["sugerir"]);
  d.linha("MIC_STOP 500");
  await d.tick();
  passar(59_000);
  await d.tick();
  assert.deepEqual(eventos, ["sugerir"]);
  passar(1_000);
  await d.tick();
  assert.deepEqual(eventos, ["sugerir", "acabou"]);
});

test("o próprio Eagle Flow no microfone não conta", async () => {
  const { d, eventos, passar } = montar({ nossos: [42] });
  d.linha("MIC_START 42");
  await d.tick();
  passar(30_000);
  await d.tick();
  assert.deepEqual(eventos, []);
});

test("toque rápido no microfone não sugere", async () => {
  const { d, eventos, passar } = montar();
  d.linha("MIC_START 7");
  await d.tick();
  passar(5_000);
  d.linha("MIC_STOP 7");
  await d.tick();
  passar(30_000);
  await d.tick();
  assert.deepEqual(eventos, []);
});

test("Mac antigo (sem pid) só sugere com app de reunião aberto", async () => {
  const sem = montar({ appAberto: false });
  sem.d.linha("CAPABILITY AGGREGATE");
  sem.d.linha("MIC_ACTIVE");
  await sem.d.tick();
  sem.passar(20_000);
  await sem.d.tick();
  assert.deepEqual(sem.eventos, []);

  const com = montar({ appAberto: true });
  com.d.linha("CAPABILITY AGGREGATE");
  com.d.linha("MIC_ACTIVE");
  await com.d.tick();
  com.passar(20_000);
  await com.d.tick();
  assert.deepEqual(com.eventos, ["sugerir"]);
});

test("Windows: Zoom em chamada sugere e ao sair avisa", async () => {
  let aberto = false;
  const eventos = [];
  const d = criarDetectorPorProcesso({
    appDeReuniaoAberto: async () => aberto,
    onSugerir: () => eventos.push("sugerir"),
    onAcabou: () => eventos.push("acabou"),
  });
  await d.tick();
  aberto = true;
  await d.tick();
  await d.tick();
  aberto = false;
  await d.tick();
  assert.deepEqual(eventos, ["sugerir", "acabou"]);
});

test("WAV com cabeçalho certo", () => {
  const w = wav(Buffer.alloc(3200), 16_000);
  assert.equal(w.length, 44 + 3200);
  assert.equal(w.toString("ascii", 0, 4), "RIFF");
  assert.equal(w.readUInt32LE(24), 16_000);
  assert.equal(w.readUInt32LE(40), 3200);
});

// ── Gravação em disco e religar a captura ──────────────────────────────────

const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const {
  criarAudioDoSistemaMac,
  criarGravadorWav,
  limparGravacoesAntigas,
  nomeDaGravacao,
  TAXA,
} = require("../reuniao");

function pastaTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ef-reuniao-"));
}

test("gravador WAV escreve o áudio conforme chega e o cabeçalho acompanha", () => {
  const arq = path.join(pastaTemp(), "a.wav");
  const g = criarGravadorWav(arq, TAXA);
  g.escrever(Buffer.from([1, 2, 3, 4]));
  // Antes de fechar o arquivo já é um WAV inteiro (sobrevive a uma queda).
  let b = fs.readFileSync(arq);
  assert.equal(b.length, 48);
  assert.equal(b.readUInt32LE(40), 4);
  assert.equal(b.readUInt32LE(4), 40);
  g.escrever(Buffer.from([5, 6]));
  g.fechar();
  b = fs.readFileSync(arq);
  assert.deepEqual(b, wav(Buffer.from([1, 2, 3, 4, 5, 6]), TAXA));
  assert.equal(b.readUInt32LE(24), TAXA);
});

test("limpa só os WAV mais velhos que o prazo", () => {
  const pasta = pastaTemp();
  const velho = path.join(pasta, "velho-sistema.wav");
  const novo = path.join(pasta, "novo-sistema.wav");
  const outro = path.join(pasta, "nota.txt");
  for (const f of [velho, novo, outro]) fs.writeFileSync(f, "x");
  const agora = Date.now();
  const antes = (agora - 8 * 86_400_000) / 1000;
  fs.utimesSync(velho, antes, antes);
  fs.utimesSync(outro, antes, antes);
  limparGravacoesAntigas(pasta, 7, agora);
  assert.deepEqual(fs.readdirSync(pasta).sort(), ["nota.txt", "novo-sistema.wav"]);
});

test("nome da gravação vem da hora e termina em -sistema.wav", () => {
  assert.equal(nomeDaGravacao(new Date("2026-10-28T14:05:09.123Z")), "2026-10-28T14-05-09-sistema.wav");
});

/** Leitor nativo falso: emite eventos no stderr e PCM no stdout. */
function leitorFalso() {
  const f = new EventEmitter();
  f.stdout = new EventEmitter();
  f.stderr = new EventEmitter();
  f.kill = () => setImmediate(() => f.emit("exit", 0));
  f.evento = (ev) => f.stderr.emit("data", JSON.stringify(ev) + "\n");
  f.pcm = (bytes) => f.stdout.emit("data", Buffer.from(bytes));
  return f;
}

test("grava em disco, religa quando o dispositivo muda e entrega tudo na fatia", async () => {
  const pasta = pastaTemp();
  const leitores = [];
  const audio = criarAudioDoSistemaMac("tap", {
    pasta,
    log: () => {},
    spawnFn: () => {
      const f = leitorFalso();
      leitores.push(f);
      setImmediate(() => f.evento({ type: "start" }));
      return f;
    },
  });

  assert.deepEqual(await audio.iniciar(), { ok: true });
  assert.equal(leitores.length, 1);
  leitores[0].pcm([1, 2]);
  assert.ok(audio.arquivo.endsWith("-sistema.wav"));
  assert.equal(audio.rodando, true);

  // Troca de fone: o leitor avisa e é substituído.
  leitores[0].evento({ type: "warning", code: "device_invalidated", reason: "route" });
  const inicio = Date.now();
  while (leitores.length < 2 && Date.now() - inicio < 5000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(leitores.length, 2);
  while (!audio.rodando && Date.now() - inicio < 5000) await new Promise((r) => setTimeout(r, 20));
  assert.equal(audio.rodando, true);
  leitores[1].pcm([3, 4]);

  const arquivo = audio.arquivo;
  const fatia = await audio.parar();
  assert.deepEqual(fatia, wav(Buffer.from([1, 2, 3, 4]), TAXA));
  assert.equal(audio.rodando, false);
  assert.equal(audio.arquivo, arquivo);
  assert.deepEqual(fs.readFileSync(arquivo), wav(Buffer.from([1, 2, 3, 4]), TAXA));
  // parar() não religa nada.
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(leitores.length, 2);
});

test("falha ao iniciar não deixa arquivo pra trás", async () => {
  const pasta = pastaTemp();
  const audio = criarAudioDoSistemaMac("tap", {
    pasta,
    log: () => {},
    spawnFn: () => {
      const f = leitorFalso();
      setImmediate(() => {
        f.evento({ type: "error", code: "permission_denied" });
        f.emit("exit", 1);
      });
      return f;
    },
  });
  assert.deepEqual(await audio.iniciar(), { ok: false, motivo: "permission_denied" });
  assert.equal(audio.arquivo, null);
  assert.deepEqual(fs.readdirSync(pasta), []);
  assert.equal(audio.rodando, false);
});
