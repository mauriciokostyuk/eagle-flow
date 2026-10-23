#!/usr/bin/env node
// Compila os leitores nativos do Mac: tecla Fn, áudio do computador e
// "quem está usando o microfone". Uso: node scripts/build-nativos.js [arm64|x64]
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.platform !== "darwin") {
  console.log("[nativos] não é Mac, pulando");
  process.exit(0);
}

const arch = process.argv[2] || process.env.TARGET_ARCH || process.arch;
const CPU = { arm64: "arm64", x64: "x86_64" }[arch];
if (!CPU) {
  console.error(`[nativos] arquitetura desconhecida: ${arch}`);
  process.exit(1);
}

const BINARIOS = [
  { fonte: "macos-globe-listener.swift", saida: "globe-listener", macos: "10.15", frameworks: ["Cocoa"] },
  // A captura do áudio do computador usa o "process tap" do macOS 14.2+.
  {
    fonte: "macos-audio-tap.swift",
    saida: "audio-tap",
    macos: "14.2",
    frameworks: ["CoreAudio", "AudioToolbox", "AVFoundation", "Foundation"],
  },
  { fonte: "macos-mic-listener.swift", saida: "mic-listener", macos: "10.15", frameworks: ["CoreAudio", "Foundation"] },
];

const raiz = path.join(__dirname, "..");
const pastaSaida = path.join(raiz, "build", "bin");
fs.mkdirSync(pastaSaida, { recursive: true });

for (const b of BINARIOS) {
  const minimo = arch === "arm64" && b.macos === "10.15" ? "11.0" : b.macos;
  const saida = path.join(pastaSaida, b.saida);
  const args = [
    "swiftc",
    path.join(raiz, "native", b.fonte),
    "-O",
    "-target",
    `${CPU}-apple-macosx${minimo}`,
    "-o",
    saida,
    ...b.frameworks.flatMap((f) => ["-framework", f]),
  ];
  let r = spawnSync("xcrun", args, { stdio: "inherit" });
  if (r.status !== 0) r = spawnSync(args[0], args.slice(1), { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`[nativos] ${b.saida} falhou. Instale as ferramentas: xcode-select --install`);
    process.exit(r.status ?? 1);
  }
  console.log(`[nativos] ok: ${b.saida} (${arch})`);
}
