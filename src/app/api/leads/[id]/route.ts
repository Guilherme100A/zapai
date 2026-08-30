import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { emit } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  await db
    .update(leads)
    .set({
      ...(body.stageId !== undefined ? { stageId: body.stageId } : {}),
      ...(body.value !== undefined ? { value: body.value } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id));

  await emit("LEAD_UPDATED", { leadId: id, message: `estagio -> ${body.stageId ?? "-"}` });
  return NextResponse.json({ ok: true });
}
