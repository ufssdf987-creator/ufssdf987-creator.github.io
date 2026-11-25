/* ══════════════════════════════════════════════════════════════
   2026 육아휴직 급여·부모급여 계산기 — 화면 (app.js)
   - 입력값은 이 기기의 localStorage 에만 저장합니다(서버 전송 없음).
   - 계산은 calc.js(window.ParentBenefitCalc)가 담당합니다.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var C = window.ParentBenefitCalc;
  if (!C) return;

  var STORAGE_KEY = "parent-benefit:v1";

  /* AdSense 승인 후 ① client, ② 슬롯 id별 data-ad-slot(10자리)을 채우세요. */
  var ADSENSE = {
    client: "ca-pub-4355917079579050",
    slots: { "ad-top": "", "ad-mid": "", "ad-bottom": "" }
  };

  var DEFAULTS = {
    tab: "leave",
    wage: 3000000,
    months: 12,
    spouseMonths: 6,
    household: "both",
    under18: true,
    ageMonths: 0,
    rank: "first",
    region: "nonmetro",
    childcare: false,
    includeFirst: true
  };

  var RANK_LABEL = { first: "첫째", second: "둘째", third: "셋째 이상" };

  var state = {};
  var last = { leave: null, benefit: null };

  /* ── 도우미 ──────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }
  function setHTML(id, v) { var e = $(id); if (e) e.innerHTML = v; }
  function show(el, v) {
    if (!el) return;
    if (v) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  }
  function won(n) { return C.won(n); }
  function man(n) { return C.manwon(n); }
  function manNum(n) { return C.manNum(n); }
  function pct(v, d) { return (v * 100).toFixed(d === undefined ? 0 : d) + "%"; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* ── 저장·복원 ───────────────────────────────────────────── */
  function save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }
  function load() {
    state = {};
    for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) state[k] = DEFAULTS[k];
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (var key in DEFAULTS) {
          if (Object.prototype.hasOwnProperty.call(saved, key) && saved[key] !== null && saved[key] !== "") {
            state[key] = saved[key];
          }
        }
      }
    } catch (e) { /* 무시 */ }
    sanitize();
  }
  function sanitize() {
    state.tab = state.tab === "benefit" ? "benefit" : "leave";
    state.wage = clamp(C.toNumber(state.wage, 3000000), 0, 100000000);
    state.months = clamp(Math.round(C.toNumber(state.months, 12)), 1, C.LEAVE.maxMonths);
    state.spouseMonths = clamp(Math.round(C.toNumber(state.spouseMonths, 0)), 0, C.LEAVE.maxMonths);
    state.household = state.household === "single" ? "single" : "both";
    state.under18 = !!state.under18;
    state.ageMonths = clamp(Math.round(C.toNumber(state.ageMonths, 0)), 0, 107);
    state.rank = RANK_LABEL[state.rank] ? state.rank : "first";
    state.region = C.BENEFIT.regions[state.region] ? state.region : "metro";
    state.childcare = !!state.childcare;
    if (state.ageMonths >= 24) state.includeFirst = false;
    state.includeFirst = !!state.includeFirst;
  }

  /* ── 입력 동기화 ─────────────────────────────────────────── */
  function syncInputs() {
    all("[data-key]").forEach(function (el) {
      var key = el.getAttribute("data-key");
      var kind = el.getAttribute("data-kind");
      if (el.tagName === "SELECT") {
        el.value = String(state[key]);
      } else if (kind === "dec") {
        if (document.activeElement !== el) el.value = String(state[key]);
      } else if (document.activeElement !== el) {
        el.value = C.group(state[key]);
      }
    });
    all(".seg").forEach(function (seg) {
      var group = seg.getAttribute("data-group");
      all("button", seg).forEach(function (b) {
        var active = String(state[group]) === b.getAttribute("data-value");
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
    });
    all("[data-toggle]").forEach(function (cb) {
      cb.checked = !!state[cb.getAttribute("data-toggle")];
    });
    var region = $("region-select");
    if (region) region.value = state.region;
    var firstToggle = $("includeFirst");
    if (firstToggle) {
      firstToggle.disabled = state.ageMonths >= 24;
      firstToggle.closest(".switch-row").style.opacity = state.ageMonths >= 24 ? "0.55" : "";
    }
    markChips("wage", state.wage);
    markChips("months", state.months);
    markChips("spouseMonths", state.spouseMonths);
    markChips("ageMonths", state.ageMonths);
  }

  function markChips(target, value) {
    all('[data-target="' + target + '"]').forEach(function (b) {
      b.classList.toggle("is-active", Number(b.getAttribute("data-value")) === Number(value));
    });
  }

  /* ── 렌더: 탭 1 육아휴직 ─────────────────────────────────── */
  function specialNote(r) {
    if (r.household === "single") return "한부모";
    if (r.common > 0) return "6+6 공통 " + r.common + "개월";
    return "일반";
  }

  function renderLeave() {
    var r = C.calcParentalLeave(state);
    last.leave = r;

    setText("leave-badge", r.household === "single" ? "한부모 특례" : (r.common > 0 ? "6+6 적용" : "일반 급여"));
    setText("leave-title", r.months + "개월에 " + man(r.total) + " 받습니다");
    setText("leave-sub", "월 통상임금 " + man(r.wage) + " · " + specialNote(r) + " · " + r.months + "개월");

    setText("stat-first3", man(r.bands.first3));
    setText("stat-mid", man(r.bands.m4to6));
    setText("stat-late", man(r.bands.m7plus));
    setText("stat-mid-note", r.common >= 6 ? "100% · 6+6 상한" : "통상임금 100% · 월 200만까지");
    setText("stat-extra-label", r.household === "single" ? "한부모 특례 혜택" : "6+6 추가 혜택");
    setText("stat-extra", man(r.extra));
    setText("stat-extra-note", r.extra > 0 ? "일반 육아휴직 대비" : "일반과 같음");

    var rows = r.rows.map(function (x) {
      var cls = x.special ? "is-special" : "";
      return '<tr class="' + cls + '">' +
        "<td>" + x.month + "개월</td>" +
        "<td>" + pct(x.rate) + "</td>" +
        "<td>" + manNum(x.cap) + "만</td>" +
        "<td>" + manNum(x.amount) + "만</td>" +
        "<td>" + manNum(x.cumulative) + "만</td>" +
        "</tr>";
    });
    setHTML("leave-body", rows.join(""));

    if (r.extra > 0) {
      setText("leave-foot",
        "같은 조건에서 " + (r.household === "single" ? "한부모 특례 없이" : "6+6 없이") + " 계산하면 " +
        man(r.generalTotal) + "입니다. 지금 조건으로 " + man(r.extra) + " 더 받습니다.");
    } else if (r.household === "both" && r.spouseMonths === 0) {
      setText("leave-foot",
        "배우자도 육아휴직을 쓰고 자녀가 생후 18개월 안이면 6+6이 적용됩니다. 지금은 일반 급여 기준입니다.");
    } else if (r.household === "both" && !r.under18) {
      setText("leave-foot",
        "자녀가 생후 18개월을 넘겨 시작하면 6+6이 적용되지 않습니다. 지금은 일반 급여 기준입니다.");
    } else {
      setText("leave-foot", "지금 조건에서는 일반 육아휴직 급여와 같은 금액입니다.");
    }

    var b = [];
    b.push(row("월 통상임금", won(r.wage), "휴직 개시일 기준 · 비과세"));
    b.push(row("1~3개월", man(r.bands.first3),
      capNote(r, 1) + " × " + Math.min(r.months, 3) + "개월", "sum"));
    if (r.months > 3) {
      b.push(row("4~6개월", man(r.bands.m4to6),
        capNote(r, 4) + " × " + (Math.min(r.months, 6) - 3) + "개월"));
    }
    if (r.months > 6) {
      b.push(row("7개월 이후", man(r.bands.m7plus),
        "통상임금 80% · 상한 160만원 × " + (r.months - 6) + "개월"));
    }
    b.push(row("합계", man(r.total), r.months + "개월 · 사후지급금 없이 전액", "final"));
    if (r.extra > 0) {
      b.push(row("일반 급여 기준", man(r.generalTotal), "6+6·한부모 특례 미적용"));
      b.push(row("추가 혜택", "+" + man(r.extra), "특례 적용 차액", "sum"));
    }
    setHTML("leave-breakdown-body", b.join(""));

    var capped = r.capped.cap;
    setText("leave-breakdown-note",
      "2025년 1월 1일 이후 사용한 육아휴직부터 사후지급금(급여의 25%를 복직 후 지급)이 폐지되어, 휴직 중에 전액을 받습니다. 육아휴직 급여는 소득세가 붙지 않는 비과세 급여입니다." +
      (capped > 0 ? " 이 조건에서는 " + capped + "개월에 상한이 적용됐습니다." : ""));
  }

  function capNote(r, from) {
    if (r.household === "single" && from === 1) return "통상임금 100% · 상한 300만원";
    if (from === 1) {
      if (r.common >= 3) return "통상임금 100% · 6+6 상한 250·250·300만원";
      if (r.common === 2) return "100% · 6+6 상한 250·250만원, 이후 250만원";
      if (r.common === 1) return "100% · 6+6 상한 250만원, 이후 250만원";
      return "통상임금 100% · 상한 250만원";
    }
    if (r.common >= 6) return "통상임금 100% · 6+6 상한 350·400·450만원";
    if (r.common > 3) return "통상임금 100% · 6+6 " + r.common + "개월까지 상한 인상";
    return "통상임금 100% · 상한 200만원";
  }

  function row(label, value, note, cls) {
    return "<tr" + (cls ? ' class="' + cls + '"' : "") + ">" +
      '<th scope="row">' + label + (note ? '<br><span class="fine">' + note + "</span>" : "") + "</th>" +
      "<td>" + value + "</td></tr>";
  }

  /* ── 렌더: 탭 2 지원금 ───────────────────────────────────── */
  function benefitBadge(r) {
    var bits = [];
    if (r.age <= 23) bits.push("부모급여 대상");
    else bits.push("아동수당 대상");
    if (r.childcare) bits.push("어린이집·유치원");
    return bits.join(" · ");
  }

  function renderBenefit() {
    var r = C.calcBenefits(state);
    last.benefit = r;

    setText("benefit-badge", benefitBadge(r));
    setText("benefit-title", "지금부터 만 9세까지 " + man(r.total));
    setText("benefit-sub",
      r.age + "개월 · " + RANK_LABEL[r.rank] + " · " + r.regionLabel + " · " +
      (r.childcare ? "어린이집·유치원 이용" : "가정양육"));

    setText("stat-month-now", man(r.monthlyNow));
    var parts = [];
    if (r.age <= 23) parts.push("부모급여 " + manNum(C.parentBenefitAt(r.age, r.childcare)) + "만");
    parts.push("아동수당 " + manNum(r.monthlyChild) + "만");
    var careNow = C.careAllowanceAt(r.age, r.childcare);
    if (careNow > 0) parts.push("양육수당 " + manNum(careNow) + "만");
    setText("stat-month-note", parts.join(" + "));
    setText("stat-to2", r.age <= 23 ? man(r.totalTo2) : "—");
    setText("stat-to2-note", r.age <= 23 ? "첫만남 포함" : "부모급여 이미 종료");
    setText("stat-child", man(r.child));
    setText("stat-child-note", r.childMonths > 0
      ? "만 9세까지 " + r.childMonths + "개월"
      : "지급 대상 아님");
    setText("stat-first", man(r.firstMeeting));
    setText("stat-first-note", r.age >= 24 ? "출생 2년 지나 해당 없음"
      : (r.includeFirst ? "출생 1회 · 2년 내 사용" : "합산하지 않음"));

    var rows = r.bands.map(function (b) {
      var period = b.from === b.to ? b.from + "개월" : b.from + "~" + b.to + "개월";
      var detail = [];
      if (b.parent > 0) detail.push("부모 " + manNum(b.parent) + "만");
      if (b.child > 0) detail.push("아동 " + manNum(b.child) + "만");
      if (b.care > 0) detail.push("양육 " + manNum(b.care) + "만");
      return "<tr>" +
        "<td>" + period + "</td>" +
        "<td>" + manNum(b.monthly) + "만</td>" +
        '<td>' + (detail.length ? detail.join(" + ") : "—") + "</td>" +
        '<td>' + manNum(b.total) + "만</td>" +
        "</tr>";
    });
    setHTML("benefit-body", rows.join(""));

    var foot;
    if (r.age > 23) {
      foot = "부모급여는 만 2세 미만까지라 이미 끝났습니다. 지금부터는 아동수당" +
        (r.care > 0 ? "과 가정양육수당" : "") + "만 계산했습니다.";
    } else if (r.firstMeeting > 0) {
      foot = "첫만남이용권 " + man(r.firstMeeting) + "까지 더한 금액입니다. 만 2세까지는 " +
        man(r.totalTo2) + "이고, 지방자치단체의 출산지원금은 포함하지 않았습니다.";
    } else {
      foot = "첫만남이용권은 합산하지 않았습니다. 지방자치단체의 출산지원금은 포함하지 않았습니다.";
    }
    setText("benefit-foot", foot);

    var b = [];
    b.push(row("자녀 나이", r.age + "개월", r.childcare ? "어린이집 이용" : "가정양육"));
    b.push(row("부모급여", man(r.parent),
      r.parentMonths > 0
        ? r.parentMonths + "개월" + (r.childcare ? " · 보육료 뺀 차액" : " · 0세 100만·1세 50만")
        : "지급 기간 종료"));
    b.push(row("아동수당", man(r.child),
      r.childMonths > 0
        ? r.childMonths + "개월 × " + won(r.monthlyChild) + " (" + r.regionLabel + ")"
        : "지급 기간 종료"));
    b.push(row("가정양육수당", man(r.care),
      r.care > 0 ? r.careMonths + "개월 × 10만원" : (r.childcare ? "어린이집 이용 시 없음" : "해당 없음")));
    b.push(row("첫만남이용권", man(r.firstMeeting),
      r.firstMeeting > 0 ? RANK_LABEL[r.rank] + " · 출생 1회" : "합산하지 않음"));
    b.push(row("합계", man(r.total), "지금부터 만 9세까지", "final"));
    setHTML("benefit-breakdown-body", b.join(""));
  }

  function renderAll() {
    syncInputs();
    renderLeave();
    renderBenefit();
  }

  /* ── 탭 ──────────────────────────────────────────────────── */
  function setTab(tab, push) {
    var target = tab === "benefit" ? "benefit" : "leave";
    state.tab = target;
    all(".tab").forEach(function (b) {
      var active = b.getAttribute("data-tab") === target;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    var pl = $("panel-leave");
    var pb = $("panel-benefit");
    show(pl, target === "leave");
    show(pb, target === "benefit");
    if (pl) pl.classList.toggle("is-active", target === "leave");
    if (pb) pb.classList.toggle("is-active", target === "benefit");
    if (push && window.history && window.history.replaceState) {
      try { window.history.replaceState(null, "", "#" + target); } catch (e) { /* 무시 */ }
    }
    save();
  }

  /* ── 요약 복사 ───────────────────────────────────────────── */
  function summaryLeave() {
    var r = last.leave;
    if (!r) return "";
    var lines = [
      "2026 육아휴직 급여 계산",
      "· 월 통상임금 " + won(r.wage) + " · " + r.months + "개월",
      "· " + specialNote(r) + (r.common > 0 ? " 적용" : " 기준"),
      "· 1~3개월 " + man(r.bands.first3) + " / 4~6개월 " + man(r.bands.m4to6) + " / 7개월 이후 " + man(r.bands.m7plus),
      "· 합계 " + man(r.total) + " (일반 기준 " + man(r.generalTotal) + ", 차액 " + man(r.extra) + ")",
      "· 계산: https://ufssdf987-creator.github.io/parenting-benefit/"
    ];
    return lines.join("\n");
  }

  function summaryBenefit() {
    var r = last.benefit;
    if (!r) return "";
    return [
      "2026 출산·양육 지원금 계산",
      "· " + r.age + "개월 · " + RANK_LABEL[r.rank] + " · " + r.regionLabel + " · " + (r.childcare ? "어린이집·유치원" : "가정양육"),
      "· 부모급여 " + man(r.parent) + " / 아동수당 " + man(r.child) + " / 양육수당 " + man(r.care),
      "· 첫만남이용권 " + man(r.firstMeeting) + " / 만 2세까지 " + man(r.totalTo2),
      "· 지금부터 만 9세까지 " + man(r.total),
      "· 계산: https://ufssdf987-creator.github.io/parenting-benefit/"
    ].join("\n");
  }

  function copyText(text, toastId) {
    var done = function () { toast(toastId, "요약을 복사했어요"); };
    var fail = function () { toast(toastId, "복사가 안 되면 길게 눌러 직접 복사해 주세요"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) ? done() : fail(); });
    } else {
      legacyCopy(text) ? done() : fail();
    }
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  var toastTimer = null;
  function toast(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 2200);
  }

  /* ── 이벤트 ──────────────────────────────────────────────── */
  function bindEvents() {
    all(".tab").forEach(function (b) {
      on(b, "click", function () { setTab(b.getAttribute("data-tab"), true); });
    });

    all(".seg").forEach(function (seg) {
      var group = seg.getAttribute("data-group");
      all("button", seg).forEach(function (b) {
        on(b, "click", function () {
          var v = b.getAttribute("data-value");
          if (group === "household" || group === "rank") state[group] = v;
          else return;
          sanitize();
          renderAll();
          save();
        });
      });
    });

    all("[data-toggle]").forEach(function (cb) {
      on(cb, "change", function () {
        state[cb.getAttribute("data-toggle")] = cb.checked;
        sanitize();
        renderAll();
        save();
      });
    });

    on($("region-select"), "change", function () {
      state.region = $("region-select").value;
      sanitize();
      renderAll();
      save();
    });

    all("[data-key]").forEach(function (el) {
      var key = el.getAttribute("data-key");
      var kind = el.getAttribute("data-kind");
      var ev = el.tagName === "SELECT" ? "change" : "input";
      on(el, ev, function () {
        if (el.tagName === "SELECT") {
          state[key] = Number(el.value);
        } else if (kind === "dec") {
          var cleaned = el.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
          el.value = cleaned;
          state[key] = C.toNumber(cleaned, 0);
        } else {
          var digits = el.value.replace(/[^0-9]/g, "");
          state[key] = digits ? Number(digits) : 0;
          var pos = el.selectionStart === el.value.length;
          el.value = digits ? C.group(Number(digits)) : "";
          if (pos) el.setSelectionRange(el.value.length, el.value.length);
        }
        sanitize();
        renderAll();
        save();
      });
      on(el, "blur", function () {
        sanitize();
        renderAll();
        save();
      });
    });

    all("[data-target]").forEach(function (b) {
      on(b, "click", function () {
        var target = b.getAttribute("data-target");
        var value = Number(b.getAttribute("data-value"));
        state[target] = value;
        sanitize();
        renderAll();
        save();
      });
    });

    on($("to-benefit"), "click", function () {
      setTab("benefit", true);
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { /* 무시 */ }
    });
    on($("to-leave"), "click", function () {
      setTab("leave", true);
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { /* 무시 */ }
    });

    on($("copy-leave"), "click", function () { copyText(summaryLeave(), "toast-leave"); });
    on($("copy-benefit"), "click", function () { copyText(summaryBenefit(), "toast-benefit"); });
    on($("link-top"), "click", function (e) {
      e.preventDefault();
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (err) { window.scrollTo(0, 0); }
    });
  }

  /* ── 광고 ────────────────────────────────────────────────── */
  function mountAds() {
    var preview = false;
    try { preview = new URLSearchParams(window.location.search).get("ads") === "preview"; } catch (e) { /* 무시 */ }
    all(".ad-slot").forEach(function (slot) {
      var unit = ADSENSE.slots[slot.id] || slot.getAttribute("data-ad-slot") || "";
      if (ADSENSE.client && unit) {
        slot.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="' + ADSENSE.client +
          '" data-ad-slot="' + unit + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
        slot.removeAttribute("hidden");
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* 무시 */ }
      } else if (preview) {
        slot.textContent = "광고 영역 — AdSense 승인 후 이 자리에 표시됩니다";
        slot.classList.add("is-placeholder");
        slot.removeAttribute("hidden");
      } else {
        slot.setAttribute("hidden", "");
      }
    });
  }

  /* ── PWA ─────────────────────────────────────────────────── */
  var deferredPrompt = null;
  var handheld = false;
  try { handheld = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (e) { /* 무시 */ }

  function initPwa() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () { /* 오프라인 미지원 */ });
      });
    }
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      if (handheld) show($("install-card"), true);
    });
    on($("install-btn"), "click", function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
        show($("install-card"), false);
      });
    });
    window.addEventListener("appinstalled", function () { show($("install-card"), false); });
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  function init() {
    load();
    bindEvents();
    mountAds();
    initPwa();
    var hash = String(window.location.hash || "").replace("#", "");
    setTab(hash === "benefit" ? "benefit" : "leave", false);
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* 테스트·디버그용 */
  window.PBApp = {
    state: state,
    get results() { return last; },
    render: renderAll,
    summary: function (tab) { return tab === "benefit" ? summaryBenefit() : summaryLeave(); },
    config: ADSENSE
  };
})();
