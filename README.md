# ZapAI

Automação de WhatsApp com IA para uso próprio, inspirada no **Leona Flow**.

Você desenha um fluxo arrastando blocos (mensagem, espera, IA, etiqueta,
condicional, PIX…), liga o WhatsApp por QR code e o bot passa a atender sozinho:
responde, classifica a intenção do lead com IA, etiqueta, cobra por PIX e
transfere para você quando precisa de gente.

Sem login, sem multi-tenant, sem cobrança — por decisão de escopo (`spec.md` §28).

---

## O que você precisa

| | |
|---|---|
| Node.js | 20 ou mais novo |
| Docker | para o Postgres (sobe num container próprio, porta 55432) |
| Um número de WhatsApp | **não use o seu principal** — veja os avisos no fim |
| Chave de IA | opcional: sem chave o bloco de IA roda no modo local de teste |

## Instalar e rodar

```bash
npm install
cp .env.example .env   # no Windows: copy .env.example .env
npm run db:up          # sobe o Postgres no Docker
npm run db:push        # cria as tabelas
npm run seed           # pipeline, etiquetas e o fluxo de exemplo dos vídeos
npm run dev            # http://localhost:3737
```

Abra **http://localhost:3737**.

## Primeiro uso, na ordem

### 1. Conectar o WhatsApp

**Conexões → Adicionar → Conectar**. Um QR code aparece na tela. No celular:
*WhatsApp → Aparelhos conectados → Conectar aparelho* e leia o código.

O status vira `Conectado` e a sessão fica salva em `.wa-sessions/` — nas próximas
vezes ele reconecta sozinho quando o servidor sobe. Para sair, use **Desconectar**
(isso desloga o aparelho e exige um QR novo).

O botão **Testar** manda uma mensagem para um número à sua escolha: serve para
confirmar que o envio realmente passa, porque "conectado" não garante isso.

### 2. Colocar a chave de IA (opcional)

Preencha `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` ou `GOOGLE_API_KEY` no `.env` e
reinicie o `npm run dev`. Cada bloco de IA pode sobrescrever a chave e o modelo.

Sem chave nenhuma, escolha **`Local — sem chave (teste)`** no bloco de IA: um
classificador por palavras-chave decide as saídas. Não entende ironia nem
contexto, mas deixa o fluxo inteiro testável antes de gastar dinheiro.

### 3. Montar o fluxo

**Fluxos → + Novo Fluxo**, ou abra o **Exemplo — Cash on Delivery** que o seed
criou (ele reproduz a lógica ensinada nos vídeos do Leona).

No editor:

- busque na paleta à esquerda e clique num bloco para colocá-lo no canvas;
- arraste de uma **saída** (bolinha à direita) até a entrada de outro bloco para ligar;
- **lápis** edita, **cópia** duplica, **lixeira** exclui;
- o fluxo salva sozinho — o header mostra `Salvo às HH:MM:SS`.

### 4. Ativar

Um fluxo só responde quando está **Ativo** (botão no header do editor, ou o
badge na lista). Enquanto estiver pausado, ninguém recebe automação.

> Antes de ativar, edite o bloco **Botão PIX** do fluxo de exemplo: ele vem com
> a chave `COLOQUE-SUA-CHAVE-PIX-AQUI`. A tela de Início avisa em amarelo quando
> um fluxo ativo ainda está com a chave de exemplo.

---

## Os blocos

| Bloco | Para quê | Saídas |
|---|---|---|
| **Início** | dispara o fluxo (mensagem recebida, palavra-chave, novo contato, webhook) | 1 |
| **Mensagem** | texto, imagem, vídeo, áudio, arquivo ou pausa — vários itens no mesmo bloco, com *delay de digitando* | 1 |
| **Aguarda Resposta** | espera o lead. Timeout ou indefinido, **buffer** (agrupa as mensagens picadas numa variável só), citar/reagir à mensagem, salvar num campo | respondeu · não respondeu |
| **Bloco de IA** | classifica a resposta em **condicionais inteligentes** (até 10, ordem = prioridade) ou gera texto no fallback. Entende áudio e imagem, identifica comprovante | uma por condicional + padrão + erro |
| **Etiquetas** | adiciona ou remove etiquetas do contato | 1 |
| **Condicional** | ramifica por etiqueta, campo, horário ou status de atendimento (E / OU) | verdadeiro · falso |
| **Intervalo** | espera um tempo antes de seguir | 1 |
| **Notificação** | avisa um número seu (útil na saída de erro da IA) | 1 |
| **HTTP Request** | chama uma API externa e guarda o retorno em `response.*` | sucesso · erro |
| **Botão PIX** | manda a chave PIX para o lead pagar | 1 |
| **Venda Aprovada** | registra o pedido pago e valida o valor contra o comprovante | 1 |
| **Conexão de Fluxo** | continua a execução em outro fluxo | — |
| **Transferir para Humano** | pausa a automação e marca a conversa como *Atendendo* | 1 |
| **Encerrar** | termina a execução | — |

