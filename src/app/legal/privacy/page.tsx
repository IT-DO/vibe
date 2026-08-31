import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * ШАБЛОН. Заполни поля в квадратных скобках. См. docs/06-legal.md
 */
export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Это шаблон.</strong> Заполни поля в квадратных скобках и сверься с
          docs/06-legal.md — там про 152-ФЗ и уведомление Роскомнадзора.
        </div>

        <h1 className="text-3xl font-bold tracking-tight">Обработка персональных данных</h1>
        <p className="mt-2 text-sm text-muted">Редакция от [дата]</p>

        <div className="mt-8 space-y-6 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">Кто обрабатывает данные</h2>
            <p className="mt-2 text-muted">
              [ИП / самозанятый ФИО], ИНН [ИНН], контакт: [почта].
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Какие данные мы собираем</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>Адрес электронной почты — для входа в аккаунт и связи по оплате.</li>
              <li>Пароль — в виде необратимого хэша, в исходном виде не хранится.</li>
              <li>Тексты, которые вы отправляете в сервис, и результаты генерации.</li>
              <li>Сведения о платежах: сумма, дата, статус, идентификатор в ЮKassa.</li>
            </ul>
            <p className="mt-2 text-muted">
              Данные банковской карты мы не получаем и не храним — их обрабатывает ЮKassa.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Зачем</h2>
            <p className="mt-2 text-muted">
              Чтобы предоставлять услугу, начислять оплаченные генерации, отвечать на
              обращения и выполнять требования законодательства.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Кому передаём</h2>
            <p className="mt-2 text-muted">
              Платёжному сервису ЮKassa — для проведения оплаты. Поставщику языковой
              модели [название поставщика] — текст запроса на генерацию. Не передавайте в
              сервис персональные данные третьих лиц и коммерческую тайну.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Сколько храним и как удалить</h2>
            <p className="mt-2 text-muted">
              Пока у вас есть аккаунт. Чтобы удалить аккаунт и все связанные данные,
              напишите на [почта] — удалим в течение [срок] рабочих дней.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
