import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { flowEdges, flowNodes, flows } from "@/db/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  const [flow] = await db.select().from(flows).where(eq(flows.id, id));
  if (!flow) return NextResponse.json({ error: "Fluxo nao encontrado" }, { status: 404 });

  const [nodes, edges] = await Promise.all([
    db.select().from(flowNodes).where(eq(flowNodes.flowId, id)),
    db.select().from(flowEdges).where(eq(flowEdges.flowId, id)),
  ]);

  return NextResponse.json({ flow, nodes, edges });
}

/**
 * Autosave do editor: substitui nos e edges inteiros.
 *
 * Reescrever tudo e mais simples e mais seguro que diffar — o canvas e a fonte
 * da verdade e os volumes sao pequenos (dezenas de nos).
 */
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  if (body.name !== undefined || body.active !== undefined || body.archived !== undefined) {
    await db
      .update(flows)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.archived !== undefined ? { archived: body.archived } : {}),
        updatedAt: new Date(),
      })
      .where(eq(flows.id, id));
  }

  if (Array.isArray(body.nodes)) {
    await db.transaction(async (tx) => {
      await tx.delete(flowEdges).where(eq(flowEdges.flowId, id));
      await tx.delete(flowNodes).where(eq(flowNodes.flowId, id));

      if (body.nodes.length) {
        await tx.insert(flowNodes).values(
          body.nodes.map((n: Record<string, unknown>) => ({
            flowId: id,
            nodeKey: String(n.nodeKey),
            type: String(n.type),
            positionX: String(n.positionX ?? 0),
            positionY: String(n.positionY ?? 0),
            config: (n.config ?? {}) as Record<string, unknown>,
          })),
        );
      }

      const edges = (body.edges ?? []) as Record<string, unknown>[];
      if (edges.length) {
        await tx.insert(flowEdges).values(
          edges.map((e, i) => ({
            flowId: id,
            edgeKey: String(e.edgeKey ?? `e${i}`),
            source: String(e.source),
            target: String(e.target),
            sourceHandle: (e.sourceHandle as string) ?? null,
          })),
        );
      }
    });

    await db.update(flows).set({ updatedAt: new Date() }).where(eq(flows.id, id));
  }

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await db.delete(flows).where(eq(flows.id, id));
  return NextResponse.json({ ok: true });
}
