import { Workflow } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { flows } from "@/db/schema";
import { NewFlowButton } from "@/components/new-flow-button";

export const dynamic = "force-dynamic";

export default async function FlowsPage() {
  const rows = await db
    .select()
    .from(flows)
    .where(eq(flows.archived, false))
    .orderBy(desc(flows.updatedAt));

  return (
    <div className="p-8">
      <PageHeader
        icon={Workflow}
        title="Fluxos"
        subtitle="Um fluxo ativo por vez responde as mensagens recebidas."
        breadcrumb={[{ label: "Fluxos" }]}
      >
        <NewFlowButton />
      </PageHeader>

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-muted">
            Nenhum fluxo ainda. Crie o primeiro ou rode <code>npm run seed</code> para carregar o
            fluxo de exemplo dos videos.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((f) => (
            <Link key={f.id} href={`/flows/${f.id}`} className="card p-5 transition hover:border-[var(--brand)]">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{f.name}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                    f.active
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-slate-500/15 text-muted"
                  }`}
                >
                  {f.active ? "Ativo" : "Pausado"}
                </span>
              </div>
              {f.description && <p className="mt-1 text-sm text-muted">{f.description}</p>}
              <p className="mt-3 text-xs text-muted">
                Atualizado {new Date(f.updatedAt).toLocaleString("pt-BR")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
