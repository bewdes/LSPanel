export const systemHealthText = {
  uk: {
    systemHealth: "Стан системи",
    systemHealthDescription: "Перевірка локального runtime, gateway та сховища.",
    runChecks: "Перевірити",
    howToFix: "Як вирішити",
    diskUsage: "Використання диска",
    diskUsageDescription:
      "Місце, зайняте Docker/Podman на цій машині. Очищення торкається лише build cache та образів без тегу — жодні активні чи зупинені середовища не постраждають.",
    danglingImages: "Зайві образи",
    category: "Категорія",
    total: "Всього",
    active: "Активні",
    size: "Розмір",
    reclaimable: "Можна звільнити",
    loading: "Завантаження…",
    cleanBuildCacheTitle: "Очистити build cache?",
    removeDanglingImagesTitle: "Прибрати зайві образи?",
    cleanBuildCacheDescription:
      "Видаляє лише проміжні шари збирання образів. Жоден образ, контейнер чи том не постраждає — при наступному rebuild шари просто збудуються заново.",
    removeDanglingImagesDescription:
      "Видаляє лише образи без тегу, які не використовує жоден контейнер. Образи, потрібні зупиненим середовищам, не будуть видалені.",
    cancel: "Скасувати",
    cleaning: "Очищення…",
    clean: "Очистити",
  },
  en: {
    systemHealth: "System Health",
    systemHealthDescription: "Checks for the local runtime, gateway, and storage.",
    runChecks: "Run checks",
    howToFix: "How to fix it",
    diskUsage: "Disk usage",
    diskUsageDescription:
      "Space used by Docker/Podman on this machine. Cleanup only touches build cache and untagged images — no active or stopped environment is affected.",
    danglingImages: "Dangling images",
    category: "Category",
    total: "Total",
    active: "Active",
    size: "Size",
    reclaimable: "Reclaimable",
    loading: "Loading…",
    cleanBuildCacheTitle: "Clean build cache?",
    removeDanglingImagesTitle: "Remove dangling images?",
    cleanBuildCacheDescription:
      "Removes only intermediate image-build layers. No image, container, or volume is touched — the next rebuild simply recreates them.",
    removeDanglingImagesDescription:
      "Removes only untagged images not used by any container. Images a stopped environment still needs are not removed.",
    cancel: "Cancel",
    cleaning: "Cleaning…",
    clean: "Clean",
  },
}
