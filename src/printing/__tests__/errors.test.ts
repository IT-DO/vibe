import {classifyError, describeError, retryDelayMs} from '../errors';
import {IppError} from '../ipp/client';
import {StatusCode} from '../ipp/constants';
import {NetworkError, TimeoutError} from '../net';

describe('classifyError', () => {
  it('сетевые сбои считает временными', () => {
    expect(classifyError(new NetworkError('обрыв'))).toBe('retry');
    expect(classifyError(new TimeoutError('нет ответа'))).toBe('retry');
  });

  it('нехватку бумаги считает поводом для паузы, а не для отказа', () => {
    expect(
      classifyError(new IppError('нет бумаги', StatusCode.ServerErrorNotAcceptingJobs)),
    ).toBe('blocked');
    expect(classifyError(new IppError('сбой', StatusCode.ServerErrorDeviceError))).toBe(
      'blocked',
    );
  });

  it('неподдерживаемый формат считает фатальным', () => {
    expect(
      classifyError(
        new IppError('нет', StatusCode.ClientErrorDocumentFormatNotSupported),
      ),
    ).toBe('fatal');
    expect(
      classifyError(new IppError('нет', StatusCode.ClientErrorRequestEntityTooLarge)),
    ).toBe('fatal');
  });

  it('занятый принтер — временная ошибка', () => {
    expect(classifyError(new IppError('занят', StatusCode.ServerErrorBusy))).toBe('retry');
  });

  it('незнакомую ошибку считает временной, чтобы не потерять кадр', () => {
    expect(classifyError(new Error('что-то пошло не так'))).toBe('retry');
    expect(classifyError('строка')).toBe('retry');
  });
});

describe('describeError', () => {
  it('достаёт текст из ошибок', () => {
    expect(describeError(new NetworkError('обрыв'))).toBe('обрыв');
    expect(describeError(new Error('ой'))).toBe('ой');
    expect(describeError('просто строка')).toBe('просто строка');
  });
});

describe('retryDelayMs', () => {
  const noJitter = () => 0.5; // ровно середина диапазона

  it('растёт экспоненциально', () => {
    expect(retryDelayMs(1, 2000, 60000, noJitter)).toBe(2000);
    expect(retryDelayMs(2, 2000, 60000, noJitter)).toBe(4000);
    expect(retryDelayMs(3, 2000, 60000, noJitter)).toBe(8000);
  });

  it('не превышает потолок', () => {
    expect(retryDelayMs(20, 2000, 60000, noJitter)).toBe(60000);
  });

  it('добавляет дрожание в пределах ±20 %', () => {
    expect(retryDelayMs(2, 2000, 60000, () => 0)).toBe(3200);
    expect(retryDelayMs(2, 2000, 60000, () => 1)).toBe(4800);
  });

  it('не уходит в минус на нулевой попытке', () => {
    expect(retryDelayMs(0, 2000, 60000, noJitter)).toBe(2000);
  });
});
