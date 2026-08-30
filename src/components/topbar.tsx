"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Radio } from "lucide-react";

interface Connection {
  name: string;
  status: string;
  phoneNumber: string | null;
}

/**
 * Barra superior, no formato do Leona: logo a esquerda e, a direita, sino de
 * avisos + bloco da conta.
 *
 * No lugar de "empresa / leads" — que la e multi-tenant e aqui a spec 28 tira
 * do escopo — mostramos o que importa neste produto: se o WhatsApp esta no ar
 * e por qual numero.
 */
export function TopBar() {
  const [conn, setConn] = useState<Connection | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/connections");
        const list: Connection[] = await res.json();
        if (alive) setConn(list[0] ?? null);
      } catch {
        /* offline: mantem o ultimo estado conhecido */
      }
    };
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const online = conn?.status === "connected";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <Link href="/" className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">
          Z
        </span>
        <span className="text-[17px] font-semibold tracking-tight">ZapAI</span>
      </Link>

      <div className="flex-1" />

      <Link
        href="/logs"
        title="Logs"
        className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand)] text-white transition hover:opacity-90"
      >
        <Bell size={16} />
      </Link>

      <Link
        href="/connections"
        className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-1.5 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
      >
        <span
          className={`grid h-8 w-8 place-items-center rounded-full ${
            online ? "bg-[var(--ok)]/15 text-[var(--ok)]" : "bg-slate-500/15 text-muted"
          }`}
        >
          <Radio size={15} className={online ? "animate-pulse" : undefined} />
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[13px] font-semibold">
            {conn?.name ?? "Sem conexao"}
          </span>
          <span className="block text-[11px] text-muted">
            {online ? conn?.phoneNumber ?? "conectado" : "desconectado"}
          </span>
        </span>
      </Link>
    </header>
  );
}
