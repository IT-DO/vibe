import "server-only";
import { headers } from "next/headers";

// Публичный адрес сайта — для ссылок в письмах и return_url платёжного
// провайдера. Если задан APP_URL, используем его (надёжнее для боевого
// домена — Host-заголовок запроса в принципе можно подделать в цепочке до
// неправильно настроенного прокси). Без APP_URL подстраиваемся под
// заголовки запроса, чтобы всё работало сразу и на localhost, и по LAN IP
// без дополнительной настройки.
export async function getAppOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
