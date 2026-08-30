import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, messages } from "@/db/schema";
import { emit } from "@/lib/events";
import { deliverReply, findTriggerFlow, startFlow } from "@/lib/flow/engine";
import type { IncomingMessage } from "@/lib/whatsapp/types";

/**
 * Ponto unico de entrada de mensagem recebida.
 *
 * Ordem importa: persistir primeiro (a mensagem nunca se perde, mesmo que a
 * automacao falhe), depois tentar entregar ao fluxo.
 */
export async function ingestIncoming(
  connectionId: string,
  msg: IncomingMessage,
): Promise<void> {
  /**
   * Recado para si mesmo: vira log e para por aqui.
   *
   * Nunca pode seguir para o motor — a resposta do fluxo sairia para o proprio
   * numero, voltaria como recado novo e o bot conversaria consigo mesmo sem fim.
   */
  if (msg.selfNote) {
    await emit("SELF_NOTE", {
      message: msg.body ?? `[${msg.type}]`,
      externalId: msg.externalId,
      at: msg.timestamp.toISOString(),
    });
    return;
  }

  const contact = await upsertContact(msg);
  const conversation = await upsertConversation(contact.id, connectionId);

  const preview = msg.body?.slice(0, 120) ?? `[${msg.type}]`;

  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      externalId: msg.externalId,
      direction: "in",
      author: "contact",
      type: msg.type === "location" ? "unknown" : msg.type,
      body: msg.body ?? null,
      mimeType: msg.mimeType ?? null,
      quotedMessageId: msg.quotedMessageId ?? null,
      createdAt: msg.timestamp,
    })
    .onConflictDoNothing({ target: messages.externalId })
    .returning();

  // conflito = mensagem repetida do provider; nada a fazer
  if (!inserted) return;

  await db
    .update(conversations)
    .set({
      lastMessageAt: msg.timestamp,
      lastMessagePreview: preview,
      unreadCount: conversation.unreadCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id));

  await emit("MESSAGE_RECEIVED", {
    conversationId: conversation.id,
    contactId: contact.id,
    message: preview,
  });

  // conversa em atendimento humano ou com IA desligada nao roda automacao
  if (!conversation.aiEnabled || conversation.status === "atendendo") return;

  const text = msg.body ?? "";

  // 1) execucao parada em Aguarda Resposta consome a mensagem
  const delivered = await deliverReply(conversation.id, text, msg.externalId);
  if (delivered) return;

  // 2) senao, um fluxo ativo pode iniciar
  const flowId = await findTriggerFlow();
  if (!flowId) return;

  await startFlow(flowId, conversation.id, contact.id, {
    lead: { message: text },
    resposta: text,
    __lastIncomingId: msg.externalId,
  });
}

async function upsertContact(msg: IncomingMessage) {
  const [existing] = await db.select().from(contacts).where(eq(contacts.phone, msg.from));
  if (existing) {
    // pushName muda quando a pessoa troca o nome do perfil; o jid pode chegar
    // depois, em contatos criados antes desta coluna existir
    const patch: Record<string, unknown> = {};
    if (msg.pushName && msg.pushName !== existing.pushName) patch.pushName = msg.pushName;
    if (msg.fromJid && msg.fromJid !== existing.waJid) patch.waJid = msg.fromJid;
    if (Object.keys(patch).length) {
      await db
        .update(contacts)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(contacts.id, existing.id));
    }
    return existing;
  }

  const [created] = await db
    .insert(contacts)
    .values({
      phone: msg.from,
      waJid: msg.fromJid,
      pushName: msg.pushName,
      name: msg.pushName,
      origin: "whatsapp",
    })
    .returning();

  await emit("CONVERSATION_CREATED", { contactId: created.id, message: created.phone });
  return created;
}

async function upsertConversation(contactId: string, connectionId: string) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.contactId, contactId),
        inArray(conversations.status, ["aguardando", "atendendo"]),
      ),
    );
  if (existing) return existing;

  const [created] = await db
    .insert(conversations)
    .values({ contactId, connectionId, status: "aguardando" })
    .returning();

  await emit("CONVERSATION_CREATED", { conversationId: created.id, contactId });
  return created;
}
