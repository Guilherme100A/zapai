"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Tags } from "lucide-react";
import { PageHeader } from "@/components/page-header";

interface Tag {
  id: string;
  name: string;
  color: string;
}

const PALETTE = ["#7c5cff", "#16a34a", "#ea580c", "#0891b2", "#db2777", "#d97706", "#64748b"];

export default function TagsPage() {
  const [items, setItems] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);

  async function load() {
    setItems(await (await fetch("/api/tags")).json());
  }
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (!name.trim()) return;
    await fetch("/api/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    setName("");
    void load();
  }

  async function remove(id: string) {
    if (!confirm("Remover esta etiqueta? Ela sai de todos os contatos e fluxos.")) return;
    await fetch(`/api/tags?id=${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Etiquetas</h1>
      <p className="mt-1 text-sm text-muted">
        A base da logica dos fluxos: controle de estagio, anti-loop e remarketing.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Nome</label>
          <input
            className="input w-56"
            placeholder="lead_quente"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
        </div>
        <div>
          <label className="label">Cor</label>
          <div className="flex gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={`h-8 w-8 rounded-lg transition ${
                  color === c ? "ring-2 ring-offset-2 ring-[var(--brand)] ring-offset-[var(--bg)]" : ""
                }`}
              />
            ))}
          </div>
        </div>
        <button className="btn-primary" onClick={create}>
          <Plus size={16} /> Criar
        </button>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma etiqueta ainda.</p>
        ) : (
          items.map((t) => (
            <span
              key={t.id}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-white"
              style={{ background: t.color }}
            >
              {t.name}
              <button onClick={() => remove(t.id)} className="opacity-70 hover:opacity-100">
                <Trash2 size={13} />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
