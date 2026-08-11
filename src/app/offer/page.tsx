import { LocaleLink as Link } from "@/components/LocaleLink";
import { getSettings } from "@/lib/settings";

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await getLocale(), "offer", "/offer");
}


export default async function OfferPage() {
  const settings = await getSettings();
  const commissionPercent = (settings.commissionRate * 100).toString();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Публичная оферта</h1>
      <p className="mt-2 text-sm text-slate-500">Последнее обновление: 10 августа 2026.</p>

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Это шаблон договора-оферты для небольшой площадки, а не готовый юридический
        документ. Реквизиты оператора ниже — заглушка. Перед тем как реально включать
        приём платежей, отдайте этот текст на проверку юристу и впишите настоящие
        реквизиты (ИП/самозанятость, ОГРНИП/ИНН, адрес, контакты).
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">1. Общие положения</h2>
        <p className="text-sm text-slate-600">
          Настоящий документ является публичной офертой в адрес любого дееспособного лица,
          зарегистрировавшегося на площадке PrintAu (далее — «Площадка»). Оплата
          подписки или комиссии, описанных ниже, означает полное и безоговорочное принятие
          условий оферты.
        </p>
        <p className="text-sm text-slate-600">
          Оператор площадки: <em>[указать после регистрации ИП/самозанятости — наименование,
          ОГРНИП/ИНН, адрес, контактный email]</em>.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">2. Что делает и чего не делает Площадка</h2>
        <p className="text-sm text-slate-600">
          Площадка предоставляет технический сервис для поиска друг друга заказчиками и
          исполнителями/дизайнерами 3D-печати: размещение заказов, приём ставок в формате
          аукциона, обмен файлами, отзывы и рейтинги.
        </p>
        <p className="text-sm text-slate-600">
          <strong>Площадка не является стороной сделки между заказчиком и исполнителем.</strong>{" "}
          Договорённости о цене, сроках, качестве и способе оплаты самой работы (печати или
          дизайна) заказчик и исполнитель/дизайнер согласовывают напрямую между собой, вне
          Площадки. Площадка не гарантирует качество, сроки или сам факт выполнения заказа и
          не несёт ответственности по спорам между заказчиком и исполнителем — её роль
          ограничена информационным посредничеством и приёмом собственной платы (подписка и
          комиссия, см. ниже).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">3. Подписка</h2>
        <p className="text-sm text-slate-600">
          Доступ к размещению заказов и подаче ставок предоставляется по подписке —{" "}
          {settings.subscriptionPriceRub} ₽ за {settings.subscriptionPeriodDays} дней. Подписка{" "}
          <strong>не продлевается автоматически</strong>: по истечении периода пользователь
          самостоятельно оплачивает следующий period на странице «Оплата». Незачёт/возврат
          денег за неиспользованный остаток периода не производится, кроме случаев, прямо
          предусмотренных законодательством.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">4. Комиссия площадки</h2>
        <p className="text-sm text-slate-600">
          С исполнителя/дизайнера, чья ставка была принята и заказ доведён до статуса
          «Завершён», взимается комиссия площадки в размере {commissionPercent}% от суммы
          принятой ставки. Комиссия начисляется автоматически и оплачивается отдельно от
          расчётов между заказчиком и исполнителем — она является платой за пользование
          Площадкой, а не частью оплаты самой работы.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">5. Оплата и возвраты</h2>
        <p className="text-sm text-slate-600">
          Оплата принимается через платёжного провайдера (ЮKassa) банковской картой или
          другим доступным на странице оплаты способом. Ошибочно списанные суммы (двойное
          списание, техническая ошибка) возвращаются по обращению в поддержку. Возврат
          средств за уже оказанный доступ к Площадке (использованный период подписки,
          начисленную и подтверждённую комиссию) не производится.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">6. Обязанности пользователя</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Указывать достоверные данные о себе при регистрации.</li>
          <li>
            Загружать только те файлы (модели, чертежи, изображения), на которые у вас есть
            права — Площадка не проверяет файлы на нарушение авторских прав третьих лиц,
            ответственность за содержимое загруженных файлов несёт загрузивший их пользователь.
          </li>
          <li>Своевременно оплачивать подписку и начисленную комиссию.</li>
          <li>Не использовать Площадку для действий, запрещённых законодательством.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">7. Изменение условий</h2>
        <p className="text-sm text-slate-600">
          Оператор может изменять условия оферты и тарифы, публикуя новую версию на этой
          странице. Продолжение использования Площадки после публикации изменений означает
          согласие с новой редакцией.
        </p>
      </section>

      <p className="mt-10 text-sm text-slate-500">
        См. также{" "}
        <Link href="/privacy" className="text-orange-600 hover:underline">
          политику конфиденциальности
        </Link>
        . По вопросам оплаты — обращайтесь к администратору площадки.{" "}
        <Link href="/" className="text-orange-600 hover:underline">
          На главную
        </Link>
      </p>
    </div>
  );
}
