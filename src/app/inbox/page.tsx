"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, BotOff, MessagesSquare, Search, Send, UserCheck } from "lucide-react";

interface Conversation {
  id: string;
  status: "aguardando" | "atendendo" | "resolvido";
  aiEnabled: boolean;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  name: string | null;
  phone: string;
}

interface Message {
  id: string;
  direction: "in" | "out";
  author: string;
  type: string;
  body: string | null;
  createdAt: string;
}

const TABS = [
  { key: "aguardando", label: "Aguardando" },
  { key: "atendendo", label: "Atendendo" },
  { key: "resolvido", label: "Resolvidos" },
] as const;

export default function InboxPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("aguardando");
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busca, setBusca] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const active = convs.find((c) => c.id === activeId);

  // busca por nome ou por telefone; no telefone comparamos so os digitos, para
  // que "(31) 98505" encontre "5531985051..."
  const termo = busca.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, "");
  const visiveis = termo
    ? convs.filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(termo) ||
          (digitos.length > 0 && c.phone.includes(digitos)),
      )
    : convs;

  async function loadConvs() {
    const res = await fetch(`/api/conversations?status=${tab}`);
    setConvs(await res.json());
  }

  async function loadMessages(id: string) {
    const res = await fetch(`/api/conversations/${id}`);
    const data = await res.json();
    setMessages(data.messages ?? []);
  }

  useEffect(() => {
    void loadConvs();
    const t = setInterval(loadConvs, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!activeId) return;
    void loadMessages(activeId);
    const t = setInterval(() => void loadMessages(activeId), 3000);
    return () => clearInterval(t);
  }, [activeId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!draft.trim() || !activeId) return;
    setSending(true);
    await fetch(`/api/conversations/${activeId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "send", body: draft }),
    });
    setDraft("");
    setSending(false);
    void loadMessages(activeId);
  }

  async function patch(body: Record<string, unknown>) {
    if (!activeId) return;
    await fetch(`/api/conversations/${activeId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    void loadConvs();
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]">
              <MessagesSquare size={16} />
            </span>
            <h1 className="font-semibold">Chats ao vivo</h1>
          </div>

          <div className="relative mt-3">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted" />
            <input
              className="input pl-8"
              placeholder="Buscar conversa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="mt-2 flex gap-1">
            {TABS.map((t) => {
              const n = convs.filter((c) => c.status === t.key).length;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition ${
                    tab === t.key
                      ? "bg-[var(--brand)] text-white"
                      : "border border-border text-muted hover:text-fg"
                  }`}
                >
                  {t.label}
                  {tab === t.key && n > 0 && (
                    <span className="rounded-full bg-white/25 px-1.5 text-[10px]">{n}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visiveis.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              {busca ? "Nada encontrado." : "Nenhuma conversa aqui."}
            </p>
          ) : (
            visiveis.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition ${
                  activeId === c.id ? "bg-[var(--brand)]/10" : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand)]/15 text-xs font-semibold text-[var(--brand)]">
                  {(c.name ?? c.phone).slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate text-sm font-medium">{c.name ?? c.phone}</b>
                    {c.lastMessageAt && (
                      <span className="shrink-0 text-[10px] text-muted">
                        {new Date(c.lastMessageAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="truncate text-xs text-muted">{c.lastMessagePreview}</span>
                    {!c.aiEnabled && <BotOff size={12} className="shrink-0 text-amber-500" />}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!active ? (
          <div className="grid flex-1 place-items-center text-sm text-muted">
            Selecione uma conversa
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{active.name ?? active.phone}</p>
                <p className="text-xs text-muted">+{active.phone}</p>
              </div>
              <button
                className="btn"
                onClick={() => patch({ action: "toggle_ai", value: !active.aiEnabled })}
                title={active.aiEnabled ? "Desativar IA" : "Ativar IA"}
              >
                {active.aiEnabled ? <Bot size={15} /> : <BotOff size={15} />}
                IA {active.aiEnabled ? "on" : "off"}
              </button>
              <select
                className="input w-36"
                value={active.status}
                onChange={(e) => patch({ action: "status", value: e.target.value })}
              >
                <option value="aguardando">Aguardando</option>
                <option value="atendendo">Atendendo</option>
                <option value="resolvido">Resolvido</option>
              </select>
              <button
                className="btn"
                onClick={() => patch({ action: "transfer_human" })}
                title="Assumir o atendimento"
              >
                <UserCheck size={15} />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                      m.direction === "out"
                        ? "bg-[var(--brand)] text-white"
                        : "border border-border bg-surface"
                    }`}
                  >
                    {m.body || <i className="opacity-70">[{m.type}]</i>}
                    <div
                      className={`mt-1 text-[10px] ${
                        m.direction === "out" ? "text-white/70" : "text-muted"
                      }`}
                    >
                      {m.author} · {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </div>

            <footer className="flex gap-2 border-t border-border bg-surface px-5 py-3">
              <input
                className="input flex-1"
                placeholder="Digite uma mensagem..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              />
              <button className="btn-primary" onClick={send} disabled={sending}>
                <Send size={16} />
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
