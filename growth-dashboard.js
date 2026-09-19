(() => {
  const byId = (id) => document.getElementById(id);
  let days = 30;

  function number(value) {
    return new Intl.NumberFormat("en-US").format(Number(value) || 0);
  }

  function pct(value) {
    return (Number(value) || 0).toFixed(1).replace(/\.0$/, "") + "%";
  }

  function rate(part, whole) {
    return Number(whole) ? Math.round((Number(part) / Number(whole)) * 1000) / 10 : 0;
  }

  function text(value) {
    return String(value || "");
  }

  function setMetric(id, value) {
    byId(id).textContent = value;
  }

  function setStage(id, count, conversion, label) {
    const node = byId(id);
    if (!node) return;
    node.querySelector("strong").textContent = number(count);
    node.querySelector("span").textContent = label;
    const detail = node.querySelector("small");
    if (detail) detail.textContent = conversion == null ? "Entry point" : pct(conversion) + " from previous step";
  }

  function renderJourney(totals) {
    setStage("journeyVisitors", totals.visitors, null, "Launch visitors");
    setStage("journeyOpens", totals.appOpens, rate(totals.appOpens, totals.visitors), "Opened Forge");
    setStage("journeyDemo", totals.demoStarts, rate(totals.demoStarts, totals.appOpens || totals.visitors), "Started free scan");
    setStage("journeyDone", totals.demoCompletions, rate(totals.demoCompletions, totals.demoStarts), "Completed free scan");
    setStage("journeySignup", totals.signups, rate(totals.signups, totals.demoCompletions || totals.visitors), "Created account");
    setStage("journeyUse", totals.featureUses, rate(totals.featureUses, totals.signups), "Signed-in feature uses");
    setStage("journeyProject", totals.projectStarts, rate(totals.projectStarts, totals.signups), "First project started");
    setStage("journeyArtifact", totals.artifactCompletions, rate(totals.artifactCompletions, totals.projectStarts), "Artifact generated");
  }

  function renderSources(rows) {
    const body = byId("sourceRows");
    body.innerHTML = "";
    if (!rows?.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 10;
      td.className = "empty";
      td.textContent = "No tracked traffic yet for this range.";
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const values = [
        text(row.source || "direct"),
        text(row.campaign || "public-beta"),
        text(row.content || "—"),
        number(row.visitors),
        number(row.appOpens),
        number(row.demoStarts),
        number(row.demoCompletions),
        number(row.signups),
        pct(row.signupConversion),
        number(row.featureUses)
      ];
      values.forEach((value, index) => {
        const td = document.createElement("td");
        td.textContent = value;
        if (index >= 3) td.className = "num";
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function renderFeatures(rows) {
    const wrap = byId("featureRank");
    wrap.innerHTML = "";
    if (!rows?.length) {
      wrap.innerHTML = '<div class="empty">No signed-in costed feature use yet.</div>';
      return;
    }
    const max = Math.max(...rows.map((row) => Number(row.uses) || 0), 1);
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "rankItem";
      const left = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = text(row.feature);
      const muted = document.createElement("div");
      muted.className = "muted";
      muted.textContent = number(row.users) + " user" + (Number(row.users) === 1 ? "" : "s");
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("i");
      fill.style.width = Math.max(5, Math.round((Number(row.uses) || 0) / max * 100)) + "%";
      bar.appendChild(fill);
      left.append(strong, muted, bar);
      const count = document.createElement("strong");
      count.textContent = number(row.uses);
      item.append(left, count);
      wrap.appendChild(item);
    });
  }

  function recommendation(data) {
    const rows = data.sources || [];
    const t = data.totals || {};
    if ((t.visitors || 0) < 10) return "Traffic sample is still small. Get to at least 10 tracked visitors before judging channels; watch which step below loses people.";
    if ((t.appOpens || 0) < (t.visitors || 0) * 0.5) return "Biggest bottleneck: launch page → Forge. Tighten the main promise and free-scan CTA before adding more traffic.";
    if ((t.demoStarts || 0) < (t.appOpens || 0) * 0.5) return "Biggest bottleneck: Forge open → free scan. Make the first action more obvious and reduce choices for new visitors.";
    if ((t.demoStarts || 0) && (t.demoCompletions || 0) < (t.demoStarts || 0) * 0.7) return "Biggest bottleneck: scan completion. Check scan speed/errors before promoting harder.";
    if ((t.demoCompletions || 0) && (t.signups || 0) < (t.demoCompletions || 0) * 0.25) return "Biggest bottleneck: completed scan → account. Strengthen the reason to save the research and continue building.";
    if ((t.signups || 0) && (t.projectStarts || 0) < (t.signups || 0) * 0.5) return "Biggest bottleneck: signup → first project. Make the build path the obvious next action.";
    if ((t.projectStarts || 0) && (t.artifactCompletions || 0) < (t.projectStarts || 0) * 0.7) return "Biggest bottleneck: project → successful artifact. Check generation failures and latency before adding traffic.";
    if ((t.signups || 0) && (t.featureUses || 0) < (t.signups || 0) * 0.5) return "Biggest bottleneck: signup → continued Forge use. Improve the return-to-Forge handoff.";

    const ranked = [...rows].sort((a, b) =>
      (b.featureUses - a.featureUses) || (b.signups - a.signups) ||
      (b.signupConversion - a.signupConversion) || (b.visitors - a.visitors)
    );
    const winner = ranked[0];
    if (!winner) return "No clear source winner yet.";
    const angle = winner.content ? " / " + winner.content : "";
    return "Healthy funnel so far. Current source leader: " + winner.source + angle +
      " with " + number(winner.signups) + " signup(s), " + number(winner.featureUses) +
      " signed-in feature use(s), and " + pct(winner.signupConversion) + " visitor-to-signup conversion.";
  }

  async function load() {
    const status = byId("status");
    status.textContent = "Loading " + days + "-day growth data…";
    const response = await fetch("/api/admin/growth?days=" + days, { cache: "no-store", credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Growth dashboard unavailable");

    const totals = data.totals || {};
    setMetric("visitors", number(totals.visitors));
    setMetric("appOpens", number(totals.appOpens));
    setMetric("demoStarts", number(totals.demoStarts));
    setMetric("demoCompletions", number(totals.demoCompletions));
    setMetric("demoCompletionRate", pct(totals.demoCompletionRate));
    setMetric("signups", number(totals.signups));
    setMetric("signupConversion", pct(totals.signupConversion));
    setMetric("featureUses", number(totals.featureUses));
    setMetric("projectStarts", number(totals.projectStarts));
    setMetric("artifactCompletions", number(totals.artifactCompletions));
    setMetric("featureFailures", number(totals.featureFailures));
    setMetric("activeUsers", number(totals.activeUsers));
    setMetric("returningUsers", number(totals.returningUsers));
    setMetric("returningRate", pct(totals.returningRate));
    renderJourney(totals);
    renderSources(data.sources || []);
    renderFeatures(data.features || []);
    byId("recommendation").textContent = recommendation(data);
    status.textContent = "Live persistent Forge analytics · last " + data.days + " days.";
  }

  document.querySelectorAll("[data-days]").forEach((button) => {
    button.addEventListener("click", async () => {
      days = Number(button.dataset.days) || 30;
      document.querySelectorAll("[data-days]").forEach((node) => node.classList.toggle("active", node === button));
      try { await load(); } catch (error) { byId("status").textContent = error.message; }
    });
  });

  load().catch((error) => { byId("status").textContent = error.message; });
})();