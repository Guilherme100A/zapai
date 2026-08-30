import type { Metadata } from "next";
import "./globals.css";
import "@xyflow/react/dist/style.css";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";

export const metadata: Metadata = {
  title: "ZapAI",
  description: "Automacao de WhatsApp com IA — uso proprio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      {/*
        Estrutura do Leona: barra superior travada no topo e, embaixo dela,
        sidebar + conteudo. As telas de altura cheia (Inbox, editor de fluxo)
        descontam a topbar com h-[calc(100vh-3.5rem)].
      */}
      <body className="min-h-screen">
        <div className="flex min-h-screen flex-col">
          <TopBar />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
