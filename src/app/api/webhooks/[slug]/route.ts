import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, webhooks } from "@/db/schema";
import { emit } from "@/lib/events";
import { startFlow } from "@/lib/flow/engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/{slug} — evento externo dispara um fluxo (spec 16).
 *
 * O corpo inteiro vira `webhook.*` no contexto, e se vier um telefone
 * amarramos o fluxo ao contato correspondente.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [hook] = await db.select().from(webhooks).where(eq(webhooks.slug, slug));
  if (!hook || !hook.active) {
    return NextResponse.json({ error: "webhook nao encontrado" }, { status: 404 });
  }

  const payload = await req.json().catch(() => ({}));
  await db.update(webhooks).set({ lastCalledAt: new Date() }).where(eq(webhooks.id, hook.id));
  await emit("CONVERSATION_UPDATED", { message: `webhook ${slug}`, payload });

  if (!hook.flowId) return NextResponse.json({ ok: true, started: false });

  const rawPhone = payload.phone ?? payload.telefone ?? payload.from;
  if (!rawPhone) {
    return NextResponse.json(
      { error: "informe 'phone' no corpo para vincular a um contato" },
      { status: 400 },
    );
  }

  const phone = String(rawPhone).replace(/\D/g, "");
  let [contact] = await db.select().from(contacts).where(eq(contacts.phone, phone));
  if (!contact) {
    [contact] = await db
      .insert(contacts)
      .values({ phone, name: payload.name ?? payload.nome ?? null, origin: `webhook:${slug}` })
      .returning();
  }

  let [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.contactId, contact.id),
        inArray(conversations.status, ["aguardando", "atendendo"]),
      ),
    );
  if (!conversation) {
    [conversation] = await db
      .insert(conversations)
      .values({ contactId: contact.id, status: "aguardando" })
      .returning();
  }

  const executionId = await startFlow(hook.flowId, conversation.id, contact.id, {
    webhook: payload,
  });

  return NextResponse.json({ ok: true, started: Boolean(executionId), executionId });
}
