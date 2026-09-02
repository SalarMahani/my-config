// Clock and the two calendars.
//
// No date library: Chrome's Intl has the Persian calendar built in, so the Shamsi
// line is one formatter. Swap the locale to "fa-IR-u-ca-persian-nu-latn" if you
// would rather see 1405 than ۱۴۰۵.

(function () {
  "use strict";

  const clockEl = document.getElementById("clock");
  const gregEl = document.getElementById("date-greg");
  const shamsiEl = document.getElementById("date-shamsi");

  const timeFmt = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" });
  const gregFmt = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const shamsiFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  let lastDay = "";

  function tick() {
    const now = new Date();
    clockEl.textContent = timeFmt.format(now);

    // The dates only change once a day; no need to rebuild them every second.
    const day = now.toDateString();
    if (day !== lastDay) {
      lastDay = day;
      gregEl.textContent = gregFmt.format(now);
      shamsiEl.textContent = shamsiFmt.format(now);
    }
  }

  tick();
  setInterval(tick, 1000);
})();
