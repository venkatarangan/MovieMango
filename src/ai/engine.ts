import type { Settings } from '../db/settings';
import { geminiEngine } from './gemini';
import { nanoAvailability, nanoEngine } from './nano';
import { isQwenCached, qwenEngine, qwenModelId, qwenSupport } from './qwen';
import type { AiEngine, EngineId, ProgressFn } from './types';

export interface EngineStatus {
  nano: LanguageModelAvailability;
  qwen: { supported: boolean; cached: boolean; modelId: string; reason?: string };
  gemini: { hasKey: boolean };
}

export async function probeEngines(settings: Settings): Promise<EngineStatus> {
  const [nano, support] = await Promise.all([nanoAvailability(), qwenSupport()]);
  const modelId = qwenModelId(settings.qwenModel, support.f16);
  const cachedModel = support.supported ? await isQwenCached(modelId) : false;
  return {
    nano,
    qwen: { supported: support.supported, cached: cachedModel, modelId, reason: support.reason },
    gemini: { hasKey: !!settings.geminiKey },
  };
}

export type EngineAction = 'nano-download' | 'qwen-download' | 'gemini-key';

export interface EngineChoice {
  /** The engine to use now, 'basic' when the user chose no AI, or null when nothing is ready. */
  id: EngineId | 'basic' | null;
  /** What the user can do to enable (more) AI, in order of preference. */
  actions: EngineAction[];
  /** Engines usable right now, for the quick switcher. */
  ready: EngineId[];
  message?: string;
}

export function readyEngines(s: EngineStatus): EngineId[] {
  const ready: EngineId[] = [];
  if (s.nano === 'available') ready.push('nano');
  if (s.qwen.supported && s.qwen.cached) ready.push('qwen');
  if (s.gemini.hasKey) ready.push('gemini');
  return ready;
}

function possibleActions(s: EngineStatus): EngineAction[] {
  const actions: EngineAction[] = [];
  if (s.nano === 'downloadable' || s.nano === 'downloading') actions.push('nano-download');
  if (s.qwen.supported && !s.qwen.cached) actions.push('qwen-download');
  if (!s.gemini.hasKey) actions.push('gemini-key');
  return actions;
}

/**
 * Auto order: Gemini Nano → Qwen (WebGPU) → Gemini cloud. Only engines that are ready right now are
 * picked; downloads always need the user's go-ahead. Basic mode is used only when the user chose it.
 */
export function chooseEngine(pref: Settings['aiEngine'], s: EngineStatus): EngineChoice {
  const ready = readyEngines(s);
  const actions = possibleActions(s);
  if (pref === 'basic') return { id: 'basic', actions: [], ready };
  if (pref !== 'auto') {
    if (ready.includes(pref)) return { id: pref, actions: [], ready };
    const need: Record<EngineId, EngineAction | undefined> = {
      nano: s.nano === 'downloadable' || s.nano === 'downloading' ? 'nano-download' : undefined,
      qwen: s.qwen.supported ? 'qwen-download' : undefined,
      gemini: 'gemini-key',
    };
    const action = need[pref];
    return {
      id: null,
      actions: action ? [action] : actions,
      ready,
      message: action ? undefined : pref === 'nano' ? 'Gemini Nano isn’t available on this device.' : s.qwen.reason,
    };
  }
  if (ready.length) return { id: ready[0], actions, ready };
  return { id: null, actions, ready, message: 'AI isn’t available on this device yet.' };
}

export function createEngine(id: EngineId, settings: Settings, status: EngineStatus, onProgress?: ProgressFn): AiEngine {
  if (id === 'nano') return nanoEngine();
  if (id === 'qwen') return qwenEngine(status.qwen.modelId, onProgress);
  return geminiEngine(settings.geminiKey, settings.geminiModel);
}
