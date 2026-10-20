#!/usr/bin/env node
// Compila o leitor da tecla Fn/Globo (só Mac). Uso: node scripts/build-globe.js [arm64|x64]
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.platform !== "darwin") {
  console.log("[globe] não é Mac, pulando");
  process.exit(0);
}

const ALVOS = { arm64: "arm64-apple-macosx11.0", x64: "x86_64-apple-macosx10.15" };
const arch = process.argv[2] || process.env.TARGET_ARCH || process.arch;
const alvo = ALVOS[arch];
if (!alvo) {
  console.error(`[globe] arquitetura desconhecida: ${arch}`);
  process.exit(1);
}

const raiz = path.join(__dirname, "..");
const fonte = path.join(raiz, "native", "macos-globe-listener.swift");
const saida = path.join(raiz, "build", "bin", "globe-listener");
fs.mkdirSync(path.dirname(saida), { recursive: true });

const args = ["swiftc", fonte, "-O", "-target", alvo, "-o", saida, "-framework", "Cocoa"];
let r = spawnSync("xcrun", args, { stdio: "inherit" });
if (r.status !== 0) r = spawnSync(args[0], args.slice(1), { stdio: "inherit" });
if (r.status !== 0) {
  console.error("[globe] falhou ao compilar. Instale as ferramentas: xcode-select --install");
  process.exit(r.status ?? 1);
}
console.log(`[globe] ok: ${saida} (${arch})`);
