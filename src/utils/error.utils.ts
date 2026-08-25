import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

type Err = 400 | 401 | 403 | 404 | 409 | 500;

// Central place to map a status code to the right Nest exception class,
// instead of importing/throwing a different XxxException in every service.
export function bad(message: string, err: Err = 400): never {
  if (err === 500) throw new InternalServerErrorException(message);
  if (err === 401) throw new UnauthorizedException(message);
  if (err === 403) throw new ForbiddenException(message);
  if (err === 404) throw new NotFoundException(message);
  if (err === 409) throw new ConflictException(message);
  else throw new BadRequestException(message);
}

export function mustHave(
  value: unknown,
  message: string,
  err: Err = 400,
): asserts value {
  if (!value) bad(message, err);
}
