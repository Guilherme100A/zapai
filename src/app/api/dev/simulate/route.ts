import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { whatsappConnections } from "@/db/schema";
import { ingestIncoming } from "@/lib/inbox/ingest";

export const dynamic = "force-dynamic";

/**
 * Injeta uma mensagem como se tivesse chegado pelo WhatsApp.
 *
 * Existe porque nao da para testar o fluxo mandando mensagem para o proprio
 * numero: o WhatsApp marca essas com fromMe e o provider as descarta. Aqui
 * simulamos so a ENTRADA — o resto (motor, IA, envio) e real e as respostas
 * chegam de verdade no aparelho.
 *
 * Ferramenta de desenvolvimento: fica fora do ar quando NODE_ENV=production.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "indisponivel em producao" }, { status: 404 });
  }

  const { phone, text, name } = await req.json();
  const digits = String(phone ?? "").replace(/\D/g, "");

  if (digits.length < 10 || !String(text ?? "").trim()) {
    return NextResponse.json({ error: "informe phone e text" }, { status: 400 });
  }

  const [connection] = await db
    .select()
    .from(whatsappConnections)
    .orderBy(desc(whatsappConnections.createdAt));
  if (!connection) {
    return NextResponse.json({ error: "nenhuma conexao cadastrada" }, { status: 400 });
  }

  await ingestIncoming(connection.id, {
    externalId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from: digits,
    fromJid: `${digits}@s.whatsapp.net`,
    pushName: name ?? "Teste",
    type: "text",
    body: String(text),
    timestamp: new Date(),
  });

  return NextResponse.json({ ok: true, from: digits, text });
}
