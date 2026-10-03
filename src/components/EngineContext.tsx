import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { chooseEngine, createEngine, probeEngines, type EngineChoice, type EngineStatus } from '../ai/engine';
import { downloadNano } from '../ai/nano';
import { loadQwen } from '../ai/qwen';
import type { AiEngine, EngineId } from '../ai/types';
import { saveSettings, useSettings, type AiEngineChoice } from '../db/settings';

interface EngineContextValue {
  status?: EngineStatus;
  choice?: EngineChoice;
  progress?: { text: string; progress?: number };
  busy: boolean;
  error?: string;
  /** The engine to use now, or null (no AI / not ready / Basic mode). */
  engine: AiEngine | null;
  refresh: () => Promise<void>;
  enableNano: () => Promise<void>;
  enableQwen: () => Promise<void>;
  setPreferred: (id: AiEngineChoice) => Promise<void>;
}

const Ctx = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [status, setStatus] = useState<EngineStatus>();
  const [progress, setProgress] = useState<{ text: string; progress?: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!settings) return;
    setStatus(await probeEngines(settings));
  }, [settings?.geminiKey, settings?.qwenModel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const choice = useMemo(() => (settings && status ? chooseEngine(settings.aiEngine, status) : undefined), [settings, status]);

  const engine = useMemo(() => {
    if (!settings || !status || !choice?.id || choice.id === 'basic') return null;
    return createEngine(choice.id as EngineId, settings, status, setProgress);
  }, [settings, status, choice?.id]);

  const run = useCallback(
    async (job: () => Promise<void>) => {
      setBusy(true);
      setError(undefined);
      try {
        await job();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
        setProgress(undefined);
        await refresh();
      }
    },
    [refresh],
  );

  const enableNano = useCallback(() => run(() => downloadNano(setProgress)), [run]);
  const enableQwen = useCallback(
    () =>
      run(async () => {
        if (!status) return;
        setProgress({ text: 'Preparing Qwen…', progress: 0 });
        await loadQwen(status.qwen.modelId, setProgress);
      }),
    [run, status],
  );
  const setPreferred = useCallback(async (id: AiEngineChoice) => {
    await saveSettings({ aiEngine: id });
  }, []);

  const value = { status, choice, progress, busy, error, engine, refresh, enableNano, enableQwen, setPreferred };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEngine() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEngine must be used inside EngineProvider');
  return v;
}
