import { Webhook } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { webhooks } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const rows = await db.select().from(webhooks).orderBy(desc(webhooks.createdAt));

  return (
    <div className="p-8">
      <PageHeader icon={Webhook} title="Webhooks de entrada" subtitle="Um POST no endpoint dispara o fluxo vinculado." breadcrumb={[{ label: "Webhooks de entrada" }]} />

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Nenhum webhook. Rode <code>npm run seed</code> ou crie via API.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((w) => (
            <div key={w.id} className="card p-4">
              <p className="font-medium">{w.name}</p>
              <code className="mt-1 block text-xs text-muted">
                POST http://localhost:3737/api/webhooks/{w.slug}
              </code>
              {w.lastCalledAt && (
                <p className="mt-2 text-xs text-muted">
                  Ultima chamada: {new Date(w.lastCalledAt).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
