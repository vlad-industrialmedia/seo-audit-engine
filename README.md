# SEO Audit Engine

Веб-застосунок для аналізу SEO проблем на основі даних зі Screaming Frog. Повний інструмент аудиту з AI-аналізом, чеклістом проблем та управлінням проєктами.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/searchfit-seo/seo-audit-engine)

## Можливості

- 📊 **Імпорт Screaming Frog** — завантаження CSV та Excel файлів з даними сканування
- 🔍 **21 SEO правило** — детерміновані перевірки заголовків, мета-тегів, зображень, HTTP статусів, схеми
- 🤖 **AI-аналіз** — підтримка Gemini, OpenRouter, Anthropic (Claude), Grok
- ✅ **Чекліст проблем** — перегляд та позначення знайдених проблем як виправлені
- 📁 **Управління проєктами** — збереження, завантаження, експорт/імпорт проєктів
- 📤 **Експорт** — Markdown, CSV, JSON з гнучким фільтруванням
- 🌙 **Темна/світла тема** — повна підтримка dark mode

## Технічний стек

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** + shadcn/ui компоненти
- **Zustand** + localStorage для стану
- **PapaParse** + xlsx для парсингу файлів
- **Screaming Frog** як основний джерело даних

## Швидкий старт

```bash
# Клонування репозиторію
git clone https://github.com/searchfit-seo/seo-audit-engine.git
cd seo-audit-engine

# Встановлення залежностей
npm install

# Запуск в режимі розробки
npm run dev
```

Відкрийте [http://localhost:3000](http://localhost:3000) у браузері.

## Конфігурація

```bash
cp .env.example .env.local
```

Відредагуйте `.env.local` або додайте API ключі безпосередньо в налаштуваннях застосунку.

## Як використовувати

### 1. Створення проєкту
- Перейдіть на сторінку **Проєкти** → **Новий проєкт**
- Введіть назву та домен сайту

### 2. Налаштування AI (опціонально)
- Перейдіть у **Налаштування**
- Додайте API ключ для Gemini (безкоштовний), OpenRouter або інших провайдерів
- Натисніть **Валідувати** для перевірки ключа

### 3. Імпорт даних Screaming Frog
- Відкрийте проєкт → **Новий аудит**
- На вкладці **Завантаження SF** перетягніть або завантажте CSV/Excel файли
- Натисніть **Запустити аудит**

### 4. Перегляд результатів
- Вкладка **Чекліст проблем** — всі знайдені проблеми за severity
- Помічайте проблеми як виправлені за допомогою чекбоксів
- Додавайте нотатки до кожної проблеми

### 5. Експорт
- Натисніть **Експорт** → оберіть формат (MD/CSV/JSON)
- Фільтруйте за severity та статусом перевірки

## Підтримувані файли Screaming Frog

| Файл | Вміст |
|------|-------|
| `internal_all.csv` | Всі внутрішні URL |
| `redirects.csv` | Ланцюжки редиректів |
| `images.csv` | Аудит зображень |
| `canonicals.csv` | Canonical теги |
| `hreflang.csv` | Мовна версійність |
| `meta.csv` | Meta description |
| Excel `.xlsx` | Будь-який формат SF |

## Розгортання на Vercel

```bash
npm i -g vercel
vercel --prod
```

Або натисніть кнопку **Deploy with Vercel** вгорі.

## SEO Правила

| Категорія | Правил |
|-----------|--------|
| Заголовки (h1-h6) | 5 |
| Meta теги | 4 |
| HTTP/Статуси | 4 |
| Індексованість | 3 |
| Зображення | 2 |
| Схема (Schema.org) | 2 |
| Hreflang | 1 |
| **Всього** | **21** |

## Структура проєкту

```
seo-audit-engine/
├── app/                    # Next.js App Router
│   ├── api/ai/            # API routes для AI провайдерів
│   ├── projects/          # Сторінки проєктів
│   ├── settings/          # Налаштування
│   └── page.tsx           # Дашборд
├── components/
│   ├── audit/             # FindingsTable, SeverityBadge, тощо
│   ├── layout/            # Sidebar
│   ├── settings/          # ApiKeyCard
│   ├── upload/            # SFUploader
│   └── ui/                # shadcn/ui компоненти
├── lib/
│   ├── ai/                # AI провайдери
│   ├── export/            # Markdown/CSV/JSON експорт
│   ├── rule-engine/       # Детерміновані SEO правила
│   ├── rules/             # 21 SEO правило
│   ├── sf-parser/         # Парсинг Screaming Frog файлів
│   └── store/             # Zustand store
└── types/                 # TypeScript типи
```

## Ліцензія

MIT
