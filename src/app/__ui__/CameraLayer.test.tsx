/**
 * Слой камеры. Именно здесь ломалась «камера в демо-режиме не включается»:
 * без запроса разрешения в рантайме превью молча не появляется, и приложение
 * выглядит сломанным, хотя всё цело.
 */

import React from 'react';
import {Linking} from 'react-native';
import {act, fireEvent, render, screen} from '@testing-library/react-native';

import {CameraLayer, type CameraLayerHandle} from '../CameraLayer';

const setup = (props: Partial<React.ComponentProps<typeof CameraLayer>> = {}) => {
  const ref = React.createRef<CameraLayerHandle>();
  const view = render(
    <CameraLayer
      ref={ref}
      facing={props.facing ?? 'front'}
      mirrorPreview={props.mirrorPreview ?? true}
      active={props.active ?? true}
      dim={props.dim ?? 0}
    />,
  );
  return {ref, view};
};

/** Узел живого превью. */
function preview() {
  return screen.UNSAFE_root.findAllByType('Camera' as never)[0];
}

describe('камера — разрешение', () => {
  it('запрашивается само, без похода в настройки', () => {
    // Объявления в манифесте недостаточно: без запроса в рантайме камера
    // просто не включается, и никакой ошибки при этом не видно.
    globalThis.__cameraMock.hasPermission = false;
    setup();
    expect(globalThis.__cameraMock.requestPermission).toHaveBeenCalled();
  });

  it('при выданном разрешении лишний раз не спрашивается', () => {
    globalThis.__cameraMock.hasPermission = true;
    setup();
    expect(globalThis.__cameraMock.requestPermission).not.toHaveBeenCalled();
  });

  it('пока разрешения нет — объясняет, зачем оно', () => {
    globalThis.__cameraMock.hasPermission = false;
    setup();
    expect(screen.getByText('Нужен доступ к камере')).toBeTruthy();
  });

  it('после отказа даёт дорогу в настройки', async () => {
    globalThis.__cameraMock.hasPermission = false;
    globalThis.__cameraMock.requestPermission = jest.fn(async () => false);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();

    setup();
    // Ответ приходит асинхронно — дожидаемся его.
    await act(async () => {});

    fireEvent.press(screen.getByText('Открыть настройки'));
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });

  it('до ответа пользователя кнопки настроек нет', () => {
    // Диалог ещё открыт: предлагать «идите в настройки» рано и сбивает.
    globalThis.__cameraMock.hasPermission = false;
    globalThis.__cameraMock.requestPermission = jest.fn(() => new Promise<boolean>(() => {}));
    setup();
    expect(screen.queryByText('Открыть настройки')).toBeNull();
  });
});

describe('камера — устройство', () => {
  it('без камеры говорит об этом прямо', () => {
    globalThis.__cameraMock.device = undefined;
    setup({facing: 'front'});
    expect(screen.getByText('Камера не найдена')).toBeTruthy();
    expect(screen.getByText(/фронтальной камеры/)).toBeTruthy();
  });

  it('для основной камеры текст другой', () => {
    globalThis.__cameraMock.device = undefined;
    setup({facing: 'back'});
    expect(screen.getByText(/основной камеры/)).toBeTruthy();
  });

  it('заглушка не занимает центр экрана — там текст заставки', () => {
    // Поверх слоя камеры лежит прозрачная заставка со своим текстом ровно
    // посередине: центрированная заглушка налезала бы на него.
    globalThis.__cameraMock.device = undefined;
    setup();
    let node = screen.getByText('Камера не найдена').parent;
    while (node && !JSON.stringify(node.props.style ?? {}).includes('justifyContent')) {
      node = node.parent;
    }
    expect(JSON.stringify(node?.props.style)).toContain('flex-start');
  });
});

describe('камера — живое превью', () => {
  it('показывается, когда всё на месте', () => {
    setup();
    expect(preview()).toBeTruthy();
  });

  it('на заставке камера включена', () => {
    // Ради этого превью человек и подходит: он видит себя ещё на подходе.
    setup({active: true});
    expect(preview()!.props.isActive).toBe(true);
  });

  it('выключается, когда экран её не показывает', () => {
    setup({active: false});
    expect(preview()!.props.isActive).toBe(false);
  });

  it('зеркалит превью, чтобы планшет работал как зеркало', () => {
    setup({mirrorPreview: true});
    expect(JSON.stringify(preview()!.props.style)).toContain('scaleX');
  });

  it('без зеркала трансформации нет', () => {
    setup({mirrorPreview: false});
    expect(JSON.stringify(preview()!.props.style)).not.toContain('scaleX');
  });

  it('снимает так, как видно на экране, а не как наклонён телефон', () => {
    // Иначе гость наклонил устройство — и отпечаток вышел боком.
    setup();
    expect(preview()!.props.outputOrientation).toBe('preview');
  });

  it('затемнение накладывается поверх, не перехватывая касания', () => {
    setup({dim: 0.55});
    const scrim = screen.UNSAFE_root
      .findAllByProps({pointerEvents: 'none'})
      .find((node: {props: {style?: unknown}}) =>
        JSON.stringify(node.props.style).includes('rgba(11,11,16,0.55)'),
      );
    expect(scrim).toBeTruthy();
  });

  it('без затемнения лишнего слоя нет', () => {
    setup({dim: 0});
    expect(JSON.stringify(screen.toJSON())).not.toContain('rgba(11,11,16');
  });
});

describe('камера — съёмка', () => {
  it('отдаёт путь, размеры и зеркальность файла', async () => {
    const {ref} = setup();
    const photo = await ref.current!.capture();
    expect(photo).toEqual({
      path: '/tmp/снимок.jpg',
      width: 3024,
      height: 4032,
      isMirrored: true,
    });
  });

  it('не включает звук затвора и вспышку', async () => {
    // Вспышка с полуметра пересветит лица, а системный щелчок конфликтует
    // с собственным звуком отсчёта.
    const {ref} = setup();
    await ref.current!.capture();
    expect(globalThis.__cameraMock.takePhoto).toHaveBeenCalledWith(
      expect.objectContaining({flash: 'off', enableShutterSound: false}),
    );
  });

  it('без разрешения съёмка честно падает, а не отдаёт пустой кадр', async () => {
    globalThis.__cameraMock.hasPermission = false;
    const {ref} = setup();
    await expect(ref.current!.capture()).rejects.toThrow('Камера не готова');
  });

  it('готовность видна снаружи', () => {
    const {ref} = setup();
    expect(ref.current!.isReady()).toBe(true);
  });

  it('без устройства готовности нет', () => {
    globalThis.__cameraMock.device = undefined;
    const {ref} = setup();
    expect(ref.current!.isReady()).toBe(false);
  });
});
