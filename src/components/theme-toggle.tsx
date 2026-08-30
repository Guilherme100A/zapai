"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Tema = "light" | "dark" | "system";

const OPCOES: { valor: Tema; icone: typeof Sun; titulo: string }[] = [
  { valor: "light", icone: Sun, titulo: "Claro" },
  { valor: "dark", icone: Moon, titulo: "Escuro" },
  { valor: "system", icone: Monitor, titulo: "Sistema" },
];

/**
 * Seletor de tema. "system" remove o atributo e deixa o CSS decidir pelo
 * prefers-color-scheme; as outras opcoes fixam data-theme na raiz.
 */
export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>("system");

  // le a preferencia salva depois da hidratacao, para nao divergir do servidor
  useEffect(() => {
    try {
      const salvo = localStorage.getItem("zapai-tema") as Tema | null;
      if (salvo) aplicar(salvo, setTema);
    } catch {
      // navegador com storage bloqueado: fica no padrao do sistema
    }
  }, []);

  return (
    <div className="flex gap-1 rounded-lg border border-border p-1">
      {OPCOES.map(({ valor, icone: Icone, titulo }) => (
        <button
          key={valor}
          onClick={() => aplicar(valor, setTema)}
          title={titulo}
          aria-label={`Tema ${titulo}`}
          aria-pressed={tema === valor}
          className={`grid flex-1 place-items-center rounded-md py-1.5 transition ${
            tema === valor
              ? "bg-[var(--brand)]/12 text-[var(--brand)]"
              : "text-muted hover:text-fg"
          }`}
        >
          <Icone size={14} />
        </button>
      ))}
    </div>
  );
}

function aplicar(valor: Tema, setTema: (t: Tema) => void) {
  setTema(valor);
  const raiz = document.documentElement;
  if (valor === "system") raiz.removeAttribute("data-theme");
  else raiz.setAttribute("data-theme", valor);
  try {
    localStorage.setItem("zapai-tema", valor);
  } catch {
    /* sem storage: a escolha vale so nesta aba */
  }
}
