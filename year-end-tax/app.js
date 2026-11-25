/*!
 * 2026 연말정산 환급 계산기 — UI 스크립트
 * 계산은 calc.js(YECalc)가 전담하고, 이 파일은 화면·저장·공유만 다룹니다.
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

  var C = window.YECalc;
  var STORAGE_KEY = "yecalc.state.v1";
  var reducedMotion = false;
  try {
    reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { /* 무시 */ }

  var state = {
    tab: "card",
    salary: 50000000,
    dependents: 2,
    children: 1,
    credit: 15000000,
    check: 3000000,
    market: 0,
    transit: 600000,
    culture: 0,
    budget: 2000000,
    pension: 4000000,
    irp: 0,
    insurance: 120000,
    rentOn: false,
    rent: 500000,
    medicalGeneral: 3000000,
    medicalSpecial: 0,
    medicalFertility: 0,
    medicalPremature: 0,
    educationSelf: 0,
    educationSchool: 0,
    educationCollege: 0,
    schoolChildren: 1,
    collegeChildren: 0,
    hometown: 100000,
    donation: 0,
    withheld: null
  };

  var last = { card: null, plan: null, maxPlan: null, settle: null, shareBlob: null, shareName: "" };

  /* ── 작은 도우미 ─────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
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
  function setHTML(id, html) {
    var el = $(id);
    if (el) el.innerHTML = html;
  }
  function show(el, yes) {
    if (!el) return;
    if (yes) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  }
  function clampState() {
    state.salary = Math.min(10000000000, Math.max(0, Math.round(Number(state.salary) || 0)));
    state.dependents = Math.min(8, Math.max(0, Math.round(Number(state.dependents) || 0)));
    state.children = Math.min(8, Math.max(0, Math.round(Number(state.children) || 0)));
    state.schoolChildren = Math.min(8, Math.max(0, Math.round(Number(state.schoolChildren) || 0)));
    state.collegeChildren = Math.min(8, Math.max(0, Math.round(Number(state.collegeChildren) || 0)));
    ["credit", "check", "market", "transit", "culture", "budget", "pension", "irp", "insurance",
      "rent", "medicalGeneral", "medicalSpecial", "medicalFertility", "medicalPremature",
      "educationSelf", "educationSchool", "educationCollege", "hometown", "donation"].forEach(function (k) {
      state[k] = Math.min(1000000000, Math.max(0, Math.round(Number(state[k]) || 0)));
    });
    if (state.withheld != null) {
      state.withheld = Math.min(1000000000, Math.max(0, Math.round(Number(state.withheld) || 0)));
    }
    if (state.tab !== "credit") state.tab = "card";
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
    var dur = 300;
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
    state.tab = tab === "credit" ? "credit" : "card";
    var isCard = state.tab === "card";
    var bc = $("tab-btn-card"), br = $("tab-btn-credit");
    var pc = $("panel-card"), pr = $("panel-credit");
    if (bc) { bc.classList.toggle("is-active", isCard); bc.setAttribute("aria-selected", isCard ? "true" : "false"); }
    if (br) { br.classList.toggle("is-active", !isCard); br.setAttribute("aria-selected", !isCard ? "true" : "false"); }
    if (pc) pc.classList.toggle("is-active", isCard);
    if (pr) pr.classList.toggle("is-active", !isCard);
    if (window.history && window.history.replaceState) {
      try { window.history.replaceState(null, "", "#" + state.tab); } catch (e) { /* 무시 */ }
    }
    if (scroll) {
      var target = isCard ? pc : pr;
      if (target && target.scrollIntoView) {
        target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }
    }
    save();
  }

  /* ── 입력값 ──────────────────────────────────────────────── */
  function cardInput() {
    return {
      salary: state.salary,
      children: state.children,
      credit: state.credit,
      check: state.check,
      market: state.market,
      transit: state.transit,
      culture: state.culture
    };
  }

  function settleInput() {
    return {
      salary: state.salary,
      dependents: state.dependents,
      children: state.children,
      card: cardInput(),
      pensionSavings: state.pension,
      irp: state.irp,
      monthlyRent: state.rentOn ? state.rent : 0,
      insurance: state.insurance,
      medicalGeneral: state.medicalGeneral,
      medicalSpecial: state.medicalSpecial,
      medicalFertility: state.medicalFertility,
      medicalPremature: state.medicalPremature,
      educationSelf: state.educationSelf,
      educationSchool: state.educationSchool,
      educationCollege: state.educationCollege,
      schoolChildren: state.schoolChildren,
      collegeChildren: state.collegeChildren,
      hometown: state.hometown,
      donation: state.donation,
      withheld: state.withheld
    };
  }

  /* ── 카드 탭 렌더 ────────────────────────────────────────── */
  function savingOf(gain) {
    var rate = C.marginalRate(state.salary, state.dependents);
    return Math.round(gain * rate * 1.1 / 1000) * 1000;
  }

  function renderCard() {
    var d = C.cardDeduction(cardInput());
    var limits = d.limits;
    var total = d.total;
    var threshold = d.threshold;
    var gap = d.thresholdGap;
    last.card = d;

    setText("salary-won", "= " + won(state.salary));
    setText("salary-won-2", "= " + won(state.salary));
    setText("budget-won", "= " + won(state.budget));
    setText("limit-base", short(limits.baseLimit));
    setText("limit-add", short(limits.addLimit));
    setText("limit-threshold", short(threshold));

    /* 문턱 게이지 */
    var pct = threshold > 0 ? Math.min(100, (total / threshold) * 100) : 0;
    var fill = $("threshold-fill");
    if (fill && fill.style) {
      fill.style.width = pct.toFixed(1) + "%";
      fill.classList.toggle("is-over", total >= threshold);
    }
    setText("threshold-value", short(threshold) + " 중 " + short(total));
    setText("threshold-max", "최저사용금액 " + short(threshold));
    setText("threshold-note", gap > 0
      ? "문턱까지 " + short(gap) + " 남았습니다. 이 구간은 어떤 카드로 써도 공제가 0원입니다."
      : "문턱을 넘었습니다. 넘은 금액부터 공제가 시작됩니다.");

    /* 결과 배지·제목 */
    var badge = $("card-badge");
    var reachedAll = d.reachedBase && d.reachedAdd;
    if (badge) {
      badge.classList.remove("is-due", "is-warn", "is-zero");
      if (gap > 0) { badge.textContent = "문턱 미달"; badge.classList.add("is-warn"); }
      else if (reachedAll) { badge.textContent = "한도 도달"; }
      else if (d.reachedBase) { badge.textContent = "기본한도 도달"; }
      else { badge.textContent = "문턱 통과"; }
    }
    if (gap > 0) {
      setText("card-title", "아직 카드 공제 0원 — 문턱까지 " + short(gap));
      setText("card-sub", "총급여 25%(" + short(threshold) + ")를 넘겨야 공제가 시작됩니다. 지금까지 " + short(total) + " 사용.");
    } else if (reachedAll) {
      setText("card-title", "카드 공제 한도 " + short(limits.baseLimit + limits.addLimit) + "을 모두 채웠어요");
      setText("card-sub", "지금까지 " + short(total) + " 사용 · 더 써도 소득공제는 늘지 않습니다.");
    } else if (d.reachedBase) {
      setText("card-title", "지금까지 카드 공제 " + won(d.final));
      setText("card-sub", "기본한도는 채웠고, 추가한도까지 " + short(d.addRoom) + " 남았습니다.");
    } else {
      setText("card-title", "지금까지 카드 공제 " + won(d.final));
      setText("card-sub", "총급여 " + short(state.salary) + " · " + short(total) + " 사용 · 기본한도까지 " + short(d.baseRoom) + " 남음");
    }

    animateTo("stat-card-deduction", d.final, won);
    animateTo("stat-card-saving", savingOf(d.final), won);
    setText("stat-card-room", d.reachedBase ? (d.addRoom > 0 ? "추가한도 " + short(d.addRoom) : "한도 소진") : won(d.baseRoom));
    setText("stat-card-room-label", d.reachedBase ? (d.addRoom > 0 ? "남은 추가한도" : "카드 한도") : "남은 기본한도");

    /* 결제수단 비중 */
    var denom = total > 0 ? total : 1;
    var creditPct = (state.credit / denom) * 100;
    var checkPct = (state.check / denom) * 100;
    var marketPct = ((state.market + state.transit + state.culture) / denom) * 100;
    setBar("ratio-credit", creditPct);
    setBar("ratio-check", checkPct);
    setBar("ratio-market", marketPct);
    setText("ratio-total", short(total));
    setText("legend-credit", short(state.credit));
    setText("legend-check", short(state.check));
    setText("legend-market", short(state.market + state.transit + state.culture));

    /* 플랜 */
    var plan = C.cardPlan(cardInput(), state.budget, "check");
    var maxPlan = C.cardPlan(cardInput(), state.budget, "max");
    last.plan = plan;
    last.maxPlan = maxPlan;

    setText("plan-title", plan.budget > 0
      ? "남은 " + short(plan.budget) + ", 이 순서로 쓰세요"
      : "남은 기간 카드 지출을 넣어 보세요");
    setText("plan-gain", plan.gain > 0 ? "공제 +" + short(plan.gain) : "추가 공제 없음");
    renderPlanSteps(plan);
    renderPlanSummary(plan, maxPlan);
    renderCompare(plan, maxPlan);

    renderCardBreakdown(d);
    setText("culture-note", limits.over70
      ? "총급여 7천만원 초과라 문화체육 사용분은 따로 입력하지 않습니다. 신용·체크 사용액에 포함해 주세요."
      : "도서·공연·영화·박물관·체육시설은 총급여 7천만원 이하만 30%로 따로 계산됩니다.");
    setHTML("net-note", limits.over70
      ? "총급여 7천만원 초과자는 <strong>도서·공연·체육 사용분을 결제수단(신용·체크) 금액에 포함</strong>해 적어 주세요. <strong>전통시장·대중교통</strong>은 아래에 따로 적습니다."
      : "신용카드·체크카드·현금영수증 금액은 <strong>전통시장·대중교통·도서·공연 사용분을 빼고</strong> 적어 주세요. 그 사용분은 아래에 따로 적습니다.");
    var cultureRow = $("culture-row");
    if (cultureRow) show(cultureRow, !limits.over70);
  }

  function setBar(id, pct) {
    var el = $(id);
    if (el && el.style) el.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + "%";
  }

  function renderPlanSteps(plan) {
    var box = $("plan-steps");
    if (!box) return;
    if (!plan.steps.length) {
      var msg;
      if (plan.result.reachedBase && plan.result.reachedAdd) {
        msg = "이미 기본·추가한도를 모두 채웠습니다. 더 써도 소득공제는 늘지 않아요.";
      } else if (plan.budget <= 0) {
        msg = "앞으로 쓸 돈을 넣으면, 문턱과 한도까지 필요한 금액을 알려드려요.";
      } else {
        msg = "남은 돈으로는 공제가 늘지 않습니다. 이미 한도 안이거나 문턱을 채우지 못하는 금액이에요.";
      }
      box.innerHTML = '<li class="step-empty">' + msg + "</li>";
      return;
    }
    box.innerHTML = plan.steps.map(function (s) {
      return '<li><div class="step-body">' +
        '<div class="step-title"><span>' + s.title + "</span><b>" + short(s.amount) + "</b></div>" +
        '<div class="step-detail">' + s.detail + "</div>" +
        "</div></li>";
    }).join("");
  }

  function renderPlanSummary(plan, maxPlan) {
    var parts = [];
    if (plan.gain > 0) {
      parts.push("이 순서로 쓰면 공제가 <strong>" + short(plan.gain) + "</strong> 늘고, 세금은 지방소득세 포함 <strong>" + short(savingOf(plan.gain)) + "</strong> 줄어듭니다(소득세율 " + Math.round(C.marginalRate(state.salary, state.dependents) * 100) + "% 기준).");
    }
    if (plan.unused > 0) {
      parts.push("남은 " + short(plan.unused) + "은 한도 밖이라 공제 효과가 없습니다.");
    }
    var cur = plan.result;
    var need = cur.thresholdGap;
    if (cur.baseRoom > 0) need += cur.baseRoom / 0.30;
    if (cur.addRoom > 0) need += cur.addRoom / 0.40;
    if (need > 0 && plan.unused === 0) {
      parts.push("기본·추가한도를 모두 채우려면 " + short(Math.ceil(need / 10000) * 10000) + " 정도 더 필요합니다.");
    }
    if (maxPlan.gain > plan.gain) {
      parts.push("전통시장·대중교통을 함께 쓴다면 같은 돈으로 최대 <strong>" + short(maxPlan.gain) + "</strong>까지 공제가 늘어납니다.");
    }
    if (!parts.length) {
      parts.push(plan.budget <= 0 ? "앞으로 쓸 돈을 넣으면 남은 기간의 카드 사용 순서를 계산해 드립니다." : "이미 카드 공제 한도를 모두 채웠거나, 남은 돈으로는 공제가 늘지 않습니다.");
    }
    setHTML("plan-summary", parts.join(" "));
  }

  function renderCompare(plan, maxPlan) {
    var body = $("compare-body");
    if (!body) return;
    var rows = [
      { label: "추천 순서 (신용 → 체크 → 전통시장)", gain: plan.gain },
      { label: "신용카드로만", gain: plan.allCreditGain },
      { label: "체크카드로만", gain: plan.allCheckGain },
      { label: "전통시장·대중교통까지", gain: maxPlan.gain }
    ];
    var best = Math.max.apply(null, rows.map(function (r) { return r.gain; }));
    var marked = false;
    body.innerHTML = rows.map(function (r) {
      var isBest = r.gain === best && best > 0 && !marked;
      if (isBest) marked = true;
      return '<tr class="' + (isBest ? "is-best" : "") + '">' +
        "<td>" + r.label + (isBest ? ' <span aria-hidden="true">★</span>' : "") + "</td>" +
        "<td>" + (r.gain > 0 ? "+" + short(r.gain) : "0원") + "</td>" +
        "<td>" + (r.gain > 0 ? short(savingOf(r.gain)) : "0원") + "</td>" +
        "</tr>";
    }).join("");
    setText("compare-note", "예상 절세는 소득세율 " + Math.round(C.marginalRate(state.salary, state.dependents) * 100) + "%에 지방소득세 10%를 더한 값입니다. 전통시장·대중교통은 실제로 이용할 때만 인정됩니다.");
    setText("stat-card-saving-note", "소득세율 " + Math.round(C.marginalRate(state.salary, state.dependents) * 100) + "% + 지방세 기준");
  }

  function row(label, value, cls) {
    return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><th scope=\"row\">" + label + "</th><td>" + value + "</td></tr>";
  }

  function renderCardBreakdown(d) {
    var body = $("card-breakdown-body");
    if (!body) return;
    var html = "";
    html += row("총급여", won(state.salary));
    html += row("최저사용금액 (25%)", won(d.threshold));
    html += row("카드·현금영수증 사용액", won(d.total));
    html += row("문턱에 묻힌 공제", "−" + won(d.thresholdLoss));
    html += row("신용카드 " + short(d.taxable.credit) + " × 15%", won(d.ded.credit));
    html += row("체크·현금 " + short(d.taxable.check) + " × 30%", won(d.ded.check));
    if (d.taxable.culture > 0) html += row("문화체육 " + short(d.taxable.culture) + " × 30%", won(d.ded.culture));
    if (d.taxable.market > 0) html += row("전통시장 " + short(d.taxable.market) + " × 40%", won(d.ded.market));
    if (d.taxable.transit > 0) html += row("대중교통 " + short(d.taxable.transit) + " × 40%", won(d.ded.transit));
    html += row("계산된 공제액", won(d.raw), "sum");
    html += row("기본한도 " + short(d.limits.baseLimit) + " 적용", won(d.base));
    html += row("추가한도 " + short(d.limits.addLimit) + " 적용", won(d.additional));
    html += row("최종 카드 소득공제", won(d.final), "final");
    body.innerHTML = html;
  }

  /* ── 세액공제 탭 렌더 ────────────────────────────────────── */
  function renderCredit() {
    var res = C.settle(settleInput());
    last.settle = res;
    var bal = res.balance;
    var chosen = res.chosen;

    setText("salary-won-2", "= " + won(state.salary));

    var badge = $("refund-badge");
    if (badge) {
      badge.classList.remove("is-due", "is-warn", "is-zero");
      if (Math.abs(bal.value) < 1000) {
        badge.textContent = "정산 거의 없음";
        badge.classList.add("is-zero");
      } else if (bal.isRefund) {
        badge.textContent = "환급 예상";
      } else {
        badge.textContent = "추가 납부 예상";
        badge.classList.add("is-due");
      }
    }

    if (Math.abs(bal.value) < 1000) {
      setText("refund-title", "환급액은 거의 0원입니다");
      setText("refund-sub", (res.withheld.estimated ? "예상 기납부 " : "기납부세액 ") + won(res.withheld.value) + " − 결정세액 " + won(chosen.total));
    } else if (bal.isRefund) {
      setText("refund-title", "2027년 2월, " + won(bal.abs) + " 돌려받을 수 있어요");
      setText("refund-sub", (res.withheld.estimated ? "예상 기납부 " : "기납부세액 ") + won(res.withheld.value) + " − 결정세액 " + won(chosen.total));
    } else {
      setText("refund-title", "2027년 2월, " + won(bal.abs) + " 더 낼 수 있어요");
      setText("refund-sub", (res.withheld.estimated ? "예상 기납부 " : "기납부세액 ") + won(res.withheld.value) + "보다 결정세액이 " + won(bal.abs) + " 많습니다");
    }

    animateTo("stat-refund", bal.abs, won);
    setText("refund-label", bal.isRefund ? "예상 환급액" : (bal.isDue ? "예상 추가 납부" : "정산액"));
    animateTo("stat-determined", chosen.total, won);
    animateTo("stat-credit", chosen.totalCredit, won);
    setText("stat-credit-note", chosen.unusedCredit > 0
      ? "산출세액 한도 " + short(chosen.calculatedTax) + "까지 반영"
      : "국세 기준");
    animateTo("stat-cardded", res.card.final, won);

    /* 기납부 vs 결정 */
    var paid = res.withheld.value;
    var fin = chosen.total;
    var finalBar = $("refund-final");
    if (paid <= 0 && fin <= 0) {
      setBar("refund-paid", 0);
      setBar("refund-final", 0);
      setText("legend-paid-label", "결정세액");
      setText("legend-final-label", "환급");
      setText("legend-paid", "0원");
      setText("legend-final", "0원");
      if (finalBar) finalBar.classList.remove("is-due");
    } else if (fin <= paid) {
      var keptPct = paid > 0 ? (fin / paid) * 100 : 0;
      setBar("refund-paid", keptPct);
      setBar("refund-final", Math.max(0, 100 - keptPct));
      setText("legend-paid-label", "결정세액");
      setText("legend-final-label", "환급");
      setText("legend-paid", won(fin));
      setText("legend-final", won(Math.max(0, paid - fin)));
      if (finalBar) finalBar.classList.remove("is-due");
    } else {
      var paidPct = fin > 0 ? (paid / fin) * 100 : 0;
      setBar("refund-paid", paidPct);
      setBar("refund-final", Math.max(0, 100 - paidPct));
      setText("legend-paid-label", "기납부");
      setText("legend-final-label", "추가 납부");
      setText("legend-paid", won(paid));
      setText("legend-final", won(fin - paid));
      if (finalBar) finalBar.classList.add("is-due");
    }
    setText("refund-bar-label", bal.isRefund ? "환급 " + short(bal.abs) : (bal.isDue ? "추가 납부 " + short(bal.abs) : "차액 없음"));

    var topItem = chosen.items.slice().sort(function (a, b) { return b.credit - a.credit; })[0];
    var foot = "카드 소득공제 " + short(res.card.final) + " + 세액공제 " + short(chosen.totalCredit) + "이 반영됐습니다.";
    if (chosen.unusedCredit > 0) {
      foot += " 다만 산출세액 한도(" + short(chosen.calculatedTax) + ")를 넘는 " + short(chosen.unusedCredit) + "은 반영되지 않았습니다.";
    }
    if (topItem) foot += " 가장 큰 항목은 " + topItem.label + "(" + short(topItem.credit) + ")입니다.";
    if (res.withheld.estimated) foot += " 기납부세액은 간이 추정값입니다.";
    setText("refund-foot", foot);

    /* 한도·입력 안내 */
    setText("pension-note", res.credits.pension.eligible > 0
      ? "공제 대상 " + short(res.credits.pension.eligible) + " · 예상 세액공제 " + short(res.credits.pension.credit)
      : "연금저축·IRP 납입액을 넣으면 세액공제가 계산됩니다.");
    setText("irp-note", res.credits.pension.remaining > 0
      ? "한도까지 " + short(res.credits.pension.remaining) + " 남았습니다."
      : "연금계좌 900만원 한도를 모두 채웠습니다.");
    setText("insurance-note", res.credits.insurance.credit > 0
      ? "보장성보험료 " + short(res.credits.insurance.eligible) + " × 12% = " + short(res.credits.insurance.credit)
      : "보장성보험료를 넣으면 최대 12만원까지 공제됩니다.");
    setText("rent-note", !state.rentOn
      ? "무주택 세대주라면 스위치를 켜고 월세를 넣어 보세요."
      : (res.credits.rent.eligibleFor
        ? "연 " + short(res.credits.rent.annual) + " 중 " + short(res.credits.rent.eligible) + " × " + C.percent(res.credits.rent.rate, 0) + " = " + short(res.credits.rent.credit)
        : "총급여 8,000만원을 넘어 월세 세액공제 대상이 아닙니다."));
    setText("medical-note", res.credits.medical.total > 0
      ? "총급여 3% 문턱 " + short(res.credits.medical.threshold) + " · 공제 대상 " + short(res.credits.medical.excess) + " · 세액공제 " + short(res.credits.medical.credit)
      : "총급여의 3%까지는 공제되지 않습니다. 안경·렌즈는 1인당 50만원, 산후조리원은 출산 1회 200만원까지 인정됩니다.");
    setText("hometown-note", res.credits.hometown.amount > 0
      ? short(res.credits.hometown.amount) + " 기부 → 세액공제 " + short(res.credits.hometown.credit) + " (지방세 포함 약 " + short(Math.round(res.credits.hometown.credit * 1.1 / 1000) * 1000) + ")"
      : "10만원까지 전액, 10만~20만원 40%, 20만원 초과 15% 세액공제. 답례품 30%는 별도.");

    renderCreditList(res);
    renderLimitHints(res);
    renderRefundBreakdown(res);
    setText("credit-mode-note", chosen.mode === "special"
      ? "건강보험료·장기요양·고용보험 특별소득공제와 특별세액공제를 적용했습니다. 표준세액공제(13만원)를 택하면 세금이 " + short(chosen.alternativeTotal - chosen.total) + " 더 많아집니다."
      : "특별세액공제(보험료·의료비·교육비·기부금)와 월세 세액공제 대신 표준세액공제 13만원을 적용했습니다. 특별세액공제를 넣으면 계산기가 유리한 쪽을 다시 고릅니다.");

  }

  function renderCreditList(res) {
    var box = $("credit-list");
    if (!box) return;
    var c = res.credits;
    var items = [
      { name: "근로소득세액공제", note: "산출세액과 총급여 기준", credit: res.chosen.laborCredit },
      { name: "연금저축·IRP", note: short(c.pension.eligible) + " × " + C.percent(c.pension.rate, 0), credit: c.pension.credit },
      { name: "보장성보험료", note: short(c.insurance.eligible) + " × 12%", credit: c.insurance.credit },
      { name: "의료비", note: c.medical.credit > 0 ? "총급여 3% 초과분" : "문턱 미달", credit: c.medical.credit },
      { name: "교육비", note: c.education.eligible > 0 ? short(c.education.eligible) + " × 15%" : "입력 없음", credit: c.education.credit },
      { name: "월세액", note: c.rent.credit > 0 ? short(c.rent.eligible) + " × " + C.percent(c.rent.rate, 0) : (state.rentOn ? "요건 확인" : "해당 없음"), credit: c.rent.credit },
      { name: "일반 기부금", note: c.donation.eligible > 0 ? short(c.donation.eligible) + " × 15%" : "입력 없음", credit: c.donation.credit },
      { name: "고향사랑기부금", note: short(c.hometown.amount) + " 기부", credit: c.hometown.credit },
      { name: "자녀세액공제", note: state.children + "명", credit: c.child }
    ];
    if (!res.chosen.useSpecial) {
      items.push({ name: "표준세액공제", note: "특별세액공제 미적용", credit: C.RULES.standardTaxCredit });
    }
    box.innerHTML = items.map(function (it) {
      return '<li class="' + (it.credit > 0 ? "" : "is-off") + '">' +
        '<div><div class="c-name">' + it.name + '</div><div class="c-note">' + it.note + "</div></div>" +
        '<div class="c-amount">' + (it.credit > 0 ? won(it.credit) : "0원") + "</div></li>";
    }).join("") +
      '<li><div><div class="c-name">세액공제 합계</div><div class="c-note">산출세액 한도 ' + short(res.chosen.calculatedTax) + "</div></div>" +
      '<div class="c-amount">' + won(res.chosen.totalCredit) + "</div></li>";
  }

  function renderLimitHints(res) {
    var box = $("limit-hints");
    if (!box) return;
    var hints = [];
    var p = res.credits.pension;
    if (p.remaining > 0) hints.push(["연금계좌 900만원 한도", short(p.remaining) + " 남음"]);
    var ins = res.credits.insurance;
    if (ins.eligible < C.RULES.insurance.cap) hints.push(["보장성보험 100만원 한도", short(C.RULES.insurance.cap - ins.eligible) + " 남음"]);
    var rent = res.credits.rent;
    if (state.rentOn && rent.eligibleFor && rent.remaining > 0) hints.push(["월세 1,000만원 한도", short(rent.remaining) + " 남음"]);
    var med = res.credits.medical;
    if (med.total > 0 && med.total < med.threshold) {
      hints.push(["의료비 3% 문턱", short(med.threshold - med.total) + " 남음"]);
    } else if (med.generalCapped) {
      hints.push(["일반 의료비 700만원 한도", "한도 도달"]);
    }
    var home = res.credits.hometown;
    if (home.amount > 0 && home.amount < 200000) {
      hints.push(["고향사랑 20만원 구간", short(200000 - home.amount) + " 더 넣으면 40%"]);
    }
    if (res.card.baseRoom > 0) hints.push(["카드 기본한도", short(res.card.baseRoom) + " 남음"]);
    if (res.card.addRoom > 0) hints.push(["카드 추가한도", short(res.card.addRoom) + " 남음"]);
    if (!hints.length) hints.push(["모든 한도", "채움 또는 해당 없음"]);
    box.innerHTML = hints.map(function (h) {
      return "<li><span>" + h[0] + "</span><b>" + h[1] + "</b></li>";
    }).join("");
  }

  function renderRefundBreakdown(res) {
    var body = $("refund-breakdown-body");
    if (!body) return;
    var d = res.chosen.deductions;
    var html = "";
    html += row("총급여", won(res.salary));
    html += row("− 근로소득공제", won(res.labor.deduction));
    html += row("근로소득금액", won(res.labor.income), "sum");
    html += row("− 기본공제 (본인" + (res.dependents ? "·가족 " + res.dependents + "명" : "") + ")", won(d.basic));
    html += row("− 국민연금보험료", won(d.pension));
    if (d.special > 0) html += row("− 건강·장기요양·고용보험료", won(d.special));
    html += row("− 신용카드 등 소득공제", won(d.card));
    html += row("과세표준", won(res.chosen.taxBase), "sum");
    html += row("적용 세율", Math.round(res.chosen.bracket.rate * 100) + "% (" + res.chosen.bracket.label + ")");
    html += row("산출세액", won(res.chosen.calculatedTax));
    html += row("− 근로소득세액공제", won(res.chosen.laborCredit));
    res.chosen.items.forEach(function (it) {
      html += row("− " + it.label, won(it.credit));
    });
    html += row("세액공제 합계", won(res.chosen.totalCredit), "sum");
    html += row("결정세액 (국세)", won(res.chosen.determined));
    html += row("+ 지방소득세", won(res.chosen.local));
    html += row("결정세액 합계", won(res.chosen.total), "sum");
    html += row("− 기납부세액" + (res.withheld.estimated ? " (추정)" : ""), won(res.withheld.value));
    html += row(res.balance.isRefund ? "예상 환급액" : (res.balance.isDue ? "예상 추가 납부" : "정산액"), won(res.balance.abs), "final");
    body.innerHTML = html;
  }

  /* ── 입력 동기화 ─────────────────────────────────────────── */
  function fieldValue(key) {
    var v = state[key];
    if (v == null) return "";
    return commaText(Math.round(v / 10000));
  }

  function syncInputs() {
    all("[data-money]").forEach(function (el) {
      if (document.activeElement === el) return;
      var key = el.getAttribute("data-money");
      var unit = el.getAttribute("data-unit");
      var v = state[key];
      el.value = v == null ? "" : (unit === "won" ? commaText(Math.round(v)) : fieldValue(key));
    });
    all("[data-out]").forEach(function (el) {
      var key = el.getAttribute("data-out");
      el.textContent = state[key] + "명";
    });
    all(".stepper").forEach(function (box) {
      var key = box.getAttribute("data-target");
      box.querySelectorAll(".step-btn").forEach(function (b) {
        var dir = Number(b.getAttribute("data-dir"));
        var next = (state[key] || 0) + dir;
        b.disabled = next < 0 || next > 8;
        b.style.opacity = b.disabled ? "0.4" : "";
      });
    });
    all("#salary-chips button").forEach(function (b) {
      b.classList.toggle("is-active", Number(b.dataset.value) * 10000 === state.salary);
    });
    var slider = $("budget-slider");
    if (slider) {
      var man = Math.round(state.budget / 10000);
      slider.max = String(Math.max(1000, Math.ceil(man / 100) * 100));
      if (document.activeElement !== slider) slider.value = String(man);
    }
    var rentSwitch = $("rent-on");
    if (rentSwitch) rentSwitch.checked = !!state.rentOn;
    show($("rent-wrap"), !!state.rentOn);
  }

  function renderAll() {
    clampState();
    syncInputs();
    renderCard();
    renderCredit();
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
  function bindMoney(el) {
    var key = el.getAttribute("data-money");
    on(el, "input", function () {
      var raw = el.value;
      if (key === "withheld" && digits(raw) === "") {
        state.withheld = null;
      } else if (el.getAttribute("data-unit") === "won") {
        state[key] = Math.round(toMan(raw));
      } else {
        state[key] = Math.round(toMan(raw) * 10000);
      }
      el.value = commaText(raw.replace(/,/g, ""));
      update();
    });
    on(el, "focus", function () { try { el.select(); } catch (e) { /* 무시 */ } });
    on(el, "blur", function () { syncInputs(); });
  }

  function bindEvents() {
    on($("tab-btn-card"), "click", function () { setTab("card", false); });
    on($("tab-btn-credit"), "click", function () { setTab("credit", false); });
    on($("to-credit"), "click", function () {
      setTab("credit", true);
      var el = $("refund-result");
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    });

    all("[data-money]").forEach(bindMoney);

    all(".stepper").forEach(function (box) {
      on(box, "click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest(".step-btn") : null;
        if (!b) return;
        var key = box.getAttribute("data-target");
        var dir = Number(b.getAttribute("data-dir"));
        state[key] = Math.max(0, Math.min(8, (state[key] || 0) + dir));
        update();
      });
    });

    on($("salary-chips"), "click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button[data-value]") : null;
      if (!b) return;
      state.salary = Number(b.dataset.value) * 10000;
      update();
    });

    on($("budget-slider"), "input", function (e) {
      state.budget = (Number(e.target.value) || 0) * 10000;
      update();
    });

    on($("rent-on"), "change", function (e) {
      state.rentOn = !!e.target.checked;
      update();
    });

    on($("withheld-reset"), "click", function () {
      state.withheld = null;
      var el = $("withheld-input");
      if (el) el.value = "";
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

  /* ── 요약 텍스트 ─────────────────────────────────────────── */
  function summaryText() {
    var s = last.settle || C.settle(settleInput());
    var d = last.card || C.cardDeduction(cardInput());
    var lines = [];
    lines.push("[연말정산 환급 계산기 · 2026년 귀속]");
    lines.push("총급여 " + short(state.salary) + " · 부양가족 " + state.dependents + "명 · 자녀 " + state.children + "명");
    lines.push("· 카드 사용 " + short(d.total) + " → 예상 소득공제 " + short(d.final));
    lines.push("· 세액공제 " + short(s.chosen.totalCredit) + " (국세 기준)");
    lines.push("· 결정세액 " + short(s.chosen.total) + " (국세+지방)");
    lines.push("· " + (s.balance.isRefund ? "예상 환급 " : "예상 추가 납부 ") + short(s.balance.abs));
    lines.push("모의 계산입니다. 최종 확인은 홈택스·회사 연말정산 담당자.");
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
    var s = last.settle || C.settle(settleInput());
    var canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    var ctx = canvas.getContext("2d");
    if (!ctx) { toast("이 브라우저에서는 이미지를 만들 수 없어요"); return; }

    var g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#1e2a44");
    g.addColorStop(0.55, "#17233a");
    g.addColorStop(1, "#0e1626");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(169,122,18,0.18)";
    ctx.beginPath();
    ctx.arc(920, 160, 280, 0, Math.PI * 2);
    ctx.fill();

    var font = '"Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",Roboto,"Helvetica Neue",Arial,"Liberation Sans",sans-serif';
    ctx.fillStyle = "#d9c48a";
    ctx.font = "600 34px " + font;
    ctx.fillText("연말정산 환급 계산기", 84, 128);
    ctx.font = "24px " + font;
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillText("2026년 귀속 · 2027년 2월 정산", 84, 168);

    var headline = s.balance.isRefund ? "예상 환급액" : (s.balance.isDue ? "예상 추가 납부" : "정산액");
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 44px " + font;
    ctx.fillText(headline, 84, 330);

    var amountText = won(s.balance.abs);
    var size = 128;
    ctx.font = "800 " + size + "px " + font;
    while (ctx.measureText(amountText).width > 900 && size > 60) {
      size -= 6;
      ctx.font = "800 " + size + "px " + font;
    }
    ctx.fillStyle = s.balance.isRefund ? "#8ef0c4" : "#ffe1a8";
    ctx.fillText(amountText, 80, 470);

    ctx.font = "28px " + font;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText("총급여 " + short(state.salary) + " · 카드 " + short(s.card.total) + " 사용", 84, 530);

    var rows = [
      ["카드 소득공제", won(s.card.final)],
      ["세액공제 합계", won(s.chosen.totalCredit)],
      ["결정세액 (국세+지방)", won(s.chosen.total)],
      ["기납부세액" + (s.withheld.estimated ? " (추정)" : ""), won(s.withheld.value)]
    ];
    var y = 660;
    rows.forEach(function (r) {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      roundRect(ctx, 72, y, 936, 108, 24);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.68)";
      ctx.font = "28px " + font;
      ctx.fillText(r[0], 112, y + 66);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 36px " + font;
      var w = ctx.measureText(r[1]).width;
      ctx.fillText(r[1], 968 - w, y + 68);
      y += 126;
    });

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "23px " + font;
    ctx.fillText("모의 계산입니다. 최종 확인은 홈택스·회사 연말정산 담당자.", 84, 1268);

    var dataUrl;
    try { dataUrl = canvas.toDataURL("image/png"); } catch (e) { toast("이미지를 만들 수 없어요"); return; }
    var img = $("sheet-image");
    if (img) img.src = dataUrl;
    last.shareBlob = null;
    if (canvas.toBlob) canvas.toBlob(function (blob) { last.shareBlob = blob; }, "image/png");
    last.shareName = "year-end-tax-" + (s.balance.isRefund ? "refund" : "due") + ".png";
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
    a.download = last.shareName || "year-end-tax.png";
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
        var file = new File([last.shareBlob], last.shareName || "year-end-tax.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "연말정산 환급 계산 결과" }).catch(function () { /* 취소 */ });
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
    clampState();
    bindEvents();
    mountAds();
    initPwa();
    var hash = String(window.location.hash || "").replace("#", "");
    setTab(hash === "credit" ? "credit" : "card", false);
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* 테스트·디버그용 */
  window.YEApp = {
    state: state,
    get results() { return last; },
    render: renderAll,
    summary: summaryText,
    config: ADSENSE
  };
})();
