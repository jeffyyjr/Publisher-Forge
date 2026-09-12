import { addSnapshot, normalizeHistory, previousSnapshot } from "/trend-evidence.mjs";

const KEY = "publisherForge.trendHistory.v1";
const historyList = document.getElementById("trendHistoryList");
const note = document.getElementById("trendEvidenceNote");
function readHistory() {
  try { return normalizeHistory(JSON.parse(localStorage.getItem(KEY) || "[]")); }
  catch { return []; }
}
function renderHistory() {
  historyList.replaceChildren();
  const history = readHistory();
  document.getElementById("exportTrendHistory").disabled = !history.length;
  if (!history.length) historyList.textContent = "No saved scans yet. Your next successful scan will be saved here.";
  history.forEach(snapshot => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn wide";
    button.textContent = `${snapshot.status === "FAILED" ? "Failed · " : ""}${snapshot.platform} · ${snapshot.niche || "All niches"} · ${new Date(snapshot.scannedAt).toLocaleString()}`;
    button.addEventListener("click", () => restore(snapshot));
    historyList.appendChild(button);
  });
}
function showEvidence(snapshot) {
  const previous = previousSnapshot(readHistory(), snapshot);
  note.textContent = snapshot.warning + (snapshot.durationMs !== null ? ` Scan took ${(snapshot.durationMs / 1000).toFixed(1)} seconds.` : "") + (previous
    ? ` Earlier matching scan: ${new Date(previous.scannedAt).toLocaleString()}. ${previous.sources.length} source links then; ${snapshot.sources.length} now. Source counts and score changes do not prove rising demand.`
    : " First saved observation for this search. Rising demand is not yet established.");
}
function restore(snapshot) {
  document.getElementById("radarPlatform").value = snapshot.platform;
  document.getElementById("niche").value = snapshot.niche;
  if (snapshot.status === "FAILED") {
    note.textContent = snapshot.warning;
    return;
  }
  window.renderRadar(snapshot);
  document.getElementById("radarHeading").textContent = "Saved scan — not a fresh search";
  showEvidence(snapshot);
}
function saveScan(event) {
  const data = event.detail;
  try {
    const history = addSnapshot(readHistory(), data);
    localStorage.setItem(KEY, JSON.stringify(history));
    renderHistory();
    showEvidence(history[0]);
    window.PublisherForgeAccountSync?.syncNow();
  } catch (error) {
    note.textContent = "Research history could not be saved: " + error.message;
  }
}
window.addEventListener("publisherForge:trendScan", saveScan);
window.addEventListener("publisherForge:trendFailure", saveScan);
window.addEventListener("publisherForge:sync", event => {
  if (event.detail?.status === "downloaded") renderHistory();
});
window.addEventListener("storage", event => { if (event.key === KEY) renderHistory(); });
document.getElementById("exportTrendHistory").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), scans: readHistory() }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "publisher-forge-research-history.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
for (const [id, platform, niche] of [
  ["rvWorkflow", "KDP", "Travel-trailer maintenance and seasonal-storage logbook: practical record forms, no repair instructions"],
  ["thanksgivingWorkflow", "Etsy", "Large-print mixed-age Thanksgiving and Friendsgiving printable games: low-ink family activities with answer keys"]
]) {
  document.getElementById(id).addEventListener("click", () => {
    document.getElementById("radarPlatform").value = platform;
    document.getElementById("niche").value = niche;
    note.textContent = "Test search selected. Tap Scan live trends to research it; selecting this button does not spend API credits. Demand remains unverified until supported by evidence.";
  });
}
renderHistory();
const latest = readHistory()[0];
if (latest) restore(latest);
