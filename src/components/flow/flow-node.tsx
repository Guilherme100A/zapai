"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { NODE_BY_TYPE, outputsFor, type NodeType } from "@/lib/flow/node-types";
import { NODE_ICONS } from "./node-icons";

export interface FlowNodeData extends Record<string, unknown> {
  type: NodeType;
  config: Record<string, unknown>;
  onEdit: (key: string) => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
}

/**
 * No do canvas, no desenho do Leona: header em degrade com icone em circulo e
 * os botoes editar/duplicar/excluir, corpo com o resumo da config numa caixa
 * tingida da cor do bloco, e um handle por saida do lado direito.
 */
function FlowNodeInner({ id, data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const meta = NODE_BY_TYPE.get(d.type);
  const Icon = NODE_ICONS[d.type];
  const outputs = outputsFor(d.type, d.config);
  const summary = summarize(d.type, d.config);
  const color = meta?.color ?? "#64748b";

  return (
    <div
      className={`w-[236px] overflow-hidden rounded-xl border bg-surface shadow-soft transition ${
        selected ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/25" : "border-border"
      }`}
    >
      {d.type !== "start" && (
        <Handle type="target" position={Position.Left} style={{ background: "#94a3b8" }} />
      )}

      <div
        className="flex items-center gap-2 px-2.5 py-2 text-white"
        style={{
          // o degrade puxa cada bloco um pouco para o roxo da marca, como no Leona,
          // sem perder a cor que identifica o tipo
          background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 72%, var(--brand)))`,
        }}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20">
          <Icon size={12} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold">
          {meta?.label ?? d.type}
        </span>
        <button className="opacity-75 hover:opacity-100" onClick={() => d.onEdit(id)} title="Editar">
          <Pencil size={13} />
        </button>
        <button
          className="opacity-75 hover:opacity-100"
          onClick={() => d.onDuplicate(id)}
          title="Duplicar"
        >
          <Copy size={13} />
        </button>
        {d.type !== "start" && (
          <button
            className="opacity-75 hover:opacity-100"
            onClick={() => d.onDelete(id)}
            title="Excluir"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="p-2.5">
        <div
          className="whitespace-pre-line rounded-lg px-2.5 py-2 text-[11px] leading-relaxed"
          style={{
            background: `color-mix(in srgb, ${color} 9%, var(--surface))`,
            color: "var(--fg)",
          }}
        >
          {summary || <span className="italic text-muted">sem configuracao</span>}
        </div>
        {meta?.description && (
          <p className="mt-1.5 px-0.5 text-[10.5px] leading-snug text-muted">
            {truncate(meta.description, 62)}
          </p>
        )}
      </div>

      {outputs.length > 0 && (
        <div className="border-t border-border">
          {outputs.map((o, i) => (
            <div
              key={o.key}
              className="relative flex items-center justify-end px-3 py-1.5 text-[11px]"
              style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
            >
              <span className={o.key === "error" ? "text-red-500" : "text-muted"}>
                {o.label || "continuar"}
              </span>
              <Handle
                id={o.key}
                type="source"
                position={Position.Right}
                style={{
                  position: "absolute",
                  right: -5,
                  top: "50%",
                  background: o.key === "error" ? "#ef4444" : (meta?.color ?? "#64748b"),
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Resumo curto mostrado no corpo do no, como no Leona. */
function summarize(type: NodeType, c: Record<string, unknown>): string {
  switch (type) {
    case "start":
      return c.trigger === "keyword"
        ? `Palavra-chave: ${(c.keywords as string[])?.join(", ") || "-"}`
        : "Mensagem recebida";
    case "message": {
      const items = (c.items ?? []) as { kind: string; value: string }[];
      const first = items.find((i) => i.kind === "text")?.value;
      return first ? truncate(first, 90) : `${items.length} item(ns) de midia`;
    }
    case "await_reply":
      return [
        c.waitIndefinitely ? "Aguarda indefinidamente" : `Espera ${c.timeoutValue} ${c.timeoutUnit}`,
        c.bufferEnabled ? `buffer ${c.bufferSeconds}s` : null,
        `salva em ${c.saveToField || "resposta"}`,
      ]
        .filter(Boolean)
        .join(" · ");
    case "ai": {
      const conds = (c.conditions ?? []) as { outputKey: string }[];
      return `${c.provider}: ${c.model}\n${conds.length} condicional(is)`;
    }
    case "tags": {
      const n = ((c.tagIds ?? []) as string[]).length;
      return `${c.mode === "add" ? "Adicionar" : "Remover"} ${n} etiqueta(s)`;
    }
    case "condition": {
      const n = ((c.rules ?? []) as unknown[]).length;
      return `${n} regra(s) · ${c.match === "any" ? "qualquer (OU)" : "todas (E)"}`;
    }
    case "delay":
      return `Espera ${c.value} ${c.unit}`;
    case "notification":
      return `Avisa ${c.toPhone || "-"}`;
    case "http_request":
      return `${c.method} ${truncate(String(c.url ?? ""), 60)}`;
    case "pix":
      return `Chave ${c.keyType}${c.amount ? ` · R$ ${c.amount}` : ""}`;
    case "sale":
      return `${c.productName || "produto"} · R$ ${c.price || "0"}`;
    case "flow_link":
      return c.targetFlowId ? "Vai para outro fluxo" : "Escolha o fluxo destino";
    case "transfer_human":
      return "Pausa a IA e marca Atendendo";
    case "end":
      return "Encerra o fluxo";
    default:
      return "";
  }
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

export const FlowNode = memo(FlowNodeInner);
