import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  flowEdges,
  flowNodes,
  flows,
  pipelineStages,
  pipelines,
  tags,
  webhooks,
} from "../src/db/schema";

/**
 * Seed: pipeline padrao, etiquetas e o fluxo ensinado nos videos.
 *
 * O fluxo reproduz a logica do V2 (etiqueta de estagio -> conteudo -> aguarda
 * resposta -> IA com condicionais -> PIX -> comprovante) e do V1 (loop de
 * objecao e anti-loop de downsell por etiqueta).
 */
async function main() {
  console.log("Seed iniciando...");

  /* ------------------------------------------------------------ pipeline -- */

  let [pipeline] = await db.select().from(pipelines).where(eq(pipelines.isDefault, true));
  if (!pipeline) {
    [pipeline] = await db
      .insert(pipelines)
      .values({ name: "Funil de vendas", isDefault: true })
      .returning();

    await db.insert(pipelineStages).values([
      { pipelineId: pipeline.id, name: "Novos", position: 0, color: "#64748b" },
      { pipelineId: pipeline.id, name: "Qualificados", position: 1, color: "#0891b2" },
      { pipelineId: pipeline.id, name: "Negociacao", position: 2, color: "#ea580c" },
      { pipelineId: pipeline.id, name: "Venda", position: 3, color: "#16a34a" },
      { pipelineId: pipeline.id, name: "Perdido", position: 4, color: "#dc2626" },
    ]);
    console.log("  pipeline padrao criado");
  }

  /* ------------------------------------------------------------ etiquetas -- */

  const TAG_NAMES = [
    ["parte_1", "#7c5cff"],
    ["parte_2", "#7c5cff"],
    ["downsell", "#ea580c"],
    ["remarket_1", "#0891b2"],
    ["remarket_2", "#0891b2"],
    ["lead_quente", "#dc2626"],
    ["respondeu_nao", "#64748b"],
    ["pago", "#16a34a"],
  ] as const;

  const tagIds: Record<string, string> = {};
  for (const [name, color] of TAG_NAMES) {
    const [row] = await db
      .insert(tags)
      .values({ name, color })
      .onConflictDoNothing()
      .returning();
    if (row) tagIds[name] = row.id;
  }
  // pega as que ja existiam
  for (const t of await db.select().from(tags)) tagIds[t.name] = t.id;
  console.log(`  ${Object.keys(tagIds).length} etiquetas`);

  /* ---------------------------------------------------------------- fluxo -- */

  const existing = await db.select().from(flows).where(eq(flows.name, "Exemplo — Cash on Delivery"));
  if (existing.length) {
    console.log("  fluxo de exemplo ja existe, pulando");
    console.log("Seed concluido.");
    process.exit(0);
  }

  const [flow] = await db
    .insert(flows)
    .values({
      name: "Exemplo — Cash on Delivery",
      description: "Reproduz a logica ensinada nos dois videos do Leona Flow.",
      active: false,
    })
    .returning();

  const N = (
    nodeKey: string,
    type: string,
    x: number,
    y: number,
    config: Record<string, unknown>,
  ) => ({ flowId: flow.id, nodeKey, type, positionX: String(x), positionY: String(y), config });

  await db.insert(flowNodes).values([
    N("start", "start", 40, 300, { trigger: "message_received", keywords: [] }),

    // idempotencia: quem ja tem parte_1 nao recebe a introducao de novo
    N("cond_parte1", "condition", 300, 300, {
      match: "all",
      rules: [{ field: { source: "tag", tagId: tagIds.parte_1 }, operator: "equals", value: "" }],
    }),

    N("tag_parte1", "tags", 580, 420, { mode: "add", tagIds: [tagIds.parte_1] }),

    N("msg_intro", "message", 840, 420, {
      items: [
        {
          kind: "text",
          value:
            "Oi {{lead.nome}}! Tudo bem?\n\nVi que voce se interessou pela nossa receita para diabeticos.\n\nPosso te enviar agora?",
          typingDelaySeconds: 4,
        },
      ],
    }),

    N("wait_1", "await_reply", 1100, 420, {
      waitIndefinitely: false,
      timeoutValue: 1,
      timeoutUnit: "hours",
      bufferEnabled: true,
      bufferSeconds: 15,
      saveToField: "resposta",
      quoteReply: false,
      messageBefore: "",
    }),

    // bloco de IA: classifica em positivo/negativo/preco, senao responde a duvida
    N("ai_1", "ai", 1380, 420, {
      provider: "openai",
      model: "gpt-4o-mini",
      inputTemplate: "{{resposta}}",
      autoSend: false,
      understandAudio: true,
      understandImage: true,
      understandPdf: true,
      identifyReceipt: true,
      keepContext: true,
      contextTurns: 5,
      prompt:
        "Voce e uma atendente simpatica de uma loja de receitas para diabeticos.\n" +
        "Produto: e-book de receitas, R$ 30, entrega digital imediata.\n" +
        "Regras: seja breve (ate 2 frases), nunca invente preco, nunca prometa prazo.\n" +
        "Perguntas frequentes: dura 12 meses de acesso; aprovado pela Anvisa; entrega por PDF no WhatsApp.",
      conditions: [
        {
          priority: 1,
          prompt: "O cliente demonstrou interesse ou disse algo como ok, quero sim, pode enviar",
          outputKey: "#positivo",
        },
        {
          priority: 2,
          prompt: "O cliente demonstrou falta de interesse, disse nao quero ou nao tenho interesse",
          outputKey: "#negativo",
        },
        {
          priority: 3,
          prompt: "O cliente perguntou sobre preco, valor ou disse que esta caro",
          outputKey: "#preco",
        },
      ],
      fallbackOutputKey: "padrao",
    }),

    // saida #positivo -> cobranca
    N("tag_parte2", "tags", 1700, 200, { mode: "add", tagIds: [tagIds.parte_2, tagIds.lead_quente] }),
    N("msg_pagamento", "message", 1960, 200, {
      items: [
        {
          kind: "text",
          value: "Perfeito! O investimento e de R$ 30,00.\n\nVou te mandar a chave PIX agora.",
          typingDelaySeconds: 3,
        },
      ],
    }),
    N("pix_1", "pix", 2220, 200, {
      keyType: "random",
      key: "COLOQUE-SUA-CHAVE-PIX-AQUI",
      recipient: "Sua Empresa",
      amount: "30,00",
      message: "Segue a chave PIX. Assim que pagar, me manda o comprovante aqui:",
    }),
    N("wait_comprovante", "await_reply", 2480, 200, {
      waitIndefinitely: true,
      timeoutValue: 1,
      timeoutUnit: "hours",
      bufferEnabled: true,
      bufferSeconds: 15,
      saveToField: "resposta",
      quoteReply: false,
    }),

    // saida "receipt" do ai_1 -> venda aprovada
    N("sale_1", "sale", 1700, 40, {
      productName: "E-book de receitas",
      price: "30,00",
      minPrice: "30,00",
      amountField: "{{comprovante.valor}}",
      currency: "BRL",
    }),
    N("tag_pago", "tags", 1960, 40, { mode: "add", tagIds: [tagIds.pago] }),
    N("msg_entrega", "message", 2220, 40, {
      items: [
        {
          kind: "text",
          value: "Pagamento confirmado! 🎉\n\nSegue seu material. Obrigada pela confianca!",
          typingDelaySeconds: 3,
        },
      ],
    }),
    N("end_ok", "end", 2480, 40, {}),

    // saida #negativo -> anti-loop de downsell por etiqueta
    N("cond_downsell", "condition", 1700, 560, {
      match: "all",
      rules: [{ field: { source: "tag", tagId: tagIds.downsell }, operator: "equals", value: "" }],
    }),
    N("tag_downsell", "tags", 1960, 680, { mode: "add", tagIds: [tagIds.downsell] }),
    N("msg_downsell", "message", 2220, 680, {
      items: [
        {
          kind: "text",
          value:
            "Entendo! Que tal assim: consigo liberar por R$ 10,00 so hoje.\n\nTe interessa?",
          typingDelaySeconds: 4,
        },
      ],
    }),
    N("tag_perdido", "tags", 1960, 540, { mode: "add", tagIds: [tagIds.respondeu_nao] }),
    N("end_perdido", "end", 2220, 540, {}),

    // saida #preco -> explicacao e volta a esperar
    N("msg_preco", "message", 1700, 780, {
      items: [
        {
          kind: "text",
          value:
            "O investimento e de R$ 30,00 — a vista, no PIX.\n\nSao mais de 80 receitas testadas, acesso por 12 meses.",
          typingDelaySeconds: 4,
        },
      ],
    }),

    // saida padrao (fallback) -> manda o texto gerado e volta a esperar
    N("msg_fallback", "message", 1700, 900, {
      items: [{ kind: "text", value: "{{ai.response}}", typingDelaySeconds: 3 }],
    }),

    // saida de erro -> avisa o dono
    N("notif_erro", "notification", 1700, 1020, {
      toPhone: "",
      message: "Erro no bloco de IA do fluxo Cash on Delivery: {{ai.error}}",
    }),
    N("end_erro", "end", 1960, 1020, {}),

    // timeout do primeiro wait -> remarketing
    N("cond_remarket", "condition", 1380, 700, {
      match: "all",
      rules: [{ field: { source: "tag", tagId: tagIds.remarket_1 }, operator: "equals", value: "" }],
    }),
    N("tag_remarket1", "tags", 1100, 780, { mode: "add", tagIds: [tagIds.remarket_1] }),
    N("msg_remarket1", "message", 840, 780, {
      items: [
        {
          kind: "text",
          value: "Oi! Ainda da tempo de garantir 🙂 Posso te enviar?",
          typingDelaySeconds: 4,
        },
      ],
    }),
    N("end_remarket", "end", 1640, 700, {}),
  ]);

  const E = (source: string, sourceHandle: string, target: string) => ({
    flowId: flow.id,
    edgeKey: `e_${source}_${sourceHandle}_${target}`,
    source,
    target,
    sourceHandle,
  });

  await db.insert(flowEdges).values([
    E("start", "next", "cond_parte1"),
    // nao tem parte_1 -> aplica e apresenta
    E("cond_parte1", "false", "tag_parte1"),
    // ja tem parte_1 -> vai direto pra cobranca
    E("cond_parte1", "true", "tag_parte2"),
    E("tag_parte1", "next", "msg_intro"),
    E("msg_intro", "next", "wait_1"),
    E("wait_1", "replied", "ai_1"),
    E("wait_1", "timeout", "cond_remarket"),

    E("ai_1", "receipt", "sale_1"),
    E("ai_1", "#positivo", "tag_parte2"),
    E("ai_1", "#negativo", "cond_downsell"),
    E("ai_1", "#preco", "msg_preco"),
    E("ai_1", "padrao", "msg_fallback"),
    E("ai_1", "error", "notif_erro"),

    E("sale_1", "next", "tag_pago"),
    E("tag_pago", "next", "msg_entrega"),
    E("msg_entrega", "next", "end_ok"),

    E("tag_parte2", "next", "msg_pagamento"),
    E("msg_pagamento", "next", "pix_1"),
    E("pix_1", "next", "wait_comprovante"),
    // comprovante volta pro mesmo bloco de IA — nao duplicamos o bloco
    E("wait_comprovante", "replied", "ai_1"),
    E("wait_comprovante", "timeout", "end_perdido"),

    // ja recebeu downsell -> encerra como perdido
    E("cond_downsell", "true", "tag_perdido"),
    E("cond_downsell", "false", "tag_downsell"),
    E("tag_perdido", "next", "end_perdido"),
    E("tag_downsell", "next", "msg_downsell"),
    E("msg_downsell", "next", "wait_1"),

    // preco e fallback voltam a esperar: o loop de objecao do video V1
    E("msg_preco", "next", "wait_1"),
    E("msg_fallback", "next", "wait_1"),
    E("notif_erro", "next", "end_erro"),

    E("cond_remarket", "false", "msg_remarket1"),
    E("cond_remarket", "true", "end_remarket"),
    E("msg_remarket1", "next", "tag_remarket1"),
    E("tag_remarket1", "next", "wait_1"),
  ]);

  await db
    .insert(webhooks)
    .values({ name: "Pagamento aprovado", slug: "pagamento-aprovado", flowId: flow.id })
    .onConflictDoNothing();

  console.log(`  fluxo "${flow.name}" criado com 24 nos`);
  console.log("Seed concluido.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
