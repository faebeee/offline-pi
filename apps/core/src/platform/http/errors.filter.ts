import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';

/**
 * Nest's default error handling, plus Retry-After on 503 (a module that is
 * not running) and on upstream rate limits, so clients can back off.
 */
@Catch()
export class ErrorsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException && host.getType() === 'http') {
      const status = exception.getStatus();
      const res = host.switchToHttp().getResponse<Response>();
      const retry = (exception as HttpException & { retryAfter?: string }).retryAfter;
      if (retry) res.setHeader('Retry-After', retry);
      else if (status === HttpStatus.SERVICE_UNAVAILABLE) res.setHeader('Retry-After', '5');
    }
    super.catch(exception, host);
  }
}
