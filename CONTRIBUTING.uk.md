# Внесок у LS Panel

> 🇬🇧 English version: [CONTRIBUTING.md](CONTRIBUTING.md)

Дякуємо за інтерес до участі в проєкті! Це десктопний застосунок на Tauri (Rust + React/TypeScript).

## Налаштування розробки

```bash
npm install
npm run tauri dev   # dev-застосунок (фронтенд + бекенд на Rust)
```

Передумови (Node.js 22+, стабільний Rust, Docker/Podman, залежності для збірки Tauri на Linux) — див. [README.uk.md](README.uk.md).

## Перед відкриттям pull request

Запустіть повний набір перевірок локально — CI вимагає тих самих гейтів:

```bash
npm run check           # перевірки фронтенду + rust
npm run check:frontend  # prettier, eslint, фронтенд-тести, tsc, збірка vite
npm run check:rust      # cargo fmt --check, clippy -D warnings, cargo test
```

Для змін, що торкаються поведінки контейнерів/compose, також запустіть:

```bash
npm run test:containers
```

Щоб побачити, які файли фронтенду охоплені тестами:

```bash
npm run test:frontend:coverage
```

## Рекомендації

- Тримайте pull request сфокусованим на одній зміні; уникайте несвʼязаного рефакторингу.
- Дотримуйтесь наявного стилю коду — `npm run format` (Prettier) і `cargo fmt` є авторитетними для форматування, не форматуйте вручну навколо них.
- Додавайте чи оновлюйте фронтенд-тести в `tests/` та Rust-тести поруч із модулями в `src-tauri/src/` для змін поведінки.
- Текст інтерфейсу лежить у `src/i18n/*.ts` як парні словники `en`/`uk` — додавайте обидва, коли вводите новий текст, видимий користувачу.
- Чітко описуйте видимі користувачу зміни в описі PR; посилайтесь на повʼязаний issue.
