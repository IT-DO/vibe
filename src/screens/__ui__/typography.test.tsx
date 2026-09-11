/**
 * Типографика экранов гостя.
 *
 * Подмена шрифта — самая незаметная поломка в приложении: Android при
 * отсутствии семейства молча рисует системным гротеском, ошибки нет, тесты
 * зелёные, а будка выглядит как форма подачи заявления. Поэтому начертания
 * закреплены здесь: не «красиво ли», а «тот ли шрифт назначен».
 */

import React from 'react';
import {StyleSheet} from 'react-native';
import {render, screen} from '@testing-library/react-native';

import {AttractScreen} from '../AttractScreen';
import {CaptureScreen} from '../CaptureScreen';
import {ReviewScreen} from '../ReviewScreen';
import {ThanksScreen} from '../ThanksScreen';
import {BigButton} from '../../components/BigButton';
import {fontFamily} from '../../theme/fonts';

/** Семейство шрифта у найденного по тексту узла. */
function familyOf(matcher: string | RegExp): string | undefined {
  return StyleSheet.flatten(screen.getByText(matcher).props.style)?.fontFamily;
}

/** Начертание у найденного узла — оно должно отсутствовать у своих шрифтов. */
function weightOf(matcher: string | RegExp): string | number | undefined {
  return StyleSheet.flatten(screen.getByText(matcher).props.style)?.fontWeight;
}

const attract = {
  locale: 'ru' as const,
  title: 'Свадьба Ани и Пети',
  subtitle: '12 сентября 2026',
  logoPath: '',
  accent: '#FF5A5F',
  printerHealth: 'ready' as const,
  queueLength: 0,
  printerMissing: false,
  onStart: jest.fn(),
  onSecretHold: jest.fn(),
  onToggleLocale: jest.fn(),
  onSetUpPrinter: jest.fn(),
  onPickPhoto: jest.fn(),
};

describe('заставка', () => {
  it('название мероприятия набрано антиквой', () => {
    // Название видно с другого конца зала — оно должно читаться как афиша.
    render(<AttractScreen {...attract} />);
    expect(familyOf('Свадьба Ани и Пети')).toBe(fontFamily.display);
  });

  it('призыв набран рукописной вывеской', () => {
    render(<AttractScreen {...attract} />);
    expect(familyOf(/Нажмите, чтобы/)).toBe(fontFamily.script);
  });

  it('подзаголовок — та же антиква обычного начертания', () => {
    render(<AttractScreen {...attract} />);
    expect(familyOf('12 сентября 2026')).toBe(fontFamily.displayRegular);
  });

  it('поверх своего шрифта не навешивается синтетическая жирность', () => {
    // Android «утолщает» готовое жирное начертание сам, и буквы плывут.
    render(<AttractScreen {...attract} />);
    expect(weightOf('Свадьба Ани и Пети')).toBeUndefined();
    expect(weightOf(/Нажмите, чтобы/)).toBeUndefined();
  });
});

describe('съёмка', () => {
  it('«приготовьтесь» — рукописным', () => {
    render(
      <CaptureScreen
        locale="ru"
        accent="#FF5A5F"
        phase={{kind: 'getReady', totalShots: 1}}
        onCancel={jest.fn()}
      />,
    );
    expect(familyOf('Приготовьтесь!')).toBe(fontFamily.script);
  });

  it('цифры отсчёта — антиквой: рукописный на таком кегле расплывается', () => {
    render(
      <CaptureScreen
        locale="ru"
        accent="#FF5A5F"
        phase={{kind: 'countdown', secondsLeft: 3, shot: 0, totalShots: 1}}
        onCancel={jest.fn()}
      />,
    );
    expect(familyOf('3')).toBe(fontFamily.display);
  });
});

describe('просмотр и благодарность', () => {
  it('«как вам?» — рукописным', () => {
    render(
      <ReviewScreen
        locale="ru"
        accent="#FF5A5F"
        previewUri={null}
        secondsLeft={10}
        allowRetake
        fromGallery={false}
        busy={false}
        onPrint={jest.fn()}
        onRetake={jest.fn()}
      />,
    );
    expect(familyOf('Как вам?')).toBe(fontFamily.script);
  });

  it('«спасибо!» — рукописным: это последнее, что человек уносит', () => {
    render(
      <ThanksScreen
        locale="ru"
        accent="#FF5A5F"
        queuePosition={1}
        waitSeconds={45}
        digitalCopyUrl=""
        onDismiss={jest.fn()}
      />,
    );
    expect(familyOf('Спасибо!')).toBe(fontFamily.script);
  });

  it('указание идти к принтеру — антиквой, его читают, а не любуются им', () => {
    render(
      <ThanksScreen
        locale="ru"
        accent="#FF5A5F"
        queuePosition={1}
        waitSeconds={45}
        digitalCopyUrl=""
        onDismiss={jest.fn()}
      />,
    );
    expect(familyOf('Заберите фотографию из принтера')).toBe(fontFamily.displayRegular);
  });
});

describe('кнопки', () => {
  it('подпись кнопки набрана антиквой', () => {
    render(<BigButton label="Печатать" onPress={jest.fn()} />);
    expect(familyOf('Печатать')).toBe(fontFamily.display);
  });

  it('без синтетической жирности поверх жирного начертания', () => {
    render(<BigButton label="Печатать" onPress={jest.fn()} />);
    expect(weightOf('Печатать')).toBeUndefined();
  });
});

describe('английский интерфейс', () => {
  it('шрифты те же — латиница есть в обоих', () => {
    render(<AttractScreen {...attract} locale="en" />);
    expect(familyOf(/Tap to take a photo/)).toBe(fontFamily.script);
  });
});
