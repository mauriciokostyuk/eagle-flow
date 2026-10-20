// Comparação de versões "1.2.3" (pura, testada em test/versao.test.js).

function partes(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  return m ? m.slice(1).map(Number) : null;
}

/** true se `candidata` for maior que `atual`. Versão malformada nunca atualiza. */
function versaoMaisNova(candidata, atual) {
  const a = partes(candidata);
  const b = partes(atual);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

module.exports = { versaoMaisNova };
