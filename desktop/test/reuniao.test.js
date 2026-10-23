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
