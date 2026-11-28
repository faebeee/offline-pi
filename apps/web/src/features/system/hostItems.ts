import type { Vitals } from "@outpost/api-client";
import type { StripItem } from "@outpost/ui/outpost.js";
import { fmtNum, pctLevel, tempLevel, voltLevel, type Level } from "./format";

const GB = 1024 ** 3;

const tone = (lvl: Level | null): StripItem["tone"] =>
  lvl === "warning" ? "cau" : lvl === "serious" || lvl === "critical" ? "crit" : undefined;

/**
 * The host's vitals for the status strip (app/strip.tsx, from
 * GET /api/system/vitals, open to every account): NET (outgoing
 * internet), TEMP, VOLT, CPU, MEM and DISK (the root file system), most
 * important first, coloured with the System screen's thresholds.
 */
export function hostItems(v: Vitals): StripItem[] {
  const items: StripItem[] = [];
  const net = internetItem(v);
  if (net) items.push(net);
  if (v.cpuTemp != null) items.push({ label: "TEMP", value: `${fmtNum(v.cpuTemp, 0)}°C`, tone: tone(tempLevel(v.cpuTemp)) });

  if (v.inputVolts != null) {
    items.push({ label: "VOLT", value: `${fmtNum(v.inputVolts, 2)} V`, tone: v.underVoltage ? "crit" : tone(voltLevel(v.inputVolts)) });
  } else if (v.coreVolts != null) {
    items.push({ label: "VCORE", value: `${fmtNum(v.coreVolts, 2)} V`, tone: v.underVoltage ? "crit" : undefined });
  } else if (v.underVoltage) {
    items.push({ label: "VOLT", value: "LOW", tone: "crit" });
  }

  if (v.cpuUsage != null) items.push({ label: "CPU", value: `${fmtNum(v.cpuUsage, 0)}%`, tone: tone(pctLevel(v.cpuUsage)) });
  if (v.memoryPercent != null) {
    items.push({ label: "MEM", value: `${fmtNum(v.memoryPercent, 0)}%`, tone: tone(pctLevel(v.memoryPercent)) });
  }

  const d = v.disk;
  if (d && d.total > 0) {
    const pct = (d.used / (d.used + d.free)) * 100;
    items.push({ label: "DISK", value: `${fmtNum(d.used / GB, 0)}/${fmtNum(d.total / GB, 0)} GB`, tone: tone(pctLevel(pct)) });
  }
  return items;
}

/**
 * Outgoing internet, as core last checked it: NET ONLINE in --ok, OFFLINE
 * plain (normal for an offline box, not a fault), "..." until the first
 * answer. Hidden when the check is switched off.
 */
function internetItem(v: Vitals): StripItem | null {
  switch (v.internet) {
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
