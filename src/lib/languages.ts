/** Languages offered in setup, in the order shown. ISO 639-1 codes as used by TMDB. */
export const LANGUAGES: { code: string; name: string; native?: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'zh', name: 'Chinese', native: '中文' },
];

export const DEFAULT_LANGUAGES = ['en', 'ta', 'hi'];

export const languageName = (code?: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code?.toUpperCase() ?? '';

export interface DetectedLocale {
  region: string;
  regionSupported: boolean;
  languages: string[];
}

/** Guesses region and languages without any permission prompt: timezone + browser languages. */
export function detectLocale(
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  browserLanguages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages : [],
): DetectedLocale {
  const fromLang = browserLanguages.map((l) => l.split('-')[1]?.toUpperCase()).find(Boolean);
  const region = timeZone === 'Asia/Kolkata' || timeZone === 'Asia/Calcutta' ? 'IN' : (fromLang ?? 'IN');
  const known = new Set(LANGUAGES.map((l) => l.code));
  const extra = browserLanguages.map((l) => l.split('-')[0].toLowerCase()).filter((c) => known.has(c));
  const languages = region === 'IN' ? [...new Set([...DEFAULT_LANGUAGES, ...extra])] : [...new Set(extra.length ? extra : ['en'])];
  return { region, regionSupported: region === 'IN', languages };
}
