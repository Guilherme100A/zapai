import { notFound } from "next/navigation";
import { eq, ne, and } from "drizzle-orm";
import { db } from "@/db";
import { flowEdges, flowNodes, flows, tags } from "@/db/schema";
import { FlowEditor } from "@/components/flow/flow-editor";

export const dynamic = "force-dynamic";

export default async function FlowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [flow] = await db.select().from(flows).where(eq(flows.id, id));
  if (!flow) notFound();

  const [nodes, edges, tagRows, otherFlows] = await Promise.all([
    db.select().from(flowNodes).where(eq(flowNodes.flowId, id)),
    db.select().from(flowEdges).where(eq(flowEdges.flowId, id)),
    db.select({ id: tags.id, name: tags.name }).from(tags),
    db
      .select({ id: flows.id, name: flows.name })
      .from(flows)
      .where(and(ne(flows.id, id), eq(flows.archived, false))),
  ]);

  return (
    <FlowEditor
      flowId={id}
      initialFlow={{ name: flow.name, active: flow.active }}
      initialNodes={nodes.map((n) => ({
        nodeKey: n.nodeKey,
        type: n.type,
        positionX: n.positionX,
        positionY: n.positionY,
        config: (n.config ?? {}) as Record<string, unknown>,
      }))}
      initialEdges={edges.map((e) => ({
        edgeKey: e.edgeKey,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
      }))}
      tags={tagRows}
      flows={otherFlows}
    />
  );
}
