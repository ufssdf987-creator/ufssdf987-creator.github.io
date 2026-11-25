/*!
 * 퇴직금·실업급여·주휴수당 계산기 — UI 스크립트
 * 계산은 calc.js(SPCalc)가 맡고, 이 파일은 화면·저장·공유만 다룹니다.
 */
(function () {
  "use strict";

  var C = window.SPCalc;
  var CFG = window.APP_CONFIG || {};
  var STORAGE_KEY = "spcalc.state.v1";
  var reducedMotion = false;
  try {
    reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { /* 무시 */ }

  var DEFAULTS = {
    tab: "pay",
    hireDate: "2019-03-04",
    leaveDate: "2026-11-30",
    wage3: 900,              // 만원
    annualBonus: 300,        // 만원
    annualLeavePay: 0,       // 만원
    ordinaryDaily: null,     // 원
    jobMode: "monthly",
    jobWage: 300,            // 만원
    jobBand: "3to5",
    jobOver50: false,
    jobHours: 8,
    wkHourly: 10320,
    wkHours: 20,
    wkAttend: true
  };

  var state = {};
  Object.keys(DEFAULTS).forEach(function (k) { state[k] = DEFAULTS[k]; });

  var last = { pay: null, job: null, weekly: null };

  /* ── 작은 도우미 ─────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function on(el, ev, fn) { if (el && el.addEventListener) el.addEventListener(ev, fn); }
  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[^0-9.-]/g, ""));
    return isFinite(n) ? n : 0;
  }
  function man(v) { return Math.round(num(v) * 10000); }
  function won(n) { return C.comma(Math.round(num(n))) + "원"; }
  function setText(id, txt) {
    var el = $(id);
    if (el) el.textContent = txt;
  }
  function setHTML(id, html) {
    var el = $(id);
    if (el) el.innerHTML = html;
  }
  function show(el, yes) {
    if (!el) return;
    if (yes) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  }
  function toggleClass(el, cls, yes) { if (el) el.classList.toggle(cls, !!yes); }

  /* ── 숫자 입력 표시(천 단위 콤마, 커서 유지) ─────────────── */
  function formatMoney(el) {
    if (!el) return;
    var raw = String(el.value || "");
    var caret = el.selectionStart == null ? raw.length : el.selectionStart;
    var before = raw.slice(0, caret).replace(/[^0-9]/g, "").length;
    var digits = raw.replace(/[^0-9]/g, "").slice(0, 12);
    var formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (el.value === formatted) return;
    el.value = formatted;
    var pos = 0, seen = 0;
    while (pos < formatted.length && seen < before) {
      if (/[0-9]/.test(formatted.charAt(pos))) seen++;
      pos++;
    }
    try { el.setSelectionRange(pos, pos); } catch (e) { /* 무시 */ }
  }

  /* ── 저장 ────────────────────────────────────────────────── */
  function save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }
  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      Object.keys(DEFAULTS).forEach(function (k) {
        if (saved[k] !== undefined && saved[k] !== null) state[k] = saved[k];
      });
    } catch (e) { /* 무시 */ }
  }
  function clamp() {
    var iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(String(state.hireDate))) state.hireDate = DEFAULTS.hireDate;
    if (!iso.test(String(state.leaveDate))) state.leaveDate = DEFAULTS.leaveDate;
    ["wage3", "annualBonus", "annualLeavePay", "jobWage"].forEach(function (k) {
      state[k] = Math.min(1000000, Math.max(0, Math.round(num(state[k]))));
    });
    state.ordinaryDaily = state.ordinaryDaily == null || state.ordinaryDaily === ""
      ? null : Math.min(100000000, Math.max(0, Math.round(num(state.ordinaryDaily))));
    state.jobHours = Math.min(8, Math.max(1, Math.round(num(state.jobHours) || 8)));
    state.wkHourly = Math.min(1000000, Math.max(0, Math.round(num(state.wkHourly))));
    state.wkHours = Math.min(80, Math.max(0, Math.round(num(state.wkHours))));
    state.wkAttend = state.wkAttend !== false;
    if (["pay", "job", "weekly"].indexOf(state.tab) < 0) state.tab = "pay";
  }

  /* ── 입력 → 화면 동기화 ─────────────────────────────────── */
  function syncInputs() {
    var hire = $("hire-date"), leave = $("leave-date");
    if (hire) hire.value = state.hireDate;
    if (leave) leave.value = state.leaveDate;
    if ($("wage3")) $("wage3").value = C.comma(state.wage3);
    if ($("annual-bonus")) $("annual-bonus").value = C.comma(state.annualBonus);
    if ($("annual-leave")) $("annual-leave").value = C.comma(state.annualLeavePay);
    if ($("ordinary-daily")) $("ordinary-daily").value = state.ordinaryDaily ? C.comma(state.ordinaryDaily) : "";

    if ($("js-wage")) $("js-wage").value = C.comma(state.jobWage);
    if ($("js-band")) $("js-band").value = state.jobBand;
    if ($("js-hours")) $("js-hours").value = state.jobHours;

    if ($("wk-hourly")) $("wk-hourly").value = C.comma(state.wkHourly);
    if ($("wk-hours")) $("wk-hours").value = state.wkHours;
    if ($("wk-attend")) $("wk-attend").checked = state.wkAttend;

    all("[data-jsmode]").forEach(function (b) {
      var onMode = b.getAttribute("data-jsmode") === state.jobMode;
      b.classList.toggle("is-active", onMode);
      b.setAttribute("aria-pressed", onMode ? "true" : "false");
    });
    all("[data-age]").forEach(function (b) {
      var onAge = (b.getAttribute("data-age") === "over") === !!state.jobOver50;
      b.classList.toggle("is-active", onAge);
      b.setAttribute("aria-pressed", onAge ? "true" : "false");
    });
    var wageLabel = $("js-wage-label");
    if (wageLabel) wageLabel.textContent = state.jobMode === "monthly" ? "월 평균 급여" : "퇴직 전 3개월 급여 총액";
  }

  /* ── 탭 ──────────────────────────────────────────────────── */
  function setTab(tab, focus) {
    state.tab = ["pay", "job", "weekly"].indexOf(tab) >= 0 ? tab : "pay";
    ["pay", "job", "weekly"].forEach(function (key) {
      var btn = $("tab-btn-" + key), panel = $("panel-" + key);
      var onTab = key === state.tab;
      if (btn) {
        btn.classList.toggle("is-active", onTab);
        btn.setAttribute("aria-selected", onTab ? "true" : "false");
        btn.tabIndex = onTab ? 0 : -1;
      }
      if (panel) panel.classList.toggle("is-active", onTab);
    });
    if (window.history && window.history.replaceState) {
      try { window.history.replaceState(null, "", "#" + state.tab); } catch (e) { /* 무시 */ }
    }
    if (focus) {
      var panelEl = $("panel-" + state.tab);
      if (panelEl && panelEl.scrollIntoView) {
        panelEl.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }
    }
    save();
  }

  /* ── 결과 그리기: 퇴직금 ────────────────────────────────── */
  function row(label, value, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : "") + "><th>" + label + "</th><td>" + value + "</td></tr>";
  }

  function renderPay() {
    var r = C.severance({
      hireDate: state.hireDate,
      leaveDate: state.leaveDate,
      wage3: man(state.wage3),
      annualBonus: man(state.annualBonus),
      annualLeavePay: man(state.annualLeavePay),
      dailyOrdinary: state.ordinaryDaily ? num(state.ordinaryDaily) : 0
    });
    last.pay = r;

    setText("wage3-won", "= " + won(man(state.wage3)));
    var badge = $("pay-badge");

    if (!r.ok) {
      setText("pay-amount", "0");
      setText("pay-sub", r.error);
      setText("pay-badge", "입력 확인");
      if (badge) { badge.className = "verdict-badge is-warn"; }
      setText("pay-days", "-");
      setText("pay-daily", "-");
      setText("pay-total-wage", "-");
      setText("pay-tax", "-");
      setText("pay-net", "-");
      setHTML("pay-breakdown", row("입력 확인", r.error));
      return;
    }

    setText("pay-amount", C.comma(r.severance));
    setText("pay-sub", "1일 평균임금 " + won(r.dailyUsed) + " × 30일 × " + C.comma(r.days) + "/365");
    setText("period-note", "재직 " + C.comma(r.days) + "일 (" + r.serviceText + ") · 퇴직일은 마지막 근무일 다음 날이에요.");

    var eligible = r.eligible;
    setText("pay-badge", eligible ? "근속 " + r.serviceText : "1년 미만 · 지급 대상 아님");
    if (badge) badge.className = "verdict-badge" + (eligible ? "" : " is-warn");

    setText("pay-days", C.comma(r.days) + "일");
    setText("pay-days-note", r.years ? r.years.toFixed(1) + "년" : "1년 미만");
    setText("pay-daily", won(r.dailyUsed));
    setText("pay-daily-note", r.ordinaryApplied ? "통상임금 적용" : "3개월 " + r.periodDays + "일 기준");
    setText("pay-total-wage", C.shortWon(r.totalWage));
    setText("pay-tax", won(r.tax.total));
    setText("pay-tax-note", r.severance ? (r.tax.effectiveRate * 100).toFixed(2) + "%" : "세금 없음");
    setText("pay-net", won(r.net));

    var html = "";
    html += row("최근 3개월 급여", won(r.wage3));
    html += row("연간 상여금 × 3/12", won(r.bonus3));
    html += row("연차수당 × 3/12", won(r.annual3));
    html += row("임금총액", won(r.totalWage), "sum");
    html += row("÷ 3개월 총일수 (" + r.periodDays + "일)", won(r.dailyAvg));
    html += row("1일 평균임금", won(r.dailyUsed), "final");
    if (r.ordinaryApplied) html += row("통상임금이 더 커서 대체", won(r.dailyOrdinary));
    html += row("× 30일 × " + C.comma(r.days) + "/365", won(r.severance), "final");
    html += row("근속연수공제 (" + r.tax.years + "년)", "-" + won(r.tax.serviceDeduction));
    html += row("환산급여", won(r.tax.converted));
    html += row("환산급여공제", "-" + won(r.tax.convertedDeduction));
    html += row("과세표준", won(r.tax.taxBase), "sum");
    html += row("환산산출세액 (기본세율)", won(r.tax.convertedTax));
    html += row("퇴직소득세", won(r.tax.tax));
    html += row("지방소득세 (10%)", won(r.tax.localTax));
    html += row("세후 예상 수령액", won(r.net), "final");
    setHTML("pay-breakdown", html);
  }

  /* ── 결과 그리기: 실업급여 ──────────────────────────────── */
  function renderJob() {
    var r = C.jobSeek({
      mode: state.jobMode,
      monthlyWage: man(state.jobWage),
      totalWage: man(state.jobWage),
      band: state.jobBand,
      over50: state.jobOver50,
      dailyHours: state.jobHours
    });
    last.job = r;

    var wageText = state.jobMode === "monthly"
      ? "= " + won(man(state.jobWage)) + " · 3개월 " + won(man(state.jobWage) * 3)
      : "= " + won(man(state.jobWage));
    setText("js-wage-help", wageText + " · 총일수 " + r.periodDays + "일 기준");

    setText("job-amount", C.comma(r.daily));
    var ruleText = r.rule === "min" ? "하한액 적용" : (r.rule === "max" ? "상한액 적용" : "평균임금 60%");
    setText("job-badge", ruleText);
    var badge = $("job-badge");
    if (badge) badge.className = "verdict-badge" + (r.rule === "pct" ? "" : (r.rule === "min" ? " is-zero" : " is-warn"));

    setText("job-sub", "소정급여일수 " + r.days + "일 × " + won(r.daily) + " = " + won(r.total));
    setText("job-basis", won(Math.floor(r.basis)));
    setText("job-basis-note", r.basisCapped ? "상한 113,500원 초과 → 상한 적용" : "3개월 " + r.periodDays + "일 기준");
    setText("job-days", r.days + "일");
    setText("job-days-note", r.bandLabel + (r.over50 ? " · 50세 이상" : " · 50세 미만"));
    setText("job-total", won(r.total));
    setText("job-monthly", won(r.monthly));

    var html = "";
    html += row("퇴직 전 3개월 임금총액", won(r.total3));
    html += row("÷ 3개월 총일수 (" + r.periodDays + "일)", won(r.basis));
    html += row("1일 평균임금(기초일액)", won(r.basis), "sum");
    if (r.basisCapped) html += row("기초일액 상한 적용", won(r.basisApplied));
    html += row("× 60%", won(r.rawBenefit));
    html += row("하한액 (" + r.dailyHours + "시간 기준)", won(r.lowLimit));
    html += row("상한액", won(r.highLimit));
    html += row("적용 1일 구직급여액", won(r.daily), "final");
    html += row("× 소정급여일수 (" + r.days + "일)", won(r.total), "final");
    html += row("30일 환산", won(r.monthly));
    setHTML("job-breakdown", html);
  }

  /* ── 결과 그리기: 주휴수당 ──────────────────────────────── */
  function renderWeekly() {
    var r = C.weekly({
      hourly: state.wkHourly,
      weeklyHours: state.wkHours,
      attended: state.wkAttend
    });
    last.weekly = r;

    setText("wk-amount", C.comma(r.holidayPay));
    var badge = $("wk-badge");
    var badgeText, badgeClass = "verdict-badge";
    if (!r.over15) {
      badgeText = "주 15시간 미만 · 대상 아님";
      badgeClass += " is-warn";
    } else if (!r.attended) {
      badgeText = "결근 있음 · 이번 주 없음";
      badgeClass += " is-warn";
    } else {
      badgeText = "주 " + C.comma(r.weeklyHours) + "시간 · 지급 대상";
    }
    setText("wk-badge", badgeText);
    if (badge) badge.className = badgeClass;

    if (!r.over15) {
      setText("wk-sub", "4주 평균 1주 소정근로시간이 15시간 이상이어야 주휴수당이 생겨요.");
    } else if (!r.attended) {
      setText("wk-sub", "그 주에 결근한 날이 있으면 주휴수당은 없어요.");
    } else {
      setText("wk-sub", "시급 " + won(r.hourly) + " × 주휴 " + r.holidayHours + "시간 = " + won(r.holidayPay));
    }

    setText("wk-holiday-hours", r.holidayHours + "시간");
    setText("wk-week-total", won(r.weekTotal));
    setText("wk-monthly-total", C.shortWon(r.monthlyTotal));
    setText("wk-monthly-holiday", won(r.monthlyHoliday));

    var warn = $("wk-warning");
    var warns = [];
    if (r.belowMin) warns.push("2026년 최저임금(시급 " + C.comma(r.minWage) + "원)보다 " + won(r.minWageGap) + " 낮아요. 최저임금 미만은 법 위반이에요.");
    if (r.cappedByFullWeek) warns.push("주 40시간을 넘는 시간은 주휴수당에 반영되지 않아요. 초과분은 연장근로수당으로 따로 계산합니다.");
    if (warns.length) { warn.textContent = warns.join(" "); show(warn, true); }
    else { warn.textContent = ""; show(warn, false); }

    var html = "";
    html += row("시급", won(r.hourly));
    html += row("1주 소정근로시간", r.weeklyHours + "시간");
    html += row("15시간 이상 여부", r.over15 ? "해당" : "미달");
    html += row("개근", r.attended ? "했음" : "결근 있음");
    html += row("주휴 시간 (÷40×8, 최대 8)", r.holidayHours + "시간", "sum");
    html += row("주휴수당", won(r.holidayPay), "final");
    html += row("주급 (근로 " + won(r.weeklyPay) + " + 주휴)", won(r.weekTotal));
    html += row("월 환산 (" + r.weeksPerMonth + "주)", won(r.monthlyTotal), "final");
    setHTML("wk-breakdown", html);
  }

  function renderAll() {
    renderPay();
    renderJob();
    renderWeekly();
  }

  /* ── 결과 문구(복사·공유) ──────────────────────────────── */
  function summaryText(kind) {
    var lines = [];
    if (kind === "pay" && last.pay && last.pay.ok) {
      var p = last.pay;
      lines.push("[퇴직금 계산]");
      lines.push("근속 " + p.serviceText + " (" + C.comma(p.days) + "일)");
      lines.push("1일 평균임금 " + won(p.dailyUsed));
      lines.push("예상 퇴직금 " + won(p.severance) + " (세전)");
      lines.push("퇴직소득세+지방세 " + won(p.tax.total));
      lines.push("세후 예상 " + won(p.net));
    } else if (kind === "job" && last.job) {
      var j = last.job;
      lines.push("[실업급여(구직급여) 계산]");
      lines.push("1일 구직급여 " + won(j.daily) + " (" + (j.rule === "min" ? "하한액" : j.rule === "max" ? "상한액" : "평균임금 60%") + ")");
      lines.push("소정급여일수 " + j.days + "일 (" + j.bandLabel + (j.over50 ? " · 50세 이상" : " · 50세 미만") + ")");
      lines.push("예상 총 수령액 " + won(j.total) + " (세전)");
    } else if (kind === "weekly" && last.weekly) {
      var w = last.weekly;
      lines.push("[주휴수당 계산]");
      lines.push("시급 " + won(w.hourly) + " · 1주 소정근로 " + w.weeklyHours + "시간");
      lines.push("주휴 " + w.holidayHours + "시간 → 주휴수당 " + won(w.holidayPay));
      lines.push("주급 합계 " + won(w.weekTotal));
      lines.push("월 환산 " + won(w.monthlyTotal));
    } else {
      return "";
    }
    lines.push("");
    lines.push("2026년 기준 참고용 · 퇴직금·실업급여·주휴수당 계산기");
    return lines.join("\n");
  }

  function toast(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    window.setTimeout(function () { el.classList.remove("is-on"); }, 2200);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error("copy failed"));
      } catch (err) { reject(err); }
    });
  }

  function share(kind, toastId) {
    var text = summaryText(kind);
    if (!text) { toast(toastId, "계산 결과가 아직 없어요"); return; }
    copyText(text).then(function () {
      toast(toastId, "결과를 복사했어요. 붙여넣어 확인하세요.");
    }).catch(function () {
      toast(toastId, "복사가 막혔어요. 화면의 숫자를 직접 확인해 주세요.");
    });
  }

  /* ── 이벤트 ──────────────────────────────────────────────── */
  function bindMoney(id, key, isMan) {
    var el = $(id);
    if (!el) return;
    on(el, "input", function () {
      formatMoney(el);
      var v = num(el.value);
      state[key] = isMan ? Math.round(v) : Math.round(v);
      save();
      if (key === "wage3" || key === "annualBonus" || key === "annualLeavePay" || key === "ordinaryDaily") renderPay();
      if (key === "jobWage") renderJob();
      if (key === "wkHourly") renderWeekly();
    });
    on(el, "blur", function () {
      if (key === "ordinaryDaily" && !num(el.value)) { state.ordinaryDaily = null; el.value = ""; renderPay(); }
    });
  }

  function todayISO() {
    var d = new Date();
    var p = function (v) { return (v < 10 ? "0" : "") + v; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function monthEndISO() {
    var d = new Date();
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    var p = function (v) { return (v < 10 ? "0" : "") + v; };
    return last.getFullYear() + "-" + p(last.getMonth() + 1) + "-" + p(last.getDate());
  }

  function bindEvents() {
    /* 탭 */
    ["pay", "job", "weekly"].forEach(function (key) {
      var btn = $("tab-btn-" + key);
      on(btn, "click", function () { setTab(key, true); });
      on(btn, "keydown", function (e) {
        var order = ["pay", "job", "weekly"];
        var i = order.indexOf(state.tab);
        if (e.key === "ArrowRight") { e.preventDefault(); setTab(order[(i + 1) % 3], true); $("tab-btn-" + order[(i + 1) % 3]).focus(); }
        if (e.key === "ArrowLeft") { e.preventDefault(); setTab(order[(i + 2) % 3], true); $("tab-btn-" + order[(i + 2) % 3]).focus(); }
      });
    });

    /* 퇴직금 */
    on($("hire-date"), "change", function () { state.hireDate = this.value; save(); renderPay(); });
    on($("leave-date"), "change", function () { state.leaveDate = this.value; save(); renderPay(); });
    bindMoney("wage3", "wage3", true);
    bindMoney("annual-bonus", "annualBonus", true);
    bindMoney("annual-leave", "annualLeavePay", true);
    bindMoney("ordinary-daily", "ordinaryDaily", false);

    all("[data-wage3]").forEach(function (b) {
      on(b, "click", function () {
        state.wage3 = +b.getAttribute("data-wage3");
        syncInputs(); save(); renderPay();
      });
    });
    all("[data-leave]").forEach(function (b) {
      on(b, "click", function () {
        state.leaveDate = b.getAttribute("data-leave") === "today" ? todayISO() : monthEndISO();
        syncInputs(); save(); renderPay();
      });
    });

    /* 실업급여 */
    all("[data-jsmode]").forEach(function (b) {
      on(b, "click", function () {
        state.jobMode = b.getAttribute("data-jsmode") === "total" ? "total" : "monthly";
        syncInputs(); save(); renderJob();
      });
    });
    bindMoney("js-wage", "jobWage", true);
    on($("js-band"), "change", function () { state.jobBand = this.value; save(); renderJob(); });
    all("[data-age]").forEach(function (b) {
      on(b, "click", function () {
        state.jobOver50 = b.getAttribute("data-age") === "over";
        syncInputs(); save(); renderJob();
      });
    });
    on($("js-hours"), "input", function () {
      state.jobHours = Math.min(8, Math.max(1, Math.round(num(this.value) || 8)));
      save(); renderJob();
    });
    all("[data-jswage]").forEach(function (b) {
      on(b, "click", function () {
        state.jobWage = +b.getAttribute("data-jswage");
        syncInputs(); save(); renderJob();
      });
    });

    /* 주휴수당 */
    bindMoney("wk-hourly", "wkHourly", false);
    on($("wk-hours"), "input", function () {
      state.wkHours = Math.min(80, Math.max(0, Math.round(num(this.value))));
      save(); renderWeekly();
    });
    on($("wk-attend"), "change", function () { state.wkAttend = this.checked; save(); renderWeekly(); });
    all("[data-hourly]").forEach(function (b) {
      on(b, "click", function () {
        state.wkHourly = +b.getAttribute("data-hourly");
        syncInputs(); save(); renderWeekly();
      });
    });
    all("[data-hours]").forEach(function (b) {
      on(b, "click", function () {
        state.wkHours = +b.getAttribute("data-hours");
        syncInputs(); save(); renderWeekly();
      });
    });

    /* 복사·초기화 */
    on($("share-pay"), "click", function () { share("pay", "toast-pay"); });
    on($("share-job"), "click", function () { share("job", "toast-job"); });
    on($("share-weekly"), "click", function () { share("weekly", "toast-weekly"); });

    var payDefaults = ["hireDate", "leaveDate", "wage3", "annualBonus", "annualLeavePay", "ordinaryDaily"];
    on($("reset-pay"), "click", function () {
      payDefaults.forEach(function (k) { state[k] = DEFAULTS[k]; });
      syncInputs(); save(); renderPay(); toast("toast-pay", "퇴직금 입력을 처음 값으로 되돌렸어요.");
    });
    var jobDefaults = ["jobMode", "jobWage", "jobBand", "jobOver50", "jobHours"];
    on($("reset-job"), "click", function () {
      jobDefaults.forEach(function (k) { state[k] = DEFAULTS[k]; });
      syncInputs(); save(); renderJob(); toast("toast-job", "실업급여 입력을 처음 값으로 되돌렸어요.");
    });
    var wkDefaults = ["wkHourly", "wkHours", "wkAttend"];
    on($("reset-weekly"), "click", function () {
      wkDefaults.forEach(function (k) { state[k] = DEFAULTS[k]; });
      syncInputs(); save(); renderWeekly(); toast("toast-weekly", "주휴수당 입력을 처음 값으로 되돌렸어요.");
    });
  }

  /* ── 광고 ────────────────────────────────────────────────── */
  function mountAds() {
    var ads = (CFG.adsense || {});
    var preview = false;
    try { preview = new URLSearchParams(window.location.search).get("ads") === "preview"; } catch (e) { /* 무시 */ }
    all(".ad-slot").forEach(function (slot) {
      var unit = (ads.slots && ads.slots[slot.id]) || slot.getAttribute("data-ad-slot") || "";
      if (ads.client && unit) {
        slot.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="' + ads.client +
          '" data-ad-slot="' + unit + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
        slot.removeAttribute("hidden");
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* 무시 */ }
      } else if (preview || ads.showPlaceholders) {
        slot.textContent = "광고 영역 — AdSense 승인 후 이 자리에 표시됩니다";
        slot.classList.add("is-placeholder");
        slot.removeAttribute("hidden");
      } else {
        slot.setAttribute("hidden", "");
      }
    });
  }

  /* ── 관련 글 카드 ────────────────────────────────────────── */
  function applyConfig() {
    var post = CFG.relatedPost || {};
    var link = $("related-post-link");
    if (link) {
      if (post.url) link.href = post.url;
      if (post.title) link.textContent = post.title;
    }
    var label = document.querySelector(".related-post__label");
    if (label && post.label) label.textContent = post.label;
    if (post.note) setText("related-post-note", post.note);
  }

  /* ── PWA ─────────────────────────────────────────────────── */
  function initPwa() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () { /* 오프라인 미지원 */ });
      });
    }
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  function init() {
    load();
    clamp();
    syncInputs();
    bindEvents();
    applyConfig();
    mountAds();
    initPwa();
    var hash = String(window.location.hash || "").replace("#", "");
    setTab(["pay", "job", "weekly"].indexOf(hash) >= 0 ? hash : "pay", false);
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* 테스트·디버그용 */
  window.SPApp = {
    state: state,
    get results() { return last; },
    render: renderAll,
    summary: summaryText,
    config: CFG
  };
})();
