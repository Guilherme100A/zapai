# Milestones — ordenados por dependência real

Reordenação do §25 da spec. Justificativa das mudanças em `docs/spec-gap.md` §C3.

## Grafo de dependências

```
M0 Fundação
 └─> M1 Domínio + Eventos + Variáveis  (infra que todo o resto usa)
      ├─> M2 WhatsApp Provider
      │    └─> M3 Inbox
      │         └─> M6 Atendimento humano
      ├─> M4 CRM: contatos, campos, etiquetas, pipeline
      │    └─┐
      └──────┴─> M5 Motor de automação + Editor visual   <── núcleo
                  ├─> M7 Bloco de IA
                  │    └─> M8 Comprovante + Pagamento (PIX)
                  ├─> M9 HTTP / Webhooks / Conexão de fluxo
                  └─> M10 Campanhas + Follow-up
                       └─> M11 Analytics
```

Mudanças-chave em relação à spec:
- **Etiquetas/CRM (era M6) sobem para M4**, antes do motor — o fluxo dos vídeos não roda sem etiqueta.
- **Variáveis e eventos (eram M7) sobem para M1** — são infraestrutura, não integração.
- **Bloco de IA (era M4) desce para M7**, depois do motor — IA sem fluxo não é testável.
- **Follow-up (era M8) deixa de ser milestone** — é template de fluxo (spec-gap B5).
- **Tool calling da IA sai do MVP** (spec-gap C1).

---

## M0 — Fundação
**Dep:** nenhuma
- Next.js 15 (App Router) + TypeScript + Tailwind
- Postgres via Docker (**porta própria, container próprio** — não encosta em nada que já roda na máquina)
- Drizzle ORM + migrations + seed
- Layout base: sidebar, tema, toasts
- `.env` + config tipada

**Feito quando:** `npm run dev` sobe, migration aplica, layout navega.

## M1 — Domínio, eventos e variáveis
**Dep:** M0
- Schema completo (23 tabelas da spec + `source_handle` em edges + `custom_fields`)
- **Event bus** interno (`MESSAGE_RECEIVED`, `FLOW_STARTED`, ... §20)
- **Motor de templating** `{{var}}` com resolver de escopo (`lead.*`, `ai.*`, `comprovante.*`, custom)
- Registry de campos customizados
- Tabela + serviço de `automation_logs`

**Feito quando:** publicar evento dispara handler; `render("Oi {{nome}}", ctx)` resolve; log grava.

## M2 — WhatsApp Provider
**Dep:** M1
- Interface `WhatsAppProvider` (connect, disconnect, status, sendText, sendMedia, onMessage)
- Implementação **Baileys** (QR code, sessão persistida em disco)
- Stub da Cloud API oficial (só a interface, sem credencial)
- Página `Conexões`: adicionar, QR, status, desconectar
- Ingestão: mensagem recebida → contato → conversa → mensagem → evento

**Feito quando:** QR conecta, mensagem recebida aparece no banco e emite evento.

## M3 — Inbox
**Dep:** M2
- Lista de conversas com abas `Aguardando / Atendendo / Resolvidos`
- Thread: texto, imagem, áudio, documento
- Enviar manual
- Toggle IA on/off por conversa
- Realtime (SSE)

**Feito quando:** conversa real aparece e responde pelo Inbox.

## M4 — CRM
**Dep:** M1
- Contatos + campos customizados
- **Etiquetas** (CRUD, aplicar/remover) ← bloqueia M5
- Pipeline + estágios + Kanban drag-and-drop
- Leads

**Feito quando:** etiqueta aplicada por API aparece no contato e no Kanban.

## M5 — Motor de automação + editor visual  ⟵ núcleo
**Dep:** M1, M4 (e M2/M3 para efeito real)
- Editor React Flow: paleta com busca, nós custom, edges com `sourceHandle`, minimapa, autosave, duplicar/excluir nó, pausar/arquivar
- Executor: `execute(context) -> { outputHandle, patch }`, fila, persistência de `flow_executions`
- Nós: **Início (trigger)**, **Mensagem** (multi-item + delay de digitando), **Aguarda Resposta** (timeout/indefinido/**buffer**/quote/react/campo, 2 saídas), **Etiquetas**, **Condicional** (E/OU, catálogo Sistema/Atendimento/Campos), **Intervalo**, **Notificação**, **Encerrar**, **Transferir para humano**
- Scheduler para timeout e intervalo

**Feito quando:** fluxo "recebeu msg → mensagem → aguarda resposta → etiqueta → condicional → mensagem" roda ponta a ponta no WhatsApp real.

## M6 — Atendimento humano
**Dep:** M3, M5
- Transferir para humano pausa a automação
- Status da conversa alimenta as condições de Atendimento
- Bloco `Controlador de Chat`

## M7 — Bloco de IA
**Dep:** M5
- `AIProvider`: OpenAI, Anthropic, Gemini
- Config inline no bloco + preset opcional (`ai_agents`)
- **Condicionais inteligentes (até 10, ordem = prioridade)** com saídas dinâmicas
- **Saída padrão obrigatória** quando há condicionais + **saída de erro**
- `ai.response` recebe a chave literal da condicional; só o fallback gera texto
- Contexto das últimas N interações (até 20)
- Entender áudio (transcrição) / imagem (visão)
- Log de tokens e custo

**Feito quando:** o fluxo do V1 (positivo/negativo/preço/dúvida + fallback + erro) roda igual ao vídeo.

## M8 — Comprovante e pagamento
**Dep:** M7
- Toggle `Identificar comprovante` → saída dedicada no topo + preenche `comprovante.*`
- `PaymentProvider` / `PixProvider`: `createPayment`, `getPaymentStatus`, `cancelPayment`
- Bloco `Botão PIX` (tipo de chave, chave, destinatário, valor)
- Bloco `Venda aprovada` (produto, preço, preço mínimo, validação contra `comprovante.valor`)

**Feito quando:** enviar comprovante pelo WhatsApp sai pela saída de comprovante e marca o pedido pago.

## M9 — Integrações
**Dep:** M5
- Bloco `HTTP Request` (method, URL, headers, body com variáveis, `response.*` no contexto)
- `POST /api/webhooks/{id}` → dispara fluxo
- Bloco `Conexão de Fluxo`
- Importar/exportar fluxo (JSON) + pastas

## M10 — Campanhas
**Dep:** M4, M5
- Segmentação por etiqueta, template com variáveis, agendamento, pausar/cancelar
- Templates de fluxo prontos: **follow-up** e **remarketing escalonado** (spec-gap B5)

## M11 — Analytics
**Dep:** M8, M10
- Métricas reais do dashboard (§3), incluindo vendas e taxa de conversão
- Relatórios de campanha e de execução

---

## Corte do MVP

O critério de conclusão da spec (§26, 15 itens) é satisfeito por **M0–M9**. M10 e M11 ficam fora do MVP.

## Ordem de execução

`M0 → M1 → M2 → M4 → M3 → M5 → M7 → M8 → M9 → M6` — M4 antes de M3 porque o motor (M5) depende de etiquetas e não do Inbox.
