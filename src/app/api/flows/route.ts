import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { flowEdges, flowNodes, flows } from "@/db/schema";
import { DEFAULT_CONFIGS } from "@/lib/flow/node-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(flows)
    .where(eq(flows.archived, false))
    .orderBy(desc(flows.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = body.name?.trim() || "Novo Fluxo";

  const [flow] = await db.insert(flows).values({ name }).returning();

  // todo fluxo nasce com o gatilho — sem ele o motor nao tem por onde comecar
  await db.insert(flowNodes).values({
    flowId: flow.id,
    nodeKey: "start",
    type: "start",
    positionX: "80",
    positionY: "200",
    config: DEFAULT_CONFIGS.start,
  });

  // importar fluxo: recria nos e edges vindos de um JSON exportado
  if (Array.isArray(body.nodes) && body.nodes.length) {
    await db.delete(flowNodes).where(eq(flowNodes.flowId, flow.id));
    await db.insert(flowNodes).values(
      body.nodes.map((n: Record<string, unknown>) => ({
        flowId: flow.id,
        nodeKey: String(n.nodeKey ?? n.id),
        type: String(n.type),
        positionX: String(n.positionX ?? 0),
        positionY: String(n.positionY ?? 0),
        config: (n.config ?? {}) as Record<string, unknown>,
      })),
    );
    if (Array.isArray(body.edges) && body.edges.length) {
      await db.insert(flowEdges).values(
        body.edges.map((e: Record<string, unknown>, i: number) => ({
          flowId: flow.id,
          edgeKey: String(e.edgeKey ?? e.id ?? `e${i}`),
          source: String(e.source),
          target: String(e.target),
          sourceHandle: (e.sourceHandle as string) ?? null,
        })),
      );
    }
  }

  return NextResponse.json(flow, { status: 201 });
}
