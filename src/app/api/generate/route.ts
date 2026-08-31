import { currentUser } from "@/lib/session";
import { chargeAndRecord, getCredits } from "@/lib/credits";
import { generateCard, LlmError, type CardInput } from "@/lib/llm";
import { rateLimit } from "@/lib/ratelimit";

const COST = 1; // одна карточка - один кредит

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "Нужно войти" }, { status: 401 });
  }
  if (!rateLimit(`generate:${user.id}`, 20, 60 * 1000)) {
    return Response.json({ error: "Слишком быстро. Подожди минуту." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<CardInput>;
  const name = (body.name ?? "").trim();
  if (name.length < 2) {
    return Response.json({ error: "Укажи название товара" }, { status: 400 });
  }
  if (getCredits(user.id) < COST) {
    return Response.json({ error: "Закончились генерации", needCredits: true }, { status: 402 });
  }

  const input: CardInput = {
    marketplace: body.marketplace === "ozon" ? "ozon" : "wildberries",
    name: name.slice(0, 300),
    category: (body.category ?? "").trim().slice(0, 200),
    features: (body.features ?? "").trim().slice(0, 3000),
    audience: (body.audience ?? "").trim().slice(0, 300),
  };

  // Сначала генерируем, потом списываем.
  // Если сделать наоборот, при сбое модели пользователь платит за воздух -
  // и это первое, из-за чего люди требуют возврат.
  let card;
  try {
    card = await generateCard(input);
  } catch (error) {
    if (error instanceof LlmError) {
      return Response.json({ error: error.message }, { status: error.retryable ? 503 : 400 });
    }
    console.error("generate failed:", error);
    return Response.json({ error: "Что-то пошло не так. Попробуй ещё раз." }, { status: 500 });
  }

  const charged = chargeAndRecord(user.id, COST, JSON.stringify(input), JSON.stringify(card));
  if (!charged) {
    // Баланс кончился между проверкой и списанием (два запроса одновременно).
    return Response.json({ error: "Закончились генерации", needCredits: true }, { status: 402 });
  }

  return Response.json({ card, credits: getCredits(user.id) });
}
