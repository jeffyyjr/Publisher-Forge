(() => {
  const KEYS = Object.freeze({
    projectVault: "pfProjectVault",
    revenueTests: "pfRevenueTests",
    opportunities: "publisherForge.moneyAgentOpportunities.v1",
    moneyAgentSettings: "publisherForge.moneyAgentSettings.v2",
    commandCenterPlan: "publisherForge.commandCenterPlan.v1"
  });
  const META_KEY = "publisherForge.accountSync.v1";
  let busy = false;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function snapshot() {
    return {
      projectVault: readJson(KEYS.projectVault, []),
      revenueTests: readJson(KEYS.revenueTests, []),
      opportunities: readJson(KEYS.opportunities, []),
      moneyAgentSettings: readJson(KEYS.moneyAgentSettings, {}),
      commandCenterPlan: readJson(KEYS.commandCenterPlan, null)
    };
  }

  function apply(state) {
    Object.entries(KEYS).forEach(([field, key]) => {
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

  function meta() {
    return readJson(META_KEY, {});
  }

  function setMeta(revision, state) {
    localStorage.setItem(META_KEY, JSON.stringify({
      revision,
      fingerprint: fingerprint(state),
      syncedAt: new Date().toISOString()
    }));
  }

  function empty(state) {
    return !(state.projectVault?.length || state.revenueTests?.length || state.opportunities?.length ||
      Object.keys(state.moneyAgentSettings || {}).length || state.commandCenterPlan);
  }

  async function getState() {
    const response = await fetch("/api/account/state", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Account sync unavailable");
    return response.json();
  }

  async function putState(state, revision) {
    const response = await fetch("/api/account/state", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, baseRevision: revision })
    });
    if (response.status === 409) return { conflict: true };
    if (!response.ok) throw new Error("Account sync unavailable");
    return response.json();
  }

  function announce(detail) {
    window.dispatchEvent(new CustomEvent("publisherForge:sync", { detail }));
  }

  async function syncOnce() {
    if (busy) return;
    busy = true;
    try {
      const remote = await getState();
      if (!remote) return;
      const local = snapshot();
      const localFingerprint = fingerprint(local);
      const last = meta();

      if (remote.revision === 0) {
        const saved = await putState(local, 0);
        if (saved && !saved.conflict) {
          setMeta(saved.revision, saved.state);
          announce({ status: "synced", revision: saved.revision });
        }
        return;
      }

      if (!last.revision && empty(local)) {
        apply(remote.state);
        setMeta(remote.revision, remote.state);
        announce({ status: "downloaded", revision: remote.revision });
        return;
      }

      if (!last.revision) {
        announce({ status: "conflict", revision: remote.revision });
        return;
      }

      if (Number(last.revision) === Number(remote.revision)) {
        if (last.fingerprint === localFingerprint) {
          announce({ status: "synced", revision: remote.revision });
          return;
        }
        const saved = await putState(local, remote.revision);
        if (saved?.conflict) {
          announce({ status: "conflict", revision: remote.revision });
          return;
        }
        setMeta(saved.revision, saved.state);
        announce({ status: "synced", revision: saved.revision });
        return;
      }

      if (last.fingerprint === localFingerprint) {
        apply(remote.state);
        setMeta(remote.revision, remote.state);
        announce({ status: "downloaded", revision: remote.revision });
        return;
      }

      announce({ status: "conflict", revision: remote.revision });
    } catch (error) {
      announce({ status: "error", message: error.message });
    } finally {
      busy = false;
    }
  }

  window.PublisherForgeAccountSync = { syncNow: syncOnce, snapshot };
  window.addEventListener("focus", syncOnce);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncOnce();
  });
  setInterval(syncOnce, 30000);
  syncOnce();
})();
