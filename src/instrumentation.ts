/**
 * Boot do servidor. O Next chama register() uma vez por processo.
 *
 * Aqui reconectamos as conexoes de WhatsApp que estavam ligadas e ligamos o
 * scheduler — sem isso um restart do servidor deixaria os fluxos parados.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();

  try {
    const { db } = await import("@/db");
    const { whatsappConnections } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    const { startConnection } = await import("@/lib/whatsapp/registry");

    const rows = await db
      .select()
      .from(whatsappConnections)
      .where(inArray(whatsappConnections.status, ["connected", "connecting", "qr"]));

    for (const row of rows) {
      startConnection(row.id).catch((err) =>
        console.error(`[boot] falha ao reconectar ${row.name}:`, err.message),
      );
    }
    if (rows.length) console.log(`[boot] reconectando ${rows.length} conexao(oes)`);
  } catch (err) {
    // banco ainda subindo: nao impede o app de servir
    console.error("[boot] reconexao adiada:", err instanceof Error ? err.message : err);
  }
}
