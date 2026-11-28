import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { SessionUser } from '../auth/auth.service';

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
 * Admin only (module start/stop, blocking devices, the hotspot, deleting
 * shared data, pinning posts, managing accounts): the CSRF header and a
 * logged-in admin. USER comes from @CurrentUser().
 */
export function assertControl(piMonitor: string | undefined, user: SessionUser | undefined): void {
  assertCsrf(piMonitor);
  if (!user) throw new UnauthorizedException('Log in first.');
  if (user.role !== 'admin') throw new ForbiddenException('Only an admin can do this.');
}

/** Admin only, for reads (no CSRF header on a GET). */
export function assertAdmin(user: SessionUser | undefined): void {
  if (!user) throw new UnauthorizedException('Log in first.');
  if (user.role !== 'admin') throw new ForbiddenException('Only an admin can do this.');
}
