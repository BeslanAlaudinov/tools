# Tools

Библиотека визуальных инструментов для дизайнеров. Первый инструмент — **Globe**: Земля из точек со странами, метками, маршрутами, эффектами и экспортом.

Решения и план — в [ROADMAP.md](ROADMAP.md).

## Запуск

Нужен Node.js 20.11+. pnpm 9 запускается через corepack, который идёт вместе с Node, — ничего ставить не нужно:

```bash
corepack pnpm install
corepack pnpm dev          # http://localhost:3000, глобус — /globe
```

Остановить сервер — Ctrl+C в его терминале. `build` можно запускать и при работающем `dev`: сборка пишет только в `apps/web/out`.

| Команда                   | Что делает                          |
| ------------------------- | ----------------------------------- |
| `corepack pnpm dev`       | сайт в режиме разработки            |
| `corepack pnpm build`     | статическая сборка в `apps/web/out` |
| `corepack pnpm typecheck` | проверка типов во всех пакетах      |
| `corepack pnpm test`      | тесты движков (Vitest)              |
| `corepack pnpm format`    | форматирование (Prettier)           |

Если `pnpm` установлен глобально (`corepack enable`), префикс `corepack` можно не писать.

## Публикация

Сайт целиком статический: `corepack pnpm build` складывает готовые файлы в `apps/web/out`, их можно выложить на любой хостинг. Сейчас он публикуется на GitHub Pages: при каждом пуше в `main` workflow `.github/workflows/pages.yml` проверяет типы, гоняет тесты, собирает сайт с префиксом `/<репозиторий>/` и выкладывает его. Один раз в настройках репозитория нужно выбрать Settings → Pages → Source: **GitHub Actions**.

Посмотреть сборку локально с тем же префиксом:

```powershell
$env:NEXT_PUBLIC_BASE_PATH = '/tools'; corepack pnpm build
```

## Устройство

```
apps/web                Next.js: страницы библиотеки и инструментов
  src/tools/globe       Globe: схема инспектора, хранилище, секции, экспорт, предпросмотр
packages/ui             общая оболочка: токены (styles.css), контролы, шапка, инспектор по схеме
packages/globe          движок глобуса: WebGL-рендер, оверлей меток и маршрутов, модель настроек, данные карты
  scripts/              сборка карты суши и стран из Natural Earth
  test/                 тесты геометрии, данных и настроек
prototypes/             одностраничные прототипы и макеты (HTML), не часть сайта
research/               ресёрч интерфейса
```

**Движок отдельно от интерфейса.** `@tools/globe` ничего не знает о React: он получает объект настроек (`GlobeSettings`, чистый JSON) и канвасы, а наружу сообщает о действиях пользователя на холсте через колбэки. Поэтому тот же движок рисует холст, предпросмотр, превью пресетов и экспорт, а позже — React-компонент и Web Component для вкладки «Код».

**Инспектор строится по схеме.** Инструмент описывает вкладки, секции и контролы данными (`apps/web/src/tools/globe/schema.tsx`), а `SchemaSections` из `@tools/ui` их рисует. Сброс и перемешивание секций, отмена одним шагом для перетаскивания слайдера достаются любому инструменту без отдельного кода.

**Состояние** — Zustand с историей (zundo): непрерывные правки (слайдер, цвет, колесо) склеиваются в один шаг отмены; камера не попадает в историю. Настройки сохраняются в браузере и подгружаются после первой отрисовки, чтобы серверный рендер совпадал с клиентским.

### Новый инструмент

1. `packages/<tool>`: движок + `settings.ts` (тип настроек, значения по умолчанию, пресеты) + тесты.
2. `apps/web/src/tools/<tool>`: `schema.tsx`, `store.ts`, компонент инструмента на `ToolShell`.
3. `apps/web/src/app/<tool>/page.tsx` и строка в списке на главной.

### Данные карты

Карта суши и стран — Natural Earth 1:50m (public domain), закодированы в `packages/globe/src/data/*.ts`. Пересобрать:

```bash
npm i world-atlas@2.0.2 topojson-client@3.1.0 i18n-iso-countries@7.11.0   # в любой временной папке
node packages/globe/scripts/build-land-mask.mjs <та-папка>/node_modules
node packages/globe/scripts/build-countries.mjs <та-папка>/node_modules
pnpm test
```

Города для меток — Natural Earth 1:10m populated places (~7 300 мест, русские названия из той же базы), лежат в `packages/globe/src/data/cities.ts` и подгружаются отдельным файлом, только когда открывают поиск города. Пересобрать:

```bash
curl -L -o places.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places.geojson
node packages/globe/scripts/build-cities.mjs places.geojson
```
