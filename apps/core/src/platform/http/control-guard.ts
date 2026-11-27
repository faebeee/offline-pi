import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * The CSRF check every state-changing call needs: the X-Pi-Monitor header,
 * which another site can't send with a simple form post (and a fetch that
 * sets it needs a CORS preflight core never answers). The web app's
 * fetcher sends it on every non-GET call (packages/api-client/src/fetcher.ts).
 */
export function assertCsrf(piMonitor: string | undefined): void {
  if (piMonitor !== '1') throw new BadRequestException('missing X-Pi-Monitor header');
}

/**
 * The checks every control action needs (module start/stop, blocking a
 * device, deleting shared data): the CSRF header and CONTROL_PIN when set.
 */
export function assertControl(piMonitor: string | undefined, pin: string | undefined): void {
  assertCsrf(piMonitor);
  const required = process.env.CONTROL_PIN;
  if (required && pin !== required) throw new ForbiddenException('wrong or missing Control PIN');
}
