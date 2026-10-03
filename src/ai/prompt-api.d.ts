// Minimal typings for Chrome's built-in Prompt API (Chrome 148+, desktop).
// https://developer.chrome.com/docs/ai/prompt-api

type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelExpected {
  type: 'text' | 'image' | 'audio';
  languages?: string[];
}

interface LanguageModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LanguageModelMonitor extends EventTarget {
  addEventListener(type: 'downloadprogress', listener: (e: Event & { loaded: number }) => void): void;
}

interface LanguageModelCreateOptions {
  initialPrompts?: LanguageModelMessage[];
  expectedInputs?: LanguageModelExpected[];
  expectedOutputs?: LanguageModelExpected[];
  signal?: AbortSignal;
  monitor?: (m: LanguageModelMonitor) => void;
}

interface LanguageModelSession {
  prompt(input: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  destroy(): void;
  inputQuota?: number;
}

interface LanguageModelStatic {
  availability(options?: Pick<LanguageModelCreateOptions, 'expectedInputs' | 'expectedOutputs'>): Promise<LanguageModelAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

declare var LanguageModel: LanguageModelStatic | undefined;

interface Navigator {
  gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> };
  deviceMemory?: number;
}
