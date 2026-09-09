/**
 * Слияние сохранённых настроек со значениями по умолчанию.
 *
 * Настройки лежат на устройстве одним объектом и переживают обновление
 * приложения. Штатное слияние zustand поверхностное: сохранённый объект
 * `settings` целиком заменяет новый объект по умолчанию. Значит, любое поле,
 * добавленное в следующей версии, у уже установленного приложения окажется
 * `undefined` — и сломается не при обновлении, а позже и не там.
 *
 * Здесь слияние идёт вглубь и по типам: берём сохранённое значение, только
 * если оно того же вида, что и значение по умолчанию. Так переживается и
 * добавление полей, и порча хранилища.
 */

/** Обычный объект, а не массив, не null и не экземпляр класса. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Накладывает сохранённые значения на значения по умолчанию.
 *
 * @param defaults эталон: задаёт набор полей и их типы.
 * @param stored   то, что прочитано с устройства; может быть чем угодно.
 */
export function withDefaults<T>(defaults: T, stored: unknown): T {
  // null допустим как значение по умолчанию (например, адрес принтера).
  if (defaults === null) {
    return (stored === undefined ? null : stored) as T;
  }

  if (Array.isArray(defaults)) {
    // Массив берём целиком: поэлементное слияние здесь бессмысленно —
    // список форматов не должен «дополняться» старыми значениями.
    return (Array.isArray(stored) ? stored : defaults) as T;
  }

  if (isPlainObject(defaults)) {
    if (!isPlainObject(stored)) {
      return defaults;
    }
    const result: Record<string, unknown> = {};
    for (const [key, fallback] of Object.entries(defaults)) {
      result[key] = withDefaults(fallback, stored[key]);
    }
    return result as T;
  }

  // Простое значение: принимаем, только если тип совпал.
  return (typeof stored === typeof defaults ? stored : defaults) as T;
}
