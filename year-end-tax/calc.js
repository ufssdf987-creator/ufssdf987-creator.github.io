/*!
 * YECalc — 2026년 귀속 연말정산 계산 엔진
 * ---------------------------------------------------------------
 * 카드 소득공제(황금비율)와 세액공제·환급액을 계산하는 순수 모듈입니다.
 * DOM에 의존하지 않아 브라우저(app.js)와 테스트(QuickJS)에서 같은 코드를 씁니다.
 *
 * 기준 확인일: 2026-11-25 (2027년 1~2월 연말정산 = 2026년 귀속)
 *  - 조세특례제한법 제126조의2(신용카드 등 소득공제, 2025.12.23 개정 → 2026.1.1 사용분)
 *      기본한도 300/350/400만원(총급여 7천만 이하), 250/275/300만원(초과)
 *      추가한도 300만원(이하, 전통시장·대중교통·문화체육) / 200만원(초과)
 *      공제율 신용 15% · 체크·현금 30% · 문화체육 30% · 전통시장·대중교통 40%
 *  - 소득세법 제47조(근로소득공제), 제50조(기본공제), 제52조(특별소득공제),
 *    제55조(세율), 제59조(근로소득세액공제), 제59조의2(자녀세액공제),
 *    제59조의3(연금계좌), 제59조의4(보험료·의료비·교육비·기부금, 표준세액공제 13만원)
 *  - 조세특례제한법 제95조의2(월세액 세액공제, 2026년 개정 반영: 연 1,000만원 한도)
 *  - 조세특례제한법 제58조(고향사랑기부금, 2025.12.23 개정 → 10만~20만원 40%)
 *  - 2026년 4대보험료율: 국민연금 9.5%(근로자 4.75%), 건강보험 7.19%(3.595%),
 *    장기요양 0.9448%(0.4724%), 고용보험 1.8%(근로자 0.9%)
 *
 * 모든 결과는 참고용 모의 계산입니다.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.YECalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ────────────────────────────────────────────────────────────
   * 1. 2026년 기준값
   * ──────────────────────────────────────────────────────────── */
  var RULES = {
    year: 2026,
    verifiedAt: "2026-11-25",

    /* 종합소득세 기본세율 8구간 — 소득세법 제55조 */
    taxBrackets: [
      { upTo: 14000000, rate: 0.06, progressive: 0, label: "1,400만원 이하" },
      { upTo: 50000000, rate: 0.15, progressive: 1260000, label: "1,400만~5,000만원" },
      { upTo: 88000000, rate: 0.24, progressive: 5760000, label: "5,000만~8,800만원" },
      { upTo: 150000000, rate: 0.35, progressive: 15440000, label: "8,800만~1억5,000만원" },
      { upTo: 300000000, rate: 0.38, progressive: 19940000, label: "1억5,000만~3억원" },
      { upTo: 500000000, rate: 0.40, progressive: 25940000, label: "3억~5억원" },
      { upTo: 1000000000, rate: 0.42, progressive: 35940000, label: "5억~10억원" },
      { upTo: Infinity, rate: 0.45, progressive: 65940000, label: "10억원 초과" }
    ],
    localTaxRate: 0.10, // 개인지방소득세 = 소득세의 10%

    /* 근로소득공제 — 소득세법 제47조 (한도 2,000만원) */
    earnedDeduction: {
      cap: 20000000,
      tiers: [
        { upTo: 5000000, rate: 0.70, base: 0, from: 0 },
        { upTo: 15000000, rate: 0.40, base: 3500000, from: 5000000 },
        { upTo: 45000000, rate: 0.15, base: 7500000, from: 15000000 },
        { upTo: 100000000, rate: 0.05, base: 12000000, from: 45000000 },
        { upTo: Infinity, rate: 0.02, base: 14750000, from: 100000000 }
      ]
    },

    basicDeductionPerPerson: 1500000,
    standardTaxCredit: 130000,
    childTaxCredit: { first: 150000, second: 300000, extra: 300000 },
    laborCredit: { threshold: 1300000, rateLow: 0.55, baseHigh: 715000, rateHigh: 0.30 },

    /* 4대보험 근로자 부담 (2026년) */
    social: {
      npsRate: 0.0475,
      npsMonthlyCap: 6590000,
      npsMonthlyFloor: 410000,
      healthRate: 0.03595,
      ltcRate: 0.004724,
      employmentRate: 0.009
    },

    /* 신용카드 등 소득공제 — 조세특례제한법 제126조의2 */
    card: {
      thresholdRate: 0.25,
      creditRate: 0.15,
      debitRate: 0.30,
      cultureRate: 0.30,
      marketRate: 0.40,
      transitRate: 0.40,
      salaryBreak: 70000000,
      baseLimit: {
        under: { none: 3000000, one: 3500000, many: 4000000 },
        over: { none: 2500000, one: 2750000, many: 3000000 }
      },
      addLimit: { under: 3000000, over: 2000000 }
    },

    /* 연금계좌 세액공제 — 소득세법 제59조의3 */
    pension: {
      savingsCap: 6000000,
      totalCap: 9000000,
      rateLow: 0.15,
      rateHigh: 0.12,
      salaryBreak: 55000000
    },

    /* 월세액 세액공제 — 조세특례제한법 제95조의2 */
    rent: {
      cap: 10000000,
      rateLow: 0.17,
      rateHigh: 0.15,
      salaryLimit: 80000000,
      salaryBreak: 55000000
    },

    /* 보장성보험료 — 소득세법 제59조의4 제1항 */
    insurance: { cap: 1000000, rate: 0.12, disabledRate: 0.15 },

    /* 의료비 — 소득세법 제59조의4 제2항 */
    medical: {
      thresholdRate: 0.03,
      rate: 0.15,
      generalCap: 7000000,
      fertilityRate: 0.30,
      prematureRate: 0.20
    },

    /* 교육비 — 소득세법 제59조의4 제3항 */
    education: {
      schoolCap: 3000000,
      collegeCap: 9000000,
      rate: 0.15
    },

    /* 기부금 — 소득세법 제59조의4 제4항 */
    donation: { baseRate: 0.15, highRate: 0.30, highBreak: 10000000, incomeCapRate: 0.30 },

    /* 고향사랑기부금 — 조세특례제한법 제58조 */
    hometown: {
      cap: 20000000,
      first: 100000,
      second: 100000,
      firstRate: 100 / 110,
      secondRate: 0.40,
      baseRate: 0.15
    }
  };

  /* ────────────────────────────────────────────────────────────
   * 2. 유틸
   * ──────────────────────────────────────────────────────────── */
  function floorTo(n, unit) {
    if (!isFinite(n)) return 0;
    var eps = 1e-6;
    return Math.floor((n + eps) / unit) * unit;
  }
  function clamp(n, lo, hi) { return Math.min(Math.max(n, lo), hi); }
  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v == null ? 0 : v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : 0;
  }
  function roundWon(n) { return floorTo(Math.abs(n), 10) * (n < 0 ? -1 : 1); }

  /* ────────────────────────────────────────────────────────────
   * 3. 근로소득·4대보험
   * ──────────────────────────────────────────────────────────── */
  function earnedDeductionAmount(grossSalary) {
    var g = Math.max(0, num(grossSalary));
    if (g <= 0) return 0;
    var d = 0;
    for (var i = 0; i < RULES.earnedDeduction.tiers.length; i++) {
      var t = RULES.earnedDeduction.tiers[i];
      if (g <= t.upTo) { d = t.base + (g - t.from) * t.rate; break; }
    }
    return Math.min(d, RULES.earnedDeduction.cap, g);
  }

  function laborIncomeOf(grossSalary) {
    var g = Math.max(0, num(grossSalary));
    var ded = earnedDeductionAmount(g);
    return { gross: g, deduction: ded, income: g - ded };
  }

  /** 근로자 부담 4대보험 (연간). 월 보험료 10원 미만 버림 후 12개월. */
  function employeeSocial(grossSalary) {
    var g = Math.max(0, num(grossSalary));
    if (g <= 0) return { nps: 0, health: 0, ltc: 0, employment: 0, special: 0, total: 0, monthly: {} };
    var monthlyPay = g / 12;
    var npsBase = Math.min(monthlyPay, RULES.social.npsMonthlyCap);
    var npsM = floorTo(npsBase * RULES.social.npsRate, 10);
    var healthM = floorTo(monthlyPay * RULES.social.healthRate, 10);
    var ltcM = floorTo(monthlyPay * RULES.social.ltcRate, 1);
    var empM = floorTo(monthlyPay * RULES.social.employmentRate, 10);
    var nps = npsM * 12;
    var health = healthM * 12;
    var ltc = ltcM * 12;
    var employment = empM * 12;
    return {
      nps: nps,
      health: health,
      ltc: ltc,
      employment: employment,
      special: health + ltc + employment,
      total: nps + health + ltc + employment,
      monthlyBase: npsBase,
      monthly: { nps: npsM, health: healthM, ltc: ltcM, employment: empM }
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 4. 세율·근로소득세액공제·자녀세액공제
   * ──────────────────────────────────────────────────────────── */
  function applyBrackets(taxBase) {
    var b = Math.max(0, floorTo(num(taxBase), 1000));
    var list = RULES.taxBrackets;
    var row = list[list.length - 1];
    for (var i = 0; i < list.length; i++) {
      if (b <= list[i].upTo) { row = list[i]; break; }
    }
    var tax = Math.max(0, floorTo(b * row.rate - row.progressive, 10));
    return {
      taxBase: b,
      rate: row.rate,
      ratePercent: row.rate * 100,
      progressive: row.progressive,
      label: row.label,
      tax: tax
    };
  }

  function laborTaxCredit(taxOnLabor, grossSalary) {
    var t = Math.max(0, taxOnLabor);
    if (t <= 0) return 0;
    var calculated = t <= RULES.laborCredit.threshold
      ? t * RULES.laborCredit.rateLow
      : RULES.laborCredit.baseHigh + (t - RULES.laborCredit.threshold) * RULES.laborCredit.rateHigh;
    var g = Math.max(0, num(grossSalary));
    var limit;
    if (g <= 33000000) limit = 740000;
    else if (g <= 70000000) limit = Math.max(740000 - (g - 33000000) * 0.008, 660000);
    else if (g <= 120000000) limit = Math.max(660000 - (g - 70000000) * 0.5, 500000);
    else limit = Math.max(500000 - (g - 120000000) * 0.5, 200000);
    return floorTo(Math.min(calculated, limit), 10);
  }

  function childTaxCredit(children) {
    var n = Math.max(0, Math.floor(num(children)));
    if (n <= 0) return 0;
    if (n === 1) return RULES.childTaxCredit.first;
    if (n === 2) return RULES.childTaxCredit.second;
    return RULES.childTaxCredit.second + (n - 2) * RULES.childTaxCredit.extra;
  }

  /* ────────────────────────────────────────────────────────────
   * 5. 신용카드 등 소득공제
   * ──────────────────────────────────────────────────────────── */
  function childBucket(children) {
    var n = Math.max(0, Math.floor(num(children)));
    return n <= 0 ? "none" : (n === 1 ? "one" : "many");
  }

  function cardLimits(salary, children) {
    var s = Math.max(0, num(salary));
    var over = s > RULES.card.salaryBreak;
    var key = childBucket(children);
    return {
      threshold: floorTo(s * RULES.card.thresholdRate, 10),
      baseLimit: over ? RULES.card.baseLimit.over[key] : RULES.card.baseLimit.under[key],
      addLimit: over ? RULES.card.addLimit.over : RULES.card.addLimit.under,
      over70: over,
      children: Math.max(0, Math.floor(num(children)))
    };
  }

  /**
   * 사용액 기준 카드 소득공제.
   * input = { salary, children, credit, check, market, transit, culture }
   *  - credit  : 신용카드 사용분
   *  - check   : 체크·직불·선불카드 + 현금영수증
   *  - market  : 전통시장 사용분 (결제수단과 무관하게 40%)
   *  - transit : 대중교통 이용분 (40%)
   *  - culture : 도서·공연·영화·박물관·체육시설 (총급여 7천만 이하만 30%)
   *
   * 최저사용금액(총급여 25%)은 신용카드 → 체크·현금 → 문화체육 → 전통시장 →
   * 대중교통 순서로 차감합니다(조특법 제126조의2 제2항 제6호).
   */
  function cardDeduction(input) {
    input = input || {};
    var salary = Math.max(0, num(input.salary));
    var children = Math.max(0, Math.floor(num(input.children)));
    var limits = cardLimits(salary, children);
    var credit = Math.max(0, num(input.credit));
    var check = Math.max(0, num(input.check));
    var market = Math.max(0, num(input.market));
    var transit = Math.max(0, num(input.transit));
    var cultureIn = Math.max(0, num(input.culture));
    /* 총급여 7천만 초과자는 문화체육을 따로 떼지 않고 결제수단 공제율로 계산합니다. */
    var culture = limits.over70 ? 0 : cultureIn;
    /* 총급여 7천만 초과자는 문화체육 사용분을 결제수단(신용카드) 사용분에 포함합니다. */
    if (limits.over70) credit += cultureIn;

    var total = credit + check + market + transit + culture;
    var threshold = limits.threshold;

    var rem = threshold;
    function take(x) { var u = Math.min(x, rem); rem -= u; return u; }
    var used = {
      credit: take(credit),
      check: take(check),
      culture: take(culture),
      market: take(market),
      transit: take(transit)
    };
    var taxable = {
      credit: Math.max(0, credit - used.credit),
      check: Math.max(0, check - used.check),
      culture: Math.max(0, culture - used.culture),
      market: Math.max(0, market - used.market),
      transit: Math.max(0, transit - used.transit)
    };
    var ded = {
      credit: taxable.credit * RULES.card.creditRate,
      check: taxable.check * RULES.card.debitRate,
      culture: taxable.culture * RULES.card.cultureRate,
      market: taxable.market * RULES.card.marketRate,
      transit: taxable.transit * RULES.card.transitRate
    };
    var raw = ded.credit + ded.check + ded.culture + ded.market + ded.transit;
    var potential = credit * RULES.card.creditRate + check * RULES.card.debitRate +
      culture * RULES.card.cultureRate + market * RULES.card.marketRate + transit * RULES.card.transitRate;
    var base = Math.min(raw, limits.baseLimit);
    var over = Math.max(0, raw - limits.baseLimit);
    var addEligible = ded.culture + ded.market + ded.transit;
    var additional = Math.min(over, addEligible, limits.addLimit);
    var finalDed = floorTo(base + additional, 10);

    return {
      salary: salary,
      children: children,
      limits: limits,
      total: total,
      threshold: threshold,
      thresholdGap: Math.max(0, threshold - total),
      overThreshold: Math.max(0, total - threshold),
      used: used,
      taxable: taxable,
      ded: ded,
      raw: raw,
      potential: potential,
      thresholdLoss: Math.max(0, potential - raw),
      base: base,
      over: over,
      addEligible: addEligible,
      additional: additional,
      final: finalDed,
      baseRoom: Math.max(0, limits.baseLimit - base),
      addRoom: Math.max(0, limits.addLimit - additional),
      maxDeduction: limits.baseLimit + limits.addLimit,
      reachedBase: base >= limits.baseLimit,
      reachedAdd: additional >= limits.addLimit
    };
  }

  /** 카드 사용액만 바꿔 다시 계산 (추가 지출 시뮬레이션용) */
  function withCardAdd(input, add) {
    add = add || {};
    return cardDeduction({
      salary: input.salary,
      children: input.children,
      credit: Math.max(0, num(input.credit)) + Math.max(0, num(add.credit)),
      check: Math.max(0, num(input.check)) + Math.max(0, num(add.check)),
      market: Math.max(0, num(input.market)) + Math.max(0, num(add.market)),
      transit: Math.max(0, num(input.transit)) + Math.max(0, num(add.transit)),
      culture: Math.max(0, num(input.culture)) + Math.max(0, num(add.culture))
    });
  }

  /** 남은 금액이 있을 때 기본한도를 채우는 데 필요한 사용액 (공제율별) */
  function spendToFillBase(room, rate) {
    if (room <= 0 || rate <= 0) return 0;
    return Math.ceil(room / rate);
  }

  /**
   * 남은 예산을 어떻게 쓰면 카드 공제가 가장 커지는지 계산합니다.
   *  - mode "check": 문턱은 신용, 그다음 체크·현금으로 기본한도, 남으면 전통시장·대중교통
   *                  (생활비를 체크카드로 쓰는 현실적인 순서)
   *  - mode "max"  : 문턱은 신용, 그다음 전통시장·대중교통(40%)으로 기본+추가한도,
   *                  모자라면 체크·현금, 문화체육, 신용 순 (같은 돈으로 최대 공제)
   */
  function cardPlan(input, budget, mode) {
    var base = cardDeduction(input);
    var B = Math.max(0, num(budget));
    var add = { credit: 0, check: 0, market: 0, transit: 0, culture: 0 };
    var left = B;
    var steps = [];

    /* 1) 25% 문턱은 신용카드로 채우는 것이 유리 (문턱이 신용 사용분부터 차감됨) */
    if (base.thresholdGap > 0 && left > 0) {
      var toCredit = Math.min(left, base.thresholdGap);
      add.credit += toCredit;
      left -= toCredit;
      steps.push({
        kind: "threshold", amount: toCredit,
        title: "신용카드로 문턱 채우기",
        detail: "총급여 25%까지는 공제가 0원이지만, 이 구간을 신용카드로 채워야 체크·현금 사용분이 30% 공제로 남습니다."
      });
    }

    var cur = withCardAdd(input, add);

    if (mode === "max") {
      /* 2) 전통시장·대중교통 40% — 기본+추가한도를 함께 채움 */
      var needMarket = left > 0 ? spendToFillBase(cur.baseRoom + cur.addRoom, RULES.card.marketRate) : 0;
      var toMarket = Math.min(left, needMarket);
      if (toMarket > 0) {
        add.market += toMarket;
        left -= toMarket;
        steps.push({
          kind: "market", amount: toMarket,
          title: "전통시장·대중교통으로 40% 공제",
          detail: "같은 돈이면 공제율이 가장 높습니다. 장보기·버스·지하철을 이 카드로 결제하세요."
        });
        cur = withCardAdd(input, add);
      }
      /* 3) 체크·현금 30% — 남은 기본한도 */
      var needCheck = left > 0 ? spendToFillBase(cur.baseRoom, RULES.card.debitRate) : 0;
      var toCheck = Math.min(left, needCheck);
      if (toCheck > 0) {
        add.check += toCheck;
        left -= toCheck;
        steps.push({
          kind: "check", amount: toCheck,
          title: "체크카드·현금영수증으로 30%",
          detail: "기본한도를 채웁니다. 신용카드보다 2배 빠르게 공제가 쌓입니다."
        });
        cur = withCardAdd(input, add);
      }
      /* 4) 문화체육 30% — 남은 추가한도 (총급여 7천만 이하) */
      var needCulture = (left > 0 && !cur.limits.over70 && cur.addRoom > 0)
        ? spendToFillBase(cur.addRoom, RULES.card.cultureRate) : 0;
      var toCulture = Math.min(left, needCulture);
      if (toCulture > 0) {
        add.culture += toCulture;
        left -= toCulture;
        steps.push({
          kind: "culture", amount: toCulture,
          title: "도서·공연·영화로 추가한도",
          detail: "문화체육 사용분 30%가 추가한도에 들어갑니다."
        });
        cur = withCardAdd(input, add);
      }
      /* 5) 신용카드 15% — 남은 기본한도 */
      var needCredit = left > 0 ? spendToFillBase(cur.baseRoom, RULES.card.creditRate) : 0;
      var toCredit2 = Math.min(left, needCredit);
      if (toCredit2 > 0) {
        add.credit += toCredit2;
        left -= toCredit2;
        steps.push({
          kind: "credit", amount: toCredit2,
          title: "신용카드로 남은 기본한도",
          detail: "공제율은 15%로 가장 낮지만, 다른 카드가 없다면 쓰는 편이 낫습니다."
        });
        cur = withCardAdd(input, add);
      }
    } else {
      /* 2) 체크·현금 30% — 기본한도까지 */
      var needCheck2 = left > 0 ? spendToFillBase(cur.baseRoom, RULES.card.debitRate) : 0;
      var toCheck2 = Math.min(left, needCheck2);
      if (toCheck2 > 0) {
        add.check += toCheck2;
        left -= toCheck2;
        steps.push({
          kind: "check", amount: toCheck2,
          title: "체크카드·현금영수증으로 기본한도",
          detail: "신용카드의 2배인 30%가 쌓입니다. 문턱을 넘긴 뒤부터는 체크가 유리합니다."
        });
        cur = withCardAdd(input, add);
      }
      /* 3) 전통시장·대중교통 40% — 추가한도 */
      var needMarket2 = left > 0 ? spendToFillBase(cur.addRoom, RULES.card.marketRate) : 0;
      var toMarket2 = Math.min(left, needMarket2);
      if (toMarket2 > 0) {
        add.market += toMarket2;
        left -= toMarket2;
        steps.push({
          kind: "market", amount: toMarket2,
          title: "전통시장·대중교통으로 추가한도",
          detail: "기본한도를 채운 뒤에는 40% 공제가 추가한도까지 붙습니다."
        });
        cur = withCardAdd(input, add);
      }
    }

    var gain = Math.max(0, cur.final - base.final);
    return {
      mode: mode,
      budget: B,
      base: base,
      add: add,
      used: B - left,
      unused: left,
      result: cur,
      gain: gain,
      steps: steps,
      maxSpend: B - left,
      allCreditGain: Math.max(0, withCardAdd(input, { credit: B }).final - base.final),
      allCheckGain: Math.max(0, withCardAdd(input, { check: B }).final - base.final)
    };
  }

  /** 최저사용금액(총급여 25%)까지 남은 금액과, 한도까지 필요한 사용액 안내 */
  function cardGuidance(input) {
    var d = cardDeduction(input);
    var baseNeedCheck = spendToFillBase(d.baseRoom, RULES.card.debitRate);
    var baseNeedCredit = spendToFillBase(d.baseRoom, RULES.card.creditRate);
    var addNeedMarket = spendToFillBase(d.addRoom, RULES.card.marketRate);
    return {
      deduction: d,
      baseNeedCheck: baseNeedCheck,
      baseNeedCredit: baseNeedCredit,
      addNeedMarket: addNeedMarket,
      maxSpendCheck: d.thresholdGap + baseNeedCheck + addNeedMarket,
      maxSpendCredit: d.thresholdGap + baseNeedCredit,
      maxDeduction: d.limits.baseLimit + d.limits.addLimit
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 6. 세액공제 항목
   * ──────────────────────────────────────────────────────────── */
  function pensionCredit(salary, savings, irp) {
    var s = Math.max(0, num(savings));
    var i = Math.max(0, num(irp));
    var savingsEligible = Math.min(s, RULES.pension.savingsCap);
    var eligible = Math.min(savingsEligible + i, RULES.pension.totalCap);
    var rate = Math.max(0, num(salary)) <= RULES.pension.salaryBreak
      ? RULES.pension.rateLow : RULES.pension.rateHigh;
    return {
      savings: s, irp: i,
      savingsEligible: savingsEligible,
      eligible: eligible,
      rate: rate,
      credit: floorTo(eligible * rate, 10),
      remaining: Math.max(0, RULES.pension.totalCap - eligible),
      savingsRemaining: Math.max(0, RULES.pension.savingsCap - s),
      overLimit: Math.max(0, s - RULES.pension.savingsCap) + Math.max(0, savingsEligible + i - RULES.pension.totalCap)
    };
  }

  function rentCredit(salary, monthlyRent) {
    var s = Math.max(0, num(salary));
    var annual = Math.max(0, num(monthlyRent)) * 12;
    if (s <= 0 || s > RULES.rent.salaryLimit || annual <= 0) {
      return { annual: annual, eligible: 0, rate: 0, credit: 0, eligibleFor: s <= RULES.rent.salaryLimit, remaining: 0 };
    }
    var eligible = Math.min(annual, RULES.rent.cap);
    var rate = s <= RULES.rent.salaryBreak ? RULES.rent.rateLow : RULES.rent.rateHigh;
    return {
      annual: annual, eligible: eligible, rate: rate,
      credit: floorTo(eligible * rate, 10),
      eligibleFor: true,
      remaining: Math.max(0, RULES.rent.cap - eligible)
    };
  }

  function insuranceCredit(amount) {
    var a = Math.max(0, num(amount));
    var eligible = Math.min(a, RULES.insurance.cap);
    return { amount: a, eligible: eligible, rate: RULES.insurance.rate, credit: floorTo(eligible * RULES.insurance.rate, 10) };
  }

  function medicalCredit(salary, general, special, fertility, premature) {
    var s = Math.max(0, num(salary));
    var g = Math.max(0, num(general));
    var sp = Math.max(0, num(special));
    var f = Math.max(0, num(fertility));
    var p = Math.max(0, num(premature));
    var threshold = floorTo(s * RULES.medical.thresholdRate, 10);
    var total = g + sp + f + p;
    var excess = Math.max(0, total - threshold);
    /* 3% 문턱은 공제율이 낮은 일반 의료비부터 차감합니다. */
    var rem = Math.min(g, threshold);
    var gTax = Math.max(0, g - rem);
    var rem2 = Math.max(0, threshold - rem);
    var spTax = Math.max(0, sp - rem2);
    var rem3 = Math.max(0, rem2 - sp);
    var fTax = Math.max(0, f - rem3);
    var rem4 = Math.max(0, rem3 - f);
    var pTax = Math.max(0, p - rem4);

    var gEligible = Math.min(gTax, RULES.medical.generalCap);
    var credit = floorTo(
      gEligible * RULES.medical.rate +
      spTax * RULES.medical.rate +
      fTax * RULES.medical.fertilityRate +
      pTax * RULES.medical.prematureRate,
      10
    );
    return {
      threshold: threshold,
      total: total,
      excess: excess,
      generalTaxable: gTax,
      specialTaxable: spTax,
      fertilityTaxable: fTax,
      prematureTaxable: pTax,
      generalEligible: gEligible,
      generalCapped: gTax > RULES.medical.generalCap,
      credit: credit,
      items: {
        general: floorTo(gEligible * RULES.medical.rate, 10),
        special: floorTo(spTax * RULES.medical.rate, 10),
        fertility: floorTo(fTax * RULES.medical.fertilityRate, 10),
        premature: floorTo(pTax * RULES.medical.prematureRate, 10)
      }
    };
  }

  function educationCredit(children, self, school, college, schoolChildren, collegeChildren) {
    var n = Math.max(0, Math.floor(num(children)));
    /* 자녀 수를 따로 주지 않으면 취학전·초중고는 전체 자녀 수, 대학생은 0으로 봅니다. */
    var sc = schoolChildren == null ? n : Math.max(0, Math.floor(num(schoolChildren)));
    var cc = collegeChildren == null ? 0 : Math.max(0, Math.floor(num(collegeChildren)));
    var selfAmt = Math.max(0, num(self));
    var schoolAmt = Math.max(0, num(school));
    var collegeAmt = Math.max(0, num(college));
    var schoolEligible = Math.min(schoolAmt, RULES.education.schoolCap * sc);
    var collegeEligible = Math.min(collegeAmt, RULES.education.collegeCap * cc);
    var total = selfAmt + schoolEligible + collegeEligible;
    return {
      self: selfAmt,
      school: schoolAmt,
      college: collegeAmt,
      schoolEligible: schoolEligible,
      collegeEligible: collegeEligible,
      eligible: total,
      schoolChildren: sc,
      collegeChildren: cc,
      rate: RULES.education.rate,
      credit: floorTo(total * RULES.education.rate, 10)
    };
  }

  function hometownCredit(amount) {
    var a = clamp(Math.max(0, num(amount)), 0, RULES.hometown.cap);
    var first = Math.min(a, RULES.hometown.first);
    var second = Math.min(Math.max(0, a - RULES.hometown.first), RULES.hometown.second);
    var rest = Math.max(0, a - RULES.hometown.first - RULES.hometown.second);
    var credit = first * RULES.hometown.firstRate + second * RULES.hometown.secondRate + rest * RULES.hometown.baseRate;
    return {
      amount: a,
      first: first,
      second: second,
      rest: rest,
      credit: floorTo(credit, 10)
    };
  }

  function donationCredit(laborIncome, amount) {
    var a = Math.max(0, num(amount));
    var cap = Math.max(0, num(laborIncome)) * RULES.donation.incomeCapRate;
    var eligible = Math.min(a, cap);
    var base = Math.min(eligible, RULES.donation.highBreak);
    var high = Math.max(0, eligible - RULES.donation.highBreak);
    var credit = base * RULES.donation.baseRate + high * RULES.donation.highRate;
    return {
      amount: a, eligible: eligible, base: base, high: high,
      credit: floorTo(credit, 10), cap: cap
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 7. 연말정산 종합 계산
   * ──────────────────────────────────────────────────────────── */
  /**
   * input = {
   *   salary, dependents, children,
   *   card: { credit, check, market, transit, culture },
   *   pensionSavings, irp, monthlyRent, insurance,
   *   medicalGeneral, medicalSpecial, medicalFertility, medicalPremature,
   *   educationSelf, educationSchool, educationCollege,
   *   hometown, donation,
   *   withheld (선택: 실제 원천징수 총액)
   * }
   */
  function settle(input) {
    input = input || {};
    var salary = Math.max(0, num(input.salary));
    var dependents = Math.max(0, Math.floor(num(input.dependents)));
    var children = Math.max(0, Math.floor(num(input.children)));
    var labor = laborIncomeOf(salary);
    var basic = RULES.basicDeductionPerPerson * (1 + dependents);
    var social = employeeSocial(salary);

    var cardInput = {
      salary: salary,
      children: children,
      credit: input.card ? input.card.credit : 0,
      check: input.card ? input.card.check : 0,
      market: input.card ? input.card.market : 0,
      transit: input.card ? input.card.transit : 0,
      culture: input.card ? input.card.culture : 0
    };
    var card = cardDeduction(cardInput);

    /* 세액공제 항목 */
    var pension = pensionCredit(salary, input.pensionSavings, input.irp);
    var insurance = insuranceCredit(input.insurance);
    var medical = medicalCredit(salary, input.medicalGeneral, input.medicalSpecial, input.medicalFertility, input.medicalPremature);
    var education = educationCredit(children, input.educationSelf, input.educationSchool, input.educationCollege, input.schoolChildren, input.collegeChildren);
    var rent = rentCredit(salary, input.monthlyRent);
    var hometown = hometownCredit(input.hometown);
    var donation = donationCredit(labor.income, input.donation);
    var child = childTaxCredit(children);

    function scenario(useSpecial) {
      var specialDeduction = useSpecial ? social.special : 0;
      var deductions = basic + social.nps + specialDeduction + card.final;
      var taxBase = Math.max(0, floorTo(labor.income - deductions, 1000));
      var bracket = applyBrackets(taxBase);
      var laborCredit = laborTaxCredit(bracket.tax, salary);

      var items = [];
      function add(key, label, eligible, rate, creditAmt, note) {
        if (eligible > 0 && creditAmt > 0) {
          items.push({ key: key, label: label, eligible: eligible, rate: rate, credit: creditAmt, note: note || "" });
        }
      }
      add("pension", "연금저축·IRP", pension.eligible, pension.rate, pension.credit,
        "연금저축 600만원 · IRP 합산 900만원 한도");
      if (useSpecial) {
        add("insurance", "보장성보험료", insurance.eligible, insurance.rate, insurance.credit, "연 100만원 한도");
        add("medical", "의료비", medical.total, null, medical.credit, "총급여 3% 초과분");
        add("education", "교육비", education.eligible, education.rate, education.credit, "자녀 1인당 300만/900만원 한도");
        add("rent", "월세액", rent.eligible, rent.rate, rent.credit, "연 1,000만원 한도");
        add("donation", "기부금", donation.eligible, RULES.donation.baseRate, donation.credit, "1,000만원 초과분 30%");
      } else {
        add("standard", "표준세액공제", RULES.standardTaxCredit, 1, RULES.standardTaxCredit, "특별세액공제를 받지 않을 때");
      }
      add("hometown", "고향사랑기부금", hometown.amount, null, hometown.credit, "10만원까지 전액, 20만원까지 40%");
      add("child", "자녀세액공제", children, null, child, "1명 15만 · 2명 30만 · 3명 이상 30만원씩 추가");

      var creditItemsTotal = floorTo(items.reduce(function (a, b) { return a + b.credit; }, 0), 10);
      var totalCredit = laborCredit + creditItemsTotal;
      var appliedCredit = Math.min(totalCredit, bracket.tax);
      var determined = Math.max(0, bracket.tax - appliedCredit);
      var local = floorTo(determined * RULES.localTaxRate, 10);

      return {
        useSpecial: useSpecial,
        deductions: {
          basic: basic,
          pension: social.nps,
          special: specialDeduction,
          card: card.final,
          total: deductions
        },
        taxBase: taxBase,
        bracket: bracket,
        calculatedTax: bracket.tax,
        laborCredit: laborCredit,
        standardCredit: useSpecial ? 0 : RULES.standardTaxCredit,
        items: items,
        itemCreditTotal: creditItemsTotal,
        totalCredit: totalCredit,
        appliedCredit: appliedCredit,
        unusedCredit: Math.max(0, totalCredit - appliedCredit),
        determined: determined,
        local: local,
        total: determined + local
      };
    }

    var withSpecial = scenario(true);
    var withStandard = scenario(false);
    var chosen = withStandard.total < withSpecial.total ? withStandard : withSpecial;
    var alternative = chosen === withSpecial ? withStandard : withSpecial;
    chosen.mode = chosen.useSpecial ? "special" : "standard";
    chosen.modeLabel = chosen.useSpecial
      ? "건강보험료 등 특별소득공제 + 특별세액공제"
      : "표준세액공제 13만원";
    chosen.alternativeTotal = alternative.total;

    /* 기납부세액: 회사가 매달 뗀 세금의 간이 추정
     * 근로소득공제·기본공제·4대보험·근로소득세액공제만 반영한 세금을 기준으로 봅니다. */
    var baseDeductions = basic + social.nps + social.special;
    var baseTaxBase = Math.max(0, floorTo(labor.income - baseDeductions, 1000));
    var baseBracket = applyBrackets(baseTaxBase);
    var baseLaborCredit = laborTaxCredit(baseBracket.tax, salary);
    var baseDetermined = Math.max(0, baseBracket.tax - baseLaborCredit);
    var baseLocal = floorTo(baseDetermined * RULES.localTaxRate, 10);
    var estimatedWithheld = baseDetermined + baseLocal;

    var withheldInput = input.withheld != null && input.withheld !== "" ? num(input.withheld) : null;
    var withheld = withheldInput != null ? Math.max(0, withheldInput) : estimatedWithheld;
    var balance = withheld - chosen.total;

    return {
      year: RULES.year,
      salary: salary,
      dependents: dependents,
      children: children,
      labor: labor,
      basic: basic,
      social: social,
      card: card,
      credits: {
        pension: pension,
        insurance: insurance,
        medical: medical,
        education: education,
        rent: rent,
        hometown: hometown,
        donation: donation,
        child: child
      },
      chosen: chosen,
      special: withSpecial,
      standard: withStandard,
      withheld: {
        value: withheld,
        estimated: withheldInput == null,
        estimate: estimatedWithheld,
        baseTaxBase: baseTaxBase,
        baseBracket: baseBracket,
        baseDetermined: baseDetermined,
        baseLocal: baseLocal
      },
      balance: {
        value: balance,
        isRefund: balance > 0,
        isDue: balance < 0,
        abs: Math.abs(balance)
      },
      marginalRate: applyBrackets(Math.max(0, floorTo(labor.income - basic - social.nps - social.special, 1000))).rate,
      effectiveRate: salary > 0 ? chosen.total / salary : 0
    };
  }

  /* 카드 탭에서 쓸 한계세율 (카드 공제 전 과세표준 기준) */
  function marginalRate(salary, dependents) {
    var s = Math.max(0, num(salary));
    var dep = Math.max(0, Math.floor(num(dependents)));
    var labor = laborIncomeOf(s);
    var basic = RULES.basicDeductionPerPerson * (1 + dep);
    var social = employeeSocial(s);
    var taxBase = Math.max(0, floorTo(labor.income - basic - social.nps - social.special, 1000));
    return applyBrackets(taxBase).rate;
  }

  /* ────────────────────────────────────────────────────────────
   * 8. 표시용 포맷터
   * ──────────────────────────────────────────────────────────── */
  function comma(n) {
    var v = Math.round(num(n));
    var neg = v < 0;
    var s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + s;
  }
  function shortWon(n) {
    var v = Math.round(num(n));
    var sign = v < 0 ? "-" : "";
    v = Math.abs(v);
    if (v < 10000) return sign + comma(v) + "원";
    var man = Math.floor(v / 10000);
    var rest = v % 10000;
    if (man >= 10000) {
      var eok = Math.floor(man / 10000);
      var manRest = man % 10000;
      return sign + eok + "억" + (manRest ? " " + comma(manRest) + "만" : "") + (rest ? " " + comma(rest) + "원" : "원");
    }
    return sign + comma(man) + "만" + (rest ? " " + comma(rest) + "원" : "원");
  }
  function percent(x, digits) {
    var d = digits == null ? 1 : digits;
    var v = num(x) * 100;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) + "%";
  }

  return {
    RULES: RULES,
    earnedDeductionAmount: earnedDeductionAmount,
    laborIncomeOf: laborIncomeOf,
    employeeSocial: employeeSocial,
    applyBrackets: applyBrackets,
    laborTaxCredit: laborTaxCredit,
    childTaxCredit: childTaxCredit,
    cardLimits: cardLimits,
    cardDeduction: cardDeduction,
    cardPlan: cardPlan,
    cardGuidance: cardGuidance,
    withCardAdd: withCardAdd,
    pensionCredit: pensionCredit,
    rentCredit: rentCredit,
    insuranceCredit: insuranceCredit,
    medicalCredit: medicalCredit,
    educationCredit: educationCredit,
    hometownCredit: hometownCredit,
    donationCredit: donationCredit,
    settle: settle,
    marginalRate: marginalRate,
    comma: comma,
    shortWon: shortWon,
    percent: percent,
    _util: { floorTo: floorTo, clamp: clamp, num: num }
  };
});
