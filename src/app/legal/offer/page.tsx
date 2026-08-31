import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * ШАБЛОН, а не готовый юридический документ.
 * Заполни значения в квадратных скобках и покажи документ юристу
 * до того, как примешь первый платёж. Подробнее - в docs/06-legal.md
 */
export default function OfferPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Это шаблон.</strong> Заполни поля в квадратных скобках и покажи документ
          юристу до приёма первого платежа. Смотри docs/06-legal.md.
        </div>

        <h1 className="text-3xl font-bold tracking-tight">Публичная оферта</h1>
        <p className="mt-2 text-sm text-muted">Редакция от [дата]</p>

        <div className="mt-8 space-y-6 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. Общие положения</h2>
            <p className="mt-2 text-muted">
              [ИП / самозанятый ФИО], ИНН [ИНН] (далее — Исполнитель), публикует настоящую
              оферту — предложение заключить договор возмездного оказания услуг на условиях
              ниже. Оплата означает полное согласие с этими условиями.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Предмет договора</h2>
            <p className="mt-2 text-muted">
              Исполнитель предоставляет доступ к сервису автоматической подготовки текстов
              для карточек товаров на маркетплейсах. Единица услуги — одна генерация.
              Объём приобретённых генераций отображается в личном кабинете.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Стоимость и оплата</h2>
            <p className="mt-2 text-muted">
              Стоимость указана на странице «Тарифы». Оплата — банковской картой через
              платёжный сервис ЮKassa. Генерации зачисляются автоматически после
              подтверждения платежа. Срок действия приобретённых генераций не ограничен.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Возврат средств</h2>
            <p className="mt-2 text-muted">
              Если ни одна приобретённая генерация не использована, средства возвращаются
              полностью в течение [срок] рабочих дней с момента обращения на [почта].
              Если часть генераций использована, возвращается стоимость неиспользованного
              остатка.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Ответственность</h2>
            <p className="mt-2 text-muted">
              Тексты создаются автоматически и носят рекомендательный характер. Заказчик
              самостоятельно проверяет их перед публикацией — в том числе на соответствие
              характеристикам товара, правилам маркетплейса и требованиям законодательства
              о рекламе. Исполнитель не отвечает за решения маркетплейса в отношении
              карточек Заказчика.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Реквизиты</h2>
            <p className="mt-2 text-muted">
              [ИП / самозанятый ФИО]
              <br />
              ИНН [ИНН]
              <br />
              [адрес]
              <br />
              [почта]
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
