import { getAIProvider } from "@/lib/ai/providers";
import type { AIAttachment, AIMessage } from "@/lib/ai/types";
import type { AIConfig } from "./node-types";
import { classifyLocally } from "./local-classifier";

/**
 * Executa o bloco de IA.
 *
 * Semantica copiada do Leona (docs/video-analysis.md 3.3):
 *  - a ordem das condicionais e a prioridade; a primeira que bate ganha;
 *  - quando uma condicional bate, ai.response recebe a CHAVE LITERAL da saida
 *    (ex. "#positivo"), nao um texto gerado;
 *  - so no fallback a IA gera resposta livre usando o prompt/comportamento;
 *  - "identificar comprovante" e avaliado antes de tudo e vira saida propria.
 *
 * Tudo isso e resolvido em UMA chamada ao modelo: pedimos um JSON com a saida
 * escolhida, o texto (so quando cai no fallback) e os campos do comprovante.
 */

export interface AINodeInput {
  config: AIConfig;
  /** Texto ja renderizado ({{resposta}} resolvido). */
  userText: string;
  /** Historico recente para o contexto, do mais antigo ao mais novo. */
  history: AIMessage[];
  attachments?: AIAttachment[];
}

export interface AINodeResult {
  /** Chave da saida do bloco por onde o fluxo continua. */
  outputKey: string;
  /** Valor gravado em ai.response. */
  aiResponse: string;
  /** Campos comprovante.* quando o comprovante foi identificado. */
  receipt?: Record<string, unknown>;
  usage: { inputTokens: number; outputTokens: number };
}

const RECEIPT_FIELDS = [
  "valor",
  "chave_pix",
  "documento",
  "pagador",
  "recebedor",
  "nome_pagador",
  "nome_recebedor",
  "data",
  "banco",
  "moeda",
] as const;

export async function runAINode(input: AINodeInput): Promise<AINodeResult> {
  const { config, userText, history, attachments } = input;

  const conditions = [...(config.conditions ?? [])]
    .filter((c) => c.outputKey?.trim())
    .sort((a, b) => a.priority - b.priority);

  /**
   * Provedor local: resolve sem rede e sem chave. As saidas sao as mesmas de um
   * modelo real, entao o fluxo continua valido ao trocar para openai/gemini.
   */
  if (config.provider === "local") {
    const result = classifyLocally(userText, conditions, config.prompt ?? "");
    const usage = { inputTokens: 0, outputTokens: 0 };

    if (result.outputKey) {
      return { outputKey: result.outputKey, aiResponse: result.outputKey, usage };
    }
    return {
      outputKey: config.fallbackOutputKey?.trim() || "padrao",
      aiResponse: result.reply,
      usage,
    };
  }

  const provider = getAIProvider(config.provider, config.apiKey);
  const system = buildSystemPrompt(config, conditions);
  const schema = buildSchema(config, conditions);

  const contextMessages = config.keepContext
    ? history.slice(-Math.max(1, config.contextTurns ?? 5) * 2)
    : [];

  const completion = await provider.complete({
    model: config.model,
    system,
    temperature: config.temperature,
    messages: [...contextMessages, { role: "user", content: userText || "(sem texto)" }],
    attachments: filterAttachments(config, attachments),
    jsonSchema: schema,
  });

  const parsed = parseJson(completion.text);

  // comprovante tem precedencia sobre qualquer condicional
  if (config.identifyReceipt && parsed.is_receipt === true) {
    const receipt: Record<string, unknown> = {};
    for (const f of RECEIPT_FIELDS) {
      const v = (parsed.receipt as Record<string, unknown> | undefined)?.[f];
      if (v != null && v !== "") receipt[f] = v;
    }
    return {
      outputKey: "receipt",
      aiResponse: "receipt",
      receipt,
      usage: completion.usage,
    };
  }

  const chosen = typeof parsed.output === "string" ? parsed.output.trim() : "";
  const matched = conditions.find((c) => c.outputKey === chosen);

  if (matched) {
    // ai.response recebe a chave literal — nunca texto gerado
    return { outputKey: matched.outputKey, aiResponse: matched.outputKey, usage: completion.usage };
  }

  const fallbackKey = config.fallbackOutputKey?.trim() || "padrao";
  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";

  return {
    outputKey: fallbackKey,
    aiResponse: reply || completion.text.trim(),
    usage: completion.usage,
  };
}

function filterAttachments(
  config: AIConfig,
  attachments?: AIAttachment[],
): AIAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.filter((a) => {
    if (a.kind === "image") return config.understandImage || config.identifyReceipt;
    if (a.kind === "document") return config.understandPdf || config.identifyReceipt;
    return false;
  });
}

function buildSystemPrompt(
  config: AIConfig,
  conditions: { prompt: string; outputKey: string }[],
): string {
  const parts: string[] = [];

  parts.push(
    "Voce e o motor de decisao de um bloco de automacao de WhatsApp.",
    "Responda SEMPRE com um unico objeto JSON valido, sem markdown e sem texto fora do JSON.",
  );

  if (conditions.length) {
    parts.push(
      "",
      "Classifique a mensagem do cliente em UMA das condicoes abaixo.",
      "Elas estao em ordem de PRIORIDADE: use a primeira que se aplicar.",
      "",
      ...conditions.map((c, i) => `${i + 1}. saida "${c.outputKey}": ${c.prompt}`),
      "",
      'Se NENHUMA condicao se aplicar, devolva output = "" e escreva a resposta ao cliente em "reply".',
      'Se alguma se aplicar, devolva output com a chave exata da saida e deixe "reply" vazio.',
    );
  } else {
    parts.push("", 'Nao ha condicoes. Devolva output = "" e escreva a resposta em "reply".');
  }

  if (config.identifyReceipt) {
    parts.push(
      "",
      "COMPROVANTE: se a mensagem contiver um comprovante de pagamento (imagem ou PDF),",
      'defina is_receipt = true e preencha "receipt" com os campos que conseguir ler',
      `(${RECEIPT_FIELDS.join(", ")}). Deixe em branco os que nao conseguir ler.`,
      "Comprovante tem prioridade sobre qualquer condicao acima.",
    );
  }

  if (config.prompt?.trim()) {
    parts.push(
      "",
      "--- Comportamento para gerar a resposta em 'reply' ---",
      config.prompt.trim(),
    );
  }

  return parts.join("\n");
}

function buildSchema(
  config: AIConfig,
  conditions: { outputKey: string }[],
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    output: {
      type: "string",
      description: "Chave da saida escolhida, ou string vazia para o fallback.",
      enum: ["", ...conditions.map((c) => c.outputKey)],
    },
    reply: {
      type: "string",
      description: "Resposta ao cliente. Preencher apenas quando output for vazio.",
    },
  };
  const required = ["output", "reply"];

  if (config.identifyReceipt) {
    properties.is_receipt = { type: "boolean" };
    properties.receipt = {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(RECEIPT_FIELDS.map((f) => [f, { type: "string" }])),
      required: [...RECEIPT_FIELDS],
    };
    required.push("is_receipt", "receipt");
  }

  return { type: "object", additionalProperties: false, properties, required };
}

/** Modelos as vezes embrulham o JSON em cerca de markdown; toleramos isso. */
function parseJson(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* cai no retorno abaixo */
      }
    }
    // sem JSON: trata o texto inteiro como resposta livre do fallback
    return { output: "", reply: text.trim() };
  }
}
