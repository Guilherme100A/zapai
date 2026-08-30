import Anthropic from "@anthropic-ai/sdk";
import type {
  AICompleteParams,
  AICompletion,
  AIProvider,
  AIProviderId,
} from "./types";

/* ------------------------------------------------------------- anthropic -- */

class AnthropicProvider implements AIProvider {
  readonly id = "anthropic" as const;
  constructor(private apiKey: string) {}

  async complete(p: AICompleteParams): Promise<AICompletion> {
    const client = new Anthropic({ apiKey: this.apiKey });

    const content: Anthropic.ContentBlockParam[] = [];
    for (const att of p.attachments ?? []) {
      if (att.kind === "image") {
        content.push({
          type: "image",
          source: { type: "base64", media_type: att.mimeType as never, data: att.data },
        });
      } else {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: att.data },
        });
      }
    }
    const last = p.messages[p.messages.length - 1];
    const history = p.messages.slice(0, -1);
    content.push({ type: "text", text: last?.content ?? "" });

    const response = await client.messages.create({
      model: p.model,
      max_tokens: p.maxTokens ?? 4096,
      system: p.system,
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content },
      ],
      ...(p.jsonSchema
        ? { output_config: { format: { type: "json_schema" as const, schema: p.jsonSchema } } }
        : {}),
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

/* ---------------------------------------------------------------- openai -- */

class OpenAIProvider implements AIProvider {
  readonly id = "openai" as const;
  constructor(private apiKey: string) {}

  async complete(p: AICompleteParams): Promise<AICompletion> {
    const last = p.messages[p.messages.length - 1];
    const history = p.messages.slice(0, -1);

    const userContent: unknown[] = [{ type: "text", text: last?.content ?? "" }];
    for (const att of p.attachments ?? []) {
      if (att.kind === "image") {
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${att.mimeType};base64,${att.data}` },
        });
      }
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: p.model,
        temperature: p.temperature,
        max_tokens: p.maxTokens ?? 4096,
        messages: [
          ...(p.system ? [{ role: "system", content: p.system }] : []),
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userContent },
        ],
        ...(p.jsonSchema ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const json = await res.json();

    return {
      text: json.choices?.[0]?.message?.content ?? "",
      model: json.model ?? p.model,
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }
}

/* ---------------------------------------------------------------- gemini -- */

class GeminiProvider implements AIProvider {
  readonly id = "gemini" as const;
  constructor(private apiKey: string) {}

  async complete(p: AICompleteParams): Promise<AICompletion> {
    const last = p.messages[p.messages.length - 1];
    const history = p.messages.slice(0, -1);

    const parts: unknown[] = [{ text: last?.content ?? "" }];
    for (const att of p.attachments ?? []) {
      parts.push({ inline_data: { mime_type: att.mimeType, data: att.data } });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(p.system ? { system_instruction: { parts: [{ text: p.system }] } } : {}),
        contents: [
          ...history.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          { role: "user", parts },
        ],
        generationConfig: {
          temperature: p.temperature,
          maxOutputTokens: p.maxTokens ?? 4096,
          ...(p.jsonSchema ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });

    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const json = await res.json();

    const text =
      json.candidates?.[0]?.content?.parts?.map((x: { text?: string }) => x.text ?? "").join("") ??
      "";

    return {
      text,
      model: p.model,
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}

/* -------------------------------------------------------------- factory --- */

/**
 * A chave vem do bloco (que pode referenciar {{variavel}}) ou, se vazia, do .env.
 * Espelha o campo "Chave da API" do bloco de IA do Leona.
 */
export function getAIProvider(provider: AIProviderId, apiKey?: string): AIProvider {
  if (provider === "local") throw new Error("Provedor local nao usa chave de API");

  const key =
    apiKey?.trim() ||
    (provider === "openai"
      ? process.env.OPENAI_API_KEY
      : provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.GOOGLE_API_KEY);

  if (!key) {
    throw new Error(
      `Sem chave de API para "${provider}". Preencha no bloco de IA ou no .env.`,
    );
  }

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(key);
    case "openai":
      return new OpenAIProvider(key);
    case "gemini":
      return new GeminiProvider(key);
  }
}
