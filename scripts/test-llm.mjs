/**
 * Проверка слоя работы с моделью - без единого обращения к настоящему
 * OpenAI и без единого потраченного рубля.
 *
 * Как это работает: поднимаем поддельный сервер, который отвечает как
 * OpenAI, и смотрим, ЧТО именно наш код ему посылает. Так ловятся ошибки
 * вида "послали max_tokens вместо max_completion_tokens" - на настоящем
 * API они стоили бы денег и времени.
 *
 * Запуск:  npm run test-llm   (входит в npm run smoke)
 */

import http from "node:http";
import { generateCard, LlmError } from "../src/lib/llm.ts";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const CARD = {
  title: "Термокружка стальная 450 мл, держит тепло 8 часов",
  bullets: ["раз", "два", "три", "четыре", "пять"],
  description: "х".repeat(1400),
  keywords: Array.from({ length: 22 }, (_, i) => `слово${i}`),
  search_queries: Array.from({ length: 10 }, (_, i) => `запрос ${i}`),
};

const INPUT = {
  marketplace: "wildberries",
  name: "Термокружка стальная 450 мл",
  category: "Посуда",
  features: "Двойные стенки",
  audience: "Офис",
};

/** Поддельный OpenAI. reply решает, что он ответит. */
function fakeOpenAi(reply) {
  const seen = { body: null, headers: null, path: null };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.path = req.url;
      seen.headers = req.headers;
      try { seen.body = JSON.parse(raw); } catch { seen.body = raw; }
      const { status, payload } = reply();
      res.writeHead(status, { "content-type": "application/json" });
      res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, seen, port: server.address().port });
    });
  });
}

function useOpenAi(port) {
  process.env.LLM_PROVIDER = "openai";
  process.env.LLM_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.LLM_API_KEY = "test-key-not-real";
  process.env.LLM_MODEL = "test-model";
}

console.log("\nЧто наш код посылает в OpenAI");
console.log("──────────────────────────────");
{
  const ok = () => ({
    status: 200,
    payload: { choices: [{ message: { content: JSON.stringify(CARD) }, finish_reason: "stop" }] },
  });
  const { server, seen, port } = await fakeOpenAi(ok);
  useOpenAi(port);

  const card = await generateCard(INPUT);
  const body = seen.body;

  check("запрос уходит на /v1/chat/completions", seen.path === "/v1/chat/completions", seen.path);
  check("ключ передан в заголовке", seen.headers.authorization === "Bearer test-key-not-real");
  check("используется max_completion_tokens", "max_completion_tokens" in body);
  check(
    "старый max_tokens НЕ отправляется (GPT-5.x его отвергает)",
    !("max_tokens" in body),
    "max_tokens" in body ? "он есть в запросе" : "",
  );
  check("включён строгий режим по схеме", body.response_format?.type === "json_schema");
  check("схема помечена strict", body.response_format?.json_schema?.strict === true);

  const schemaText = JSON.stringify(body.response_format?.json_schema?.schema ?? {});
  check(
    "из схемы убраны minItems/maxItems (строгий режим их не понимает)",
    !schemaText.includes("minItems") && !schemaText.includes("maxItems"),
  );
  check("в схеме запрещены лишние поля", schemaText.includes('"additionalProperties":false'));
  check("все пять полей карточки обязательны", schemaText.includes('"search_queries"'));

  check("ответ разобран: заголовок", card.title === CARD.title);
  check("ответ разобран: пять буллетов", card.bullets.length === 5);
  check("ответ разобран: ключевые слова", card.keywords.length === 22);

  server.close();
}

console.log("\nЧто будет, когда OpenAI откажет");
console.log("──────────────────────────────");

async function expectError(name, reply, matcher) {
  const { server, port } = await fakeOpenAi(reply);
  useOpenAi(port);
  try {
    await generateCard(INPUT);
    check(name, false, "ошибки не было, хотя ожидалась");
  } catch (error) {
    const isLlm = error instanceof LlmError;
    check(name, isLlm && matcher(error), isLlm ? error.message.slice(0, 80) : String(error));
  }
  server.close();
}

await expectError(
  "403 объясняется блокировкой по стране",
  () => ({ status: 403, payload: { error: { message: "unsupported_country_region_territory" } } }),
  (e) => e.message.includes("блокировка по стране") && e.retryable === false,
);

await expectError(
  "401 говорит про неверный ключ",
  () => ({ status: 401, payload: { error: { message: "invalid api key" } } }),
  (e) => e.message.includes("ключ") && e.retryable === false,
);

await expectError(
  "429 говорит про лимиты и кредиты",
  () => ({ status: 429, payload: { error: {} } }),
  (e) => e.message.includes("кредиты") && e.retryable === true,
);

await expectError(
  "400 показывает текст ошибки OpenAI",
  () => ({ status: 400, payload: { error: { message: "Unsupported parameter: max_tokens" } } }),
  (e) => e.message.includes("max_tokens"),
);

await expectError(
  "обрыв на середине ответа не выдаётся за успех",
  () => ({
    status: 200,
    payload: { choices: [{ message: { content: "{\"title\":" }, finish_reason: "length" }] },
  }),
  (e) => e.message.includes("не поместился"),
);

await expectError(
  "отказ модели обработан",
  () => ({
    status: 200,
    payload: { choices: [{ message: { refusal: "no", content: null } }] },
  }),
  (e) => e.message.includes("отказалась"),
);

await expectError(
  "мусор вместо JSON не проходит дальше",
  () => ({
    status: 200,
    payload: { choices: [{ message: { content: "это не json" }, finish_reason: "stop" }] },
  }),
  (e) => e.message.includes("не-JSON"),
);

console.log(`\n${"─".repeat(50)}`);
if (failures.length === 0) {
  console.log(`Слой модели в порядке: ${passed} проверок пройдено.`);
  process.exit(0);
} else {
  console.log(`Пройдено ${passed}, сломано ${failures.length}:`);
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
