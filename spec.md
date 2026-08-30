# PRD — WhatsApp AI Automation

**Versão:** 1.0
**Tipo:** Aplicação local / uso pessoal
**Objetivo:** Criar uma plataforma própria de automação do WhatsApp inspirada no Leona Flow, com foco em automação visual, atendimento por IA, gerenciamento de conversas e integrações.

---

# 1. Objetivo

Construir uma aplicação web local que permita controlar um ou mais números de WhatsApp e criar automações de atendimento e vendas através de:

* Fluxos visuais;
* Regras condicionais;
* IA;
* Atendimento manual;
* CRM;
* Campanhas;
* Webhooks;
* HTTP Requests;
* Integração com APIs externas;
* Métricas.

A aplicação será utilizada apenas pelo proprietário.

**Não implementar nesta versão:**

* Sistema de cadastro;
* Login;
* Multi-tenancy;
* Sistema de assinatura;
* Cobrança da plataforma;
* Permissões complexas;
* Segurança enterprise;
* Página pública;
* Sistema de clientes/SaaS.

---

# 2. Stack

## Frontend

* Next.js
* TypeScript
* React
* Tailwind CSS
* React Flow

## Backend

* Next.js API Routes ou Hono
* TypeScript

## Banco

* PostgreSQL
* Drizzle ORM

## IA

Criar uma camada de abstração:

```text
AIProvider
├── OpenAI
├── Anthropic
└── Google Gemini
```

O usuário deve conseguir selecionar qual modelo será utilizado por cada agente.

## WhatsApp

Criar uma camada de provider:

```text
WhatsAppProvider
├── Official API
└── Local/Unofficial Provider
```

O restante do sistema não deve depender diretamente de uma implementação específica de WhatsApp.

---

# 3. Dashboard

A página inicial deverá mostrar:

### Métricas

* Conversas hoje;
* Conversas abertas;
* Leads novos;
* Leads qualificados;
* Mensagens enviadas;
* Mensagens recebidas;
* Vendas;
* Taxa de conversão.

### Atividade recente

Mostrar:

* Últimas conversas;
* Últimos leads;
* Últimas automações executadas;
* Últimos erros.

### Status

Mostrar:

```text
WhatsApp
● Conectado

IA
● Online

Automação
● Ativa
```

---

# 4. Gerenciamento de WhatsApp

Criar página:

```text
WhatsApp
```

Permitir:

* Adicionar conexão;
* Remover conexão;
* Conectar;
* Desconectar;
* Ver status;
* Ver número;
* Ver última sincronização.

Exemplo:

```text
WhatsApp

┌─────────────────────────────────────┐
│ +55 11 99999-9999                  │
│ ● Conectado                         │
│                                     │
│ [Abrir Inbox] [Configurações]      │
└─────────────────────────────────────┘
```

A arquitetura deve permitir futuramente múltiplas conexões.

---

# 5. Inbox

Criar uma interface semelhante a um WhatsApp Web/CRM.

Layout:

```text
┌──────────────┬──────────────────────────────┐
│ Conversas    │ Conversa                     │
│              │                              │
│ João         │ João                         │
│ Maria        │ ───────────────────────────  │
│ Pedro        │ Cliente: Oi                  │
│              │ IA: Olá! Como posso ajudar? │
│              │                              │
│              │ [Digite uma mensagem...]     │
└──────────────┴──────────────────────────────┘
```

Funcionalidades:

* Receber mensagens;
* Enviar mensagens;
* Histórico;
* Texto;
* Imagens;
* Áudios;
* Documentos;
* Emojis;
* Responder manualmente;
* Ativar/desativar IA;
* Transferir conversa para humano;
* Executar fluxo;
* Adicionar tags.

---

# 6. Agente de IA

Criar sistema de agentes.

Cada agente deverá possuir:

```text
Nome
Descrição
Modelo
System Prompt
Temperatura
Memória
Ferramentas
```

Exemplo:

```text
Agente: Vendedor

Modelo:
Claude / GPT / Gemini

Prompt:

Você é um vendedor especializado em...

Objetivo:
Qualificar o cliente e realizar a venda.

Ferramentas:
- consultar_produto
- consultar_estoque
- criar_pedido
- gerar_pix
```

