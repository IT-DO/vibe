import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");

// Крошечные, но настоящие файлы-заглушки — чтобы вложения реально скачивались,
// а не были просто записью в базе без файла на диске.
const PNG_PLACEHOLDER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const STL_PLACEHOLDER = Buffer.from(
  "solid demo\nfacet normal 0 0 1\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 1 0\n endloop\nendfacet\nendsolid demo\n"
);
const STEP_PLACEHOLDER = Buffer.from(
  "ISO-10303-21;\nHEADER;\n/* Демонстрационный тестовый STEP-файл */\nENDSEC;\nEND-ISO-10303-21;\n"
);

// Детерминированный псевдослучайный генератор — чтобы при пересоздании базы
// с нуля состав "случайных" тестовых данных был стабильным, а не каждый раз
// новым (проще сверять/отлаживать).
function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
function weighted<T>(options: [T, number][]): T {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [value, w] of options) {
    if (r < w) return value;
    r -= w;
  }
  return options[options.length - 1][0];
}

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

async function seedAttachment(params: {
  orderId: string;
  uploaderId: string;
  fileName: string;
  ext: string;
  mimeType: string;
  content: Buffer;
}) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const storedName = `${randomUUID()}.${params.ext}`;
  await writeFile(path.join(UPLOAD_DIR, storedName), params.content);
  await prisma.attachment.create({
    data: {
      orderId: params.orderId,
      uploaderId: params.uploaderId,
      fileName: params.fileName,
      storedName,
      mimeType: params.mimeType,
      size: params.content.byteLength,
    },
  });
}

type NewUserData = {
  email: string;
  name: string;
  role: string;
  city?: string;
  bio?: string;
  specialization?: string;
  materials?: string;
  printer?: string;
  pricePerGram?: number;
  passwordHash: string;
};

async function upsertUser(data: NewUserData) {
  return prisma.user.upsert({ where: { email: data.email }, update: data, create: data });
}

// --- Данные для генерации реалистичных, но вымышленных профилей ---

const MALE_NAMES = [
  { first: "Иван", last: "Кузнецов", slug: "kuznetsov" },
  { first: "Пётр", last: "Соколов", slug: "sokolov" },
  { first: "Артём", last: "Попов", slug: "popov" },
  { first: "Григорий", last: "Лебедев", slug: "lebedev" },
  { first: "Тимур", last: "Козлов", slug: "kozlov" },
  { first: "Богдан", last: "Новиков", slug: "novikov" },
  { first: "Захар", last: "Морозов", slug: "morozov" },
  { first: "Марк", last: "Соловьёв", slug: "solovyov" },
  { first: "Ярослав", last: "Васильев", slug: "vasilyev" },
  { first: "Руслан", last: "Зайцев", slug: "zaytsev" },
  { first: "Станислав", last: "Павлов", slug: "pavlov" },
  { first: "Вячеслав", last: "Семёнов", slug: "semyonov" },
  { first: "Кирилл", last: "Голубев", slug: "golubev" },
  { first: "Денис", last: "Виноградов", slug: "vinogradov" },
  { first: "Никита", last: "Богданов", slug: "bogdanov" },
  { first: "Роман", last: "Воробьёв", slug: "vorobyov" },
  { first: "Егор", last: "Фёдоров", slug: "fedorov" },
  { first: "Матвей", last: "Медведев", slug: "medvedev" },
  { first: "Владислав", last: "Ершов", slug: "ershov" },
  { first: "Герман", last: "Горбунов", slug: "gorbunov" },
] as const;

const FEMALE_NAMES = [
  { first: "Елена", last: "Кузнецова", slug: "kuznetsova" },
  { first: "Ольга", last: "Соколова", slug: "sokolova" },
  { first: "Наталья", last: "Попова", slug: "popova" },
  { first: "Светлана", last: "Лебедева", slug: "lebedeva" },
  { first: "Юлия", last: "Козлова", slug: "kozlova" },
  { first: "Екатерина", last: "Новикова", slug: "novikova" },
  { first: "Виктория", last: "Морозова", slug: "morozova" },
  { first: "Дарья", last: "Соловьёва", slug: "solovyova" },
  { first: "Полина", last: "Васильева", slug: "vasilyeva" },
  { first: "Ксения", last: "Зайцева", slug: "zaytseva" },
  { first: "Алина", last: "Павлова", slug: "pavlova" },
  { first: "Валерия", last: "Семёнова", slug: "semyonova" },
  { first: "Кристина", last: "Голубева", slug: "golubeva" },
  { first: "Софья", last: "Виноградова", slug: "vinogradova" },
  { first: "Александра", last: "Богданова", slug: "bogdanova" },
  { first: "Инна", last: "Воробьёва", slug: "vorobyova" },
  { first: "Маргарита", last: "Фёдорова", slug: "fedorova" },
  { first: "Регина", last: "Медведева", slug: "medvedeva" },
  { first: "Диана", last: "Ершова", slug: "ershova" },
  { first: "Милана", last: "Горбунова", slug: "gorbunova" },
] as const;

