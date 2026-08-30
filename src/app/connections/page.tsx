"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Plus, RefreshCw, Send, Trash2, XCircle, Plug } from "lucide-react";
import { PageHeader } from "@/components/page-header";

interface Connection {
  id: string;
  name: string;
  provider: string;
  phoneNumber: string | null;
  status: string;
  qrCode: string | null;
  lastSyncAt: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  disconnected: "Desconectado",
  connecting: "Conectando",
  qr: "Aguardando QR",
  connected: "Conectado",
  error: "Erro",
};

export default function ConnectionsPage() {
  const [items, setItems] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  async function load() {
    const res = await fetch("/api/connections");
    setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // enquanto ha QR na tela o status muda em segundos; poll curto resolve
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function create() {
    if (!name.trim()) return;
    await fetch("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    void load();
  }

  async function action(
    id: string,
    verb: "connect" | "disconnect" | "regenerate" | "delete",
  ) {
    await fetch(`/api/connections/${id}`, {
      method: verb === "delete" ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: verb === "delete" ? undefined : JSON.stringify({ action: verb }),
    });
    void load();
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Conexoes</h1>
      <p className="mt-1 text-sm text-muted">
        Conecte um numero via QR code (Baileys). A arquitetura ja aceita multiplas conexoes.
      </p>

      <div className="mt-6 flex gap-2">
        <input
          className="input max-w-xs"
          placeholder="Nome da conexao (ex: Vendas)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <button className="btn-primary" onClick={create}>
          <Plus size={16} /> Adicionar
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-muted">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-sm text-muted">Nenhuma conexao. Crie uma acima.</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-muted">
                    {c.phoneNumber ? `+${c.phoneNumber}` : "sem numero"}
                  </p>
                </div>
                <button
                  className="text-muted hover:text-red-500"
                  onClick={() => action(c.id, "delete")}
                  title="Remover"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <p className="mt-3 flex items-center gap-2 text-sm">
                <span
                  className={`h-2 w-2 rounded-full ${
                    c.status === "connected"
                      ? "bg-emerald-500"
                      : c.status === "qr" || c.status === "connecting"
                        ? "bg-amber-500"
                        : c.status === "error"
                          ? "bg-red-500"
                          : "bg-slate-400"
                  }`}
                />
                {STATUS_LABEL[c.status] ?? c.status}
              </p>

              {c.status === "qr" && c.qrCode && (
                <div className="mt-4">
                  <img
                    src={c.qrCode}
                    alt="QR code para conectar"
                    className="w-full max-w-[220px] rounded-lg bg-white p-2"
                  />
                  <p className="mt-2 text-xs text-muted">
                    WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho
                  </p>
                  <button
                    className="btn mt-2 w-full justify-center"
                    onClick={() => action(c.id, "regenerate")}
                  >
                    <RefreshCw size={14} /> Gerar novo QR
                  </button>
                </div>
              )}

              {c.status === "error" && (
                <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
                  <p className="text-xs text-red-500">
                    Falhou apos varias tentativas. Gere um QR novo para recomecar.
                  </p>
                  <button
                    className="btn mt-2 w-full justify-center"
                    onClick={() => action(c.id, "regenerate")}
                  >
                    <RefreshCw size={14} /> Gerar novo QR
                  </button>
                </div>
              )}

              {c.lastSyncAt && (
                <p className="mt-3 text-xs text-muted">
                  Sincronizado: {new Date(c.lastSyncAt).toLocaleString("pt-BR")}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                {c.status === "connected" ? (
                  <button className="btn flex-1 justify-center" onClick={() => action(c.id, "disconnect")}>
                    Desconectar
                  </button>
                ) : (
                  <button
                    className="btn-primary flex-1 justify-center"
                    onClick={() => action(c.id, "connect")}
                  >
                    <RefreshCw size={15} /> Conectar
                  </button>
                )}
              </div>

              <NumberTester connectionId={c.id} connected={c.status === "connected"} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TestResult {
  ok?: boolean;
  exists?: boolean;
  phone?: string;
  message?: string;
  error?: string;
}

/**
 * Verifica se um numero existe no WhatsApp e manda uma mensagem de teste.
 * Status "conectado" nao garante que o envio passa — este teste garante.
 */
function NumberTester({
  connectionId,
  connected,
}: {
  connectionId: string;
  connected: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function test() {
    if (!phone.trim() || !connected) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "test", phone, message }),
      });
      setResult(await res.json());
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Falha na requisicao" });
    }
    setBusy(false);
  }

  const good = result?.ok === true;
  const bad = Boolean(result?.error) || result?.exists === false;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-xs font-semibold">Testar numero</p>
      <p className="mt-0.5 text-[11px] text-muted">
        {connected
          ? "Confere se o numero existe no WhatsApp e envia uma mensagem."
          : "Conecte esta conexao pelo QR para liberar o teste."}
      </p>

      <input
        className="input mt-2 disabled:opacity-50"
        placeholder="5511999999999 (DDI + DDD + numero)"
        disabled={!connected}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && test()}
      />
      <input
        className="input mt-2 disabled:opacity-50"
        placeholder="Mensagem (opcional)"
        disabled={!connected}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && test()}
      />

      <button
        className="btn mt-2 w-full justify-center"
        onClick={test}
        disabled={busy || !connected}
      >
        <Send size={14} /> {busy ? "Testando..." : "Verificar e enviar"}
      </button>

      {result && (
        <p
          className={`mt-2 flex items-start gap-1.5 text-xs ${
            good ? "text-emerald-600 dark:text-emerald-400" : bad ? "text-red-500" : "text-muted"
          }`}
        >
          {good ? (
            <CheckCircle2 size={14} className="mt-px shrink-0" />
          ) : (
            <XCircle size={14} className="mt-px shrink-0" />
          )}
          <span>
            {result.error ?? result.message}
            {good && result.phone && (
              <span className="mt-0.5 block text-muted">
                Enviado para +{result.phone}. Confira no aparelho.
              </span>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
