# LS Panel

<!--
  Додайте реальний скріншот дашборду, коли буде готовий, і розкоментуйте:
  <p align="center">
    <img src="docs/images/dashboard.png" alt="LS Panel dashboard" width="800">
  </p>
-->

**LS Panel** — це десктопний менеджер локального середовища розробки для PHP/веб-проєктів: самостійно розміщувана альтернатива інструментам на кшталт Local by Flywheel чи Laravel Herd. Працює як нативний застосунок (Tauri + React) і керує Docker/Podman-контейнерами, локальними базами даних, TLS-сертифікатами, перехопленням пошти, резервними копіями тощо через єдиний інтерфейс.

> 🇬🇧 English version of this document: [README.md](README.md)

[![CI](https://github.com/bewdes/LSPanel/actions/workflows/ci.yml/badge.svg)](https://github.com/bewdes/LSPanel/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.3.1--beta-orange)
![Rust](https://img.shields.io/badge/backend-Rust-b7410e)
![React](https://img.shields.io/badge/frontend-React_19-61dafb)
![Tauri](https://img.shields.io/badge/shell-Tauri_2-24c8db)
![Docker](https://img.shields.io/badge/runtime-Docker-2496ed)
![Podman](https://img.shields.io/badge/runtime-Podman-892ca0)
![Linux](https://img.shields.io/badge/platform-Linux-fcc624)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

> ⚠️ **Статус: v0.3.1-beta.** LS Panel перебуває на ранній стадії активної розробки — можливі суттєві зміни та шорсткі кути.

## Чому LS Panel?

- Нативний десктопний застосунок для Linux — без Electron і без вкладки браузера, яку треба тримати відкритою.
- Підтримка Docker і Podman з автовизначенням, а також Compose для багатосервісних стеків.
- HTTPS "з коробки" завдяки локальному центру сертифікації — без попереджень про самопідписані сертифікати.
- Local-first: ваші дані (метадані SQLite, резервні копії, знімки) залишаються на вашій машині.
- Не потрібен обліковий запис у хмарі, ліцензійний сервер чи телеметрія.
- Створений для PHP та сучасної веброзробки, з готовим автоматичним розгортанням проєктів Laravel, WordPress і Symfony, а також окремою обробкою для проєктів на Node/React.

## Можливості

**Розробка** — Сайти · Контейнери · Бази даних · Файли середовища · Live-логи · Вбудований термінал

**Продуктивність** — Перехоплення пошти (Mailpit) · Знімки проєктів · Резервні копії баз даних · LiveLink · Сертифікати

**Система** — Діагностика та стан системи · Налаштування · Файловий менеджер

Детальніше про кожну фічу та бекенд-модулі, що її реалізують — у [docs/FEATURES.md](docs/FEATURES.md) (англ.).

Інтерфейс повністю двомовний (англійська / українська) завдяки легкому вбудованому шару i18n (`src/i18n`).

## Технологічний стек

| Шар                 | Технологія                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Десктопна оболонка  | [Tauri 2](https://tauri.app/)                                                            |
| Бекенд              | Rust (`src-tauri/`), SQLite через `rusqlite`                                             |
| Фронтенд            | React 19, TypeScript, Vite 6                                                             |
| Стилі / UI          | Tailwind CSS 4, компоненти у стилі shadcn (`src/components/ui`), примітиви Radix/Base UI |
| Дані та таблиці     | `@tanstack/react-table`, `recharts` для графіків                                         |
| Термінал            | `xterm.js` + `portable-pty` (Rust)                                                       |
| Контейнерні runtime | Docker / Podman (+ Compose)                                                              |

## Структура проєкту

```
lspanel/
├── src/                     # Фронтенд на React
│   ├── app/                 # Оболонка застосунку / дашборд
│   ├── components/ui/       # Спільні UI-примітиви
│   ├── features/            # Функціональні модулі (сайти, контейнери, бази даних, файли, логи,
│   │                         #   пошта, резервні копії, сертифікати, знімки, налаштування, livelink, ...)
│   ├── i18n/                # Англійські/українські словники текстів для кожної фічі
│   ├── hooks/, lib/         # Спільні хуки та утиліти
├── src-tauri/                # Бекенд на Rust/Tauri
│   └── src/                  # Tauri-команди: контейнери, сайти, бази даних, резервні копії,
│                              #   знімки, файли середовища, git, сертифікати, пошта,
│                              #   термінал, діагностика, налаштування, сховище, ...
├── tests/                    # Фронтенд-тести (вбудований тест-раннер Node)
├── scripts/                  # Допоміжні скрипти для розробки/CI (очищення env, інтеграційні тести контейнерів)
└── .github/workflows/        # CI: перевірки фронтенду, перевірки/тести Rust, збірка Linux-бандлів
```

## Документація

- [docs/ARCHITECTURE.uk.md](docs/ARCHITECTURE.uk.md) — як фронтенд і Rust-бекенд взаємодіють між собою, зберігання даних, середовища/runtime, операційний центр.
- [docs/FEATURES.uk.md](docs/FEATURES.uk.md) — огляд кожної фічі та бекенд-модулів, що її реалізують.
- [CONTRIBUTING.uk.md](CONTRIBUTING.uk.md) — налаштування розробки та перевірки, які має пройти pull request.
- [CHANGELOG.md](CHANGELOG.md) — перелік значущих змін по релізах (англ.).

## Початок роботи

### Передумови

- Node.js 22+
- Стабільний тулчейн Rust
- Docker або Podman (+ Compose) для фіч, що працюють з контейнерами
- Залежності для збірки Tauri на Linux (приклад для Debian/Ubuntu):
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
  ```

### Встановлення залежностей

```bash
npm install
```

### Запуск у режимі розробки

```bash
npm run tauri dev # запускає dev-застосунок Tauri (фронтенд + бекенд на Rust)
# або лише фронтенд:
npm run dev
```

> Скрипт `tauri` обгортає Tauri CLI через `scripts/tauri-clean-env.sh` і передає далі будь-яку підкоманду — `npm run tauri` без підкоманди просто виводить довідку Tauri CLI, а не запускає застосунок.

#### Навіщо потрібен скрипт-обгортка?

Якщо запустити `npm run tauri dev` з терміналу всередині **редактора, встановленого через snap** (наприклад, VS Code через snap), цей термінал успадковує змінні `SNAP_*`/`XDG_DATA_HOME`, що вказують на пісочницю редактора. Через це Docker/Podman можуть читати й писати стан свого сховища за цим підміненим шляхом замість реального `~/.local/share/containers`, і після оновлення редактора до нової snap-редакції інструменти контейнерів можуть повідомити про розсинхрон сховища/бази. `scripts/tauri-clean-env.sh` запускає процес Tauri з чистим, явно заданим середовищем (`env -i` плюс дозволений список змінних, дійсно потрібних GTK/WebKit/Cargo), тож ця проблема не виникає незалежно від того, з якого терміналу ви запустили команду.

### Збірка

```bash
npm run build          # перевірка типів + збірка Vite (фронтенд)
npm run tauri build    # повна збірка десктопного застосунку
```

## Перевірки якості

```bash
npm run check           # виконує check:frontend + check:rust
npm run check:frontend  # prettier, eslint, фронтенд-тести, tsc, збірка vite
npm run check:rust      # cargo fmt --check, clippy (-D warnings), cargo test
npm run test:containers # інтеграційні тести контейнерів/compose (scripts/test-container-integration.sh)
```

Також доступні окремі команди: `npm run format`, `npm run format:check`, `npm run lint`, `npm run test:frontend`.

CI (`.github/workflows/ci.yml`) виконує ці ж перевірки при кожному push/PR, а також збирає Linux-бандли `.deb`/`.rpm`/`.AppImage`.

## Внесок у проєкт

Issues та pull request'и вітаються. Перед відкриттям PR, будь ласка, запустіть `npm run check` локально, щоб пройти ті самі перевірки, що й CI.

## Ліцензія

Ліцензовано за умовами [Apache License, Version 2.0](LICENSE).
