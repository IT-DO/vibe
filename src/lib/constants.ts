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

// Список сгруппирован по способу печати: обычные термопластики (FDM) →
// композиты (FDM с наполнителем) → фотополимеры (SLA/DLP) → порошковая
// печать (SLS) → печать металлом → воск под литьё. Группировка влияет
// только на порядок в выпадающем списке — сами значения плоские.
export const MATERIALS = [
  // FDM/FFF — обычные термопластики
  "PLA",
  "PETG",
  "ABS",
  "ASA",
  "TPU",
  "PC (поликарбонат)",
  "Nylon",
  // Композиты — FDM-пластик с наполнителем
  "Carbon Fiber",
  "Fiberglass (стекловолокно)",
  "Wood Fill (наполнитель — дерево)",
  "Metal Fill (наполнитель — металл)",
  // Фотополимерная печать (SLA/DLP)
  "Resin (SLA)",
  // Порошковая печать (SLS) — без поддержек, спекание лазером
  "Nylon (SLS)",
  // Печать металлом
  "Metal (DMLS/SLM)",
  // Литьё
  "Wax (для литья)",
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
  "PC (поликарбонат)": "Очень прочный и термостойкий инженерный пластик (выше 100°C), но капризен в печати — нужен подогреваемый стол и закрытая камера. Для нагруженных технических деталей.",
  Nylon: "Очень прочный, износостойкий и слегка гибкий. Требует аккуратной печати и хранения (боится влаги) — для шестерёнок и нагруженных механических деталей.",
  "Carbon Fiber": "Композит с угольным волокном — повышенная жёсткость при малом весе. Для инженерных деталей с высокой нагрузкой, печать дороже и сложнее.",
  "Fiberglass (стекловолокно)": "FDM-пластик, армированный стекловолокном — жёстче и прочнее базового PETG/Nylon, при этом дешевле карбона. Хороший вариант для нагруженных деталей без переплаты.",
  "Wood Fill (наполнитель — дерево)": "PLA с древесной стружкой — на ощупь и при шлифовке похож на дерево, можно тонировать морилкой. Декоративный материал, прочность на уровне обычного PLA.",
  "Metal Fill (наполнитель — металл)": "PLA/PETG с металлическим порошком (бронза, медь, сталь) — заметный вес и металлический блеск после полировки. Для сувениров и декора «под металл».",
  "Resin (SLA)": "Высочайшая детализация и гладкая поверхность, но материал более хрупкий. Идеален для миниатюр, ювелирных изделий, мелких деталей.",
  "Nylon (SLS)": "Порошковая печать без поддержек — нейлон спекается лазером слой за слоем. Высокая прочность и сложная геометрия, недоступная FDM. Дороже и дольше обычной печати.",
  "Metal (DMLS/SLM)": "Печать металлом (сталь, титан, алюминий) прямым лазерным спеканием порошка. Настоящая металлическая деталь, а не имитация — самый дорогой и долгий вариант.",
  "Wax (для литья)": "Восковая модель для литья по выплавляемым моделям — классика ювелирного и промышленного литья. Сама по себе не функциональна, это заготовка под металл.",
};

// Усреднённые справочные характеристики — ориентир для сравнения, а не точные
// данные конкретного производителя (они варьируются от бренда к бренду и от
// настроек печати). Полная таблица — /materials, здесь же используется
// компактно во всплывающих подсказках (MaterialTag) и в MaterialsLegend.
export type MaterialSpec = {
  technology: string;
  processTemp: string; // температура печати/процесса
  heatResistance: string; // термостойкость готового изделия (HDT), °C
  impactToughness: string; // ударная вязкость, приближённо
  density: string; // плотность, г/см³
};

export const MATERIAL_SPECS: Record<string, MaterialSpec> = {
  PLA: { technology: "FDM", processTemp: "190–220 °C", heatResistance: "~55–60 °C", impactToughness: "низкая, ~3–5 кДж/м²", density: "1.24 г/см³" },
  PETG: { technology: "FDM", processTemp: "230–250 °C", heatResistance: "~70–80 °C", impactToughness: "средняя, ~6–8 кДж/м²", density: "1.27 г/см³" },
  ABS: { technology: "FDM", processTemp: "230–260 °C", heatResistance: "~95–100 °C", impactToughness: "средне-высокая, ~15–20 кДж/м²", density: "1.04 г/см³" },
  ASA: { technology: "FDM", processTemp: "240–260 °C", heatResistance: "~95–100 °C", impactToughness: "средне-высокая, ~15–20 кДж/м²", density: "1.07 г/см³" },
  TPU: { technology: "FDM", processTemp: "210–230 °C", heatResistance: "~60–80 °C", impactToughness: "очень высокая (эластичный, не раскалывается)", density: "1.21 г/см³" },
  "PC (поликарбонат)": { technology: "FDM", processTemp: "270–300 °C", heatResistance: "~110–140 °C", impactToughness: "очень высокая, ~60–90 кДж/м²", density: "1.20 г/см³" },
  Nylon: { technology: "FDM", processTemp: "240–260 °C", heatResistance: "~50–80 °C", impactToughness: "высокая, ~10–15 кДж/м²", density: "1.14 г/см³" },
  "Carbon Fiber": { technology: "FDM (композит)", processTemp: "250–270 °C", heatResistance: "~90–110 °C", impactToughness: "средняя, ~8–12 кДж/м²", density: "1.20–1.30 г/см³" },
  "Fiberglass (стекловолокно)": { technology: "FDM (композит)", processTemp: "230–260 °C", heatResistance: "~80–100 °C", impactToughness: "средне-высокая, ~15–20 кДж/м²", density: "1.30–1.40 г/см³" },
  "Wood Fill (наполнитель — дерево)": { technology: "FDM (композит)", processTemp: "190–220 °C", heatResistance: "~55–60 °C", impactToughness: "низкая, как у PLA", density: "1.15–1.28 г/см³" },
  "Metal Fill (наполнитель — металл)": { technology: "FDM (композит)", processTemp: "190–220 °C", heatResistance: "~55–70 °C", impactToughness: "низкая, как у основы (PLA/PETG)", density: "1.7–3.5 г/см³" },
  "Resin (SLA)": { technology: "SLA/DLP (фотополимер)", processTemp: "УФ-отверждение, без нагрева", heatResistance: "~50–60 °C (после постотверждения)", impactToughness: "низкая, ~2–4 кДж/м²", density: "1.10–1.20 г/см³" },
  "Nylon (SLS)": { technology: "SLS (лазерное спекание порошка)", processTemp: "спекание при ~170–180 °C", heatResistance: "~80–100 °C", impactToughness: "высокая, ~8–12 кДж/м²", density: "0.95–1.02 г/см³" },
  "Metal (DMLS/SLM)": { technology: "DMLS/SLM (лазерная плавка металла)", processTemp: "~660–1450 °C (зависит от металла)", heatResistance: "как у литого металла", impactToughness: "очень высокая", density: "2.7–8.0 г/см³" },
  "Wax (для литья)": { technology: "Литьё по выплавляемым моделям", processTemp: "~60–90 °C", heatResistance: "не применимо (заготовка под литьё)", impactToughness: "не применимо", density: "~0.9–1.0 г/см³" },
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
