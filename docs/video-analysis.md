# Análise dos vídeos — Leona Flow

Fonte: `references.md` (2 vídeos do YouTube), baixados em `media/`.

| # | ID | Duração | Título | Artefatos |
|---|----|---------|--------|-----------|
| V1 | `njFr6Ud8GOA` | 21:38 | Descomplicando o bloco de IA 2.0 | `media/v1/video.mp4`, `audio/audio_16k.wav`, `transcript.txt`, 86 frames |
| V2 | `oRpUm5xgqcM` | 27:22 | Leona Flow — Criando um fluxo do zero [Sem cortes] | `media/v2/video.mp4`, `audio/audio_16k.wav`, `transcript.txt`, 119 frames |

App observado: `app.leonasolutions.io`. Provider de WhatsApp visível nos tooltips: **UAZAPI** (não-oficial) + **WhatsApp Cloud API / Meta** (oficial). Confirma a abstração de provider da spec.

---

## 1. Navegação (sidebar)

`Início` · `Chats ao vivo` · `Kanban` · `Fluxos` · `Contatos` · `Webhooks de entrada` · `Conexões` · `Facebook` · `Equipe` · `Cobranças e assinaturas` · `Meu perfil` · `Configurações` · `Tutoriais e suporte`

Fora do nosso escopo (spec §28): Equipe, Cobranças e assinaturas, Meu perfil, Tutoriais.

## 2. Editor de fluxo

- Rota `/flows/{id}/edit`. Header: nome editável, `Salvo às HH:MM:SS` (autosave), `Pausar`, `Arquivar`.
- Canvas React-Flow-like: minimapa (canto inf. dir.), zoom in/out, fit-view, reset (canto inf. esq.).
- Paleta lateral com busca (`Buscar blocos...`).
- Cada nó no canvas tem ícones de **editar / duplicar / excluir** no header.
- Nós renderizam um **resumo da config** no corpo (ex.: bloco de IA lista suas saídas).
- Edges tracejadas; handles coloridos por saída (vermelho = saída de erro).
- Confirmação `Excluir Nó` ("Tem certeza que deseja excluir o nó 'X'?").
- Página `Fluxos`: `Importar Fluxo`, `Nova Pasta`, `+ Novo Fluxo` (pastas + import/export).

## 3. Blocos (paleta, observada)

`Mensagem` · `Etiquetas` · `Botão PIX` · `Menu` · `Carrossel` · `Aguarda Resposta` · `Controlador de Chat` · `Notificação` · `Condicional` · `Distribuidor` · (lista rolável — também citados: `Bloco de IA`, `Conexão de fluxo`, `Intervalo`, `Pixel`, `Venda aprovada`)

### 3.1 Mensagem
Conteúdo composto, múltiplos itens por bloco: **Texto · Imagem · Vídeo · Áudio · Intervalo · Contato · Arquivo · Sticker**.
Item de texto: editor rich (B / I / S / emoji / `<>` variáveis) + **"Delay do digitando"** (slider 3–60s) — *"Tempo que o WhatsApp fica digitando antes de enviar esta mensagem."*

### 3.2 Aguarda Resposta
Bloco central do produto. Campos:
- `Aguardar indefinidamente (sem encerrar automaticamente por tempo)` — toggle
- `Tempo máximo aguardando a resposta do lead` — número + unidade (Horas/Dias); *"Limite total 31 dias (máximo 744 horas)"*
- `Ativar buffer de mensagens` → `Buffer após a primeira resposta` (seg., ex. 15) — *"aguarda até N segundos e agrupa todas as mensagens do lead em uma única variável"*
- `Responder como resposta à mensagem do lead` (quote/reply do WhatsApp)
- `Reagir na mensagem do lead`
- `Campo para salvar a informação no usuário` — nome do campo **sem** chaves
- `Mensagem antes de aguardar a resposta` — rich text
- Duas saídas: **respondeu** e **não respondeu / timeout**

### 3.3 Bloco de IA — o diferencial
- `Provedor de IA`: GPT | Gemini
- `Chave da API`: valor direto ou `{{nome_da_variavel}}` (variável global)
- `Modelo`: dropdown (GPT-4o Legacy, GPT-5.4 Nano, ...)
- `Mensagem enviada ao modelo`: `{{lead.message}}` / `{{resposta}}` — precisa bater com o campo salvo no Aguarda Resposta
- `Enviar resposta automaticamente` — toggle (geralmente **off**, para tratar a resposta antes)
- Prompt / Comportamento (persona → produto → regras)
- Toggles de mídia: `Entender áudio` (transcreve), `Entender imagem` (visão), `Processar PDF`
- **`Identificar comprovante`** — *"Identifica comprovante de pagamento em imagem/PDF e extrai dados no lead. Vira uma saída do bloco (sempre no topo)."* Preenche `comprovante.*`: `valor`, `chave_pix`, `documento`, `pagador`, `recebedor`, `nome_pagador`, `nome_recebedor`, `data`, `banco`, `moeda`.
- **`Condicionais Inteligentes (até 10)`** — *"A IA classifica a resposta do cliente e segue a saída correspondente. **Ordem = prioridade**."*
  - Cada uma: `Prioridade N` + `Prompt da condição (máx. 100 caracteres)` + `Saída vinculada (será salvo no campo ai.response)`
