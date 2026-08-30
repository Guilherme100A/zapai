import Link from "next/link";
import { ArrowLeft, ChevronRight, Home, type LucideIcon } from "lucide-react";

interface Props {
  /** Icone do titulo, dentro do quadrado colorido. */
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Trilha depois de "Inicio" — a ultima entrada e a pagina atual. */
  breadcrumb?: { label: string; href?: string }[];
  /** Destino do "Voltar"; omitido esconde o botao. */
  backHref?: string;
  children?: React.ReactNode;
}

/**
 * Cabecalho padrao das paginas, no formato do Leona:
 * "← Voltar | Inicio > Secao" e, abaixo, icone colorido + titulo.
 *
 * Manter o mesmo desenho faz o que a pessoa aprendeu la valer aqui.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  breadcrumb = [],
  backHref,
  children,
}: Props) {
  return (
    <div className="mb-6">
      <nav className="flex items-center gap-3 text-xs text-muted">
        {backHref && (
          <>
            <Link href={backHref} className="flex items-center gap-1 hover:text-fg">
              <ArrowLeft size={13} /> Voltar
            </Link>
            <span className="text-border">|</span>
          </>
        )}
        <Link href="/" className="flex items-center gap-1 hover:text-fg">
          <Home size={13} /> Inicio
        </Link>
        {breadcrumb.map((b, i) => (
          <span key={b.label} className="flex items-center gap-3">
            <ChevronRight size={13} className="text-border" />
            {b.href && i < breadcrumb.length - 1 ? (
              <Link href={b.href} className="hover:text-fg">
                {b.label}
              </Link>
            ) : (
              <span className="text-fg">{b.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="mt-4 flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)]/12 text-[var(--brand)]">
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
        {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
