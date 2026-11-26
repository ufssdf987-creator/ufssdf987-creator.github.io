/*!
 * SNCalc — 2026년 연봉·월급 실수령액 계산 엔진
 * ---------------------------------------------------------------
 * 연봉(총급여)에서 4대보험료·소득세·지방소득세를 빼 월 실수령액을 계산하고,
 * 원하는 실수령액에서 연봉을 역산합니다. DOM에 의존하지 않아 브라우저(app.js)와
 * 테스트(QuickJS)에서 같은 코드를 씁니다.
 *
 * 기준 확인일: 2026-11-26
 *  - 소득세법 제47조(근로소득공제, 한도 2,000만원) · 제50조(기본공제 1인당 150만원)
 *    · 제52조(국민연금·건강보험·고용보험료 공제) · 제55조(기본세율 8구간)
 *    · 제59조(근로소득세액공제) · 제59조의2(자녀세액공제)
 *  - 2026년 4대보험료율: 국민연금 9.5%(근로자 4.75%), 건강보험 7.19%(3.595%),
 *    장기요양 0.9448%(0.4724%), 고용보험 1.8%(0.9%)
 *    국민연금 기준소득월액 상한 659만원 / 하한 41만원
 *  - 비과세: 식대 월 20만원, 자가운전보조금 월 20만원, 육아수당 월 10만원(소득세법 시행령 제12조)
 *
 * 회사가 매달 떼는 소득세는 국세청 근로소득 간이세액표를 쓰므로, 이 계산의
 * 월 소득세(연간 결정세액 ÷ 12)와 몇만 원 차이가 날 수 있습니다.
 * 모든 결과는 참고용 모의 계산입니다.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.SNCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RULES = {
    year: 2026,
    verifiedAt: "2026-11-26",

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
    localTaxRate: 0.10,

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
    laborCredit: { threshold: 1300000, rateLow: 0.55, baseHigh: 715000, rateHigh: 0.30 },
    childTaxCredit: { first: 150000, second: 300000, extra: 300000 },

    social: {
      npsRate: 0.0475,
      npsMonthlyCap: 6590000,
      npsMonthlyFloor: 410000,
      healthRate: 0.03595,
      ltcRate: 0.004724,
      employmentRate: 0.009
    },

    /* 소득세법 시행령 제12조 — 월 비과세 한도 */
    nonTaxable: { meal: 200000, car: 200000, childcare: 100000 }
  };

  /* ── 유틸 ───────────────────────────────────────────────── */
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

  /* ── 근로소득공제 ───────────────────────────────────────── */
  function earnedDeductionAmount(gross) {
    var g = Math.max(0, num(gross));
    if (g <= 0) return 0;
    var d = 0;
    for (var i = 0; i < RULES.earnedDeduction.tiers.length; i++) {
      var t = RULES.earnedDeduction.tiers[i];
      if (g <= t.upTo) { d = t.base + (g - t.from) * t.rate; break; }
    }
    return Math.min(d, RULES.earnedDeduction.cap, g);
  }

  /* ── 4대보험 (근로자 부담, 월) ───────────────────────────── */
  function employeeSocial(monthlyTaxable) {
    var m = Math.max(0, num(monthlyTaxable));
    if (m <= 0) {
      return { nps: 0, health: 0, ltc: 0, employment: 0, total: 0, npsBase: 0 };
    }
    var npsBase = clamp(m, RULES.social.npsMonthlyFloor, RULES.social.npsMonthlyCap);
    var nps = floorTo(npsBase * RULES.social.npsRate, 10);
    var health = floorTo(m * RULES.social.healthRate, 10);
    var ltc = floorTo(m * RULES.social.ltcRate, 1);
    var employment = floorTo(m * RULES.social.employmentRate, 10);
    return {
      nps: nps,
      health: health,
      ltc: ltc,
      employment: employment,
      total: nps + health + ltc + employment,
      npsBase: npsBase
    };
  }

  /* ── 세율 ───────────────────────────────────────────────── */
  function applyBrackets(taxBase) {
    var b = Math.max(0, floorTo(num(taxBase), 1000));
    var list = RULES.taxBrackets;
    var row = list[list.length - 1];
    for (var i = 0; i < list.length; i++) {
      if (b <= list[i].upTo) { row = list[i]; break; }
    }
    var tax = Math.max(0, floorTo(b * row.rate - row.progressive, 10));
    return { taxBase: b, rate: row.rate, ratePercent: row.rate * 100, label: row.label, tax: tax };
  }

  function laborTaxCredit(taxOnLabor, gross) {
    var t = Math.max(0, taxOnLabor);
    if (t <= 0) return 0;
    var calculated = t <= RULES.laborCredit.threshold
      ? t * RULES.laborCredit.rateLow
      : RULES.laborCredit.baseHigh + (t - RULES.laborCredit.threshold) * RULES.laborCredit.rateHigh;
    var g = Math.max(0, num(gross));
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

  /* ── 비과세 ─────────────────────────────────────────────── */
  function nonTaxableMonthly(input) {
    input = input || {};
    var meal = clamp(num(input.meal), 0, RULES.nonTaxable.meal);
    var car = clamp(num(input.car), 0, RULES.nonTaxable.car);
    var childcare = clamp(num(input.childcare), 0, RULES.nonTaxable.childcare);
    return { meal: meal, car: car, childcare: childcare, total: meal + car + childcare };
  }

  /* ── 본 계산 ────────────────────────────────────────────── */
  /**
   * input = {
   *   annualSalary: 연봉(세전, 원) — 월급여×12 기준
   *   dependents: 부양가족 수(본인 제외, 배우자·자녀 포함)
   *   children: 20세 이하 자녀 수(자녀세액공제)
   *   meal: 월 식대 비과세(최대 20만원) / car: 월 자가운전보조금(최대 20만원)
   *   childcare: 월 육아수당 비과세(최대 10만원)
   * }
   */
  function calc(input) {
    input = input || {};
    var annualSalary = Math.max(0, num(input.annualSalary));
    var dependents = clamp(Math.floor(num(input.dependents)), 0, 20);
    var children = clamp(Math.floor(num(input.children)), 0, 20);

    var nonTax = nonTaxableMonthly(input);
    var nonTaxAnnual = nonTax.total * 12;
    var taxableAnnual = Math.max(0, annualSalary - nonTaxAnnual);
    var monthlyTaxable = taxableAnnual / 12;

    var socialM = employeeSocial(monthlyTaxable);
    var social = {
      monthly: socialM,
      annual: {
        nps: socialM.nps * 12,
        health: socialM.health * 12,
        ltc: socialM.ltc * 12,
        employment: socialM.employment * 12,
        total: socialM.total * 12
      }
    };

    var earnedDed = earnedDeductionAmount(taxableAnnual);
    var laborIncome = Math.max(0, taxableAnnual - earnedDed);
    var basicDed = (1 + dependents) * RULES.basicDeductionPerPerson;
    var insuranceDed = social.annual.total;
    var totalDed = earnedDed + basicDed + insuranceDed;
    var taxBaseRaw = Math.max(0, laborIncome - basicDed - insuranceDed);
    var brackets = applyBrackets(taxBaseRaw);
    var laborCredit = laborTaxCredit(brackets.tax, taxableAnnual);
    var childCredit = childTaxCredit(children);
    var creditTotal = laborCredit + childCredit;
    var determinedTax = Math.max(0, brackets.tax - creditTotal);
    var localTax = floorTo(determinedTax * RULES.localTaxRate, 10);
    var taxAnnual = determinedTax + localTax;

    var monthlyTax = floorTo(taxAnnual / 12, 10);
    var monthlySocial = socialM.total;
    var monthlyGross = annualSalary > 0 ? annualSalary / 12 : 0;
    var monthlyNet = Math.max(0, monthlyGross - monthlySocial - monthlyTax);
    var annualNet = annualSalary - social.annual.total - taxAnnual;

    return {
      year: RULES.year,
      input: {
        annualSalary: annualSalary,
        dependents: dependents,
        children: children,
        nonTaxable: nonTax
      },
      monthlyGross: monthlyGross,
      monthlyTaxable: monthlyTaxable,
      nonTaxableAnnual: nonTaxAnnual,
      taxableAnnual: taxableAnnual,
      social: social,
      deduction: {
        earned: earnedDed,
        basic: basicDed,
        insurance: insuranceDed,
        total: totalDed
      },
      income: {
        laborIncome: laborIncome,
        taxBase: brackets.taxBase,
        ratePercent: brackets.ratePercent,
        bracketLabel: brackets.label,
        calculatedTax: brackets.tax,
        laborCredit: laborCredit,
        childCredit: childCredit,
        creditTotal: creditTotal,
        determinedTax: determinedTax,
        localTax: localTax,
        taxAnnual: taxAnnual,
        taxMonthly: monthlyTax
      },
      net: {
        monthly: monthlyNet,
        annual: annualNet,
        monthlyDeduction: monthlySocial + monthlyTax,
        deductionRate: annualSalary > 0 ? (social.annual.total + taxAnnual) / annualSalary : 0,
        effectiveTaxRate: annualSalary > 0 ? taxAnnual / annualSalary : 0,
        socialRate: annualSalary > 0 ? social.annual.total / annualSalary : 0
      }
    };
  }

  /* ── 역산: 원하는 월 실수령액 → 연봉 ─────────────────────── */
  function salaryForMonthlyNet(targetMonthlyNet, opts) {
    opts = opts || {};
    var target = Math.max(0, num(targetMonthlyNet));
    if (target <= 0) return { annualSalary: 0, result: calc(opts) };
    var lo = 0;
    var hi = 300000000; // 3억원
    var best = null;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      var r = calc({
        annualSalary: mid,
        dependents: opts.dependents,
        children: opts.children,
        meal: opts.meal,
        car: opts.car,
        childcare: opts.childcare
      });
      if (r.net.monthly >= target) { hi = mid; best = r; } else { lo = mid; }
    }
    var annual = Math.ceil(hi / 10000) * 10000; // 1만원 단위 올림
    var result = calc({
      annualSalary: annual,
      dependents: opts.dependents,
      children: opts.children,
      meal: opts.meal,
      car: opts.car,
      childcare: opts.childcare
    });
    return { annualSalary: annual, result: result };
  }

  /* ── 연봉 인상 시뮬레이션 ───────────────────────────────── */
  function raiseTable(input, steps) {
    input = input || {};
    steps = steps || [1000000, 3000000, 5000000, 10000000];
    var base = calc(input);
    return steps.map(function (step) {
      var r = calc({
        annualSalary: base.input.annualSalary + step,
        dependents: input.dependents,
        children: input.children,
        meal: input.meal,
        car: input.car,
        childcare: input.childcare
      });
      return {
        step: step,
        annualSalary: base.input.annualSalary + step,
        netMonthly: r.net.monthly,
        raiseMonthly: r.net.monthly - base.net.monthly
      };
    });
  }

  return {
    RULES: RULES,
    calc: calc,
    salaryForMonthlyNet: salaryForMonthlyNet,
    raiseTable: raiseTable,
    earnedDeductionAmount: earnedDeductionAmount,
    employeeSocial: employeeSocial,
    laborTaxCredit: laborTaxCredit,
    childTaxCredit: childTaxCredit,
    applyBrackets: applyBrackets,
    nonTaxableMonthly: nonTaxableMonthly
  };
});
