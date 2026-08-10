import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log("Seeding database...");

  const passwordHash = await hash("password123");

  const customer1 = await prisma.user.create({
    data: {
      email: "anna@example.com",
      passwordHash,
      name: "Анна Смирнова",
      role: "CUSTOMER",
      city: "Москва",
      bio: "Делаю настольные игры, часто нужны миниатюры и фигурки.",
    },
  });

  const customer2 = await prisma.user.create({
    data: {
      email: "oleg@example.com",
      passwordHash,
      name: "Олег Петров",
      role: "CUSTOMER",
      city: "Санкт-Петербург",
      bio: "Инженер-стартапер, нужны функциональные прототипы.",
    },
  });

  const exec1 = await prisma.user.create({
    data: {
      email: "print.master@example.com",
      passwordHash,
      name: "Дмитрий Волков",
      role: "EXECUTOR",
      city: "Москва",
      bio: "5 лет опыта FDM/SLA печати. Быстро, аккуратно, с постобработкой.",
      specialization: "Функциональные прототипы, миниатюры, реквизит",
      materials: "PLA, PETG, ABS, Resin (SLA)",
      printer: "Bambu Lab X1C, Elegoo Saturn 3",
      pricePerGram: 8,
      ratingAvg: 4.8,
      ratingCount: 2,
    },
  });

  const exec2 = await prisma.user.create({
    data: {
      email: "3dstudio@example.com",
      passwordHash,
      name: "Мастерская «ПластФорм»",
      role: "EXECUTOR",
      city: "Казань",
      bio: "Небольшая мастерская, специализируемся на крупных изделиях и сериях.",
      specialization: "Крупноформатная печать, серийные заказы",
      materials: "PLA, PETG, ASA, Nylon",
      printer: "Creality K1 Max x4",
      pricePerGram: 6.5,
      ratingAvg: 5,
      ratingCount: 1,
    },
  });

  const exec3 = await prisma.user.create({
    data: {
      email: "nastya.print@example.com",
      passwordHash,
      name: "Анастасия Кузнецова",
      role: "EXECUTOR",
      city: "Новосибирск",
      bio: "Ювелирные и мелкие детализированные модели на смоляном принтере.",
      specialization: "Ювелирная смола, миниатюры",
      materials: "Resin (SLA), TPU",
      printer: "Phrozen Sonic Mighty 8K",
      pricePerGram: 12,
      ratingAvg: 0,
      ratingCount: 0,
    },
  });

  const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Открытый аукцион с несколькими ставками
  const order1 = await prisma.order.create({
    data: {
      customerId: customer1.id,
      title: "10 миниатюр для настольной игры",
      description:
        "Нужно напечатать 10 фигурок высотой ~30мм по STL-файлам (пришлю после выбора исполнителя). Важна детализация лица и брони.",
      material: "Resin (SLA)",
      color: "Серый грунт",
      quantity: 10,
      budgetMin: 1500,
      budgetMax: 4000,
      biddingEnds: inTwoDays,
      deadline: inTenDays,
      status: "OPEN",
    },
  });

  await prisma.bid.create({
    data: {
      orderId: order1.id,
      executorId: exec1.id,
      price: 3200,
      leadTimeDays: 4,
      message: "Печатаю миниатюры регулярно, покажу примеры в портфолио. Готов начать сразу.",
    },
  });

  await prisma.bid.create({
    data: {
      orderId: order1.id,
      executorId: exec3.id,
      price: 2800,
      leadTimeDays: 6,
      message: "Специализируюсь именно на детализированных миниатюрах на смоле.",
    },
  });

  // Второй открытый аукцион
  const order2 = await prisma.order.create({
    data: {
      customerId: customer2.id,
      title: "Корпус для прототипа электронного устройства",
      description:
        "Корпус 150x80x40мм, разъёмы под USB-C и кнопку. Есть STEP-модель. Материал — прочный, для повседневного использования.",
      material: "PETG",
      quantity: 3,
      budgetMin: 2000,
      budgetMax: 6000,
      biddingEnds: inFiveDays,
      deadline: inTenDays,
      status: "OPEN",
    },
  });

  await prisma.bid.create({
    data: {
      orderId: order2.id,
      executorId: exec2.id,
      price: 4500,
      leadTimeDays: 5,
      message: "Есть опыт с корпусами под электронику, можем усилить рёбра жёсткости.",
    },
  });

  // Завершённый заказ с отзывами в обе стороны
  const order3 = await prisma.order.create({
    data: {
      customerId: customer1.id,
      title: "Подставка для наушников",
      description: "Подставка в форме шлема, под настольный светильник.",
      material: "PLA",
      color: "Чёрный",
      quantity: 1,
      budgetMin: 500,
      budgetMax: 1500,
      biddingEnds: yesterday,
      status: "COMPLETED",
    },
  });

  const winningBid = await prisma.bid.create({
    data: {
      orderId: order3.id,
      executorId: exec1.id,
      price: 900,
      leadTimeDays: 2,
      message: "Сделаю аккуратно, есть похожие работы в портфолио.",
      status: "ACCEPTED",
    },
  });

  await prisma.order.update({
    where: { id: order3.id },
    data: { winningBidId: winningBid.id },
  });

  await prisma.review.create({
    data: {
      orderId: order3.id,
      authorId: customer1.id,
      targetId: exec1.id,
      rating: 5,
      comment: "Отличная работа, всё точно в срок и очень аккуратно!",
    },
  });

  await prisma.review.create({
    data: {
      orderId: order3.id,
      authorId: exec1.id,
      targetId: customer1.id,
      rating: 5,
      comment: "Заказчик чётко всё описал, оплата сразу. Рекомендую.",
    },
  });

  console.log("Seed complete. Demo accounts (password: password123):");
  console.log("  customer: anna@example.com");
  console.log("  customer: oleg@example.com");
  console.log("  executor: print.master@example.com");
  console.log("  executor: 3dstudio@example.com");
  console.log("  executor: nastya.print@example.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
