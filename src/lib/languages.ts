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

/** Names for other languages that turn up in world picks (not offered in setup). */
const MORE_NAMES: Record<string, string> = {
  it: 'Italian', de: 'German', pt: 'Portuguese', th: 'Thai', tr: 'Turkish', da: 'Danish', sv: 'Swedish', no: 'Norwegian', fa: 'Persian',
  id: 'Indonesian', pl: 'Polish', cn: 'Cantonese', ar: 'Arabic', he: 'Hebrew', nl: 'Dutch', fi: 'Finnish', ru: 'Russian', ur: 'Urdu', tl: 'Tagalog', or: 'Odia', as: 'Assamese',
};

export const languageName = (code?: string) => LANGUAGES.find((l) => l.code === code)?.name ?? (code && MORE_NAMES[code]) ?? code?.toUpperCase() ?? '';

/** "Korean", "தமிழ்" or "italian" → its code. */
export const languageCode = (name: string) => {
  const n = name.trim().toLowerCase();
  return LANGUAGES.find((l) => l.name.toLowerCase() === n || l.native === name.trim())?.code ?? Object.entries(MORE_NAMES).find(([, v]) => v.toLowerCase() === n)?.[0];
};

/**
 * Languages with strong film and TV traditions that travel well with subtitles, for world picks and
 * the language of the week (in rotation order). The user's own languages are always left out.
 */
export const WORLD_LANGUAGES = ['ko', 'ja', 'es', 'ml', 'fr', 'it', 'te', 'de', 'zh', 'kn', 'pt', 'th', 'bn', 'da', 'tr', 'sv', 'mr', 'fa', 'cn', 'no', 'id', 'pl'];

export const otherLanguages = (mine: string[]) => WORLD_LANGUAGES.filter((l) => !mine.includes(l));

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
