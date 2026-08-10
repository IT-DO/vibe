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
