# White label do motor

O motor (esta pasta) é uma casca Electron: atalho global, microfone, colar o
texto, bandeja, atualização automática e detecção de reunião. **Tela, login e
transcrição vêm do site da plataforma** (`BASE`). Pra outra marca você precisa
de duas coisas:

1. Uma cópia do motor com a marca nova: `node scripts/white-label.js`.
2. Duas páginas na sua plataforma que falam com o motor pela ponte abaixo.

## 1. Gerar o motor

```bash
cp scripts/white-label.exemplo.json marca.json   # edite os campos
node scripts/white-label.js --config marca.json --out /caminho/da/sua-plataforma/<slug>
```

Depois, dentro da pasta gerada:

- troque os ícones em `build/`: `icon.png` (1024×1024), `icon.icns`, `icon.ico`
  e `trayTemplate@3x.png` (54×54, preto com transparência; é o ícone da barra do Mac);
- mova `release.workflow.yml` pra `.github/workflows/` do repositório;
- `npm install` e `npm start` pra testar. `<SLUG>_URL=http://localhost:5173 npm start`
  aponta o motor pra um site local (microfone só é liberado pra essa origem).

Publicar: suba a versão em `package.json`, rode o workflow (Actions → Run workflow).
Ele cria o release `v<versão>` no GitHub com `.dmg` (arm64 e x64) e `.exe`. O motor
instalado baixa a versão nova sozinho a cada 4 h pelo `releases/latest` desse repo,
então o repositório precisa ser **público** (ou o updater não enxerga o release).

Mac sem certificado da Apple: na primeira abertura, botão direito no app → Abrir.
Acessibilidade e Microfone voltam a pedir permissão a cada versão nova (assinatura
ad-hoc). Com um certificado Developer ID, coloque um `afterSign` igual ao
`scripts/assinar.js` do Eagle Flow.

## 2. Páginas que a plataforma precisa servir

| Página | URL | Janela |
| --- | --- | --- |
| Principal | `BASE/<slug>-app` | 720×760, normal. Login, configuração, reuniões. |
| Pílula | `BASE/<slug>-app/pill` | 360×64, transparente, sem foco, sem clique, fica no rodapé da tela. Grava, transcreve e cola. |

Regras do motor:

- Microfone e captura de tela só são liberados pra origem de `BASE`. Link pra
  outra origem abre no navegador.
- Service worker e cache são limpos a cada abertura (cookies/login ficam).
- A página principal muda de título à vontade; a janela mantém o nome do produto.
- Sem internet o motor mostra `offline.html` e tenta de novo.
- Deep link `<nome-compacto-minusculo>://...` fica registrado pro app (opcional).

## 3. Ponte `window.<slugCamel>Shell`

Pra `slug: "construction-flow"` o objeto é `window.constructionFlowShell`.
Só existe dentro do motor; no navegador comum é `undefined` (use isso pra
mostrar "baixe o app").

```ts
interface Shell {
  platform: "darwin" | "win32" | "linux";
  version: string;                        // versão do motor instalado

  // Pílula: ciclo do ditado (o motor só manda isso pra página /pill)
  onStart(cb: () => void): void;          // atalho apertado → comece a gravar
  onStop(cb: () => void): void;           // atalho solto → pare, transcreva e chame paste()
  onCancel(cb: () => void): void;         // Esc → descarte
  paste(texto: string): Promise<{ ok: true } | { ok: false; motivo: "acessibilidade" | "colar" }>;
  setState(estado: string): void;         // "idle" esconde a pílula; qualquer outro mostra
  openMain(): void;                       // abre/foca a janela principal

  // Principal: permissões e atalho
  permissoes(): Promise<{ microfone: boolean; acessibilidade: boolean }>;
  pedirPermissoes(): Promise<void>;       // Mac: pede microfone e abre Acessibilidade
  getAtalho(): Promise<{ atalho: string; rotulo: string; pronto: boolean }>;
  setAtalho(atalho: string): Promise<{ ok: true } | { ok: false; erro: string }>;
  // atalho: "Fn" (só Mac), "RightOption" | "RightCommand" | "RightCtrl" | "RightShift",
  // ou combinação Electron ("Control+Shift+Space"). pronto=false → falta Acessibilidade.

  // Reuniões (principal)
  onReuniaoSugerida(cb: () => void): void; // motor viu outro app no microfone / Zoom aberto
  onReuniaoAcabou(cb: () => void): void;
  setReuniaoGravando(gravando: boolean): Promise<void>; // true: fechar a janela só esconde
  sistemaIniciar(): Promise<
    | { ok: true; modo: "pagina" }          // Windows: use getDisplayMedia({audio:true}) na página
    | { ok: true; modo: "motor" }           // Mac: o motor captura; puxe com sistemaFatia()
    | { ok: false; motivo: string }         // "unsupported_os" | "permission_denied" | ...
  >;
  sistemaFatia(): Promise<Uint8Array | null>; // WAV 16 kHz mono s16 com o áudio desde a última fatia
  sistemaParar(): Promise<Uint8Array | null>; // última fatia
}
```

Fluxo mínimo da pílula:

```js
const shell = window.constructionFlowShell;
shell.onStart(async () => { shell.setState("recording"); /* getUserMedia + MediaRecorder */ });
shell.onCancel(() => { /* parar e jogar fora */ shell.setState("idle"); });
shell.onStop(async () => {
  shell.setState("processing");
  const texto = await transcrever(blob);   // sua API (ex.: Whisper/Groq/OpenAI no seu backend)
  const r = await shell.paste(texto);       // cola onde o cursor estava
  if (!r.ok && r.motivo === "acessibilidade") shell.openMain(); // Mac sem permissão
  shell.setState("idle");
});
```

A chave da API de transcrição fica no seu servidor; a página manda o áudio pra
ele já logada. O usuário nunca cola chave nenhuma.
