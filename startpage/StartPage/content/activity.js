// The activity panel: a KPI row, a ranked bar chart, a 7x24 heatmap and a recent list.
//
// Form choices, in the order the dataviz method asks for them:
//   - Three headline numbers are a KPI row of stat tiles, not a bar chart.
//   - "Top sites" compares magnitude across identities, so it is a horizontal bar
//     chart in ONE hue -- color follows the entity, never the rank, and rank is all
//     a per-bar hue would encode here.
//   - Hour-of-day x day-of-week is a grid of magnitudes, so it is a heatmap on a
//     single sequential ramp, running dark (near the surface) -> light for "more"
//     because the surface itself is dark. Verified monotonic in OKLab L.

SP.whenReady(() => {
  const mount = document.getElementById("activity");
  if (!mount) return;

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const pad = (n) => String(n).padStart(2, "0");

  load(false);

  function load(force) {
    mount.setAttribute("aria-busy", "true");
    SP.send("activity", { force })
      .then((data) => {
        if (!data || data.error) throw new Error((data && data.error) || "no response");
        render(data);
      })
      .catch((err) => SP.fail(mount, err))
      .finally(() => mount.removeAttribute("aria-busy"));
  }

  function render(data) {
    mount.textContent = "";

    mount.appendChild(SP.el("div", { class: "sp-panel-head" }, [
      SP.el("h2", { text: "Activity" }),
      SP.el("button", {
        class: "sp-refresh",
        type: "button",
        title: "Recompute from history",
        text: "Refresh",
        onclick: () => load(true),
      }),
    ]));

    mount.appendChild(SP.el("p", { class: "sp-note", text: note(data) }));
    mount.appendChild(kpiRow(data.today));
    mount.appendChild(topSites(data.topDomains));
    mount.appendChild(heatmap(data.heatmap));
    mount.appendChild(recent(data.recent));
  }

  function note(data) {
    const age = Math.round((Date.now() - data.builtAt) / 60000);
    const when = age < 1 ? "just now" : age + " min ago";
    // Say so when the URL cap in sw.js kicked in, rather than under-reporting silently.
    const capped = data.truncated
      ? " · based on the " + data.urlsConsidered + " most recent of " + data.urlsTotal + " pages"
      : "";
    return "Last 7 days · computed " + when + capped;
  }

  /* ------------------------------------------------------------- KPI row */

  function kpiRow(today) {
    const tile = (value, label, small) => SP.el("div", { class: "sp-tile" }, [
      SP.el("div", {
        class: "sp-tile-value" + (small ? " sp-tile-value-sm" : ""),
        text: String(value),
      }),
      SP.el("div", { class: "sp-tile-label", text: label }),
    ]);

    const delta = today.pages - today.weekAveragePerDay;
    const signed = (delta > 0 ? "+" : "") + delta;
    const vsAvg = today.weekAveragePerDay
      ? "vs " + today.weekAveragePerDay + "/day average"
      : "no weekly average yet";

    return SP.el("section", { class: "sp-kpis" }, [
      tile(today.pages, "pages today"),
      tile(today.domains, "sites today"),
      tile(signed, vsAvg, true),
    ]);
  }

  /* --------------------------------------------------------- top domains */

  function topSites(domains) {
    const section = SP.el("section", { class: "sp-sub" }, [
      SP.el("h3", { text: "Top sites this week" }),
    ]);

    if (!domains.length) {
      section.appendChild(SP.el("p", { class: "sp-note", text: "No visits recorded." }));
      return section;
    }

    const max = domains[0].count;
    const rows = SP.el("div", { class: "sp-bars" });

    for (const d of domains) {
      const bar = SP.el("div", { class: "sp-bar" });
      bar.style.width = Math.max(2, (d.count / max) * 100) + "%";

      const icon = SP.el("img", {
        class: "sp-favicon",
        src: SP.faviconUrl(d.sampleUrl, 16),
        alt: "",
        loading: "lazy",
      });
      icon.addEventListener("error", () => { icon.style.visibility = "hidden"; });

      const row = SP.el("div", { class: "sp-bar-row" }, [
        icon,
        SP.el("span", { class: "sp-bar-label", text: d.domain, title: d.domain }),
        SP.el("div", { class: "sp-bar-track" }, [bar]),
        SP.el("span", { class: "sp-bar-value", text: String(d.count) }),
      ]);
      attachTip(row, d.domain + " — " + d.count + " visit" + (d.count === 1 ? "" : "s"));
      rows.appendChild(row);
    }

    section.appendChild(rows);
    return section;
  }

  /* -------------------------------------------------------------- heatmap */

  // Browsing counts are heavily skewed, so linear bucketing would flatten nearly
  // every cell into the lowest step. Quantiles over the non-zero cells spread the
  // ramp across the data that actually exists; exact counts stay in the tooltip.
  function bucketer(grid) {
    const values = grid.flat().filter((v) => v > 0).sort((a, b) => a - b);
    if (!values.length) return () => 0;

    const cuts = [];
    for (let i = 1; i <= 5; i++) {
      cuts.push(values[Math.floor((values.length - 1) * (i / 6))]);
    }
    return (v) => {
      if (v <= 0) return 0;
      let step = 1;
      for (const c of cuts) if (v > c) step++;
      return Math.min(step, 6);
    };
  }

  function heatmap(grid) {
    const section = SP.el("section", { class: "sp-sub" }, [
      SP.el("h3", { text: "When you browse" }),
    ]);

    const bucket = bucketer(grid);
    const heat = SP.el("div", { class: "sp-heat" });

    for (let day = 0; day < 7; day++) {
      heat.appendChild(SP.el("span", { class: "sp-heat-day", text: DAYS[day] }));
      for (let hour = 0; hour < 24; hour++) {
        const count = grid[day][hour];
        const cell = SP.el("div", {
          class: "sp-heat-cell",
          "data-step": String(bucket(count)),
        });
        attachTip(cell, DAYS[day] + " " + pad(hour) + ":00 — " + count +
          " visit" + (count === 1 ? "" : "s"));
        heat.appendChild(cell);
      }
    }

    // Hour axis: one label every six hours, sharing the grid's column template so
    // the labels stay aligned to their cells.
    const axis = SP.el("div", { class: "sp-heat-axis" }, [SP.el("span", {})]);
    for (let hour = 0; hour < 24; hour++) {
      axis.appendChild(SP.el("span", {
        class: "sp-heat-hour",
        text: hour % 6 === 0 ? pad(hour) : "",
      }));
    }

    section.appendChild(heat);
    section.appendChild(axis);

    // Sequential legend. The buckets are quantiles, so it is labelled by direction
    // rather than with numeric breakpoints it cannot honestly claim.
    const legend = SP.el("div", { class: "sp-legend" }, [
      SP.el("span", { class: "sp-legend-label", text: "fewer" }),
    ]);
    for (let step = 1; step <= 6; step++) {
      legend.appendChild(SP.el("span", { class: "sp-heat-cell", "data-step": String(step) }));
    }
    legend.appendChild(SP.el("span", { class: "sp-legend-label", text: "more" }));
    section.appendChild(legend);

    return section;
  }

  /* --------------------------------------------------------------- recent */

  function recent(items) {
    const section = SP.el("section", { class: "sp-sub" }, [
      SP.el("h3", { text: "Pick up where you left off" }),
    ]);
    const list = SP.el("div", { class: "sp-recent" });
    for (const it of items) {
      const link = SP.link(it.url, it.title);
      link.appendChild(SP.el("span", { class: "sp-recent-time", text: ago(it.lastVisitTime) }));
      list.appendChild(link);
    }
    section.appendChild(list);
    return section;
  }

  function ago(ts) {
    if (!ts) return "";
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return mins + "m";
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + "h";
    return Math.round(hours / 24) + "d";
  }

  /* -------------------------------------------------------------- tooltip */

  let tip = null;

  function attachTip(node, text) {
    node.addEventListener("mouseenter", () => {
      if (!tip) {
        tip = SP.el("div", { class: "sp-tip" });
        document.body.appendChild(tip);
      }
      tip.textContent = text;
      tip.classList.add("visible");
      const r = node.getBoundingClientRect();
      tip.style.left = r.left + r.width / 2 + "px";
      tip.style.top = r.top - 8 + "px";
    });
    node.addEventListener("mouseleave", () => {
      if (tip) tip.classList.remove("visible");
    });
  }
});
