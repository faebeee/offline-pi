import { Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';

const BIN = process.env.VCGENCMD ?? 'vcgencmd';
const RETRY_MS = 60_000;

/**
 * Thin wrapper around the Raspberry Pi firmware's vcgencmd. Needs /dev/vcio
 * (passed into the container) and the video group. When it is unavailable
 * (not a Pi, device not mapped, no permission) calls resolve to null and are
 * retried once a minute instead of on every tick.
 */
export class Vcgencmd {
  private readonly logger = new Logger('vcgencmd');
  private disabledUntil = 0;
  available = false;

  async run(...args: string[]): Promise<string | null> {
    if (Date.now() < this.disabledUntil) return null;
    return new Promise((resolve) => {
      execFile(BIN, args, { timeout: 2000 }, (err, stdout, stderr) => {
        if (err) {
          // vcgencmd prints its own errors to stdout
          const msg = (stderr || stdout || err.message).trim();
          // A command the firmware doesn't support (e.g. pmic_read_adc on a
          // Pi 4) exits non-zero; that is not a reason to disable vcgencmd.
          const fatal =
            typeof err.code !== 'number' || /vcio|ermission|denied|not found/i.test(msg);
          if (!fatal) {
            resolve(null);
            return;
          }
          if (this.available || this.disabledUntil === 0) {
            this.logger.warn(
              `'${BIN} ${args.join(' ')}' failed: ${msg}. ` +
                'Voltage/throttle data from the firmware is unavailable.',
            );
          }
          this.available = false;
          this.disabledUntil = Date.now() + RETRY_MS;
          resolve(null);
          return;
        }
        if (!this.available) this.logger.log(`using ${BIN}`);
        this.available = true;
        resolve(stdout);
      });
    });
  }
}
