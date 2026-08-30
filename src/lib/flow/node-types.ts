import type { AIProviderId } from "@/lib/ai/types";

/**
 * Catalogo de blocos. Espelha a paleta observada nos videos
 * (docs/video-analysis.md 3).
 */
export type NodeType =
  | "start"
  | "message"
  | "await_reply"
  | "ai"
  | "tags"
  | "condition"
  | "delay"
  | "notification"
  | "http_request"
  | "pix"
  | "sale"
  | "flow_link"
  | "transfer_human"
  | "end";

export interface NodeMeta {
  type: NodeType;
  label: string;
  description: string;
  /** Cor do header do no no canvas. */
  color: string;
  category: "gatilho" | "mensagem" | "logica" | "ia" | "crm" | "integracao" | "controle";
  /** Saidas fixas. Blocos com saidas dinamicas (ai) devolvem [] aqui. */
  outputs: { key: string; label: string }[];
}

export const NODE_CATALOG: NodeMeta[] = [
  {
    type: "start",
    label: "Inicio",
    description: "Dispara o fluxo quando uma mensagem chega ou por palavra-chave",
    color: "#16a34a",
    category: "gatilho",
    outputs: [{ key: "next", label: "" }],
  },
  {
    type: "message",
    label: "Mensagem",
    description: "Envia texto, imagem, video, audio, documento ou intervalo",
    color: "#2563eb",
    category: "mensagem",
    outputs: [{ key: "next", label: "" }],
  },
  {
    type: "await_reply",
    label: "Aguarda Resposta",
    description: "Espera a resposta do lead, com buffer e timeout",
    color: "#ea580c",
    category: "controle",
    outputs: [
      { key: "replied", label: "Respondeu" },
      { key: "timeout", label: "Nao respondeu" },
    ],
  },
  {
    type: "ai",
    label: "Bloco de IA",
    description: "Classifica a resposta em condicionais inteligentes ou gera texto",
    color: "#059669",
    category: "ia",
    outputs: [], // dinamicas: comprovante + condicionais + fallback + erro
  },
  {
    type: "tags",
    label: "Etiquetas",
    description: "Adiciona ou remove etiquetas do contato",
    color: "#7c3aed",
    category: "crm",
    outputs: [{ key: "next", label: "" }],
  },
  {
    type: "condition",
    label: "Condicional",
    description: "Ramifica por etiqueta, campo, horario ou status de atendimento",
    color: "#0891b2",
    category: "logica",
    outputs: [
      { key: "true", label: "Verdadeiro" },
      { key: "false", label: "Falso" },
    ],
  },
  {
    type: "delay",
    label: "Intervalo",
    description: "Espera um tempo antes de seguir",
    color: "#64748b",
    category: "controle",
    outputs: [{ key: "next", label: "" }],
  },
  {
    type: "notification",
    label: "Notificacao",
    description: "Avisa um numero proprio (usado na saida de erro da IA)",
    color: "#d97706",
    category: "integracao",
    outputs: [{ key: "next", label: "" }],
  },
  {
    type: "http_request",
    label: "HTTP Request",
    description: "Chama uma API externa e guarda o resultado em response.*",
    color: "#4f46e5",
    category: "integracao",
    outputs: [
      { key: "success", label: "Sucesso" },
      { key: "error", label: "Erro" },
    ],
  },
  {
    type: "pix",
    label: "Botao PIX",
    description: "Envia a chave PIX para o lead pagar",
    color: "#0d9488",
    category: "integracao",
    outputs: [{ key: "next", label: "" }],
  },
  {
    type: "sale",
    label: "Venda Aprovada",
    description: "Registra o pedido pago e valida o valor",
    color: "#65a30d",
    category: "crm",
    outputs: [{ key: "next", label: "" }],
  },
  {
    type: "flow_link",
    label: "Conexao de Fluxo",
    description: "Continua a execucao em outro fluxo",
    color: "#9333ea",
    category: "controle",
    outputs: [],
  },
  {
    type: "transfer_human",
    label: "Transferir para Humano",
    description: "Pausa a automacao e marca a conversa como Atendendo",
    color: "#db2777",
    category: "controle",
    outputs: [{ key: "next", label: "" }],
  },
  {
    type: "end",
    label: "Encerrar",
    description: "Termina a execucao do fluxo",
    color: "#475569",
    category: "controle",
    outputs: [],
  },
];

export const NODE_BY_TYPE = new Map(NODE_CATALOG.map((n) => [n.type, n]));

/* ------------------------------------------------------------- configs --- */

export interface MessageItem {
  kind: "text" | "image" | "video" | "audio" | "document" | "delay";
  /** Texto (com {{variaveis}}) ou URL da midia. */
  value: string;
  caption?: string;
  fileName?: string;
  /** Segundos "digitando" antes de enviar (slider 3-60s do Leona). */
  typingDelaySeconds?: number;
  /** Para kind = "delay": segundos de pausa entre itens. */
  seconds?: number;
}

export interface MessageConfig {
  items: MessageItem[];
}

export interface AwaitReplyConfig {
  /** Nunca expira — o lead sempre volta por "replied". */
  waitIndefinitely: boolean;
  timeoutValue: number;
  timeoutUnit: "minutes" | "hours" | "days";
  /** Agrupa mensagens picadas do lead numa variavel so. */
  bufferEnabled: boolean;
  bufferSeconds: number;
  /** Nome do campo onde salvar — SEM chaves (regra do video). */
  saveToField: string;
  quoteReply: boolean;
  reactEmoji?: string;
  /** Mensagem enviada antes de comecar a esperar. */
  messageBefore?: string;
}

