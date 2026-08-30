import "dotenv/config";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  automationLogs,
  contactTags,
  contacts,
  conversations,
  flowExecutions,
  flowNodes,
  flows,
  messages,
  tags,
} from "../src/db/schema";
import { deliverReply, startFlow } from "../src/lib/flow/engine";
import { listProviders } from "../src/lib/whatsapp/registry";
import type { WhatsAppProvider } from "../src/lib/whatsapp/types";

/**
 * Teste ponta a ponta do motor, sem WhatsApp real.
 *
 * Injeta um provider fake no registry e roda o fluxo de exemplo, conferindo
 * que as mensagens saem na ordem certa e que as saidas dos nos levam aos
 * blocos esperados.
 */

const sent: { to: string; body: string }[] = [];

const fakeProvider: WhatsAppProvider = {
  id: "test",
  kind: "baileys",
  async connect() {},
  async disconnect() {},
  status: () => "connected",
  qr: () => null,
  phoneNumber: () => "5511900000000",
  async checkNumber(phone) {
    return { exists: true, jid: `${phone}@s.whatsapp.net` };
  },
  async sendText(to, body) {
    sent.push({ to, body });
    console.log(`   -> [${to}] ${body.replace(/\n/g, " / ").slice(0, 90)}`);
    return { externalId: `fake_${Date.now()}_${sent.length}` };
  },
  async sendMedia(to, kind, url) {
    sent.push({ to, body: `[${kind}] ${url}` });
    return { externalId: `fake_${Date.now()}_${sent.length}` };
  },
  async react() {},
  onMessage: () => () => {},
  onStatusChange: () => () => {},
};

/**
 * O registry fecha sobre o Map no momento do import, entao precisamos MUTAR o
 * mapa existente — substitui-lo deixaria o registry apontando para o antigo.
 */
const g = globalThis as unknown as { __zapaiProviders?: Map<string, WhatsAppProvider> };
g.__zapaiProviders?.set("test", fakeProvider);

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`   ${ok ? "PASS" : "FALHOU"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("Teste do motor de automacao\n");

  const [flow] = await db
    .select()
    .from(flows)
    .where(eq(flows.name, "Exemplo — Cash on Delivery"));
  if (!flow) throw new Error("Rode 'npm run seed' antes.");

  // ambiente limpo a cada execucao
  const phone = "5511987654321";
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

  /* ---------------------------------------------------- 1. inicio do fluxo */

  console.log("1) Lead novo manda mensagem");
  await startFlow(flow.id, conversation.id, contact.id, {
    lead: { message: "oi" },
    resposta: "oi",
  });
  await wait(1500);

  check("enviou a mensagem de introducao", sent.some((m) => m.body.includes("receita para diabeticos")));

  const [exec1] = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.conversationId, conversation.id));
  check("execucao parada em Aguarda Resposta", exec1?.waitingFor === "await_reply", exec1?.currentNodeKey ?? "-");

  const contactTagRows = await db
    .select({ name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(eq(contactTags.contactId, contact.id));
  check(
    "etiqueta de estagio aplicada (idempotencia)",
    contactTagRows.some((t) => t.name === "parte_1"),
    contactTagRows.map((t) => t.name).join(", ") || "nenhuma",
  );

  /* ------------------------------------------- 2. buffer de mensagens */

  console.log("\n2) Lead responde picado (testa o buffer de 15s)");
  const before = sent.length;
  await deliverReply(conversation.id, "oi", "in_1");
  await deliverReply(conversation.id, "tudo bem?", "in_2");
  await deliverReply(conversation.id, "pode mandar sim", "in_3");

  const [buffered] = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.id, exec1.id));
  check(
    "as 3 mensagens foram agrupadas no buffer",
    buffered.buffer?.parts.length === 3,
    `${buffered.buffer?.parts.length ?? 0} parte(s)`,
  );
  check("nao avancou o fluxo enquanto o buffer estava aberto", sent.length === before);

  /* ------------------------------------- 3. flush do buffer e bloco de IA */

  console.log("\n3) Buffer fecha (16s) e o bloco de IA roda");
  await wait(16_000);

  const [afterAi] = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.id, exec1.id));

  const vars = afterAi.variables as Record<string, unknown>;
  check(
    "resposta agrupada salva na variavel configurada",
    String(vars.resposta ?? "").includes("pode mandar sim") &&
      String(vars.resposta ?? "").includes("tudo bem?"),
    JSON.stringify(vars.resposta),
  );

  /**
   * O bloco de IA consegue rodar se usa o provedor local (sem chave) ou se ha
   * chave no .env. Nos dois casos esperamos o caminho feliz; so quando nao ha
   * nenhum dos dois e que validamos a saida de erro.
   */
  const [aiNode] = await db
    .select()
    .from(flowNodes)
    .where(and(eq(flowNodes.flowId, flow.id), eq(flowNodes.type, "ai")));
  const aiProvider = (aiNode?.config as { provider?: string } | undefined)?.provider;

  const canRunAI =
    aiProvider === "local" ||
    Boolean(
      process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY,
    );

  const logs = await db
    .select()
    .from(automationLogs)
    .where(eq(automationLogs.executionId, exec1.id))
    .orderBy(asc(automationLogs.createdAt));

  if (canRunAI) {
    const aiLog = logs.find((l) => l.type === "AI_FINISHED");
    check(
      `bloco de IA (${aiProvider}) classificou a resposta`,
      Boolean(aiLog),
      aiLog?.message ?? "-",
    );
    check(
      "saiu por #positivo e seguiu para a cobranca",
      sent.some((m) => m.body.includes("investimento")),
    );
    check(
      "chegou no bloco PIX",
      sent.some((m) => m.body.includes("chave PIX")),
    );
    check(
      "parou aguardando o comprovante",
      afterAi.status === "waiting" && afterAi.currentNodeKey === "wait_comprovante",
      `${afterAi.status} em ${afterAi.currentNodeKey}`,
    );
  } else {
    // sem chave e sem provedor local o bloco falha — validamos a saida de erro
    const failLog = logs.find((l) => l.type === "AI_FAILED");
    check("sem chave: bloco de IA falhou como esperado", Boolean(failLog), failLog?.message ?? "-");
    check(
      "fluxo saiu pela saida de erro em vez de travar",
      afterAi.status === "finished",
      `status=${afterAi.status}`,
    );
  }

  /* --------------------------------------------------------- 4. persistencia */

  console.log("\n4) Persistencia");
  const msgRows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversation.id), eq(messages.direction, "out")));
  check("mensagens enviadas foram gravadas", msgRows.length > 0, `${msgRows.length} mensagem(ns)`);
  check("eventos foram logados", logs.length > 0, `${logs.length} evento(s)`);

  console.log(
    `\n${failures === 0 ? "TODOS OS TESTES PASSARAM" : `${failures} TESTE(S) FALHARAM`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void listProviders; // mantem o import do registry vivo para o globalThis ser o mesmo

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
