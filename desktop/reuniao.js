// Reuniões: perceber quando uma começa (alguém além do Eagle Flow segurando o
// microfone) e capturar o áudio do computador, que é o que os outros falam.
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const SUSTENTAR_MS = 15_000; // microfone ocupado por outro app esse tempo = reunião
const FIM_MS = 60_000; // microfone livre esse tempo = reunião acabou

// Apps que confirmam reunião quando o Mac não diz qual processo usa o microfone.
const APPS_DE_REUNIAO_MAC = /^(zoom\.us|Microsoft Teams.*|MSTeams|Webex|FaceTime|Slack)$/m;
// No Windows o Zoom só abre o CptHost durante uma chamada.
const APPS_DE_REUNIAO_WIN = /^(CptHost\.exe)\b/im;

/**
 * Decide quando sugerir e quando dar a reunião por encerrada. Puro: recebe as
 * linhas do leitor de microfone e um `tick()` periódico.
 */
function criarDetectorDeReuniao({
  ehNosso,
  appDeReuniaoAberto,
  onSugerir,
  onAcabou,
  agora = Date.now,
  sustentarMs = SUSTENTAR_MS,
  fimMs = FIM_MS,
}) {
  let porProcesso = true;
  const pids = new Set();
  let agregadoAtivo = false;
  let desde = null;
  let livreDesde = null;
  let sugerido = false;

  function linha(texto) {
    const l = String(texto).trim();
    if (l === "CAPABILITY PID") porProcesso = true;
    else if (l === "CAPABILITY AGGREGATE") porProcesso = false;
    else if (l === "MIC_ACTIVE") agregadoAtivo = true;
    else if (l === "MIC_INACTIVE") agregadoAtivo = false;
    else {
      const m = /^MIC_(START|STOP) (\d+)$/.exec(l);
      if (!m) return;
      if (m[1] === "START") pids.add(Number(m[2]));
      else pids.delete(Number(m[2]));
    }
  }

  async function outroAppUsandoMic() {
    if (porProcesso) return [...pids].some((pid) => !ehNosso(pid));
    return agregadoAtivo && (await appDeReuniaoAberto());
  }

  async function tick() {
    const ocupado = await outroAppUsandoMic();
    const t = agora();
    if (ocupado) {
      livreDesde = null;
      if (desde === null) desde = t;
      if (!sugerido && t - desde >= sustentarMs) {
        sugerido = true;
        onSugerir();
      }
      return;
    }
    desde = null;
    if (!sugerido) return;
    if (livreDesde === null) livreDesde = t;
    if (t - livreDesde >= fimMs) {
      sugerido = false;
      livreDesde = null;
      onAcabou();
    }
  }

  return { linha, tick, get sugerido() { return sugerido; } };
}

/** Detector no Windows: só por processo (Zoom em chamada). */
function criarDetectorPorProcesso({ appDeReuniaoAberto, onSugerir, onAcabou }) {
  let emReuniao = false;
  return {
    async tick() {
      const aberto = await appDeReuniaoAberto();
      if (aberto && !emReuniao) {
        emReuniao = true;
        onSugerir();
      } else if (!aberto && emReuniao) {
        emReuniao = false;
        onAcabou();
      }
    },
  };
}

