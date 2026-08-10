export const ROLES = ["CUSTOMER", "EXECUTOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

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
  EXECUTOR: "Исполнитель",
  ADMIN: "Администратор",
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
