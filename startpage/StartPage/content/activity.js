// The activity panel: a KPI row, a ranked bar chart and a recent list.
//
// Form choices, in the order the dataviz method asks for them:
//   - Three headline numbers are a KPI row of stat tiles, not a bar chart.
//   - "Top sites" compares magnitude across identities, so it is a horizontal bar
//     chart in ONE hue -- color follows the entity, never the rank, and rank is all
//     a per-bar hue would encode here.
//
// There was a 7x24 hour-of-day heatmap here too. It was removed as not worth its
// height: it answered "when do I browse", which is not a question this page is for,
// and it cost ~415px that the recent list makes better use of.

SP.whenReady(() => {
  const mount = document.getElementById("activity");
  if (!mount) return;

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
    attachRecentNav(list);
    return section;
  }

  // Bound to the list, not to document, so these keys only act while focus is
  // actually inside it -- the same rule the bookmark panes and the downloads list
  // follow, and what keeps page/scroll.js owning j/k everywhere else.
  //
  // The links are left NORMALLY tabbable rather than given a roving tabindex: that
  // is a deliberate long-standing choice for this panel, and j/k works regardless
  // of how focus got here.
  function attachRecentNav(list) {
    list.addEventListener("keydown", (e) => {
      const link = e.target.closest && e.target.closest(".sp-link");
      if (!link) return;

      if (e.key === "Escape") { e.preventDefault(); link.blur(); return; }
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const links = [...list.querySelectorAll(".sp-link")];
      const step = e.key === "ArrowDown" || e.key === "j" ? 1
                 : e.key === "ArrowUp"   || e.key === "k" ? -1
                 : 0;
      if (step === 0) {
        if (e.key === "Home") { e.preventDefault(); focusRecent(links[0]); }
        if (e.key === "End")  { e.preventDefault(); focusRecent(links[links.length - 1]); }
        return;
      }
      e.preventDefault();
      const at = links.indexOf(link);
      focusRecent(links[Math.min(links.length - 1, Math.max(0, at + step))]);
    });
  }

  function focusRecent(link) {
    if (!link) return;
    link.focus();
    // The list is a scroll container of its own, so this scrolls WITHIN it rather
    // than moving the page.
    link.scrollIntoView({ block: "nearest" });
  }

  // The way in. Every unshifted single key is spoken for -- Vimium's bindings plus
  // this page's own -- so this one is shifted. Vimium binds no bare "A".
  document.addEventListener("keydown", (e) => {
    if (e.key !== "A" || e.ctrlKey || e.altKey || e.metaKey) return;
    if (SP.isTyping(e.target)) return;
    if (!SP.visible(mount)) return;
    const list = mount.querySelector(".sp-recent");
    if (!list) return;
    e.preventDefault();
    const inside = list.contains(document.activeElement);
    if (inside) return;
    focusRecent(list.querySelector(".sp-link"));
  });

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