A IA deverá conseguir:

* Entender contexto;
* Manter histórico da conversa;
* Fazer perguntas;
* Responder dúvidas;
* Consultar informações;
* Executar ferramentas;
* Qualificar leads;
* Transferir para humano.

O Leona apresenta justamente esse conceito de IA contextual, qualificação, múltiplos modelos e transferência para humano.

---

# 7. Memória da IA

Cada conversa deverá possuir memória.

Exemplo:

```json
{
  "nome": "João",
  "interesse": "Produto X",
  "orcamento": "R$500",
  "cidade": "São Paulo",
  "status": "lead_quente"
}
```

A IA poderá utilizar essas informações durante a conversa.

Criar:

```text
Conversation Memory
```

com:

* fatos;
* preferências;
* dados coletados;
* resumo da conversa;
* variáveis.

---

# 8. Tools da IA

Permitir que agentes executem ferramentas.

Exemplo:

```text
consultar_produto()
consultar_estoque()
consultar_pedido()
criar_pedido()
gerar_pix()
enviar_mensagem()
adicionar_tag()
mover_pipeline()
transferir_humano()
```

Arquitetura:

```text
Cliente
   ↓
IA
   ↓
Tool
   ↓
Sistema
   ↓
Resultado
   ↓
IA
   ↓
Cliente
```

---

# 9. Construtor Visual de Fluxos

Criar editor baseado em React Flow.

O usuário poderá criar:

```text
Mensagem recebida
       ↓
     Condição
    /        \
   /          \
IA            Menu
↓              ↓
Venda       Suporte
```

## Nodes

Criar inicialmente:

### Trigger

* Mensagem recebida;
* Palavra-chave;
* Novo contato;
* Evento externo;
* Webhook.

### Mensagem

* Enviar texto;
* Enviar imagem;
* Enviar documento;
* Enviar áudio.

### IA

* Executar agente;
* Perguntar à IA;
* Classificar mensagem.

### Condições

* If/Else;
* Palavra contém;
* Tag possui;
* Horário;
* Variável;
* Status do lead.

### CRM

* Adicionar tag;
* Remover tag;
* Alterar estágio;
* Criar lead.

### Integrações

* HTTP Request;
* Webhook;
* Executar função.

### Controle

* Delay;
* Esperar mensagem;
* Encerrar fluxo;
* Transferir para humano.

---

# 10. Exemplo de automação

Fluxo:

```text
Mensagem recebida
        ↓
      IA
        ↓
Identificar intenção
        ↓
 ┌──────┼────────┐
 ↓      ↓        ↓
Venda Suporte  Outro
 ↓      ↓        ↓
Agente FAQ     Humano
 ↓
Qualificar
 ↓
Consultar produto
 ↓
Enviar oferta
 ↓
Cliente aceita?
 ├── NÃO → Follow-up
 └── SIM
      ↓
   Gerar Pix
      ↓
Aguardar pagamento
      ↓
Confirmar pagamento
      ↓
Finalizar pedido
```

---

# 11. CRM

Criar página:

```text
CRM
```

Visual Kanban:

```text
NOVOS
────────────
João
Maria

QUALIFICADOS
────────────
Pedro

NEGOCIAÇÃO
────────────
Carlos

VENDA
────────────
Ana
```

Cada lead deverá possuir:

* Nome;
* Telefone;
* Tags;
* Status;
* Valor;
* Origem;
* Última interação;
* Responsável;
* Histórico;
* Campos personalizados.

O Leona também apresenta um CRM Kanban integrado às conversas.

---

# 12. Tags

Permitir criar tags:

```text
cliente
lead
lead_quente
lead_frio
interessado
comprou
aguardando_pagamento
suporte
```

As tags poderão ser utilizadas nos fluxos.

Exemplo:

```text
IF tag == "lead_quente"
       ↓
Enviar para vendedor
```

---

# 13. Campanhas

Criar página:

```text
Campanhas
```

Permitir:

* Criar campanha;
* Selecionar contatos;
* Filtrar por tags;
* Personalizar mensagem;
* Agendar;
* Iniciar;
* Pausar;
* Cancelar;
* Ver resultados.

