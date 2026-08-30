import { and, asc, desc, eq, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  contactTags,
  contacts,
  conversations,
  flowEdges,
  flowExecutions,
  flowNodes,
  flows,
  messages as messagesTable,
  payments,
  tags as tagsTable,
} from "@/db/schema";
import { emit } from "@/lib/events";
import { render, renderDeep, setPath, type TemplateContext } from "@/lib/template";
import { defaultProvider, getProvider } from "@/lib/whatsapp/registry";
import type { WhatsAppProvider } from "@/lib/whatsapp/types";
import { runAINode } from "./ai-node";
import type {
  AIConfig,
  AwaitReplyConfig,
  ConditionConfig,
  ConditionRule,
  DelayConfig,
  FlowLinkConfig,
  HttpRequestConfig,
  MessageConfig,
  NodeType,
  NotificationConfig,
  PixConfig,
  SaleConfig,
  TagsConfig,
} from "./node-types";

/** Teto de nos por passada — corta loop infinito de fluxo mal montado. */
const MAX_STEPS = 200;

interface LoadedFlow {
  id: string;
  nodes: Map<string, { key: string; type: NodeType; config: Record<string, unknown> }>;
  /** source -> handle -> target */
  edges: Map<string, Map<string, string>>;
  startKey: string | null;
}

async function loadFlow(flowId: string): Promise<LoadedFlow> {
  const [nodeRows, edgeRows] = await Promise.all([
    db.select().from(flowNodes).where(eq(flowNodes.flowId, flowId)),
    db.select().from(flowEdges).where(eq(flowEdges.flowId, flowId)),
  ]);

  const nodes = new Map<string, { key: string; type: NodeType; config: Record<string, unknown> }>();
  for (const n of nodeRows) {
    nodes.set(n.nodeKey, {
      key: n.nodeKey,
      type: n.type as NodeType,
      config: (n.config ?? {}) as Record<string, unknown>,
    });
  }

  const edges = new Map<string, Map<string, string>>();
  for (const e of edgeRows) {
    if (!edges.has(e.source)) edges.set(e.source, new Map());
    edges.get(e.source)!.set(e.sourceHandle ?? "next", e.target);
  }

  const startKey = nodeRows.find((n) => n.type === "start")?.nodeKey ?? null;
  return { id: flowId, nodes, edges, startKey };
}

function nextKey(flow: LoadedFlow, from: string, handle: string): string | null {
  return flow.edges.get(from)?.get(handle) ?? null;
}

interface RunContext {
  executionId: string;
  flow: LoadedFlow;
  conversationId: string;
  contactId: string;
  /** Telefone (ou LID) do contato — usado em variaveis e no CRM. */
  phone: string;
  /** Para onde enviar: o JID salvo quando existe, senao o telefone. */
  sendTo: string;
  vars: TemplateContext;
  wa: WhatsAppProvider | undefined;
  /** Mensagem recebida que acordou a execucao (para quote/react). */
  lastIncomingId?: string;
}

/** O que um no devolve: por onde seguir, ou uma pausa. */
type StepResult =
  | { kind: "continue"; handle: string }
  | { kind: "wait"; reason: "await_reply" | "delay"; resumeAt: Date | null }
  | { kind: "stop" }
  | { kind: "jump"; flowId: string };

/* ------------------------------------------------------------- entrada --- */

/**
 * Inicia um fluxo para uma conversa. Se ja existir execucao viva, nao duplica —
 * o lead que reentra cai na execucao corrente.
 */
export async function startFlow(
  flowId: string,
  conversationId: string,
  contactId: string,
  seedVars: Record<string, unknown> = {},
): Promise<string | null> {
  const [existing] = await db
    .select()
    .from(flowExecutions)
    .where(
      and(
        eq(flowExecutions.conversationId, conversationId),
        inArray(flowExecutions.status, ["running", "waiting"]),
      ),
    );
  if (existing) return existing.id;

  const flow = await loadFlow(flowId);
  if (!flow.startKey) return null;

  const [execution] = await db
    .insert(flowExecutions)
    .values({
      flowId,
      conversationId,
      contactId,
      status: "running",
      currentNodeKey: flow.startKey,
      variables: seedVars,
    })
    .returning();

  await emit("FLOW_STARTED", { flowId, conversationId, executionId: execution.id });
  void resume(execution.id).catch((err) => console.error("[engine] startFlow", err));
  return execution.id;
}

