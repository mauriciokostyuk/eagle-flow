// Reuniões: perceber quando uma começa (alguém além do Eagle Flow segurando o
// microfone) e capturar o áudio do computador, que é o que os outros falam.
const { spawn, execFile } = require("child_process");

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

/** Envolve PCM 16-bit mono num WAV. */
function wav(pcm, taxa) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
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
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const TAXA = 16_000;

/**
 * Áudio do computador no Mac pelo leitor nativo (macOS 14.2+). Guarda o PCM
 * em memória e entrega em fatias WAV.
 */
function criarAudioDoSistemaMac(bin) {
  let filho = null;
  let partes = [];
  let erro = null;

  function iniciar() {
    if (filho) return Promise.resolve({ ok: true });
    partes = [];
    erro = null;
    return new Promise((resolve) => {
      let resolvido = false;
      const fim = (r) => {
        if (!resolvido) {
          resolvido = true;
          resolve(r);
        }
      };
      try {
        filho = spawn(bin, ["--sample-rate", String(TAXA), "--chunk-ms", "100"], {
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (e) {
        filho = null;
        return fim({ ok: false, motivo: "start_failed" });
      }
      filho.stdout.on("data", (d) => partes.push(d));
      let resto = "";
      filho.stderr.on("data", (d) => {
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
          } catch {
            // linha que não é evento
          }
        }
      });
      filho.on("error", () => fim({ ok: false, motivo: "start_failed" }));
      filho.on("exit", () => {
        filho = null;
        fim({ ok: false, motivo: erro || "exited" });
      });
      setTimeout(() => fim({ ok: Boolean(filho) }), 5000);
    });
  }

  function fatia() {
    const pcm = Buffer.concat(partes);
    partes = [];
    return pcm.length ? wav(pcm, TAXA) : null;
  }

  async function parar() {
    if (filho) {
      const f = filho;
      await new Promise((r) => {
        const t = setTimeout(r, 2000);
        f.once("exit", () => {
          clearTimeout(t);
          r();
        });
        f.kill("SIGTERM");
      });
    }
    return fatia();
  }

  return { iniciar, fatia, parar, get rodando() { return Boolean(filho); } };
}

module.exports = {
  SUSTENTAR_MS,
  FIM_MS,
  criarDetectorDeReuniao,
  criarDetectorPorProcesso,
  appDeReuniaoAberto,
  criarAudioDoSistemaMac,
  wav,
  TAXA,
};
