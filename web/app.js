/* Дашборд ЕГРЗ: умные фильтры + инфографика.
 *
 * Данные приходят словарно сжатыми (см. egrz/export.py): значения
 * категориальных колонок заменены индексами в словаре. Фильтрация работает по
 * целым числам, поэтому пересчёт фасетов на десятках тысяч записей укладывается
 * в один кадр и фильтры ощущаются мгновенными.
 */

const DATA_DIR = "data";

// ------------------------------------------------------------- форматирование

const nf = new Intl.NumberFormat("ru-RU");
const fmtInt = (v) => nf.format(Math.round(v || 0));

function fmtMoney(value) {
  if (value == null || !isFinite(value) || value <= 0) return "—";
  const units = [
    [1e12, "трлн"],
    [1e9, "млрд"],
    [1e6, "млн"],
    [1e3, "тыс."],
  ];
  for (const [size, name] of units) {
    if (value >= size) {
      const scaled = value / size;
      const digits = scaled >= 100 ? 0 : 1;
      return `${scaled.toFixed(digits).replace(".", ",")} ${name} ₽`;
    }
  }
  return `${fmtInt(value)} ₽`;
}

const fmtPct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")} %`);

const MONTH_NAMES = ["янв", "фев", "мар", "апр", "май", "июн",
                     "июл", "авг", "сен", "окт", "ноя", "дек"];

