import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { whatsappConnections } from "@/db/schema";
import {
  getProvider,
  regenerateQr,
  startConnection,
  stopConnection,
} from "@/lib/whatsapp/registry";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { action, phone, message } = await req.json();

  try {
    if (action === "test") {
      return await testNumber(id, phone, message);
    }
    if (action === "regenerate") {
      await regenerateQr(id);
    } else if (action === "connect") {
      await startConnection(id);
    } else if (action === "disconnect") {
      await stopConnection(id);
      await db
        .update(whatsappConnections)
        .set({ status: "disconnected", qrCode: null, updatedAt: new Date() })
        .where(eq(whatsappConnections.id, id));
    } else {
      return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(whatsappConnections)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(whatsappConnections.id, id));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Verifica um numero e opcionalmente manda uma mensagem de teste.
 *
 * Serve para confirmar que a conexao esta realmente funcionando — conectado no
 * status nao garante que o envio passa.
 */
async function testNumber(connectionId: string, phone: unknown, message: unknown) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) {
    return NextResponse.json(
      { error: "Numero invalido. Use DDI + DDD + numero, ex: 5511999999999." },
      { status: 400 },
    );
  }

  const provider = getProvider(connectionId);
  if (!provider || provider.status() !== "connected") {
    return NextResponse.json(
      { error: "Esta conexao nao esta conectada. Conecte pelo QR primeiro." },
      { status: 400 },
    );
  }

  const check = await provider.checkNumber(digits);
  if (!check.exists) {
    return NextResponse.json({
      ok: false,
      exists: false,
      phone: digits,
      message: "Este numero nao esta registrado no WhatsApp.",
    });
  }

  const body = String(message ?? "").trim() || "Teste do ZapAI — conexao funcionando.";
  const sent = await provider.sendText(digits, body);

  return NextResponse.json({
    ok: true,
    exists: true,
    phone: digits,
    jid: check.jid,
    externalId: sent.externalId,
    message: "Numero valido e mensagem enviada.",
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await stopConnection(id).catch(() => {});
  await db.delete(whatsappConnections).where(eq(whatsappConnections.id, id));
  return NextResponse.json({ ok: true });
}
