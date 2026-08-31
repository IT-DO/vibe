/**
 * Дымовой тест: проходит весь путь пользователя по-настоящему, через HTTP.
 *
 * Зачем он тебе нужен, если ты не программист: это единственный способ
 * узнать, что нейросеть не сломала работающее, когда правила соседний файл.
 * Запускай после каждого крупного изменения:  npm run smoke
 *
 * Тест поднимает сервер сам, гоняет сценарий и гасит сервер.
 * База берётся отдельная, временная - твои настоящие данные не тронет.
 */

import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Свободный порт от системы: так тест не спорит за него с самим собой. */
async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(String(port)));
    });
  });
}

const PORT = process.env.SMOKE_PORT || (await freePort());
const BASE = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "smoke-")), "smoke.db");

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

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return true;
    } catch {
      // сервер ещё поднимается
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const server = spawn("npx", ["next", "start", "-p", PORT], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_PATH: dbFile,
    SESSION_SECRET: "smoke-test-secret",
    LLM_PROVIDER: "mock",
    FREE_CREDITS_ON_SIGNUP: "3",
    YOOKASSA_SHOP_ID: "",
    YOOKASSA_SECRET_KEY: "",
    YOOKASSA_VERIFY_IP: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // своя группа процессов - чтобы её можно было убить целиком
});
server.stdout.on("data", () => {});
server.stderr.on("data", (chunk) => process.env.SMOKE_DEBUG && process.stderr.write(chunk));

let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  // Убиваем всю группу процессов: next start поднимает дочерний
  // next-server, и без этого он переживёт тест и займёт порт.
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    server.kill("SIGKILL");
  }
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
}

// Если тест прервали с клавиатуры или снаружи - сервер всё равно гасим.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop();
    process.exit(130);
  });
}

try {
  console.log(`\nПоднимаю сервер на ${BASE} …`);
  if (!(await waitForServer())) throw new Error("сервер не поднялся за 60 секунд");

  console.log("\nСтраницы:");
  check("главная открывается", (await fetch(BASE)).status === 200);
  check("тарифы открываются", (await fetch(`${BASE}/pricing`)).status === 200);
  check("оферта открывается", (await fetch(`${BASE}/legal/offer`)).status === 200);

  console.log("\nДоступ без входа:");
  const guest = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Тест" }),
  });
  check("генерация без входа запрещена", guest.status === 401, `получили ${guest.status}`);

  console.log("\nРегистрация:");
  const email = `smoke-${Date.now()}@example.ru`;
  const registered = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "parol12345" }),
  });
  check("регистрация проходит", registered.status === 200, `получили ${registered.status}`);

  const cookie = (registered.headers.get("set-cookie") || "").split(";")[0];
  check("сессия выдана", cookie.startsWith("sid="));

  const short = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `x${Date.now()}@example.ru`, password: "123" }),
  });
  check("короткий пароль отклоняется", short.status === 400);

  const duplicate = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "parol12345" }),
  });
  check("повторная почта отклоняется", duplicate.status === 409);

  console.log("\nВход:");
  const wrongPass = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "nepravilnyy" }),
  });
  check("неверный пароль отклоняется", wrongPass.status === 401);

  console.log("\nГенерация и списание кредитов:");
  async function generate() {
    const response = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        marketplace: "wildberries",
        name: "Термокружка стальная 450 мл",
        category: "Посуда",
        features: "Двойные стенки, держит тепло 8 часов",
        audience: "Офисные сотрудники",
      }),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }

  const first = await generate();
  check("первая генерация проходит", first.status === 200, `получили ${first.status}`);
  const card = first.body.card || {};
  check("есть заголовок", typeof card.title === "string" && card.title.length > 0);
  check("пять буллетов", Array.isArray(card.bullets) && card.bullets.length === 5);
  check("есть описание", typeof card.description === "string" && card.description.length > 50);
  check("есть ключевые слова", Array.isArray(card.keywords) && card.keywords.length >= 20);
  check("десять запросов", Array.isArray(card.search_queries) && card.search_queries.length === 10);
  check("списался ровно 1 кредит из 3", first.body.credits === 2, `осталось ${first.body.credits}`);

  const second = await generate();
  const third = await generate();
  check("баланс дошёл до нуля", third.body.credits === 0, `осталось ${third.body.credits}`);
  check("вторая генерация прошла", second.status === 200);

  const overdraft = await generate();
  check("без кредитов генерация запрещена", overdraft.status === 402, `получили ${overdraft.status}`);
  check("клиенту сказано пополнить", overdraft.body.needCredits === true);

  console.log("\nПустое название:");
  const empty = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "" }),
  });
  check("пустое название отклоняется", empty.status === 400);

  console.log("\nЗащита вебхука оплаты:");
  const webhook = `${BASE}/api/billing/yookassa/webhook`;
  const body = JSON.stringify({ event: "payment.succeeded", object: { id: "fake", status: "succeeded" } });

  const stranger = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body,
  });
  check("вебхук с чужого адреса отклонён", stranger.status === 403, `получили ${stranger.status}`);

  const spoofed = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "185.71.76.99" },
    body,
  });
  check(
    "адрес из чужой части подсети отклонён (185.71.76.0/27)",
    spoofed.status === 403,
    `получили ${spoofed.status}`,
  );

  const legit = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "185.71.76.1" },
    body: JSON.stringify({ event: "payment.succeeded", object: {} }),
  });
  check("адрес ЮKassa проходит проверку", legit.status === 200, `получили ${legit.status}`);

  console.log("\nВыход:");
  const loggedOut = await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: { cookie } });
  check("выход срабатывает", loggedOut.status === 200);

  const afterLogout = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Тест" }),
  });
  check("старая сессия больше не работает", afterLogout.status === 401);
} catch (error) {
  failures.push(`Тест упал: ${error.message}`);
} finally {
  stop();
}

console.log(`\n${"─".repeat(50)}`);
if (failures.length === 0) {
  console.log(`Всё хорошо: ${passed} проверок пройдено.`);
  process.exit(0);
} else {
  console.log(`Пройдено ${passed}, сломано ${failures.length}:`);
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
