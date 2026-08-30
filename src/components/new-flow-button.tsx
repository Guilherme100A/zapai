"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";

export function NewFlowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/flows", { method: "POST" });
    const flow = await res.json();
    setBusy(false);
    if (flow?.id) router.push(`/flows/${flow.id}`);
  }

  return (
    <button className="btn-primary" onClick={create} disabled={busy}>
      <Plus size={16} /> {busy ? "Criando..." : "Novo Fluxo"}
    </button>
  );
}
