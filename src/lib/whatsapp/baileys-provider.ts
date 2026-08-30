import path from "node:path";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import QRCode from "qrcode";
import type {
  ConnectionStatus,
  IncomingMessage,
  SendMediaOptions,
  SendResult,
  SendTextOptions,
  WhatsAppProvider,
} from "./types";

/** Teto de retentativas automaticas antes de desistir e marcar erro. */
const MAX_RETRIES = 10;

/**
 * Provider nao-oficial via Baileys (WhatsApp Web protocol).
 *
 * Escolhido para uso proprio: conecta por QR code, sem custo e sem aprovacao da
 * Meta. Risco de ban existe — por isso a interface WhatsAppProvider, que
 * permite trocar pela Cloud API sem mexer no motor.
 *
 * Import dinamico: Baileys so pode carregar no runtime de Node, nunca no bundle
 * do cliente nem durante o build.
 */
export class BaileysProvider implements WhatsAppProvider {
  readonly kind = "baileys" as const;

  private sock: any = null;
  private _status: ConnectionStatus = "disconnected";
  private _qr: string | null = null;
  private _phone: string | null = null;
  private emitter = new EventEmitter();
  private closing = false;
  private retries = 0;
  /** Incrementa a cada socket novo; invalida eventos do socket anterior. */
  private generation = 0;

  constructor(
    readonly id: string,
    private sessionDir = process.env.WHATSAPP_SESSION_DIR ?? "./.wa-sessions",
  ) {
    this.emitter.setMaxListeners(50);
  }

  status(): ConnectionStatus {
    return this._status;
  }
  qr(): string | null {
    return this._qr;
  }
  phoneNumber(): string | null {
    return this._phone;
  }

  private setStatus(next: ConnectionStatus) {
    if (this._status === next) return;
    this._status = next;
    this.emitter.emit("status", next);
  }

  /** Invalida o socket atual: eventos atrasados dele passam a ser ignorados. */
  private discardSocket() {
    this.generation++;
    try {
      this.sock?.end(undefined);
    } catch {
      /* socket ja morto */
    }
    this.sock = null;
  }

  /** Reconecta do zero, descartando o socket atual. Usado pelo botao "Novo QR". */
  async restart(): Promise<void> {
    this.discardSocket();
    this._qr = null;
    this.retries = 0;
    this._status = "disconnected";
    await this.open(true);
  }

  async connect(): Promise<void> {
    return this.open(false);
  }

  private async open(force: boolean): Promise<void> {
    /**
     * `force` existe porque a reconexao automatica passa por aqui com o status
     * ja em "connecting" — sem ele o early-return abaixo matava a retentativa e
     * a conexao nunca voltava depois de uma queda.
     */
    if (!force && (this._status === "connected" || this._status === "connecting")) return;
    this.generation++;
    this.closing = false;
    this.setStatus("connecting");

    const baileys = await import("@whiskeysockets/baileys");
    const makeWASocket = baileys.default ?? (baileys as any).makeWASocket;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

    const dir = path.resolve(this.sessionDir, this.id);
    await fs.mkdir(dir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      // o QR e exposto via this.qr() e renderizado na pagina Conexoes
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      browser: ["ZapAI", "Chrome", "1.0.0"],
      // o padrao (60s) costuma vencer antes de a pessoa pegar o celular
      qrTimeout: 120_000,
      connectTimeoutMs: 60_000,
    });
    this.sock = sock;

