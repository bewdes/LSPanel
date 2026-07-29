export const certificatesText = {
  uk: {
    certificates: "Сертифікати",
    certificatesDescription: "Керування локальним центром сертифікації та HTTPS-доменами LS Panel.",
    refresh: "Оновити",
    caDescriptionExists: "Кореневий сертифікат, який підтверджує локальні HTTPS-сертифікати.",
    caDescriptionMissing: "CA буде створено під час першого запуску проєкту.",
    system: "Система",
    browsers: "Браузери",
    expires: "Діє до",
    path: "Шлях",
    trustLocalCa: "Встановити довіру CA",
    resetLocalCa: "Скинути Local CA",
    localHttpsCertificate: "Локальний HTTPS-сертифікат",
    localHttpsCertificateDescription:
      "Спільний серверний сертифікат для активних доменів і wildcard aliases.",
    status: "Стан",
    reissueHttps: "Перевипустити HTTPS",
    deleteHttpsCertificate: "Видалити HTTPS-сертифікат",
    certificateDomains: "Домени сертифіката",
    certificateDomainsDescription:
      "Список автоматично оновлюється після зміни доменів або aliases.",
    noDomainsYet: "Доменів ще немає.",
    resetCaTitle: "Скинути Local CA?",
    deleteHttpsTitle: "Видалити HTTPS-сертифікат?",
    resetCaDescription:
      "Довіру буде видалено із системи та браузерів. Gateway зупиниться, а наступний запуск проєкту створить новий CA, який доведеться встановити знову.",
    deleteHttpsDescription:
      "Локальний HTTPS gateway буде зупинено. Наступний запуск або перевипуск створить новий серверний сертифікат із тим самим CA.",
    cancel: "Скасувати",
    delete: "Видалити",
  },
  en: {
    certificates: "Certificates",
    certificatesDescription: "Manage the LS Panel local certificate authority and HTTPS domains.",
    refresh: "Refresh",
    caDescriptionExists: "The root certificate that signs local HTTPS certificates.",
    caDescriptionMissing: "The CA will be generated when the first project starts.",
    system: "System",
    browsers: "Browsers",
    expires: "Expires",
    path: "Path",
    trustLocalCa: "Trust local CA",
    resetLocalCa: "Reset Local CA",
    localHttpsCertificate: "Local HTTPS certificate",
    localHttpsCertificateDescription:
      "Shared server certificate for active domains and wildcard aliases.",
    status: "Status",
    reissueHttps: "Reissue HTTPS",
    deleteHttpsCertificate: "Delete HTTPS certificate",
    certificateDomains: "Certificate domains",
    certificateDomainsDescription:
      "This list updates automatically when domains or aliases change.",
    noDomainsYet: "No domains have been issued yet.",
    resetCaTitle: "Reset Local CA?",
    deleteHttpsTitle: "Delete HTTPS certificate?",
    resetCaDescription:
      "Trust will be removed from the system and browsers. The gateway will stop, and the next project start will create a new CA that must be trusted again.",
    deleteHttpsDescription:
      "The local HTTPS gateway will stop. The next start or reissue will create a new server certificate using the same CA.",
    cancel: "Cancel",
    delete: "Delete",
  },
}
