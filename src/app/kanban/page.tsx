import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, leads, pipelineStages, pipelines } from "@/db/schema";
import { KanbanBoard } from "@/components/kanban-board";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const [pipeline] = await db
    .select()
    .from(pipelines)
    .where(eq(pipelines.isDefault, true))
    .limit(1);

  if (!pipeline) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Kanban</h1>
        <p className="mt-4 text-sm text-muted">
          Nenhum pipeline configurado. Rode <code>npm run seed</code> para criar o pipeline padrao.
        </p>
      </div>
    );
  }

  const [stages, rows] = await Promise.all([
    db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, pipeline.id))
      .orderBy(asc(pipelineStages.position)),
    db
      .select({
        id: leads.id,
        stageId: leads.stageId,
        value: leads.value,
        position: leads.position,
        name: contacts.name,
        phone: contacts.phone,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(eq(leads.pipelineId, pipeline.id))
      .orderBy(asc(leads.position)),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Kanban</h1>
      <p className="mt-1 text-sm text-muted">{pipeline.name}</p>
      <KanbanBoard stages={stages} leads={rows} />
    </div>
  );
}