const CITIES = [
  "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", "Казань",
  "Нижний Новгород", "Челябинск", "Самара", "Омск", "Ростов-на-Дону",
  "Уфа", "Красноярск", "Воронеж", "Пермь", "Волгоград",
  "Краснодар", "Тюмень", "Ижевск", "Барнаул", "Иркутск",
  "Владивосток", "Ярославль", "Томск", "Калининград",
];

const CUSTOMER_BIOS = [
  "Делаю настольные игры, часто нужны миниатюры и фигурки.",
  "Инженер-стартапер, нужны функциональные прототипы.",
  "Делаю авторский мерч, часто нужны 3D-модели по эскизам.",
  "Занимаюсь ремонтом техники, иногда нужны редкие пластиковые детали.",
  "Организую мероприятия, нужны сувениры и таблички.",
  "Архитектор, печатаю макеты и элементы для визуализации.",
  "Учитель технологии, нужны наглядные пособия для уроков.",
  "Веду блог о моделизме, печатаю детали для диорам.",
  "Владею небольшим магазином подарков, ищу постоянного исполнителя.",
  "Занимаюсь косплеем, нужны детали костюмов и реквизит.",
  "Разрабатываю электронику, нужны корпуса под платы.",
  "Коллекционирую миниатюры, иногда нужна реставрация утерянных деталей.",
  "Мастерская по ремонту мебели, нужна фурнитура и заглушки на заказ.",
  "Развиваю бренд одежды, нужны манекены и формы для примерки.",
  "Занимаюсь моделизмом железных дорог.",
  "Провожу мастер-классы для детей, нужны обучающие модели.",
  "Веду небольшую керамическую мастерскую, печатаю формы.",
  "Занимаюсь автотюнингом, нужны нестандартные детали салона.",
];

const EXECUTOR_PROFILES = [
  { specialization: "Функциональные прототипы, корпуса электроники", materials: "PLA, PETG, ABS", printer: "Prusa MK4, Bambu Lab P1S" },
  { specialization: "Миниатюры и настольные игры", materials: "Resin (SLA), PLA", printer: "Elegoo Saturn 3, Anycubic Photon" },
  { specialization: "Крупноформатная печать, серийные заказы", materials: "PLA, PETG, ASA, Nylon", printer: "Creality K1 Max" },
  { specialization: "Ювелирная смола, мелкая детализация", materials: "Resin (SLA), TPU", printer: "Phrozen Sonic Mighty 8K" },
  { specialization: "Технические детали, инженерный пластик", materials: "Nylon, Carbon Fiber, ABS", printer: "Bambu Lab X1C" },
  { specialization: "Сувениры и мерч, малые тиражи", materials: "PLA, PETG", printer: "Creality Ender 3 S1, Bambu A1" },
  { specialization: "Реквизит и косплей", materials: "PLA, ABS, TPU", printer: "Anycubic Kobra 2" },
  { specialization: "Постобработка и покраска на заказ", materials: "PLA, Resin (SLA)", printer: "Elegoo Neptune 4, Mars 4" },
  { specialization: "Функциональные детали для авто/быта", materials: "ASA, Nylon, PETG", printer: "Bambu Lab P1S" },
  { specialization: "Архитектурные макеты", materials: "PLA, Resin (SLA)", printer: "Prusa MK4, Photon Mono" },
];

const ORDER_TEMPLATES = [
  { title: "Печать кронштейнов для крепления камеры", material: "PETG" },
  { title: "Миниатюрные фигурки для настольной игры", material: "Resin (SLA)" },
  { title: "Корпус для датчика умного дома", material: "PLA" },
  { title: "Ручки для кухонных шкафов", material: "ABS" },
  { title: "Прототип крепления для велосипедной фары", material: "PETG" },
  { title: "Сувенирные брелоки с логотипом", material: "PLA" },
  { title: "Защитный чехол для экшн-камеры", material: "TPU" },
  { title: "Макет здания для выставки", material: "PLA" },
  { title: "Запчасть для стиральной машины (шестерня)", material: "Nylon" },
  { title: "Подставки под растения", material: "PETG" },
  { title: "Реквизит для косплея — элемент брони", material: "ABS" },
  { title: "Органайзер для проводов на стол", material: "PLA" },
  { title: "Форма для шоколада", material: "PETG" },
  { title: "Настенный держатель для наушников", material: "PLA" },
  { title: "Деталь для дрона — рама под мотор", material: "Carbon Fiber" },
  { title: "Ювелирная подвеска, пробный тираж", material: "Resin (SLA)" },
  { title: "Настольная лампа — плафон", material: "PETG" },
  { title: "Миниатюры для настольной ролевой игры", material: "Resin (SLA)" },
  { title: "Крепление для монитора на струбцине", material: "ABS" },
  { title: "Ключница настенная с гравировкой", material: "PLA" },
  { title: "Корпус для педали гитарной примочки", material: "PETG" },
  { title: "Прототип тактильной кнопки", material: "TPU" },
  { title: "Демонстрационный макет упаковки", material: "PLA" },
  { title: "Сменные насадки для пылесоса", material: "Nylon" },
];

