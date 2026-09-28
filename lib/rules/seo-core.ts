import type { Rule } from "@/types";

// Core SEO rules — derived from user checklist + SEO development standard
export const SEO_CORE_RULES: Rule[] = [
  // ── HEADINGS ────────────────────────────────────────────────────────────
  {
    id: "heading.h1.missing",
    module: "on_page",
    rulePack: "seo_core",
    title: "Відсутній H1 заголовок",
    description: "На сторінці немає семантичного тегу H1 або ARIA-заголовка першого рівня",
    severityDefault: "critical",
    pageTypeWeights: { homepage: "critical", category: "critical", product: "high", blog: "high", filter: "medium", tag: "low" },
    conditions: [
      { field: "headings.semantic.h1.length", operator: "equals", value: 0 }
    ],
    exceptions: [
      { field: "url", pattern: "/search" },
      { field: "indexability.indexable", value: false }
    ],
    evidence: ["headings.semantic", "headings.visualCandidates"],
    recommendation: "Додайте один семантичний тег <h1> з основним ключовим запитом сторінки. H1 має бути унікальним для кожної сторінки.",
    developerHint: "Замініть контейнер заголовка на тег <h1> або додайте атрибут role=\"heading\" aria-level=\"1\".",
    enabled: true,
  },
  {
    id: "heading.h1.duplicate",
    module: "on_page",
    rulePack: "seo_core",
    title: "Два або більше H1 на сторінці",
    description: "Наявність кількох H1 суперечить семантиці HTML і погіршує структуру для пошуковиків",
    severityDefault: "critical",
    conditions: [
      { field: "headings.semantic.h1.length", operator: "greater_than", value: 1 }
    ],
    exceptions: [],
    evidence: ["headings.semantic.h1"],
    recommendation: "Залиште один H1 з основним запитом. Решту заголовків замініть на H2 або нижче.",
    developerHint: "Знайдіть усі елементи <h1> в шаблоні та компонентах. Часто другий H1 потрапляє через компонент hero або breadcrumb.",
    enabled: true,
  },
  {
    id: "heading.h1.empty",
    module: "on_page",
    rulePack: "seo_core",
    title: "Порожній H1 заголовок",
    description: "Тег H1 присутній, але не містить тексту",
    severityDefault: "high",
    conditions: [
      { field: "headings.semantic.h1.length", operator: "equals", value: 1 },
      { field: "headings.semantic.h1[0]", operator: "equals", value: "" }
    ],
    exceptions: [],
    evidence: ["headings.semantic.h1"],
    recommendation: "Заповніть H1 релевантним текстом із основним ключовим запитом.",
    enabled: true,
  },
  {
    id: "heading.visual_without_semantic",
    module: "on_page",
    rulePack: "seo_core",
    title: "Візуальний заголовок без семантичного тегу",
    description: "Знайдено елемент, що стилістично виглядає як H1 (великий жирний текст у верхній частині сторінки), але не є семантичним тегом",
    severityDefault: "medium",
    conditions: [
      { field: "headings.visualCandidates.length", operator: "greater_than", value: 0 },
      { field: "headings.semantic.h1.length", operator: "equals", value: 0 }
    ],
    exceptions: [],
    evidence: ["headings.visualCandidates"],
    recommendation: "Замініть div/span з CSS-стилізацією на семантичний тег <h1>. Для пошуковиків важлива семантика, а не зовнішній вигляд.",
    developerHint: "Приклад: замість <div class=\"page-title\"> використовуйте <h1 class=\"page-title\">.",
    enabled: true,
  },
  {
    id: "heading.hierarchy.gap",
    module: "on_page",
    rulePack: "seo_core",
    title: "Пропуск рівнів заголовків",
    description: "В ієрархії заголовків є пропуски (наприклад H1 → H3 без H2)",
    severityDefault: "low",
    conditions: [],
    exceptions: [],
    evidence: ["headings.semantic"],
    recommendation: "Дотримуйтесь послідовної ієрархії H1 → H2 → H3. Кожен рівень має логічно підпорядковуватись попередньому.",
    enabled: true,
  },

  // ── META TAGS ────────────────────────────────────────────────────────────
  {
    id: "meta.title.missing",
    module: "on_page",
    rulePack: "seo_core",
    title: "Відсутній Title сторінки",
    severityDefault: "critical",
    conditions: [
      { field: "meta.title", operator: "not_exists", value: null }
    ],
    exceptions: [],
    evidence: ["meta.title"],
    recommendation: "Додайте унікальний Title для кожної сторінки. Оптимальна довжина — 50-60 символів з основним ключовим запитом.",
    enabled: true,
  },
  {
    id: "meta.title.too_long",
    module: "on_page",
    rulePack: "seo_core",
    title: "Title перевищує рекомендовану довжину",
    severityDefault: "low",
    conditions: [
      { field: "meta.titleLength", operator: "greater_than", value: 65 }
    ],
    exceptions: [],
    evidence: ["meta.title", "meta.titleLength"],
    recommendation: "Скоротіть Title до 50-60 символів. Пошуковики обрізають довгі заголовки в результатах пошуку.",
    enabled: true,
  },
  {
    id: "meta.title.too_short",
    module: "on_page",
    rulePack: "seo_core",
    title: "Title занадто короткий",
    severityDefault: "medium",
    conditions: [
      { field: "meta.titleLength", operator: "less_than", value: 10 },
      { field: "meta.title", operator: "exists", value: null }
    ],
    exceptions: [],
    evidence: ["meta.title", "meta.titleLength"],
    recommendation: "Розширіть Title до 50-60 символів, включивши основний ключовий запит та бренд.",
    enabled: true,
  },
  {
    id: "meta.description.missing",
    module: "on_page",
    rulePack: "seo_core",
    title: "Відсутній Meta Description",
    severityDefault: "medium",
    conditions: [
      { field: "meta.description", operator: "not_exists", value: null }
    ],
    exceptions: [],
    evidence: ["meta.description"],
    recommendation: "Додайте унікальний Meta Description 120-160 символів з ключовими запитами та CTA.",
    enabled: true,
  },
  {
    id: "meta.description.too_long",
    module: "on_page",
    rulePack: "seo_core",
    title: "Meta Description перевищує рекомендовану довжину",
    severityDefault: "low",
    conditions: [
      { field: "meta.descriptionLength", operator: "greater_than", value: 165 }
    ],
    exceptions: [],
    evidence: ["meta.description", "meta.descriptionLength"],
    recommendation: "Скоротіть Meta Description до 120-160 символів. Пошуковики обрізають довгі описи в сніппетах.",
    enabled: true,
  },

  // ── HTTP / REDIRECTS ─────────────────────────────────────────────────────
  {
    id: "http.status.4xx",
    module: "technical",
    rulePack: "seo_core",
    title: "Сторінка повертає 4XX помилку",
    severityDefault: "critical",
    conditions: [
      { field: "http.statusCode", operator: "in", value: [400, 401, 403, 404, 410] }
    ],
    exceptions: [],
    evidence: ["http.statusCode", "http.redirectChain", "links.internalTotal"],
    recommendation: "Виправте або перенаправте сторінки з 4XX. 404 з inlinks потрібно перенаправляти на релевантну альтернативу.",
    developerHint: "Для Next.js: додайте redirect у next.config.ts або у middleware.ts. Для Nginx: додайте правило в конфіг.",
    enabled: true,
  },
  {
    id: "http.redirect.chain",
    module: "technical",
    rulePack: "seo_core",
    title: "Ланцюжок редиректів (3+ переходи)",
    severityDefault: "high",
    conditions: [
      { field: "http.redirectChain.length", operator: "greater_than", value: 2 }
    ],
    exceptions: [],
    evidence: ["http.redirectChain"],
    recommendation: "Скоротіть ланцюжок до прямого 301 з вихідного URL на фінальний. Кожен зайвий перехід — втрата PageRank і швидкості.",
    developerHint: "Замість A→B→C→D зробіть A→D, B→D, C→D окремими правилами.",
    enabled: true,
  },
  {
    id: "http.status.5xx",
    module: "technical",
    rulePack: "seo_core",
    title: "Сторінка повертає 5XX помилку",
    severityDefault: "critical",
    conditions: [
      { field: "http.statusCode", operator: "in", value: [500, 502, 503, 504] }
    ],
    exceptions: [],
    evidence: ["http.statusCode"],
    recommendation: "Усуньте серверні помилки. 5XX сторінки можуть призвести до деіндексації.",
    enabled: true,
  },

  // ── INDEXABILITY ──────────────────────────────────────────────────────────
  {
    id: "indexability.noindex_important",
    module: "technical",
    rulePack: "seo_core",
    title: "Важлива сторінка закрита noindex",
    severityDefault: "critical",
    pageTypeWeights: { homepage: "critical", category: "critical", product: "critical" },
    conditions: [
      { field: "indexability.noindexTag", operator: "equals", value: true }
    ],
    exceptions: [
      { field: "pageType", value: "filter" },
      { field: "pageType", value: "pagination" },
      { field: "pageType", value: "search" },
      { field: "pageType", value: "tag" }
    ],
    evidence: ["indexability", "meta.title"],
    recommendation: "Видаліть директиву noindex з важливих сторінок. Перевірте, чи не встановлена вона через шаблон.",
    enabled: true,
  },
  {
    id: "indexability.canonical_conflict",
    module: "technical",
    rulePack: "seo_core",
    title: "Canonical вказує на іншу URL (конфлікт)",
    severityDefault: "high",
    conditions: [
      { field: "indexability.canonicalSelf", operator: "equals", value: false },
      { field: "indexability.canonicalUrl", operator: "exists", value: null }
    ],
    exceptions: [],
    evidence: ["indexability.canonicalUrl", "url"],
    recommendation: "Переконайтесь, що canonical вказує правильно. Якщо сторінка — первинна версія, canonical має вказувати на саму себе.",
    enabled: true,
  },
  {
    id: "indexability.noindex_and_canonical",
    module: "technical",
    rulePack: "seo_core",
    title: "Конфлікт noindex + self-canonical",
    severityDefault: "high",
    conditions: [
      { field: "indexability.noindexTag", operator: "equals", value: true },
      { field: "indexability.canonicalSelf", operator: "equals", value: true }
    ],
    exceptions: [],
    evidence: ["indexability"],
    recommendation: "Noindex і self-canonical — суперечливі сигнали. Визначтеся: або сторінка індексується (прибрати noindex), або ні (прибрати canonical).",
    enabled: true,
  },

  // ── IMAGES ────────────────────────────────────────────────────────────────
  {
    id: "images.alt.missing",
    module: "on_page",
    rulePack: "seo_core",
    title: "Зображення без атрибута alt",
    severityDefault: "medium",
    conditions: [
      { field: "images", operator: "contains", value: { issues: ["missing_alt"] } }
    ],
    exceptions: [],
    evidence: ["images"],
    recommendation: "Додайте описовий alt-текст до всіх змістових зображень. Декоративні зображення мають мати alt=\"\".",
    developerHint: "Для змістових зображень: alt=\"Опис зображення\". Для декоративних: alt=\"\" (порожній атрибут, не відсутній).",
    enabled: true,
  },
  {
    id: "images.size.large",
    module: "on_page",
    rulePack: "seo_core",
    title: "Зображення більше 500KB",
    severityDefault: "medium",
    conditions: [
      { field: "images", operator: "contains", value: { issues: ["oversized"] } }
    ],
    exceptions: [],
    evidence: ["images"],
    recommendation: "Оптимізуйте зображення до розміру < 200KB. Використовуйте формат WebP або AVIF замість JPEG/PNG.",
    developerHint: "Для Next.js: використовуйте компонент <Image> — він автоматично оптимізує та конвертує в WebP.",
    enabled: true,
  },

  // ── STRUCTURED DATA ───────────────────────────────────────────────────────
  // NOTE: These rules require live verification — Screaming Frog basic export
  // does NOT crawl JS-rendered structured data. Enable only if using SF's
  // "Structured Data" tab export, or rely on the built-in live verification.
  {
    id: "schema.missing",
    module: "structured_data",
    rulePack: "seo_core",
    title: "Відсутня розмітка Schema.org",
    severityDefault: "low",
    pageTypeWeights: { product: "medium", blog: "medium", homepage: "medium" },
    conditions: [
      { field: "structuredData.typesFound.length", operator: "equals", value: 0 }
    ],
    exceptions: [],
    evidence: ["structuredData"],
    recommendation: "Додайте відповідний тип Schema.org: Product для товарів, Article для блогу, Organization для головної, BreadcrumbList для всіх сторінок.",
    developerHint: "⚠️ Screaming Frog не аналізує JS-рендеровану схему. Використайте кнопку «Перевірити» для живої верифікації через реальний HTML сторінки.",
    enabled: false, // Disabled: SF basic export cannot detect JS-rendered schema. Use live verification instead.
  },
  {
    id: "schema.breadcrumb.missing",
    module: "structured_data",
    rulePack: "seo_core",
    title: "Відсутній BreadcrumbList Schema.org",
    severityDefault: "low",
    conditions: [
      { field: "structuredData.hasBreadcrumb", operator: "equals", value: false }
    ],
    exceptions: [
      { field: "pageType", value: "homepage" }
    ],
    evidence: ["structuredData"],
    recommendation: "Додайте розмітку BreadcrumbList — вона покращує сніппет у пошуку та допомагає пошуковикам зрозуміти структуру сайту.",
    developerHint: "⚠️ Screaming Frog не аналізує JS-рендеровану схему. Використайте кнопку «Перевірити» для живої верифікації через реальний HTML сторінки.",
    enabled: false, // Disabled: SF basic export cannot detect JS-rendered schema. Use live verification instead.
  },

  // ── HREFLANG ─────────────────────────────────────────────────────────────
  {
    id: "hreflang.missing",
    module: "international",
    rulePack: "seo_core",
    title: "Відсутній hreflang для мультимовного сайту",
    severityDefault: "high",
    conditions: [
      { field: "hreflang.length", operator: "equals", value: 0 }
    ],
    exceptions: [],
    evidence: ["hreflang", "http.statusCode"],
    recommendation: "Для мультимовних сайтів додайте hreflang теги для кожної мовної версії на всіх сторінках.",
    enabled: false, // Enabled per-project if multilingual
  },

  // ── CANONICAL ────────────────────────────────────────────────────────────
  {
    id: "canonical.missing",
    module: "indexability",
    rulePack: "seo_core",
    title: "Відсутній canonical тег",
    description: "Індексована сторінка не має тегу canonical. Без нього пошуковик сам вирішить, яка версія URL є основною, що може призвести до дублювання.",
    severityDefault: "medium",
    pageTypeWeights: {
      homepage: "high",
      product: "high",
      category: "high",
    },
    conditions: [
      { field: "indexability.indexable", operator: "equals", value: true },
      { field: "indexability.canonicalUrl", operator: "not_exists" },
    ],
    exceptions: [],
    evidence: ["url", "indexability.canonicalUrl", "indexability.indexable"],
    recommendation: "Додайте <link rel=\"canonical\" href=\"...\"> на кожну індексовану сторінку, щоб чітко вказати пошуковику канонічну URL.",
    developerHint: "Поле `Canonical Link Element 1` у Screaming Frog порожнє для цих сторінок.",
    enabled: true,
  },

  // ── H1 TOO LONG ──────────────────────────────────────────────────────────
  {
    id: "heading.h1.too_long",
    module: "headings",
    rulePack: "seo_core",
    title: "H1 занадто довгий (> 70 символів)",
    description: "Надто довгий H1 важко сприймається та може негативно впливати на семантичну вагу ключових слів у заголовку.",
    severityDefault: "low",
    conditions: [
      { field: "indexability.indexable", operator: "equals", value: true },
      { field: "headings.h1Length", operator: "greater_than", value: 70 },
    ],
    exceptions: [],
    evidence: ["headings.h1Length", "headings.semantic.h1"],
    recommendation: "Скоротіть H1 до 60–70 символів: залиште головне ключове слово та основну думку, приберіть зайві прикметники та повтори.",
    developerHint: "Значення H1-1 Length у Screaming Frog перевищує 70 символів.",
    enabled: true,
  },

  // ── URL TOO LONG ─────────────────────────────────────────────────────────
  {
    id: "url.too_long",
    module: "technical",
    rulePack: "seo_core",
    title: "URL занадто довгий (> 115 символів)",
    description: "Довгі URL важчі для користувача та можуть отримувати меншу вагу у пошукових алгоритмах. SF вважає проблемою URL > 115 символів.",
    severityDefault: "low",
    conditions: [
      { field: "indexability.indexable", operator: "equals", value: true },
      { field: "urlLength", operator: "greater_than", value: 115 },
    ],
    exceptions: [],
    evidence: ["url", "urlLength"],
    recommendation: "Вкоротіть URL: використовуйте 3–5 слів з ключовим словом, приберіть стоп-слова, ідентифікатори та зайві підпапки.",
    developerHint: "Поле URL Length / довжина URL у символах > 115.",
    enabled: true,
  },

  // ── NEAR DUPLICATES ──────────────────────────────────────────────────────
  {
    id: "content.near_duplicate",
    module: "content",
    rulePack: "seo_core",
    title: "Майже дублікат контенту",
    description: "Screaming Frog виявив, що ця сторінка дуже схожа за текстом на інші сторінки сайту. Це може негативно вплинути на ранжування через конкуренцію власних сторінок між собою.",
    severityDefault: "medium",
    conditions: [
      { field: "indexability.indexable", operator: "equals", value: true },
      { field: "nearDuplicates", operator: "greater_than", value: 0 },
    ],
    exceptions: [
      { field: "pageType", value: "pagination" },
      { field: "pageType", value: "filter" },
    ],
    evidence: ["url", "nearDuplicates", "pageType"],
    recommendation: "Перегляньте групи дублікатів: або об'єднайте сторінки (301 редирект + canonical), або зробіть контент достатньо унікальним. Типова причина — шаблонний опис продуктів або кілька мовних версій з майже однаковим вмістом.",
    developerHint: "Поле «No. Near Duplicates» у SF > 0. Відкрийте вкладку Duplicate Content у Screaming Frog, щоб побачити групи.",
    enabled: true,
  },

  // ── HIGH CRAWL DEPTH ─────────────────────────────────────────────────────
  {
    id: "crawl.depth.high",
    module: "technical",
    rulePack: "seo_core",
    title: "Висока глибина сканування (≥ 4 кліки від головної)",
    description: "Сторінки, до яких треба зробити 4 і більше кліків з головної, погано скануються пошуковими ботами та отримують менше авторитету посилань.",
    severityDefault: "medium",
    pageTypeWeights: {
      product: "high",
      category: "high",
      blog: "medium",
      pagination: "low",
      filter: "low",
    },
    conditions: [
      { field: "indexability.indexable", operator: "equals", value: true },
      { field: "crawlDepth", operator: "greater_than", value: 3 },
    ],
    exceptions: [
      { field: "pageType", value: "pagination" },
      { field: "pageType", value: "filter" },
    ],
    evidence: ["url", "crawlDepth", "pageType", "inlinks"],
    recommendation: "Додайте посилання на важливі сторінки зі зручніших місць: головне меню, мегаменю, блок «популярне», хлібні крихти на рівні вище, внутрішні посилання з популярних сторінок.",
    developerHint: "Поле Crawl Depth у Screaming Frog ≥ 4.",
    enabled: true,
  },
];

export const RULE_PACKS = {
  seo_core: {
    id: "seo_core",
    name: "SEO Core",
    description: "Базові SEO-перевірки: заголовки, мета-теги, редиректи, індексація",
    rulesCount: SEO_CORE_RULES.length,
    enabled: true,
  },
};

export function getRuleById(id: string): Rule | undefined {
  return SEO_CORE_RULES.find((r) => r.id === id);
}

export function getRulesByPack(packId: string): Rule[] {
  return SEO_CORE_RULES.filter((r) => r.rulePack === packId && r.enabled);
}
