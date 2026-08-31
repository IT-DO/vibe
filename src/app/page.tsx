import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { PLANS } from "@/lib/plans";

export default function LandingPage() {
  return (
    <>
      <Header />

      <main>
        {/* Первый экран. Задача: за 5 секунд объяснить, что это и кому. */}
        <section className="mx-auto max-w-5xl px-5 pt-16 pb-14 sm:pt-24">
          <p className="mb-4 inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">
            Для продавцов Wildberries и Ozon
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            Текст карточки товара за 30 секунд вместо вечера мучений
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted">
            Вставляешь название и характеристики — получаешь готовый заголовок, пять буллетов,
            SEO-описание и список ключевых слов. Копируешь в личный кабинет маркетплейса
            и идёшь заниматься закупкой.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/register"
              className="rounded-xl bg-brand px-6 py-3.5 text-base font-medium text-white hover:bg-brand-dark"
            >
              Сделать 3 карточки бесплатно
            </Link>
            <span className="text-sm text-muted">Без карты. Регистрация — почта и пароль.</span>
          </div>
        </section>

        {/* Боль. Люди узнают себя - и читают дальше. */}
        <section className="border-y border-line bg-paper py-16">
          <div className="mx-auto max-w-5xl px-5">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Знакомо?
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                {
                  t: "Сорок карточек в поставке",
                  d: "И для каждой нужен свой текст. К пятнадцатой фантазия заканчивается, дальше идёт копипаста.",
                },
                {
                  t: "Копирайтер берёт 500 ₽ за карточку",
                  d: "И присылает через два дня. На сорока карточках это 20 тысяч и неделя ожидания.",
                },
                {
                  t: "Товар не ищется в поиске",
                  d: "Потому что в ключевых словах то, как товар называешь ты, а не то, как его ищет покупатель.",
                },
              ].map((item) => (
                <div key={item.t}>
                  <h3 className="font-semibold">{item.t}</h3>
                  <p className="mt-2 text-muted">{item.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Что именно получит человек. Конкретика важнее обещаний. */}
        <section className="py-16">
          <div className="mx-auto max-w-5xl px-5">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Что придёт в ответ
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                ["Заголовок", "До 100 символов, главный ключ в начале — как любят алгоритмы маркетплейса."],
                ["Пять буллетов", "Выгоды покупателя, а не характеристики. «Не скользит», а не «подошва ТПР»."],
                ["Описание", "1200–2000 знаков живым языком. Без «данный товар представляет собой»."],
                ["Ключевые слова", "20–30 штук, включая синонимы и то, как товар ищут на самом деле."],
                ["Поисковые запросы", "Десять реальных запросов — проверить спрос и докрутить заголовок."],
                ["Копирование в один клик", "Каждый блок копируется отдельно. Вставил в кабинет — готово."],
              ].map(([title, text]) => (
                <div key={title} className="rounded-xl border border-line bg-paper p-5">
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1.5 text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Цены прямо на главной: человек не должен их искать. */}
        <section className="border-t border-line bg-paper py-16">
          <div className="mx-auto max-w-5xl px-5">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Сколько стоит</h2>
            <p className="mt-3 text-muted">
              Платишь за генерации, а не за месяц. Не пользуешься — не тратишь.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`rounded-2xl border p-6 ${
                    plan.highlight ? "border-brand bg-brand-soft" : "border-line"
                  }`}
                >
                  <h3 className="font-semibold">{plan.title}</h3>
                  <p className="mt-3 text-3xl font-bold">
                    {Number(plan.priceRub).toLocaleString("ru-RU")} ₽
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {plan.credits} карточек · {plan.perCard}
                  </p>
                  {plan.note && <p className="mt-3 text-sm text-muted">{plan.note}</p>}
                </div>
              ))}
            </div>

            <div className="mt-8">
              <Link
                href="/register"
                className="rounded-xl bg-brand px-6 py-3.5 font-medium text-white hover:bg-brand-dark"
              >
                Начать с трёх бесплатных
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
