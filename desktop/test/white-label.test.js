const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { gerar, validar, aplicar, trocas } = require("../scripts/white-label");

const marca = {
  nome: "All Matters Construction Flow",
  slug: "construction-flow",
  appId: "ai.allmatters.constructionflow",
  plataforma: "All Matters AI",
  baseUrl: "https://app.allmatters.ai/",
  autor: "All Matters AI",
  github: "cristiano/all-matters-ai",
};

function lerTudo(dir, acc = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) lerTudo(p, acc);
    else if (/\.(js|json|html|yml|swift)$/.test(n)) acc.push([p, fs.readFileSync(p, "utf8")]);
  }
  return acc;
}

test("a cópia não tem nada da Eagle", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "wl-"));
  gerar(marca, path.join(out, "construction-flow"));
  for (const [p, t] of lerTudo(out)) {
    assert.ok(!/eagle|EAGLE|Eagle/.test(t), `${p} ainda fala em Eagle`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(out, "construction-flow", "package.json"), "utf8"));
  assert.equal(pkg.name, "construction-flow-desktop");
  assert.equal(pkg.productName, marca.nome);
  assert.equal(pkg.version, "1.0.0");
  assert.equal(pkg.build.appId, marca.appId);
  assert.equal(pkg.build.publish.owner, "cristiano");
  assert.equal(pkg.build.publish.repo, "all-matters-ai");
  assert.equal(pkg.build.afterSign, undefined);
  assert.equal(pkg.build.mac.artifactName, "AllMattersConstructionFlow-mac-${arch}.${ext}");
  assert.ok(!fs.existsSync(path.join(out, "construction-flow", "scripts", "assinar.js")));
  assert.ok(!fs.existsSync(path.join(out, "construction-flow", "node_modules")));
  assert.ok(fs.existsSync(path.join(out, "construction-flow", "build", "icon.png")));

  const main = fs.readFileSync(path.join(out, "construction-flow", "main.js"), "utf8");
  assert.match(main, /process\.env\.CONSTRUCTION_FLOW_URL \|\| "https:\/\/app\.allmatters\.ai"/);
  assert.match(main, /`\$\{BASE\}\/construction-flow-app\/pill`/);
  const preload = fs.readFileSync(path.join(out, "construction-flow", "preload.js"), "utf8");
  assert.match(preload, /exposeInMainWorld\("constructionFlowShell"/);
  const wf = fs.readFileSync(path.join(out, "construction-flow", "release.workflow.yml"), "utf8");
  assert.match(wf, /working-directory: construction-flow/);
  assert.match(wf, /\$\{\{ github\.token \}\}/);
  fs.rmSync(out, { recursive: true, force: true });
});

test("a cópia roda os próprios testes", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "wl-"));
  const dir = path.join(out, "construction-flow");
  gerar(marca, dir);
  const { spawnSync } = require("node:child_process");
  const r = spawnSync(process.execPath, ["--test", ...fs.readdirSync(path.join(dir, "test")).map((f) => path.join("test", f))], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  fs.rmSync(out, { recursive: true, force: true });
});

test("valida a marca", () => {
  assert.throws(() => validar({ ...marca, slug: "Construction Flow" }), /slug/);
  assert.throws(() => validar({ ...marca, github: "semBarra" }), /github/);
  assert.throws(() => validar({ ...marca, baseUrl: "http://x" }), /baseUrl/);
  assert.throws(() => validar({ nome: "x" }), /sem:/);
});

test("troca específica antes da genérica", () => {
  const t = aplicar("com.eaglemidiadigital.eagleflow Eagle Flow EagleFlow", trocas(marca));
  assert.equal(t, "ai.allmatters.constructionflow All Matters Construction Flow AllMattersConstructionFlow");
});