Variáveis:

```text
{{nome}}
{{produto}}
{{cidade}}
{{valor}}
```

Exemplo:

```text
Olá {{nome}}, vimos que você
demonstrou interesse em {{produto}}.
```

O Leona possui campanhas segmentadas, agendamento, personalização e relatórios.

---

# 14. Follow-up

Criar automação:

```text
Cliente não respondeu
        ↓
aguardar 2 horas
        ↓
enviar mensagem
        ↓
aguardar 24 horas
        ↓
enviar segunda mensagem
        ↓
encerrar
```

Configurações:

* Tempo de espera;
* Número de tentativas;
* Mensagem;
* Condição de saída.

---

# 15. HTTP Request

Node:

```text
HTTP Request
```

Configurações:

```text
Method:
GET / POST / PUT / DELETE

URL:
https://api.exemplo.com

Headers:
Authorization: ...

Body:
{
  "phone": "{{phone}}"
}
```

Resultado:

```text
response.data
```

pode ser utilizado posteriormente no fluxo.

---

# 16. Webhooks

Criar endpoints:

```text
POST /api/webhooks/{id}
```

Quando receber um evento:

```text
Webhook
   ↓
Fluxo
   ↓
Processamento
```

Exemplos:

```text
Pagamento aprovado
Pedido criado
Novo lead
Evento externo
```

O Leona oferece webhooks e HTTP Requests para integração com sistemas externos.

---

# 17. Pix

Criar abstração:

```text
PaymentProvider
```

Inicialmente:

```text
PixProvider
```

Funções:

```text
createPayment()
getPaymentStatus()
cancelPayment()
```

Fluxo:

```text
Cliente compra
      ↓
Criar Pix
      ↓
Enviar QR Code / código
      ↓
Webhook pagamento
      ↓
Pagamento confirmado
      ↓
Atualizar pedido
```

---

# 18. Integração com sistemas externos

Criar sistema genérico de integrações.

Exemplo:

```text
WhatsApp
   ↓
Automation Engine
   ↓
HTTP
   ↓
Meu sistema
```

Possibilitar integração com:

* APIs próprias;
* E-commerce;
* ERP;
* CRM;
* Gateway de pagamento;
* Banco de dados;
* Webhooks.

---

# 19. Motor de automação

Criar um serviço responsável por executar os fluxos.

Arquitetura:

```text
WhatsApp Event
      ↓
Event Processor
      ↓
Automation Engine
      ↓
Node Executor
      ↓
Next Node
      ↓
WhatsApp / IA / HTTP / CRM
```

Cada node deverá implementar:

```typescript
execute(context)
```

Exemplo:

```text
MessageNode
ConditionNode
AINode
DelayNode
WebhookNode
HttpNode
TagNode
HumanNode
```

---

# 20. Sistema de eventos

Eventos internos:

```text
MESSAGE_RECEIVED
MESSAGE_SENT
CONVERSATION_CREATED
CONVERSATION_UPDATED
LEAD_CREATED
LEAD_UPDATED
TAG_ADDED
PAYMENT_CREATED
PAYMENT_PAID
FLOW_STARTED
FLOW_FINISHED
AI_STARTED
AI_FINISHED
```

Isso permitirá conectar funcionalidades sem criar dependências fortes entre elas.

---

# 21. Logs

Criar página:

```text
Logs
```

Mostrar:

```text
14:32:01
FLOW_STARTED

14:32:02
AI_STARTED

14:32:05
AI_TOOL_EXECUTED

14:32:06
MESSAGE_SENT
```

Cada execução deverá possuir:

* Timestamp;
* Tipo;
* Conversa;
* Fluxo;
* Node;
* Resultado;
* Erro.

---

# 22. Configurações

Página:

```text
Configurações
```

### IA

* OpenAI API Key;
* Anthropic API Key;
* Google API Key;
* Modelo padrão.

### WhatsApp

* Provider;
* Credenciais;
* Conexões.

### Integrações

* Webhooks;
* APIs;
* Pix.

### Sistema

* Nome;
* Timezone;
* Configurações gerais.

As chaves podem ficar em `.env`.

