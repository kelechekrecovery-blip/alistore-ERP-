/**
 * Provider-neutral LLM port for the AI layer (Phase 11+). Every LLM-backed AI feature
 * talks to this interface instead of a specific vendor SDK, so the source can be swapped
 * — Anthropic (Claude), OpenRouter, or none (keyless rule engine) — without touching
 * callers. Keys live server-side only and never reach the client.
 *
 * Three capabilities are modelled explicitly (vision, tools, structured output) because
 * they differ by provider: the OpenRouter transport is text-only, while the Anthropic
 * client supports image content blocks, an agentic tool loop, and schema-validated JSON.
 * Callers check the capability flags and degrade (or fall back to rules) when unsupported.
 */

/** A text span in a multimodal message. */
export interface LlmTextBlock {
  type: 'text';
  text: string;
}

/** An inline image (base64) in a multimodal message — enables real vision analysis. */
export interface LlmImageBlock {
  type: 'image';
  /** One of the vision-capable media types. */
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  /** Base64-encoded bytes, no data: prefix. */
  dataBase64: string;
}

export type LlmContent = string | Array<LlmTextBlock | LlmImageBlock>;

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: LlmContent;
}

/**
 * A client-side tool the model may call. `run` executes server-side (never in the
 * browser) and returns a string result fed back to the model. Used for the agentic
 * owner-assistant path (query merchandising signals on demand).
 */
export interface LlmToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool input (object schema). */
  inputSchema: Record<string, unknown>;
  run(input: unknown): Promise<string>;
}

export interface LlmChatOptions {
  /** System prompt (stable prefix — cache it via `cacheSystem`). */
  system?: string;
  /** When set, constrain the answer to this JSON Schema (structured output). */
  jsonSchema?: Record<string, unknown>;
  /** When set, run an agentic tool loop until the model stops calling tools. */
  tools?: LlmToolDef[];
  /** Cache the system prefix (prompt caching) — worth it for large stable prompts. */
  cacheSystem?: boolean;
  maxTokens?: number;
  /** Per-call model override (e.g. a cheaper model for high-volume paths). */
  model?: string;
}

export interface LlmChatResult {
  /** The assistant's final text (joined text blocks). For a JSON path, the raw JSON. */
  text: string;
  /** Present when `jsonSchema` was supplied and the reply parsed — the validated object. */
  parsed?: unknown;
  /** Provenance, e.g. "anthropic:claude-opus-4-8" or "openrouter:openai/gpt-4o-mini". */
  source: string;
}

export interface LlmClient {
  /** Provenance shown to callers/UI; also the default `source` on results. */
  readonly source: string;
  readonly supportsVision: boolean;
  readonly supportsTools: boolean;
  readonly supportsStructuredOutput: boolean;
  /** Run one turn (or a full tool loop when `opts.tools` is set). Throws on transport error. */
  chat(messages: LlmMessage[], opts?: LlmChatOptions): Promise<LlmChatResult>;
}
