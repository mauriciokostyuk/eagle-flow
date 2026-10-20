// afterSign do electron-builder: assina o app do Mac com o certificado próprio
// da Eagle ("Eagle Flow Eagle Midia").
//
// Por quê: assinatura ad-hoc muda a cada versão, e o Mac trata cada versão
// como um app novo: Acessibilidade e Microfone voltam a ficar pendentes
// depois de toda atualização. Com um certificado fixo, a permissão fica.
// Sem EF_SIGN_IDENTITY, mantém a assinatura ad-hoc.
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function assinar(ctx) {
  if (ctx.electronPlatformName !== "darwin") return;
  const identidade = process.env.EF_SIGN_IDENTITY;
  if (!identidade) {
    console.log("[assinar] sem EF_SIGN_IDENTITY, fica ad-hoc");
    return;
  }
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", identidade, app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", app], { stdio: "inherit" });
  console.log(`[assinar] ok: ${identidade}`);
};
