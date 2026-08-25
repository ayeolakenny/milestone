import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { bad, mustHave } from './error.utils';

describe('bad', () => {
  it.each([
    [400, BadRequestException],
    [401, UnauthorizedException],
    [403, ForbiddenException],
    [404, NotFoundException],
    [409, ConflictException],
    [500, InternalServerErrorException],
  ] as const)('throws %s -> %p', (code, ExceptionClass) => {
    expect(() => bad('message', code)).toThrow(ExceptionClass);
  });

  it('defaults to 400 BadRequestException when no code is given', () => {
    expect(() => bad('message')).toThrow(BadRequestException);
  });

  it('uses the given message', () => {
    expect(() => bad('custom message', 404)).toThrow('custom message');
  });
});

describe('mustHave', () => {
  it('does not throw when the value is truthy', () => {
    expect(() => mustHave('value', 'message')).not.toThrow();
  });

  it.each([undefined, null, '', 0, false])(
    'throws for falsy value %p',
    (value) => {
      expect(() => mustHave(value, 'missing')).toThrow(BadRequestException);
    },
  );

  it('throws with the given status code', () => {
    expect(() => mustHave(null, 'missing', 404)).toThrow(NotFoundException);
  });
});
