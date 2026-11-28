import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './auth.service';

/** The logged-in user of the request (authMiddleware sets it; never missing behind the login). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser | undefined => {
  return ctx.switchToHttp().getRequest<Request>().user;
});
