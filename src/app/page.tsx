import Link from "next/link";
import { getOpenOrders, getPlatformStats } from "@/lib/orders";
import { formatMoney, formatRelative } from "@/lib/format";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { MaterialTag } from "@/components/MaterialTag";

export default async function Home() {
  const [orders, stats] = await Promise.all([
    getOpenOrders().then((list) => list.slice(0, 6)),
    getPlatformStats(),
  ]);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-orange-50 via-orange-50/40 to-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[-10%] h-72 w-72 rounded-full bg-orange-200/40 blur-3xl sm:h-96 sm:w-96"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 left-[-10%] h-72 w-72 rounded-full bg-amber-100/60 blur-3xl sm:h-96 sm:w-96"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white/80 px-3 py-1 text-xs font-medium text-orange-700 shadow-sm">
            <span className="text-orange-500">●</span> Аукцион ставок на 3D-печать и 3D-моделирование
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Биржа 3D-печати: заказчики, исполнители и дизайнеры
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Опишите, что нужно напечатать или спроектировать — исполнители и
            3D-дизайнеры предложат свою цену и сроки. Приложите файлы прямо к
            заказу. Выбирайте по цене, срокам и рейтингу — отзывы после
            каждого заказа помогают находить надёжных партнёров.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/auctions/new"
              className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-600/20 transition hover:-translate-y-0.5 hover:bg-orange-700 hover:shadow-md"
            >
              Разместить заказ
            </Link>
            <Link
              href="/auctions"
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50"
            >
              Смотреть аукционы
            </Link>
            <Link
              href="/executors"
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50"
            >
              Найти специалиста
            </Link>
          </div>

          <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            <StatItem value={`${stats.specialists}+`} label="Исполнителей и дизайнеров" />
            <StatItem value={`${stats.completedOrders}+`} label="Завершённых заказов" />
            <StatItem value={`${stats.totalReviews}+`} label="Отзывов" />
            <StatItem value={stats.avgRating.toFixed(1)} label="Средний рейтинг" />
          </dl>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Что такое PrintAukcion</h2>
            <p className="mt-3 text-slate-600">
              Площадка сводит вместе тех, кому нужна 3D-печать или 3D-модель, с теми, кто
              может это сделать. Вместо того чтобы искать исполнителя по знакомым или
              соцсетям, вы публикуете заказ — и получаете несколько предложений с ценой и
              сроками, из которых выбираете сами. Аукцион ставок работает в вашу пользу:
              специалисты конкурируют за заказ, а не диктуют единственную цену.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <RoleCard
              icon="📦"
              title="Заказчикам"
              tagline="Нужно напечатать или спроектировать деталь"
              items={[
                "Опишите задачу, укажите материал, бюджет и срок — размещение заказа бесплатно",
                "Приложите файлы (STL, STEP, чертежи, референсы) прямо к заказу",
                "Сравнивайте предложения по цене, срокам и рейтингу, а не вслепую",
                "Следите за статусом заказа от приёма ставок до готового изделия",
                "После выполнения оставьте отзыв — он поможет другим заказчикам",
              ]}
            />
            <RoleCard
              icon="🖨️"
              title="Исполнителям"
              tagline="Печатаете на 3D-принтере и ищете заказы"
              items={[
                "Просматривайте открытые заказы и делайте ставки — цена, срок, сообщение",
                "Показывайте специализацию, материалы, оборудование в профиле",
                "Зарабатывайте репутацию: рейтинг и отзывы видны всем в каталоге специалистов",
                "Прикладывайте фото/файлы результата прямо к заказу",
                "Комиссия площадки — только 1% с выполненного заказа, не с каждой ставки",
              ]}
            />
            <RoleCard
              icon="🧩"
              title="3D-дизайнерам"
              tagline="Моделируете под печать или с нуля по эскизам"
              items={[
                "Заказчики без готового файла размещают заказы именно на разработку модели",
                "Указывайте специализацию (инженерный CAD, стилизация, скульптинг) и форматы файлов",
                "Ставки работают так же, как у исполнителей — цена и срок на разработку",
                "Готовую модель прикладываете к заказу как файл результата",
                "Тот же рейтинг и отзывы, что и у исполнителей печати — доверие строится одинаково",
              ]}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-6 sm:grid-cols-3">
          <HowItWorksStep
            step="1"
            title="Разместите заказ"
            text="Опишите модель, материал, количество и бюджет — это бесплатно и займёт пару минут."
          />
          <HowItWorksStep
            step="2"
            title="Получите ставки"
            text="Исполнители и дизайнеры предлагают цену и срок. Сравнивайте по рейтингу и отзывам."
          />
          <HowItWorksStep
            step="3"
            title="Оставьте отзыв"
            text="После выполнения заказа обе стороны оставляют отзывы друг другу."
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Открытые аукционы</h2>
          <Link href="/auctions" className="text-sm font-medium text-orange-600 hover:underline">
            Все аукционы →
          </Link>
        </div>

        {orders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
            Пока нет открытых аукционов. Будьте первым — разместите заказ.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/auctions/${order.id}`}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 group-hover:text-orange-700">
                    {order.title}
                  </h3>
                  <OrderStatusBadge status="OPEN" />
                </div>
                <p className="mb-3 line-clamp-2 text-sm text-slate-500">
                  {order.description}
                </p>
                <div className="mt-auto flex items-center justify-between text-sm text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    <MaterialTag material={order.material} />
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(order.budgetMin)}–{formatMoney(order.budgetMax)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{order.bids.length} ставок</span>
                  <span>Ставки {formatRelative(order.biddingEnds)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-orange-100 bg-white/70 px-3 py-4 shadow-sm backdrop-blur-sm">
      <dt className="text-2xl font-bold text-slate-900 sm:text-3xl">{value}</dt>
      <dd className="mt-1 text-xs font-medium text-slate-500 sm:text-sm">{label}</dd>
    </div>
  );
}

function RoleCard({
  icon,
  title,
  tagline,
  items,
}: {
  icon: string;
  title: string;
  tagline: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-white hover:shadow-md">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-orange-100 text-xl">
        {icon}
      </div>
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-orange-600">{tagline}</p>
      <ul className="mt-4 space-y-2 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-0.5 text-orange-500">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HowItWorksStep({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 font-bold text-orange-700">
        {step}
      </div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}
