import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contactTags, contacts, tags } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      phone: contacts.phone,
      origin: contacts.origin,
      createdAt: contacts.createdAt,
      tagNames: sql<string[]>`coalesce(array_agg(${tags.name}) filter (where ${tags.name} is not null), '{}')`,
    })
    .from(contacts)
    .leftJoin(contactTags, eq(contactTags.contactId, contacts.id))
    .leftJoin(tags, eq(tags.id, contactTags.tagId))
    .groupBy(contacts.id)
    .orderBy(desc(contacts.createdAt))
    .limit(200);

  return (
    <div className="p-8">
      <PageHeader icon={Users} title="Contatos" subtitle="Aparecem sozinhos quando alguem manda mensagem." breadcrumb={[{ label: "Contatos" }]} />

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Nenhum contato. Eles aparecem sozinhos quando alguem manda mensagem.
        </p>
      ) : (
        <div className="card mt-6 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium">Etiquetas</th>
                <th className="px-4 py-2 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">{c.name ?? "-"}</td>
                  <td className="px-4 py-2 font-mono text-xs">+{c.phone}</td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap gap-1">
                      {(c.tagNames ?? []).map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted">{c.origin ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
