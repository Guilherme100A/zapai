import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");

  const query = db
    .select({
      id: conversations.id,
      status: conversations.status,
      aiEnabled: conversations.aiEnabled,
      lastMessagePreview: conversations.lastMessagePreview,
      lastMessageAt: conversations.lastMessageAt,
      unreadCount: conversations.unreadCount,
      name: contacts.name,
      phone: contacts.phone,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);

  const rows =
    status === "aguardando" || status === "atendendo" || status === "resolvido"
      ? await query.where(eq(conversations.status, status))
      : await query;

  return NextResponse.json(rows);
}
