import { eq } from "drizzle-orm";
import { db } from "@/db";
import { whatsappConnections } from "@/db/schema";
import { emit } from "@/lib/events";
import { BaileysProvider } from "./baileys-provider";
import type { WhatsAppProvider } from "./types";
import { ingestIncoming } from "@/lib/inbox/ingest";

/**
 * Instancias vivas de provider, por conexao.
 *
 * Ficam no globalThis porque o Next recarrega modulos em dev — sem isso cada
 * edicao de arquivo abriria um socket novo com o WhatsApp e derrubaria a sessao.
 */
const globalForWa = globalThis as unknown as {
  __zapaiProviders?: Map<string, WhatsAppProvider>;
};

const providers = globalForWa.__zapaiProviders ?? new Map<string, WhatsAppProvider>();
globalForWa.__zapaiProviders = providers;

export function getProvider(connectionId: string): WhatsAppProvider | undefined {
  return providers.get(connectionId);
}

export function listProviders(): WhatsAppProvider[] {
  return [...providers.values()];
}

/** Primeira conexao conectada — usada quando o fluxo nao fixa uma conexao. */
export function defaultProvider(): WhatsAppProvider | undefined {
  return listProviders().find((p) => p.status() === "connected");
}

/**
 * Cria (se preciso) e conecta o provider de uma conexao, ligando os handlers
 * que persistem status e mensagens recebidas.
 */
export async function startConnection(connectionId: string): Promise<WhatsAppProvider> {
  let provider = providers.get(connectionId);

  if (!provider) {
    const [row] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, connectionId));
    if (!row) throw new Error(`Conexao ${connectionId} nao encontrada`);

    if (row.provider !== "baileys") {
      throw new Error(
        `Provider "${row.provider}" ainda nao implementado. Apenas "baileys" esta disponivel.`,
      );
    }

    provider = new BaileysProvider(connectionId);
    providers.set(connectionId, provider);

    provider.onStatusChange(async (status) => {
      await db
        .update(whatsappConnections)
        .set({
          status,
          qrCode: provider!.qr(),
          phoneNumber: provider!.phoneNumber(),
          lastSyncAt: status === "connected" ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(whatsappConnections.id, connectionId));

      await emit("CONNECTION_STATUS_CHANGED", { connectionId, status });
    });

    provider.onMessage(async (msg) => {
      try {
        await ingestIncoming(connectionId, msg);
      } catch (err) {
        console.error("[wa] falha ao processar mensagem recebida", err);
      }
    });
  }

  await provider.connect();
  return provider;
}

/**
 * Descarta o socket atual e reabre — gera um QR novo sem perder a linha do
 * banco. E o que o botao "Novo QR" chama quando o codigo vence.
 */
export async function regenerateQr(connectionId: string): Promise<void> {
  const provider = providers.get(connectionId);
  if (provider && provider instanceof BaileysProvider) {
    await provider.restart();
    return;
  }
  // provider ainda nao instanciado nesta sessao: basta subir
  await startConnection(connectionId);
}

export async function stopConnection(connectionId: string): Promise<void> {
  const provider = providers.get(connectionId);
  if (!provider) return;
  await provider.disconnect();
  providers.delete(connectionId);
}
