import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tags } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await db.select().from(tags).orderBy(asc(tags.name)));
}

export async function POST(req: Request) {
  const { name, color } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatorio" }, { status: 400 });

  const [row] = await db
    .insert(tags)
    .values({ name: name.trim(), color: color ?? "#7c5cff" })
    .onConflictDoNothing()
    .returning();

  return NextResponse.json(row ?? { error: "Etiqueta ja existe" }, { status: row ? 201 : 409 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  await db.delete(tags).where(eq(tags.id, id));
  return NextResponse.json({ ok: true });
}
