import { Settings } from "lucide-react";
import { PageHeader } from "@/components/page-header";
export const dynamic = "force-dynamic";

function keyStatus(v?: string) {
  return v ? { ok: true, text: `configurada (...${v.slice(-4)})` } : { ok: false, text: "nao configurada" };
}

export default function SettingsPage() {
  const rows = [
    { label: "OpenAI", ...keyStatus(process.env.OPENAI_API_KEY) },
    { label: "Anthropic", ...keyStatus(process.env.ANTHROPIC_API_KEY) },
    { label: "Google Gemini", ...keyStatus(process.env.GOOGLE_API_KEY) },
  ];

  return (
    <div className="p-8">
      <PageHeader icon={Settings} title="Configuracoes" subtitle="Uso proprio, sem login — decisao de escopo da spec." breadcrumb={[{ label: "Configuracoes" }]} />

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Chaves de IA</h2>
        <p className="mt-1 text-xs text-muted">
          Editadas no arquivo <code>.env</code>. Cada bloco de IA pode sobrescrever a chave.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between">
              <span className="text-muted">{r.label}</span>
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${r.ok ? "bg-emerald-500" : "bg-slate-400"}`} />
                {r.text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-sm font-semibold">Sistema</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Provider de WhatsApp</dt>
            <dd>{process.env.WHATSAPP_PROVIDER ?? "baileys"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Timezone</dt>
            <dd>{process.env.TZ ?? "America/Sao_Paulo"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Banco</dt>
            <dd className="font-mono text-xs">localhost:55432/zapai</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
