/**
 * Прогон промпта по набору товаров.
 *
 * Зачем: промпт - это и есть твой продукт. Менять его на глаз, по одному
 * товару, бесполезно: покажется лучше там, станет хуже здесь. Нужен
 * постоянный набор примеров, на котором сравниваешь "было - стало".
 *
 * Как пользоваться:
 *   npm run try-prompt                 прогнать все 10 товаров
 *   npm run try-prompt -- --only 3     только третий (быстро и дёшево)
 *
 * Результат ложится в prompt-runs/ отдельным файлом с датой в имени.
 * Правишь SYSTEM_PROMPT в src/lib/llm.ts, гоняешь снова - и сравниваешь
 * два файла рядом.
 *
 * ВНИМАНИЕ: с настоящей моделью каждый прогон стоит денег. Десять товаров -
 * это десять запросов. Пока настраиваешь форму отчёта, держи LLM_PROVIDER=mock.
 */

import fs from "node:fs";
import path from "node:path";
import { generateCard, LlmError, type Card, type CardInput } from "../src/lib/llm.ts";

// Читаем .env сами: этот скрипт запускается без Next, который обычно
// делает это за нас.
function loadEnv() {
  let text: string;
  try {
    text = fs.readFileSync(".env", "utf8");
  } catch {
    // Файла нет либо он закрыт правами - и это нормально.
    // При запуске через try-prompt.sh файл читает docker на хосте
    // (от root) и передаёт значения внутрь контейнера, а там процесс
    // работает от обычного пользователя и файл уже не откроет.
    // Нужные значения к этому моменту лежат в process.env.
    return;
  }

  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

function report(input: CardInput, card: Card): string {
  const warn: string[] = [];
  if (card.title.length > 100) warn.push(`заголовок ${card.title.length} символов - длиннее 100`);
  if (card.bullets.length !== 5) warn.push(`буллетов ${card.bullets.length}, а не 5`);
  if (card.description.length < 1200) warn.push(`описание короткое: ${card.description.length}`);
  if (card.keywords.length < 20) warn.push(`ключевых слов ${card.keywords.length}, меньше 20`);

  // Повтор одного корня в ключевых словах - признак, что модель
  // набивает количество падежами вместо реальных синонимов.
  const roots = card.keywords.map((k) => k.toLowerCase().slice(0, 5));
  const dupes = roots.length - new Set(roots).size;
  if (dupes > 8) warn.push(`${dupes} ключевых слов с одинаковым началом - похоже на падежи`);

  return [
    `${"=".repeat(70)}`,
    `ТОВАР: ${input.name}`,
    `Площадка: ${input.marketplace} · Категория: ${input.category}`,
    warn.length ? `\n⚠ ЧТО НЕ ТАК: ${warn.join("; ")}` : `\n✓ формальных претензий нет`,
    ``,
    `--- ЗАГОЛОВОК (${card.title.length} символов) ---`,
    card.title,
    ``,
    `--- БУЛЛЕТЫ ---`,
    ...card.bullets.map((b, i) => `${i + 1}. ${b}`),
    ``,
    `--- ОПИСАНИЕ (${card.description.length} символов) ---`,
    card.description,
    ``,
    `--- КЛЮЧЕВЫЕ СЛОВА (${card.keywords.length}) ---`,
    card.keywords.join(", "),
    ``,
    `--- ПОИСКОВЫЕ ЗАПРОСЫ (${card.search_queries.length}) ---`,
    ...card.search_queries.map((q) => `  ${q}`),
    ``,
  ].join("\n");
}

async function main() {
  loadEnv();

  const products = JSON.parse(
    fs.readFileSync("scripts/products.json", "utf8"),
  ) as CardInput[];

  const onlyArg = process.argv.indexOf("--only");
  const selected =
    onlyArg !== -1 && process.argv[onlyArg + 1]
      ? [products[Number(process.argv[onlyArg + 1]) - 1]].filter(Boolean)
      : products;

  const provider = process.env.LLM_PROVIDER || "mock";
  console.log(`Провайдер: ${provider}`);
  if (provider === "mock") {
    console.log("Это заглушка - тексты ненастоящие. Для настоящих смени LLM_PROVIDER в .env\n");
  } else {
    console.log(`Запросов будет ${selected.length}. Каждый стоит денег.\n`);
  }

  const parts: string[] = [
    `Прогон промпта · ${new Date().toLocaleString("ru-RU")}`,
    `Провайдер: ${provider}`,
    `Товаров: ${selected.length}`,
    ``,
  ];

  let failed = 0;
  for (const [i, product] of selected.entries()) {
    process.stdout.write(`[${i + 1}/${selected.length}] ${product.name} … `);
    const started = Date.now();
    try {
      const card = await generateCard(product);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`готово за ${secs} с`);
      parts.push(report(product, card));
    } catch (error) {
      failed++;
      const message = error instanceof LlmError ? error.message : String(error);
      console.log(`ОШИБКА: ${message}`);
      parts.push(`${"=".repeat(70)}\nТОВАР: ${product.name}\n\nОШИБКА: ${message}\n`);
    }
  }

  fs.mkdirSync("prompt-runs", { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = path.join("prompt-runs", `${stamp}-${provider}.txt`);
  fs.writeFileSync(file, parts.join("\n"), "utf8");

  console.log(`\nОтчёт: ${file}`);
  if (failed) console.log(`Не получилось: ${failed} из ${selected.length}`);
  console.log(`
Что делать дальше:
  1. Открой отчёт и прочитай его как покупатель, а не как автор.
  2. Выпиши, что не нравится: общие буллеты, канцелярит, кривые ключи.
  3. Поправь SYSTEM_PROMPT в src/lib/llm.ts.
  4. Запусти снова и открой два отчёта рядом.`);
}

main();
