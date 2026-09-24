/**
 * QR-код цифровой копии.
 *
 * Рисуем модули прямоугольниками в SVG: библиотека `qrcode-generator` считает
 * только матрицу, а отрисовка остаётся нашей — так не тянем ещё одну
 * зависимость с нативной частью.
 */

import React, {useMemo} from 'react';
import {View} from 'react-native';
import Svg, {Rect} from 'react-native-svg';
import qrcode from 'qrcode-generator';

export interface QrCodeProps {
  readonly value: string;
  readonly size: number;
  readonly color?: string;
  readonly background?: string;
}

export function QrCode({
  value,
  size,
  color = '#000000',
  background = '#FFFFFF',
}: QrCodeProps) {
  const modules = useMemo(() => {
    // Тип 0 = автоподбор версии; уровень коррекции M — компромисс между
    // плотностью и устойчивостью к бликам на экране.
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const cells: {x: number; y: number}[] = [];
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (qr.isDark(y, x)) {
          cells.push({x, y});
        }
      }
    }
    return {count, cells};
  }, [value]);

  // Тихая зона по краям обязательна, иначе камеры не распознают код.
  const quiet = 2;
  const total = modules.count + quiet * 2;
  const cellSize = size / total;

  return (
    <View style={{width: size, height: size, backgroundColor: background, padding: 0}}>
      <Svg width={size} height={size}>
        <Rect x={0} y={0} width={size} height={size} fill={background} />
        {modules.cells.map(cell => (
          <Rect
            key={`${cell.x}-${cell.y}`}
            x={(cell.x + quiet) * cellSize}
            y={(cell.y + quiet) * cellSize}
            width={cellSize}
            height={cellSize}
            fill={color}
          />
        ))}
      </Svg>
    </View>
  );
}
