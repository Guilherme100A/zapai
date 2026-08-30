import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  integer,
  boolean,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ---------------------------------------------------------------- enums -- */

export const connectionStatusEnum = pgEnum("connection_status", [
  "disconnected",
  "connecting",
  "qr",
  "connected",
  "error",
]);

/** Espelha as abas do Inbox do Leona: Aguardando / Atendendo / Resolvidos. */
export const conversationStatusEnum = pgEnum("conversation_status", [
  "aguardando",
  "atendendo",
  "resolvido",
]);

export const messageDirectionEnum = pgEnum("message_direction", ["in", "out"]);

export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "contact",
  "location",
  "button",
  "unknown",
]);

export const messageAuthorEnum = pgEnum("message_author", [
  "contact",
  "human",
  "ai",
  "flow",
  "system",
]);

export const executionStatusEnum = pgEnum("execution_status", [
  "running",
  "waiting",
  "finished",
  "failed",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "cancelled",
  "expired",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "running",
  "paused",
  "finished",
  "cancelled",
]);

export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "text",
  "number",
  "date",
  "boolean",
]);

/* ------------------------------------------------------ whatsapp / infra -- */

export const whatsappConnections = pgTable("whatsapp_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** "baileys" | "cloud_api" — qual implementacao de WhatsAppProvider usar. */
  provider: text("provider").notNull().default("baileys"),
  phoneNumber: text("phone_number"),
  status: connectionStatusEnum("status").notNull().default("disconnected"),
  /** QR corrente (data URL) enquanto status = 'qr'. */
  qrCode: text("qr_code"),
  /** Credenciais especificas do provider (token da Cloud API, etc). */
  credentials: jsonb("credentials").$type<Record<string, unknown>>().default({}),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------- contatos -- */

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** E164 sem "+", ou o LID quando o WhatsApp nao expoe o numero. */
    phone: text("phone").notNull(),
    /**
     * JID completo ("...@s.whatsapp.net" ou "...@lid"). Quando presente, e ele
     * que usamos para enviar — remontar o JID a partir de um LID mandaria a
     * mensagem para um numero que nao existe.
     */
    waJid: text("wa_jid"),
    name: text("name"),
    pushName: text("push_name"),
    avatarUrl: text("avatar_url"),
    /** Campos customizados criados pelo usuario (spec-gap B4). */
    fields: jsonb("fields").$type<Record<string, unknown>>().notNull().default({}),
    origin: text("origin"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contacts_phone_uq").on(t.phone)],
);

/** Definicao dos campos customizados, para o seletor "<>" do editor. */
export const customFields = pgTable(
  "custom_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: customFieldTypeEnum("type").notNull().default("text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("custom_fields_key_uq").on(t.key)],
);

/* --------------------------------------------------------------- tags ---- */

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#7c5cff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tags_name_uq").on(t.name)],
);

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.tagId] })],
);

