import type { Snapshot } from "@outpost/api-client";
import type { StripItem } from "@outpost/ui/outpost.js";
import { fmtNum, pctLevel, tempLevel, voltLevel, type Level } from "./format";

const GB = 1024 ** 3;

const tone = (lvl: Level | null): StripItem["tone"] =>
  lvl === "warning" ? "cau" : lvl === "serious" || lvl === "critical" ? "crit" : undefined;

/**
 * The host's vitals for the status strip (app/strip.tsx): NET (outgoing
 * internet), TEMP, VOLT, CPU, MEM and DISK (the root file system), most
 * important first, coloured with the System screen's thresholds.
 */
export function hostItems(s: Snapshot): StripItem[] {
  const items: StripItem[] = [];
  const net = internetItem(s);
  if (net) items.push(net);
  const t = s.temps.cpu;
  if (t != null) items.push({ label: "TEMP", value: `${fmtNum(t, 0)}°C`, tone: tone(tempLevel(t)) });

  const uv = s.power.underVoltageNow ?? s.throttle?.now.underVoltage ?? false;
  if (s.power.inputVolts != null) {
    const v = s.power.inputVolts;
    items.push({ label: "VOLT", value: `${fmtNum(v, 2)} V`, tone: uv ? "crit" : tone(voltLevel(v)) });
  } else if (s.power.coreVolts != null) {
    items.push({ label: "VCORE", value: `${fmtNum(s.power.coreVolts, 2)} V`, tone: uv ? "crit" : undefined });
  } else if (uv) {
    items.push({ label: "VOLT", value: "LOW", tone: "crit" });
  }

  if (s.cpu.usage != null) items.push({ label: "CPU", value: `${fmtNum(s.cpu.usage, 0)}%`, tone: tone(pctLevel(s.cpu.usage)) });

  const m = s.memory;
  if (m && m.total > 0) {
    const pct = ((m.total - m.available) / m.total) * 100;
    items.push({ label: "MEM", value: `${fmtNum(pct, 0)}%`, tone: tone(pctLevel(pct)) });
  }

  const root = s.disks.find((d) => d.mount === "/") ?? s.disks[0];
  if (root && root.total > 0) {
    const pct = (root.used / (root.used + root.free)) * 100;
    items.push({
      label: "DISK",
      value: `${fmtNum(root.used / GB, 0)}/${fmtNum(root.total / GB, 0)} GB`,
      tone: tone(pctLevel(pct)),
    });
  }
  return items;
}

/**
 * Outgoing internet, as core last checked it: NET ONLINE in --ok, OFFLINE
 * plain (normal for an offline box, not a fault), "..." until the first
 * answer. Hidden when the check is switched off.
 */
function internetItem(s: Snapshot): StripItem | null {
  switch (s.internet?.state) {
    case "online":
      return { label: "NET", value: "ONLINE", tone: "ok" };
    case "offline":
      return { label: "NET", value: "OFFLINE" };
    case "checking":
      return { label: "NET", value: "..." };
    default:
      return null;
  }
}
