/**
 * Пересобирает иконки приложения из `assets/icon/*.svg`.
 *
 * Иконок два набора, и это не дублирование. Начиная с Android 8 значок
 * состоит из слоёв: систему интересует передний план, а форму (круг,
 * квадрат, капля) она выбирает сама по прошивке. На версиях старше значок
 * рисуется целым изображением, и фон нужно нарисовать самим.
 *
 * Запуск:
 *
 *     npm i --no-save sharp && node tools/make-icons.js
 *
 * `sharp` намеренно не в зависимостях проекта: значки собираются раз в
 * полгода и лежат в репозитории готовыми, а пакет тяжёлый и нативный —
 * в каждой сборке CI он стоил бы времени зря.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android/app/src/main/res');

/** Плотности экрана и множитель к базовому размеру. */
const DENSITIES = {mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4};

/** Базовый размер значка в точках — тот же, что у шаблона Android. */
const LEGACY_DP = 48;

/** Адаптивный значок рисуется на холсте 108 точек. */
const ADAPTIVE_DP = 108;

async function render(svgPath, outPath, size) {
  const svg = fs.readFileSync(svgPath);
  await sharp(svg, {density: 600})
    .resize(size, size, {fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}})
    .png()
    .toFile(outPath);
}

async function main() {
  const adaptive = path.join(ROOT, 'assets/icon/camera.svg');
  const legacy = path.join(ROOT, 'assets/icon/camera-legacy.svg');

  for (const [density, scale] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${density}`);
    fs.mkdirSync(dir, {recursive: true});

    const legacySize = Math.round(LEGACY_DP * scale);
    await render(legacy, path.join(dir, 'ic_launcher.png'), legacySize);
    await render(legacy, path.join(dir, 'ic_launcher_round.png'), legacySize);

    const foregroundSize = Math.round(ADAPTIVE_DP * scale);
    await render(adaptive, path.join(dir, 'ic_launcher_foreground.png'), foregroundSize);

    console.log(`${density}: значок ${legacySize}px, передний план ${foregroundSize}px`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
