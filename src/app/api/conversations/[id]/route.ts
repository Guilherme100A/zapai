import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, messages } from "@/db/schema";
import { emit } from "@/lib/events";
import { defaultProvider, getProvider } from "@/lib/whatsapp/registry";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conversation) return NextResponse.json({ error: "nao encontrada" }, { status: 404 });

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt))
    .limit(300);

  // abrir a conversa zera o contador de nao lidas
  if (conversation.unreadCount > 0) {
    await db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, id));
  }

  return NextResponse.json({ conversation, messages: rows });
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { action, value, body } = await req.json();

  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conversation) return NextResponse.json({ error: "nao encontrada" }, { status: 404 });

  switch (action) {
    case "send": {
      if (!body?.trim()) return NextResponse.json({ error: "mensagem vazia" }, { status: 400 });

      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, conversation.contactId));

      const provider = conversation.connectionId
        ? (getProvider(conversation.connectionId) ?? defaultProvider())
        : defaultProvider();
      if (!provider) {
        return NextResponse.json({ error: "Nenhuma conexao conectada" }, { status: 400 });
      }

      // usa o JID quando existe: contatos com LID nao tem telefone roteavel
      const sent = await provider.sendText(contact.waJid ?? contact.phone, body);
      await db.insert(messages).values({
        conversationId: id,
        externalId: sent.externalId || null,
        direction: "out",
        author: "human",
        type: "text",
        body,
      });
      await db
        .update(conversations)
        .set({ lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 120) })
        .where(eq(conversations.id, id));

      await emit("MESSAGE_SENT", { conversationId: id, message: "envio manual" });
      return NextResponse.json({ ok: true });
    }

    case "toggle_ai":
      await db
        .update(conversations)
        .set({ aiEnabled: Boolean(value), updatedAt: new Date() })
        .where(eq(conversations.id, id));
      return NextResponse.json({ ok: true });

    case "status":
      await db
        .update(conversations)
        .set({ status: value, updatedAt: new Date() })
        .where(eq(conversations.id, id));
      await emit("CONVERSATION_UPDATED", { conversationId: id, message: `status -> ${value}` });
      return NextResponse.json({ ok: true });

    case "transfer_human":
      // assumir o atendimento sempre desliga a IA, senao os dois respondem juntos
      await db
        .update(conversations)
        .set({ status: "atendendo", aiEnabled: false, updatedAt: new Date() })
        .where(eq(conversations.id, id));
      return NextResponse.json({ ok: true });

    default:
      return NextResponse.json({ error: "acao invalida" }, { status: 400 });
  }
}