function fmtMonth(key) {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year.slice(2)}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function shiftDays(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

// --------------------------------------------------------------- состояние

const DS = {
  columns: [],
  index: {},          // имя колонки -> позиция
  rows: [],
  dict: {},           // имя колонки -> массив значений
  facetColumns: [],
  searchText: [],     // предвычисленная строка поиска на запись
  meta: null,
};

const STATE = {
  q: "",
  from: "",
  to: "",
  facets: {},         // колонка -> Set(индексов словаря)
  sort: { column: "date_registered", dir: "desc" },
  tableLimit: 100,
};

const FACET_TITLES = {
  federal_district: "Федеральный округ",
  region: "Субъект РФ",
  expertise_type: "Тип экспертизы",
  result: "Результат",
  object_category: "Категория объекта",
  purpose: "Назначение",
  subject_matter: "Предмет экспертизы",
  organization: "Экспертная организация",
  developer: "Застройщик",
  cost_bucket: "Сметная стоимость",
};

// Фасеты, которым нужен поиск внутри списка: значений много.
const SEARCHABLE_FACETS = new Set(["region", "organization", "developer"]);

const el = (id) => document.getElementById(id);
const col = (name) => DS.index[name];
const val = (row, name) => {
  const value = row[DS.index[name]];
  const dict = DS.dict[name];
  return dict ? (value == null ? null : dict[value]) : value;
};

// ------------------------------------------------------------------ загрузка

async function load() {
  const [dataset, meta] = await Promise.all([
    fetch(`${DATA_DIR}/dataset.json`).then(okJson),
    fetch(`${DATA_DIR}/meta.json`).then(okJson).catch(() => null),
  ]);

  DS.columns = dataset.columns;
  dataset.columns.forEach((name, i) => (DS.index[name] = i));
  DS.rows = dataset.rows;
  DS.dict = dataset.dictionaries || {};
  DS.facetColumns = dataset.facet_columns || Object.keys(FACET_TITLES);
  DS.meta = meta;
  DS.generatedAt = dataset.generated_at;
  DS.truncated = dataset.truncated;
  DS.totalInStore = dataset.total_in_store;

  // Строка полнотекстового поиска считается один раз на загрузке:
  // склеивать её на каждое нажатие клавиши было бы слишком дорого.
  const searchColumns = dataset.search_columns || [];
  const parts = searchColumns.map((name) => ({ idx: DS.index[name], dict: DS.dict[name] }));
  DS.searchText = DS.rows.map((row) => {
    let text = "";
    for (const { idx, dict } of parts) {
      const raw = row[idx];
      if (raw == null) continue;
      text += (dict ? dict[raw] : raw) + " ";
    }
    return text.toLowerCase();
  });

  DS.dateIdx = DS.index.date_registered;
  DS.costIdx = DS.index.cost;
}

async function okJson(response) {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${response.url}`);
  return response.json();
}

// ------------------------------------------------------- движок фильтрации

/** Проверяет запись по всем условиям, кроме колонки `skip`.
 *  `skip` нужен для «зависимых» счётчиков: в фасете «Регион» количества
 *  считаются так, будто выбор регионов ещё не сделан — иначе невыбранные
 *  регионы всегда показывали бы ноль и фильтр стал бы тупиковым. */
function matches(rowIndex, skip) {
  const row = DS.rows[rowIndex];

  if (STATE.q && !DS.searchText[rowIndex].includes(STATE.q)) return false;

  const date = row[DS.dateIdx];
  if (STATE.from && (!date || date < STATE.from)) return false;
  if (STATE.to && (!date || date > STATE.to)) return false;

  for (const name in STATE.facets) {
    if (name === skip) continue;
    const selected = STATE.facets[name];
    if (!selected || selected.size === 0) continue;
    if (!selected.has(row[DS.index[name]])) return false;
  }
  return true;
}

function select(skip) {
  const out = [];
  for (let i = 0; i < DS.rows.length; i++) {
    if (matches(i, skip)) out.push(i);
  }
  return out;
}

/** Счётчики значений каждого фасета — с учётом всех прочих фильтров. */
function facetCounts() {
  const result = {};
  for (const name of DS.facetColumns) {
    const idx = DS.index[name];
    const counts = new Map();
    for (let i = 0; i < DS.rows.length; i++) {
      if (!matches(i, name)) continue;
      const value = DS.rows[i][idx];
      if (value == null) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    result[name] = counts;
  }
  return result;
}

function activeFilterCount() {
  let count = STATE.q ? 1 : 0;
  if (STATE.from || STATE.to) count += 1;
  for (const name in STATE.facets) count += STATE.facets[name].size;
  return count;
}

// ------------------------------------------------------------ агрегирование

function aggregate(rows) {
  const byMonth = new Map();
  const byRegion = new Map();
  const byCategory = new Map();
  const byOrg = new Map();
  const byDeveloper = new Map();
  const byBucket = new Map();
  const byDistrict = new Map();   // округ -> [государственная, негосударственная]

  const costs = [];
  let positive = 0;
  let negative = 0;
  const orgSet = new Set();

  const monthIdx = DS.index.month;
  const regionIdx = DS.index.region;
  const categoryIdx = DS.index.object_category;
  const orgIdx = DS.index.organization;
  const developerIdx = DS.index.developer;
  const bucketIdx = DS.index.cost_bucket;
  const districtIdx = DS.index.federal_district;
  const resultIdx = DS.index.result;
  const typeIdx = DS.index.expertise_type;

  const dResult = DS.dict.result || [];
  const dType = DS.dict.expertise_type || [];

  const bump = (map, key) => { if (key != null) map.set(key, (map.get(key) || 0) + 1); };

  for (const i of rows) {
    const row = DS.rows[i];
    bump(byMonth, row[monthIdx]);
    bump(byRegion, row[regionIdx]);
    bump(byCategory, row[categoryIdx]);
    bump(byBucket, row[bucketIdx]);

    const org = row[orgIdx];
    if (org != null) { bump(byOrg, org); orgSet.add(org); }
    bump(byDeveloper, row[developerIdx]);

    const resultName = dResult[row[resultIdx]];
    if (resultName === "Положительное") positive++;
    else if (resultName === "Отрицательное") negative++;

    const district = row[districtIdx];
    if (district != null) {
      let pair = byDistrict.get(district);
      if (!pair) { pair = [0, 0]; byDistrict.set(district, pair); }
      pair[dType[row[typeIdx]] === "Негосударственная" ? 1 : 0]++;
    }

    const cost = row[DS.costIdx];
    if (typeof cost === "number" && cost > 0) costs.push(cost);
  }

  costs.sort((a, b) => a - b);
  const median = costs.length ? costs[Math.floor(costs.length / 2)] : null;
  const total = rows.length;

  return {
    total, positive, negative,
    positiveShare: total ? positive / total : null,
    costSum: costs.reduce((a, b) => a + b, 0),
    costMedian: median,
    orgCount: orgSet.size,
    byMonth, byRegion, byCategory, byOrg, byDeveloper, byBucket, byDistrict,
  };
}

/** Map(индекс словаря -> число) -> отсортированный массив {name, value}. */
function toList(map, dictName, { limit = null, sort = "desc" } = {}) {
  const dict = DS.dict[dictName] || [];
  const list = [...map.entries()].map(([key, value]) => ({ name: dict[key] ?? "—", value }));
  if (sort === "desc") list.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ru"));
  else if (sort === "key") list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return limit ? list.slice(0, limit) : list;
}

// ------------------------------------------------------------- SVG-примитивы

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const key in attrs) {
    if (attrs[key] != null) node.setAttribute(key, attrs[key]);
  }
  if (parent) parent.appendChild(node);
  return node;
}

/** Прямоугольник со скруглением только на «конце данных».
 *  У основания угол остаётся прямым: столбик растёт от базовой линии. */
function barPath(x, y, w, h, r, side) {
  const radius = Math.max(0, Math.min(r, side === "right" || side === "left" ? h / 2 : w / 2, side === "top" ? h : w));
  if (radius <= 0.5) return `M${x},${y}h${w}v${h}h${-w}z`;
  if (side === "right") {
    return `M${x},${y}h${w - radius}a${radius},${radius} 0 0 1 ${radius},${radius}` +
           `v${h - 2 * radius}a${radius},${radius} 0 0 1 ${-radius},${radius}h${-(w - radius)}z`;
  }
  if (side === "top") {
    return `M${x},${y + h}v${-(h - radius)}a${radius},${radius} 0 0 1 ${radius},${-radius}` +
           `h${w - 2 * radius}a${radius},${radius} 0 0 1 ${radius},${radius}v${h - radius}z`;
  }
  return `M${x},${y}h${w}v${h}h${-w}z`;
}

/** Красивые деления оси: 0 / 500 / 1 000 / 1 500.
 *  Верхнее деление всегда не меньше максимума — иначе столбец «пробивает»
 *  верхнюю линию сетки, а его подпись уезжает за границу картинки. */
function niceTicks(max, count = 4) {
  if (!max || max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) || magnitude * 10;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = 0; value <= top + step * 0.001; value += step) ticks.push(value);
  return ticks;
}

// Ширина текста в SVG зависит от реального шрифта и алфавита — оценка
// «N px на символ» на кириллице (особенно на широких буквах вроде «Ш», «Д»,
// «Ж») занижает ширину, обрезанная строка не помещается в отведённое место
// и «наезжает» за левый край SVG у подписей с text-anchor="end". Меряем
// по-настоящему через Canvas вместо угадывания по числу символов.
const _measureCanvas = document.createElement("canvas");
const _measureCtx = _measureCanvas.getContext("2d");
const TICK_FONT = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";

function textWidth(text, font = TICK_FONT) {
  _measureCtx.font = font;
  return _measureCtx.measureText(text).width;
}

/** Обрезает текст под реальную ширину в пикселях, добавляя «…» только если
 *  не поместилось. Двоичный поиск — O(log n) измерений вместо посимвольных. */
function truncateToWidth(text, maxWidth, font = TICK_FONT) {
  if (textWidth(text, font) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(text.slice(0, mid) + "…", font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + "…" : "";
}

// ----------------------------------------------------------------- тултип

const tooltip = document.createElement("div");
tooltip.className = "tooltip hidden";
document.body.appendChild(tooltip);

function showTip(event, title, rows) {
  tooltip.innerHTML =
    `<div class="t-title">${escapeHtml(title)}</div>` +
    rows.map(([label, value]) =>
      `<div class="t-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("");
  tooltip.classList.remove("hidden");
  moveTip(event);
}

function moveTip(event) {
  const pad = 14;
  const box = tooltip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - pad;
  if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - pad;
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}

const hideTip = () => tooltip.classList.add("hidden");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// -------------------------------------------------------------------- графики

/** Линейный график динамики. Одна серия — легенда не нужна, её роль
 *  выполняет заголовок карточки. */
function drawLine(host, data, { width, formatX = (d) => d.label, formatValue = fmtInt }) {
  host.innerHTML = "";
  if (data.length === 0) return renderEmpty(host);

  const height = 260;
  const pad = { top: 18, right: 54, bottom: 28, left: 46 };
  const plotW = Math.max(40, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;

  const max = Math.max(...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const x = (i) => pad.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v) => pad.top + plotH - (v / top) * plotH;

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" }, host);

  for (const tick of ticks) {
    svg("line", { class: "gridline", x1: pad.left, x2: pad.left + plotW, y1: y(tick), y2: y(tick) }, root);
    svg("text", { class: "tick tick-num", x: pad.left - 8, y: y(tick) + 4, "text-anchor": "end" }, root)
      .textContent = fmtInt(tick);
  }

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join("");
  svg("path", {
    d: `${line}L${x(data.length - 1)},${pad.top + plotH}L${x(0)},${pad.top + plotH}Z`,
    fill: "var(--series-1)", opacity: 0.1,
  }, root);
  svg("path", {
    d: line, fill: "none", stroke: "var(--series-1)",
    "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
  }, root);

  // Подписи оси X — только те, что помещаются без наложения.
  const step = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 62))));
  data.forEach((d, i) => {
    if (i % step !== 0 && i !== data.length - 1) return;
    svg("text", { class: "tick", x: x(i), y: height - 8, "text-anchor": "middle" }, root)
      .textContent = formatX(d);
  });

  // Прямые подписи — только у конца и у максимума: числа у каждой точки не читаются.
  const lastIndex = data.length - 1;
  const maxIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  for (const i of new Set([lastIndex, maxIndex])) {
    const anchor = i === lastIndex && data.length > 1 ? "start" : "middle";
    // Подпись не должна вылезать за верх картинки, даже если точка у самого края.
    const labelY = Math.max(11, y(data[i].value) - (anchor === "start" ? -4 : 10));
    svg("text", {
      class: "value-label", x: x(i) + (anchor === "start" ? 10 : 0),
      y: labelY, "text-anchor": anchor,
    }, root).textContent = formatValue(data[i].value);
  }

  // Кольцо цветом поверхности: маркер остаётся читаемым поверх линии.
  svg("circle", {
    cx: x(lastIndex), cy: y(data[lastIndex].value), r: 4.5,
    fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2,
  }, root);

  svg("line", { class: "axisline", x1: pad.left, x2: pad.left + plotW,
                y1: pad.top + plotH, y2: pad.top + plotH }, root);

  // Ближайшая точка по X — попадать в 8-пиксельный маркер не требуется.
  const cursor = svg("line", {
    class: "axisline", y1: pad.top, y2: pad.top + plotH, opacity: 0,
    stroke: "var(--axis)",
  }, root);
  const overlay = svg("rect", {
    x: pad.left, y: pad.top, width: plotW, height: plotH, fill: "transparent",
  }, root);

  overlay.addEventListener("mousemove", (event) => {
    const box = root.getBoundingClientRect();
    const scale = width / box.width;
    const px = (event.clientX - box.left) * scale;
    const i = data.length === 1 ? 0
      : Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.left) / plotW) * (data.length - 1))));
    cursor.setAttribute("x1", x(i));
    cursor.setAttribute("x2", x(i));
    cursor.setAttribute("opacity", 1);
    showTip(event, data[i].label, [["Заключений", formatValue(data[i].value)]]);
  });
  overlay.addEventListener("mouseleave", () => { cursor.setAttribute("opacity", 0); hideTip(); });
}

