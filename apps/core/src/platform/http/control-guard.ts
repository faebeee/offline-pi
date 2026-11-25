import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * The checks every state-changing control action needs (module start/stop,
 * blocking a device): the X-Pi-Monitor header, so another site can't
 * trigger it with a simple form post (CSRF), and CONTROL_PIN when set.
 * The web app's fetcher sends both (packages/api-client/src/fetcher.ts).
 */
export function assertControl(piMonitor: string | undefined, pin: string | undefined): void {
  if (piMonitor !== '1') throw new BadRequestException('missing X-Pi-Monitor header');
  const required = process.env.CONTROL_PIN;
  if (required && pin !== required) throw new ForbiddenException('wrong or missing Control PIN');
}
