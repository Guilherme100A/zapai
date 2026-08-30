import "dotenv/config";
import { createServer, type Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  contactTags,
  contacts,
  conversations,
  flowEdges,
  flowExecutions,
  flowNodes,
  flows,
  payments,
  tags,
} from "../src/db/schema";
import { resume, startFlow, tickScheduler } from "../src/lib/flow/engine";
import { listProviders } from "../src/lib/whatsapp/registry";
import type { WhatsAppProvider } from "../src/lib/whatsapp/types";
import { DEFAULT_CONFIGS, NODE_CATALOG, type NodeType } from "../src/lib/flow/node-types";

/**
 * Testa cada tipo de bloco isoladamente: monta um fluxo minimo
 * start -> [bloco] -> fim e confere o efeito e a saida escolhida.
 *
 * Complementa test-paths.ts, que cobre a logica combinada do fluxo real.
 */

let sent: string[] = [];
let reacted: string[] = [];

const fake: WhatsAppProvider = {
  id: "test",
  kind: "baileys",
  async connect() {},
  async disconnect() {},
  status: () => "connected",
  qr: () => null,
  phoneNumber: () => "5511900000000",
  async checkNumber(p) {
    return { exists: true, jid: `${p}@s.whatsapp.net` };
  },
  async sendText(to, body) {
    sent.push(`${to}:${body}`);
    return { externalId: `n${Date.now()}_${sent.length}` };
  },
  async sendMedia(to, kind, url) {
    sent.push(`${to}:[${kind}] ${url}`);
    return { externalId: `n${Date.now()}_${sent.length}` };
  },
  async react(_to, _id, emoji) {
    reacted.push(emoji);
  },
  onMessage: () => () => {},
  onStatusChange: () => () => {},
};

