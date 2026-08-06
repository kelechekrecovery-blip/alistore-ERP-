import type { LlmClient } from './llm-client';
export type EnvReader = (name: string) => string | undefined;
export declare function resolveLlmClient(env?: EnvReader): LlmClient | null;
export declare function fastModel(env?: EnvReader): string | undefined;
