export type EngineId = 'nano' | 'qwen' | 'gemini';

export type JsonSchema = Record<string, unknown>;

export interface AiEngine {
  id: EngineId;
  label: string;
  /** Returns the model's JSON text for a system + user prompt, constrained to the schema where supported. */
  generateJson(system: string, user: string, schema: JsonSchema, opts?: { signal?: AbortSignal; temperature?: number }): Promise<string>;
}

export type ProgressFn = (p: { text: string; progress?: number }) => void;

export const ENGINE_LABELS: Record<EngineId | 'basic', string> = {
  nano: 'Gemini Nano · on-device',
  qwen: 'Qwen · on-device',
  gemini: 'Gemini · cloud',
  basic: 'Basic · no AI',
};
