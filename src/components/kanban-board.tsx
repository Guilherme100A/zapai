"use client";

import { useState } from "react";

interface Stage {
  id: string;
  name: string;
  color: string;
}

interface Lead {
  id: string;
  stageId: string | null;
  value: string | null;
  name: string | null;
  phone: string;
}

export function KanbanBoard({ stages, leads: initial }: { stages: Stage[]; leads: Lead[] }) {
  const [leads, setLeads] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);

  async function move(leadId: string, stageId: string) {
    // otimista: o card anda na hora, o PATCH so confirma
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, stageId } : l)));
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
  }

  return (
    <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const items = leads.filter((l) => l.stageId === stage.id);
        return (
          <div
            key={stage.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging) void move(dragging, stage.id);
              setDragging(null);
            }}
            className="w-64 shrink-0"
          >
            <div className="flex items-center gap-2 px-1 pb-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: stage.color }} />
              <span className="text-sm font-medium">{stage.name}</span>
              <span className="text-xs text-muted">{items.length}</span>
            </div>

            <div className="min-h-[120px] space-y-2 rounded-xl border border-dashed border-border p-2">
              {items.map((lead) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={() => setDragging(lead.id)}
                  className="card cursor-grab p-3 active:cursor-grabbing"
                >
                  <p className="text-sm font-medium">{lead.name ?? lead.phone}</p>
                  <p className="text-xs text-muted">+{lead.phone}</p>
                  {lead.value && (
                    <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      R$ {lead.value}
                    </p>
                  )}
                </div>
              ))}
              {items.length === 0 && (
                <p className="px-1 py-3 text-center text-xs text-muted">vazio</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
