/* ══════════════════════════════════════════════════════════════
   2026 자동차세 연납·겨울 유류비 계산기 — 화면 (app.js)
   - 입력값은 이 기기의 localStorage 에만 저장합니다(서버 전송 없음).
   - 계산은 calc.js(window.CarTaxCalc)가 담당합니다.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var C = window.CarTaxCalc;
  if (!C) return;

  var STORAGE_KEY = "cartax:v1";

  /* AdSense 승인 후 ① client, ② 슬롯 id별 data-ad-slot(10자리)을 채우세요. */
  var ADSENSE = {
    client: "ca-pub-4355917079579050",
    slots: { "ad-top": "", "ad-mid": "", "ad-bottom": "" }
  };

  var DEFAULTS = {
    tab: "tax",
    type: "ice",
    cc: 1998,
    regYear: 2022,
    regMonth: 3,
    taxYear: 2026,
    applyMonth: 1,
    fuel: "gasoline",
    eff: 12.0,
    km: 1200,
    price: 1854
  };

  var state = {};
  var last = { tax: null, fuel: null };

  // 연납 공제율 공표값(연세액 대비, 10원 절사 전 이론값)
  var WINDOW_RATE = { 1: "4.58%", 3: "3.77%", 6: "2.52%", 9: "1.25%" };

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
  function won(n) { return C.group(n) + "원"; }
  function comma(n) { return C.group(n); }
  function pct(v, d) { return (v * 100).toFixed(d === undefined ? 2 : d) + "%"; }
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
    state.type = state.type === "ev" ? "ev" : "ice";
    state.cc = clamp(C.toNumber(state.cc, 1998), 0, 20000);
    state.regYear = clamp(Math.round(C.toNumber(state.regYear, 2022)), 1990, 2027);
    state.regMonth = clamp(Math.round(C.toNumber(state.regMonth, 1)), 1, 12);
    state.taxYear = [2026, 2027].indexOf(Math.round(C.toNumber(state.taxYear, 2026))) >= 0
      ? Math.round(C.toNumber(state.taxYear, 2026)) : 2026;
    state.applyMonth = [1, 3, 6, 9].indexOf(Math.round(C.toNumber(state.applyMonth, 1))) >= 0
      ? Math.round(C.toNumber(state.applyMonth, 1)) : 1;
    if (!C.FUELS[state.fuel]) state.fuel = "gasoline";
    state.eff = clamp(C.toNumber(state.eff, C.FUELS[state.fuel].eff), 0.1, 100);
    state.km = clamp(C.toNumber(state.km, 1200), 0, 1000000);
    state.price = clamp(C.toNumber(state.price, C.FUELS[state.fuel].price), 0, 100000);
  }

  /* ── 입력 요소 만들기 ────────────────────────────────────── */
  function fillSelects() {
    var ry = $("reg-year");
    if (ry && !ry.options.length) {
      for (var y = 2027; y >= 1990; y--) {
        var o1 = document.createElement("option");
        o1.value = String(y);
        o1.textContent = y + "년";
        ry.appendChild(o1);
      }
    }
    var rm = $("reg-month");
    if (rm && !rm.options.length) {
      for (var m = 1; m <= 12; m++) {
        var o2 = document.createElement("option");
        o2.value = String(m);
        o2.textContent = m + "월";
        rm.appendChild(o2);
      }
    }
  }

  function syncInputs() {
    all("[data-key]").forEach(function (el) {
      var key = el.getAttribute("data-key");
      var kind = el.getAttribute("data-kind");
      if (el.tagName === "SELECT") {
        el.value = String(state[key]);
      } else if (kind === "dec") {
        if (document.activeElement !== el) el.value = String(state[key]);
      } else if (document.activeElement !== el) {
        el.value = comma(state[key]);
      }
    });
    all(".seg").forEach(function (seg) {
      var group = seg.getAttribute("data-group");
      all("button", seg).forEach(function (b) {
        var v = b.getAttribute("data-value");
        var active = String(state[group]) === v;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
    });
    markChips("cc", state.cc);
    markChips("km", state.km);
  }

  function markChips(target, value) {
    all('[data-target="' + target + '"]').forEach(function (b) {
      b.classList.toggle("is-active", Number(b.getAttribute("data-value")) === Number(value));
    });
  }

  /* ── 렌더: 탭 1 자동차세 ─────────────────────────────────── */
  function windowRange(month) {
    return month === 6 ? "16~30일" : "16~31일";
  }

  function renderTax() {
    var r = C.calcCarTax(state);
    last.tax = r;

    var m = r.applyMonth;
    var mLabel = m + "월";

    setText("tax-badge", mLabel + " 연납");
    setText("tax-title", r.saving > 0
      ? mLabel + "에 내면 " + won(r.saving) + " 아낍니다"
      : "연납 공제가 없습니다");
    setText("tax-sub",
      (r.type === "ev" ? "전기차 정액 · " : "") + r.taxYear + "년 연세액 " + won(r.annualTotal) +
      " · " + mLabel + " 연납 납부액 " + won(r.pay));

    setText("stat-annual", won(r.annualTotal));
    setText("stat-pay", won(r.pay));
    setText("stat-pay-note", mLabel + " " + windowRange(m));
    setText("stat-saving", won(r.saving));
    setText("stat-saving-note", "연세액의 약 " + (WINDOW_RATE[m] || pct(r.pick.rate)));

    setText("bar-label", won(r.annualTotal));
    setText("legend-base", won(r.baseTax));
    setText("legend-edu", won(r.eduTax));
    var basePct = r.annualTotal > 0 ? (r.baseTax / r.annualTotal) * 100 : 0;
    var barBase = $("bar-base");
    var barEdu = $("bar-edu");
    if (barBase) barBase.style.width = basePct.toFixed(2) + "%";
    if (barEdu) barEdu.style.width = (100 - basePct).toFixed(2) + "%";

    // 비교 표
    var rows = r.windows.map(function (w) {
      var isPick = w.month === m;
      return '<tr class="' + (isPick ? "is-pick" : "") + '">' +
        "<td>" + w.month + "월 <span class=\"opt\">" + w.covers + "</span></td>" +
        "<td>" + won(w.discount) + "</td>" +
        "<td>" + won(w.pay) + "</td>" +
        "</tr>";
    });
    rows.push('<tr><td>6월·12월 분납</td><td>0원</td><td>' + won(r.annualTotal) + "</td></tr>");
    setHTML("compare-body", rows.join(""));

    var diff = r.windows[0].discount - r.windows[3].discount;
    setText("tax-foot", diff > 0
      ? "1월 연납이 9월보다 " + won(diff) + " 더 유리합니다. 같은 차, 같은 세금인데 낸 시기만 다릅니다."
      : "1월 연납이 가장 유리합니다. 6월·12월에 나눠 내면 공제가 없습니다.");

    // 계산 과정
    var b = [];
    if (r.type === "ev") {
      b.push(row("전기·수소차 정액", won(r.baseAnnual), "지방세법 제127조①3"));
    } else {
      b.push(row("배기량 × cc당 세액", won(r.baseAnnual), comma(r.cc) + "cc × " + r.ccRate + "원"));
      b.push(row("차령 경감", r.discountRate > 0 ? "−" + won(r.baseAnnual - r.baseTax) : "0원",
        r.discountRate > 0
          ? "차령 " + r.age + "년 · " + pct(r.discountRate, 0) + " 경감"
          : "차령 2년 이하 · 경감 없음"));
    }
    b.push(row("자동차세 (1·2기분 합계)", won(r.baseTax), "기분별 10원 미만 절사", "sum"));
    b.push(row("지방교육세 30%", "+" + won(r.eduTax), "자동차세액의 30%"));
    b.push(row("연세액", won(r.annualTotal), "자동차세 + 지방교육세", "sum"));
    b.push(row("연납 공제", "−" + won(r.saving),
      m + "월 " + r.pick.days + "/" + (m === 9 ? 184 : 365) + " × 5%"));
    b.push(row("최종 납부액", won(r.pay), m + "월 " + windowRange(m) + " 납부", "final"));
    setHTML("tax-breakdown-body", b.join(""));

    // 차량 유형·차령 안내
    show($("cc-wrap"), r.type !== "ev");
    show($("ev-note"), r.type === "ev");
    var ageNote;
    if (r.type === "ev") {
      ageNote = "전기차는 정액 세율이라 차령 경감이 없습니다. 연세액 13만 원에 1월 연납 공제가 붙습니다.";
    } else if (r.discountRate <= 0) {
      ageNote = r.taxYear + "년 기준 차령 " + r.age + "년 · 3년차부터 5%씩 경감되므로 아직 경감이 없습니다.";
    } else if (r.ageSame) {
      ageNote = r.taxYear + "년 기준 차령 " + r.age + "년 · 경감 " + pct(r.discountRate, 0) +
        "(" + won(r.baseAnnual - r.baseTax) + ")가 적용됩니다.";
    } else {
      ageNote = r.taxYear + "년 기준 차령 " + r.ageFirst + "년(1기분) · " + r.ageSecond +
        "년(2기분)으로 계산해 경감 " + pct(r.discountRate, 0) + "이 적용됩니다.";
    }
    setText("age-note", ageNote);

    setText("window-note", r.taxYear === 2026
      ? "2026년 연납 창구는 9월 30일로 모두 마감됐습니다. 지금 계산한 금액은 2027년 1월 창구를 준비할 때 그대로 쓰시면 됩니다."
      : "2027년 연납 공제율은 2026년 12월 시행령 개정 전까지 5%로 보고 계산했습니다. 신청 전 위택스 안내를 확인하세요.");

  }

  function row(label, value, note, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : "") + ">" +
      "<th scope=\"row\">" + label + (note ? "<br><span class=\"fine\">" + note + "</span>" : "") + "</th>" +
      "<td>" + value + "</td></tr>";
  }

  /* ── 렌더: 탭 2 유류비 ───────────────────────────────────── */
  function renderFuel() {
    var f = C.FUELS[state.fuel];
    // 유종에 맞춰 단위 표기를 바꿉니다.
    setText("eff-unit", f.effUnit);
    setText("price-unit", "원/" + f.unit);
    var effEl = $("eff-input");
    if (effEl) effEl.setAttribute("data-unit", f.effUnit);
    var priceEl = $("price-input");
    if (priceEl) priceEl.setAttribute("data-unit", "원/" + f.unit);

    var r = C.calcFuel({
      fuel: state.fuel,
      efficiency: state.eff,
      monthlyKm: state.km,
      unitPrice: state.price
    });
    last.fuel = r;

    var costWord = r.fuel === "ev" ? "충전비" : "기름값";
    var isEv = r.fuel === "ev";
    setText("fuel-badge", "겨울 −15%");
    setText("fuel-title", "한 달 " + costWord + " " + won(r.monthly));
    setText("fuel-sub",
      "월 " + comma(r.monthlyKm) + "km · " + r.efficiency.toFixed(1) + f.effUnit +
      " · " + comma(r.unitPrice) + "원/" + f.unit);

    setText("stat-month-label", "월 " + costWord);
    setText("stat-month", won(r.monthly));
    setText("stat-year-label", "연 " + costWord);
    setText("stat-year", won(r.annual));
    setText("stat-km", won(r.costPerKm));
    setText("stat-km-note", "100km " + won(r.costPer100km));
    setText("stat-units", comma(r.unitsPerMonth) + f.unit);
    setText("stat-units-note", "하루 " + (r.unitsPerMonth / 30).toFixed(1) + f.unit);

    var w15 = r.winter[1];
    var w10 = r.winter[0];
    var rows = [
      '<tr><td>평상시 연비</td><td>' + won(r.monthly) + '</td><td>—</td><td>—</td></tr>',
      '<tr><td>겨울 −10% <span class="opt">' + (r.efficiency * 0.9).toFixed(1) + f.effUnit + "</span></td><td>" +
        won(w10.monthly) + "</td><td>+" + won(w10.extraMonthly) + "</td><td>+" + won(w10.extraWinter) + "</td></tr>",
      '<tr class="is-pick"><td>겨울 −15% <span class="opt">' + (r.efficiency * 0.85).toFixed(1) + f.effUnit +
        "</span></td><td>" + won(w15.monthly) + "</td><td>+" + won(w15.extraMonthly) + "</td><td>+" +
        won(w15.extraWinter) + "</td></tr>"
    ];
    setHTML("winter-body", rows.join(""));

    setText("winter-note",
      "겨울 석 달(12~2월)만 따져도 " + won(w15.extraWinter) + " 더 나옵니다. 짧은 거리를 자주 타면 차이가 더 커집니다.");
    setText("fuel-foot",
      "연비가 15% 떨어지면 1년에 " + won(w15.extraMonthly * 12) + " 더 듭니다. " +
      (isEv ? "타이어 공기압과 실내 난방 습관만 바꿔도 일부를 되돌릴 수 있습니다."
            : "타이어 공기압과 예열 습관만 바꿔도 일부를 되돌릴 수 있습니다."));
    setText("eff-note", isEv
      ? "충전할 때마다 주행거리 ÷ 충전량(kWh)으로 계산해 보세요. 겨울에는 히터 사용으로 효율이 20~40%까지 떨어질 수 있습니다."
      : "가득 주유법으로 계산해 보세요. 주행거리 ÷ 다시 채운 연료량 = 실연비. 차량 표시 연비보다 1~2km/L 낮은 경우가 많습니다.");

    var b = [];
    b.push(row("월 주행거리", comma(r.monthlyKm) + "km", "한 달 기준"));
    b.push(row("연비", r.efficiency.toFixed(1) + f.effUnit, "내 차 실연비 기준"));
    b.push(row("월 사용량", comma(r.unitsPerMonth) + f.unit, comma(r.monthlyKm) + "km ÷ " + r.efficiency.toFixed(1)));
    b.push(row("유가", comma(r.unitPrice) + "원/" + f.unit, "2026-11-25 기준"));
    b.push(row("월 " + costWord, won(r.monthly), "사용량 × 단가", "sum"));
    b.push(row("연 " + costWord, won(r.annual), "월 " + costWord + " × 12", "sum"));
    b.push(row("겨울 −15% 월 유류비", won(w15.monthly), "연비 " + (r.efficiency * 0.85).toFixed(1) + f.effUnit));
    b.push(row("겨울 3개월 추가", "+" + won(w15.extraWinter), "12월~2월", "final"));
    setHTML("fuel-breakdown-body", b.join(""));

    setText("price-note", f.priceNote + (isEv
      ? " 기준으로 채워 뒀습니다. 자주 쓰는 충전소 단가로 바꿔 보세요."
      : " 기준으로 채워 뒀습니다. 우리 동네 주유소 가격으로 바꿔 보세요."));
  }

  function renderAll() {
    syncInputs();
    renderTax();
    renderFuel();
  }

  /* ── 탭 ──────────────────────────────────────────────────── */
  function setTab(tab, push) {
    var target = tab === "fuel" ? "fuel" : "tax";
    state.tab = target;
    all(".tab").forEach(function (b) {
      var active = b.getAttribute("data-tab") === target;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    show($("panel-tax"), target === "tax");
    show($("panel-fuel"), target === "fuel");
    var pt = $("panel-tax");
    var pf = $("panel-fuel");
    if (pt) pt.classList.toggle("is-active", target === "tax");
    if (pf) pf.classList.toggle("is-active", target === "fuel");
    if (push && window.history && window.history.replaceState) {
      try { window.history.replaceState(null, "", "#" + target); } catch (e) { /* 무시 */ }
    }
    save();
  }

  /* ── 요약 복사 ───────────────────────────────────────────── */
  function summaryTax() {
    var r = last.tax;
    if (!r) return "";
    var spec = r.type === "ev"
      ? "전기차(정액 10만원)"
      : comma(r.cc) + "cc · 차령 " + r.age + "년(" + pct(r.discountRate, 0) + " 경감)";
    return [
      r.taxYear + " 자동차세 연납 계산",
      "· 차량: " + spec,
      "· 연세액: " + won(r.annualTotal) + " (자동차세 " + won(r.baseTax) + " + 지방교육세 " + won(r.eduTax) + ")",
      "· " + r.applyMonth + "월 연납: " + won(r.pay) + " (" + won(r.saving) + " 절약, " + pct(r.pick.rate) + ")",
      "· 계산: https://ufssdf987-creator.github.io/car-tax/"
    ].join("\n");
  }

  function summaryFuel() {
    var r = last.fuel;
    if (!r) return "";
    var w = r.winter[1];
    return [
      "겨울철 유류비 계산",
      "· " + r.label + " " + r.efficiency.toFixed(1) + r.effUnit + " · 월 " + comma(r.monthlyKm) +
        "km · " + comma(r.unitPrice) + "원/" + r.unit,
      "· 월 " + won(r.monthly) + " / 연 " + won(r.annual),
      "· 겨울 −15%: 월 " + won(w.monthly) + " (석 달 " + won(w.extraWinter) + " 추가)",
      "· 계산: https://ufssdf987-creator.github.io/car-tax/"
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
          if (group === "fuel") {
            state.fuel = v;
            var preset = C.FUELS[v];
            state.eff = preset.eff;
            state.price = preset.price;
            var effEl = $("eff-input");
            var priceEl = $("price-input");
            if (effEl) effEl.value = String(preset.eff);
            if (priceEl) priceEl.value = comma(preset.price);
          } else if (group === "type") {
            state.type = v;
          } else if (group === "applyMonth") {
            state.applyMonth = Number(v);
          } else {
            return;
          }
          sanitize();
          renderAll();
          save();
        });
      });
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
          el.value = digits ? comma(Number(digits)) : "";
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
        renderAll();
        save();
      });
    });

    on($("to-fuel"), "click", function () {
      setTab("fuel", true);
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { /* 무시 */ }
    });

    on($("copy-tax"), "click", function () { copyText(summaryTax(), "toast-tax"); });
    on($("copy-fuel"), "click", function () { copyText(summaryFuel(), "toast-fuel"); });
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
    fillSelects();
    bindEvents();
    mountAds();
    initPwa();
    var hash = String(window.location.hash || "").replace("#", "");
    setTab(hash === "fuel" ? "fuel" : "tax", false);
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* 테스트·디버그용 */
  window.CTApp = {
    state: state,
    get results() { return last; },
    render: renderAll,
    summary: function (tab) { return tab === "fuel" ? summaryFuel() : summaryTax(); },
    config: ADSENSE
  };
})();
