import "server-only";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/config";

// redirect() на адрес без языкового префикса надёжно чинится middleware только
// при обычной навигации: редирект из серверного экшена роутер отрабатывает на
// клиенте, и префикс при этом теряется. Поэтому везде, где мы редиректим сами,
// сразу собираем адрес с языком.
export async function localeRedirect(path: string): Promise<never> {
  const locale = await getLocale();
  redirect(localePath(path, locale));
}
