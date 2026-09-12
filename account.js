const STORAGE_KEYS = Object.freeze({
  projectVault: "pfProjectVault",
  revenueTests: "pfRevenueTests",
  trendHistory: "publisherForge.trendHistory.v1",
  opportunities: "publisherForge.moneyAgentOpportunities.v1",
  moneyAgentSettings: "publisherForge.moneyAgentSettings.v2",
  commandCenterPlan: "publisherForge.commandCenterPlan.v1"
});
const META_KEY = "publisherForge.accountSync.v1";
const byId = (id) => document.getElementById(id);
let statusData = null;

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value == null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function localState() {
  return {
    projectVault: readJson(STORAGE_KEYS.projectVault, []),
    revenueTests: readJson(STORAGE_KEYS.revenueTests, []),
    trendHistory: readJson(STORAGE_KEYS.trendHistory, []),
    opportunities: readJson(STORAGE_KEYS.opportunities, []),
    moneyAgentSettings: readJson(STORAGE_KEYS.moneyAgentSettings, {}),
    commandCenterPlan: readJson(STORAGE_KEYS.commandCenterPlan, null)
  };
}

function writeLocalState(state) {
  Object.entries(STORAGE_KEYS).forEach(([field, key]) => {
    const value = state?.[field];
    if (value == null && field === "commandCenterPlan") localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value ?? (field === "moneyAgentSettings" ? {} : [])));
  });
}

function fingerprint(state) {
  const text = JSON.stringify(state);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${hash >>> 0}`;
}

function saveMeta(revision, state) {
  localStorage.setItem(META_KEY, JSON.stringify({
    revision,
    fingerprint: fingerprint(state),
    syncedAt: new Date().toISOString()
  }));
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.message || "Publisher Forge request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function showMessage(text, kind = "") {
  const node = byId("message");
  node.className = "status" + (kind ? ` ${kind}` : "");
  node.textContent = text;
}

function setSignedIn(signedIn) {
  byId("signedOut").classList.toggle("hidden", signedIn);
  byId("signedIn").classList.toggle("hidden", !signedIn);
}

function renderStorage(status) {
  const node = byId("storageStatus");
  if (status.storagePersistent) {
    node.className = "status good";
    node.textContent = "Persistent account storage is configured.";
  } else {
    node.className = "status warn";
    node.textContent = "Account system is running, but the server storage is still ephemeral. Configure PF_DATA_DIR on a persistent disk before relying on it across deploys.";
  }
}

async function refreshStatus() {
  statusData = await request("/api/account/status", { headers: {} });
  renderStorage(statusData);
  setSignedIn(Boolean(statusData.signedIn));
  if (statusData.signedIn) {
    byId("accountEmail").textContent = statusData.user?.email || "Signed in";
    await refreshSyncState();
  }
}

async function refreshSyncState() {
  try {
    const data = await request("/api/account/state", { headers: {} });
    const local = localState();
    const remoteCount = (data.state?.projectVault?.length || 0) +
      (data.state?.revenueTests?.length || 0) + (data.state?.opportunities?.length || 0);
    const localCount = (local.projectVault?.length || 0) +
      (local.revenueTests?.length || 0) + (local.opportunities?.length || 0);
    byId("syncStatus").textContent = `Account revision ${data.revision} · this device has ${localCount} tracked items · account copy has ${remoteCount} tracked items.`;
  } catch (error) {
    byId("syncStatus").textContent = error.message;
  }
}

async function register() {
  const email = byId("registerEmail").value.trim();
  const password = byId("registerPassword").value;
  await request("/api/account/register", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  showMessage("Account created. This device can now be saved to the account.", "good");
  await refreshStatus();
}

async function login() {
  const email = byId("loginEmail").value.trim();
  const password = byId("loginPassword").value;
  await request("/api/account/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  showMessage("Signed in. Check the two copies before choosing which one to keep.", "good");
  await refreshStatus();
}

async function saveDevice() {
  const current = await request("/api/account/state", { headers: {} });
  const state = localState();
  const saved = await request("/api/account/state", {
    method: "PUT",
    body: JSON.stringify({ state, baseRevision: current.revision })
  });
  saveMeta(saved.revision, saved.state);
  showMessage("This device is now saved to the account copy.", "good");
  await refreshSyncState();
}

async function loadAccount() {
  const current = await request("/api/account/state", { headers: {} });
  writeLocalState(current.state || {});
  saveMeta(current.revision, current.state || {});
  showMessage("Account data loaded onto this device. Open Command Center to see the synced company state.", "good");
  await refreshSyncState();
}

async function logout() {
  await request("/api/account/logout", { method: "POST", body: "{}" });
  localStorage.removeItem(META_KEY);
  showMessage("Signed out. Local Forge data remains on this device.");
  await refreshStatus();
}

function bind(id, fn) {
  byId(id).addEventListener("click", async () => {
    const button = byId(id);
    button.disabled = true;
    try { await fn(); }
    catch (error) { showMessage(error.message, "bad"); }
    finally { button.disabled = false; }
  });
}

bind("registerButton", register);
bind("loginButton", login);
bind("saveDevice", saveDevice);
bind("loadAccount", loadAccount);
bind("refreshState", refreshSyncState);
bind("logoutButton", logout);

refreshStatus().catch((error) => showMessage(error.message, "bad"));