/* ------------------------------------------------------------ conversas -- */

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => whatsappConnections.id, {
      onDelete: "set null",
    }),
    status: conversationStatusEnum("status").notNull().default("aguardando"),
    /** Toggle IA on/off por conversa (Inbox). */
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    assignedTo: text("assigned_to"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversations_contact_idx").on(t.contactId),
    index("conversations_last_msg_idx").on(t.lastMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** id da mensagem no provider, para dedupe e para quote/react. */
    externalId: text("external_id"),
    direction: messageDirectionEnum("direction").notNull(),
    author: messageAuthorEnum("author").notNull().default("contact"),
    type: messageTypeEnum("type").notNull().default("text"),
    body: text("body"),
    mediaUrl: text("media_url"),
    mimeType: text("mime_type"),
    /** Transcricao de audio / descricao de imagem gerada pela IA. */
    transcription: text("transcription"),
    quotedMessageId: text("quoted_message_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("messages_external_uq").on(t.externalId),
  ],
);

/** Memoria da conversa (spec 7): fatos, dados coletados, resumo, variaveis. */
export const conversationMemory = pgTable(
  "conversation_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    facts: jsonb("facts").$type<Record<string, unknown>>().notNull().default({}),
    summary: text("summary"),
    variables: jsonb("variables").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversation_memory_conv_uq").on(t.conversationId)],
);

/* ------------------------------------------------------------ pipeline --- */

export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id")
    .notNull()
    .references(() => pipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  color: text("color").notNull().default("#7c5cff"),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    pipelineId: uuid("pipeline_id").references(() => pipelines.id, { onDelete: "set null" }),
    stageId: uuid("stage_id").references(() => pipelineStages.id, { onDelete: "set null" }),
    value: numeric("value", { precision: 12, scale: 2 }),
    origin: text("origin"),
    assignedTo: text("assigned_to"),
    position: integer("position").notNull().default(0),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leads_stage_idx").on(t.stageId, t.position)],
);

/* --------------------------------------------------------------- fluxos -- */

export const flowFolders = pgTable("flow_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const flows = pgTable("flows", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  folderId: uuid("folder_id").references(() => flowFolders.id, { onDelete: "set null" }),
  /** Pausar / Arquivar do header do editor. */
  active: boolean("active").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const flowNodes = pgTable(
  "flow_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    /** id usado no canvas (react flow), estavel entre saves. */
    nodeKey: text("node_key").notNull(),
    type: text("type").notNull(),
    positionX: numeric("position_x", { precision: 12, scale: 2 }).notNull().default("0"),
    positionY: numeric("position_y", { precision: 12, scale: 2 }).notNull().default("0"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [uniqueIndex("flow_nodes_key_uq").on(t.flowId, t.nodeKey)],
);

export const flowEdges = pgTable(
  "flow_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    edgeKey: text("edge_key").notNull(),
    source: text("source").notNull(),
    target: text("target").notNull(),
    /**
     * Saida nomeada do no de origem. Indispensavel: o bloco de IA tem N saidas
     * (comprovante, condicionais, fallback, erro) e o Aguarda Resposta tem 2.
     * A spec 23 nao previa esta coluna — ver docs/spec-gap.md B7.
     */
    sourceHandle: text("source_handle"),
    targetHandle: text("target_handle"),
  },
  (t) => [
    uniqueIndex("flow_edges_key_uq").on(t.flowId, t.edgeKey),
    index("flow_edges_source_idx").on(t.flowId, t.source),
  ],
);

export const flowExecutions = pgTable(
  "flow_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    status: executionStatusEnum("status").notNull().default("running"),
    /** No em que a execucao esta parada (aguardando resposta / intervalo). */
    currentNodeKey: text("current_node_key"),
    /** Motivo da espera: "await_reply" | "delay". */
    waitingFor: text("waiting_for"),
    /** Quando a espera expira — o scheduler acorda a execucao aqui. */
    resumeAt: timestamp("resume_at", { withTimezone: true }),
    /** Variaveis da execucao ({{resposta}}, {{ai.response}}, {{comprovante.*}}...). */
    variables: jsonb("variables").$type<Record<string, unknown>>().notNull().default({}),
    /** Buffer de mensagens do Aguarda Resposta enquanto agrupa. */
    buffer: jsonb("buffer").$type<{ parts: string[]; until: string } | null>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("flow_executions_conv_idx").on(t.conversationId, t.status),
    index("flow_executions_resume_idx").on(t.status, t.resumeAt),
  ],
);

/* ------------------------------------------------------------------ ia --- */

/** Preset reutilizavel de IA. O bloco pode usar isto OU config inline (spec-gap B1). */
export const aiAgents = pgTable("ai_agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  provider: text("provider").notNull().default("openai"),
  model: text("model").notNull().default("gpt-4o-mini"),
  systemPrompt: text("system_prompt").notNull().default(""),
  temperature: numeric("temperature", { precision: 3, scale: 2 }).notNull().default("0.7"),
  memoryTurns: integer("memory_turns").notNull().default(10),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------- integracoes ----- */

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** POST /api/webhooks/{slug} */
  slug: text("slug").notNull().unique(),
  flowId: uuid("flow_id").references(() => flows.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  lastCalledAt: timestamp("last_called_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  provider: text("provider").notNull().default("pix_manual"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("BRL"),
  pixKey: text("pix_key"),
  pixKeyType: text("pix_key_type"),
  recipient: text("recipient"),
  externalId: text("external_id"),
  /** Dados extraidos do comprovante pela IA (comprovante.*). */
  receipt: jsonb("receipt").$type<Record<string, unknown>>().default({}),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------ campanhas -- */

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: campaignStatusEnum("status").notNull().default("draft"),
  message: text("message"),
  filterTagIds: jsonb("filter_tag_ids").$type<string[]>().notNull().default([]),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaignContacts = pgTable(
  "campaign_contacts",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.contactId] })],
);

export const scheduledMessages = pgTable(
  "scheduled_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("scheduled_messages_due_idx").on(t.sendAt, t.sentAt)],
);

/* ---------------------------------------------------------------- logs --- */

export const automationLogs = pgTable(
  "automation_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Um dos eventos de src/lib/events.ts (spec 20). */
    type: text("type").notNull(),
    conversationId: uuid("conversation_id"),
    flowId: uuid("flow_id"),
    executionId: uuid("execution_id"),
    nodeKey: text("node_key"),
    level: text("level").notNull().default("info"),
    message: text("message"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("automation_logs_created_idx").on(t.createdAt),
    index("automation_logs_exec_idx").on(t.executionId),
  ],
);

/* ----------------------------------------------------------- relations --- */

export const contactsRelations = relations(contacts, ({ many }) => ({
  conversations: many(conversations),
  contactTags: many(contactTags),
  leads: many(leads),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  contact: one(contacts, { fields: [conversations.contactId], references: [contacts.id] }),
  connection: one(whatsappConnections, {
    fields: [conversations.connectionId],
    references: [whatsappConnections.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, { fields: [contactTags.contactId], references: [contacts.id] }),
  tag: one(tags, { fields: [contactTags.tagId], references: [tags.id] }),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  contact: one(contacts, { fields: [leads.contactId], references: [contacts.id] }),
  stage: one(pipelineStages, { fields: [leads.stageId], references: [pipelineStages.id] }),
}));

export const flowsRelations = relations(flows, ({ many }) => ({
  nodes: many(flowNodes),
  edges: many(flowEdges),
}));
