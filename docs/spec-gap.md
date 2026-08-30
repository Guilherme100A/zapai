# Spec × Vídeos — o que bate e o que não bate

Comparação entre `spec.md` (PRD v1.0) e o comportamento real do Leona Flow observado em `docs/video-analysis.md`.

Legenda: ✅ bate · ⚠️ bate parcialmente / precisa ajuste · ❌ não bate · ➕ existe no vídeo e falta na spec

---

## A. Bate ✅

| Spec | Confirmação no vídeo |
|---|---|
| §2 Abstração `WhatsAppProvider` (Oficial + Local) | O bloco PIX diz explicitamente *"pode ser usado em conexões padrão e na integração oficial"*; tooltips citam UAZAPI e WhatsApp Cloud API/Meta. A abstração é real, não teórica. |
| §2 Abstração `AIProvider` multi-modelo | Bloco de IA tem `Provedor de IA` (GPT/Gemini) + `Modelo` por bloco. |
| §6 Agente com modelo, prompt, memória | Existe como config **do bloco**, não como entidade separada (ver ⚠️ B1). |
| §7 Memória da conversa | `Manter contexto da conversa (últimas N interações)`, até 20. |
| §9 Construtor visual React Flow | Canvas com nós, edges, minimapa, zoom, fit-view. Confirmado. |
| §9 Nodes: Mensagem, IA, Condições, CRM (tag), Controle (delay, esperar msg, transferir humano) | Todos presentes na paleta. |
| §11/§12 CRM Kanban + tags | `Kanban` na sidebar; etiquetas são o mecanismo central de todo o fluxo. |
| §16 Webhooks | `Webhooks de entrada` na sidebar. |
| §17 Pix como provider | Bloco `Botão PIX` + bloco `Venda aprovada` + confirmação de pagamento por comprovante. |
| §19 Motor de automação com `execute(context)` por node | A arquitetura observada é exatamente essa: nó → saída nomeada → próximo nó. |
| §21 Logs | Saída de erro por bloco + bloco `Notificação` para erro; app salva execuções. |
| §5 Inbox tipo WhatsApp Web/CRM | `Chats ao vivo` bate quase 1:1 com o layout da spec. |

## B. Bate parcialmente ⚠️ — ajustes necessários

**B1. "Agente de IA" é config de bloco, não entidade global.**
A spec (§6) modela `ai_agents` como tabela com Nome/Descrição/Modelo/Prompt/Temperatura/Memória/Ferramentas, e o fluxo teria um node "Executar agente". No Leona, **cada bloco de IA carrega sua própria config** (provider, key, modelo, prompt, condicionais, toggles de mídia). Não existe biblioteca de agentes reutilizáveis.
→ **Decisão:** manter a tabela `ai_agents` como *preset opcional* (reuso de prompt/modelo), mas o bloco de IA deve funcionar 100% standalone com config inline. O node referencia um agente **ou** traz config própria. Sem isso, o fluxo do vídeo não é reproduzível.

**B2. Condicionais da IA — a spec não tem esse conceito.**
Spec §9 lista apenas `Executar agente / Perguntar à IA / Classificar mensagem`. O que o Leona faz é bem mais específico e é *o* recurso central dos dois vídeos: **até 10 condicionais inteligentes, ordenadas por prioridade, cada uma com prompt de ≤100 chars e uma saída nomeada**, mais saída padrão obrigatória, mais saída de erro. O nó tem N saídas, não 1.
→ **Decisão:** o `AINode` precisa de saídas dinâmicas. Isso muda o schema de `flow_edges` (edge precisa de `source_handle`).

**B3. `Aguardar mensagem` é muito mais rico que a spec sugere.**
Spec §9 cita só "Esperar mensagem" em Controle. O bloco real tem timeout com unidade, modo indefinido, **buffer de agrupamento de mensagens**, quote-reply, reação, e campo de destino. E tem **duas saídas** (respondeu / timeout) — é o que viabiliza todo follow-up.
→ **Decisão:** implementar completo em M5; o buffer é requisito, não enfeite.

**B4. Variáveis: a spec fala de `{{nome}}` só em campanhas (§13).**
Na prática o sistema inteiro é movido por variáveis: `{{lead.message}}`, `{{ai.response}}`, `{{comprovante.valor}}`, campos customizados criados pelo usuário. E há uma regra de sintaxe: **com chaves para ler, sem chaves para escrever**.
→ **Decisão:** motor de templating + registry de campos customizados vira dependência de M4/M5, não de M8.

**B5. Follow-up (§14) não é uma feature separada.**
A spec desenha follow-up como automação própria com "tentativas". No Leona, follow-up é **emergente**: saída de timeout do Aguarda Resposta + etiqueta + condicional de etiqueta. Não existe tela de follow-up.
→ **Decisão:** não construir motor de follow-up separado. Entregar como template de fluxo pronto. Economiza um milestone inteiro.

