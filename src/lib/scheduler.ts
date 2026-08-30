import { tickScheduler } from "@/lib/flow/engine";

/**
 * Scheduler in-process: acorda execucoes cujo timeout de Aguarda Resposta ou
 * Intervalo venceu. Um setInterval basta para uso proprio — nao ha segundo
 * processo para competir pelas linhas.
 *
 * Fica no globalThis para o hot reload do Next nao empilhar timers.
 */
const globalForScheduler = globalThis as unknown as {
  __zapaiScheduler?: ReturnType<typeof setInterval>;
};

const INTERVAL_MS = 15_000;

export function startScheduler(): void {
  if (globalForScheduler.__zapaiScheduler) return;

  globalForScheduler.__zapaiScheduler = setInterval(() => {
    void tickScheduler().catch((err) => console.error("[scheduler]", err));
  }, INTERVAL_MS);

  console.log(`[scheduler] ativo (a cada ${INTERVAL_MS / 1000}s)`);
}
