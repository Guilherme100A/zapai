import fs from "node:fs";

/** Troca o titulo solto de cada pagina pelo PageHeader padrao do Leona. */
const map = [
  ["src/app/flows/page.tsx", "Workflow", "Fluxos", "Um fluxo ativo por vez responde as mensagens recebidas."],
  ["src/app/logs/page.tsx", "ScrollText", "Logs", "Execucoes, eventos e erros da automacao."],
  ["src/app/webhooks/page.tsx", "Webhook", "Webhooks de entrada", "Um POST no endpoint dispara o fluxo vinculado."],
  ["src/app/settings/page.tsx", "Settings", "Configuracoes", "Uso proprio, sem login — decisao de escopo da spec."],
  ["src/app/contacts/page.tsx", "Users", "Contatos", "Aparecem sozinhos quando alguem manda mensagem."],
];

for (const [file, icon, titulo, sub] of map) {
  let s = fs.readFileSync(file, "utf8");

  const marca = `<h1 className="text-2xl font-semibold">${titulo}</h1>`;
  if (!s.includes(marca)) {
    console.log("SKIP:", file);
    continue;
  }

  s = s.replace(marca, "__HDR__");
  // o subtitulo antigo vira prop do cabecalho
  s = s.replace(/__HDR__\s*<p className="mt-1 text-sm text-muted">[\s\S]*?<\/p>/, "__HDR__");

  const header =
    `<PageHeader icon={${icon}} title="${titulo}" subtitle="${sub}" ` +
    `breadcrumb={[{ label: "${titulo}" }]} />`;
  s = s.replace("__HDR__", header);

  s = `import { ${icon} } from "lucide-react";\nimport { PageHeader } from "@/components/page-header";\n${s}`;
  fs.writeFileSync(file, s);
  console.log("atualizado:", file);
}