export interface AISmartCondition {
  /** Ordem = prioridade. */
  priority: number;
  /** Prompt da condicao, max 100 chars (paridade com o Leona). */
  prompt: string;
  /** Chave da saida. Vira o valor literal de ai.response quando bate. */
  outputKey: string;
}

export interface AIConfig {
  provider: AIProviderId;
  apiKey?: string;
  model: string;
  temperature?: number;
  /** Prompt/comportamento usado no fallback para gerar resposta livre. */
  prompt: string;
  /** O que e enviado ao modelo, ex.: "{{resposta}}". */
  inputTemplate: string;
  /** Envia a resposta da IA direto ao lead sem passar por bloco Mensagem. */
  autoSend: boolean;
  understandAudio: boolean;
  understandImage: boolean;
  understandPdf: boolean;
  /** Vira uma saida no topo do bloco e preenche comprovante.*. */
  identifyReceipt: boolean;
  conditions: AISmartCondition[];
  /** Obrigatorio quando ha condicionais (erro visto no video V2 @01:38). */
  fallbackOutputKey: string;
  keepContext: boolean;
  contextTurns: number;
}

export interface TagsConfig {
  mode: "add" | "remove";
  tagIds: string[];
}

export type ConditionField =
  | { source: "tag"; tagId: string }
  | { source: "field"; key: string }
  | { source: "weekday" }
  | { source: "hour" }
  | { source: "date" }
  | { source: "conversation_status" };

export interface ConditionRule {
  field: ConditionField;
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "gt" | "lt";
  value: string;
}

export interface ConditionConfig {
  /** "all" = E, "any" = OU. */
  match: "all" | "any";
  rules: ConditionRule[];
}

export interface DelayConfig {
  value: number;
  unit: "seconds" | "minutes" | "hours" | "days";
}

export interface NotificationConfig {
  toPhone: string;
  message: string;
}

export interface HttpRequestConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: string;
  /** Onde guardar a resposta no contexto (default: "response"). */
  saveAs?: string;
}

export interface PixConfig {
  keyType: "random" | "cpf" | "cnpj" | "email" | "phone";
  key: string;
  recipient?: string;
  amount?: string;
  message?: string;
}

export interface SaleConfig {
  productName: string;
  price: string;
  minPrice?: string;
  /** Variavel com o valor pago, normalmente {{comprovante.valor}}. */
  amountField?: string;
  currency: string;
}

export interface FlowLinkConfig {
  targetFlowId: string;
}

export interface StartConfig {
  trigger: "message_received" | "keyword" | "new_contact" | "webhook";
  keywords?: string[];
}

export type NodeConfig =
  | StartConfig
  | MessageConfig
  | AwaitReplyConfig
  | AIConfig
  | TagsConfig
  | ConditionConfig
  | DelayConfig
  | NotificationConfig
  | HttpRequestConfig
  | PixConfig
  | SaleConfig
  | FlowLinkConfig
  | Record<string, never>;

/** Saidas efetivas de um no — o bloco de IA depende da config. */
export function outputsFor(type: NodeType, config: Record<string, unknown>): { key: string; label: string }[] {
  if (type !== "ai") return NODE_BY_TYPE.get(type)?.outputs ?? [];

  const c = config as unknown as AIConfig;
  const outputs: { key: string; label: string }[] = [];

  // ordem de avaliacao do Leona: comprovante primeiro, sempre no topo
  if (c.identifyReceipt) outputs.push({ key: "receipt", label: "Comprovante" });
  for (const cond of [...(c.conditions ?? [])].sort((a, b) => a.priority - b.priority)) {
    if (cond.outputKey) outputs.push({ key: cond.outputKey, label: cond.outputKey });
  }
  if (c.fallbackOutputKey) outputs.push({ key: c.fallbackOutputKey, label: `${c.fallbackOutputKey} (padrao)` });
  outputs.push({ key: "error", label: "Erro" });

  return outputs;
}

export const DEFAULT_CONFIGS: Record<NodeType, Record<string, unknown>> = {
  start: { trigger: "message_received", keywords: [] },
  message: { items: [{ kind: "text", value: "", typingDelaySeconds: 3 }] },
  await_reply: {
    waitIndefinitely: true,
    timeoutValue: 1,
    timeoutUnit: "hours",
    bufferEnabled: true,
    bufferSeconds: 15,
    saveToField: "resposta",
    quoteReply: false,
  },
  ai: {
    provider: "openai",
    model: "gpt-4o-mini",
    prompt: "",
    inputTemplate: "{{resposta}}",
    autoSend: false,
    understandAudio: false,
    understandImage: false,
    understandPdf: false,
    identifyReceipt: false,
    conditions: [],
    fallbackOutputKey: "padrao",
    keepContext: true,
    contextTurns: 5,
  },
  tags: { mode: "add", tagIds: [] },
  condition: { match: "all", rules: [] },
  delay: { value: 1, unit: "hours" },
  notification: { toPhone: "", message: "" },
  http_request: { method: "GET", url: "", headers: {}, saveAs: "response" },
  pix: { keyType: "random", key: "" },
  sale: { productName: "", price: "", currency: "BRL" },
  flow_link: { targetFlowId: "" },
  transfer_human: {},
  end: {},
};
