import Link from "next/link";
import { Radio, ShieldAlert } from "lucide-react";

interface Props {
  connected: boolean;
  activeFlows: { id: string; name: string }[];
  /** Fluxo ativo que ainda tem chave PIX de exemplo. */
  placeholderPix: boolean;
}

/**
 * Aviso de que o bot esta respondendo gente de verdade.
 *
 * Existe porque e facil esquecer: um fluxo ativo + WhatsApp conectado significa
 * que qualquer pessoa que mandar mensagem para o numero recebe a automacao,
 * inclusive cobranca. Sem este aviso a tela parece so um painel local.
 */
export function LiveBanner({ connected, activeFlows, placeholderPix }: Props) {
  if (!connected || activeFlows.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
        <Radio size={18} className="mt-0.5 shrink-0 animate-pulse text-emerald-500" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            No ar — respondendo automaticamente
          </p>
          <p className="mt-0.5 text-muted">
            Qualquer pessoa que mandar mensagem para o numero conectado recebe{" "}
            {activeFlows.length === 1 ? "o fluxo" : "um dos fluxos"}{" "}
            {activeFlows.map((f, i) => (
              <span key={f.id}>
                {i > 0 && ", "}
                <Link href={`/flows/${f.id}`} className="underline underline-offset-2">
                  {f.name}
                </Link>
              </span>
            ))}
            . Para parar, pause o fluxo.
          </p>
        </div>
      </div>

      {placeholderPix && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Chave PIX de exemplo em fluxo ativo
            </p>
            <p className="mt-0.5 text-muted">
              O bloco Botao PIX ainda esta com o texto de exemplo. Quem chegar nessa etapa vai
              receber uma cobranca invalida — edite o bloco antes de deixar no ar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
