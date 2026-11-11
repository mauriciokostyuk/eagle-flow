// Cofre da reunião: tudo que o motor consegue guardar em disco enquanto a
// reunião acontece, pra não perder nada se a tela do Eagle Eye, a internet ou
// a transcrição falharem. Fica em userData/reunioes/, junto do WAV do áudio do
// computador (reuniao.js), com o mesmo começo de nome:
//   <data-hora>-microfone.wav   sua voz (gravada pelo motor, não pela tela)
//   <data-hora>-tela.txt        texto da tela da reunião, salvo a cada 15 s
//   <data-hora>-transcricao.txt transcrição que a tela mandar guardar
const fs = require("fs");
const path = require("path");
const { criarGravadorWav, limparGravacoesAntigas, TAXA } = require("./reuniao");

function prefixo(agora = new Date()) {
  return agora.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** Apaga também os .txt velhos (reuniao.js só cuida dos .wav). */
function limparTextosAntigos(pasta, dias, agora = Date.now()) {
  let nomes;
  try {
    nomes = fs.readdirSync(pasta);
  } catch {
    return;
  }
  for (const nome of nomes) {
    if (!nome.endsWith(".txt")) continue;
    const arq = path.join(pasta, nome);
    try {
      if (agora - fs.statSync(arq).mtimeMs > dias * 86_400_000) fs.unlinkSync(arq);
    } catch {
      // some junto
    }
  }
}

function criarCofre({ pasta, log = console.error, agora = () => new Date(), guardarDias = 7 }) {
  let base = null; // caminho sem a terminação, da reunião em andamento
  let mic = null;
  let sistema = null; // Windows: áudio do computador (no Mac é o reuniao.js)
  let ultimaTela = null;
  let ultimos = []; // arquivos da última reunião, pra avisar no fim

  function escreverTexto(terminacao, texto) {
    if (!base) return false;
    const t = String(texto ?? "").trim();
    if (!t) return false;
    try {
      fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(`${base}-${terminacao}.txt`, t + "\n");
      return true;
    } catch (e) {
      log(`[EagleFlow] não deu pra salvar ${terminacao} da reunião:`, e?.message);
      return false;
    }
  }

  function escreverPcm(gravador, nome, pcm) {
    if (!base || !pcm || !pcm.length) return gravador;
    try {
      if (!gravador) gravador = criarGravadorWav(`${base}-${nome}.wav`, TAXA);
      gravador.escrever(pcm);
      return gravador;
    } catch (e) {
      log(`[EagleFlow] gravação do ${nome} em disco parou:`, e?.message);
      try {
        gravador?.fechar();
      } catch {
        // já era
      }
      return null;
    }
  }

  return {
    /** Começa uma reunião: define o nome dos arquivos. */
    iniciar() {
      if (base) return base;
      try {
        fs.mkdirSync(pasta, { recursive: true });
        limparGravacoesAntigas(pasta, guardarDias);
        limparTextosAntigos(pasta, guardarDias);
      } catch {
        // a pasta pode falhar; cada escrita tenta de novo
      }
      base = path.join(pasta, prefixo(agora()));
      ultimaTela = null;
      return base;
    },

    /** PCM 16-bit mono 16 kHz do microfone, conforme chega. */
    microfone(pcm) {
      mic = escreverPcm(mic, "microfone", pcm);
    },

    /** PCM 16-bit mono 16 kHz do áudio do computador (Windows). */
    sistema(pcm) {
      sistema = escreverPcm(sistema, "sistema", pcm);
    },

    /** Texto visível da tela da reunião; só grava quando mudou. */
    tela(texto) {
      const t = String(texto ?? "");
      if (t === ultimaTela) return false;
      if (escreverTexto("tela", t)) {
        ultimaTela = t;
        return true;
      }
      return false;
    },

    /** Transcrição que a tela pediu pra guardar (sempre a versão mais nova). */
    transcricao(texto) {
      return escreverTexto("transcricao", texto);
    },

    /** Fecha tudo e devolve os arquivos que ficaram com conteúdo. */
    parar() {
      if (!base) return ultimos;
      const b = base;
      base = null;
      for (const g of [mic, sistema]) g?.fechar();
      mic = null;
      sistema = null;
      ultimos = ["microfone.wav", "sistema.wav", "tela.txt", "transcricao.txt"]
        .map((fim) => `${b}-${fim}`)
        .filter((arq) => {
          try {
            // Um WAV só com cabeçalho (44 bytes) não tem áudio.
            return fs.statSync(arq).size > (arq.endsWith(".wav") ? 44 : 0);
          } catch {
            return false;
          }
        });
      return ultimos;
    },

    get gravando() {
      return Boolean(base);
    },
    get bytesDoMicrofone() {
      return mic ? mic.bytes : 0;
    },
    get arquivos() {
      return ultimos;
    },
  };
}

module.exports = { criarCofre, prefixo, limparTextosAntigos };
