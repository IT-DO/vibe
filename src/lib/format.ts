import { format, formatDistanceToNow, isPast } from "date-fns";
import { ru } from "date-fns/locale";

export function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}

export function formatDate(date: Date) {
  return format(date, "d MMMM yyyy", { locale: ru });
}

export function formatRelative(date: Date) {
  return formatDistanceToNow(date, { locale: ru, addSuffix: true });
}

export function biddingIsOpen(biddingEnds: Date) {
  return !isPast(biddingEnds);
}
