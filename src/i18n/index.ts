import en from "./locales/en"
import uk from "./locales/uk"

export type Dictionary = typeof en

const dictionaries = { en, uk } satisfies Record<string, Dictionary>

export type Locale = keyof typeof dictionaries

export const locales = Object.keys(dictionaries) as Locale[]

export const localeNames: Record<Locale, string> = {
  uk: "Українська",
  en: "English",
}

function isLocale(value: string): value is Locale {
  return value in dictionaries
}

/**
 * Looks up the full translation dictionary for a locale code (e.g. the
 * user's `settings.language`), falling back to English for an unknown or
 * not-yet-selected locale. Adding a language is just adding a new file
 * under `locales/` and registering it in `dictionaries` above - no other
 * code needs to change.
 */
export function pickLanguage(language: string): Dictionary {
  return dictionaries[isLocale(language) ? language : "en"]
}