---

# 23. Banco de dados

Tabelas principais:

```text
whatsapp_connections

contacts

conversations

messages

conversation_memory

tags

contact_tags

pipelines

pipeline_stages

leads

flows

flow_nodes

flow_edges

flow_executions

ai_agents

ai_tools

campaigns

campaign_contacts

scheduled_messages

webhooks

integrations

payments

automation_logs
```

---

# 24. Arquitetura

```text
                    ┌───────────────┐
                    │   WhatsApp    │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │ Event Handler │
                    └───────┬───────┘
                            ↓
                  ┌───────────────────┐
                  │ Automation Engine │
                  └─────────┬─────────┘
                            ↓
              ┌─────────────┼─────────────┐
              ↓             ↓             ↓
             IA           CRM          HTTP
              ↓             ↓             ↓
           Tools         Leads       APIs externas
              ↓
           WhatsApp
```

Frontend:

```text
Next.js
   ↓
Dashboard
Inbox
CRM
Flows
Campaigns
Agents
Integrations
Logs
Settings
```

---

# 25. MVP

A primeira versão NÃO deve implementar tudo.

Implementar nesta ordem:

### M1 — Base

* Next.js;
* TypeScript;
* PostgreSQL;
* Drizzle;
* Layout;
* Dashboard.

### M2 — WhatsApp

* Provider abstraction;
* Conexão;
* Receber mensagens;
* Enviar mensagens;
* Histórico.

### M3 — Inbox

* Lista de conversas;
* Chat;
* Mensagens;
* Controle IA/Humano.

### M4 — IA

* OpenAI;
* Anthropic;
* Gemini;
* Agentes;
* System Prompt;
* Memória;
* Tool calling.

### M5 — Automação

* React Flow;
* Nodes;
* Edges;
* Executor;
* Triggers;
* Conditions;
* Messages;
* IA;
* Delay.

### M6 — CRM

* Contatos;
* Leads;
* Tags;
* Pipeline;
* Kanban.

### M7 — Integrações

* HTTP Request;
* Webhooks;
* Variáveis;
* Eventos.

### M8 — Campanhas

* Segmentação;
* Templates;
* Agendamento;
* Follow-up.

### M9 — Pagamentos

* Pix;
* Webhook;
* Status de pagamento.

### M10 — Analytics

* Conversas;
* Leads;
* Conversão;
* Mensagens;
* Campanhas;
* Execuções.

---

# 26. Critério de conclusão do MVP

O projeto será considerado funcional quando for possível:

1. Conectar um WhatsApp;
2. Receber uma mensagem;
3. Visualizar a mensagem no Inbox;
4. Responder manualmente;
5. Ativar um agente de IA;
6. Fazer a IA responder;
7. Criar um fluxo visual;
8. Fazer o fluxo reagir a uma mensagem;
9. Executar condições;
10. Chamar uma API externa;
11. Criar/atualizar um lead;
12. Adicionar tags;
13. Mover o lead no Kanban;
14. Executar follow-up;
15. Visualizar logs da automação.

---

# 27. Princípio arquitetural

A aplicação deve ser construída como **um motor de automação**, e não como um conjunto de funcionalidades isoladas.

O conceito central é:

```text
EVENTO
  ↓
TRIGGER
  ↓
FLOW
  ↓
NODE
  ↓
ACTION
  ↓
EVENTO
```

A IA é apenas mais um componente do motor:

```text
                    Automation Engine
                           │
       ┌───────────┬───────┼────────┬───────────┐
       ↓           ↓       ↓        ↓           ↓
    WhatsApp      IA      CRM      HTTP       Payment
```

Isso permitirá adicionar novas funcionalidades futuramente sem reescrever o sistema inteiro.

---

# 28. Fora do escopo

Não implementar inicialmente:

* Login;
* Cadastro;
* Multi-tenant;
* SaaS;
* Billing;
* Planos;
* Marketplace;
* Aplicativo mobile;
* Sistema de permissões complexo;
* White-label;
* Página pública;
* Afiliados;
* Sistema de suporte;
* Segurança enterprise.

O objetivo é **uma ferramenta interna funcional para uso próprio**.