/**
 * Entrega uma mensagem do lead a execucao parada em Aguarda Resposta.
 * Devolve true se a mensagem foi consumida pelo fluxo.
 */
export async function deliverReply(
  conversationId: string,
  text: string,
  externalId?: string,
): Promise<boolean> {
  const [execution] = await db
    .select()
    .from(flowExecutions)
    .where(
      and(
        eq(flowExecutions.conversationId, conversationId),
        eq(flowExecutions.status, "waiting"),
        eq(flowExecutions.waitingFor, "await_reply"),
      ),
    );
  if (!execution) return false;

  const flow = await loadFlow(execution.flowId);
  const node = execution.currentNodeKey ? flow.nodes.get(execution.currentNodeKey) : null;
  const cfg = (node?.config ?? {}) as unknown as AwaitReplyConfig;

  const vars = { ...(execution.variables as TemplateContext) };
  if (externalId) vars.__lastIncomingId = externalId;

  /**
   * Buffer de mensagens: o lead manda "oi", "tudo bem?", assunto. Em vez de
   * acordar o fluxo na primeira, acumulamos por N segundos e juntamos tudo.
   */
  if (cfg.bufferEnabled && cfg.bufferSeconds > 0) {
    const buffer = execution.buffer;
    const now = Date.now();

    if (buffer && new Date(buffer.until).getTime() > now) {
      await db
        .update(flowExecutions)
        .set({ buffer: { parts: [...buffer.parts, text], until: buffer.until }, variables: vars })
        .where(eq(flowExecutions.id, execution.id));
      return true; // ja existe um timer correndo
    }

    const until = new Date(now + cfg.bufferSeconds * 1000).toISOString();
    await db
      .update(flowExecutions)
      .set({ buffer: { parts: [text], until }, variables: vars })
      .where(eq(flowExecutions.id, execution.id));

    setTimeout(() => {
      void flushBuffer(execution.id).catch((e) => console.error("[engine] flushBuffer", e));
    }, cfg.bufferSeconds * 1000);
    return true;
  }

  await applyReply(execution.id, cfg, [text], vars);
  return true;
}

async function flushBuffer(executionId: string): Promise<void> {
  const [execution] = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.id, executionId));
  if (!execution || execution.status !== "waiting" || !execution.buffer) return;

  const flow = await loadFlow(execution.flowId);
  const node = execution.currentNodeKey ? flow.nodes.get(execution.currentNodeKey) : null;
  const cfg = (node?.config ?? {}) as unknown as AwaitReplyConfig;

  await applyReply(
    executionId,
    cfg,
    execution.buffer.parts,
    execution.variables as TemplateContext,
  );
}

/** Grava a resposta na variavel configurada e retoma pela saida "replied". */
async function applyReply(
  executionId: string,
  cfg: AwaitReplyConfig,
  parts: string[],
  vars: TemplateContext,
): Promise<void> {
  const joined = parts.filter(Boolean).join("\n");
  const field = (cfg.saveToField || "resposta").replace(/[{}]/g, "").trim();
  setPath(vars, field, joined);
  setPath(vars, "lead.message", joined);

  await db
    .update(flowExecutions)
    .set({ variables: vars, buffer: null, status: "running", waitingFor: null, resumeAt: null })
    .where(eq(flowExecutions.id, executionId));

  await resume(executionId, "replied");
}

/** Chamado pelo scheduler: timeouts de Aguarda Resposta e Intervalos vencidos. */
export async function tickScheduler(): Promise<number> {
  const due = await db
    .select()
    .from(flowExecutions)
    .where(
      and(
        eq(flowExecutions.status, "waiting"),
        lte(flowExecutions.resumeAt, new Date()),
      ),
    )
    .limit(50);

  for (const execution of due) {
    const handle = execution.waitingFor === "await_reply" ? "timeout" : "next";
    await db
      .update(flowExecutions)
      .set({ status: "running", waitingFor: null, resumeAt: null })
      .where(eq(flowExecutions.id, execution.id));
    await resume(execution.id, handle).catch((err) =>
      console.error("[engine] tick", execution.id, err),
    );
  }
  return due.length;
}

/* --------------------------------------------------------------- laco ---- */

/**
 * Avanca a execucao a partir do no corrente ate parar, pausar ou terminar.
 * `entryHandle` diz por qual saida do no atual continuar (ao retomar de espera).
 */
