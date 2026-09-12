// Persist only selected public research fields, never arbitrary API payloads.
export const HISTORY_LIMIT = 12;
const clean = (value, length) => String(value ?? "").slice(0, length);
function webUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href.slice(0, 2000) : "";
  } catch { return ""; }
}

export function normalizeSnapshot(value) {
  if (!value || typeof value !== "object" || !Number.isFinite(Date.parse(value.scannedAt))) return null;
  const durationMs = Number(value.durationMs);
  const timing = Number.isFinite(durationMs) && durationMs >= 0 ? Math.min(durationMs, 3600000) : null;
  if (value.status === "FAILED") return {
    status: "FAILED", scannedAt: new Date(value.scannedAt).toISOString(),
    platform: clean(value.platform, 30), niche: clean(value.niche, 160), durationMs: timing,
    // Never persist raw exception payloads which could contain request credentials.
    summary: "Scan failed. No opportunity or demand claim was recorded.",
    opportunities: [], sources: [], evidenceStatus: "SCAN_FAILED",
    warning: "Failed scan; retry this search after checking the on-screen error. No verified growth or sales evidence was collected."
  };
  if (!Array.isArray(value.opportunities) || !value.opportunities.length) return null;
  const sources = (Array.isArray(value.sources) ? value.sources : []).slice(0, 12)
    .map(source => ({ title: clean(source?.title, 200), url: webUrl(source?.url) }))
    .filter(source => source.url);
  const opportunities = value.opportunities.slice(0, 5).map(item => {
    const result = {};
    for (const field of ["title", "platform", "audience", "evidence", "competitionNote", "angle", "risk", "verdict"]) {
      result[field] = clean(item?.[field], field === "evidence" ? 600 : 350);
    }
    for (const field of ["demand", "competition", "margin", "differentiation", "confidence", "score", "rank"]) {
      const number = Number(item?.[field]);
      result[field] = Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
    }
    return result;
  });
  return {
    status: "COMPLETED", durationMs: timing,
    scannedAt: new Date(value.scannedAt).toISOString(),
    platform: clean(value.platform, 30), niche: clean(value.niche, 160),
    summary: clean(value.summary, 800), sources, opportunities,
    evidenceStatus: sources.length ? "PUBLIC_WEB_ONLY" : "NO_VERIFIED_SOURCES",
    warning: "Public web research is not measured sales or verified search growth. Scores are estimates. Sources belong to the scan; individual ideas may not have independent corroboration."
  };
}

export function normalizeHistory(value) {
  return (Array.isArray(value) ? value : []).slice(0, HISTORY_LIMIT)
    .map(normalizeSnapshot).filter(Boolean);
}

export function addSnapshot(history, value) {
  const snapshot = normalizeSnapshot(value);
  if (!snapshot) throw new Error("The scan has no valid dated opportunities to save.");
  return [snapshot, ...normalizeHistory(history).filter(item => !(item.scannedAt === snapshot.scannedAt &&
    item.platform === snapshot.platform && item.niche === snapshot.niche))].slice(0, HISTORY_LIMIT);
}

export function previousSnapshot(history, current) {
  return normalizeHistory(history).filter(item => item.platform === current.platform &&
    item.status === "COMPLETED" &&
    item.niche.trim().toLowerCase() === current.niche.trim().toLowerCase() &&
    Date.parse(item.scannedAt) < Date.parse(current.scannedAt))
    .sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt))[0] || null;
}