function listaDeProcessos() {
  return new Promise((resolve) => {
    const [cmd, args] =
      process.platform === "win32" ? ["tasklist", ["/fo", "csv", "/nh"]] : ["ps", ["-axco", "comm"]];
    execFile(cmd, args, { timeout: 5000, windowsHide: true }, (err, out) =>
      resolve(err ? "" : String(out).replace(/^"/gm, ""))
    );
  });
}

async function appDeReuniaoAberto() {
  const lista = await listaDeProcessos();
  return (process.platform === "win32" ? APPS_DE_REUNIAO_WIN : APPS_DE_REUNIAO_MAC).test(lista);
}

/** Cabeçalho WAV (PCM 16-bit mono) para `bytes` de áudio. */
function cabecalhoWav(bytes, taxa) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(taxa, 24);
  h.writeUInt32LE(taxa * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}

/** Envolve PCM 16-bit mono num WAV. */
function wav(pcm, taxa) {
  return Buffer.concat([cabecalhoWav(pcm.length, taxa), pcm]);
}

const TAXA = 16_000;
const GUARDAR_GRAVACOES_DIAS = 7;

/**
 * Grava PCM num WAV em disco conforme chega, pra sobrar algo se a tela, o
 * app ou a transcrição falharem no meio da reunião. O cabeçalho é refeito a
 * cada escrita: um arquivo interrompido ainda abre inteiro.
 */
function criarGravadorWav(caminho, taxa = TAXA) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const fd = fs.openSync(caminho, "w");
  let bytes = 0;
  fs.writeSync(fd, cabecalhoWav(0, taxa), 0, 44, 0);

  return {
    caminho,
    get bytes() {
      return bytes;
    },
    escrever(pcm) {
      if (!pcm.length) return;
      fs.writeSync(fd, pcm, 0, pcm.length, 44 + bytes);
      bytes += pcm.length;
      fs.writeSync(fd, cabecalhoWav(bytes, taxa), 0, 44, 0);
    },
    /** Fecha; um arquivo sem áudio nenhum é apagado. */
    fechar() {
      try {
        fs.closeSync(fd);
      } catch {
        // já fechado
      }
      if (!bytes) {
        try {
          fs.unlinkSync(caminho);
        } catch {
          // já foi
        }
      }
    },
  };
}

function nomeDaGravacao(agora = new Date()) {
  return `${agora.toISOString().replace(/[:.]/g, "-").slice(0, 19)}-sistema.wav`;
}

/** Apaga gravações antigas; as recentes ficam pra recuperar uma reunião. */
function limparGravacoesAntigas(pasta, dias = GUARDAR_GRAVACOES_DIAS, agora = Date.now()) {
  let nomes;
  try {
    nomes = fs.readdirSync(pasta);
  } catch {
    return;
  }
  for (const nome of nomes) {
    if (!nome.endsWith(".wav")) continue;
    const arq = path.join(pasta, nome);
    try {
      if (agora - fs.statSync(arq).mtimeMs > dias * 86_400_000) fs.unlinkSync(arq);
    } catch {
      // some junto
    }
  }
}

/**
 * Áudio do computador no Mac pelo leitor nativo (macOS 14.2+). Guarda o PCM
 * em memória e entrega em fatias WAV. Com `pasta`, também grava tudo num WAV
 * em disco. Quando o Mac troca o dispositivo de saída (fone, AirPods), o
 * leitor avisa e para de ouvir: aí ele é religado sozinho.
 */
function criarAudioDoSistemaMac(bin, { pasta = null, log = console.error, spawnFn = spawn } = {}) {
  let filho = null;
  let partes = [];
  let erro = null;
  let gravador = null;
  let ultimoArquivo = null;
  let sessao = 0; // muda a cada parar(): um religar atrasado não ressuscita
  let religando = null;

  function abrirGravador() {
    if (!pasta) return;
    try {
      limparGravacoesAntigas(pasta);
      gravador = criarGravadorWav(path.join(pasta, nomeDaGravacao()), TAXA);
    } catch (e) {
      gravador = null;
      log("[EagleFlow] não deu pra gravar a reunião em disco:", e?.message);
    }
  }

  function ligarLeitor() {
    return new Promise((resolve) => {
      let resolvido = false;
      const fim = (r) => {
        if (!resolvido) {
          resolvido = true;
          resolve(r);
        }
      };
      let f;
      try {
        f = spawnFn(bin, ["--sample-rate", String(TAXA), "--chunk-ms", "100"], {
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {
        return fim({ ok: false, motivo: "start_failed" });
      }
      filho = f;
      const minhaSessao = sessao;
      f.stdout.on("data", (d) => {
        partes.push(d);
        try {
          gravador?.escrever(d);
        } catch (e) {
          log("[EagleFlow] gravação em disco parou:", e?.message);
          gravador?.fechar();
          gravador = null;
        }
      });
      let resto = "";
      f.stderr.on("data", (d) => {
        resto += d;
        let i;
        while ((i = resto.indexOf("\n")) >= 0) {
          const l = resto.slice(0, i);
          resto = resto.slice(i + 1);
          try {
            const ev = JSON.parse(l);
            if (ev.type === "start") fim({ ok: true });
            if (ev.type === "error") {
              erro = ev.code || "erro";
              fim({ ok: false, motivo: erro });
            }
            if (ev.type === "warning" && ev.code === "device_invalidated") {
              log("[EagleFlow] áudio do sistema trocou de dispositivo, religando a captura");
              void religar(minhaSessao);
            }
          } catch {
            // linha que não é evento
          }
        }
      });
      f.on("error", () => fim({ ok: false, motivo: "start_failed" }));
      f.on("exit", () => {
        if (filho === f) filho = null;
        fim({ ok: false, motivo: erro || "exited" });
        // Caiu no meio da reunião (não foi parar()): religa.
        if (resolvido && minhaSessao === sessao && erro === null) void religar(minhaSessao);
      });
      setTimeout(() => fim({ ok: Boolean(filho) }), 5000);
    });
  }

  function matar(f) {
    return new Promise((r) => {
      const t = setTimeout(r, 2000);
      f.once("exit", () => {
        clearTimeout(t);
        r();
      });
      try {
        f.kill("SIGTERM");
      } catch {
        r();
      }
    });
  }

  async function religar(daSessao) {
    if (religando || daSessao !== sessao) return;
    religando = (async () => {
      const antigo = filho;
      filho = null;
      if (antigo) await matar(antigo);
      // Espera o CoreAudio assentar a troca antes de criar o tap de novo.
      for (let tentativa = 0; tentativa < 3 && daSessao === sessao; tentativa++) {
        await new Promise((r) => setTimeout(r, 1000 * (tentativa + 1)));
        if (daSessao !== sessao) break;
        erro = null;
        const r = await ligarLeitor();
        if (r.ok) return;
        if (filho) await matar(filho);
        filho = null;
      }
      if (daSessao === sessao) log("[EagleFlow] não deu pra religar o áudio do sistema");
    })().finally(() => {
      religando = null;
    });
    await religando;
  }

  function iniciar() {
    if (filho) return Promise.resolve({ ok: true });
    partes = [];
    erro = null;
    abrirGravador();
    return ligarLeitor().then((r) => {
      if (!r.ok) {
        gravador?.fechar();
        gravador = null;
      }
      return r;
    });
  }

  function fatia() {
    const pcm = Buffer.concat(partes);
    partes = [];
    return pcm.length ? wav(pcm, TAXA) : null;
  }

  async function parar() {
    sessao++;
    if (religando) await religando.catch(() => {});
    if (filho) {
      const f = filho;
      filho = null;
      await matar(f);
    }
    if (gravador) {
      ultimoArquivo = gravador.bytes ? gravador.caminho : null;
      gravador.fechar();
      gravador = null;
    }
    return fatia();
  }

  return {
    iniciar,
    fatia,
    parar,
    get rodando() {
      return Boolean(filho);
    },
    /** WAV em disco da reunião em andamento, ou da última. */
    get arquivo() {
      return gravador?.caminho ?? ultimoArquivo;
    },
  };
}

module.exports = {
  SUSTENTAR_MS,
  FIM_MS,
  GUARDAR_GRAVACOES_DIAS,
  criarDetectorDeReuniao,
  criarDetectorPorProcesso,
  appDeReuniaoAberto,
  criarAudioDoSistemaMac,
  criarGravadorWav,
  limparGravacoesAntigas,
  nomeDaGravacao,
  wav,
  TAXA,
};
