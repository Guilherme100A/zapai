/**
 * Camada de abstracao de IA (spec 2).
 *
 * O bloco de IA do fluxo nunca fala com um SDK diretamente — so com esta
 * interface. Trocar de modelo/provedor e config, nao codigo.
 */

export type AIProviderId = "local" | "openai" | "anthropic" | "gemini";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIAttachment {
  kind: "image" | "document";
  /** base64 puro, sem o prefixo data:. */
  data: string;
  mimeType: string;
}

export interface AICompleteParams {
  model: string;
  system?: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Imagem/PDF do lead, quando os toggles de midia estao ligados. */
  attachments?: AIAttachment[];
  /** Quando definido, pede saida JSON valida conforme este schema. */
  jsonSchema?: Record<string, unknown>;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AICompletion {
  text: string;
  usage: AIUsage;
  model: string;
}

export interface AIProvider {
  readonly id: AIProviderId;
  complete(params: AICompleteParams): Promise<AICompletion>;
}

/** Modelos sugeridos por provedor no dropdown do bloco de IA. */
export const MODEL_OPTIONS: Record<AIProviderId, { id: string; label: string; vision: boolean }[]> = {
  local: [{ id: "keyword", label: "Classificador local (sem chave)", vision: false }],
  anthropic: [
    { id: "claude-opus-5", label: "Claude Opus 5", vision: true },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5", vision: true },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", vision: true },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o", vision: true },
    { id: "gpt-4o-mini", label: "GPT-4o mini", vision: true },
  ],
  gemini: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", vision: true },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", vision: true },
  ],
};