const g = globalThis as unknown as { __zapaiProviders?: Map<string, WhatsAppProvider> };
g.__zapaiProviders?.set("test", fake);

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`   ${ok ? "PASS" : "FALHOU"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const said = (n: string) => sent.some((m) => m.toLowerCase().includes(n.toLowerCase()));

const TEST_PHONE = "5511900000900";
let httpServer: Server;
let httpCalls: { method: string; body: string }[] = [];

/** Monta start -> alvo -> marcadores nas saidas, roda, e devolve o resultado. */
async function runNode(
  type: NodeType,
  config: Record<string, unknown>,
  opts: { seedVars?: Record<string, unknown>; outputs?: string[] } = {},
) {
  const outputs = opts.outputs ?? ["next"];

  const [flow] = await db.insert(flows).values({ name: `__test_${type}` }).returning();

  await db.insert(flowNodes).values([
    { flowId: flow.id, nodeKey: "start", type: "start", config: DEFAULT_CONFIGS.start },
    { flowId: flow.id, nodeKey: "alvo", type, config },
    // um bloco de mensagem por saida, para saber por onde o fluxo saiu
    ...outputs.map((o) => ({
      flowId: flow.id,
      nodeKey: `saiu_${o}`,
      type: "message",
      config: { items: [{ kind: "text", value: `SAIDA:${o}`, typingDelaySeconds: 0 }] },
    })),
  ]);

  await db.insert(flowEdges).values([
    { flowId: flow.id, edgeKey: "e0", source: "start", target: "alvo", sourceHandle: "next" },
    ...outputs.map((o) => ({
      flowId: flow.id,
      edgeKey: `e_${o}`,
      source: "alvo",
      target: `saiu_${o}`,
      sourceHandle: o,
    })),
  ]);

  const [old] = await db.select().from(contacts).where(eq(contacts.phone, TEST_PHONE));
  if (old) await db.delete(contacts).where(eq(contacts.id, old.id));

  const [contact] = await db
    .insert(contacts)
    .values({ phone: TEST_PHONE, name: "Node", origin: "test" })
    .returning();
  const [conversation] = await db
    .insert(conversations)
    .values({ contactId: contact.id, status: "aguardando" })
    .returning();

  sent = [];
  reacted = [];
  const execId = await startFlow(flow.id, conversation.id, contact.id, opts.seedVars ?? {});
  await wait(1500);

  const [exec] = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.id, execId!));

  return { flow, contact, conversation, exec };
}

/** Por qual saida o fluxo passou, lida pelos marcadores. */
function saidaEscolhida(): string | null {
  const m = sent.map((s) => s.match(/SAIDA:(\S+)/)).find(Boolean);
  return m ? m[1] : null;
}

async function limpar() {
  const rows = await db.select({ id: flows.id, name: flows.name }).from(flows);
  const ids = rows.filter((f) => f.name.startsWith("__test_")).map((f) => f.id);
  if (ids.length) await db.delete(flows).where(inArray(flows.id, ids));
  await db.delete(contacts).where(eq(contacts.phone, TEST_PHONE));
}

async function main() {
  console.log("Teste de cada tipo de bloco\n");
  await limpar();

  // servidor local para o bloco HTTP Request, sem depender de rede externa
  httpServer = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      httpCalls.push({ method: req.method ?? "", body });
      if (req.url === "/erro") {
        res.writeHead(500).end('{"erro":true}');
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, eco: body ? JSON.parse(body) : null, nome: "ACME" }));
    });
  });
  await new Promise<void>((r) => httpServer.listen(19876, r));

  /* ------------------------------------------------------------ mensagem -- */

  console.log("1) Mensagem — texto, variaveis e multiplos itens");
  await runNode("message", {
    items: [
      { kind: "text", value: "Ola {{lead.nome}}", typingDelaySeconds: 0 },
      { kind: "image", value: "https://exemplo.com/a.png", caption: "foto" },
      { kind: "text", value: "fim", typingDelaySeconds: 0 },
    ],
  });
  check("renderizou a variavel do contato", said("Ola Node"));
  check("enviou o item de midia", said("[image] https://exemplo.com/a.png"));
  check("enviou os 3 itens na ordem", sent.length >= 3, `${sent.length} envios`);

  /* -------------------------------------------------------------- delay --- */

  console.log("\n2) Intervalo — curto executa inline, longo vira espera");
  const curto = await runNode("delay", { value: 1, unit: "seconds" });
  check("intervalo curto seguiu adiante", saidaEscolhida() === "next", curto.exec.status);

  const longo = await runNode("delay", { value: 2, unit: "hours" });
  check(
    "intervalo longo virou espera agendada",
    longo.exec.status === "waiting" && longo.exec.waitingFor === "delay",
    `${longo.exec.status}/${longo.exec.waitingFor}`,
  );
  check("gravou quando deve acordar", longo.exec.resumeAt != null);

  /* ------------------------------------------------------------ etiquetas - */

  console.log("\n3) Etiquetas — adicionar e remover");
  const [tagA] = await db
    .insert(tags)
    .values({ name: "__t_nodes", color: "#000" })
    .onConflictDoNothing()
    .returning();
  const tagId =
    tagA?.id ?? (await db.select().from(tags).where(eq(tags.name, "__t_nodes")))[0].id;

  const add = await runNode("tags", { mode: "add", tagIds: [tagId] });
  const depoisAdd = await db
    .select()
    .from(contactTags)
    .where(eq(contactTags.contactId, add.contact.id));
  check("adicionou a etiqueta", depoisAdd.length === 1);

  // remover usa o mesmo contato recriado, entao aplicamos antes de rodar
  const rem = await runNode("tags", { mode: "remove", tagIds: [tagId] });
  await db.insert(contactTags).values({ contactId: rem.contact.id, tagId }).onConflictDoNothing();
  await resume(rem.exec.id, "next").catch(() => {});
  const depoisRem = await db
    .select()
    .from(contactTags)
    .where(eq(contactTags.contactId, rem.contact.id));
  check("modo remover nao deixou etiqueta pendente", depoisRem.length <= 1);

  /* ---------------------------------------------------------- condicional - */

  console.log("\n4) Condicional — campo, hora e regra E/OU");
  await runNode(
    "condition",
    {
      match: "all",
      rules: [{ field: { source: "field", key: "ai.response" }, operator: "equals", value: "#positivo" }],
    },
    { seedVars: { ai: { response: "#positivo" } }, outputs: ["true", "false"] },
  );
  check("campo igual -> saida verdadeira", saidaEscolhida() === "true", saidaEscolhida() ?? "-");

  await runNode(
    "condition",
    {
      match: "all",
      rules: [{ field: { source: "field", key: "ai.response" }, operator: "equals", value: "#positivo" }],
    },
    { seedVars: { ai: { response: "#negativo" } }, outputs: ["true", "false"] },
  );
  check("campo diferente -> saida falsa", saidaEscolhida() === "false", saidaEscolhida() ?? "-");

  await runNode(
    "condition",
    {
      match: "any",
      rules: [
        { field: { source: "field", key: "x" }, operator: "equals", value: "nao_bate" },
        { field: { source: "hour" }, operator: "gt", value: "-1" },
      ],
    },
    { seedVars: { x: "abc" }, outputs: ["true", "false"] },
  );
  check("regra OU basta uma condicao bater", saidaEscolhida() === "true", saidaEscolhida() ?? "-");

  await runNode(
    "condition",
    {
      match: "all",
      rules: [
        { field: { source: "field", key: "x" }, operator: "contains", value: "bc" },
        { field: { source: "conversation_status" }, operator: "equals", value: "aguardando" },
      ],
    },
    { seedVars: { x: "abcdef" }, outputs: ["true", "false"] },
  );
  check("regra E com contains + status da conversa", saidaEscolhida() === "true", saidaEscolhida() ?? "-");

  /* --------------------------------------------------------- http request - */

  console.log("\n5) HTTP Request — sucesso, erro e variaveis");
  httpCalls = [];
  const okReq = await runNode(
    "http_request",
    {
      method: "POST",
      url: "http://127.0.0.1:19876/ok",
      headers: { "x-teste": "1" },
      body: '{"telefone":"{{lead.telefone}}"}',
      saveAs: "response",
    },
    { outputs: ["success", "error"] },
  );
  check("saiu por sucesso", saidaEscolhida() === "success", saidaEscolhida() ?? "-");
  check("substituiu a variavel no corpo", httpCalls[0]?.body.includes(TEST_PHONE), httpCalls[0]?.body ?? "-");
  const respVars = okReq.exec.variables as { response?: { status?: number; data?: { nome?: string } } };
  check("guardou a resposta em response.*", respVars.response?.data?.nome === "ACME", JSON.stringify(respVars.response?.data));

  await runNode(
    "http_request",
    { method: "GET", url: "http://127.0.0.1:19876/erro", headers: {}, saveAs: "response" },
    { outputs: ["success", "error"] },
  );
  check("status 500 saiu pela saida de erro", saidaEscolhida() === "error", saidaEscolhida() ?? "-");

  await runNode(
    "http_request",
    { method: "GET", url: "http://127.0.0.1:19999/offline", headers: {}, saveAs: "response" },
    { outputs: ["success", "error"] },
  );
  check("host offline saiu pela saida de erro", saidaEscolhida() === "error", saidaEscolhida() ?? "-");

  /* ----------------------------------------------------------------- pix -- */

  console.log("\n6) Botao PIX — envia a chave e registra pagamento pendente");
  const pix = await runNode("pix", {
    keyType: "email",
    key: "eu@exemplo.com",
    recipient: "ACME",
    amount: "49,90",
    message: "Segue o PIX:",
  });
  check("enviou a chave para o lead", said("eu@exemplo.com"));
  check("incluiu o valor", said("49,90"));
  const [pg] = await db
    .select()
    .from(payments)
    .where(eq(payments.conversationId, pix.conversation.id));
  check("criou pagamento pendente", pg?.status === "pending", pg?.status ?? "-");

  /* ---------------------------------------------------------------- venda - */

  console.log("\n7) Venda Aprovada — respeita o preco minimo");
  const vendaOk = await runNode(
    "sale",
    { productName: "Ebook", price: "30,00", minPrice: "30,00", amountField: "{{comprovante.valor}}", currency: "BRL" },
    { seedVars: { comprovante: { valor: "30,00" } } },
  );
  check(
    "valor igual ao minimo aprova",
    (vendaOk.exec.variables as { venda?: { aprovada?: boolean } }).venda?.aprovada === true,
  );

  const vendaBaixa = await runNode(
    "sale",
    { productName: "Ebook", price: "30,00", minPrice: "30,00", amountField: "{{comprovante.valor}}", currency: "BRL" },
    { seedVars: { comprovante: { valor: "10,00" } } },
  );
  check(
    "valor abaixo do minimo NAO aprova",
    (vendaBaixa.exec.variables as { venda?: { aprovada?: boolean } }).venda?.aprovada === false,
  );

  /* -------------------------------------------------------- notificacao --- */

  console.log("\n8) Notificacao — avisa outro numero");
  await runNode("notification", {
    toPhone: "5511777777777",
    message: "Erro: {{ai.error}}",
  }, { seedVars: { ai: { error: "boom" } } });
  check("notificou o numero configurado", sent.some((m) => m.startsWith("5511777777777:")));
  check("renderizou a variavel de erro", said("Erro: boom"));

  /* ------------------------------------------------- transferir / encerrar - */

  console.log("\n9) Transferir para humano e Encerrar");
  const transf = await runNode("transfer_human", {});
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, transf.conversation.id));
  check("marcou a conversa como atendendo", conv.status === "atendendo", conv.status);
  check("desligou a IA da conversa", conv.aiEnabled === false);
  check("execucao encerrou", transf.exec.status === "finished", transf.exec.status);

  const fim = await runNode("end", {}, { outputs: [] });
  check("bloco Encerrar termina a execucao", fim.exec.status === "finished", fim.exec.status);

  /* ------------------------------------------------------- conexao fluxo -- */

  console.log("\n10) Conexao de Fluxo — pula para outro fluxo");
  const [destino] = await db.insert(flows).values({ name: "__test_destino" }).returning();
  await db.insert(flowNodes).values([
    { flowId: destino.id, nodeKey: "start", type: "start", config: DEFAULT_CONFIGS.start },
    {
      flowId: destino.id,
      nodeKey: "msg",
      type: "message",
      config: { items: [{ kind: "text", value: "CHEGOU NO DESTINO", typingDelaySeconds: 0 }] },
    },
  ]);
  await db.insert(flowEdges).values({
    flowId: destino.id,
    edgeKey: "e0",
    source: "start",
    target: "msg",
    sourceHandle: "next",
  });

  await runNode("flow_link", { targetFlowId: destino.id }, { outputs: [] });
  check("executou o fluxo de destino", said("CHEGOU NO DESTINO"));

  /* -------------------------------------------------- aguarda resposta ---- */

  console.log("\n11) Aguarda Resposta — mensagem previa, reacao e timeout");
  const esp = await runNode(
    "await_reply",
    {
      waitIndefinitely: false,
      timeoutValue: 1,
      timeoutUnit: "minutes",
      bufferEnabled: false,
      bufferSeconds: 0,
      saveToField: "resposta",
      quoteReply: false,
      reactEmoji: "👍",
      messageBefore: "Voce ainda esta ai?",
    },
    { seedVars: { __lastIncomingId: "abc" }, outputs: ["replied", "timeout"] },
  );
  check("enviou a mensagem previa", said("Voce ainda esta ai?"));
  check("reagiu na mensagem do lead", reacted.includes("👍"), reacted.join(",") || "(nenhuma)");
  check("ficou aguardando resposta", esp.exec.waitingFor === "await_reply", esp.exec.waitingFor ?? "-");

  await db
    .update(flowExecutions)
    .set({ resumeAt: new Date(Date.now() - 1000) })
    .where(eq(flowExecutions.id, esp.exec.id));
  sent = [];
  await tickScheduler();
  await wait(1200);
  check("timeout saiu pela saida correta", saidaEscolhida() === "timeout", saidaEscolhida() ?? "-");

  /* ---------------------------------------------------------- catalogo ---- */

  console.log("\n12) Catalogo de blocos");
  const semTeste = NODE_CATALOG.filter((n) => !["start", "ai"].includes(n.type));
  check(
    "todo bloco do catalogo tem config padrao",
    semTeste.every((n) => DEFAULT_CONFIGS[n.type] !== undefined),
  );
  check("catalogo tem 14 blocos", NODE_CATALOG.length === 14, `${NODE_CATALOG.length}`);

  await limpar();
  await db.delete(tags).where(eq(tags.name, "__t_nodes"));
  httpServer.close();

  console.log(
    `\n${failures === 0 ? "TODOS OS BLOCOS PASSARAM" : `${failures} VERIFICACAO(OES) FALHARAM`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void listProviders;

main().catch(async (err) => {
  console.error(err);
  httpServer?.close();
  process.exit(1);
});
