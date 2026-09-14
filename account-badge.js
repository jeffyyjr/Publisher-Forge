(() => {
  async function json(url) {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }

  async function refresh() {
    const link = document.getElementById("accountLink");
    if (!link) return;

    const status = await json("/api/account/status");
    if (!status?.signedIn) {
      link.textContent = "Sign up / Sign in";
      link.title = "Create an account or sign in to sync Forge stats";
      return;
    }

    const [stats, limits] = await Promise.all([
      json("/api/account/stats"),
      json("/api/account/limits")
    ]);
    const tracked = (stats?.stats?.projects || 0) +
      (stats?.stats?.revenueTests || 0) +
      (stats?.stats?.trendScans || 0) +
      (stats?.stats?.viralRenders || 0);
    const videoRemaining = limits?.limits?.viralRender?.remaining;

    if (limits?.admin) {
      link.textContent = "Admin · Stats";
    } else if (Number.isFinite(videoRemaining)) {
      link.textContent = "Stats · " + videoRemaining + " video left";
    } else {
      link.textContent = tracked ? "Stats · " + tracked : "Stats & Account";
    }

    link.title = status.user?.email
      ? "Signed in as " + status.user.email
      : "Open your Publisher Forge account";
  }

  refresh().catch(() => {});
  window.addEventListener("publisherForge:sync", () => {
    refresh().catch(() => {});
  });
  window.addEventListener("focus", () => {
    refresh().catch(() => {});
  });
})();