export async function resume(executionId: string, entryHandle?: string): Promise<void> {
  const [execution] = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.id, executionId));
  if (!execution || execution.status === "finished" || execution.status === "cancelled") return;

  let flow = await loadFlow(execution.flowId);
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, execution.conversationId));
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, execution.contactId));
  if (!conversation || !contact) return;

  const wa = conversation.connectionId
    ? (getProvider(conversation.connectionId) ?? defaultProvider())
    : defaultProvider();

  const vars = { ...(execution.variables as TemplateContext) };
  vars.lead = {
    ...(vars.lead as Record<string, unknown>),
    nome: contact.name ?? contact.pushName ?? "",
    telefone: contact.phone,
    ...(contact.fields as Record<string, unknown>),
  };

  const ctx: RunContext = {
    executionId,
    flow,
    conversationId: execution.conversationId,
    contactId: execution.contactId,
    phone: contact.phone,
    // contatos so com LID nao tem telefone valido; enviar pelo JID e o que funciona
    sendTo: contact.waJid ?? contact.phone,
    vars,
    wa,
    lastIncomingId: vars.__lastIncomingId as string | undefined,
  };

  // ao retomar de uma espera, saimos pela saida indicada; senao executamos o no
  let currentKey: string | null = execution.currentNodeKey;
  if (entryHandle && currentKey) currentKey = nextKey(flow, currentKey, entryHandle);

  let steps = 0;

  while (currentKey && steps++ < MAX_STEPS) {
    const node = flow.nodes.get(currentKey);
    if (!node) break;

    await db
      .update(flowExecutions)
      .set({ currentNodeKey: currentKey, variables: ctx.vars })
      .where(eq(flowExecutions.id, executionId));

    let result: StepResult;
    try {
      result = await executeNode(node, ctx);
      await emit("NODE_EXECUTED", {
        executionId,
        flowId: flow.id,
        conversationId: ctx.conversationId,
        nodeKey: currentKey,
        message: `${node.type} -> ${result.kind === "continue" ? result.handle : result.kind}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // o bloco de IA tem saida de erro propria; os demais falham a execucao
      const errorTarget = nextKey(flow, currentKey, "error");
      await emit(node.type === "ai" ? "AI_FAILED" : "FLOW_FAILED", {
        executionId,
        flowId: flow.id,
        conversationId: ctx.conversationId,
        nodeKey: currentKey,
        level: "error",
        message,
      });

      if (errorTarget) {
        setPath(ctx.vars, "ai.error", message);
        currentKey = errorTarget;
        continue;
      }
      await db
        .update(flowExecutions)
        .set({ status: "failed", error: message, finishedAt: new Date(), variables: ctx.vars })
        .where(eq(flowExecutions.id, executionId));
      return;
    }

    if (result.kind === "wait") {
      await db
        .update(flowExecutions)
        .set({
          status: "waiting",
          waitingFor: result.reason,
          resumeAt: result.resumeAt,
          currentNodeKey: currentKey,
          variables: ctx.vars,
        })
        .where(eq(flowExecutions.id, executionId));
      return;
    }

    if (result.kind === "stop") break;

    if (result.kind === "jump") {
      flow = await loadFlow(result.flowId);
      ctx.flow = flow;
      await db
        .update(flowExecutions)
        .set({ flowId: result.flowId })
        .where(eq(flowExecutions.id, executionId));
      currentKey = flow.startKey;
      continue;
    }

    currentKey = nextKey(flow, currentKey, result.handle);
  }

  await db
    .update(flowExecutions)
    .set({ status: "finished", finishedAt: new Date(), variables: ctx.vars, currentNodeKey: null })
    .where(eq(flowExecutions.id, executionId));

  await emit("FLOW_FINISHED", {
    executionId,
    flowId: flow.id,
    conversationId: ctx.conversationId,
  });
}

/* ------------------------------------------------------------ execucao --- */

async function executeNode(
  node: { key: string; type: NodeType; config: Record<string, unknown> },
  ctx: RunContext,
): Promise<StepResult> {
  switch (node.type) {
    case "start":
      return { kind: "continue", handle: "next" };

    case "message": {
      const cfg = renderDeep(node.config as unknown as MessageConfig, ctx.vars);
      for (const item of cfg.items ?? []) {
        if (item.kind === "delay") {
          await sleep((item.seconds ?? 1) * 1000);
          continue;
        }
        await sendItem(ctx, item);
      }
      return { kind: "continue", handle: "next" };
    }

    case "await_reply": {
      const cfg = node.config as unknown as AwaitReplyConfig;

      if (cfg.messageBefore?.trim()) {
        await sendText(ctx, render(cfg.messageBefore, ctx.vars));
      }
      if (cfg.reactEmoji && ctx.lastIncomingId && ctx.wa) {
        await ctx.wa.react(ctx.sendTo, ctx.lastIncomingId, cfg.reactEmoji).catch(() => {});
      }

      const resumeAt = cfg.waitIndefinitely ? null : new Date(Date.now() + timeoutMs(cfg));
      return { kind: "wait", reason: "await_reply", resumeAt };
    }

    case "ai": {
      const cfg = node.config as unknown as AIConfig;
      const userText = render(cfg.inputTemplate || "{{resposta}}", ctx.vars);
      const history = cfg.keepContext ? await loadHistory(ctx.conversationId, cfg.contextTurns) : [];

      await emit("AI_STARTED", {
        executionId: ctx.executionId,
        conversationId: ctx.conversationId,
        nodeKey: node.key,
      });

      const result = await runAINode({ config: cfg, userText, history });

      setPath(ctx.vars, "ai.response", result.aiResponse);
      if (result.receipt) {
        setPath(ctx.vars, "comprovante", result.receipt);
        await recordReceipt(ctx, result.receipt);
      }

      await emit("AI_FINISHED", {
        executionId: ctx.executionId,
        conversationId: ctx.conversationId,
        nodeKey: node.key,
        message: `saida "${result.outputKey}"`,
        usage: result.usage,
      });

      // "Enviar resposta automaticamente" — normalmente off, para tratar antes
      if (cfg.autoSend && result.aiResponse) await sendText(ctx, result.aiResponse);

      return { kind: "continue", handle: result.outputKey };
    }

    case "tags": {
      const cfg = node.config as unknown as TagsConfig;
      if (cfg.tagIds?.length) {
        if (cfg.mode === "add") {
          await db
            .insert(contactTags)
            .values(cfg.tagIds.map((tagId) => ({ contactId: ctx.contactId, tagId })))
            .onConflictDoNothing();
          await emit("TAG_ADDED", {
            contactId: ctx.contactId,
            conversationId: ctx.conversationId,
            tagIds: cfg.tagIds,
          });
        } else {
          await db
            .delete(contactTags)
            .where(
              and(
                eq(contactTags.contactId, ctx.contactId),
                inArray(contactTags.tagId, cfg.tagIds),
              ),
            );
          await emit("TAG_REMOVED", {
            contactId: ctx.contactId,
            conversationId: ctx.conversationId,
            tagIds: cfg.tagIds,
          });
        }
      }
      return { kind: "continue", handle: "next" };
    }

    case "condition": {
      const cfg = node.config as unknown as ConditionConfig;
      const ok = await evaluateCondition(cfg, ctx);
      return { kind: "continue", handle: ok ? "true" : "false" };
    }

    case "delay": {
      const cfg = node.config as unknown as DelayConfig;
      const ms = delayMs(cfg);
      // pausas curtas seguram o laco; longas viram espera persistida
      if (ms <= 30_000) {
        await sleep(ms);
        return { kind: "continue", handle: "next" };
      }
      return { kind: "wait", reason: "delay", resumeAt: new Date(Date.now() + ms) };
    }

    case "notification": {
      const cfg = renderDeep(node.config as unknown as NotificationConfig, ctx.vars);
      if (cfg.toPhone && ctx.wa) {
        await ctx.wa.sendText(cfg.toPhone, cfg.message || "Notificacao do fluxo");
      }
      return { kind: "continue", handle: "next" };
    }

    case "http_request": {
      const cfg = renderDeep(node.config as unknown as HttpRequestConfig, ctx.vars);
      try {
        const res = await fetch(cfg.url, {
          method: cfg.method,
          headers: { "content-type": "application/json", ...(cfg.headers ?? {}) },
          body: cfg.method === "GET" ? undefined : cfg.body,
        });
        const text = await res.text();
        let data: unknown = text;
        try {
          data = JSON.parse(text);
        } catch {
          /* resposta nao-JSON fica como texto */
        }
        setPath(ctx.vars, cfg.saveAs || "response", { status: res.status, data });
        return { kind: "continue", handle: res.ok ? "success" : "error" };
      } catch (err) {
        setPath(ctx.vars, cfg.saveAs || "response", {
          status: 0,
          error: err instanceof Error ? err.message : String(err),
        });
        return { kind: "continue", handle: "error" };
      }
    }

    case "pix": {
      const cfg = renderDeep(node.config as unknown as PixConfig, ctx.vars);
      const [payment] = await db
        .insert(payments)
        .values({
          contactId: ctx.contactId,
          conversationId: ctx.conversationId,
          status: "pending",
          amount: cfg.amount ? cfg.amount.replace(",", ".") : null,
          pixKey: cfg.key,
          pixKeyType: cfg.keyType,
          recipient: cfg.recipient,
        })
        .returning();

      setPath(ctx.vars, "pix.id", payment.id);
      setPath(ctx.vars, "pix.chave", cfg.key);

      const lines = [
        cfg.message?.trim() || "Segue a chave PIX para pagamento:",
        "",
        cfg.key,
        ...(cfg.amount ? ["", `Valor: R$ ${cfg.amount}`] : []),
        ...(cfg.recipient ? [`Recebedor: ${cfg.recipient}`] : []),
      ];
      await sendText(ctx, lines.join("\n"));

      await emit("PAYMENT_CREATED", {
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
        paymentId: payment.id,
      });
      return { kind: "continue", handle: "next" };
    }

    case "sale": {
      const cfg = renderDeep(node.config as unknown as SaleConfig, ctx.vars);
      const paidRaw = cfg.amountField || String(ctx.vars.comprovante ? "" : "");
      const paid = parseAmount(paidRaw);
      const min = parseAmount(cfg.minPrice ?? cfg.price);

      // regra do video: paguei menos que o minimo -> nao aprova
      if (min != null && paid != null && paid < min) {
        setPath(ctx.vars, "venda.aprovada", false);
        return { kind: "continue", handle: "next" };
      }

      await db
        .update(payments)
        .set({ status: "paid", paidAt: new Date() })
        .where(
          and(
            eq(payments.conversationId, ctx.conversationId),
            eq(payments.status, "pending"),
          ),
        );

      setPath(ctx.vars, "venda.aprovada", true);
      setPath(ctx.vars, "venda.produto", cfg.productName);
      await emit("PAYMENT_PAID", {
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
        produto: cfg.productName,
        valor: paid,
      });
      return { kind: "continue", handle: "next" };
    }

    case "flow_link": {
      const cfg = node.config as unknown as FlowLinkConfig;
      if (!cfg.targetFlowId) return { kind: "stop" };
      return { kind: "jump", flowId: cfg.targetFlowId };
    }

    case "transfer_human": {
      await db
        .update(conversations)
        .set({ status: "atendendo", aiEnabled: false, updatedAt: new Date() })
        .where(eq(conversations.id, ctx.conversationId));
      await emit("CONVERSATION_UPDATED", {
        conversationId: ctx.conversationId,
        message: "transferido para atendimento humano",
      });
      return { kind: "stop" };
    }

    case "end":
      return { kind: "stop" };

    default:
      return { kind: "continue", handle: "next" };
  }
}

/* -------------------------------------------------------------- helpers -- */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function timeoutMs(cfg: AwaitReplyConfig): number {
  const unit =
    cfg.timeoutUnit === "minutes" ? 60_000 : cfg.timeoutUnit === "days" ? 86_400_000 : 3_600_000;
  // teto de 31 dias, igual ao limite mostrado na UI do Leona
  return Math.min((cfg.timeoutValue || 1) * unit, 31 * 86_400_000);
}

function delayMs(cfg: DelayConfig): number {
  const unit =
    cfg.unit === "seconds"
      ? 1000
      : cfg.unit === "minutes"
        ? 60_000
        : cfg.unit === "days"
          ? 86_400_000
          : 3_600_000;
  return (cfg.value || 1) * unit;
}

function parseAmount(value: unknown): number | null {
  if (value == null) return null;
  const cleaned = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function sendText(ctx: RunContext, body: string, typingDelaySeconds?: number) {
  if (!body?.trim()) return;
  if (!ctx.wa) throw new Error("Nenhuma conexao de WhatsApp conectada");

  const sent = await ctx.wa.sendText(ctx.sendTo, body, { typingDelaySeconds });
  // a mensagem ja foi entregue ao lead; um conflito de id aqui e ruido de
  // registro e nao pode abortar a execucao no meio do atendimento
  await db.insert(messagesTable).values({
    conversationId: ctx.conversationId,
    externalId: sent.externalId || null,
    direction: "out",
    author: "flow",
    type: "text",
    body,
  }).onConflictDoNothing();
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 120) })
    .where(eq(conversations.id, ctx.conversationId));
  await emit("MESSAGE_SENT", { conversationId: ctx.conversationId, executionId: ctx.executionId });
}

async function sendItem(ctx: RunContext, item: MessageConfig["items"][number]) {
  if (item.kind === "text") {
    await sendText(ctx, item.value, item.typingDelaySeconds);
    return;
  }
  // "delay" ja foi tratado no laco do no; aqui so sobra midia
  if (item.kind === "delay") return;
  const kind = item.kind;
  if (!ctx.wa) throw new Error("Nenhuma conexao de WhatsApp conectada");
  if (!item.value) return;

  const sent = await ctx.wa.sendMedia(ctx.sendTo, kind, item.value, {
    caption: item.caption,
    fileName: item.fileName,
    typingDelaySeconds: item.typingDelaySeconds,
  });
  await db.insert(messagesTable).values({
    conversationId: ctx.conversationId,
    externalId: sent.externalId || null,
    direction: "out",
    author: "flow",
    type: kind,
    body: item.caption ?? null,
    mediaUrl: item.value,
  }).onConflictDoNothing();
}

async function loadHistory(conversationId: string, turns = 5) {
  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(Math.max(1, turns) * 2);

  return rows
    .reverse()
    .filter((m) => m.body?.trim())
    .map((m) => ({
      role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
      content: m.body!,
    }));
}

async function recordReceipt(ctx: RunContext, receipt: Record<string, unknown>) {
  await db
    .update(payments)
    .set({ receipt })
    .where(
      and(eq(payments.conversationId, ctx.conversationId), eq(payments.status, "pending")),
    );
}

/** Avalia o bloco Condicional (E/OU sobre o catalogo de condicoes). */
async function evaluateCondition(cfg: ConditionConfig, ctx: RunContext): Promise<boolean> {
  const rules = cfg.rules ?? [];
  if (!rules.length) return true;

  const results: boolean[] = [];
  for (const rule of rules) results.push(await evaluateRule(rule, ctx));

  return cfg.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

async function evaluateRule(rule: ConditionRule, ctx: RunContext): Promise<boolean> {
  let actual: string;

  switch (rule.field.source) {
    case "tag": {
      const [row] = await db
        .select({ id: contactTags.tagId })
        .from(contactTags)
        .where(
          and(
            eq(contactTags.contactId, ctx.contactId),
            eq(contactTags.tagId, rule.field.tagId),
          ),
        );
      // etiqueta e presenca: "igual" = tem, "diferente" = nao tem
      const has = Boolean(row);
      return rule.operator === "not_equals" ? !has : has;
    }
    case "field": {
      const raw = rule.field.key
        .split(".")
        .reduce<unknown>(
          (acc, part) =>
            acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
          ctx.vars,
        );
      actual = raw == null ? "" : String(raw);
      break;
    }
    case "weekday":
      actual = String(new Date().getDay());
      break;
    case "hour":
      actual = String(new Date().getHours());
      break;
    case "date":
      actual = new Date().toISOString().slice(0, 10);
      break;
    case "conversation_status": {
      const [conv] = await db
        .select({ status: conversations.status })
        .from(conversations)
        .where(eq(conversations.id, ctx.conversationId));
      actual = conv?.status ?? "";
      break;
    }
  }

  const expected = render(rule.value, ctx.vars);
  switch (rule.operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "contains":
      return actual.toLowerCase().includes(expected.toLowerCase());
    case "not_contains":
      return !actual.toLowerCase().includes(expected.toLowerCase());
    case "gt":
      return Number(actual) > Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    default:
      return false;
  }
}

/** Fluxos ativos que devem disparar quando chega mensagem de um contato novo. */
export async function findTriggerFlow(): Promise<string | null> {
  const [row] = await db
    .select({ id: flows.id })
    .from(flows)
    .where(and(eq(flows.active, true), eq(flows.archived, false)))
    .orderBy(asc(flows.createdAt))
    .limit(1);
  return row?.id ?? null;
}
