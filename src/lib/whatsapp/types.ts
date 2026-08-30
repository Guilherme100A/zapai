/**
 * Camada de provider de WhatsApp (spec 2).
 *
 * O resto do sistema so conhece esta interface. Trocar Baileys pela Cloud API
 * oficial nao deve exigir mudanca em nenhum node do motor de automacao.
 */

export type ConnectionStatus = "disconnected" | "connecting" | "qr" | "connected" | "error";

export interface IncomingMessage {
  /** id da mensagem no provider — usado para dedupe, quote e reacao. */
  externalId: string;
  /** Telefone E164 sem "+" — ou o LID, quando o WhatsApp nao expoe o numero. */
  from: string;
  /**
   * JID completo do remetente (ex: "5511...@s.whatsapp.net" ou "369...@lid").
   * Guardar isto e o que permite responder a contatos que so tem LID.
   */
  fromJid: string;
  pushName?: string;
  type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "contact" | "location" | "unknown";
  body?: string;
  mediaUrl?: string;
  mimeType?: string;
  quotedMessageId?: string;
  timestamp: Date;
  /**
   * Mensagem que voce mandou para si mesmo ("Mensagem para mim"). Serve como
   * canal de recados: e capturada, mas NUNCA dispara automacao — senao o bot
   * responderia a si proprio em loop infinito.
   */
  selfNote?: boolean;
  raw?: unknown;
}

export interface SendTextOptions {
  /** Segundos "digitando" antes de enviar (bloco Mensagem, 3-60s). */
  typingDelaySeconds?: number;
  /** Responder citando uma mensagem do lead. */
  quoteMessageId?: string;
}

export interface SendMediaOptions extends SendTextOptions {
  caption?: string;
  fileName?: string;
  mimeType?: string;
}

export interface SendResult {
  externalId: string;
}

export interface WhatsAppProvider {
  readonly id: string;
  readonly kind: "baileys" | "cloud_api";

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status(): ConnectionStatus;
  /** Data URL do QR enquanto status === "qr". */
  qr(): string | null;
  phoneNumber(): string | null;

  /**
   * Confere se um numero esta registrado no WhatsApp antes de tentar enviar.
   * Evita disparar para numero inexistente e queimar a sessao.
   */
  checkNumber(phone: string): Promise<{ exists: boolean; jid: string | null }>;

  sendText(to: string, body: string, opts?: SendTextOptions): Promise<SendResult>;
  sendMedia(
    to: string,
    kind: "image" | "video" | "audio" | "document",
    url: string,
    opts?: SendMediaOptions,
  ): Promise<SendResult>;
  /** Reagir a uma mensagem do lead (toggle do Aguarda Resposta). */
  react(to: string, messageId: string, emoji: string): Promise<void>;

  onMessage(handler: (msg: IncomingMessage) => void): () => void;
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void;
}
