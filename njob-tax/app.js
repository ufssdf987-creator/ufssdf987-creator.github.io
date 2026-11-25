/*!
 * N잡 세금 계산기 — UI 스크립트
 * 계산은 calc.js(NJCalc)가 전담하고, 이 파일은 화면·저장·공유만 다룹니다.
 */
(function () {
  "use strict";

  /* ── AdSense 설정 ─────────────────────────────────────────────
   * 승인 후 ① client 에 ca-pub-… 값, ② 슬롯 id별 data-ad-slot 값(10자리)을 채우세요.
   * 채우기 전에는 광고 영역이 화면에 나오지 않습니다.
   * 미리보기: 주소 뒤에 ?ads=preview 를 붙이면 자리 표시가 보입니다.
   */
  var ADSENSE = {
    client: "",
    slots: { "ad-top": "", "ad-mid": "", "ad-bottom": "" }
  };

  var C = window.NJCalc;
  var STORAGE_KEY = "njcalc.state.v1";
  var reducedMotion = false;
  try {
    reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { /* 무시 */ }

  var state = {
    tab: "tax",
    hasSalary: true,
    salary: 50000000,
    sideType: "business",
    sideRevenue: 15000000,
    industryId: "etc",
    expenseMode: "simple",
    customRate: 64.1,
    dependents: 0,
    children: 0,
    role: "employee",
    bizRegistered: false,
    propertyBase: 0,
    extraIncome: 0,
    propertyPoints: 0
  };

  var last = { tax: null, health: null, shareBlob: null };

  /* ── 작은 도우미 ─────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return (root || document).querySelectorAll(sel); }
  function on(el, ev, fn) { if (el && el.addEventListener) el.addEventListener(ev, fn); }
  function won(n) { return C.comma(Math.round(n)) + "원"; }
  function short(n) { return C.shortWon(n); }
  function digits(str) { return String(str == null ? "" : str).replace(/[^0-9.]/g, ""); }
  function toMan(v) { var n = parseFloat(digits(v).replace(/\.$/, "")); return isFinite(n) ? n : 0; }
  function commaText(v) {
    var s = String(v).replace(/,/g, "");
    var parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }
  function setText(id, txt) {
    var el = $(id);
    if (el) el.textContent = txt;
  }
  function show(el, yes) {
    if (!el) return;
    if (yes) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  }
  function clampState() {
    if (state.salary < 0) state.salary = 0;
    if (state.salary > 10000000000) state.salary = 10000000000;
    if (state.sideRevenue < 0) state.sideRevenue = 0;
    if (state.sideRevenue > 2000000000) state.sideRevenue = 2000000000;
    state.dependents = Math.min(8, Math.max(0, Math.round(state.dependents)));
    state.children = Math.min(8, Math.max(0, Math.round(state.children)));
    if (state.sideType !== "other") state.sideType = "business";
    if (state.role !== "dependent") state.role = "employee";
    if (!C.presetOf(state.industryId)) state.industryId = "etc";
  }

  /* ── 저장 ────────────────────────────────────────────────── */
  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* 사생활 보호 모드 등 */ }
  }
  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      Object.keys(state).forEach(function (k) {
        if (saved[k] !== undefined) state[k] = saved[k];
      });
    } catch (e) { /* 무시 */ }
  }

  /* ── 숫자 애니메이션 ─────────────────────────────────────── */
  var animators = {};
  function animateTo(id, target, formatter) {
    var el = $(id);
    if (!el) return;
    if (reducedMotion || !window.requestAnimationFrame) {
      el.textContent = formatter(target);
      return;
    }
    var from = Number(el.dataset.value || 0);
    if (!isFinite(from)) from = 0;
    el.dataset.value = String(target);
    if (animators[id]) window.cancelAnimationFrame(animators[id]);
    var start = 0;
    var dur = 320;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatter(from + (target - from) * eased);
      if (p < 1) animators[id] = window.requestAnimationFrame(step);
    }
    animators[id] = window.requestAnimationFrame(step);
  }

  /* ── 탭 ──────────────────────────────────────────────────── */
  function setTab(tab, scroll) {
    state.tab = tab === "health" ? "health" : "tax";
    var isTax = state.tab === "tax";
    var bt = $("tab-btn-tax"), bh = $("tab-btn-health");
    var pt = $("panel-tax"), ph = $("panel-health");
    if (bt) { bt.classList.toggle("is-active", isTax); bt.setAttribute("aria-selected", isTax ? "true" : "false"); }
    if (bh) { bh.classList.toggle("is-active", !isTax); bh.setAttribute("aria-selected", !isTax ? "true" : "false"); }
    if (pt) pt.classList.toggle("is-active", isTax);
    if (ph) ph.classList.toggle("is-active", !isTax);
    if (window.history && window.history.replaceState) {
      try { window.history.replaceState(null, "", "#" + state.tab); } catch (e) { /* 무시 */ }
    }
    if (scroll && pt && pt.scrollIntoView) {
      (isTax ? pt : ph).scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }
    save();
  }

  /* ── 계산 입력 정리 ───────────────────────────────────────
   * state.customRate 는 화면 표시용 퍼센트(64.1)라서 계산 시 소수(0.641)로 바꿉니다. */
  function taxInput() {
    return {
      hasSalary: state.hasSalary,
      salary: state.salary,
      sideType: state.sideType,
      sideRevenue: state.sideRevenue,
      industryId: state.industryId,
      expenseMode: state.expenseMode,
      customRate: Math.max(0, Math.min(98, Number(state.customRate) || 0)) / 100,
      otherExpenseRate: 0.6,
      dependents: state.dependents,
      children: state.children
    };
  }

  /* ── 탭1 렌더 ────────────────────────────────────────────── */
  function renderTax() {
    var res = C.compareSideIncome(taxInput());
    last.tax = res;

    var balance = res.balance;
    var badge = $("verdict-badge");
    var isRefund = balance.isRefund;
    var isZero = balance.isZero;

    if (badge) {
      badge.textContent = isZero ? "정산 없음" : isRefund ? "환급" : "추가 납부";
      badge.classList.remove("is-due", "is-refund", "is-zero");
      badge.classList.add(isZero ? "is-zero" : isRefund ? "is-refund" : "is-due");
    }

    if (isZero) {
      setText("verdict-title", "5월에 더 낼 세금이 없습니다");
      setText("verdict-sub", "부업 수입을 넣으면 결과가 바로 바뀝니다");
    } else if (isRefund) {
      setText("verdict-title", "5월에 " + won(Math.abs(balance.total)) + " 돌려받습니다");
      setText("verdict-sub", "미리 낸 " + short(res.side.withheld) + "보다 실제 세금이 적습니다");
    } else {
      setText("verdict-title", "5월에 " + won(balance.total) + " 더 냅니다");
      setText("verdict-sub", "부업 수입 " + short(res.revenue) + " · 이미 뺀 " + short(res.side.withheld) + "은 제외한 금액");
    }

    animateTo("stat-delta", res.delta.total, won);
    animateTo("stat-withheld", res.side.withheld, won);
    animateTo("stat-balance", Math.abs(balance.total), won);
    setText("stat-balance-label", isZero ? "5월 정산" : isRefund ? "5월에 돌려받을 세금" : "5월에 더 낼 세금");
    setText("bar-total", won(res.delta.total));

    var paidShare = res.delta.total > 0 ? Math.max(0, Math.min(1, res.side.withheld / res.delta.total)) : 0.5;
    var bars = { "bar-paid": paidShare * 100, "bar-due": (1 - paidShare) * 100 };
    Object.keys(bars).forEach(function (id) {
      var el = $(id);
      if (el && el.style) el.style.width = bars[id].toFixed(1) + "%";
    });
    setText("legend-paid", won(res.side.withheld));
    setText("legend-due", won(Math.max(0, balance.total)));

    setText("pill-eff", "부업 수입의 " + C.percent(res.rates.effectiveOnRevenue, 1));
    setText("pill-marginal", "한계세율 " + Math.round(res.rates.marginal * 100) + "%");
    setText("pill-monthly", isRefund ? "환급 " + short(Math.abs(balance.total)) : "월 " + won(Math.abs(balance.total) / 12));

    if (isRefund) {
      setText("result-foot", "부업 수입 " + short(res.revenue) + "에 대해 미리 낸 " + short(res.side.withheld) + " 중 " + short(Math.abs(balance.total)) + "을 5월에 돌려받습니다.");
    } else if (isZero) {
      setText("result-foot", "부업 수입을 입력하면 5월 정산액이 계산됩니다.");
    } else {
      setText("result-foot", "부업 수입 " + short(res.revenue) + " 중 세금으로 나가는 돈은 " + short(res.delta.total) + "입니다.");
    }

    renderBreakdown(res);
    // 힌트
    setText("salary-won", "= " + won(res.labor.gross));
    setText("side-won", "= " + won(res.revenue) + " · 원천징수 " + won(res.side.withheld));
    setText("rate-note", rateNote(res));
  }

  function rateNote(res) {
    if (state.sideType === "other") {
      return "필요경비 60% 인정 · 기타소득금액 " + short(res.side.income);
    }
    if (state.expenseMode === "none") return "경비 미적용 · 소득금액 " + short(res.side.income);
    return "인정 경비 " + C.percent(res.side.expenseRate, 1) + " · 소득금액 " + short(res.side.income);
  }

  function row(label, value, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : "") + '><th scope="row">' + label + "</th><td>" + value + "</td></tr>";
  }

  function renderBreakdown(res) {
    var body = $("breakdown-body");
    if (!body) return;
    var c = res.combined, s = res.salaryOnly;
    var html = "";
    if (res.hasSalary) {
      html += row("총급여", won(res.labor.gross));
      html += row("− 근로소득공제", won(res.labor.deduction));
      html += row("근로소득금액", won(res.labor.income), "sum");
    }
    html += row(res.sideType === "other" ? "기타소득 수입" : "사업소득 수입", won(res.side.revenue));
    html += row("− 필요경비", won(res.side.expense));
    html += row(res.sideType === "other" ? "기타소득금액" : "사업소득금액", won(res.side.income), "sum");
    html += row("종합소득금액", won(c.totalIncome), "sum");
    html += row("− 기본공제(본인" + (state.dependents ? "·가족 " + state.dependents + "명" : "") + ")", won(c.basicDeduction));
    if (c.pensionDeduction) html += row("− 국민연금보험료", won(c.pensionDeduction));
    if (c.healthDeduction) html += row("− 건강·장기요양보험료", won(c.healthDeduction));
    html += row("과세표준", won(c.taxBase), "sum");
    html += row("적용 세율", Math.round(c.bracket.rate * 100) + "% (" + c.bracket.label + ")");
    html += row("산출세액", won(c.calculatedTax));
    html += row("적용 공제", c.creditLabel || "건강보험료 특별소득공제");
    if (c.credits.labor) html += row("− 근로소득세액공제", won(c.credits.labor));
    if (c.credits.standard) html += row("− 표준세액공제", won(c.credits.standard));
    if (c.credits.child) html += row("− 자녀세액공제", won(c.credits.child));
    html += row("결정세액(국세)", won(c.determinedTax), "sum");
    html += row("+ 지방소득세", won(c.localTax));
    html += row("합계", won(c.totalTax), "sum");
    html += row("본업만 있을 때 세금", won(s.totalTax));
    html += row("부업으로 늘어난 세금", won(res.delta.total), "sum");
    html += row("− 이미 원천징수된 세금", won(res.side.withheld));
    html += row(res.balance.isRefund ? "5월에 돌려받을 금액" : "5월에 더 낼 금액", won(Math.abs(res.balance.total)), "final");
    body.innerHTML = html;
  }

  /* ── 탭2 렌더 ────────────────────────────────────────────── */
  function renderHealth() {
    var tax = last.tax || C.compareSideIncome(taxInput());
    var bizIncome = state.sideType === "business" ? tax.side.income : 0;
    var extra = state.extraIncome * 10000;
    var input = {
      mode: state.role,
      sideIncome: tax.side.income,
      bizIncome: bizIncome,
      extraIncome: extra,
      bizRegistered: state.bizRegistered,
      propertyTaxBase: state.propertyBase * 10000,
      propertyPoints: state.propertyPoints
    };
    var h = C.healthInsurance(input);
    last.health = h;
    var isEmployee = state.role === "employee";

    setText("hi-income", won(tax.side.income));
    setText("hi-income-note",
      tax.sideType === "other"
        ? "수입 " + short(tax.side.revenue) + " − 필요경비 " + short(tax.side.expense)
        : "수입 " + short(tax.side.revenue) + " − 경비 " + short(tax.side.expense));

    var badge = $("hi-badge");
    if (badge) {
      badge.textContent = isEmployee
        ? (h.monthly > 0 ? "추가 부과" : "기준 이하")
        : (h.qualify ? "자격 유지" : "자격 상실");
      badge.classList.remove("is-due", "is-refund", "is-zero", "is-warn");
      badge.classList.add(isEmployee ? (h.monthly > 0 ? "is-warn" : "is-refund") : (h.qualify ? "is-refund" : "is-due"));
    }

    if (isEmployee) {
      if (h.monthly > 0) {
        setText("hi-title", "월 " + won(h.monthly) + " 추가 부과됩니다");
        setText("hi-sub", "보수 외 소득 " + short(h.evaluatedIncome) + " 중 기준 초과분 " + short(h.overThreshold) + "에 부과");
      } else {
        setText("hi-title", "건강보험료 추가 부담 없음");
        setText("hi-sub", "보수 외 소득 " + short(h.evaluatedIncome) + "은 기준 2,000만원 이하입니다");
      }
    } else if (h.qualify) {
      setText("hi-title", "피부양자 자격이 유지됩니다");
      setText("hi-sub", "소득 " + short(h.evaluatedIncome) + " · 사업소득 500만원 이하 조건을 충족합니다");
    } else {
      setText("hi-title", "피부양자 자격이 상실됩니다");
      setText("hi-sub", "지역가입자로 전환되어 월 " + won(h.monthly) + " 예상" +
        (h.propertyPremium > 0 ? " (재산분 포함)" : " (소득분 기준)"));
    }

    setText("hi-monthly-label", isEmployee ? "월 추가 보험료" : (h.qualify ? "월 추가 보험료" : "월 예상 보험료"));
    animateTo("hi-monthly", h.monthly, won);
    animateTo("hi-yearly", h.yearly, won);
    setText("hi-yearly-note", isEmployee
      ? "건강보험 + 장기요양 (본인 전액)"
      : (h.qualify ? "자격 유지 시 부과 없음" : "건강보험 + 장기요양"));

    var denom = isEmployee ? h.threshold : (h.qualify ? Math.max(h.threshold, h.evaluatedIncome, 1) : Math.max(h.threshold, 1));
    var ratio = denom > 0 ? Math.min(1, h.evaluatedIncome / denom) : 0;
    var fill = $("gauge-fill");
    if (fill && fill.style) {
      fill.style.width = (ratio * 100).toFixed(1) + "%";
      fill.classList.toggle("is-over", h.isOver);
    }
    setText("gauge-label", isEmployee ? "보수 외 소득" : "소득 합계");
    setText("gauge-value", won(h.evaluatedIncome));
    setText("gauge-max", "기준 2,000만원");

    renderConditions(h, isEmployee);
    renderLimits(tax);
    renderTotal(tax, h);

    if (isEmployee) {
      setText("hi-foot", h.monthly > 0
        ? "보수 외 소득 보험료는 회사와 나누지 않고 본인이 전액 부담합니다. 소득이 생긴 해에 바로 오르지 않고, 다음 연도 11월분부터 반영되는 2년 시차가 있습니다."
        : "2,000만원을 넘는 순간 초과분 전체에 부과가 시작됩니다. 내년 11월분부터 반영되니, 올해 고지서가 조용해도 미리 준비하세요.");
    } else {
      setText("hi-foot", h.qualify
        ? "지금은 자격이 유지되지만, 소득 자료는 11월분부터 전년도 기준으로 반영됩니다. 수입이 기준선에 가깝다면 미리 확인하세요."
        : "피부양자 자격을 잃으면 그달부터 지역가입자로 보험료가 부과되고, 소급 적용될 수 있습니다. 재산분 보험료와 최저보험료는 공단 모의계산으로 확인하세요.");
    }
  }

  function condRow(pass, label, value, limit) {
    return '<li class="cond ' + (pass ? "is-pass" : "is-fail") + '">' +
      '<span class="cond-icon" aria-hidden="true">' + (pass ? "✓" : "!") + "</span>" +
      '<span class="cond-text"><b>' + label + "</b><span>" + value + " / 기준 " + limit + "</span></span>" +
      "</li>";
  }

  function renderConditions(h, isEmployee) {
    var list = $("cond-list");
    if (!list) return;
    var html = "";
    if (isEmployee) {
      html += condRow(!h.isOver, "보수 외 소득 2,000만원", short(h.evaluatedIncome), "2,000만원");
      html += condRow(true, "부과 방식", "초과분 × 7.19% (본인 전액)", "월 상한 459만 1,740원");
      html += condRow(true, "반영 시점", "다음 연도 11월분부터", "1~10월은 전전년도 소득");
    } else {
      var c = h.conditions;
      html += condRow(c.income.pass, "소득 합계 2,000만원", short(c.income.value), "2,000만원");
      html += condRow(c.business.pass, c.business.registered ? "사업자등록 + 사업소득" : "사업소득 500만원",
        short(c.business.value), c.business.registered ? "0원(등록 시)" : "500만원");
      html += condRow(c.property.pass, "재산세 과세표준 5.4억원", short(c.property.value), "5억 4,000만원");
    }
    list.innerHTML = html;
  }

  function renderLimits(tax) {
    var t = C.thresholds({
      sideType: state.sideType,
      industryId: state.industryId,
      expenseMode: state.expenseMode,
      customRate: Math.max(0, Math.min(98, Number(state.customRate) || 0)) / 100,
      otherExpenseRate: 0.6
    });
    setText("limit-biz", short(Math.max(0, Math.floor(t.businessDependentLimit / 10000) * 10000)));
    setText("limit-inc", short(Math.max(0, Math.floor(t.incomeDependentLimit / 10000) * 10000)));
    var box = $("limit-box");
    if (box) {
      var label = box.querySelector(".limit-title");
      if (label) label.textContent = state.role === "dependent" ? "부업 수입, 여기까지는 괜찮아요" : "참고: 피부양자였다면 여기까지";
    }
    setText("limit-note", state.sideType === "other"
      ? "기타소득은 필요경비 60%를 뺀 소득금액 기준입니다. 사업소득 500만원 기준은 사업소득에만 적용됩니다."
      : "경비율 " + C.percent(tax.side.expenseRate, 1) + " 기준으로 역산한 수입금액입니다. 실제 판정은 공단이 국세청 자료로 합니다.");
  }

  function renderTotal(tax, h) {
    var taxBalance = Math.max(0, tax.balance.total);
    var refund = tax.balance.isRefund ? Math.abs(tax.balance.total) : 0;
    var health = h.yearly;
    var sum = taxBalance + health - refund;
    setText("total-tax", (refund ? "− " : "") + won(taxBalance || refund));
    setText("total-health", won(health));
    setText("total-sum", won(sum));
    var rate = tax.revenue > 0 ? sum / tax.revenue : 0;
    setText("total-note", "부업 수입 " + short(tax.revenue) + " 대비 " + C.percent(rate, 1) + " 수준입니다." +
      (h.mode === "dependent" && !h.qualify ? " 지역가입자 재산분 보험료는 별도입니다." : ""));
  }

  /* ── 입력 동기화 ─────────────────────────────────────────── */
  function syncInputs() {
    var salaryEl = $("salary-input");
    if (salaryEl) salaryEl.value = commaText(Math.round(state.salary / 10000));
    var sideEl = $("side-input");
    if (sideEl) sideEl.value = commaText(Math.round(state.sideRevenue / 10000));
    var slider = $("side-slider");
    if (slider) {
      var man = Math.round(state.sideRevenue / 10000);
      slider.max = String(Math.max(8000, Math.ceil(man / 500) * 500));
      slider.value = String(man);
    }
    var ns = $("no-salary");
    if (ns) ns.checked = !state.hasSalary;
    var propEl = $("property-base");
    if (propEl) propEl.value = commaText(Math.round(state.propertyBase));
    var extraEl = $("extra-income");
    if (extraEl) extraEl.value = commaText(Math.round(state.extraIncome));
    var ptsEl = $("property-points");
    if (ptsEl) ptsEl.value = commaText(Math.round(state.propertyPoints));
    var rateEl = $("rate-input");
    if (rateEl && document.activeElement !== rateEl) rateEl.value = String(state.customRate);
    var dep = $("dependents-value");
    if (dep) dep.textContent = state.dependents + "명";
    var chi = $("children-value");
    if (chi) chi.textContent = state.children + "명";
    var reg = $("biz-registered");
    if (reg) reg.checked = !!state.bizRegistered;

    all(".seg[data-side]").forEach(function (b) {
      var active = b.dataset.side === state.sideType;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });
    all(".seg[data-role]").forEach(function (b) {
      var active = b.dataset.role === state.role;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });
    all("#salary-chips button").forEach(function (b) {
      b.classList.toggle("is-active", Number(b.dataset.value) * 10000 === state.salary);
    });
    all("#industry-chips button").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.industry === state.industryId);
    });
    show($("industry-wrap"), state.sideType === "business");
    show($("dependent-only"), state.role === "dependent");
    var custom = $("rate-custom");
    var toggle = $("rate-toggle");
    if (custom && toggle) {
      var open = state.expenseMode === "custom";
      show(custom, open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "업종 경비율로 되돌리기" : "경비율 직접 입력";
    }
    var noSalary = $("salary-input");
    if (noSalary) noSalary.disabled = !state.hasSalary;
  }

  function renderAll() {
    clampState();
    syncInputs();
    renderTax();
    renderHealth();
  }

  var pending = false;
  function update() {
    if (pending) return;
    pending = true;
    var run = function () {
      pending = false;
      renderAll();
      save();
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else run();
  }

  /* ── 이벤트 ──────────────────────────────────────────────── */
  function bindMoneyInput(id, key, isMan) {
    var el = $(id);
    if (!el) return;
    on(el, "input", function () {
      var man = toMan(el.value);
      state[key] = isMan === false ? man : Math.round(man * 10000);
      el.value = commaText(el.value.replace(/,/g, ""));
      update();
    });
    on(el, "focus", function () { try { el.select(); } catch (e) { /* 무시 */ } });
    on(el, "blur", function () { syncInputs(); });
  }

  function bindEvents() {
    on($("tab-btn-tax"), "click", function () { setTab("tax", false); });
    on($("tab-btn-health"), "click", function () { setTab("health", false); });
    on($("to-health"), "click", function () { setTab("health", false); var el = $("health-result"); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" }); });
    on($("to-tax"), "click", function () { setTab("tax", false); var el = $("salary-input"); if (el && el.focus) el.focus(); });

    bindMoneyInput("salary-input", "salary");
    bindMoneyInput("side-input", "sideRevenue");
    bindMoneyInput("property-base", "propertyBase", false);
    bindMoneyInput("extra-income", "extraIncome", false);
    bindMoneyInput("property-points", "propertyPoints", false);

    on($("side-slider"), "input", function (e) {
      state.sideRevenue = (Number(e.target.value) || 0) * 10000;
      var el = $("side-input");
      if (el) el.value = commaText(Math.round(state.sideRevenue / 10000));
      update();
    });

    on($("no-salary"), "change", function (e) {
      state.hasSalary = !e.target.checked;
      if (!state.hasSalary) state.salary = 0;
      else if (!state.salary) state.salary = 50000000;
      update();
    });

    on($("salary-chips"), "click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button[data-value]") : null;
      if (!b) return;
      state.salary = Number(b.dataset.value) * 10000;
      state.hasSalary = true;
      update();
    });

    all(".seg[data-side]").forEach(function (b) {
      on(b, "click", function () {
        state.sideType = b.dataset.side === "other" ? "other" : "business";
        update();
      });
    });
    all(".seg[data-role]").forEach(function (b) {
      on(b, "click", function () {
        state.role = b.dataset.role === "dependent" ? "dependent" : "employee";
        update();
      });
    });

    on($("industry-chips"), "click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button[data-industry]") : null;
      if (!b) return;
      state.industryId = b.dataset.industry;
      state.expenseMode = "simple";
      state.customRate = Math.round(C.presetOf(state.industryId).basic * 1000) / 10;
      update();
    });

    on($("rate-toggle"), "click", function () {
      state.expenseMode = state.expenseMode === "custom" ? "simple" : "custom";
      if (state.expenseMode === "custom") {
        state.customRate = Math.round(C.presetOf(state.industryId).basic * 1000) / 10;
      }
      update();
    });

    on($("rate-input"), "input", function (e) {
      var v = parseFloat(digits(e.target.value));
      if (!isFinite(v)) v = 0;
      state.customRate = Math.min(98, Math.max(0, v));
      state.expenseMode = "custom";
      update();
    });

    all(".stepper").forEach(function (box) {
      on(box, "click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest(".step-btn") : null;
        if (!b) return;
        var key = box.dataset.target;
        var dir = Number(b.dataset.dir);
        state[key] = Math.max(0, Math.min(8, (state[key] || 0) + dir));
        update();
      });
    });

    on($("biz-registered"), "change", function (e) {
      state.bizRegistered = e.target.checked;
      update();
    });

    on($("share-copy"), "click", function () { copySummary(); });
    on($("share-image"), "click", function () { makeShareImage(); });
    on($("sheet-close"), "click", closeSheet);
    on($("sheet-backdrop"), "click", function (e) { if (e.target === $("sheet-backdrop")) closeSheet(); });
    on($("sheet-download"), "click", downloadImage);
    on($("sheet-share"), "click", shareImage);
    on(document, "keydown", function (e) { if (e.key === "Escape") closeSheet(); });
    on($("link-top"), "click", function (e) {
      e.preventDefault();
      if (window.scrollTo) window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    });
  }

  /* ── 업종 칩 ─────────────────────────────────────────────── */
  function renderIndustryChips() {
    var box = $("industry-chips");
    if (!box) return;
    var html = C.INDUSTRIES.map(function (x) {
      return '<button type="button" data-industry="' + x.id + '">' + x.name +
        '<span class="chip-rate">' + C.percent(x.basic, 1) + "</span></button>";
    }).join("");
    box.innerHTML = html;
  }

  /* ── 요약 텍스트 ─────────────────────────────────────────── */
  function summaryText() {
    var t = last.tax || C.compareSideIncome(taxInput());
    var h = last.health;
    var lines = [];
    lines.push("[N잡 세금 계산기 · 2026년 기준]");
    if (t.hasSalary) lines.push("본업 연봉 " + short(t.labor.gross));
    lines.push("부업 " + (t.sideType === "other" ? "기타소득(8.8%)" : "사업소득(3.3%)") + " 수입 " + short(t.revenue) + " → 소득금액 " + short(t.side.income));
    lines.push("· 부업으로 늘어난 세금: " + won(t.delta.total));
    lines.push("· 이미 원천징수: " + won(t.side.withheld));
    lines.push("· 5월 정산: " + (t.balance.isRefund ? "환급 " : "추가 납부 ") + won(Math.abs(t.balance.total)));
    if (h) lines.push("· 건강보험료 추가: 월 " + won(h.monthly) + " / 연 " + won(h.yearly));
    lines.push("모의 계산입니다. 최종 확인은 홈택스·국민건강보험공단.");
    return lines.join("\n");
  }

  function toast(msg) {
    var el = $("share-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    window.setTimeout(function () { el.classList.remove("is-on"); }, 2600);
  }

  function copySummary() {
    var text = summaryText();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? "요약을 복사했어요" : "복사에 실패했어요. 길게 눌러 복사해 주세요");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("요약을 복사했어요"); }, fallback);
    } else {
      fallback();
    }
  }

  /* ── 결과 이미지 (1080×1350) ─────────────────────────────── */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makeShareImage() {
    var t = last.tax || C.compareSideIncome(taxInput());
    var h = last.health;
    var canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    var ctx = canvas.getContext("2d");
    if (!ctx) { toast("이 브라우저에서는 이미지를 만들 수 없어요"); return; }

    var g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#0f5c4e");
    g.addColorStop(0.55, "#0b473d");
    g.addColorStop(1, "#08302a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.arc(900, 180, 260, 0, Math.PI * 2);
    ctx.fill();

    var font = '"Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",Roboto,"Helvetica Neue",Arial,"Liberation Sans",sans-serif';
    ctx.fillStyle = "#cfe8df";
    ctx.font = '600 34px ' + font;
    ctx.fillText("N잡 세금 계산기", 84, 128);
    ctx.font = '24px ' + font;
    ctx.fillStyle = "rgba(207,232,223,0.7)";
    ctx.fillText("2026년 귀속 기준", 84, 168);

    var headline = t.balance.isZero ? "정산 없음" : (t.balance.isRefund ? "환급" : "5월에 더 낼 세금");
    ctx.fillStyle = "#ffffff";
    ctx.font = '600 44px ' + font;
    ctx.fillText(headline, 84, 330);

    var amountText = won(Math.abs(t.balance.total));
    var size = 128;
    ctx.font = '800 ' + size + 'px ' + font;
    while (ctx.measureText(amountText).width > 900 && size > 60) {
      size -= 6;
      ctx.font = '800 ' + size + 'px ' + font;
    }
    ctx.fillStyle = t.balance.isRefund ? "#8ef0c4" : "#ffe1a8";
    ctx.fillText(amountText, 80, 470);

    ctx.font = '28px ' + font;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText(
      (t.hasSalary ? "본업 " + short(t.labor.gross) + " + " : "") +
      (t.sideType === "other" ? "기타소득 " : "사업소득 ") + short(t.revenue),
      84, 530
    );

    var rows = [
      ["부업으로 늘어난 세금", won(t.delta.total)],
      ["이미 원천징수", won(t.side.withheld)],
      ["부업 소득금액", short(t.side.income) + " (" + C.percent(t.rates.effectiveOnRevenue, 1) + " 부담)"]
    ];
    if (h) rows.push([h.mode === "dependent" && !h.qualify ? "건강보험료(지역가입자, 월)" : "건강보험료 추가(월)", won(h.monthly)]);

    var y = 660;
    rows.forEach(function (r) {
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      roundRect(ctx, 72, y, 936, 108, 24);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = '28px ' + font;
      ctx.fillText(r[0], 112, y + 66);
      ctx.fillStyle = "#ffffff";
      ctx.font = '700 36px ' + font;
      var w = ctx.measureText(r[1]).width;
      ctx.fillText(r[1], 968 - w, y + 68);
      y += 126;
    });

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = '23px ' + font;
    ctx.fillText("모의 계산입니다. 최종 신고는 홈택스, 보험료는 국민건강보험공단에서 확인하세요.", 84, 1268);

    var dataUrl;
    try { dataUrl = canvas.toDataURL("image/png"); } catch (e) { toast("이미지를 만들 수 없어요"); return; }

    var img = $("sheet-image");
    if (img) img.src = dataUrl;
    last.shareBlob = null;
    if (canvas.toBlob) {
      canvas.toBlob(function (blob) { last.shareBlob = blob; }, "image/png");
    }
    last.shareName = "njob-tax-" + (t.balance.isRefund ? "refund" : "due") + ".png";
    openSheet();
  }

  function openSheet() {
    var bd = $("sheet-backdrop");
    if (!bd) return;
    show(bd, true);
    bd.classList.add("is-open");
    var btn = $("sheet-close");
    if (btn && btn.focus) btn.focus();
  }
  function closeSheet() {
    var bd = $("sheet-backdrop");
    if (!bd) return;
    bd.classList.remove("is-open");
    show(bd, false);
  }
  function downloadImage() {
    var img = $("sheet-image");
    if (!img || !img.src) return;
    var a = document.createElement("a");
    a.href = img.src;
    a.download = last.shareName || "njob-tax.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast("이미지를 저장했어요");
  }
  function shareImage() {
    var img = $("sheet-image");
    if (!img || !img.src) return;
    if (last.shareBlob && navigator.canShare && navigator.share) {
      try {
        var file = new File([last.shareBlob], last.shareName || "njob-tax.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "N잡 세금 계산 결과" }).catch(function () { /* 취소 */ });
          return;
        }
      } catch (e) { /* 아래로 */ }
    }
    downloadImage();
  }

  /* ── 광고 ────────────────────────────────────────────────── */
  function mountAds() {
    var preview = false;
    try { preview = new URLSearchParams(window.location.search).get("ads") === "preview"; } catch (e) { /* 무시 */ }
    all(".ad-slot").forEach(function (slot) {
      var unit = ADSENSE.slots[slot.id] || slot.dataset.adSlot || "";
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
  function initPwa() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () { /* 오프라인 미지원 */ });
      });
    }
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      show($("install-card"), true);
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
    clampState();
    renderIndustryChips();
    bindEvents();
    mountAds();
    initPwa();
    var hash = String(window.location.hash || "").replace("#", "");
    if (hash === "health") setTab("health", false);
    else setTab("tax", false);
    renderAll();
    var el = $("side-slider");
    if (el) el.max = String(Math.max(8000, Math.ceil(state.sideRevenue / 10000 / 500) * 500));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* 테스트·디버그용 */
  window.NJApp = {
    state: state,
    get results() { return last; },
    render: renderAll,
    summary: summaryText,
    config: ADSENSE
  };
})();
