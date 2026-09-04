/**
 * Слой между продуктом и моделью.
 *
 * Зачем прослойка, а не вызов SDK прямо в API-роуте: провайдера ты
 * поменяешь ещё не раз (цена, доступность, качество), а продукт при этом
 * трогать не хочется. Здесь один вход - generateCard() - и три реализации
 * под ним.
 *
 * mock работает без ключей и без денег. Это не костыль: на нём удобно
 * крутить вёрстку и показывать демо, не сжигая бюджет.
 */

export type CardInput = {
  marketplace: "wildberries" | "ozon";
  name: string;
  category: string;
  features: string;
  audience: string;
};

export type Card = {
  title: string;
  bullets: string[];
  description: string;
  keywords: string[];
  search_queries: string[];
};

/** Схема ответа. Одна на всех провайдеров - чтобы продукт не зависел от того, кто отвечает. */
const CARD_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Заголовок карточки, до 100 символов, с главным ключевым словом в начале",
    },
    bullets: {
      type: "array",
      items: { type: "string" },
      minItems: 5,
      maxItems: 5,
      description: "Пять коротких выгод для покупателя, не характеристик",
    },
    description: {
      type: "string",
      description: "Описание товара 1200-2000 символов, живым языком, без канцелярита",
    },
    keywords: {
      type: "array",
      items: { type: "string" },
      minItems: 20,
      maxItems: 30,
      description: "Ключевые слова для поля 'ключевые слова'",
    },
    search_queries: {
      type: "array",
      items: { type: "string" },
      minItems: 10,
      maxItems: 10,
      description: "Реальные поисковые запросы, которыми покупатель ищет такой товар",
    },
  },
  required: ["title", "bullets", "description", "keywords", "search_queries"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Ты - копирайтер маркетплейсов с опытом в e-commerce.
Ты пишешь карточки товаров для Wildberries и Ozon, которые попадают в поиск и продают.

Правила:
- Пиши на русском, живым языком продавца, а не языком инструкции к холодильнику.
- Никакого канцелярита ("данный товар представляет собой"), никаких пустых эпитетов
  ("высочайшее качество", "идеальное решение") - они не продают и не индексируются.
- Заголовок: главное ключевое слово в начале, до 100 символов, без спецсимволов и КАПСА.
- Буллеты - это выгоды покупателя ("не скользит на мокром полу"), а не характеристики
  ("подошва ТПР"). Характеристику превращай в выгоду.
- Ключевые слова - то, что человек реально набирает в поиске, включая опечатки и синонимы.
  Не повторяй одно слово в разных падежах ради количества.
- Не выдумывай характеристики, которых нет во вводных данных. Если данных мало -
  пиши общо, но честно.`;

function buildUserPrompt(input: CardInput): string {
  const mp = input.marketplace === "ozon" ? "Ozon" : "Wildberries";
  return `Маркетплейс: ${mp}
Название товара: ${input.name}
Категория: ${input.category}
Характеристики: ${input.features}
Целевая аудитория: ${input.audience || "не указана, определи сам по товару"}

Сделай карточку товара.`;
}

/** Ошибка, текст которой не стыдно показать пользователю. */
export class LlmError extends Error {
  // Поле объявлено и присвоено отдельно, а не сокращённой записью
  // в конструкторе: сокращённая не переживает удаление типов, и тогда
  // scripts/try-prompt.ts не смог бы загрузить этот файл напрямую.
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "LlmError";
    this.retryable = retryable;
  }
}

export async function generateCard(input: CardInput): Promise<Card> {
  const provider = process.env.LLM_PROVIDER || "mock";
  switch (provider) {
    case "anthropic":
      return viaAnthropic(input);
    case "openai":
      return viaOpenAi(input);
    case "openai-compatible":
      return viaOpenAiCompatible(input);
    case "mock":
      return viaMock(input);
    default:
      throw new LlmError(`Неизвестный LLM_PROVIDER: "${provider}". Проверь .env`, false);
  }
}

// --- Claude ----------------------------------------------------------------

async function viaAnthropic(input: CardInput): Promise<Card> {
  // SDK загружается только здесь, а не в начале файла.
  // Зачем: при работе через OpenAI он не нужен вовсе, и без верхнего
  // import этот файл запускается голым node - без npm install.
  // Благодаря этому настройку промпта можно гонять на сервере,
  // где из инструментов есть только Docker.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic(); // ключ берётся из ANTHROPIC_API_KEY

  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      // Структурированный вывод: модель обязана вернуть JSON нужной формы.
      // Без этого пришлось бы выковыривать JSON из текста регулярками.
      output_config: { format: { type: "json_schema", schema: CARD_SCHEMA } },
    });

    if (response.stop_reason === "refusal") {
      throw new LlmError("Модель отказалась обрабатывать этот запрос. Измени формулировку.", false);
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new LlmError("Модель вернула пустой ответ. Попробуй ещё раз.", true);
    }
    return parseCard(text.text);
  } catch (error) {
    if (error instanceof LlmError) throw error;
    // Типизированные классы ошибок, а не разбор текста сообщения.
    if (error instanceof Anthropic.AuthenticationError) {
      throw new LlmError("Неверный ключ API. Проверь ANTHROPIC_API_KEY в .env", false);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new LlmError("Слишком много запросов к модели. Подожди минуту.", true);
    }
    if (error instanceof Anthropic.APIError) {
      throw new LlmError(`Модель недоступна (код ${error.status}). Попробуй позже.`, true);
    }
    throw new LlmError("Не удалось связаться с моделью. Проверь интернет.", true);
  }
}

// --- OpenAI ----------------------------------------------------------------

/**
 * Отдельный провайдер именно для OpenAI, а не общий openai-compatible.
 *
 * Причина в двух местах, где настоящий OpenAI разошёлся с тем, что
 * понимают совместимые сервисы:
 *   - у него max_completion_tokens вместо max_tokens (модели GPT-5.x
 *     на max_tokens отвечают ошибкой);
 *   - у него есть строгий режим по схеме: модель обязана вернуть
 *     ответ нужной формы, а не просто валидный JSON.
 *
 * Российские шлюзы этих новшеств обычно не знают, поэтому старый
 * openai-compatible оставлен нетронутым - он рабочий путь отхода,
 * если аккаунт OpenAI однажды отключат.
 */

/**
 * Строгий режим OpenAI понимает не весь JSON Schema: ограничения на
 * длину массивов он отвергает. Выкидываем их, а требование "ровно пять
 * буллетов" и так написано словами в описаниях полей и в промпте.
 */
function toStrictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictSchema);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "minItems" || key === "maxItems" || key === "minLength" || key === "maxLength") {
      continue;
    }
    out[key] = toStrictSchema(value);
  }
  return out;
}

async function viaOpenAi(input: CardInput): Promise<Card> {
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  const base = process.env.LLM_BASE_URL || "https://api.openai.com/v1";

  if (!key) throw new LlmError("Не заполнен LLM_API_KEY в .env", false);
  if (!model) {
    throw new LlmError(
      "Не заполнен LLM_MODEL в .env. Список доступных моделей покажет ./check-llm.sh",
      false,
    );
  }

  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_completion_tokens: 4000,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "product_card",
            strict: true,
            schema: toStrictSchema(CARD_SCHEMA),
          },
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new LlmError("OpenAI не отвечает. Проверь интернет на сервере.", true);
  }

  if (response.status === 401) {
    throw new LlmError("OpenAI не принял ключ. Проверь LLM_API_KEY в .env", false);
  }
  if (response.status === 403) {
    // Самая частая причина именно у нас: OpenAI не обслуживает регион.
    throw new LlmError(
      "OpenAI отказал в доступе (403). Обычно это блокировка по стране: " +
        "сервер должен выходить в интернет из поддерживаемого региона.",
      false,
    );
  }
  if (response.status === 429) {
    throw new LlmError("Слишком много запросов или кончились кредиты OpenAI.", true);
  }
  if (!response.ok) {
    // Текст ошибки OpenAI обычно объясняет причину точнее любых догадок.
    const detail = await response.text().catch(() => "");
    throw new LlmError(
      `OpenAI вернул ошибку ${response.status}. ${detail.slice(0, 300)}`,
      response.status >= 500,
    );
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string; refusal?: string | null }; finish_reason?: string }[];
  };
  const choice = data.choices?.[0];

  if (choice?.message?.refusal) {
    throw new LlmError("Модель отказалась обрабатывать этот запрос. Измени формулировку.", false);
  }
  if (choice?.finish_reason === "length") {
    throw new LlmError("Ответ не поместился в лимит. Сократи характеристики товара.", true);
  }

  const content = choice?.message?.content;
  if (!content) throw new LlmError("OpenAI вернул пустой ответ. Попробуй ещё раз.", true);
  return parseCard(content);
}

// --- Любой сервис с OpenAI-совместимым API ---------------------------------

async function viaOpenAiCompatible(input: CardInput): Promise<Card> {
  const base = process.env.LLM_BASE_URL;
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!base || !key || !model) {
    throw new LlmError("Не заполнены LLM_BASE_URL / LLM_API_KEY / LLM_MODEL в .env", false);
  }

  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            // Схему кладём прямо в промпт: у OpenAI-совместимых сервисов
            // json_object гарантирует валидный JSON, но не его форму.
            content: `${SYSTEM_PROMPT}\n\nОтветь строго JSON-объектом по схеме:\n${JSON.stringify(CARD_SCHEMA)}`,
          },
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new LlmError("Сервис модели не отвечает. Проверь LLM_BASE_URL.", true);
  }

  if (response.status === 401 || response.status === 403) {
    throw new LlmError("Неверный ключ. Проверь LLM_API_KEY в .env", false);
  }
  if (response.status === 429) {
    throw new LlmError("Слишком много запросов к модели. Подожди минуту.", true);
  }
  if (!response.ok) {
    throw new LlmError(`Модель недоступна (код ${response.status}). Попробуй позже.`, true);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new LlmError("Модель вернула пустой ответ. Попробуй ещё раз.", true);
  return parseCard(content);
}

// --- Заглушка для разработки -----------------------------------------------

async function viaMock(input: CardInput): Promise<Card> {
  // Небольшая задержка, чтобы в интерфейсе было видно состояние загрузки.
  await new Promise((r) => setTimeout(r, 700));
  const n = input.name || "Товар";
  return {
    title: `${n} - ${input.category || "универсальный"}, быстрая доставка`.slice(0, 100),
    bullets: [
      "Не придётся докупать ничего отдельно - всё в комплекте",
      "Выдерживает ежедневное использование, а не только распаковку",
      "Подходит под большинство размеров, не нужно угадывать",
      "Понятная инструкция - разберётся любой",
      "Если не подойдёт, вернёте без вопросов",
    ],
    description:
      `[ЗАГЛУШКА, LLM_PROVIDER=mock]\n\n${n} - это то, что вы искали, если вам нужен ` +
      `${input.category || "надёжный вариант"} без переплаты за бренд. ` +
      `${input.features || "Основные характеристики указаны в карточке."} ` +
      `Мы собрали его для тех, кому важен результат, а не красивая коробка.\n\n` +
      `Чтобы здесь появился настоящий текст - пропиши LLM_PROVIDER и ключ в .env.`,
    keywords: Array.from({ length: 22 }, (_, i) => `ключевое слово ${i + 1}`),
    search_queries: Array.from({ length: 10 }, (_, i) => `${n} купить ${i + 1}`),
  };
}

// --- Разбор и проверка ответа ----------------------------------------------

/**
 * Никогда не доверяй ответу модели на слово.
 * Даже со структурированным выводом проверь форму перед тем, как показывать.
 */
function parseCard(raw: string): Card {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new LlmError("Модель вернула не-JSON. Попробуй ещё раз.", true);
  }

  const c = data as Partial<Card>;
  const strings = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");

  if (
    typeof c.title !== "string" ||
    typeof c.description !== "string" ||
    !strings(c.bullets) ||
    !strings(c.keywords) ||
    !strings(c.search_queries)
  ) {
    throw new LlmError("Модель вернула ответ неожиданной формы. Попробуй ещё раз.", true);
  }

  return {
    title: c.title,
    bullets: c.bullets,
    description: c.description,
    keywords: c.keywords,
    search_queries: c.search_queries,
  };
}
