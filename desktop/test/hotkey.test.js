const test = require("node:test");
const assert = require("node:assert");
const { createHotkeyMachine } = require("../hotkey");

function setup(holdSupported = true) {
  let t = 0;
  const events = [];
  const m = createHotkeyMachine({
    holdSupported,
    now: () => t,
    onStart: () => events.push("start"),
    onStop: () => events.push("stop"),
    onCancel: () => events.push("cancel"),
  });
  return { m, events, advance: (ms) => (t += ms) };
}

test("segurar e soltar grava enquanto segura", () => {
  const { m, events, advance } = setup();
  m.press();
  advance(100);
  m.press(); // repetição da tecla
  advance(900);
  m.release();
  assert.deepEqual(events, ["start", "stop"]);
  assert.equal(m.state, "idle");
});

test("toque rápido liga e outro toque desliga", () => {
  const { m, events, advance } = setup();
  m.press();
  advance(120);
  m.release();
  assert.deepEqual(events, ["start"]);
  advance(3000);
  m.press();
  m.release();
  assert.deepEqual(events, ["start", "stop"]);
});

test("esc cancela", () => {
  const { m, events } = setup();
  m.press();
  m.escape();
  m.escape();
  assert.deepEqual(events, ["start", "cancel"]);
});

test("sem leitor de teclas tudo vira toque", () => {
  const { m, events } = setup(false);
  m.press();
  m.release();
  m.press();
  assert.deepEqual(events, ["start", "stop"]);
});

test("modificador sozinho: toque rápido cancela em vez de ligar", () => {
  let t = 0;
  const events = [];
  const m = createHotkeyMachine({
    holdSupported: true,
    tapToggles: () => false,
    now: () => t,
    onStart: () => events.push("start"),
    onStop: () => events.push("stop"),
    onCancel: () => events.push("cancel"),
  });
  m.press();
  t += 100;
  m.release();
  assert.deepEqual(events, ["start", "cancel"]);
  assert.equal(m.state, "idle");
});
