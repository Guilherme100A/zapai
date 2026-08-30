"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  MessagesSquare,
  KanbanSquare,
  Workflow,
  Users,
  Tags,
  Webhook,
  Plug,
  ScrollText,
  Settings,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

/** Navegacao espelhando a sidebar do Leona, menos o que a spec 28 tira do escopo. */
const NAV = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/inbox", label: "Chats ao vivo", icon: MessagesSquare },
  { href: "/kanban", label: "Kanban", icon: KanbanSquare },
  { href: "/flows", label: "Fluxos", icon: Workflow },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/tags", label: "Etiquetas", icon: Tags },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/connections", label: "Conexoes", icon: Plug },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Configuracoes", icon: Settings },
];

const STORAGE_KEY = "zapai:sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // le a preferencia depois da hidratacao: no servidor nao existe localStorage
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* navegador sem storage: fica aberta */
    }
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <aside
      className={`sticky top-14 flex h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-border bg-surface transition-[width] ${
        collapsed ? "w-[60px]" : "w-56"
      }`}
    >
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 pt-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition ${
                collapsed ? "justify-center px-0" : ""
              } ${
                active
                  ? "bg-[var(--brand)]/10 font-semibold text-[var(--brand)]"
                  : "text-muted hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.05]"
              }`}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 p-2">
        {!collapsed && (
          <div className="px-1">
            <ThemeToggle />
          </div>
        )}
        {/* chevron de recolher, no mesmo canto do Leona */}
        <button
          onClick={toggle}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="flex w-full items-center justify-center rounded-lg py-2 text-muted transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.05]"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
