import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { LiveBanner } from "@/components/live-banner";
import {
  automationLogs,
  contacts,
  conversations,
  messages,
  payments,
  whatsappConnections,
  flows,
  flowNodes,
} from "@/db/schema";

export const dynamic = "force-dynamic";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function DashboardPage() {
  const today = startOfToday();

  const [
    convsToday,
    convsOpen,
    leadsNew,
    msgsIn,
    msgsOut,
    sales,
    connections,
    recentLogs,
    recentConvs,
    activeFlows,
  ] = await Promise.all([
    db.select({ n: count() }).from(conversations).where(gte(conversations.createdAt, today)),
    db
      .select({ n: count() })
      .from(conversations)
      .where(sql`${conversations.status} <> 'resolvido'`),
    db.select({ n: count() }).from(contacts).where(gte(contacts.createdAt, today)),
    db
      .select({ n: count() })
      .from(messages)
      .where(and(eq(messages.direction, "in"), gte(messages.createdAt, today))),
    db
      .select({ n: count() })
      .from(messages)
      .where(and(eq(messages.direction, "out"), gte(messages.createdAt, today))),
    db.select({ n: count() }).from(payments).where(eq(payments.status, "paid")),
    db.select().from(whatsappConnections),
    db.select().from(automationLogs).orderBy(desc(automationLogs.createdAt)).limit(8),
    db
      .select({
        id: conversations.id,
        preview: conversations.lastMessagePreview,
        at: conversations.lastMessageAt,
        status: conversations.status,
        name: contacts.name,
        phone: contacts.phone,
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(6),
    db
      .select({ id: flows.id, name: flows.name })
      .from(flows)
      .where(and(eq(flows.active, true), eq(flows.archived, false))),
  ]);

  // procura o texto de exemplo da chave PIX nos fluxos que estao no ar
  const pixNodes = activeFlows.length
    ? await db
        .select({ config: flowNodes.config })
        .from(flowNodes)
        .where(
          and(
            eq(flowNodes.type, "pix"),
            inArray(
              flowNodes.flowId,
              activeFlows.map((f) => f.id),
            ),
          ),
        )
    : [];
  const placeholderPix = pixNodes.some((n) =>
    String((n.config as { key?: string }).key ?? "").includes("COLOQUE-SUA-CHAVE"),
  );

  const totalConvs = convsToday[0].n;
  const paid = sales[0].n;
  const conversion = totalConvs > 0 ? ((paid / totalConvs) * 100).toFixed(1) : "0.0";
  const connected = connections.filter((c) => c.status === "connected").length;

  const metrics = [
    { label: "Conversas hoje", value: totalConvs },
    { label: "Conversas abertas", value: convsOpen[0].n },
    { label: "Leads novos", value: leadsNew[0].n },
    { label: "Mensagens recebidas", value: msgsIn[0].n },
    { label: "Mensagens enviadas", value: msgsOut[0].n },
    { label: "Vendas", value: paid },
    { label: "Taxa de conversao", value: `${conversion}%` },
    { label: "Conexoes ativas", value: `${connected}/${connections.length}` },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Inicio</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Visao geral do seu WhatsApp automatizado.</p>

      <LiveBanner
        connected={connected > 0}
        activeFlows={activeFlows}
        placeholderPix={placeholderPix}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="card p-4">
            <p className="text-xs text-muted">{m.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Status</h2>
          <ul className="mt-3 space-y-3 text-sm">
            <StatusRow
              label="WhatsApp"
              ok={connected > 0}
              text={connected > 0 ? "Conectado" : "Desconectado"}
            />
            <StatusRow
              label="IA"
              ok={Boolean(
                process.env.OPENAI_API_KEY ||
                  process.env.ANTHROPIC_API_KEY ||
                  process.env.GOOGLE_API_KEY,
              )}
              text={
                process.env.OPENAI_API_KEY ||
                process.env.ANTHROPIC_API_KEY ||
                process.env.GOOGLE_API_KEY
                  ? "Online"
                  : "Sem chave"
              }
            />
            <StatusRow label="Automacao" ok text="Ativa" />
          </ul>
          {connected === 0 && (
            <Link href="/connections" className="btn-primary mt-4 w-full justify-center">
              Conectar WhatsApp
            </Link>
          )}
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Ultimas conversas</h2>
          {recentConvs.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhuma conversa ainda.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {recentConvs.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    <b className="font-medium">{c.name ?? c.phone}</b>
                    <span className="ml-2 text-muted">{c.preview}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Atividade recente</h2>
          <Link href="/logs" className="text-xs text-[var(--brand)]">
            ver todos
          </Link>
        </div>
        {recentLogs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Sem execucoes registradas.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 font-mono text-xs">
            {recentLogs.map((l) => (
              <li key={l.id} className="flex gap-3">
                <span className="text-muted">
                  {new Date(l.createdAt).toLocaleTimeString("pt-BR")}
                </span>
                <span className={l.level === "error" ? "text-red-500" : "text-[var(--brand)]"}>
                  {l.type}
                </span>
                <span className="truncate text-muted">{l.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusRow({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-slate-400"}`}
          aria-hidden
        />
        {text}
      </span>
    </li>
  );
}
