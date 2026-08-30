"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { MODEL_OPTIONS, type AIProviderId } from "@/lib/ai/types";
import type { AIConfig, NodeType } from "@/lib/flow/node-types";
import { NODE_BY_TYPE } from "@/lib/flow/node-types";
import { NODE_ICONS } from "./node-icons";

interface Props {
  type: NodeType;
  config: Record<string, unknown>;
  tags: { id: string; name: string }[];
  flows: { id: string; name: string }[];
  onSave: (config: Record<string, unknown>) => void;
  onClose: () => void;
}

export function NodeEditor({ type, config, tags, flows, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Record<string, unknown>>(config);
  const [error, setError] = useState<string | null>(null);

  const meta = NODE_BY_TYPE.get(type);
  const NodeIcon = NODE_ICONS[type];

  useEffect(() => setDraft(config), [config]);

  const set = (patch: Record<string, unknown>) => setDraft((d) => ({ ...d, ...patch }));

  function save() {
    // mesma validacao do Leona: condicionais exigem saida padrao nomeada
    if (type === "ai") {
      const c = draft as unknown as AIConfig;
      if ((c.conditions ?? []).length > 0 && !c.fallbackOutputKey?.trim()) {
        setError("Preencha o nome da saida padrao — obrigatorio quando ha condicionais.");
        return;
      }
      if ((c.conditions ?? []).some((x) => !x.outputKey?.trim())) {
        setError("Toda condicional precisa de uma saida vinculada.");
        return;
      }
    }
    setError(null);
    onSave(draft);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
      {/* Modal no formato do Leona: cantos bem arredondados, sombra alta,
          header com o icone do bloco num quadrado da cor dele. */}
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-pop">
        <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
            style={{
              background: `linear-gradient(135deg, ${meta?.color ?? "#64748b"}, color-mix(in oklab, ${meta?.color ?? "#64748b"} 72%, var(--brand)))`,
            }}
          >
            <NodeIcon size={16} />
          </span>
          <h2 className="min-w-0 flex-1 truncate font-semibold">
            Editar {meta?.label ?? type}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-fg">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {type === "start" && <StartForm draft={draft} set={set} />}
          {type === "message" && <MessageForm draft={draft} set={set} />}
          {type === "await_reply" && <AwaitReplyForm draft={draft} set={set} />}
          {type === "ai" && <AIForm draft={draft} set={set} />}
          {type === "tags" && <TagsForm draft={draft} set={set} tags={tags} />}
          {type === "condition" && <ConditionForm draft={draft} set={set} tags={tags} />}
          {type === "delay" && <DelayForm draft={draft} set={set} />}
          {type === "notification" && <NotificationForm draft={draft} set={set} />}
          {type === "http_request" && <HttpForm draft={draft} set={set} />}
          {type === "pix" && <PixForm draft={draft} set={set} />}
          {type === "sale" && <SaleForm draft={draft} set={set} />}
          {type === "flow_link" && <FlowLinkForm draft={draft} set={set} flows={flows} />}
          {(type === "end" || type === "transfer_human") && (
            <p className="text-sm text-muted">Este bloco nao tem configuracao.</p>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={save}>
            Salvar
          </button>
        </footer>
      </div>
    </div>
  );
}

type FormProps = { draft: Record<string, unknown>; set: (p: Record<string, unknown>) => void };

/* --------------------------------------------------------------- start --- */

function StartForm({ draft, set }: FormProps) {
  return (
    <>
      <div>
        <label className="label">Gatilho</label>
        <select
          className="input"
          value={String(draft.trigger ?? "message_received")}
          onChange={(e) => set({ trigger: e.target.value })}
        >
          <option value="message_received">Mensagem recebida</option>
          <option value="keyword">Palavra-chave</option>
          <option value="new_contact">Novo contato</option>
          <option value="webhook">Webhook</option>
        </select>
      </div>
      {draft.trigger === "keyword" && (
        <div>
          <label className="label">Palavras-chave (separadas por virgula)</label>
          <input
            className="input"
            value={((draft.keywords ?? []) as string[]).join(", ")}
            onChange={(e) =>
              set({ keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
            }
          />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- message --- */

/** Tipos de conteudo do bloco Mensagem, com a cor de cada um (igual ao Leona). */
const CONTENT_KINDS = [
  { kind: "text", label: "Texto", icon: MessageSquare, color: "#2563eb" },
  { kind: "image", label: "Imagem", icon: ImageIcon, color: "#16a34a" },
  { kind: "video", label: "Video", icon: Video, color: "#7c3aed" },
  { kind: "audio", label: "Audio", icon: Mic, color: "#ea580c" },
  { kind: "delay", label: "Intervalo", icon: Clock, color: "#0891b2" },
  { kind: "document", label: "Arquivo", icon: FileText, color: "#64748b" },
] as const;

function MessageForm({ draft, set }: FormProps) {
  const items = (draft.items ?? []) as Record<string, unknown>[];
  const update = (i: number, patch: Record<string, unknown>) =>
    set({ items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });

  return (
    <>
      {items.map((item, i) => {
        const meta = CONTENT_KINDS.find((k) => k.kind === item.kind) ?? CONTENT_KINDS[0];
        const Icon = meta.icon;

        return (
          <div key={i} className="rounded-xl border border-border bg-black/[0.02] p-3 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <span
                className="grid h-6 w-6 place-items-center rounded-md"
                style={{ background: `${meta.color}1f`, color: meta.color }}
              >
                <Icon size={13} />
              </span>
              <span className="flex-1 text-xs font-medium">Mensagem de {meta.label}</span>
              <button
                className="text-muted hover:text-red-500"
                onClick={() => set({ items: items.filter((_, idx) => idx !== i) })}
                title="Remover"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {item.kind === "delay" ? (
              <div className="mt-3">
                <label className="label">Segundos de pausa</label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={Number(item.seconds ?? 1)}
                  onChange={(e) => update(i, { seconds: Number(e.target.value) })}
                />
              </div>
            ) : item.kind === "text" ? (
              <>
                <label className="label mt-3">Conteudo da Mensagem *</label>
                <textarea
                  className="input min-h-[100px]"
                  placeholder="Use {{variaveis}} — ex: Ola {{lead.nome}}"
                  value={String(item.value ?? "")}
                  onChange={(e) => update(i, { value: e.target.value })}
                />

                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className="text-muted">Delay do &quot;digitando&quot;</span>
                  <span className="font-medium">
                    {Number(item.typingDelaySeconds ?? 3)} segundos
                  </span>
                  <span className="text-muted">60 segundos</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  className="mt-1 w-full accent-[var(--brand)]"
                  value={Number(item.typingDelaySeconds ?? 3)}
                  onChange={(e) => update(i, { typingDelaySeconds: Number(e.target.value) })}
                />
                <p className="mt-1 text-[11px] text-muted">
                  Tempo que o WhatsApp fica &quot;digitando&quot; antes de enviar esta mensagem.
                </p>
              </>
            ) : (
              <>
                <label className="label mt-3">URL do arquivo</label>
                <input
                  className="input"
                  placeholder="https://..."
                  value={String(item.value ?? "")}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
                <label className="label mt-2">Legenda (opcional)</label>
                <input
                  className="input"
                  value={String(item.caption ?? "")}
                  onChange={(e) => update(i, { caption: e.target.value })}
                />
              </>
            )}
          </div>
        );
      })}

      <div>
        <p className="label">Adicionar Conteudo</p>
        <div className="grid grid-cols-4 gap-2">
          {CONTENT_KINDS.map(({ kind, label, icon: Icon, color }) => (
            <button
              key={kind}
              onClick={() =>
                set({
                  items: [
                    ...items,
                    kind === "delay"
                      ? { kind, seconds: 3 }
                      : { kind, value: "", typingDelaySeconds: 3 },
                  ],
                })
              }
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border px-2 py-3 transition hover:border-[var(--brand)]"
            >
              <span
                className="grid h-8 w-8 place-items-center rounded-lg"
                style={{ background: `${color}1f`, color }}
              >
                <Icon size={16} />
              </span>
              <span className="text-[11px]">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------- await reply --- */

function AwaitReplyForm({ draft, set }: FormProps) {
  return (
    <>
      <Toggle
        label="Aguardar indefinidamente"
        hint="O fluxo so avanca quando o lead responder."
        checked={Boolean(draft.waitIndefinitely)}
        onChange={(v) => set({ waitIndefinitely: v })}
      />

      {!draft.waitIndefinitely && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="label">Tempo maximo de espera</label>
            <input
              type="number"
              min={1}
              className="input"
              value={Number(draft.timeoutValue ?? 1)}
              onChange={(e) => set({ timeoutValue: Number(e.target.value) })}
            />
          </div>
          <div className="w-32">
            <label className="label">Unidade</label>
            <select
              className="input"
              value={String(draft.timeoutUnit ?? "hours")}
              onChange={(e) => set({ timeoutUnit: e.target.value })}
            >
              <option value="minutes">Minutos</option>
              <option value="hours">Horas</option>
              <option value="days">Dias</option>
            </select>
          </div>
        </div>
      )}

      <Toggle
        label="Ativar buffer de mensagens"
        hint="Agrupa as mensagens picadas do lead numa variavel so."
        checked={Boolean(draft.bufferEnabled)}
        onChange={(v) => set({ bufferEnabled: v })}
      />
      {draft.bufferEnabled && (
        <div>
          <label className="label">Buffer apos a primeira resposta (segundos)</label>
          <input
            type="number"
            min={1}
            max={120}
            className="input"
            value={Number(draft.bufferSeconds ?? 15)}
            onChange={(e) => set({ bufferSeconds: Number(e.target.value) })}
          />
        </div>
      )}

      <Toggle
        label="Responder citando a mensagem do lead"
        checked={Boolean(draft.quoteReply)}
        onChange={(v) => set({ quoteReply: v })}
      />

      <div>
        <label className="label">Reagir na mensagem do lead (emoji, opcional)</label>
        <input
          className="input"
          placeholder="👍"
          value={String(draft.reactEmoji ?? "")}
          onChange={(e) => set({ reactEmoji: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Campo para salvar a informacao (sem chaves)</label>
        <input
          className="input"
          placeholder="resposta"
          value={String(draft.saveToField ?? "")}
          onChange={(e) => set({ saveToField: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Mensagem antes de aguardar a resposta</label>
        <textarea
          className="input min-h-[70px]"
          value={String(draft.messageBefore ?? "")}
          onChange={(e) => set({ messageBefore: e.target.value })}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ ia --- */

function AIForm({ draft, set }: FormProps) {
  const c = draft as unknown as AIConfig;
  const conditions = c.conditions ?? [];
  const provider = (c.provider ?? "openai") as AIProviderId;

  const updateCond = (i: number, patch: Record<string, unknown>) =>
    set({ conditions: conditions.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });

  return (
    <>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label">Provedor de IA</label>
          <select
            className="input"
            value={provider}
            onChange={(e) => {
              const p = e.target.value as AIProviderId;
              set({ provider: p, model: MODEL_OPTIONS[p][0].id });
            }}
          >
            <option value="local">Local — sem chave (teste)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="gemini">Google (Gemini)</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="label">Modelo</label>
          <select
            className="input"
            value={String(c.model ?? "")}
            onChange={(e) => set({ model: e.target.value })}
          >
            {MODEL_OPTIONS[provider].map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Chave da API (vazio = usa a do .env)</label>
        <input
          className="input"
          placeholder="sk-... ou {{minha_variavel}}"
          value={String(c.apiKey ?? "")}
          onChange={(e) => set({ apiKey: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Mensagem enviada ao modelo</label>
        <input
          className="input"
          placeholder="{{resposta}}"
          value={String(c.inputTemplate ?? "")}
          onChange={(e) => set({ inputTemplate: e.target.value })}
        />
        <p className="mt-1 text-[11px] text-muted">
          Deve bater com o campo salvo no bloco Aguarda Resposta.
        </p>
      </div>

      <div>
        <label className="label">Prompt / Comportamento</label>
        <textarea
          className="input min-h-[110px]"
          placeholder="1) persona  2) produto  3) regras"
          value={String(c.prompt ?? "")}
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </div>

      <Toggle
        label="Enviar resposta automaticamente"
        hint="Normalmente desligado, para tratar a resposta antes de enviar."
        checked={Boolean(c.autoSend)}
        onChange={(v) => set({ autoSend: v })}
      />

      <div className="card space-y-2 p-3">
        <p className="text-xs font-semibold">Entendimento de midia</p>
        <Toggle bare label="Entender audio" checked={Boolean(c.understandAudio)} onChange={(v) => set({ understandAudio: v })} />
        <Toggle bare label="Entender imagem" checked={Boolean(c.understandImage)} onChange={(v) => set({ understandImage: v })} />
        <Toggle bare label="Processar PDF" checked={Boolean(c.understandPdf)} onChange={(v) => set({ understandPdf: v })} />
        <p className="text-[11px] text-muted">Essas opcoes podem consumir mais tokens.</p>
      </div>

      <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-3">
        <Toggle
          bare
          label="Identificar comprovante"
          hint="Extrai comprovante.* de imagem/PDF. Vira a saida do topo do bloco."
          checked={Boolean(c.identifyReceipt)}
          onChange={(v) => set({ identifyReceipt: v })}
        />
      </div>

      <div>
        <p className="text-sm font-semibold">Condicionais Inteligentes (ate 10)</p>
        <p className="mt-0.5 text-[11px] text-muted">
          A IA classifica a resposta e segue a saida correspondente. Ordem = prioridade.
        </p>

        {conditions.map((cond, i) => (
          <div key={i} className="card mt-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Prioridade {i + 1}</span>
              <button
                className="text-muted hover:text-red-500"
                onClick={() => set({ conditions: conditions.filter((_, idx) => idx !== i) })}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <label className="label mt-2">Prompt da condicao (max. 100 caracteres)</label>
            <input
              className="input"
              maxLength={100}
              value={cond.prompt ?? ""}
              onChange={(e) => updateCond(i, { prompt: e.target.value })}
            />
            <p className="mt-0.5 text-right text-[11px] text-muted">
              {(cond.prompt ?? "").length}/100
            </p>
            <label className="label">Saida vinculada (salva em ai.response)</label>
            <input
              className="input"
              placeholder="Ex: #positivo"
              value={cond.outputKey ?? ""}
              onChange={(e) => updateCond(i, { outputKey: e.target.value })}
            />
          </div>
        ))}

        {conditions.length < 10 && (
          <button
            className="btn mt-2 w-full justify-center"
            onClick={() =>
              set({
                conditions: [
                  ...conditions,
                  { priority: conditions.length + 1, prompt: "", outputKey: "" },
                ],
              })
            }
          >
            <Plus size={15} /> Adicionar condicional
          </button>
        )}
      </div>

      <div>
        <label className="label">Saida padrao</label>
        <p className="mb-1 text-[11px] text-muted">
          Quando nenhuma condicao for atendida, o fluxo segue por aqui e a IA usa o prompt acima
          para gerar a resposta.
        </p>
        <input
          className="input"
          placeholder="Ex: padrao"
          value={String(c.fallbackOutputKey ?? "")}
          onChange={(e) => set({ fallbackOutputKey: e.target.value })}
        />
      </div>

      <Toggle
        label="Manter contexto da conversa"
        checked={Boolean(c.keepContext)}
        onChange={(v) => set({ keepContext: v })}
      />
      {c.keepContext && (
        <div>
          <label className="label">Ultimas N interacoes (max. 20)</label>
          <input
            type="number"
            min={1}
            max={20}
            className="input"
            value={Number(c.contextTurns ?? 5)}
            onChange={(e) => set({ contextTurns: Math.min(20, Number(e.target.value)) })}
          />
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- tags --- */

function TagsForm({
  draft,
  set,
  tags,
}: FormProps & { tags: { id: string; name: string }[] }) {
  const selected = (draft.tagIds ?? []) as string[];
  return (
    <>
      <div>
        <label className="label">Acao</label>
        <select
          className="input"
          value={String(draft.mode ?? "add")}
          onChange={(e) => set({ mode: e.target.value })}
        >
          <option value="add">Adicionar etiquetas</option>
          <option value="remove">Remover etiquetas</option>
        </select>
      </div>
      <div>
        <label className="label">Etiquetas</label>
        {tags.length === 0 ? (
          <p className="text-sm text-muted">Crie etiquetas na pagina Etiquetas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => {
              const on = selected.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() =>
                    set({
                      tagIds: on ? selected.filter((x) => x !== t.id) : [...selected, t.id],
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    on
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-border text-muted"
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ----------------------------------------------------------- condition --- */

function ConditionForm({
  draft,
  set,
  tags,
}: FormProps & { tags: { id: string; name: string }[] }) {
  const rules = (draft.rules ?? []) as Record<string, unknown>[];
  const update = (i: number, patch: Record<string, unknown>) =>
    set({ rules: rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });

  return (
    <>
      <div>
        <label className="label">Regra logica</label>
        <select
          className="input"
          value={String(draft.match ?? "all")}
          onChange={(e) => set({ match: e.target.value })}
        >
          <option value="all">Corresponde a todas as condicoes (E)</option>
          <option value="any">Corresponde a qualquer condicao (OU)</option>
        </select>
      </div>

      {rules.map((rule, i) => {
        const field = (rule.field ?? { source: "tag" }) as Record<string, unknown>;
        return (
          <div key={i} className="card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Condicao {i + 1}</span>
              <button
                className="text-muted hover:text-red-500"
                onClick={() => set({ rules: rules.filter((_, idx) => idx !== i) })}
              >
                <Trash2 size={14} />
              </button>
            </div>

            <label className="label mt-2">Origem</label>
            <select
              className="input"
              value={String(field.source)}
              onChange={(e) => update(i, { field: { source: e.target.value } })}
            >
              <optgroup label="Sistema">
                <option value="tag">Etiqueta</option>
                <option value="weekday">Dia da semana</option>
                <option value="hour">Hora</option>
                <option value="date">Data</option>
              </optgroup>
              <optgroup label="Atendimento">
                <option value="conversation_status">Status da conversa</option>
              </optgroup>
              <optgroup label="Campos">
                <option value="field">Campo / variavel</option>
              </optgroup>
            </select>

            {field.source === "tag" && (
              <>
                <label className="label mt-2">Etiqueta</label>
                <select
                  className="input"
                  value={String(field.tagId ?? "")}
                  onChange={(e) => update(i, { field: { source: "tag", tagId: e.target.value } })}
                >
                  <option value="">Selecionar etiqueta</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <label className="label mt-2">Regra</label>
                <select
                  className="input"
                  value={String(rule.operator ?? "equals")}
                  onChange={(e) => update(i, { operator: e.target.value })}
                >
                  <option value="equals">Tem a etiqueta</option>
                  <option value="not_equals">Nao tem a etiqueta</option>
                </select>
              </>
            )}

            {field.source !== "tag" && (
              <>
                {field.source === "field" && (
                  <>
                    <label className="label mt-2">Caminho da variavel</label>
                    <input
                      className="input"
                      placeholder="ai.response  ou  comprovante.valor"
                      value={String(field.key ?? "")}
                      onChange={(e) =>
                        update(i, { field: { source: "field", key: e.target.value } })
                      }
                    />
                  </>
                )}
                <label className="label mt-2">Operador</label>
                <select
                  className="input"
                  value={String(rule.operator ?? "equals")}
                  onChange={(e) => update(i, { operator: e.target.value })}
                >
                  <option value="equals">Igual</option>
                  <option value="not_equals">Diferente</option>
                  <option value="contains">Contem</option>
                  <option value="not_contains">Nao contem</option>
                  <option value="gt">Maior que</option>
                  <option value="lt">Menor que</option>
                </select>
                <label className="label mt-2">Valor</label>
                <input
                  className="input"
                  value={String(rule.value ?? "")}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              </>
            )}
          </div>
        );
      })}

      <button
        className="btn w-full justify-center"
        onClick={() =>
          set({ rules: [...rules, { field: { source: "tag" }, operator: "equals", value: "" }] })
        }
      >
        <Plus size={15} /> Adicionar condicao
      </button>
    </>
  );
}

/* --------------------------------------------------------------- misc ---- */

function DelayForm({ draft, set }: FormProps) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <label className="label">Esperar</label>
        <input
          type="number"
          min={1}
          className="input"
          value={Number(draft.value ?? 1)}
          onChange={(e) => set({ value: Number(e.target.value) })}
        />
      </div>
      <div className="w-36">
        <label className="label">Unidade</label>
        <select
          className="input"
          value={String(draft.unit ?? "hours")}
          onChange={(e) => set({ unit: e.target.value })}
        >
          <option value="seconds">Segundos</option>
          <option value="minutes">Minutos</option>
          <option value="hours">Horas</option>
          <option value="days">Dias</option>
        </select>
      </div>
    </div>
  );
}

function NotificationForm({ draft, set }: FormProps) {
  return (
    <>
      <div>
        <label className="label">Notificar o numero</label>
        <input
          className="input"
          placeholder="5511999999999"
          value={String(draft.toPhone ?? "")}
          onChange={(e) => set({ toPhone: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Mensagem</label>
        <textarea
          className="input min-h-[90px]"
          placeholder="Erro no fluxo: {{ai.error}}"
          value={String(draft.message ?? "")}
          onChange={(e) => set({ message: e.target.value })}
        />
      </div>
    </>
  );
}

function HttpForm({ draft, set }: FormProps) {
  return (
    <>
      <div className="flex gap-2">
        <div className="w-32">
          <label className="label">Metodo</label>
          <select
            className="input"
            value={String(draft.method ?? "GET")}
            onChange={(e) => set({ method: e.target.value })}
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="label">URL</label>
          <input
            className="input"
            placeholder="https://api.exemplo.com/{{lead.telefone}}"
            value={String(draft.url ?? "")}
            onChange={(e) => set({ url: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="label">Headers (JSON)</label>
        <textarea
          className="input min-h-[70px] font-mono text-xs"
          value={JSON.stringify(draft.headers ?? {}, null, 2)}
          onChange={(e) => {
            try {
              set({ headers: JSON.parse(e.target.value) });
            } catch {
              /* deixa o usuario terminar de digitar */
            }
          }}
        />
      </div>
      <div>
        <label className="label">Body</label>
        <textarea
          className="input min-h-[90px] font-mono text-xs"
          value={String(draft.body ?? "")}
          onChange={(e) => set({ body: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Salvar resposta em</label>
        <input
          className="input"
          value={String(draft.saveAs ?? "response")}
          onChange={(e) => set({ saveAs: e.target.value })}
        />
      </div>
    </>
  );
}

function PixForm({ draft, set }: FormProps) {
  return (
    <>
      <div>
        <label className="label">Tipo da chave PIX</label>
        <select
          className="input"
          value={String(draft.keyType ?? "random")}
          onChange={(e) => set({ keyType: e.target.value })}
        >
          <option value="random">Chave aleatoria</option>
          <option value="cpf">CPF</option>
          <option value="cnpj">CNPJ</option>
          <option value="email">E-mail</option>
          <option value="phone">Telefone</option>
        </select>
      </div>
      <div>
        <label className="label">Chave PIX</label>
        <input
          className="input"
          value={String(draft.key ?? "")}
          onChange={(e) => set({ key: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Destinatario do pagamento</label>
        <input
          className="input"
          value={String(draft.recipient ?? "")}
          onChange={(e) => set({ recipient: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Valor (R$)</label>
        <input
          className="input"
          placeholder="30,00"
          value={String(draft.amount ?? "")}
          onChange={(e) => set({ amount: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Mensagem que acompanha a chave</label>
        <textarea
          className="input min-h-[70px]"
          value={String(draft.message ?? "")}
          onChange={(e) => set({ message: e.target.value })}
        />
      </div>
    </>
  );
}

function SaleForm({ draft, set }: FormProps) {
  return (
    <>
      <div>
        <label className="label">Produto</label>
        <input
          className="input"
          value={String(draft.productName ?? "")}
          onChange={(e) => set({ productName: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label">Preco (R$)</label>
          <input
            className="input"
            value={String(draft.price ?? "")}
            onChange={(e) => set({ price: e.target.value })}
          />
        </div>
        <div className="flex-1">
          <label className="label">Preco minimo aceito</label>
          <input
            className="input"
            value={String(draft.minPrice ?? "")}
            onChange={(e) => set({ minPrice: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="label">Variavel com o valor pago</label>
        <input
          className="input"
          placeholder="{{comprovante.valor}}"
          value={String(draft.amountField ?? "")}
          onChange={(e) => set({ amountField: e.target.value })}
        />
      </div>
    </>
  );
}

function FlowLinkForm({
  draft,
  set,
  flows,
}: FormProps & { flows: { id: string; name: string }[] }) {
  return (
    <div>
      <label className="label">Fluxo destino</label>
      <select
        className="input"
        value={String(draft.targetFlowId ?? "")}
        onChange={(e) => set({ targetFlowId: e.target.value })}
      >
        <option value="">Selecionar fluxo</option>
        {flows.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  /** Linha simples, sem caixa — para toggles que ja vivem dentro de um grupo. */
  bare = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  bare?: boolean;
}) {
  // No Leona o toggle vive numa caixa propria e fica VERDE quando ligado —
  // e o sinal visual de "esta opcao esta valendo".
  return (
    <label
      className={`flex cursor-pointer items-start justify-between gap-3 ${
        bare ? "py-1.5" : "section py-3"
      }`}
    >
      <span className="min-w-0">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{hint}</span>}
      </span>
      <span
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-[22px] w-10 shrink-0 rounded-full transition ${
          checked ? "bg-[var(--ok)]" : "bg-slate-300 dark:bg-slate-600"
        }`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-all ${
            checked ? "left-[19px]" : "left-0.5"
          }`}
        />
      </span>
    </label>
  );
}
