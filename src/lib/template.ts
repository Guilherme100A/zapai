/**
 * Motor de variaveis {{...}}.
 *
 * Regra aprendida dos videos (V1 @02:30): para LER um campo usa-se chaves
 * ({{lead.message}}); para ESCREVER (campo de destino do Aguarda Resposta,
 * saida do bloco de IA) usa-se o nome puro, sem chaves.
 */

export type VarScope = Record<string, unknown>;

export interface TemplateContext {
  /** Dados do contato: lead.nome, lead.telefone e campos customizados. */
  lead?: VarScope;
  /** Saida do bloco de IA. Em condicional recebe a chave literal da saida. */
  ai?: VarScope;
  /** Dados extraidos de comprovante de pagamento. */
  comprovante?: VarScope;
  /** Resposta de HTTP Request. */
  response?: VarScope;
  /** Variaveis soltas da execucao (campos salvos pelo Aguarda Resposta). */
  [key: string]: unknown;
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_.\[\]-]+)\s*\}\}/g;

/** Le um caminho tipo "lead.nome" ou "comprovante.valor" do contexto. */
export function getPath(ctx: TemplateContext, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc == null) return undefined;
    if (typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, ctx);
}

/**
 * Substitui {{var}} pelo valor. Token sem valor vira string vazia — nunca
 * "undefined" no meio de uma mensagem enviada ao lead.
 */
export function render(template: string | null | undefined, ctx: TemplateContext): string {
  if (!template) return "";
  return template.replace(TOKEN, (_match, path: string) => {
    const value = getPath(ctx, path);
    if (value == null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

/** Aplica render recursivamente em todas as strings de um objeto de config. */
export function renderDeep<T>(value: T, ctx: TemplateContext): T {
  if (typeof value === "string") return render(value, ctx) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => renderDeep(v, ctx)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = renderDeep(v, ctx);
    return out as T;
  }
  return value;
}

/** Nomes de variavel citados num template — usado para validar fluxos. */
export function extractVars(template: string | null | undefined): string[] {
  if (!template) return [];
  return [...template.matchAll(TOKEN)].map((m) => m[1]);
}

/**
 * Grava num caminho do contexto. O nome vem sem chaves; se o usuario colar
 * "{{resposta}}" por engano, limpamos — foi o erro mostrado no video V1.
 */
export function setPath(ctx: TemplateContext, path: string, value: unknown): void {
  const clean = path.replace(/[{}]/g, "").trim();
  if (!clean) return;
  const parts = clean.split(".");
  let cursor = ctx as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    if (typeof cursor[part] !== "object" || cursor[part] === null) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}
