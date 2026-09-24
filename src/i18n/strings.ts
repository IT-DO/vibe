/**
 * Тексты интерфейса.
 *
 * Русский — основной, английский нужен для мероприятий с иностранными
 * гостями: переключатель языка вынесен на заставку отдельной кнопкой-флагом,
 * потому что искать его в меню гость не станет.
 *
 * Правило для всех строк экрана гостя: одна мысль, не длиннее строки, без
 * технических терминов. «Не удалось установить соединение с устройством
 * печати» — это текст для админки, гостю в такой момент нужно «Одну минуту,
 * зовём организатора».
 */

export type Locale = 'ru' | 'en';

export interface Strings {
  readonly attract: {
    readonly tapToStart: string;
    readonly hint: string;
    readonly printerBusy: string;
    readonly printerOffline: string;
    readonly printerMissing: string;
    readonly printerMissingHint: string;
    readonly setUpPrinter: string;
    readonly pickPhoto: string;
    readonly queueHint: string;
  };
  readonly layout: {
    readonly choose: string;
    readonly single: string;
    readonly polaroid: string;
    readonly duo: string;
    readonly shots: (n: number) => string;
  };
  readonly getReady: {
    readonly title: string;
    readonly seriesTitle: (n: number) => string;
    readonly cancel: string;
  };
  readonly countdown: {
    readonly smile: string;
    readonly shotOf: (current: number, total: number) => string;
  };
  readonly review: {
    readonly title: string;
    readonly print: string;
    readonly retake: string;
    readonly pickAnother: string;
    readonly autoPrintIn: (seconds: number) => string;
  };
  readonly printing: {
    readonly sending: string;
    readonly queued: string;
    readonly position: (n: number) => string;
    readonly waitTime: (seconds: number) => string;
  };
  readonly thanks: {
    readonly title: string;
    readonly takePhoto: string;
    readonly comeBack: string;
    readonly digitalCopy: string;
  };
  readonly error: {
    readonly title: string;
    readonly generic: string;
    readonly callStaff: string;
  };
  readonly printerState: Readonly<Record<string, string>>;
  readonly admin: Readonly<Record<string, string>>;
}

const ru: Strings = {
  attract: {
    tapToStart: 'Нажмите, чтобы сфотографироваться',
    hint: 'Фотография напечатается сразу — заберите её на память',
    printerBusy: 'Печатаем предыдущее фото',
    printerOffline: 'Принтер недоступен — позовите организатора',
    printerMissing: 'Принтер не подключён',
    printerMissingHint: 'Откройте настройки и найдите принтер в сети',
    setUpPrinter: 'Настроить принтер',
    pickPhoto: 'Выбрать готовое фото',
    queueHint: 'В очереди фотографий: {n}',
  },
  layout: {
    choose: 'Выберите формат',
    single: 'Одно фото',
    polaroid: 'Полароид',
    duo: 'Два кадра',
    shots: n => (n === 1 ? '1 кадр' : n < 5 ? `${n} кадра` : `${n} кадров`),
  },
  getReady: {
    title: 'Приготовьтесь!',
    seriesTitle: n => `Снимаем ${n} кадра подряд`,
    cancel: 'Отмена',
  },
  countdown: {
    smile: 'Улыбайтесь!',
    shotOf: (current, total) => `Кадр ${current} из ${total}`,
  },
  review: {
    title: 'Как вам?',
    print: 'Печатать',
    retake: 'Переснять',
    pickAnother: 'Выбрать другое',
    autoPrintIn: seconds => `Печать через ${seconds} с`,
  },
  printing: {
    sending: 'Отправляем на принтер…',
    queued: 'Готово! Фотография печатается',
    position: n => `Ваша фотография ${n}-я в очереди`,
    waitTime: seconds => `Будет готова примерно через ${seconds} с`,
  },
  thanks: {
    title: 'Спасибо!',
    takePhoto: 'Заберите фотографию из принтера',
    comeBack: 'Приходите ещё',
    digitalCopy: 'Наведите камеру, чтобы забрать цифровую копию',
  },
  error: {
    title: 'Одну минуту',
    generic: 'Что-то пошло не так',
    callStaff: 'Позовите, пожалуйста, организатора',
  },
  printerState: {
    'media-empty': 'Закончилась бумага',
    'media-low': 'Бумага заканчивается',
    'media-jam': 'Замятие бумаги',
    'media-needed': 'Вставьте бумагу',
    'cover-open': 'Открыта крышка',
    'door-open': 'Открыта дверца',
    'marker-supply-empty': 'Закончилась лента',
    'marker-supply-low': 'Лента заканчивается',
    'input-tray-missing': 'Нет лотка с бумагой',
    'output-tray-missing': 'Нет приёмного лотка',
    paused: 'Печать приостановлена',
    shutdown: 'Принтер выключен',
    'system-print-unavailable': 'Системная печать недоступна',
    'printer-not-configured': 'Принтер не подключён',
    'printer-stopped': 'Принтер остановлен',
    unknown: 'Принтер не отвечает',
  },
  admin: {
    title: 'Настройки',
    printer: 'Принтер',
    event: 'Мероприятие',
    layouts: 'Форматы',
    queue: 'Очередь печати',
    stats: 'Статистика',
    diagnostics: 'Диагностика',
    search: 'Найти принтер',
    manualAddress: 'Ввести адрес вручную',
    testPrint: 'Пробная печать',
    exitKiosk: 'Выйти из киоск-режима',
    pin: 'ПИН-код',
    wrongPin: 'Неверный ПИН',
    printedTotal: 'Напечатано за мероприятие',
    ribbonLeft: 'Остаток ленты',
    storageUsed: 'Занято на диске',
    purge: 'Стереть все снимки',
    purgeConfirm: 'Удалить все фотографии с планшета? Действие необратимо.',
    close: 'Закрыть',
  },
};