const CUSTOMER_REVIEW_5 = [
  "Отличная работа, всё точно в срок и очень аккуратно!",
  "Супер, сделали даже лучше, чем я ожидал(а). Буду обращаться ещё.",
  "Всё чётко по описанию, качество печати на высоте.",
  "Быстро ответили, быстро сделали, никаких нареканий.",
  "Приятно удивлена вниманием к деталям, спасибо!",
  "Идеально подошло, размеры совпали до миллиметра.",
  "Рекомендую — общительный и ответственный исполнитель.",
  "Уложились в срок, хотя заказ был не самый простой.",
  "Классная постобработка, швов почти не видно.",
  "Уже не первый заказ у этого исполнителя — качество стабильно высокое.",
  "Сделали даже больше, чем просили — досыпали пару запасных деталей.",
  "Отвечает быстро, печатает ещё быстрее. Спасибо!",
  "Заказ выполнен точно по ТЗ, никаких сюрпризов.",
  "Очень доволен(на) результатом, буду рекомендовать знакомым.",
  "Сделали быстрее заявленного срока, приятно удивлена.",
  "Профессиональный подход от первого сообщения до сдачи заказа.",
  "Модель пришла ровно такой, как обсуждали, без переделок.",
  "Сразу видно опыт — вопросов по итогу не возникло.",
  "Внимательно отнеслись к моим пожеланиям по цвету и толщине стенок.",
  "Пятая звезда заслуженно — качество на уровне мастерской.",
];
const CUSTOMER_REVIEW_4 = [
  "Хорошее качество, но задержались на пару дней от обещанного срока.",
  "В целом доволен(на), по цвету была небольшая нестыковка с ожиданиями.",
  "Сделали аккуратно, но на связь выходили не сразу.",
  "Результат хороший, упаковка могла быть и понадёжнее.",
  "Всё устроило, но пришлось напомнить о сроках.",
  "Неплохо, но одна деталь была с небольшим дефектом печати.",
  "Работой доволен, но хотелось бы более частых апдейтов по статусу.",
  "Печать хорошая, упаковали чуть небрежно, но всё доехало целым.",
  "В целом хорошо, единственное — не сразу подтвердили получение оплаты.",
  "Результат устроил, просто было пару дней тишины в переписке.",
];
const CUSTOMER_REVIEW_3 = [
  "Нормально, но пришлось согласовывать доработки уже после печати.",
  "Средне — качество нормальное, но коммуникация могла быть лучше.",
  "Заказ выполнили, но пришлось несколько раз напоминать о сроках.",
  "Печать нормальная, но не хватило первоначальной консультации по материалу.",
  "Результат приемлемый, ожидал(а) чуть более аккуратную постобработку.",
  "Средне: цена адекватная, но общение было формальным и редким.",
];

const EXECUTOR_REVIEW_5 = [
  "Заказчик чётко всё описал, оплата сразу. Рекомендую.",
  "Приятно работать — файлы готовы, требования понятны с первого раза.",
  "Оперативно отвечал(а) на вопросы, никаких проблем.",
  "Отличная коммуникация, буду рад(а) новым заказам.",
  "Задача была понятная, заказчик оставил свободу в деталях — супер.",
  "Быстро согласовал(а) детали, никаких лишних правок.",
  "Заказчик оплатил сразу после подтверждения ставки, никаких задержек.",
  "Чёткий бриф, все файлы и размеры сразу в заказе — работать одно удовольствие.",
  "Адекватно отнёсся к срокам, не торопил без причины.",
  "Заказчик подробно ответил на все уточняющие вопросы до начала печати.",
  "Вежливое общение, готов(а) взять в работу ещё заказы от этого клиента.",
  "Заказчик заранее предупредил о своих пожеланиях по цвету — сильно упростило работу.",
  "Всё прошло гладко, оплата и переписка без проблем.",
  "Заказчик сразу согласовал цену без долгих торгов.",
];
const EXECUTOR_REVIEW_4 = [
  "Хороший заказчик, но требования пришли не сразу целиком.",
  "Всё в порядке, было пару уточнений уже в процессе.",
  "Нормальный заказчик, но не сразу вышел на связь после сдачи работы.",
  "В целом всё хорошо, разве что задержалась оплата на пару дней.",
  "Адекватный заказ, но было несколько правок уже после согласования цены.",
  "Рабочий процесс приятный, коммуникация местами медленная.",
];

function pickCustomerReview(): { rating: number; comment: string } {
  const rating = weighted<number>([[5, 65], [4, 25], [3, 10]]);
  const comment = rating === 5 ? pick(CUSTOMER_REVIEW_5) : rating === 4 ? pick(CUSTOMER_REVIEW_4) : pick(CUSTOMER_REVIEW_3);
  return { rating, comment };
}
function pickExecutorReview(): { rating: number; comment: string } {
  const rating = weighted<number>([[5, 80], [4, 20]]);
  const comment = rating === 5 ? pick(EXECUTOR_REVIEW_5) : pick(EXECUTOR_REVIEW_4);
  return { rating, comment };
}

type SeedUser = Awaited<ReturnType<typeof upsertUser>>;