/** Горизонтальные полосы: одна серия, значение у конца полосы. */
function drawBars(host, data, { width, formatValue = fmtInt, labelWidth = 150 }) {
  host.innerHTML = "";
  if (data.length === 0) return renderEmpty(host);

  const rowH = 30;
  const pad = { top: 6, right: 62, bottom: 6, left: labelWidth };
  const height = pad.top + pad.bottom + data.length * rowH;
  const plotW = Math.max(30, width - pad.left - pad.right);
  const max = Math.max(...data.map((d) => d.value)) || 1;

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" }, host);

  data.forEach((d, i) => {
    // Толщина ограничена 24px, остаток полосы — воздух между соседями.
    const barH = Math.min(24, rowH - 8);
    const y = pad.top + i * rowH + (rowH - barH) / 2;
    const w = Math.max(2, (d.value / max) * plotW);

    svg("text", { class: "tick", x: pad.left - 10, y: y + barH / 2 + 4, "text-anchor": "end" }, root)
      .textContent = truncateToWidth(d.name, labelWidth - 14);

    const bar = svg("path", {
      d: barPath(pad.left, y, w, barH, 4, "right"), fill: "var(--series-1)",
    }, root);

    svg("text", { class: "value-label", x: pad.left + w + 8, y: y + barH / 2 + 4 }, root)
      .textContent = formatValue(d.value);

    const hit = svg("rect", {
      x: pad.left, y: pad.top + i * rowH, width: plotW + pad.right - 8, height: rowH, fill: "transparent",
    }, root);
    const enter = (event) => showTip(event, d.name, [["Заключений", formatValue(d.value)]]);
    hit.addEventListener("mouseenter", enter);
    hit.addEventListener("mousemove", moveTip);
    hit.addEventListener("mouseleave", hideTip);
    bar.addEventListener("mouseenter", enter);
  });

  svg("line", { class: "axisline", x1: pad.left, x2: pad.left, y1: pad.top, y2: height - pad.bottom }, root);
}

