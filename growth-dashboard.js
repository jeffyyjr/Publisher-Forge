(() => {
  const byId = (id) => document.getElementById(id);
  let days = 30;

  function number(value) {
    return new Intl.NumberFormat("en-US").format(Number(value) || 0);
  }

  function pct(value) {
    return (Number(value) || 0).toFixed(1).replace(/\.0$/, "") + "%";
  }

  function text(value) {
    return String(value || "");
  }

  function setMetric(id, value) {
    byId(id).textContent = value;
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
    const totals = data.totals || {};
    if ((totals.visitors || 0) < 10) {
      return "Traffic sample is still small. Keep the current feelers running until at least 10 tracked visitors land.";
    }
    const ranked = [...rows].sort((a, b) =>
      (b.signups - a.signups) ||
      (b.featureUses - a.featureUses) ||
      (b.signupConversion - a.signupConversion) ||
      (b.visitors - a.visitors)
    );
    const winner = ranked[0];
    if (!winner) return "No clear source winner yet.";
    if ((totals.demoStarts || 0) > 0 && (totals.signups || 0) === 0) {
      return "People are trying the free scan but not creating accounts yet. Tighten the post-demo signup promise before increasing traffic spend.";
    }
    if ((winner.signups || 0) === 0 && (winner.featureUses || 0) === 0) {
      return "People are landing but not starting or converting yet. Tighten the landing-page promise before increasing post volume.";
    }
    const angle = winner.content ? " / " + winner.content : "";
    return "Current winner: " + winner.source + angle +
      ". It has " + number(winner.signups) + " signup(s), " +
      number(winner.featureUses) + " paid-feature use(s), and " +
      pct(winner.signupConversion) + " visitor-to-signup conversion. Push this angle before adding new channels.";
  }

  async function load() {
    const status = byId("status");
    status.textContent = "Loading " + days + "-day growth data…";
    const response = await fetch("/api/admin/growth?days=" + days, {
      cache: "no-store",
      credentials: "same-origin"
    });
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
    setMetric("activeUsers", number(totals.activeUsers));
    setMetric("returningUsers", number(totals.returningUsers));
    setMetric("returningRate", pct(totals.returningRate));
    renderSources(data.sources || []);
    renderFeatures(data.features || []);
    byId("recommendation").textContent = recommendation(data);
    status.textContent = "Live persistent Forge analytics · last " + data.days + " days.";
  }

  document.querySelectorAll("[data-days]").forEach((button) => {
    button.addEventListener("click", async () => {
      days = Number(button.dataset.days) || 30;
      document.querySelectorAll("[data-days]").forEach((node) => node.classList.toggle("active", node === button));
      try { await load(); }
      catch (error) { byId("status").textContent = error.message; }
    });
  });

  load().catch((error) => {
    byId("status").textContent = error.message;
  });
})();