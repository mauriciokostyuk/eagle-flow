#!/usr/bin/env node
// Gera uma cópia do motor com outra marca (white label).
//
// Uso:
//   node scripts/white-label.js --config marca.json --out ../../minha-plataforma/construction-flow
//
// marca.json (todos os campos, exemplo em white-label.exemplo.json):
//   nome       "All Matters Construction Flow"  nome do produto (janela, bandeja, .app)
//   slug       "construction-flow"              pastas, pacote npm, páginas (/<slug>-app)
//   appId      "ai.allmatters.constructionflow"  id do app (Mac/Windows)
//   plataforma "All Matters AI"                 nome do site que serve a tela
//   baseUrl    "https://app.allmatters.ai"      onde a tela mora
//   autor      "All Matters AI"
//   github     "cristiano/all-matters-ai"       owner/repo que publica os releases
//   cores      { primaria, fundo, fundo2 }      opcional
//
// A cópia sai sem node_modules, dist e build/bin. Os ícones em build/ vêm do
// Eagle Flow como marcador: troque por icon.png, icon.icns, icon.ico e
// trayTemplate@3x.png da marca nova.
const fs = require("fs");
const path = require("path");

const ORIGEM = path.join(__dirname, "..");
const IGNORAR = new Set(["node_modules", "dist", "bin", "package-lock.json", ".DS_Store"]);
const TEXTO = /\.(js|json|html|yml|md|swift)$/;

function args() {
  const a = process.argv.slice(2);
  const pegar = (k) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { config: pegar("--config"), out: pegar("--out") };
}

function compacto(nome) {
  return nome.replace(/[^A-Za-z0-9]+/g, "");
}

function camel(slug) {
  return slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** Lista de trocas, da mais específica pra mais genérica (pura, testada). */
function trocas(m) {
  const cores = m.cores || {};
  const lista = [
    ["eagle-flow-desktop", `${m.slug}-desktop`],
    ["com.eaglemidiadigital.eagleflow", m.appId],
    ["https://eye.autoeaglemidia.com", m.baseUrl.replace(/\/$/, "")],
    ["/eagle-flow-app", `/${m.slug}-app`],
    ["EAGLE_FLOW_URL", `${m.slug.toUpperCase().replace(/-/g, "_")}_URL`],
    ["mauriciokostyuk/eagle-flow", m.github],
    ['"owner": "mauriciokostyuk"', `"owner": "${m.github.split("/")[0]}"`],
    ['"repo": "eagle-flow"', `"repo": "${m.github.split("/")[1]}"`],
    ["eagleFlowShell", `${camel(m.slug)}Shell`],
    ["Eagle Flow Eagle Midia", `${m.nome} ${m.autor}`],
    ["Eagle Mídia Digital", m.autor],
    ["Eagle Eye", m.plataforma],
    ["deEagleEye", "daPlataforma"],
    ["EagleFlow", compacto(m.nome)],
    ["eagleflow", compacto(m.nome).toLowerCase()],
    ["Eagle Flow", m.nome],
  ];
  if (cores.primaria) lista.push(["#2b62d6", cores.primaria]);
  if (cores.fundo) lista.push(["#020925", cores.fundo]);
  if (cores.fundo2) lista.push(["#0d2662", cores.fundo2]);
  return lista;
}

function aplicar(texto, lista) {
  let t = texto;
  for (const [de, para] of lista) t = t.split(de).join(para);
  return t;
}

function validar(m) {
  const faltando = ["nome", "slug", "appId", "plataforma", "baseUrl", "autor", "github"].filter(
    (k) => !m[k]
  );
  if (faltando.length) throw new Error(`marca.json sem: ${faltando.join(", ")}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.slug)) throw new Error("slug: só letras minúsculas, números e hífen");
  if (!/^[^/]+\/[^/]+$/.test(m.github)) throw new Error("github: use owner/repo");
  if (!/^https:\/\//.test(m.baseUrl)) throw new Error("baseUrl: precisa começar com https://");
}

function copiar(de, para, lista) {
  fs.mkdirSync(para, { recursive: true });
  for (const nome of fs.readdirSync(de)) {
    if (IGNORAR.has(nome)) continue;
    const o = path.join(de, nome);
    const d = path.join(para, nome);
    if (fs.statSync(o).isDirectory()) {
      copiar(o, d, lista);
    } else if (TEXTO.test(nome)) {
      fs.writeFileSync(d, aplicar(fs.readFileSync(o, "utf8"), lista));
    } else {
      fs.copyFileSync(o, d);
    }
  }
}

function workflow(m, pasta) {
  const tag = "${{";
  const f = (s) => `${tag} ${s} }}`;
  return `name: Release ${m.nome} (motor)

# Gera os instaladores do motor (pasta ${pasta}/). Rode pelo botão "Run workflow".
on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ${pasta}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
      - run: npm ci
      - run: npm test

  release:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Criar o release antes dos builds (evita release duplicado)
        env:
          GH_TOKEN: ${f("github.token")}
        run: |
          TAG="v$(node -p "require('./${pasta}/package.json').version")"
          gh release view "$TAG" >/dev/null 2>&1 || gh release create "$TAG" --title "${m.nome} $TAG" --notes "Motor do ${m.nome}. Tela e regras vêm do ${m.plataforma}."

  mac:
    needs: release
    runs-on: macos-latest
    strategy:
      fail-fast: false
      matrix:
        arch: [arm64, x64]
    defaults:
      run:
        working-directory: ${pasta}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
      - run: npm ci
      - run: node scripts/build-nativos.js ${f("matrix.arch")}
      - run: npx electron-builder --mac --${f("matrix.arch")} --publish always
        env:
          GH_TOKEN: ${f("github.token")}
          CSC_IDENTITY_AUTO_DISCOVERY: "false"

  windows:
    needs: release
    runs-on: windows-latest
    defaults:
      run:
        working-directory: ${pasta}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
      - run: npm ci
      - run: npx electron-builder --win --x64 --publish always
        env:
          GH_TOKEN: ${f("github.token")}
`;
}

function gerar(m, out) {
  validar(m);
  const lista = trocas(m);
  copiar(ORIGEM, out, lista);
  // Versão nova começa do 1.0.0 e sem o script de assinatura da Eagle.
  const pkgPath = path.join(out, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = "1.0.0";
  delete pkg.build.afterSign;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  fs.rmSync(path.join(out, "scripts", "assinar.js"), { force: true });
  fs.rmSync(path.join(out, "scripts", "white-label.js"), { force: true });
  fs.rmSync(path.join(out, "scripts", "white-label.exemplo.json"), { force: true });
  fs.rmSync(path.join(out, "test", "white-label.test.js"), { force: true });
  fs.rmSync(path.join(out, "WHITE_LABEL.md"), { force: true });
  fs.writeFileSync(path.join(out, "release.workflow.yml"), workflow(m, path.basename(out)));
  fs.writeFileSync(path.join(out, ".gitignore"), "node_modules\ndist\nbuild/bin\n");
  return out;
}

if (require.main === module) {
  const { config, out } = args();
  if (!config || !out) {
    console.error("uso: node scripts/white-label.js --config marca.json --out <pasta>");
    process.exit(1);
  }
  const marca = JSON.parse(fs.readFileSync(config, "utf8"));
  const destino = gerar(marca, path.resolve(out));
  console.log(`[white-label] ${marca.nome} gerado em ${destino}`);
  console.log("[white-label] falta: ícones em build/ e mover release.workflow.yml pra .github/workflows/");
}

module.exports = { trocas, aplicar, validar, gerar, compacto, camel };
