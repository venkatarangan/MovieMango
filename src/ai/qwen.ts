import type { AiEngine, ProgressFn } from './types';

export const QWEN_MODELS = [
  { id: 'Qwen3-0.6B', label: 'Qwen3 0.6B · lighter, for phones', approxMB: 1400 },
  { id: 'Qwen3-1.7B', label: 'Qwen3 1.7B · recommended', approxMB: 2000 },
  { id: 'Qwen3-4B', label: 'Qwen3 4B · smartest, needs a strong GPU', approxMB: 3400 },
];

export interface QwenSupport {
  supported: boolean;
  f16: boolean;
  reason?: string;
}

export async function qwenSupport(): Promise<QwenSupport> {
  if (!navigator.gpu) return { supported: false, f16: false, reason: 'This browser has no WebGPU.' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { supported: false, f16: false, reason: 'No compatible GPU was found.' };
    return { supported: true, f16: adapter.features.has('shader-f16') };
  } catch {
    return { supported: false, f16: false, reason: 'WebGPU failed to start.' };
  }
}

/** Full WebLLM model id for a base model, picking the f16 build when the GPU supports it. */
export function qwenModelId(base: string, f16: boolean) {
  const stem = base.replace(/-q4f(16|32)_1-MLC$/, '');
  return `${stem}-${f16 ? 'q4f16_1' : 'q4f32_1'}-MLC`;
}

/** Smaller model for devices that report little memory (e.g. phones). */
export function suggestedQwenBase(): string {
  const mem = navigator.deviceMemory;
  return mem !== undefined && mem < 8 ? 'Qwen3-0.6B' : 'Qwen3-1.7B';
}

export async function isQwenCached(modelId: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    return await hasModelInCache(modelId);
  } catch {
    return false;
  }
}

export async function deleteQwen(modelId: string) {
  const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
  await deleteModelAllInfoInCache(modelId);
}

type Engine = Awaited<ReturnType<typeof import('@mlc-ai/web-llm')['CreateMLCEngine']>>;
let loaded: { modelId: string; engine: Promise<Engine> } | null = null;

/** Loads the model (downloading from Hugging Face on first use; cached in the browser afterwards). */
export function loadQwen(modelId: string, onProgress?: ProgressFn): Promise<Engine> {
  if (loaded?.modelId === modelId) return loaded.engine;
  const engine = import('@mlc-ai/web-llm').then(({ CreateMLCEngine }) =>
    CreateMLCEngine(modelId, {
      initProgressCallback: (r) => onProgress?.({ text: r.text, progress: r.progress }),
    }),
  );
  loaded = { modelId, engine };
  engine.catch(() => {
    if (loaded?.engine === engine) loaded = null;
  });
  return engine;
}

export function qwenEngine(modelId: string, onProgress?: ProgressFn): AiEngine {
  return {
    id: 'qwen',
    label: 'Qwen',
    async generateJson(system, user, schema, opts) {
      const engine = await loadQwen(modelId, onProgress);
      const reply = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: opts?.temperature ?? 0.6,
        max_tokens: 900,
        response_format: { type: 'json_object', schema: JSON.stringify(schema) },
        extra_body: { enable_thinking: false },
      });
      return reply.choices[0]?.message?.content ?? '';
    },
  };
}
