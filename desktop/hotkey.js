// Máquina de estados do atalho (pura, testada em test/hotkey.test.js).
//
// - Segurar o atalho e soltar: grava enquanto segura.
// - Toque rápido: liga; outro toque: desliga (só em atalho com tecla comum;
//   numa tecla modificadora sozinha, como o Option direito, toque rápido é
//   engano e cancela).
// - Esc durante a gravação: cancela.
// Sem o leitor de teclas (uiohook), não há "soltar": tudo vira toque.

const HOLD_MS = 350;

function valor(v) {
  return typeof v === "function" ? v() : v;
}

function createHotkeyMachine({
  holdSupported,
  tapToggles = true,
  onStart,
  onStop,
  onCancel,
  now = Date.now,
}) {
  let state = "idle"; // idle | holding | toggled
  let pressedAt = 0;

  return {
    get state() {
      return state;
    },
    press() {
      if (state === "idle") {
        state = valor(holdSupported) ? "holding" : "toggled";
        pressedAt = now();
        onStart();
      } else if (state === "toggled") {
        state = "idle";
        onStop();
      }
      // "holding": repetição automática da tecla segurada, ignora.
    },
    release() {
      if (state !== "holding") return;
      if (now() - pressedAt >= HOLD_MS) {
        state = "idle";
        onStop();
      } else if (valor(tapToggles)) {
        state = "toggled";
      } else {
        state = "idle";
        onCancel();
      }
    },
    escape() {
      if (state === "idle") return;
      state = "idle";
      onCancel();
    },
  };
}

module.exports = { createHotkeyMachine, HOLD_MS };
