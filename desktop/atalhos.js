// Atalhos aceitos pelo Eagle Flow (puro, testado em test/atalhos.test.js).
//
// Dois tipos:
// - Tecla modificadora sozinha, do lado direito ("RightOption"...): segurar e
//   falar, sem conflitar com atalhos de outros apps. Lida pelo uiohook.
// - Combinação comum no formato do Electron ("Control+Shift+Space"): registrada
//   com globalShortcut.

const MODIFICADORES_SOZINHOS = {
  RightOption: { uiohook: "AltRight", mac: "Option direito", win: "Alt direito" },
  RightCommand: { uiohook: "MetaRight", mac: "Command direito", win: "Windows direito" },
  RightCtrl: { uiohook: "CtrlRight", mac: "Control direito", win: "Ctrl direito" },
  RightShift: { uiohook: "ShiftRight", mac: "Shift direito", win: "Shift direito" },
};

const MODIFICADORES = ["Control", "Alt", "Shift", "Command", "Super"];
const ROTULO_MOD_MAC = {
  Control: "Control",
  Alt: "Option",
  Shift: "Shift",
  Command: "Command",
  Super: "Command",
};
const ROTULO_MOD_WIN = {
  Control: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
  Command: "Win",
  Super: "Win",
};

const TECLA_VALIDA =
  /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Enter)$/;

function padraoDoSistema(platform) {
  return platform === "darwin" ? "RightOption" : "RightCtrl";
}

function ehModificadorSozinho(atalho) {
  return Object.prototype.hasOwnProperty.call(MODIFICADORES_SOZINHOS, atalho);
}

/**
 * Confere um atalho vindo da tela. Combinação precisa de pelo menos um
 * modificador e uma tecla, senão roubaria a tecla de todos os apps.
 */
function validarAtalho(atalho) {
  if (typeof atalho !== "string" || atalho.length > 60)
    return { ok: false, erro: "Atalho inválido." };
  if (ehModificadorSozinho(atalho)) return { ok: true };
  const partes = atalho.split("+");
  const tecla = partes.pop();
  if (!partes.length)
    return { ok: false, erro: "Use pelo menos uma tecla como Ctrl, Option ou Shift junto." };
  if (new Set(partes).size !== partes.length || !partes.every((p) => MODIFICADORES.includes(p))) {
    return { ok: false, erro: "Atalho inválido." };
  }
  if (!TECLA_VALIDA.test(tecla)) return { ok: false, erro: "Essa tecla não pode ser usada." };
  return { ok: true };
}

function rotuloDoAtalho(atalho, platform) {
  const mac = platform === "darwin";
  if (ehModificadorSozinho(atalho)) {
    return MODIFICADORES_SOZINHOS[atalho][mac ? "mac" : "win"];
  }
  const rotulos = mac ? ROTULO_MOD_MAC : ROTULO_MOD_WIN;
  return atalho
    .split("+")
    .map((p) => rotulos[p] || (p === "Space" ? "Espaço" : p))
    .join(" + ");
}

module.exports = {
  MODIFICADORES_SOZINHOS,
  padraoDoSistema,
  ehModificadorSozinho,
  validarAtalho,
  rotuloDoAtalho,
};