### Variáveis

Em texto, use `{{chave}}`. Ao **salvar** num campo (no Aguarda Resposta), escreva
o nome puro, sem chaves.

| Namespace | Exemplos |
|---|---|
| `lead.*` | `{{lead.nome}}`, `{{lead.telefone}}`, `{{lead.message}}` |
| `ai.*` | `{{ai.response}}`, `{{ai.error}}` |
| `comprovante.*` | `{{comprovante.valor}}`, `{{comprovante.pagador}}`, `{{comprovante.banco}}` |
| seus campos | o que você nomear no Aguarda Resposta, ex. `{{resposta}}` |

Numa saída condicional, `{{ai.response}}` recebe **a chave da saída** (ex.
`#positivo`), não um texto gerado. Só no fallback a IA escreve resposta livre —
é lá que faz sentido mandar `{{ai.response}}` para o lead.

---

## As telas

| Tela | O que faz |
|---|---|
| **Início** | números do dia, status da conexão e o aviso de "no ar" |
| **Chats ao vivo** | conversas em *Aguardando / Atendendo / Resolvidos*, envio manual, liga e desliga a IA por conversa |
| **Kanban** | leads pelo funil, arrastando entre os estágios |
| **Fluxos** | lista e editor visual |
| **Contatos / Etiquetas** | CRM: contatos, campos e etiquetas |
| **Webhooks** | `POST /api/webhooks/{slug}` dispara um fluxo de fora |
| **Conexões** | QR code, status, teste de envio |
| **Logs** | tudo que o motor fez: nó por nó, mensagens, tokens da IA |

---

## Testar sem gastar mensagem

```bash
npm run typecheck      # tsc
npm run test           # tudo: typecheck + classificador + blocos + motor + caminhos
npm run test:engine    # motor ponta a ponta com WhatsApp fake
npm run test:paths     # caminhos completos, inclusive comprovante -> venda aprovada
npm run build          # build de produção
```

Para testar com o WhatsApp de verdade, sem depender de um segundo celular, existe
uma rota **só de desenvolvimento** que injeta uma mensagem como se tivesse
chegado — o resto (motor, IA, envio) é real:

```bash
curl -X POST http://localhost:3737/api/dev/simulate \
  -H "content-type: application/json" \
  -d "{\"phone\":\"5511999999999\",\"text\":\"oi, vi o anuncio\",\"name\":\"Teste\"}"
```

Ela existe porque mandar mensagem para o próprio número não serve: o WhatsApp
marca essas com `fromMe` e o motor as ignora de propósito — senão o bot
conversaria consigo mesmo sem fim.

---

## Como funciona por dentro

```
WhatsApp (Baileys)
      ↓
  ingest.ts        persiste contato/conversa/mensagem, emite evento
      ↓
  engine.ts        executa nó → saída nomeada → próximo nó
      ↓
  ┌───────┬────────┬──────────┬─────────┐
  IA     CRM      HTTP       PIX      WhatsApp
```

Duas abstrações mantêm o motor independente de fornecedor:
`WhatsAppProvider` (`src/lib/whatsapp/types.ts`) e `AIProvider`
(`src/lib/ai/types.ts`). Trocar Baileys pela Cloud API oficial, ou GPT por
Claude, não toca em nenhum nó do motor.

O visual segue o Leona de propósito (`docs/video-analysis.md`): quem aprendeu
lá não precisa reaprender nada aqui.

## Documentos

| Arquivo | O que tem |
|---|---|
| `spec.md` | a especificação do produto |
| `docs/video-analysis.md` | o que os dois vídeos do Leona mostram — blocos, campos, padrões |
| `docs/spec-gap.md` | spec × vídeos: o que bate, o que não bate, o que falta |
| `docs/milestones.md` | milestones reordenados por dependência real |

Os artefatos dos vídeos (mp4, wav, frames, transcrição) ficam em `media/` e
**não estão no repositório** por causa do tamanho — `references.md` tem os links.

## O que ainda não tem

Campanhas (M10) e Analytics (M11) — ver `docs/milestones.md`. Tool calling da IA
ficou fora do MVP de propósito: `docs/spec-gap.md` §C1.

---

## Avisos

- **Baileys é não-oficial.** Risco de ban existe. Não use seu número pessoal principal.
- **Não há autenticação.** Não exponha a porta 3737 na internet.
- **O bloco de IA custa por mensagem.** Contexto de 20 interações + visão sai caro; acompanhe em **Logs**.
- **Fluxo ativo responde gente de verdade**, inclusive cobrando. Pause antes de mexer.
