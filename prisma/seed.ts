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

async function upsertUser(data: {
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
}) {
  return prisma.user.upsert({
    where: { email: data.email },
    update: data,
    create: data,
  });
}

async function main() {
  console.log("Seeding database...");

  const passwordHash = await hash("password123");

  const anna = await upsertUser({
    email: "anna@example.com",
    passwordHash,
    name: "Анна Смирнова",
    role: "CUSTOMER",
    city: "Москва",
    bio: "Делаю настольные игры, часто нужны миниатюры и фигурки.",
  });

  const oleg = await upsertUser({
    email: "oleg@example.com",
    passwordHash,
    name: "Олег Петров",
    role: "CUSTOMER",
    city: "Санкт-Петербург",
    bio: "Инженер-стартапер, нужны функциональные прототипы.",
  });

  const marina = await upsertUser({
    email: "marina@example.com",
    passwordHash,
    name: "Марина Волкова",
    role: "CUSTOMER",
    city: "Екатеринбург",
    bio: "Делаю авторский мерч, часто нужны 3D-модели по эскизам и рендеры.",
  });

  const dmitry = await upsertUser({
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
  });

  const plastform = await upsertUser({
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
  });

  const nastya = await upsertUser({
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
  });

  const viktoria = await upsertUser({
    email: "viktoria.design@example.com",
    passwordHash,
    name: "Виктория Орлова",
    role: "DESIGNER",
    city: "Санкт-Петербург",
    bio: "Инженер-конструктор, 7 лет в CAD. Делаю модели под печать с нуля и по эскизам/фото.",
    specialization: "Инженерный CAD, топологическая оптимизация",
    materials: "STL, STEP, OBJ",
    printer: "Fusion 360, SolidWorks",
    pricePerGram: 1500,
  });

  const maxim = await upsertUser({
    email: "maxim.3dmodel@example.com",
    passwordHash,
    name: "Максим Титов",
    role: "DESIGNER",
    city: "Новосибирск",
    bio: "3D-художник, стилизованные модели и игровые ассеты.",
    specialization: "Игровые ассеты, стилизованные модели, скульптинг",
    materials: "OBJ, FBX, STL",
    printer: "Blender, ZBrush",
    pricePerGram: 900,
  });

  const existingOrders = await prisma.order.count();
  if (existingOrders > 0) {
    console.log(
      `В базе уже есть заказы (${existingOrders}) — пропускаю создание тестовых заказов, чтобы не плодить дубли. Пользователи обновлены.`
    );
  } else {
    const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const inFourteenDays = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    // --- Открытые аукционы ---

    const order1 = await prisma.order.create({
      data: {
        customerId: anna.id,
        title: "10 миниатюр для настольной игры",
        description:
          "Нужно напечатать 10 фигурок высотой ~30мм по STL-файлам (пришлю после выбора исполнителя). Важна детализация лица и брони. Референс приложен.",
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
    await seedAttachment({
      orderId: order1.id,
      uploaderId: anna.id,
      fileName: "референс-миниатюра.png",
      ext: "png",
      mimeType: "image/png",
      content: PNG_PLACEHOLDER,
    });
    await prisma.bid.create({
      data: {
        orderId: order1.id,
        executorId: dmitry.id,
        price: 3200,
        leadTimeDays: 4,
        message: "Печатаю миниатюры регулярно, покажу примеры в портфолио. Готов начать сразу.",
      },
    });
    await prisma.bid.create({
      data: {
        orderId: order1.id,
        executorId: nastya.id,
        price: 2800,
        leadTimeDays: 6,
        message: "Специализируюсь именно на детализированных миниатюрах на смоле.",
      },
    });

    const order2 = await prisma.order.create({
      data: {
        customerId: oleg.id,
        title: "Корпус для прототипа электронного устройства",
        description:
          "Корпус 150x80x40мм, разъёмы под USB-C и кнопку. Есть STEP-модель (приложена). Материал — прочный, для повседневного использования.",
        material: "PETG",
        quantity: 3,
        budgetMin: 2000,
        budgetMax: 6000,
        biddingEnds: inFiveDays,
        deadline: inTenDays,
        status: "OPEN",
      },
    });
    await seedAttachment({
      orderId: order2.id,
      uploaderId: oleg.id,
      fileName: "корпус-черновик.stl",
      ext: "stl",
      mimeType: "model/stl",
      content: STL_PLACEHOLDER,
    });
    await prisma.bid.create({
      data: {
        orderId: order2.id,
        executorId: plastform.id,
        price: 4500,
        leadTimeDays: 5,
        message: "Есть опыт с корпусами под электронику, можем усилить рёбра жёсткости.",
      },
    });
    await prisma.bid.create({
      data: {
        orderId: order2.id,
        executorId: dmitry.id,
        price: 5200,
        leadTimeDays: 4,
        message: "Готов сделать с герметизацией разъёмов, если нужно IP-защиту.",
      },
    });

    const order3 = await prisma.order.create({
      data: {
        customerId: marina.id,
        title: "3D-модель кружки-мерча по эскизу",
        description:
          "Есть эскиз формы (приложен) и логотип для тиснения на боку. Нужна параметрическая модель под последующую печать тиражом. Печать пока не нужна — только модель.",
        material: "PLA",
        quantity: 1,
        budgetMin: 2000,
        budgetMax: 4000,
        biddingEnds: inThreeDays,
        deadline: inFourteenDays,
        status: "OPEN",
      },
    });
    await seedAttachment({
      orderId: order3.id,
      uploaderId: marina.id,
      fileName: "эскиз-кружки.png",
      ext: "png",
      mimeType: "image/png",
      content: PNG_PLACEHOLDER,
    });
    await prisma.bid.create({
      data: {
        orderId: order3.id,
        executorId: viktoria.id,
        price: 3500,
        leadTimeDays: 5,
        message: "Сделаю параметрическую модель, чтобы легко менять размер тиража под разные принтеры.",
      },
    });
    await prisma.bid.create({
      data: {
        orderId: order3.id,
        executorId: maxim.id,
        price: 2800,
        leadTimeDays: 7,
        message: "Могу добавить стилизованный рельеф логотипа, не только плоское тиснение.",
      },
    });

    // --- Исполнитель выбран, но печать ещё не началась ---

    const order4 = await prisma.order.create({
      data: {
        customerId: oleg.id,
        title: "Защитный кожух для дрона",
        description: "Кожух пропеллеров, STEP-модель приложена. Важна ударопрочность.",
        material: "PETG",
        quantity: 4,
        budgetMin: 2000,
        budgetMax: 3500,
        biddingEnds: yesterday,
        deadline: inTenDays,
        status: "AWARDED",
      },
    });
    await seedAttachment({
      orderId: order4.id,
      uploaderId: oleg.id,
      fileName: "кожух-дрона.step",
      ext: "step",
      mimeType: "model/step",
      content: STEP_PLACEHOLDER,
    });
    const order4Winner = await prisma.bid.create({
      data: {
        orderId: order4.id,
        executorId: dmitry.id,
        price: 2600,
        leadTimeDays: 3,
        message: "Печатал похожие кожухи, знаю слабые места по ударопрочности.",
        status: "ACCEPTED",
      },
    });
    await prisma.bid.create({
      data: {
        orderId: order4.id,
        executorId: plastform.id,
        price: 3100,
        leadTimeDays: 4,
        message: "Можем в ASA для лучшей стойкости к УФ.",
        status: "REJECTED",
      },
    });
    await prisma.order.update({ where: { id: order4.id }, data: { winningBidId: order4Winner.id } });

    // --- В печати ---

    const order5 = await prisma.order.create({
      data: {
        customerId: anna.id,
        title: "Кронштейны для полки, 6 шт",
        description: "Кронштейны под настенную полку, нагрузка до 10кг каждый.",
        material: "PLA",
        quantity: 6,
        budgetMin: 1200,
        budgetMax: 2500,
        biddingEnds: yesterday,
        deadline: inFiveDays,
        status: "IN_PROGRESS",
      },
    });
    const order5Winner = await prisma.bid.create({
      data: {
        orderId: order5.id,
        executorId: plastform.id,
        price: 1800,
        leadTimeDays: 3,
        message: "Печатаем со 100% заполнением для такой нагрузки.",
        status: "ACCEPTED",
      },
    });
    await prisma.order.update({ where: { id: order5.id }, data: { winningBidId: order5Winner.id } });

    // --- Завершённые заказы с отзывами и комиссией ---

    const order6 = await prisma.order.create({
      data: {
        customerId: anna.id,
        title: "Подставка для наушников",
        description: "Подставка в форме шлема, под настольный светильник.",
        material: "PLA",
        color: "Чёрный",
        quantity: 1,
        budgetMin: 500,
        budgetMax: 1500,
        biddingEnds: threeDaysAgo,
        status: "COMPLETED",
      },
    });
    const order6Winner = await prisma.bid.create({
      data: {
        orderId: order6.id,
        executorId: dmitry.id,
        price: 900,
        leadTimeDays: 2,
        message: "Сделаю аккуратно, есть похожие работы в портфолио.",
        status: "ACCEPTED",
      },
    });
    await prisma.order.update({ where: { id: order6.id }, data: { winningBidId: order6Winner.id } });
    await seedAttachment({
      orderId: order6.id,
      uploaderId: dmitry.id,
      fileName: "готовая-подставка.png",
      ext: "png",
      mimeType: "image/png",
      content: PNG_PLACEHOLDER,
    });
    await prisma.review.create({
      data: {
        orderId: order6.id,
        authorId: anna.id,
        targetId: dmitry.id,
        rating: 5,
        comment: "Отличная работа, всё точно в срок и очень аккуратно!",
      },
    });
    await prisma.review.create({
      data: {
        orderId: order6.id,
        authorId: dmitry.id,
        targetId: anna.id,
        rating: 5,
        comment: "Заказчик чётко всё описал, оплата сразу. Рекомендую.",
      },
    });
    const order6Commission = await prisma.payment.create({
      data: { type: "COMMISSION", amount: 9, payerId: dmitry.id, orderId: order6.id, status: "PAID" },
    });
    await prisma.payment.update({
      where: { id: order6Commission.id },
      data: { provider: "manual", paidAt: new Date() },
    });

    const order7 = await prisma.order.create({
      data: {
        customerId: marina.id,
        title: "3D-модель ёлочной игрушки для мерча",
        description: "Разработка модели с нуля по референсам для последующей серийной печати.",
        material: "Resin (SLA)",
        quantity: 1,
        budgetMin: 3000,
        budgetMax: 4500,
        biddingEnds: threeDaysAgo,
        status: "COMPLETED",
      },
    });
    const order7Winner = await prisma.bid.create({
      data: {
        orderId: order7.id,
        executorId: viktoria.id,
        price: 3500,
        leadTimeDays: 5,
        message: "Сделаю с запасом на усадку смолы при печати.",
        status: "ACCEPTED",
      },
    });
    await prisma.order.update({ where: { id: order7.id }, data: { winningBidId: order7Winner.id } });
    await prisma.review.create({
      data: {
        orderId: order7.id,
        authorId: marina.id,
        targetId: viktoria.id,
        rating: 5,
        comment: "Модель ровно как на референсе, ещё и советами по печати помогла.",
      },
    });
    await prisma.review.create({
      data: {
        orderId: order7.id,
        authorId: viktoria.id,
        targetId: marina.id,
        rating: 5,
        comment: "Чёткое ТЗ, приятно работать.",
      },
    });
    await prisma.payment.create({
      data: { type: "COMMISSION", amount: 35, payerId: viktoria.id, orderId: order7.id, status: "PENDING" },
    });

    const order8 = await prisma.order.create({
      data: {
        customerId: oleg.id,
        title: "Значки для мероприятия, 20 шт",
        description: "Значки с логотипом компании для конференции.",
        material: "PLA",
        color: "Синий",
        quantity: 20,
        budgetMin: 1500,
        budgetMax: 2500,
        biddingEnds: threeDaysAgo,
        status: "COMPLETED",
      },
    });
    const order8Winner = await prisma.bid.create({
      data: {
        orderId: order8.id,
        executorId: nastya.id,
        price: 1800,
        leadTimeDays: 4,
        message: "Есть опыт с мелким тиражом сувенирки.",
        status: "ACCEPTED",
      },
    });
    await prisma.order.update({ where: { id: order8.id }, data: { winningBidId: order8Winner.id } });
    await prisma.review.create({
      data: {
        orderId: order8.id,
        authorId: oleg.id,
        targetId: nastya.id,
        rating: 4,
        comment: "Качество хорошее, но задержалась на день от обещанного срока.",
      },
    });
    await prisma.review.create({
      data: {
        orderId: order8.id,
        authorId: nastya.id,
        targetId: oleg.id,
        rating: 5,
        comment: "Заказчик на связи, проблем не было.",
      },
    });
    const order8Commission = await prisma.payment.create({
      data: { type: "COMMISSION", amount: 18, payerId: nastya.id, orderId: order8.id, status: "PAID" },
    });
    await prisma.payment.update({
      where: { id: order8Commission.id },
      data: { provider: "manual", paidAt: new Date() },
    });

    // --- Отменённый заказ ---
    await prisma.order.create({
      data: {
        customerId: oleg.id,
        title: "Печать сложной механической детали",
        description: "Заказ отменён — решили изготовить деталь фрезеровкой вместо печати.",
        material: "Nylon",
        quantity: 1,
        biddingEnds: yesterday,
        status: "CANCELLED",
      },
    });

    // --- Рейтинги пересчитываем из реальных отзывов, чтобы цифры на сайте
    // совпадали с тем, что реально видно в разделе «Отзывы» у профиля ---
    const targets = [dmitry.id, anna.id, viktoria.id, marina.id, nastya.id, oleg.id];
    for (const userId of targets) {
      const agg = await prisma.review.aggregate({
        where: { targetId: userId },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count.rating },
      });
    }

    // --- Подписки: часть пользователей уже оплатили ---
    for (const user of [anna, marina, dmitry]) {
      const subscription = await prisma.subscription.create({
        data: {
          userId: user.id,
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.payment.create({
        data: {
          type: "SUBSCRIPTION",
          amount: 300,
          payerId: user.id,
          subscriptionId: subscription.id,
          status: "PAID",
          provider: "manual",
          paidAt: new Date(),
        },
      });
    }
  }

  console.log("Seed complete. Демо-аккаунты (пароль везде: password123):");
  console.log("  заказчик:    anna@example.com");
  console.log("  заказчик:    oleg@example.com");
  console.log("  заказчик:    marina@example.com");
  console.log("  исполнитель: print.master@example.com");
  console.log("  исполнитель: 3dstudio@example.com");
  console.log("  исполнитель: nastya.print@example.com");
  console.log("  дизайнер:    viktoria.design@example.com");
  console.log("  дизайнер:    maxim.3dmodel@example.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
