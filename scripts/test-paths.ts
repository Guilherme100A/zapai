import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  contactTags,
  contacts,
  conversations,
  flowExecutions,
  flows,
  payments,
  tags,
} from "../src/db/schema";
import { deliverReply, startFlow, tickScheduler } from "../src/lib/flow/engine";
import { listProviders } from "../src/lib/whatsapp/registry";
import type { WhatsAppProvider } from "../src/lib/whatsapp/types";

/**
 * Cobre os ramos do fluxo que o test-engine nao toca: recusa + anti-loop de
 * downsell, timeout -> remarketing, e comprovante -> venda aprovada.
 *
 * Sao justamente as logicas ensinadas nos videos que dependem de etiqueta para
 * nao repetir mensagem, entao valem um teste proprio.
 */

let sent: string[] = [];

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
  async sendText(_to, body) {
    sent.push(body);
    return { externalId: `f${Date.now()}_${sent.length}` };
  },
  async sendMedia(_to, kind, url) {
    sent.push(`[${kind}] ${url}`);
    return { externalId: `f${Date.now()}_${sent.length}` };
  },
  async react() {},
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
const said = (needle: string) => sent.some((m) => m.toLowerCase().includes(needle.toLowerCase()));

/** Cria contato+conversa limpos e dispara o fluxo. */
async function novoLead(flowId: string, phone: string) {
  const [old] = await db.select().from(contacts).where(eq(contacts.phone, phone));
  if (old) await db.delete(contacts).where(eq(contacts.id, old.id));

  const [contact] = await db
    .insert(contacts)
    .values({ phone, name: "Teste", origin: "test" })
    .returning();
  const [conversation] = await db
    .insert(conversations)
    .values({ contactId: contact.id, status: "aguardando" })
    .returning();

  sent = [];
  await startFlow(flowId, conversation.id, contact.id, { lead: { message: "oi" }, resposta: "oi" });

  // so devolve quando a execucao parou de verdade: antes disso o motor ainda
  // escreve currentNodeKey/resumeAt e sobrescreveria o que o teste ajustar
  for (let i = 0; i < 40; i++) {
    const [e] = await db
      .select()
      .from(flowExecutions)
      .where(eq(flowExecutions.conversationId, conversation.id));
    if (e?.status === "waiting" || e?.status === "finished") break;
    await wait(150);
  }
  return { contact, conversation };
}

async function etiquetas(contactId: string) {
  const rows = await db
    .select({ name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(eq(contactTags.contactId, contactId));
  return rows.map((r) => r.name);
}

/** Responde e espera o buffer (15s) fechar. */
async function responder(conversationId: string, texto: string) {
  await deliverReply(conversationId, texto, `in_${Date.now()}`);
  await wait(17_000);
}

async function main() {
  const [flow] = await db
    .select()
    .from(flows)
    .where(eq(flows.name, "Exemplo — Cash on Delivery"));
  if (!flow) throw new Error("Rode 'npm run seed' antes.");

  /* ---------------------------------- 1. recusa -> downsell -> anti-loop -- */

  console.log("\n1) Lead recusa: deve receber downsell UMA vez so");
  const a = await novoLead(flow.id, "5511900000101");

  await responder(a.conversation.id, "nao quero");
  check("classificou como #negativo e ofereceu downsell", said("R$ 10,00"));
  check("aplicou a etiqueta downsell", (await etiquetas(a.contact.id)).includes("downsell"));

  sent = [];
  await responder(a.conversation.id, "nao quero mesmo nao");
  check("NAO repetiu o downsell na segunda recusa", !said("R$ 10,00"), sent.join(" | ") || "(nada)");
  check(
    "marcou o lead como perdido",
    (await etiquetas(a.contact.id)).includes("respondeu_nao"),
    (await etiquetas(a.contact.id)).join(", "),
  );

  const [execA] = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.conversationId, a.conversation.id));
  check("execucao encerrou", execA.status === "finished", execA.status);

  /* ------------------------------------------ 2. timeout -> remarketing --- */

  console.log("\n2) Lead nao responde: timeout deve levar ao remarketing");
  const b = await novoLead(flow.id, "5511900000102");
  sent = [];

  // empurra o vencimento para tras em vez de esperar 1h de verdade
  await db
    .update(flowExecutions)
    .set({ resumeAt: new Date(Date.now() - 1000) })
    .where(eq(flowExecutions.conversationId, b.conversation.id));

  const acordadas = await tickScheduler();
  await wait(1500);

  check("scheduler acordou a execucao vencida", acordadas > 0, `${acordadas} execucao(oes)`);
  check("enviou o remarketing", said("Ainda da tempo"), sent.join(" | ").slice(0, 80));
  check("aplicou a etiqueta remarket_1", (await etiquetas(b.contact.id)).includes("remarket_1"));

  /* ------------------------------- 3. comprovante -> venda aprovada ------- */

  console.log("\n3) Comprovante: deve sair pela saida de topo e aprovar a venda");
  const c = await novoLead(flow.id, "5511900000103");
  await responder(c.conversation.id, "quero sim");
  check("seguiu para o PIX", said("chave PIX"));

  const [pgto] = await db
    .select()
    .from(payments)
    .where(eq(payments.conversationId, c.conversation.id));
  check("registrou o pagamento como pendente", pgto?.status === "pending", pgto?.status ?? "-");

  /**
   * O classificador local nao le imagem, entao o comprovante e simulado
   * gravando comprovante.* nas variaveis e retomando pela saida "receipt".
   * O que este teste valida e o ramo do fluxo depois do comprovante.
   */
  const [execC] = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.conversationId, c.conversation.id));

  await db
    .update(flowExecutions)
    .set({
      currentNodeKey: "ai_1",
      status: "running",
      waitingFor: null,
      resumeAt: null,
      variables: {
        ...(execC.variables as Record<string, unknown>),
        comprovante: { valor: "30,00", banco: "Nubank", nome_pagador: "Teste" },
      },
    })
    .where(eq(flowExecutions.id, execC.id));

  sent = [];
  const { resume } = await import("../src/lib/flow/engine");
  await resume(execC.id, "receipt");
  await wait(1500);

  check("entregou o material apos o comprovante", said("Pagamento confirmado"));
  check("aplicou a etiqueta pago", (await etiquetas(c.contact.id)).includes("pago"));

  const [pgto2] = await db
    .select()
    .from(payments)
    .where(eq(payments.conversationId, c.conversation.id));
  check("marcou o pagamento como pago", pgto2?.status === "paid", pgto2?.status ?? "-");

  /* --------------------------------------------------------------- limpeza */

  await db
    .delete(contacts)
    .where(inArray(contacts.phone, ["5511900000101", "5511900000102", "5511900000103"]));

  console.log(
    `\n${failures === 0 ? "TODOS OS CAMINHOS PASSARAM" : `${failures} VERIFICACAO(OES) FALHARAM`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void listProviders;
void and;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
