import type {SessionState} from '../../features/session/machine';
import {scrimOpacity, screenBackground, showsCameraBehind} from '../layers';

type ScreenName = SessionState['name'];

const ALL: ScreenName[] = [
  'attract',
  'chooseLayout',
  'getReady',
  'countdown',
  'capturing',
  'betweenShots',
  'review',
  'printing',
  'thanks',
  'error',
];

describe('showsCameraBehind', () => {
  it('заставка показывает живое превью — на этом держится вся идея будки', () => {
    expect(showsCameraBehind('attract')).toBe(true);
  });

  it('все шаги съёмки показывают превью', () => {
    for (const screen of ['getReady', 'countdown', 'capturing', 'betweenShots'] as const) {
      expect(showsCameraBehind(screen)).toBe(true);
    }
  });

  it('экраны с собственным содержимым превью не показывают', () => {
    for (const screen of ['chooseLayout', 'review', 'printing', 'thanks', 'error'] as const) {
      expect(showsCameraBehind(screen)).toBe(false);
    }
  });
});

describe('screenBackground', () => {
  it('экран поверх камеры обязан быть прозрачным', () => {
    // Именно этого не хватало: заставка закрывала камеру непрозрачным фоном,
    // и превью не было видно никогда.
    expect(screenBackground('attract')).toBe('transparent');
    expect(screenBackground('countdown')).toBe('transparent');
  });

  it('остальные экраны берут фон по умолчанию', () => {
    expect(screenBackground('review')).toBeUndefined();
    expect(screenBackground('thanks')).toBeUndefined();
  });

  it('прозрачность и показ камеры не расходятся между собой', () => {
    for (const screen of ALL) {
      const transparent = screenBackground(screen) === 'transparent';
      expect(transparent).toBe(showsCameraBehind(screen));
    }
  });
});

describe('scrimOpacity', () => {
  it('на заставке затемнение сильное — поверх идёт крупный текст', () => {
    expect(scrimOpacity('attract')).toBeCloseTo(0.55, 2);
  });

  it('на съёмке затемнения почти нет — гость должен себя видеть', () => {
    expect(scrimOpacity('countdown')).toBeLessThanOrEqual(0.2);
    expect(scrimOpacity('capturing')).toBeLessThanOrEqual(0.2);
  });

  it('там, где камеры не видно, заливка непрозрачная', () => {
    for (const screen of ['chooseLayout', 'review', 'printing', 'thanks', 'error'] as const) {
      expect(scrimOpacity(screen)).toBe(1);
    }
  });

  it('нигде не выходит за границы 0..1', () => {
    for (const screen of ALL) {
      expect(scrimOpacity(screen)).toBeGreaterThanOrEqual(0);
      expect(scrimOpacity(screen)).toBeLessThanOrEqual(1);
    }
  });

  it('экран с превью никогда не закрашивается полностью', () => {
    for (const screen of ALL) {
      if (showsCameraBehind(screen)) {
        expect(scrimOpacity(screen)).toBeLessThan(1);
      }
    }
  });
});
