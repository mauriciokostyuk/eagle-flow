// Máquina de estados do atalho (pura, testada em test/hotkey.test.js).
//
// - Segurar o atalho e soltar: grava enquanto segura.
// - Toque rápido: liga; outro toque: desliga.
// - Esc durante a gravação: cancela.
// Sem o leitor de teclas (uiohook), não há "soltar": tudo vira toque.

const HOLD_MS = 350;

function createHotkeyMachine({ holdSupported, onStart, onStop, onCancel, now = Date.now }) {
  let state = "idle"; // idle | holding | toggled
  let pressedAt = 0;

  return {
    get state() {
      return state;
    },
    press() {
      if (state === "idle") {
        const hold = typeof holdSupported === "function" ? holdSupported() : holdSupported;
        state = hold ? "holding" : "toggled";
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
      } else {
        state = "toggled";
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
