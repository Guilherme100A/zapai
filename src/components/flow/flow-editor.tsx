"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  Archive,
  ArrowLeft,
  ChevronRight,
  Clock,
  Home,
  Pause,
  Play,
  Search,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { FlowNode, type FlowNodeData } from "./flow-node";
import { NodeEditor } from "./node-editor";
import { DEFAULT_CONFIGS, NODE_CATALOG, type NodeType } from "@/lib/flow/node-types";
import { NODE_ICONS } from "./node-icons";

interface Props {
  flowId: string;
  initialFlow: { name: string; active: boolean };
  initialNodes: {
    nodeKey: string;
    type: string;
    positionX: string;
    positionY: string;
    config: Record<string, unknown>;
  }[];
  initialEdges: {
    edgeKey: string;
    source: string;
    target: string;
    sourceHandle: string | null;
  }[];
  tags: { id: string; name: string }[];
  flows: { id: string; name: string }[];
}

const nodeTypes = { block: FlowNode };

function EditorInner({ flowId, initialFlow, initialNodes, initialEdges, tags, flows }: Props) {
  const [name, setName] = useState(initialFlow.name);
  const [active, setActive] = useState(initialFlow.active);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  /**
   * Os callbacks entregues aos nos precisam ser ESTAVEIS: eles vivem dentro de
   * node.data, entao recria-los obrigaria a reescrever todos os nos, o que
   * dispara o efeito de novo — loop infinito de render. Lemos o estado atual
   * por ref em vez de fechar sobre `nodes`.
   */
  const nodesRef = useRef<Node[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const editNode = useCallback((key: string) => setEditing(key), []);

  const deleteNode = useCallback(
    (key: string) => {
      const node = nodesRef.current.find((n) => n.id === key);
      const label = (node?.data as FlowNodeData | undefined)?.type ?? key;
      if (!confirm(`Tem certeza que deseja excluir o no "${label}"?`)) return;
      setNodes((ns) => ns.filter((n) => n.id !== key));
      setEdges((es) => es.filter((e) => e.source !== key && e.target !== key));
    },
    [setNodes, setEdges],
  );

  const duplicateNode = useCallback(
    (key: string) => {
      setNodes((ns) => {
        const src = ns.find((n) => n.id === key);
        if (!src) return ns;
        const id = `${src.data.type}_${Date.now().toString(36)}`;
        return [
          ...ns,
          {
            ...src,
            id,
            position: { x: src.position.x + 60, y: src.position.y + 60 },
            selected: false,
            data: { ...src.data, config: structuredClone(src.data.config) },
          } as Node,
        ];
      });
    },
    [setNodes],
  );

  // hidrata o canvas a partir do banco uma vez
  useEffect(() => {
    setNodes(
      initialNodes.map((n) => ({
        id: n.nodeKey,
        type: "block",
        position: { x: Number(n.positionX), y: Number(n.positionY) },
        data: {
          type: n.type as NodeType,
          config: n.config ?? {},
          onEdit: editNode,
          onDuplicate: duplicateNode,
          onDelete: deleteNode,
        } satisfies FlowNodeData,
      })),
    );
    setEdges(
      initialEdges.map((e) => ({
        id: e.edgeKey,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        animated: true,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((es) =>
        addEdge({ ...c, id: `e_${c.source}_${c.sourceHandle ?? "next"}_${c.target}`, animated: true }, es),
      ),
    [setEdges],
  );

  function addNode(type: NodeType) {
    const id = `${type}_${Date.now().toString(36)}`;
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "block",
        position: { x: 320 + ns.length * 24, y: 120 + ns.length * 28 },
        data: {
          type,
          config: structuredClone(DEFAULT_CONFIGS[type]),
          onEdit: editNode,
          onDuplicate: duplicateNode,
          onDelete: deleteNode,
        } satisfies FlowNodeData,
      } as Node,
    ]);
  }

  /* ------------------------------------------------------------ autosave -- */

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const save = useCallback(async () => {
    const res = await fetch(`/api/flows/${flowId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        active,
        nodes: nodes.map((n) => ({
          nodeKey: n.id,
          type: (n.data as FlowNodeData).type,
          positionX: n.position.x,
          positionY: n.position.y,
          config: (n.data as FlowNodeData).config,
        })),
        edges: edges.map((e) => ({
          edgeKey: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
        })),
      }),
    });
    if (res.ok) setSavedAt(new Date().toLocaleTimeString("pt-BR"));
  }, [flowId, name, active, nodes, edges]);

  useEffect(() => {
    if (!dirty.current) {
      dirty.current = true; // ignora a hidratacao inicial
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [nodes, edges, name, active, save]);

  async function toggleActive() {
    const next = !active;
    setActive(next);
    await fetch(`/api/flows/${flowId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
  }

  async function archive() {
    if (!confirm("Arquivar este fluxo?")) return;
    await fetch(`/api/flows/${flowId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    window.location.href = "/flows";
  }

  const editingNode = useMemo(
    () => nodes.find((n) => n.id === editing),
    [nodes, editing],
  );

  const palette = NODE_CATALOG.filter(
    (n) =>
      n.type !== "start" &&
      (n.label.toLowerCase().includes(search.toLowerCase()) ||
        n.description.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <header className="border-b border-border bg-surface px-5 py-3">
        <nav className="flex items-center gap-3 text-xs text-muted">
          <Link href="/flows" className="flex items-center gap-1 hover:text-fg">
            <ArrowLeft size={13} /> Voltar
          </Link>
          <span className="text-border">|</span>
          <Link href="/" className="flex items-center gap-1 hover:text-fg">
            <Home size={13} /> Inicio
          </Link>
          <ChevronRight size={13} className="text-border" />
          <Link href="/flows" className="hover:text-fg">
            Fluxos
          </Link>
          <ChevronRight size={13} className="text-border" />
          <span className="max-w-[220px] truncate text-fg">{name}</span>
        </nav>

        <div className="mt-3 flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--brand)]/12 text-[var(--brand)]">
            <Workflow size={18} />
          </span>
          <input
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nome do fluxo"
          />
          {savedAt && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Clock size={13} /> Salvo as {savedAt}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              active
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-slate-500/15 text-muted"
            }`}
          >
            {active ? "No ar" : "Pausado"}
          </span>
          <button className="btn" onClick={toggleActive}>
            {active ? <Pause size={15} /> : <Play size={15} />}
            {active ? "Pausar" : "Ativar"}
          </button>
          <button className="btn" onClick={archive}>
            <Archive size={15} /> Arquivar
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Paleta: painel branco flutuando sobre o canvas, com busca no topo e
            uma linha por bloco — o mesmo desenho do "Buscar blocos..." do Leona. */}
        <aside className="w-[248px] shrink-0 p-3">
          <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-3 shadow-soft">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-muted" />
              <input
                className="input pl-8"
                placeholder="Buscar blocos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {palette.map((n) => {
                const Icon = NODE_ICONS[n.type];
                return (
                  <button
                    key={n.type}
                    onClick={() => addNode(n.type)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border px-2.5 py-2.5 text-left text-[13px] transition hover:border-[var(--brand)] hover:bg-[var(--brand)]/[0.04]"
                    title={n.description}
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                      style={{ background: `${n.color}1f`, color: n.color }}
                    >
                      <Icon size={14} />
                    </span>
                    {n.label}
                  </button>
                );
              })}
              {palette.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-muted">Nenhum bloco encontrado.</p>
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </div>

      {editingNode && (
        <NodeEditor
          type={(editingNode.data as FlowNodeData).type}
          config={(editingNode.data as FlowNodeData).config}
          tags={tags}
          flows={flows.filter((f) => f.id !== flowId)}
          onClose={() => setEditing(null)}
          onSave={(config) => {
            setNodes((ns) =>
              ns.map((n) => (n.id === editingNode.id ? { ...n, data: { ...n.data, config } } : n)),
            );
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

export function FlowEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}
