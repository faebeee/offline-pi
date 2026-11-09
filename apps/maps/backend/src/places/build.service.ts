import { Injectable } from "@nestjs/common";
import { UPSTREAM } from "../config/upstream.ts";

function stamp(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Picks which weekly Protomaps planet build to extract from. */
@Injectable()
export class PlanetBuildService {
  async exists(date: string): Promise<boolean> {
    try {
      const res = await fetch(UPSTREAM.build(date), {
        method: "HEAD",
        headers: { "User-Agent": UPSTREAM.userAgent },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Protomaps publishes a planet build each Monday. Walks back from the most
   * recent Monday until one responds, so we always pick a real build.
   */
  async latest(maxWeeksBack = 8): Promise<string> {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    // Step back to the most recent Monday (getUTCDay: 0=Sun, 1=Mon).
    const offset = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - offset);

    for (let i = 0; i < maxWeeksBack; i++) {
      const date = stamp(d);
      if (await this.exists(date)) return date;
      d.setUTCDate(d.getUTCDate() - 7);
    }
    throw new Error("could not find a published planet build on build.protomaps.com");
  }

  async resolve(requested?: string): Promise<string> {
    if (!requested || requested === "latest") return this.latest();
    if (!/^\d{8}$/.test(requested)) {
      throw new Error(`--build must be YYYYMMDD, got "${requested}"`);
    }
    if (!(await this.exists(requested))) throw new Error(`build ${requested} not found`);
    return requested;
  }
}
