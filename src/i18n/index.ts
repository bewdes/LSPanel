export function pickLanguage<T>(dict: { uk: T; en: T }, uk: boolean): T {
  return uk ? dict.uk : dict.en
}
