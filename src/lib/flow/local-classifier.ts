import type { AISmartCondition } from "./node-types";

/**
 * Classificador local, sem chave de API.
 *
 * Nao substitui um modelo de verdade — nao entende ironia, contexto nem
 * negacao composta. Existe para deixar o fluxo inteiro testavel e utilizavel
 * antes de a chave chegar: as saidas do bloco de IA sao as mesmas, entao trocar
 * para openai/anthropic/gemini depois nao mexe no desenho do fluxo.
 *
 * Como decide: cada condicional vira um saco de palavras significativas do seu
 * proprio prompt; ganha a que tiver mais palavras presentes na mensagem do
 * lead. Empate resolve pela prioridade (ordem no bloco), igual ao Leona.
 */

/** Palavras que aparecem em qualquer frase e nao ajudam a distinguir intencao. */
const STOPWORDS = new Set([
  "o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "em", "no", "na",
  "para", "pra", "por", "com", "sem", "que", "se", "e", "ou", "ao", "aos", "the",
  "cliente", "lead", "pessoa", "usuario", "disse", "algo", "como", "tipo", "sobre",
  "demonstrou", "demonstrar", "falou", "mandou", "quando", "caso", "ele", "ela",
  "seu", "sua", "meu", "minha", "isso", "esse", "essa", "este", "esta",
]);
// "nao" NAO entra na lista acima de proposito: e ela que separa "quero" de
// "nao quero". Tratar como ruido fazia o lead que recusa cair no #positivo.

/** Remove acentos e pontuacao para comparar "preço" com "preco". */
function normalize(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      // gírias de WhatsApp que carregam negacao: "n quero", "nn quero"
      .replace(/\bn+\b/g, "nao")
  );
}

function keywords(text: string): string[] {
  return normalize(text)
    .split(" ")
    // 2 letras entram: "ok" e "so" decidem intencao e ficariam de fora com 3
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

export interface LocalClassification {
  /** Chave da saida escolhida, ou null quando nada bateu (vai pro fallback). */
  outputKey: string | null;
  /** Resposta gerada para o caso de fallback. */
  reply: string;
  /** Quantas palavras casaram — util para debug nos logs. */
  score: number;
}

export function classifyLocally(
  userText: string,
  conditions: AISmartCondition[],
  fallbackPrompt: string,
): LocalClassification {
  const haystack = ` ${normalize(userText)} `;

  let best: { key: string; score: number; priority: number } | null = null;

  for (const cond of [...conditions].sort((a, b) => a.priority - b.priority)) {
    if (!cond.outputKey?.trim()) continue;

    const words = keywords(cond.prompt ?? "");
    if (!words.length) continue;

    // conta palavra inteira, para "sim" nao casar dentro de "assim"
    const score = words.filter((w) => haystack.includes(` ${w} `)).length;
    if (score === 0) continue;

    // maior score vence; empate fica com a prioridade menor (mais alta)
    if (!best || score > best.score) {
      best = { key: cond.outputKey, score, priority: cond.priority };
    }
  }

  if (best) return { outputKey: best.key, reply: "", score: best.score };

  return { outputKey: null, reply: buildFallbackReply(fallbackPrompt), score: 0 };
}

/**
 * Sem modelo nao ha texto gerado. Devolvemos a primeira linha util do prompt de
 * comportamento, que costuma ser a apresentacao — melhor que mandar vazio.
 */
function buildFallbackReply(prompt: string): string {
  const line = (prompt ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 20 && !/^\d+[).]/.test(l));

  return (
    line ??
    "Nao consegui entender. Pode reformular? (classificador local — configure uma chave de IA para respostas geradas)"
  );
}