- `Saída padrão` (obrigatória quando há condicionais — erro do backend: *"Config fallback_output_key é obrigatório quando há condicionais de saída"*). Quando nenhuma condição bate, a IA usa o prompt livre para **gerar** a resposta.
- `Manter contexto da conversa (últimas N interações)` — toggle (até 20)
- **Saída de erro** dedicada — *"Em caso de erro da IA o fluxo continua por aqui"* (handle vermelho)

Ordem de avaliação (de cima pra baixo): `comprovante` → condicionais por prioridade → `fallback` → `erro`.

Semântica-chave (V1 @09:30): numa condicional, `ai.response` recebe **literalmente** o texto da saída vinculada (ex. `#positivo`), **não** um texto gerado. Só no fallback a IA gera resposta livre. Por isso não se manda `{{ai.response}}` direto pro lead numa saída condicional.

### 3.4 Etiquetas
Multi-select de etiquetas + toggle `Remover etiquetas` / `Adicionar etiquetas`.

### 3.5 Condicional
- `Regra Lógica`: corresponde a **todas** (E) | **qualquer** (OU)
- Lista de condições + `+ Adicionar Condição`
- Catálogo de condições: **Sistema** (Etiqueta, Dia da semana, Hora, Data) · **Atendimento** (Aguardando, Atendendo, Resolvidos) · **Atendente** (Atendente ativo do chat) · **Campos** (campos customizados)
- Operadores: `Igual` / `Diferente`
- Duas saídas: verdadeiro (superior) e falso

### 3.6 Botão PIX
`Tipo da Chave PIX` (Chave Aleatória, CPF, e-mail, ...) · `Chave PIX` (validado por tipo) · `Destinatário do pagamento` · `Valor (R$)`.
*"Envia um botão PIX para o cliente... O mesmo bloco pode ser usado em conexões padrão e na integração oficial."* Destinatário e valor são obrigatórios na Cloud API oficial (EMV).

### 3.7 Outros
- **Venda aprovada / Pedido**: nome do produto, preço, preço mínimo, campo de valor, campo de moeda, emissão de nota (opcional). Marca a venda.
- **Pixel**: dispara evento pra Meta/Facebook Ads (chave do pixel, valor do item, moeda).
- **Notificação**: avisa um número próprio — usado na saída de erro da IA com os campos de erro.
- **Conexão de fluxo**: pula para outro fluxo (mantém fluxos enxutos).
- **Intervalo / Intervalo inteligente**: espera N dias/horas antes do próximo bloco.
- **Menu / Carrossel / Distribuidor / Controlador de Chat**: menu de opções, carrossel WhatsApp com REPLY persistente, distribuição entre atendentes, controle de atendimento humano.

## 4. Inbox (`Chats ao vivo`)
- Coluna esquerda: busca, filtro, `+`; abas `Todos / Não lidas / Não respondidas`; sub-abas **`Aguardando / Atendendo / Resolvidos`** (o status que alimenta as condições de Atendimento).
- Lista: avatar, nome, prévia, hora, badge de conexão + tipo de mídia.
- Conversa: header com ações (atribuir atendente, agendar, sincronizar), bolhas in/out, composer com anexo, documento, **$ (cobrança/PIX)**, áudio, emoji.

## 5. Variáveis e campos
- Uso em texto: `{{campo}}`. Ao **salvar** num campo: nome puro, sem chaves.
- Padrão do sistema vs. **campos customizados** criados pelo usuário.
- Seletor `<>` no editor lista os campos disponíveis.
- Namespaces observados: `lead.*`, `ai.response`, `comprovante.*`, além dos customizados.

## 6. Padrões de automação ensinados (lógica, não UI)
1. **Etiqueta de estágio + condicional de etiqueta** no início de cada parte do fluxo → idempotência: se o lead reentrar no anúncio, pula o que já recebeu.
2. **Anti-loop de downsell**: antes de ofertar, checa a etiqueta `downsell`; se já tem, encerra como lead perdido.
3. **Remarketing escalonado**: `remarket_1`, `remarket_2`, `remarket_3` como etiquetas; condicionais em cadeia decidem onde o lead reentra, evitando repetir mensagem.
4. **Loop de objeção**: fallback da IA → envia `{{ai.response}}` → volta pro mesmo Aguarda Resposta (reaproveita o mesmo bloco em vez de duplicar).
5. **Saída de erro → Notificação** pro número do dono.
6. Buffer de mensagens resolve o lead que manda "oi" / "tudo bem?" / assunto em 3 mensagens.
