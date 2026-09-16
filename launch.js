(() => {
  const params = new URLSearchParams(window.location.search);
  const campaign = {
    source: (params.get("utm_source") || params.get("source") || "direct").slice(0, 80),
    campaign: (params.get("utm_campaign") || "public-beta").slice(0, 80),
    content: (params.get("utm_content") || "").slice(0, 100)
  };
  const sharedTopic = String(params.get("topic") || "").trim().slice(0, 180);

  // Every primary launch CTA enters the same low-friction guest Trend Radar path.
  // Preserve attribution so we can measure which outside channel creates real use.
  document.querySelectorAll('a[data-launch-event="open_app"]').forEach((node) => {
    const target = new URL("/", window.location.origin);
    target.searchParams.set("view", "radar");
    target.searchParams.set("guest", "1");
    target.searchParams.set("onboard", "1");
    target.searchParams.set("utm_source", campaign.source);
    target.searchParams.set("utm_campaign", campaign.campaign);
    if (campaign.content) target.searchParams.set("utm_content", campaign.content);
    node.setAttribute("href", target.pathname + target.search);
  });

  if (sharedTopic) {
    document.querySelectorAll('[data-launch-event="open_viral"][href="/?view=viral"]')
      .forEach((node) => {
        const target = new URL(node.getAttribute("href"), window.location.origin);
        target.searchParams.set("topic", sharedTopic);
        node.setAttribute("href", target.pathname + target.search);
      });
  }

  function track(event) {
    const body = JSON.stringify({
      event,
      source: campaign.source,
      campaign: campaign.campaign,
      content: campaign.content,
      path: window.location.pathname
    });
    fetch("/api/launch-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin"
    }).catch(() => {});
  }

  track("page_view");

  document.querySelectorAll("[data-launch-event]").forEach((node) => {
    node.addEventListener("click", () => {
      track(String(node.dataset.launchEvent || "cta_click").slice(0, 50));
    });
  });
})();