/** Стековые горизонтальные полосы: две серии, между сегментами — зазор
 *  цветом поверхности (границу вокруг сегмента не рисуем). */
function drawStacked(host, data, series, { width, labelWidth = 150 }) {
  host.innerHTML = "";
  if (data.length === 0) return renderEmpty(host);

  const rowH = 32;
  const pad = { top: 6, right: 66, bottom: 6, left: labelWidth };
  const height = pad.top + pad.bottom + data.length * rowH;
  const plotW = Math.max(30, width - pad.left - pad.right);
  const max = Math.max(...data.map((d) => d.values.reduce((a, b) => a + b, 0))) || 1;
  const GAP = 2;

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" }, host);

  data.forEach((d, i) => {
    const barH = Math.min(24, rowH - 8);
    const y = pad.top + i * rowH + (rowH - barH) / 2;
    const total = d.values.reduce((a, b) => a + b, 0);

    svg("text", { class: "tick", x: pad.left - 10, y: y + barH / 2 + 4, "text-anchor": "end" }, root)
      .textContent = truncateToWidth(d.name, labelWidth - 14);

    let x = pad.left;
    d.values.forEach((value, s) => {
      if (value <= 0) return;
      const full = (value / max) * plotW;
      const last = s === d.values.length - 1 || d.values.slice(s + 1).every((v) => v <= 0);
      const w = Math.max(1, last ? full : full - GAP);
      const segment = svg("path", {
        d: barPath(x, y, w, barH, last ? 4 : 0, last ? "right" : "none"),
        fill: series[s].color,
      }, root);
      const enter = (event) => showTip(event, d.name, [
        [series[s].name, fmtInt(value)],
        ["Доля", fmtPct(total ? value / total : 0)],
        ["Всего", fmtInt(total)],
      ]);
      segment.addEventListener("mouseenter", enter);
      segment.addEventListener("mousemove", moveTip);
      segment.addEventListener("mouseleave", hideTip);
      x += full;
    });

    svg("text", { class: "value-label", x: pad.left + (total / max) * plotW + 8, y: y + barH / 2 + 4 }, root)
      .textContent = fmtInt(total);
  });

  svg("line", { class: "axisline", x1: pad.left, x2: pad.left, y1: pad.top, y2: height - pad.bottom }, root);
}