**B6. Status de atendimento não está modelado na spec.**
As condições `Aguardando / Atendendo / Resolvidos` aparecem no Inbox e no catálogo de condições. A spec só tem "Transferir conversa para humano".
→ **Decisão:** `conversations.status` enum com esses três valores + toggle de IA por conversa.

**B7. §23 tabela `flow_edges` sem `source_handle`.**
Sem isso, um nó com múltiplas saídas nomeadas (IA, condicional, aguarda resposta) é irrepresentável. É um bug de modelagem, não uma opinião.

## C. Não bate ❌

**C1. §8 "Tools da IA" (function calling) não existe no Leona.**
A spec §8 propõe `consultar_produto()`, `criar_pedido()`, `gerar_pix()` etc. via tool calling. Nos vídeos, a IA **não executa ferramenta nenhuma** — ela só classifica a resposta e gera texto. Toda ação (PIX, etiqueta, pedido, HTTP) é feita por **blocos do fluxo**, não pela IA.
→ **Não é erro da spec** — é uma escolha de arquitetura mais ambiciosa que o Leona. Mas é a parte mais cara e menos validada. **Recomendo empurrar para depois do MVP** e deixar o motor de tools plugável. O critério de conclusão (§26) não exige tool calling.

**C2. §3 Dashboard com "Vendas" e "Taxa de conversão" já no M1.**
Essas métricas dependem de pagamento confirmado (M9) e de leads qualificados (M6). No M1 elas seriam zeros fixos.
→ Dashboard entra em duas fases: estrutura + métricas reais quando as fontes existirem.

**C3. §25 ordem dos milestones tem dependências invertidas.**
- M4 (IA) antes de M5 (automação) — mas o bloco de IA **só faz sentido dentro de um fluxo**, com saídas ligadas a outros nós. Testar IA sem motor é testar no vácuo.
- M7 (integrações/variáveis/eventos) depois de M5/M6 — mas **variáveis e eventos são infraestrutura** de que M5 depende. Ordem impossível.
- M6 (CRM/tags) depois de M5 — mas o fluxo do vídeo **não funciona sem etiquetas**: idempotência, anti-loop e remarketing são todos baseados em tag. Tags têm que vir antes ou junto do motor.
→ Reordenado em `docs/milestones.md`.

**C4. §22 "As chaves podem ficar no .env".**
No Leona a chave de API é por bloco, com suporte a variável global. Como é uso próprio, `.env` basta como *default*, mas o bloco precisa poder sobrescrever — senão não dá pra ter modelos diferentes por fluxo.

## D. Existe no vídeo, falta na spec ➕

| Item | Por que importa |
|---|---|
| **Identificar comprovante** (extrai `comprovante.*` de imagem/PDF) | É o fluxo de confirmação de pagamento inteiro. Substitui integração bancária no cash-on-delivery. |
| **Delay do "digitando"** por mensagem (3–60s) | Naturalidade do bot; aparece em toda mensagem. |
| **Buffer de mensagens** | Resolve o lead que manda 3 mensagens seguidas — citado nos dois vídeos como problema histórico. |
| **Saída de erro por bloco de IA** + bloco `Notificação` | Observabilidade operacional. |
| **Bloco Menu, Carrossel, Distribuidor, Controlador de Chat** | Blocos reais da paleta, sem par na spec. |
| **Bloco Pixel (Meta Ads)** | Citado como "o que todo mundo usa" para otimizar campanha. |
| **Bloco Conexão de Fluxo** | Como se mantém fluxos enxutos; sem ele fluxos grandes viram ingerenciáveis. |
| **Pastas + Importar/Exportar fluxo** | Organização; export/import é como se compartilha fluxo. |
| **Autosave do editor** (`Salvo às HH:MM:SS`) | Comportamento esperado do editor. |
| **Duplicar nó** | Usado o tempo todo nos vídeos ("copiei e joguei aqui na frente"). |
| **Pausar / Arquivar fluxo** | Controle de ciclo de vida. |

## E. Riscos

1. **Baileys (não-oficial) = risco de ban.** Uso próprio, aceito, mas o provider precisa ser trocável e o número não deve ser o pessoal principal.
2. **`Identificar comprovante` depende de modelo com visão** — GPT-4o/5 ou Gemini. Nano/mini barato pode não dar conta de PDF.
3. **Condicional de 100 chars** é limitação de UI do Leona, não técnica. Vou manter o limite para paridade, mas configurável.
4. **Custo de IA por mensagem**: com contexto de 20 interações + visão, cada lead sai caro. Precisa de log de tokens desde o M4.
