import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { whatsappConnections } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(whatsappConnections)
    .orderBy(desc(whatsappConnections.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { name, provider } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Nome obrigatorio" }, { status: 400 });
  }

  const [row] = await db
    .insert(whatsappConnections)
    .values({ name: name.trim(), provider: provider ?? "baileys" })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