/** Вертикальные столбцы для распределения по стоимости. */
function drawColumns(host, data, { width }) {
  host.innerHTML = "";
  if (data.length === 0) return renderEmpty(host);

  // Высота задана с запасом под подписи оси X — иначе карточка получает
  // собственную полосу прокрутки, а подписи обрезаются.
  const height = 250;
  const pad = { top: 24, right: 12, bottom: 42, left: 46 };
  const plotW = Math.max(40, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const band = plotW / data.length;

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" }, host);

  for (const tick of ticks) {
    const y = pad.top + plotH - (tick / top) * plotH;
    svg("line", { class: "gridline", x1: pad.left, x2: pad.left + plotW, y1: y, y2: y }, root);
    svg("text", { class: "tick tick-num", x: pad.left - 8, y: y + 4, "text-anchor": "end" }, root)
      .textContent = fmtInt(tick);
  }

  data.forEach((d, i) => {
    const barW = Math.min(24, band - 10);
    const x = pad.left + i * band + (band - barW) / 2;
    const h = Math.max(2, (d.value / top) * plotH);
    const y = pad.top + plotH - h;

    const bar = svg("path", { d: barPath(x, y, barW, h, 4, "top"), fill: "var(--series-1)" }, root);
    svg("text", { class: "value-label", x: x + barW / 2, y: y - 7, "text-anchor": "middle" }, root)
      .textContent = fmtInt(d.value);
    svg("text", { class: "tick", x: pad.left + i * band + band / 2, y: height - 14, "text-anchor": "middle" }, root)
      .textContent = d.short || d.name;

    const hit = svg("rect", { x: pad.left + i * band, y: pad.top, width: band, height: plotH, fill: "transparent" }, root);
    const enter = (event) => showTip(event, d.name, [["Заключений", fmtInt(d.value)]]);
    hit.addEventListener("mouseenter", enter);
    hit.addEventListener("mousemove", moveTip);
    hit.addEventListener("mouseleave", hideTip);
    bar.addEventListener("mouseenter", enter);
  });

  svg("line", { class: "axisline", x1: pad.left, x2: pad.left + plotW,
                y1: pad.top + plotH, y2: pad.top + plotH }, root);
}

function renderEmpty(host) {
  host.innerHTML = `<div class="empty">Нет данных для выбранного среза</div>`;
}

// ------------------------------------------------------- карточка с графиком

/** Карточка = график + таблица-двойник. Таблица — не «дополнительно», а
 *  доступная копия: любое значение читается без наведения и без цвета. */
function chartCard({ id, title, hint, legend, draw, table }) {
  const host = el(id);
  if (!host) return;
  const chart = host.querySelector(".chart");
  const tableWrap = host.querySelector(".table-wrap");
  const legendHost = host.querySelector(".legend");

  if (legendHost) {
    legendHost.innerHTML = (legend || []).map((item) =>
      `<span class="legend-item"><span class="legend-swatch" style="background:${item.color}"></span>${escapeHtml(item.name)}</span>`
    ).join("");
    legendHost.classList.toggle("hidden", !legend || legend.length === 0);
  }

  const width = Math.max(280, chart.clientWidth || host.clientWidth - 40);
  draw(chart, width);
  tableWrap.innerHTML = table();
}

function tableHtml(headers, rows) {
  if (rows.length === 0) return `<div class="empty">Нет данных</div>`;
  return `<table><thead><tr>${headers.map((h, i) =>
    `<th class="${i === 0 ? "" : "num"}">${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>` +
    rows.map((row) => `<tr>${row.map((cell, i) =>
      `<td class="${i === 0 ? "" : "num"}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") +
    `</tbody></table>`;
}

// -------------------------------------------------------------------- рендер

let renderScheduled = false;

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => { renderScheduled = false; render(); });
}

function render() {
  const rows = select(null);
  const stats = aggregate(rows);

  renderHeader(stats, rows);
  renderFacets();
  renderChips();
  renderCharts(stats, rows);
  renderTable(rows);
  writeUrl();
}

function renderHeader(stats, rows) {
  el("hero-value").textContent = fmtInt(stats.total);
  el("hero-caption").textContent = activeFilterCount()
    ? `отфильтровано из ${fmtInt(DS.rows.length)}`
    : `все записи витрины`;

  // Окно в 30 дней считаем от последней даты в срезе, а не от «сегодня»:
  // реестр пополняется с задержкой, и привязка к системной дате давала бы ноль.
  const dates = [];
  for (const i of rows) {
    const date = DS.rows[i][DS.dateIdx];
    if (date) dates.push(date);
  }
  dates.sort();
  const anchor = dates.length ? dates[dates.length - 1] : null;
  let last30 = 0, prev30 = 0;
  if (anchor) {
    const anchorDate = new Date(anchor);
    const back = (days) => new Date(anchorDate.getTime() - days * 864e5).toISOString().slice(0, 10);
    const d30 = back(30), d60 = back(60);
    for (const date of dates) {
      if (date > d30) last30++;
      else if (date > d60) prev30++;
    }
  }

  el("kpi-recent").textContent = fmtInt(last30);
  const deltaHost = el("kpi-recent-delta");
  if (prev30 > 0) {
    const change = (last30 - prev30) / prev30;
    deltaHost.textContent = `${change >= 0 ? "+" : "−"}${fmtPct(Math.abs(change))} к предыдущим 30 дням`;
    deltaHost.className = `delta ${change >= 0 ? "up" : "down"}`;
  } else {
    deltaHost.textContent = "нет базы для сравнения";
    deltaHost.className = "delta";
  }

  el("kpi-positive").textContent = fmtPct(stats.positiveShare);
  el("kpi-positive-delta").textContent =
    `${fmtInt(stats.positive)} положительных · ${fmtInt(stats.negative)} отрицательных`;
  el("kpi-cost").textContent = fmtMoney(stats.costMedian);
  el("kpi-cost-delta").textContent = `сумма по срезу ${fmtMoney(stats.costSum)}`;
  el("kpi-orgs").textContent = fmtInt(stats.orgCount);
  el("kpi-orgs-delta").textContent = anchor ? `последняя запись ${fmtDate(anchor)}` : "";
}

function renderCharts(stats, rows) {
  const monthList = toList(stats.byMonth, "month", { sort: "key" })
    .map((d) => ({ ...d, label: fmtMonth(d.name) }));

  chartCard({
    id: "card-dynamics",
    draw: (host, width) => drawLine(host, monthList, { width, formatX: (d) => d.label }),
    table: () => tableHtml(["Месяц", "Заключений"],
      monthList.map((d) => [d.label, fmtInt(d.value)])),
  });

  const regions = toList(stats.byRegion, "region", { limit: 15 });
  chartCard({
    id: "card-regions",
    draw: (host, width) => drawBars(host, regions, { width, labelWidth: 168 }),
    table: () => tableHtml(["Субъект РФ", "Заключений", "Доля"],
      toList(stats.byRegion, "region").map((d) =>
        [d.name, fmtInt(d.value), fmtPct(stats.total ? d.value / stats.total : 0)])),
  });

  const categories = toList(stats.byCategory, "object_category");
  chartCard({
    id: "card-categories",
    draw: (host, width) => drawBars(host, categories, { width, labelWidth: 160 }),
    table: () => tableHtml(["Категория", "Заключений", "Доля"],
      categories.map((d) => [d.name, fmtInt(d.value), fmtPct(stats.total ? d.value / stats.total : 0)])),
  });

  const districtDict = DS.dict.federal_district || [];
  const districts = [...stats.byDistrict.entries()]
    .map(([key, values]) => ({ name: districtDict[key] ?? "—", values }))
    .sort((a, b) => (b.values[0] + b.values[1]) - (a.values[0] + a.values[1]));
  const series = [
    { name: "Государственная", color: "var(--series-1)" },
    { name: "Негосударственная", color: "var(--series-2)" },
  ];
  chartCard({
    id: "card-districts",
    legend: series,
    draw: (host, width) => drawStacked(host, districts, series, { width, labelWidth: 150 }),
    table: () => tableHtml(["Федеральный округ", "Государственная", "Негосударственная", "Всего"],
      districts.map((d) => [d.name, fmtInt(d.values[0]), fmtInt(d.values[1]),
                            fmtInt(d.values[0] + d.values[1])])),
  });

  const BUCKET_ORDER = ["до 10 млн ₽", "10–50 млн ₽", "50–100 млн ₽", "100–500 млн ₽",
                        "0,5–1 млрд ₽", "1–5 млрд ₽", "свыше 5 млрд ₽", "Не указана"];
  const SHORT = { "до 10 млн ₽": "<10 млн", "10–50 млн ₽": "10–50", "50–100 млн ₽": "50–100",
                  "100–500 млн ₽": "100–500", "0,5–1 млрд ₽": "0,5–1 млрд", "1–5 млрд ₽": "1–5 млрд",
                  "свыше 5 млрд ₽": ">5 млрд", "Не указана": "н/д" };
  const buckets = toList(stats.byBucket, "cost_bucket")
    .sort((a, b) => BUCKET_ORDER.indexOf(a.name) - BUCKET_ORDER.indexOf(b.name))
    .map((d) => ({ ...d, short: SHORT[d.name] || d.name }));
  chartCard({
    id: "card-cost",
    draw: (host, width) => drawColumns(host, buckets, { width }),
    table: () => tableHtml(["Диапазон стоимости", "Заключений", "Доля"],
      buckets.map((d) => [d.name, fmtInt(d.value), fmtPct(stats.total ? d.value / stats.total : 0)])),
  });

  const orgs = toList(stats.byOrg, "organization", { limit: 12 });
  chartCard({
    id: "card-orgs",
    draw: (host, width) => drawBars(host, orgs, { width, labelWidth: 210 }),
    table: () => tableHtml(["Организация", "Заключений", "Доля"],
      toList(stats.byOrg, "organization", { limit: 60 }).map((d) =>
        [d.name, fmtInt(d.value), fmtPct(stats.total ? d.value / stats.total : 0)])),
  });

  const developers = toList(stats.byDeveloper, "developer", { limit: 12 });
  chartCard({
    id: "card-developers",
    draw: (host, width) => drawBars(host, developers, { width, labelWidth: 210 }),
    table: () => tableHtml(["Застройщик", "Заключений", "Доля"],
      toList(stats.byDeveloper, "developer", { limit: 60 }).map((d) =>
        [d.name, fmtInt(d.value), fmtPct(stats.total ? d.value / stats.total : 0)])),
  });
}

// ------------------------------------------------------------------- фасеты

const facetExpanded = {};
const facetQuery = {};

function renderFacets() {
  const counts = facetCounts();
  const host = el("facets");
  host.innerHTML = "";

  for (const name of DS.facetColumns) {
    const dict = DS.dict[name] || [];
    const selected = STATE.facets[name] || new Set();
    const query = (facetQuery[name] || "").toLowerCase();

    let items = [...counts[name].entries()]
      .map(([key, count]) => ({ key, name: dict[key] ?? "—", count }));
    // Выбранные значения показываем всегда, даже если в текущем срезе их ноль.
    for (const key of selected) {
      if (!items.some((item) => item.key === key)) {
        items.push({ key, name: dict[key] ?? "—", count: 0 });
      }
    }
    if (query) items = items.filter((item) => item.name.toLowerCase().includes(query));
    items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));

    const expanded = facetExpanded[name];
    const visible = expanded ? items : items.slice(0, 8);

    const details = document.createElement("details");
    details.className = "facet";
    details.open = selected.size > 0 || ["federal_district", "expertise_type", "result"].includes(name);

    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${escapeHtml(FACET_TITLES[name] || name)}</span>` +
      `<span class="count">${selected.size ? `${selected.size} из ${items.length}` : items.length}</span>`;
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "facet-body";

    if (SEARCHABLE_FACETS.has(name)) {
      const search = document.createElement("input");
      search.className = "facet-search";
      search.type = "search";
      search.placeholder = "Поиск…";
      search.value = facetQuery[name] || "";
      search.addEventListener("input", () => {
        facetQuery[name] = search.value;
        renderFacets();
        // Перерисовка списка забирает фокус — возвращаем его в то же поле.
        const next = el("facets").querySelector(`[data-facet-search="${name}"]`);
        if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
      });
      search.setAttribute("data-facet-search", name);
      body.appendChild(search);
    }

    const list = document.createElement("div");
    list.className = "facet-list";
    for (const item of visible) {
      const label = document.createElement("label");
      const on = selected.has(item.key);
      label.className = `facet-item${item.count === 0 ? " zero" : ""}${on ? " on" : ""}`;
      label.innerHTML =
        `<input type="checkbox"${on ? " checked" : ""}>` +
        `<span class="name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>` +
        `<span class="n">${fmtInt(item.count)}</span>`;
      label.querySelector("input").addEventListener("change", () => toggleFacet(name, item.key));
      list.appendChild(label);
    }
    body.appendChild(list);

    if (items.length > 8) {
      const more = document.createElement("button");
      more.className = "toggle-table";
      more.style.marginTop = "8px";
      more.textContent = expanded ? "Свернуть" : `Показать все (${items.length})`;
      more.addEventListener("click", () => { facetExpanded[name] = !expanded; renderFacets(); });
      body.appendChild(more);
    }

    details.appendChild(body);
    host.appendChild(details);
  }
}

function toggleFacet(name, key) {
  const set = STATE.facets[name] || (STATE.facets[name] = new Set());
  if (set.has(key)) set.delete(key);
  else set.add(key);
  if (set.size === 0) delete STATE.facets[name];
  scheduleRender();
}

function renderChips() {
  const host = el("chips");
  const chips = [];

  if (STATE.q) chips.push({ label: `Поиск: «${STATE.q}»`, clear: () => { STATE.q = ""; el("search").value = ""; } });
  if (STATE.from || STATE.to) {
    chips.push({
      label: `Период: ${STATE.from ? fmtDate(STATE.from) : "…"} — ${STATE.to ? fmtDate(STATE.to) : "…"}`,
      clear: () => { STATE.from = ""; STATE.to = ""; el("date-from").value = ""; el("date-to").value = ""; },
    });
  }
  for (const name in STATE.facets) {
    const dict = DS.dict[name] || [];
    for (const key of STATE.facets[name]) {
      chips.push({
        label: `${FACET_TITLES[name] || name}: ${dict[key] ?? "—"}`,
        clear: () => toggleFacet(name, key),
      });
    }
  }

  host.innerHTML = "";
  host.classList.toggle("hidden", chips.length === 0);
  for (const chip of chips) {
    const node = document.createElement("span");
    node.className = "chip";
    node.innerHTML = `<span>${escapeHtml(chip.label)}</span><button title="Убрать">×</button>`;
    node.querySelector("button").addEventListener("click", () => { chip.clear(); scheduleRender(); });
    host.appendChild(node);
  }
  if (chips.length > 1) {
    const reset = document.createElement("button");
    reset.className = "chip";
    reset.style.cursor = "pointer";
    reset.textContent = "Сбросить всё";
    reset.addEventListener("click", resetFilters);
    host.appendChild(reset);
  }
}

function resetFilters() {
  STATE.q = "";
  STATE.from = "";
  STATE.to = "";
  STATE.facets = {};
  el("search").value = "";
  el("date-from").value = "";
  el("date-to").value = "";
  document.querySelectorAll(".presets .btn").forEach((b) => b.setAttribute("aria-pressed", "false"));
  scheduleRender();
}

// ------------------------------------------------------------ таблица записей

const TABLE_COLUMNS = [
  { key: "date_registered", title: "Включено в реестр", format: fmtDate },
  { key: "conclusion_number", title: "Номер" },
  { key: "object_name", title: "Объект", wrap: true },
  { key: "region", title: "Субъект РФ" },
  { key: "object_category", title: "Категория" },
  { key: "expertise_type", title: "Тип" },
  { key: "result", title: "Результат" },
  { key: "organization", title: "Организация" },
  { key: "cost", title: "Стоимость", format: fmtMoney, num: true },
];

function renderTable(rows) {
  const { column, dir } = STATE.sort;
  const idx = DS.index[column];
  const dict = DS.dict[column];
  const sorted = [...rows].sort((a, b) => {
    let x = DS.rows[a][idx];
    let y = DS.rows[b][idx];
    if (dict) { x = dict[x] ?? ""; y = dict[y] ?? ""; }
    if (x == null) return 1;
    if (y == null) return -1;
    const cmp = typeof x === "number" && typeof y === "number"
      ? x - y : String(x).localeCompare(String(y), "ru");
    return dir === "asc" ? cmp : -cmp;
  });

  const slice = sorted.slice(0, STATE.tableLimit);
  const head = TABLE_COLUMNS.map((c) => {
    const active = c.key === column;
    const arrow = active ? (dir === "asc" ? " ↑" : " ↓") : "";
    return `<th class="${c.num ? "num" : ""}" data-sort="${c.key}" style="cursor:pointer">${escapeHtml(c.title)}${arrow}</th>`;
  }).join("");

  const body = slice.map((i) => {
    const row = DS.rows[i];
    const url = val(row, "source_url");
    return "<tr>" + TABLE_COLUMNS.map((c) => {
      const raw = val(row, c.key);
      let text = c.format ? c.format(raw) : (raw ?? "—");
      if (text === "" || text == null) text = "—";
      let cell = escapeHtml(text);
      if (c.key === "object_name" && url) {
        cell = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${cell}</a>`;
      }
      return `<td class="${c.num ? "num" : ""}${c.wrap ? " wrap" : ""}">${cell}</td>`;
    }).join("") + "</tr>";
  }).join("");

  el("records").innerHTML = slice.length
    ? `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    : `<div class="empty">Ничего не найдено — ослабьте фильтры</div>`;

  el("records").querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      STATE.sort = key === STATE.sort.column
        ? { column: key, dir: STATE.sort.dir === "asc" ? "desc" : "asc" }
        : { column: key, dir: "desc" };
      scheduleRender();
    });
  });

  el("records-note").textContent = rows.length
    ? `Показано ${fmtInt(slice.length)} из ${fmtInt(rows.length)}`
    : "";
  el("records-more").classList.toggle("hidden", slice.length >= rows.length);
}

// ---------------------------------------------------------- состояние в URL

function writeUrl() {
  const params = new URLSearchParams();
  if (STATE.q) params.set("q", STATE.q);
  if (STATE.from) params.set("from", STATE.from);
  if (STATE.to) params.set("to", STATE.to);
  for (const name in STATE.facets) {
    const dict = DS.dict[name] || [];
    const values = [...STATE.facets[name]].map((key) => dict[key]).filter(Boolean);
    if (values.length) params.set(name, values.join("~"));
  }
  const query = params.toString();
  history.replaceState(null, "", query ? `#${query}` : location.pathname);
}

function readUrl() {
  const raw = location.hash.slice(1);
  if (!raw) return;
  const params = new URLSearchParams(raw);
  STATE.q = (params.get("q") || "").toLowerCase();
  STATE.from = params.get("from") || "";
  STATE.to = params.get("to") || "";
  for (const name of DS.facetColumns) {
    const value = params.get(name);
    if (!value) continue;
    const dict = DS.dict[name] || [];
    const set = new Set();
    for (const label of value.split("~")) {
      const key = dict.indexOf(label);
      if (key >= 0) set.add(key);
    }
    if (set.size) STATE.facets[name] = set;
  }
  el("search").value = STATE.q;
  el("date-from").value = STATE.from;
  el("date-to").value = STATE.to;
}

// -------------------------------------------------------------------- запуск

function bindControls() {
  let searchTimer;
  el("search").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    // Задержка: без неё каждая буква запускает полный пересчёт фасетов.
    searchTimer = setTimeout(() => {
      STATE.q = event.target.value.trim().toLowerCase();
      scheduleRender();
    }, 180);
  });

  el("date-from").addEventListener("change", (e) => { STATE.from = e.target.value; scheduleRender(); });
  el("date-to").addEventListener("change", (e) => { STATE.to = e.target.value; scheduleRender(); });

  document.querySelectorAll(".presets .btn").forEach((button) => {
    button.addEventListener("click", () => {
      const days = button.dataset.days;
      document.querySelectorAll(".presets .btn").forEach((b) => b.setAttribute("aria-pressed", "false"));
      if (days === "all") {
        STATE.from = ""; STATE.to = "";
      } else {
        STATE.from = shiftDays(Number(days));
        STATE.to = "";
        button.setAttribute("aria-pressed", "true");
      }
      el("date-from").value = STATE.from;
      el("date-to").value = STATE.to;
      scheduleRender();
    });
  });

  el("records-more").addEventListener("click", () => {
    STATE.tableLimit += 200;
    scheduleRender();
  });

  document.querySelectorAll(".toggle-table[data-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = el(button.dataset.target);
      const chart = card.querySelector(".chart");
      const table = card.querySelector(".table-wrap");
      const showTable = chart.classList.toggle("hidden");
      table.classList.toggle("hidden", !showTable);
      button.textContent = showTable ? "График" : "Таблица";
      const legend = card.querySelector(".legend");
      if (legend && legend.children.length) legend.classList.toggle("hidden", showTable);
    });
  });

  el("theme").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("egrz-theme", next);
    scheduleRender();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(scheduleRender, 150);
  });
}