// Создаёт один завершённый заказ с парой отзывов (заказчик↔исполнитель) и
// комиссионным платежом. Используется как для первичного наполнения, так и
// для "дозаполнения" отзывов при повторном запуске сида на уже заполненной БД.
async function createCompletedOrderWithReview(
  executor: SeedUser,
  customers: SeedUser[],
  now: number,
  day: number
) {
  const template = pick(ORDER_TEMPLATES);
  const customer = pick(customers);
  const price = randInt(400, 6000);
  const daysAgo = randInt(1, 90);

  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      title: template.title,
      description: `${template.title}. Материал — ${template.material}. Подробности обсуждались с исполнителем в сообщениях к ставке.`,
      material: template.material,
      quantity: randInt(1, 15),
      budgetMin: Math.round(price * 0.8),
      budgetMax: Math.round(price * 1.3),
      biddingEnds: new Date(now - daysAgo * day),
      status: "COMPLETED",
    },
  });
  const winner = await prisma.bid.create({
    data: {
      orderId: order.id, executorId: executor.id, price, leadTimeDays: randInt(1, 10),
      message: "Готов(а) выполнить в срок, есть опыт с похожими заказами.", status: "ACCEPTED",
    },
  });
  await prisma.order.update({ where: { id: order.id }, data: { winningBidId: winner.id } });

  const customerReview = pickCustomerReview();
  await prisma.review.create({ data: { orderId: order.id, authorId: customer.id, targetId: executor.id, rating: customerReview.rating, comment: customerReview.comment } });
  const executorReview = pickExecutorReview();
  await prisma.review.create({ data: { orderId: order.id, authorId: executor.id, targetId: customer.id, rating: executorReview.rating, comment: executorReview.comment } });

  const commissionPaid = rng() < 0.7;
  const commission = await prisma.payment.create({
    data: { type: "COMMISSION", amount: Math.max(1, Math.round(price * 0.01)), payerId: executor.id, orderId: order.id, status: commissionPaid ? "PAID" : "PENDING" },
  });
  if (commissionPaid) {
    await prisma.payment.update({ where: { id: commission.id }, data: { provider: "manual", paidAt: new Date() } });
  }
}

// Дозаполняет открытые заказы (со ставками) до целевого количества — вызывается
// на каждом запуске сида, поэтому безопасно повторять без риска бесконечного роста.
async function topUpOpenOrders(customers: SeedUser[], bidders: SeedUser[], now: number, day: number, target: number) {
  const current = await prisma.order.count({ where: { status: "OPEN" } });
  for (let i = current; i < target; i++) {
    const template = pick(ORDER_TEMPLATES);
    const customer = pick(customers);
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        title: template.title,
        description: `${template.title}. Материал — ${template.material}.`,
        material: template.material,
        quantity: randInt(1, 15),
        budgetMin: randInt(500, 2000),
        budgetMax: randInt(2500, 6000),
        biddingEnds: new Date(now + randInt(1, 7) * day),
        deadline: new Date(now + randInt(8, 20) * day),
        status: "OPEN",
      },
    });
    const bidderCount = randInt(1, 3);
    const usedBidders = new Set<string>();
    for (let b = 0; b < bidderCount; b++) {
      const bidder = pick(bidders);
      if (usedBidders.has(bidder.id)) continue;
      usedBidders.add(bidder.id);
      await prisma.bid.create({
        data: {
          orderId: order.id, executorId: bidder.id, price: randInt(500, 6000), leadTimeDays: randInt(1, 10),
          message: "Готов(а) взяться, есть похожий опыт.",
        },
      });
    }
  }
}

async function topUpAwardedOrders(customers: SeedUser[], bidders: SeedUser[], now: number, day: number, target: number) {
  const current = await prisma.order.count({ where: { status: "AWARDED" } });
  for (let i = current; i < target; i++) {
    const template = pick(ORDER_TEMPLATES);
    const customer = pick(customers);
    const executor = pick(bidders);
    const price = randInt(500, 5000);
    const order = await prisma.order.create({
      data: {
        customerId: customer.id, title: template.title, description: template.title,
        material: template.material, quantity: randInt(1, 10),
        budgetMin: Math.round(price * 0.8), budgetMax: Math.round(price * 1.3),
        biddingEnds: new Date(now - day), status: "AWARDED",
      },
    });
    const bid = await prisma.bid.create({ data: { orderId: order.id, executorId: executor.id, price, leadTimeDays: randInt(1, 8), message: "Начну сразу после подтверждения.", status: "ACCEPTED" } });
    await prisma.order.update({ where: { id: order.id }, data: { winningBidId: bid.id } });
  }
}

async function topUpInProgressOrders(customers: SeedUser[], bidders: SeedUser[], now: number, day: number, target: number) {
  const current = await prisma.order.count({ where: { status: "IN_PROGRESS" } });
  for (let i = current; i < target; i++) {
    const template = pick(ORDER_TEMPLATES);
    const customer = pick(customers);
    const executor = pick(bidders);
    const price = randInt(500, 5000);
    const order = await prisma.order.create({
      data: {
        customerId: customer.id, title: template.title, description: template.title,
        material: template.material, quantity: randInt(1, 10),
        budgetMin: Math.round(price * 0.8), budgetMax: Math.round(price * 1.3),
        biddingEnds: new Date(now - 2 * day), status: "IN_PROGRESS",
      },
    });
    const bid = await prisma.bid.create({ data: { orderId: order.id, executorId: executor.id, price, leadTimeDays: randInt(1, 8), message: "В процессе печати.", status: "ACCEPTED" } });
    await prisma.order.update({ where: { id: order.id }, data: { winningBidId: bid.id } });
  }
}

