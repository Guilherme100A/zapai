import { EventEmitter } from "node:events";
import { db } from "@/db";
import { automationLogs } from "@/db/schema";

/** Eventos internos da spec 20. */
export const EVENTS = [
  "MESSAGE_RECEIVED",
  "MESSAGE_SENT",
  "CONVERSATION_CREATED",
  "CONVERSATION_UPDATED",
  "LEAD_CREATED",
  "LEAD_UPDATED",
  "TAG_ADDED",
  "TAG_REMOVED",
  "PAYMENT_CREATED",
  "PAYMENT_PAID",
  "FLOW_STARTED",
  "FLOW_FINISHED",
  "FLOW_FAILED",
  "NODE_EXECUTED",
  "AI_STARTED",
  "AI_FINISHED",
  "AI_FAILED",
  "CONNECTION_STATUS_CHANGED",
  /** Recado que o dono mandou para o proprio numero — canal de instrucoes. */
  "SELF_NOTE",
] as const;

export type EventName = (typeof EVENTS)[number];

export interface EventPayload {
  conversationId?: string;
  contactId?: string;
  flowId?: string;
  executionId?: string;
  nodeKey?: string;
  message?: string;
  level?: "info" | "warn" | "error";
  [key: string]: unknown;
}

const globalForBus = globalThis as unknown as { __zapaiBus?: EventEmitter };

/**
 * Bus em processo. Uso proprio, um processo so — nao precisa de Redis.
 * Trocar por um broker externo e localizado: so este arquivo muda.
 */
export const bus = globalForBus.__zapaiBus ?? new EventEmitter().setMaxListeners(50);
if (process.env.NODE_ENV !== "production") globalForBus.__zapaiBus = bus;

/**
 * Publica um evento e grava em automation_logs.
 * O log e best-effort: uma falha de escrita nunca derruba o fluxo.
 */
export async function emit(type: EventName, payload: EventPayload = {}): Promise<void> {
  bus.emit(type, payload);
  bus.emit("*", { type, ...payload });

  try {
    await db.insert(automationLogs).values({
      type,
      conversationId: payload.conversationId ?? null,
      flowId: payload.flowId ?? null,
      executionId: payload.executionId ?? null,
      nodeKey: payload.nodeKey ?? null,
      level: payload.level ?? "info",
      message: payload.message ?? null,
      payload: sanitize(payload),
    });
  } catch (err) {
    console.error("[events] falha ao gravar log", type, err);
  }
}

export function on(type: EventName | "*", handler: (payload: EventPayload) => void): () => void {
  bus.on(type, handler);
  return () => bus.off(type, handler);
}

/** Remove chaves ja normalizadas em colunas e valores nao serializaveis. */
function sanitize(payload: EventPayload): Record<string, unknown> {
  const { conversationId, flowId, executionId, nodeKey, level, message, ...rest } = payload;
  void conversationId, flowId, executionId, nodeKey, level, message;
  try {
    return JSON.parse(JSON.stringify(rest));
  } catch {
    return {};
  }
}