function applyStoredTheme() {
  const stored = localStorage.getItem("egrz-theme");
  if (stored) document.documentElement.setAttribute("data-theme", stored);
}

async function main() {
  applyStoredTheme();
  try {
    await load();
  } catch (error) {
    // Ошибку нужно реально показать, а не просто записать в скрытый #app —
    // иначе #loading («Загрузка данных…») так и останется висеть вечно,
    // и от реальной причины не останется и следа на экране.
    el("loading").classList.add("hidden");
    el("app").classList.remove("hidden");
    el("app").innerHTML =
      `<div class="error"><b>Не удалось загрузить витрину.</b><br>` +
      `Соберите её командой <code>egrz export</code> на сервере (данные в базе есть, ` +
      `но витрина для дашборда собирается отдельным шагом) и обновите страницу.` +
      `<code>${escapeHtml(error.message)}</code></div>`;
    return;
  }

  el("loading").classList.add("hidden");
  el("app").classList.remove("hidden");

  const generated = DS.meta?.generated_at || DS.generatedAt;
  el("meta-line").textContent =
    `${fmtInt(DS.rows.length)} записей` +
    (DS.truncated ? ` (свежих из ${fmtInt(DS.totalInStore)})` : "") +
    (generated ? ` · обновлено ${fmtDate(generated.slice(0, 10))}` : "");

  readUrl();
  bindControls();
  render();
}

main();