async function topUpCancelledOrders(customers: SeedUser[], now: number, day: number, target: number) {
  const current = await prisma.order.count({ where: { status: "CANCELLED" } });
  for (let i = current; i < target; i++) {
    const template = pick(ORDER_TEMPLATES);
    const customer = pick(customers);
    await prisma.order.create({
      data: {
        customerId: customer.id, title: template.title, description: `${template.title} — заказ отменён заказчиком.`,
        material: template.material, quantity: randInt(1, 10),
        biddingEnds: new Date(now - randInt(1, 10) * day), status: "CANCELLED",
      },
    });
  }
}

async function main() {
  console.log("Seeding database...");

  const passwordHash = await hash("password123");

  // --- Именные демо-аккаунты (используются в README/доке для входа) ---

  // Самостоятельная регистрация с ролью ADMIN запрещена (см.
  // src/lib/actions/auth.ts) — единственный способ получить админ-доступ на
  // свежем инстансе это сид. На проде первым делом смените пароль.
  await upsertUser({
    email: "admin@example.com", passwordHash, name: "Администратор", role: "ADMIN",
  });

  const anna = await upsertUser({
    email: "anna@example.com", passwordHash, name: "Анна Смирнова", role: "CUSTOMER",
    city: "Москва", bio: "Делаю настольные игры, часто нужны миниатюры и фигурки.",
  });
  const oleg = await upsertUser({
    email: "oleg@example.com", passwordHash, name: "Олег Петров", role: "CUSTOMER",
    city: "Санкт-Петербург", bio: "Инженер-стартапер, нужны функциональные прототипы.",
  });
  const marina = await upsertUser({
    email: "marina@example.com", passwordHash, name: "Марина Волкова", role: "CUSTOMER",
    city: "Екатеринбург", bio: "Делаю авторский мерч, часто нужны 3D-модели по эскизам и рендеры.",
  });
  const dmitry = await upsertUser({
    email: "print.master@example.com", passwordHash, name: "Дмитрий Волков", role: "EXECUTOR",
    city: "Москва", bio: "5 лет опыта FDM/SLA печати. Быстро, аккуратно, с постобработкой.",
    specialization: "Функциональные прототипы, миниатюры, реквизит", materials: "PLA, PETG, ABS, Resin (SLA)",
    printer: "Bambu Lab X1C, Elegoo Saturn 3", pricePerGram: 8,
  });
  const plastform = await upsertUser({
    email: "3dstudio@example.com", passwordHash, name: "Мастерская «ПластФорм»", role: "EXECUTOR",
    city: "Казань", bio: "Небольшая мастерская, специализируемся на крупных изделиях и сериях.",
    specialization: "Крупноформатная печать, серийные заказы", materials: "PLA, PETG, ASA, Nylon",
    printer: "Creality K1 Max x4", pricePerGram: 6.5,
  });
  const nastya = await upsertUser({
    email: "nastya.print@example.com", passwordHash, name: "Анастасия Кузнецова", role: "EXECUTOR",
    city: "Новосибирск", bio: "Ювелирные и мелкие детализированные модели на смоляном принтере.",
    specialization: "Ювелирная смола, миниатюры", materials: "Resin (SLA), TPU",
    printer: "Phrozen Sonic Mighty 8K", pricePerGram: 12,
  });
  const viktoria = await upsertUser({
    email: "viktoria.design@example.com", passwordHash, name: "Виктория Орлова", role: "DESIGNER",
    city: "Санкт-Петербург", bio: "Инженер-конструктор, 7 лет в CAD. Делаю модели под печать с нуля и по эскизам/фото.",
    specialization: "Инженерный CAD, топологическая оптимизация", materials: "STL, STEP, OBJ",
    printer: "Fusion 360, SolidWorks", pricePerGram: 1500,
  });
  const maxim = await upsertUser({
    email: "maxim.3dmodel@example.com", passwordHash, name: "Максим Титов", role: "DESIGNER",
    city: "Новосибирск", bio: "3D-художник, стилизованные модели и игровые ассеты.",
    specialization: "Игровые ассеты, стилизованные модели, скульптинг", materials: "OBJ, FBX, STL",
    printer: "Blender, ZBrush", pricePerGram: 900,
  });

  // --- Массовая генерация: ×10 заказчиков и исполнителей ---

  const BULK_CUSTOMERS_COUNT = 27; // + 3 именных = 30
  const BULK_EXECUTORS_COUNT = 27; // + 3 именных = 30

  let emailCounter = 1;
  const bulkCustomers: Awaited<ReturnType<typeof upsertUser>>[] = [];
  for (let i = 0; i < BULK_CUSTOMERS_COUNT; i++) {
    const isFemale = rng() < 0.5;
    const person = isFemale ? pick(FEMALE_NAMES) : pick(MALE_NAMES);
    const email = `${person.slug}${emailCounter++}@example.com`;
    const user = await upsertUser({
      email, passwordHash, name: `${person.first} ${person.last}`, role: "CUSTOMER",
      city: pick(CITIES), bio: pick(CUSTOMER_BIOS),
    });
    bulkCustomers.push(user);
  }

  const bulkExecutors: Awaited<ReturnType<typeof upsertUser>>[] = [];
  for (let i = 0; i < BULK_EXECUTORS_COUNT; i++) {
    const isFemale = rng() < 0.5;
    const person = isFemale ? pick(FEMALE_NAMES) : pick(MALE_NAMES);
    const email = `${person.slug}${emailCounter++}@example.com`;
    const profile = pick(EXECUTOR_PROFILES);
    const user = await upsertUser({
      email, passwordHash, name: `${person.first} ${person.last}`, role: "EXECUTOR",
      city: pick(CITIES), bio: `${randInt(1, 8)} лет опыта 3D-печати. ${profile.specialization}.`,
      specialization: profile.specialization, materials: profile.materials, printer: profile.printer,
      pricePerGram: randInt(5, 15),
    });
    bulkExecutors.push(user);
  }

  console.log(`Пользователи готовы: ${3 + bulkCustomers.length} заказчиков, ${3 + bulkExecutors.length} исполнителей, 2 дизайнера.`);

  const allCustomers = [anna, oleg, marina, ...bulkCustomers];
  const allExecutors = [dmitry, plastform, nastya, ...bulkExecutors];
  const allBidders = [...allExecutors, viktoria, maxim];

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // --- Именные "витринные" заказы (разные статусы, с файлами) — создаём один
  // раз при первом запуске, определяем по названию первого витринного заказа,
  // чтобы повторный запуск сида не плодил дубли ---
  const heroOrdersExist = await prisma.order.findFirst({
    where: { customerId: anna.id, title: "10 миниатюр для настольной игры" },
    select: { id: true },
  });
  if (heroOrdersExist) {
    console.log("Витринные заказы уже существуют — пропускаю создание.");
  } else {
    console.log("Создаю витринные заказы...");

    const order1 = await prisma.order.create({
      data: {
        customerId: anna.id,
        title: "10 миниатюр для настольной игры",
        description: "Нужно напечатать 10 фигурок высотой ~30мм по STL-файлам (пришлю после выбора исполнителя). Важна детализация лица и брони. Референс приложен.",
        material: "Resin (SLA)", color: "Серый грунт", quantity: 10, budgetMin: 1500, budgetMax: 4000,
        biddingEnds: new Date(now + 2 * day), deadline: new Date(now + 10 * day), status: "OPEN",
      },
    });
    await seedAttachment({ orderId: order1.id, uploaderId: anna.id, fileName: "референс-миниатюра.png", ext: "png", mimeType: "image/png", content: PNG_PLACEHOLDER });
    await prisma.bid.create({ data: { orderId: order1.id, executorId: dmitry.id, price: 3200, leadTimeDays: 4, message: "Печатаю миниатюры регулярно, покажу примеры в портфолио. Готов начать сразу." } });
    await prisma.bid.create({ data: { orderId: order1.id, executorId: nastya.id, price: 2800, leadTimeDays: 6, message: "Специализируюсь именно на детализированных миниатюрах на смоле." } });

    const order2 = await prisma.order.create({
      data: {
        customerId: oleg.id,
        title: "Корпус для прототипа электронного устройства",
        description: "Корпус 150x80x40мм, разъёмы под USB-C и кнопку. Есть STEP-модель (приложена). Материал — прочный, для повседневного использования.",
        material: "PETG", quantity: 3, budgetMin: 2000, budgetMax: 6000,
        biddingEnds: new Date(now + 5 * day), deadline: new Date(now + 10 * day), status: "OPEN",
      },
    });
    await seedAttachment({ orderId: order2.id, uploaderId: oleg.id, fileName: "корпус-черновик.stl", ext: "stl", mimeType: "model/stl", content: STL_PLACEHOLDER });
    await prisma.bid.create({ data: { orderId: order2.id, executorId: plastform.id, price: 4500, leadTimeDays: 5, message: "Есть опыт с корпусами под электронику, можем усилить рёбра жёсткости." } });
    await prisma.bid.create({ data: { orderId: order2.id, executorId: dmitry.id, price: 5200, leadTimeDays: 4, message: "Готов сделать с герметизацией разъёмов, если нужно IP-защиту." } });

    const order3 = await prisma.order.create({
      data: {
        customerId: marina.id,
        title: "3D-модель кружки-мерча по эскизу",
        description: "Есть эскиз формы (приложен) и логотип для тиснения на боку. Нужна параметрическая модель под последующую печать тиражом. Печать пока не нужна — только модель.",
        material: "PLA", quantity: 1, budgetMin: 2000, budgetMax: 4000,
        biddingEnds: new Date(now + 3 * day), deadline: new Date(now + 14 * day), status: "OPEN",
      },
    });
    await seedAttachment({ orderId: order3.id, uploaderId: marina.id, fileName: "эскиз-кружки.png", ext: "png", mimeType: "image/png", content: PNG_PLACEHOLDER });
    await prisma.bid.create({ data: { orderId: order3.id, executorId: viktoria.id, price: 3500, leadTimeDays: 5, message: "Сделаю параметрическую модель, чтобы легко менять размер тиража под разные принтеры." } });
    await prisma.bid.create({ data: { orderId: order3.id, executorId: maxim.id, price: 2800, leadTimeDays: 7, message: "Могу добавить стилизованный рельеф логотипа, не только плоское тиснение." } });

    const order4 = await prisma.order.create({
      data: {
        customerId: oleg.id, title: "Защитный кожух для дрона",
        description: "Кожух пропеллеров, STEP-модель приложена. Важна ударопрочность.",
        material: "PETG", quantity: 4, budgetMin: 2000, budgetMax: 3500,
        biddingEnds: new Date(now - day), deadline: new Date(now + 10 * day), status: "AWARDED",
      },
    });
    await seedAttachment({ orderId: order4.id, uploaderId: oleg.id, fileName: "кожух-дрона.step", ext: "step", mimeType: "model/step", content: STEP_PLACEHOLDER });
    const order4Winner = await prisma.bid.create({ data: { orderId: order4.id, executorId: dmitry.id, price: 2600, leadTimeDays: 3, message: "Печатал похожие кожухи, знаю слабые места по ударопрочности.", status: "ACCEPTED" } });
    await prisma.bid.create({ data: { orderId: order4.id, executorId: plastform.id, price: 3100, leadTimeDays: 4, message: "Можем в ASA для лучшей стойкости к УФ.", status: "REJECTED" } });
    await prisma.order.update({ where: { id: order4.id }, data: { winningBidId: order4Winner.id } });

    const order5 = await prisma.order.create({
      data: {
        customerId: anna.id, title: "Кронштейны для полки, 6 шт",
        description: "Кронштейны под настенную полку, нагрузка до 10кг каждый.",
        material: "PLA", quantity: 6, budgetMin: 1200, budgetMax: 2500,
        biddingEnds: new Date(now - day), deadline: new Date(now + 5 * day), status: "IN_PROGRESS",
      },
    });
    const order5Winner = await prisma.bid.create({ data: { orderId: order5.id, executorId: plastform.id, price: 1800, leadTimeDays: 3, message: "Печатаем со 100% заполнением для такой нагрузки.", status: "ACCEPTED" } });
    await prisma.order.update({ where: { id: order5.id }, data: { winningBidId: order5Winner.id } });

    const order6 = await prisma.order.create({
      data: {
        customerId: anna.id, title: "Подставка для наушников", description: "Подставка в форме шлема, под настольный светильник.",
        material: "PLA", color: "Чёрный", quantity: 1, budgetMin: 500, budgetMax: 1500,
        biddingEnds: new Date(now - 3 * day), status: "COMPLETED",
      },
    });
    const order6Winner = await prisma.bid.create({ data: { orderId: order6.id, executorId: dmitry.id, price: 900, leadTimeDays: 2, message: "Сделаю аккуратно, есть похожие работы в портфолио.", status: "ACCEPTED" } });
    await prisma.order.update({ where: { id: order6.id }, data: { winningBidId: order6Winner.id } });
    await seedAttachment({ orderId: order6.id, uploaderId: dmitry.id, fileName: "готовая-подставка.png", ext: "png", mimeType: "image/png", content: PNG_PLACEHOLDER });
    await prisma.review.create({ data: { orderId: order6.id, authorId: anna.id, targetId: dmitry.id, rating: 5, comment: "Отличная работа, всё точно в срок и очень аккуратно!" } });
    await prisma.review.create({ data: { orderId: order6.id, authorId: dmitry.id, targetId: anna.id, rating: 5, comment: "Заказчик чётко всё описал, оплата сразу. Рекомендую." } });
    const order6Commission = await prisma.payment.create({ data: { type: "COMMISSION", amount: 9, payerId: dmitry.id, orderId: order6.id, status: "PAID" } });
    await prisma.payment.update({ where: { id: order6Commission.id }, data: { provider: "manual", paidAt: new Date() } });

    const order7 = await prisma.order.create({
      data: {
        customerId: marina.id, title: "3D-модель ёлочной игрушки для мерча",
        description: "Разработка модели с нуля по референсам для последующей серийной печати.",
        material: "Resin (SLA)", quantity: 1, budgetMin: 3000, budgetMax: 4500,
        biddingEnds: new Date(now - 3 * day), status: "COMPLETED",
      },
    });
    const order7Winner = await prisma.bid.create({ data: { orderId: order7.id, executorId: viktoria.id, price: 3500, leadTimeDays: 5, message: "Сделаю с запасом на усадку смолы при печати.", status: "ACCEPTED" } });
    await prisma.order.update({ where: { id: order7.id }, data: { winningBidId: order7Winner.id } });
    await prisma.review.create({ data: { orderId: order7.id, authorId: marina.id, targetId: viktoria.id, rating: 5, comment: "Модель ровно как на референсе, ещё и советами по печати помогла." } });
    await prisma.review.create({ data: { orderId: order7.id, authorId: viktoria.id, targetId: marina.id, rating: 5, comment: "Чёткое ТЗ, приятно работать." } });
    await prisma.payment.create({ data: { type: "COMMISSION", amount: 35, payerId: viktoria.id, orderId: order7.id, status: "PENDING" } });

    const order8 = await prisma.order.create({
      data: {
        customerId: oleg.id, title: "Значки для мероприятия, 20 шт", description: "Значки с логотипом компании для конференции.",
        material: "PLA", color: "Синий", quantity: 20, budgetMin: 1500, budgetMax: 2500,
        biddingEnds: new Date(now - 3 * day), status: "COMPLETED",
      },
    });
    const order8Winner = await prisma.bid.create({ data: { orderId: order8.id, executorId: nastya.id, price: 1800, leadTimeDays: 4, message: "Есть опыт с мелким тиражом сувенирки.", status: "ACCEPTED" } });
    await prisma.order.update({ where: { id: order8.id }, data: { winningBidId: order8Winner.id } });
    await prisma.review.create({ data: { orderId: order8.id, authorId: oleg.id, targetId: nastya.id, rating: 4, comment: "Качество хорошее, но задержалась на день от обещанного срока." } });
    await prisma.review.create({ data: { orderId: order8.id, authorId: nastya.id, targetId: oleg.id, rating: 5, comment: "Заказчик на связи, проблем не было." } });
    const order8Commission = await prisma.payment.create({ data: { type: "COMMISSION", amount: 18, payerId: nastya.id, orderId: order8.id, status: "PAID" } });
    await prisma.payment.update({ where: { id: order8Commission.id }, data: { provider: "manual", paidAt: new Date() } });

    await prisma.order.create({
      data: {
        customerId: oleg.id, title: "Печать сложной механической детали",
        description: "Заказ отменён — решили изготовить деталь фрезеровкой вместо печати.",
        material: "Nylon", quantity: 1, biddingEnds: new Date(now - day), status: "CANCELLED",
      },
    });

    // --- Подписки именных аккаунтов ---
    for (const user of [anna, marina, dmitry]) {
      const subscription = await prisma.subscription.create({
        data: { userId: user.id, status: "ACTIVE", currentPeriodEnd: new Date(now + 20 * day) },
      });
      await prisma.payment.create({
        data: { type: "SUBSCRIPTION", amount: 300, payerId: user.id, subscriptionId: subscription.id, status: "PAID", provider: "manual", paidAt: new Date() },
      });
    }

  }

  // --- Отзывы и завершённые заказы для исполнителей/дизайнеров: догоняем
  // каждого специалиста до целевого диапазона полученных отзывов при КАЖДОМ
  // запуске сида, а не только при первом создании базы — так можно
  // допечатать данные в уже заполненную БД, не трогая существующие заказы ---
  console.log("Дополняю отзывы и завершённые заказы для специалистов...");
  for (const executor of allBidders) {
    const receivedReviews = await prisma.review.count({ where: { targetId: executor.id } });
    const target = randInt(6, 10);
    const missing = target - receivedReviews;
    for (let i = 0; i < missing; i++) {
      await createCompletedOrderWithReview(executor, allCustomers, now, day);
    }
  }

  // --- Догоняем количество заказов в остальных статусах до целевых объёмов,
  // чтобы лента аукционов и профили выглядели живыми — тоже безопасно
  // запускать повторно, каждый раз добиваем только недостающее ---
  console.log("Дополняю открытые/текущие/отменённые заказы...");
  await topUpOpenOrders(allCustomers, allBidders, now, day, 40);
  await topUpAwardedOrders(allCustomers, allBidders, now, day, 12);
  await topUpInProgressOrders(allCustomers, allBidders, now, day, 12);
  await topUpCancelledOrders(allCustomers, now, day, 12);

  // --- Рейтинги пересчитываем из реальных отзывов, чтобы цифры на сайте
  // совпадали с тем, что реально видно в разделе «Отзывы» у профиля ---
  console.log("Пересчитываю рейтинги из отзывов...");
  const everyone = await prisma.user.findMany({ select: { id: true } });
  for (const { id } of everyone) {
    const agg = await prisma.review.aggregate({ where: { targetId: id }, _avg: { rating: true }, _count: { rating: true } });
    await prisma.user.update({ where: { id }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count.rating } });
  }

  const totalUsers = await prisma.user.count();
  const totalOrders = await prisma.order.count();
  const totalReviews = await prisma.review.count();
  console.log(`Готово: ${totalUsers} пользователей, ${totalOrders} заказов, ${totalReviews} отзывов.`);

  console.log("\nИменные демо-аккаунты (пароль везде: password123):");
  console.log("  админ:       admin@example.com  (смените пароль перед реальным продакшеном!)");
  console.log("  заказчик:    anna@example.com");
  console.log("  заказчик:    oleg@example.com");
  console.log("  заказчик:    marina@example.com");
  console.log("  исполнитель: print.master@example.com");
  console.log("  исполнитель: 3dstudio@example.com");
  console.log("  исполнитель: nastya.print@example.com");
  console.log("  дизайнер:    viktoria.design@example.com");
  console.log("  дизайнер:    maxim.3dmodel@example.com");
  console.log("(остальные сгенерированные аккаунты — тот же пароль, email вида фамилия+номер@example.com)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
