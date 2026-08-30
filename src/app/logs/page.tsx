import { ScrollText } from "lucide-react";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { automationLogs } from "@/db/schema";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const POR_PAGINA = 60;

/** Cor por familia de evento — ajuda a varrer a lista com o olho. */
function corDoEvento(type: string, level: string): string {
  if (level === "error") return "text-red-500";
  if (type.startsWith("AI_")) return "text-emerald-600 dark:text-emerald-400";
  if (type.startsWith("FLOW_")) return "text-[var(--brand)]";
  if (type.startsWith("MESSAGE_")) return "text-blue-500";
  if (type.startsWith("PAYMENT_")) return "text-amber-600 dark:text-amber-400";
  if (type.startsWith("TAG_")) return "text-purple-500";
  return "text-muted";
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ nivel?: string; tipo?: string; p?: string }>;
}) {
  const { nivel, tipo, p } = await searchParams;
  const pagina = Math.max(1, Number(p ?? 1) || 1);

  const filtros: SQL[] = [];
  if (nivel === "error") filtros.push(eq(automationLogs.level, "error"));
  if (tipo) filtros.push(sql`${automationLogs.type} like ${`${tipo}%`}`);
  const where = filtros.length ? and(...filtros) : undefined;

  const [rows, [{ total }], familias] = await Promise.all([
    db
      .select()
      .from(automationLogs)
      .where(where)
      .orderBy(desc(automationLogs.createdAt))
      .limit(POR_PAGINA)
      .offset((pagina - 1) * POR_PAGINA),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(automationLogs)
      .where(where),
    // prefixo do evento (FLOW, AI, MESSAGE...) com a contagem de cada
    db
      .select({
        familia: sql<string>`split_part(${automationLogs.type}, '_', 1)`,
        n: sql<number>`count(*)::int`,
      })
      .from(automationLogs)
      .groupBy(sql`split_part(${automationLogs.type}, '_', 1)`)
      .orderBy(desc(sql`count(*)`)),
  ]);

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const atual = { nivel, tipo, p: String(pagina), ...patch };
    for (const [k, v] of Object.entries(atual)) if (v && v !== "1") q.set(k, v);
    return `/logs${q.toString() ? `?${q}` : ""}`;
  };

  return (
    <div className="p-8">
      <PageHeader
        icon={ScrollText}
        title="Logs"
        subtitle={`${total} evento(s) registrados.`}
        breadcrumb={[{ label: "Logs" }]}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip href={link({ tipo: undefined, p: "1" })} ativo={!tipo}>
          Todos
        </Chip>
        {familias.map((f) => (
          <Chip
            key={f.familia}
            href={link({ tipo: f.familia, p: "1" })}
            ativo={tipo === f.familia}
          >
            {f.familia} <span className="opacity-60">{f.n}</span>
          </Chip>
        ))}
        <span className="mx-1 w-px bg-border" />
        <Chip
          href={link({ nivel: nivel === "error" ? undefined : "error", p: "1" })}
          ativo={nivel === "error"}
          perigo
        >
          Somente erros
        </Chip>
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          Nenhum evento com esse filtro.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Hora</th>
                <th className="px-4 py-2 font-medium">Evento</th>
                <th className="px-4 py-2 font-medium">No</th>
                <th className="px-4 py-2 font-medium">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((l) => (
                <tr key={l.id} className={l.level === "error" ? "bg-red-500/5" : undefined}>
                  <td className="whitespace-nowrap px-4 py-1.5 font-mono text-muted">
                    {new Date(l.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-1.5 font-mono font-medium ${corDoEvento(l.type, l.level)}`}
                  >
                    {l.type}
                  </td>
                  <td className="whitespace-nowrap px-4 py-1.5 font-mono text-muted">
                    {l.nodeKey ?? "—"}
                  </td>
                  <td className="px-4 py-1.5 text-muted">{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <span>
            Pagina {pagina} de {paginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={link({ p: String(pagina - 1) })} className="btn">
                Anterior
              </Link>
            )}
            {pagina < paginas && (
              <Link href={link({ p: String(pagina + 1) })} className="btn">
                Proxima
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  href,
  ativo,
  perigo,
  children,
}: {
  href: string;
  ativo: boolean;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        ativo
          ? perigo
            ? "border-red-500 bg-red-500 text-white"
            : "border-[var(--brand)] bg-[var(--brand)] text-white"
          : "border-border text-muted hover:text-fg"
      }`}
    >
      {children}
    </Link>
  );
}
