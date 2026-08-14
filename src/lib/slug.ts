// Cyrillic → Latin transliteration for turning a typed project name into a
// slug that's actually usable: it becomes the Docker container name prefix,
// the `.localhost` domain label, and the project's directory name, all of
// which must be ASCII. Rejecting Cyrillic input outright just moves the
// failure somewhere far less clear (a raw Docker "invalid container name"
// error deep into creation) instead of transliterating it into something
// that works, the way most CMS "URL slug" fields handle a non-Latin title.
// Ukrainian-leaning mapping (г→h, х→kh, ц→ts, ч→ch, ш→sh, щ→shch, ю→iu,
// я→ia, є→ie, ї→i, й→i) with the handful of Russian-only letters covered
// too, since nothing here validates which Cyrillic alphabet was used.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "iu",
  я: "ia",
  ё: "e",
}

/** Transliterates any Cyrillic characters in `value` to Latin; every other
 * character (including ones the caller's own validation will still reject)
 * passes through unchanged. */
export function transliterateCyrillic(value: string): string {
  return Array.from(value)
    .map((character) => {
      const lower = character.toLowerCase()
      const mapped = CYRILLIC_TO_LATIN[lower]
      if (mapped === undefined) return character
      return character === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1)
    })
    .join("")
}
