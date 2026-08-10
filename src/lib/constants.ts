export const ROLES = ["CUSTOMER", "EXECUTOR", "DESIGNER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

// Роли, которые могут делать ставки на заказы (печать и/или 3D-моделирование).
export const BIDDER_ROLES = ["EXECUTOR", "DESIGNER"] as const;

export const ORDER_STATUSES = [
  "OPEN",
  "AWARDED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const BID_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  OPEN: "Приём ставок",
  AWARDED: "Исполнитель выбран",
  IN_PROGRESS: "В печати",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

export const BID_STATUS_LABELS: Record<BidStatus, string> = {
  PENDING: "На рассмотрении",
  ACCEPTED: "Принята",
  REJECTED: "Отклонена",
  WITHDRAWN: "Отозвана",
};

export const SUBSCRIPTION_STATUSES = ["INACTIVE", "ACTIVE", "PAST_DUE", "CANCELLED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  INACTIVE: "Не активна",
  ACTIVE: "Активна",
  PAST_DUE: "Просрочена",
  CANCELLED: "Отменена",
};

export const PAYMENT_TYPES = ["SUBSCRIPTION", "COMMISSION"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "CANCELLED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Ожидает оплаты",
  PAID: "Оплачено",
  FAILED: "Не удалось",
  CANCELLED: "Отменено",
};

// Тарифы площадки. Вынесены в константы, чтобы менять было в одном месте —
// подробнее про модель начислений см. src/lib/billing.ts.
export const SUBSCRIPTION_PRICE_RUB = 300;
export const SUBSCRIPTION_PERIOD_DAYS = 30;
export const COMMISSION_RATE = 0.01; // 1% с завершённых заказов

export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: "Заказчик",
  EXECUTOR: "Исполнитель (печать)",
  DESIGNER: "3D-дизайнер/инженер",
  ADMIN: "Администратор",
};

// Разрешённые форматы вложений: конкретные MIME для каждого — единый источник
// правды и для клиентского атрибута accept, и для серверной валидации/сохранения
// (см. src/lib/storage.ts). Никаких html/svg/js — заведомо небезопасно отдавать
// такие файлы пользователям обратно.
export const ATTACHMENT_EXTENSIONS: Record<string, string> = {
  stl: "model/stl",
  obj: "model/obj",
  step: "model/step",
  stp: "model/step",
  "3mf": "model/3mf",
  gcode: "text/plain",
  zip: "application/zip",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const MATERIALS = [
  "PLA",
  "PETG",
  "ABS",
  "ASA",
  "TPU",
  "Resin (SLA)",
  "Nylon",
  "Carbon Fiber",
];

// Типовые потребительские свойства материалов — для всплывающих подсказок
// рядом с названием материала (см. src/components/MaterialTag.tsx). Текст
// намеренно короткий и не техничный — ориентирован на заказчика, а не печатника.
export const MATERIAL_PROPERTIES: Record<string, string> = {
  PLA: "Самый простой в печати материал, экологичный. Средняя прочность, размягчается уже от ~60°C — не для горячих и нагруженных мест. Хорош для сувениров, макетов, декора.",
  PETG: "Прочнее и пластичнее PLA, устойчив к влаге и ударам, не боится умеренного нагрева. Хороший баланс прочности и лёгкости печати — для функциональных деталей.",
  ABS: "Ударопрочный и термостойкий (до ~90°C), но усаживается при печати. Классика для корпусов и деталей с механической нагрузкой.",
  ASA: "Похож на ABS, но устойчив к ультрафиолету и осадкам — подходит для уличных изделий и автотюнинга.",
  TPU: "Гибкий, эластичный, резиноподобный материал. Устойчив к истиранию — для чехлов, прокладок, амортизирующих деталей.",
  "Resin (SLA)": "Высочайшая детализация и гладкая поверхность, но материал более хрупкий. Идеален для миниатюр, ювелирных изделий, мелких деталей.",
  Nylon: "Очень прочный, износостойкий и слегка гибкий. Требует аккуратной печати и хранения — для шестерёнок и нагруженных механических деталей.",
  "Carbon Fiber": "Композит с угольным волокном — повышенная жёсткость при малом весе. Для инженерных деталей с высокой нагрузкой, печать дороже и сложнее.",
};

// Ачивки за количество полученных отзывов — показываются на карточках
// специалистов и в профиле, чтобы наглядно отражать опыт на площадке.
export const REVIEW_ACHIEVEMENTS = [
  { min: 25, label: "Топ-специалист", emoji: "🏆" },
  { min: 10, label: "Опытный", emoji: "⭐" },
  { min: 5, label: "Проверенный", emoji: "✅" },
] as const;

export function getReviewAchievement(reviewCount: number): { label: string; emoji: string } | null {
  for (const tier of REVIEW_ACHIEVEMENTS) {
    if (reviewCount >= tier.min) return tier;
  }
  return null;
}

// Подписи профильных полей отличаются для печатников и дизайнеров, хотя хранятся
// в одних и тех же колонках User (см. комментарий в schema.prisma).
export const PROFILE_FIELD_LABELS: Record<
  "EXECUTOR" | "DESIGNER",
  { specialization: string; materials: string; printer: string; price: string }
> = {
  EXECUTOR: {
    specialization: "Специализация",
    materials: "Материалы",
    printer: "Оборудование",
    price: "Цена, ₽ / г",
  },
  DESIGNER: {
    specialization: "Специализация",
    materials: "Форматы файлов",
    printer: "Инструменты / ПО",
    price: "Цена, ₽ / час",
  },
};