    /**
     * Cada socket carrega a geracao em que nasceu. Quando trocamos de socket
     * (restart, reconexao), a geracao avanca e os eventos atrasados do socket
     * antigo passam a ser descartados aqui. Sem isso o close() do socket velho
     * agendava uma reconexao propria e nasciam varios sockets em paralelo,
     * deixando a conexao presa em "connecting" para sempre.
     */
    const myGeneration = this.generation;
    const isStale = () => myGeneration !== this.generation;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      if (isStale()) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this._qr = await QRCode.toDataURL(qr);
        /**
         * O WhatsApp emite um QR novo a cada ~20s. setStatus() ignora transicao
         * repetida, entao aqui notificamos na marra — senao a pagina continuaria
         * exibindo o primeiro QR, ja expirado e impossivel de ler.
         */
        this._status = "qr";
        this.emitter.emit("status", "qr");
      }

      if (connection === "open") {
        this.retries = 0;
        this._qr = null;
        this._phone = sock.user?.id?.split(":")[0] ?? null;
        this.setStatus("connected");
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;

        if (this.closing || loggedOut) {
          // sessao invalida: apaga as credenciais para o proximo connect() gerar QR novo
          if (loggedOut) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
          this.setStatus("disconnected");
          return;
        }

        /**
         * Queda de rede OU o QR venceu sem ser lido (o Baileys encerra o socket
         * quando esgota as tentativas). Nos dois casos reabrimos sozinhos: se
         * ainda nao ha credencial, isso gera um QR novo automaticamente.
         */
        this.retries++;
        if (this.retries > MAX_RETRIES) {
          this.setStatus("error");
          return;
        }
        this.discardSocket();
        this.setStatus("connecting");
        const delay = Math.min(3000 * this.retries, 15_000);
        setTimeout(() => {
          void this.open(true).catch(() => this.setStatus("error"));
        }, delay);
      }
    });

    sock.ev.on("messages.upsert", async (payload: any) => {
      if (isStale() || payload.type !== "notify") return;
      for (const raw of payload.messages ?? []) {
        const parsed = this.parseMessage(raw);
        if (parsed) this.emitter.emit("message", parsed);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    this.generation++;
    try {
      await this.sock?.logout();
    } catch {
      // logout falha se a sessao ja caiu; o end() abaixo resolve
    }
    try {
      this.sock?.end(undefined);
    } catch {
      /* ignore */
    }
    this.sock = null;
    this._qr = null;
    this.setStatus("disconnected");
  }

  private jid(to: string): string {
    return to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
  }

  private async typing(jid: string, seconds?: number) {
    if (!seconds || seconds <= 0) return;
    // teto de 60s espelha o slider do bloco Mensagem no Leona
    const ms = Math.min(seconds, 60) * 1000;
    await this.sock.sendPresenceUpdate("composing", jid);
    await new Promise((r) => setTimeout(r, ms));
    await this.sock.sendPresenceUpdate("paused", jid);
  }

  async checkNumber(phone: string): Promise<{ exists: boolean; jid: string | null }> {
    this.assertReady();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return { exists: false, jid: null };

    const [result] = await this.sock.onWhatsApp(`${digits}@s.whatsapp.net`);
    return { exists: Boolean(result?.exists), jid: result?.jid ?? null };
  }

  async sendText(to: string, body: string, opts: SendTextOptions = {}): Promise<SendResult> {
    this.assertReady();
    const jid = this.jid(to);
    await this.typing(jid, opts.typingDelaySeconds);
    const sent = await this.sock.sendMessage(
      jid,
      { text: body },
      opts.quoteMessageId ? { quoted: { key: { id: opts.quoteMessageId, remoteJid: jid } } } : {},
    );
    return { externalId: sent?.key?.id ?? "" };
  }

  async sendMedia(
    to: string,
    kind: "image" | "video" | "audio" | "document",
    url: string,
    opts: SendMediaOptions = {},
  ): Promise<SendResult> {
    this.assertReady();
    const jid = this.jid(to);
    await this.typing(jid, opts.typingDelaySeconds);

    const content: Record<string, unknown> =
      kind === "image"
        ? { image: { url }, caption: opts.caption }
        : kind === "video"
          ? { video: { url }, caption: opts.caption }
          : kind === "audio"
            ? { audio: { url }, mimetype: opts.mimeType ?? "audio/mp4", ptt: true }
            : {
                document: { url },
                fileName: opts.fileName ?? "arquivo",
                mimetype: opts.mimeType ?? "application/octet-stream",
              };

    const sent = await this.sock.sendMessage(jid, content);
    return { externalId: sent?.key?.id ?? "" };
  }

  async react(to: string, messageId: string, emoji: string): Promise<void> {
    this.assertReady();
    const jid = this.jid(to);
    await this.sock.sendMessage(jid, {
      react: { text: emoji, key: { id: messageId, remoteJid: jid, fromMe: false } },
    });
  }

  onMessage(handler: (msg: IncomingMessage) => void): () => void {
    this.emitter.on("message", handler);
    return () => this.emitter.off("message", handler);
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.emitter.on("status", handler);
    return () => this.emitter.off("status", handler);
  }

  private assertReady() {
    if (!this.sock || this._status !== "connected") {
      throw new Error(`Conexao ${this.id} nao esta conectada (status: ${this._status})`);
    }
  }

  /** Normaliza o formato do Baileys para IncomingMessage. */
  private parseMessage(raw: any): IncomingMessage | null {
    const key = raw?.key;
    if (!key) return null;

    /**
     * fromMe cobre dois casos bem diferentes: mensagem que o bot enviou (ignorar)
     * e recado que a pessoa mandou para o proprio numero (capturar). Só o
     * segundo tem remoteJid igual ao numero conectado.
     */
    const ownNumber = this._phone ?? "";
    const isSelfNote =
      Boolean(key.fromMe) && ownNumber !== "" && String(key.remoteJid ?? "").startsWith(ownNumber);
    if (key.fromMe && !isSelfNote) return null;
    // grupos e status broadcast ficam fora: o produto e atendimento 1:1
    const remoteJid: string = key.remoteJid ?? "";
    if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") return null;

    const m = raw.message;
    if (!m) return null;

    /**
     * O WhatsApp passou a usar LID ("...@lid") no lugar do telefone em muitos
     * contatos. Tratar o LID como telefone corrompe o CRM e faz o envio ir para
     * um numero inexistente, entao guardamos o JID inteiro e so chamamos de
     * telefone o que vier de s.whatsapp.net.
     */
    const from = remoteJid.split("@")[0];
    const base = {
      externalId: key.id as string,
      from,
      fromJid: remoteJid,
      pushName: raw.pushName as string | undefined,
      timestamp: new Date(Number(raw.messageTimestamp ?? Date.now() / 1000) * 1000),
      selfNote: isSelfNote,
      quotedMessageId:
        m.extendedTextMessage?.contextInfo?.stanzaId ??
        m.imageMessage?.contextInfo?.stanzaId ??
        undefined,
      raw,
    };

    if (m.conversation) return { ...base, type: "text", body: m.conversation };
    if (m.extendedTextMessage?.text)
      return { ...base, type: "text", body: m.extendedTextMessage.text };
    if (m.imageMessage)
      return { ...base, type: "image", body: m.imageMessage.caption, mimeType: m.imageMessage.mimetype };
    if (m.videoMessage)
      return { ...base, type: "video", body: m.videoMessage.caption, mimeType: m.videoMessage.mimetype };
    if (m.audioMessage) return { ...base, type: "audio", mimeType: m.audioMessage.mimetype };
    if (m.documentMessage)
      return {
        ...base,
        type: "document",
        body: m.documentMessage.fileName,
        mimeType: m.documentMessage.mimetype,
      };
    if (m.stickerMessage) return { ...base, type: "sticker" };
    if (m.contactMessage) return { ...base, type: "contact", body: m.contactMessage.displayName };
    if (m.locationMessage) return { ...base, type: "location" };
    // botoes / listas voltam como selectedId
    if (m.buttonsResponseMessage)
      return { ...base, type: "text", body: m.buttonsResponseMessage.selectedDisplayText };
    if (m.listResponseMessage)
      return { ...base, type: "text", body: m.listResponseMessage.title };

    return { ...base, type: "unknown" };
  }
}
