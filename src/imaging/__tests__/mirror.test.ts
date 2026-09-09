import {shouldFlip} from '../mirror';

describe('shouldFlip', () => {
  it('кадр уже зеркальный и таким и нужен — не трогаем', () => {
    // Обычный случай фронтальной камеры: VisionCamera отразила снимок сама.
    // Повторное отражение вернуло бы незеркальную картинку, то есть
    // настройка «печатать зеркально» сработала бы наоборот.
    expect(
      shouldFlip({fromCamera: true, fileIsMirrored: true, wantMirrored: true}),
    ).toBe(false);
  });

  it('кадр зеркальный, а нужен обычный — отражаем', () => {
    expect(
      shouldFlip({fromCamera: true, fileIsMirrored: true, wantMirrored: false}),
    ).toBe(true);
  });

  it('кадр обычный, а нужен зеркальный — отражаем', () => {
    // Основная камера: VisionCamera вывод не зеркалит.
    expect(
      shouldFlip({fromCamera: true, fileIsMirrored: false, wantMirrored: true}),
    ).toBe(true);
  });

  it('кадр обычный и таким и нужен — не трогаем', () => {
    expect(
      shouldFlip({fromCamera: true, fileIsMirrored: false, wantMirrored: false}),
    ).toBe(false);
  });

  it('снимок из галереи не отражается никогда', () => {
    for (const fileIsMirrored of [true, false]) {
      for (const wantMirrored of [true, false]) {
        expect(shouldFlip({fromCamera: false, fileIsMirrored, wantMirrored})).toBe(false);
      }
    }
  });

  it('результат зависит только от расхождения желаемого и фактического', () => {
    for (const fileIsMirrored of [true, false]) {
      for (const wantMirrored of [true, false]) {
        expect(shouldFlip({fromCamera: true, fileIsMirrored, wantMirrored})).toBe(
          fileIsMirrored !== wantMirrored,
        );
      }
    }
  });
});