const en: Strings = {
  attract: {
    tapToStart: 'Tap to take a photo',
    hint: 'Your photo prints right away — take it home',
    printerBusy: 'Printing the previous photo',
    printerOffline: 'Printer unavailable — please find a host',
    printerMissing: 'No printer connected',
    printerMissingHint: 'Open settings and find the printer on the network',
    setUpPrinter: 'Set up printer',
    pickPhoto: 'Choose an existing photo',
    queueHint: 'Photos in queue: {n}',
  },
  layout: {
    choose: 'Choose a format',
    single: 'Single photo',
    polaroid: 'Polaroid',
    duo: 'Two shots',
    shots: n => (n === 1 ? '1 shot' : `${n} shots`),
  },
  getReady: {
    title: 'Get ready!',
    seriesTitle: n => `Taking ${n} shots in a row`,
    cancel: 'Cancel',
  },
  countdown: {
    smile: 'Smile!',
    shotOf: (current, total) => `Shot ${current} of ${total}`,
  },
  review: {
    title: 'How is it?',
    print: 'Print',
    retake: 'Retake',
    pickAnother: 'Choose another',
    autoPrintIn: seconds => `Printing in ${seconds}s`,
  },
  printing: {
    sending: 'Sending to the printer…',
    queued: 'Done! Your photo is printing',
    position: n => `Your photo is #${n} in the queue`,
    waitTime: seconds => `Ready in about ${seconds}s`,
  },
  thanks: {
    title: 'Thank you!',
    takePhoto: 'Take your photo from the printer',
    comeBack: 'Come back for more',
    digitalCopy: 'Point your camera to get a digital copy',
  },
  error: {
    title: 'One moment',
    generic: 'Something went wrong',
    callStaff: 'Please find a host',
  },
  printerState: {
    'media-empty': 'Out of paper',
    'media-low': 'Paper running low',
    'media-jam': 'Paper jam',
    'media-needed': 'Load paper',
    'cover-open': 'Cover is open',
    'door-open': 'Door is open',
    'marker-supply-empty': 'Out of ribbon',
    'marker-supply-low': 'Ribbon running low',
    'input-tray-missing': 'Input tray missing',
    'output-tray-missing': 'Output tray missing',
    paused: 'Printing paused',
    shutdown: 'Printer is off',
    'system-print-unavailable': 'System printing unavailable',
    'printer-not-configured': 'No printer connected',
    'printer-stopped': 'Printer stopped',
    unknown: 'Printer not responding',
  },
  admin: {
    title: 'Settings',
    printer: 'Printer',
    event: 'Event',
    layouts: 'Formats',
    queue: 'Print queue',
    stats: 'Statistics',
    diagnostics: 'Diagnostics',
    search: 'Find printer',
    manualAddress: 'Enter address manually',
    testPrint: 'Test print',
    exitKiosk: 'Exit kiosk mode',
    pin: 'PIN code',
    wrongPin: 'Wrong PIN',
    printedTotal: 'Printed at this event',
    ribbonLeft: 'Ribbon left',
    storageUsed: 'Disk used',
    purge: 'Erase all photos',
    purgeConfirm: 'Delete all photos from the tablet? This cannot be undone.',
    close: 'Close',
  },
};

const TABLE: Record<Locale, Strings> = {ru, en};

/** Тексты для указанного языка. */
export function stringsFor(locale: Locale): Strings {
  return TABLE[locale] ?? ru;
}

/**
 * Понятное гостю описание состояния принтера.
 * Незнакомый код не показываем как есть — гостю он ничего не скажет.
 */
export function describePrinterState(
  reason: string | undefined,
  locale: Locale,
): string {
  const table = stringsFor(locale).printerState;
  if (!reason) {
    return table.unknown!;
  }
  const normalized = reason.replace(/-(?:report|warning|error)$/, '');
  return table[normalized] ?? table.unknown!;
}
