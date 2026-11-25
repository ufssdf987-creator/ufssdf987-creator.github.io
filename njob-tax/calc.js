/*!
 * NJCalc — N잡러 세금·건강보험료 계산 엔진 (2026년 귀속 기준)
 * ---------------------------------------------------------------
 * DOM에 의존하지 않는 순수 계산 모듈입니다. 브라우저(app.js)와
 * 테스트(tests/test_calc.py, QuickJS)에서 같은 코드를 그대로 씁니다.
 *
 * 기준 확인일: 2026-11-25
 *  - 소득세법 제55조 기본세율 8구간 / 제47조 근로소득공제(한도 2,000만원)
 *  - 소득세법 제59조 근로소득세액공제, 제59조의4 제9항 표준세액공제(13만원)
 *  - 소득세법 제129조 원천징수세율(사업소득 3%, 기타소득 20%)
 *  - 2026년 건강보험료율 7.19%, 장기요양보험료율 0.9448%(건강보험료의 13.14%)
 *  - 2026년 국민연금 보험료율 9.5%(근로자 4.75%), 기준소득월액 상한 659만원
 *  - 국민건강보험법 시행령 제41조(보수 외 소득 2,000만원), 시행규칙 별표 1의2
 *  - 국세청 고시 제2026-14호(2025년 귀속 경비율)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.NJCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var WON = 1;

  /* ────────────────────────────────────────────────────────────
   * 1. 2026년 기준값 (RULES)
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
    localTaxRate: 0.1, // 개인지방소득세 = 소득세의 10%

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

    /* 소득공제·세액공제 */
    basicDeductionPerPerson: 1500000,
    standardTaxCredit: 130000,        // 근로소득자 표준세액공제
    standardTaxCreditNoLabor: 70000,  // 종합소득자(근로소득 없음) 표준세액공제
    childTaxCredit: { first: 150000, second: 300000, extra: 300000 },
    laborCredit: { threshold: 1300000, rateLow: 0.55, baseHigh: 715000, rateHigh: 0.30 },

    /* 4대보험 (근로자 부담분) */
    social: {
      npsRate: 0.0475,          // 국민연금 9.5%의 근로자 50%
      npsMonthlyCap: 6590000,   // 2026.7~2027.6 기준소득월액 상한
      npsMonthlyFloor: 410000,
      healthRate: 0.03595,      // 건강보험 7.19%의 근로자 50%
      ltcRate: 0.004724         // 장기요양 0.9448%의 근로자 50%
    },

    /* 건강보험 */
    health: {
      totalRate: 0.0719,
      ltcTotalRate: 0.009448,
      ltcOfHealth: 0.1314,      // 장기요양 = 건강보험료 × 13.14%
      externalIncomeThreshold: 20000000,   // 직장가입자 보수 외 소득 기준
      externalMonthlyCap: 4591740,         // 보수 외 소득월액보험료 월 상한
      dependentIncomeLimit: 20000000,      // 피부양자 합산소득 기준
      dependentBusinessLimit: 5000000,     // (사업자등록 없음) 사업소득 기준
      dependentPropertyLimit: 540000000,   // 재산세 과세표준
      dependentPropertyLimitHigh: 900000000,
      dependentPropertyIncomeLimit: 10000000,
      propertyPointValue: 211.5            // 재산보험료부과점수당 금액
    },

    /* 원천징수 */
    withholding: {
      business: 0.033,       // 사업소득 3% + 지방소득세 0.3%
      businessNational: 0.03,
      businessLocal: 0.003,
      other: 0.088,          // 기타소득 필요경비 60% 반영 시 실효 8.8%
      otherNational: 0.08,
      otherLocal: 0.008
    },
    otherIncome: {
      expenseRate: 0.60,     // 인적용역 기타소득 필요경비율
      minimumTaxable: 50000  // 과세최저한(건별)
    },
    simpleExpense: {
      revenueThreshold: 40000000, // 단순경비율 기본율 적용 한도(초과분은 초과율)
      bookkeepingRevenue: 75000000
    }
  };

  /* 업종 프리셋 — 국세청 고시 제2026-14호(2025년 귀속) 단순경비율 */
  var INDUSTRIES = [
    { id: "it", code: "940926", name: "IT·개발 프리랜서", basic: 0.644, excess: 0.502, hint: "소프트웨어프리랜서" },
    { id: "content", code: "940306", name: "블로그·유튜브·콘텐츠", basic: 0.641, excess: 0.497, hint: "1인미디어콘텐츠창작자" },
    { id: "writing", code: "940100", name: "글·원고·번역·작가", basic: 0.587, excess: 0.422, hint: "작가" },
    { id: "lecture", code: "940903", name: "학원·강의·과외", basic: 0.617, excess: 0.464, hint: "학원강사, 강사, 과외교습자" },
    { id: "delivery", code: "940918", name: "배달·퀵서비스", basic: 0.794, excess: 0.712, hint: "퀵서비스배달원" },
    { id: "driving", code: "940913", name: "대리운전", basic: 0.737, excess: 0.632, hint: "대리운전기사" },
    { id: "etc", code: "940909", name: "그 밖의 인적용역(기타)", basic: 0.641, excess: 0.497, hint: "기타자영업·컴퓨터프로그래머" }
  ];

  /* ────────────────────────────────────────────────────────────
   * 2. 유틸
   * ──────────────────────────────────────────────────────────── */
  function floorTo(n, unit) {
    if (!isFinite(n)) return 0;
    // 부동소수점 오차(예: 313024.99999999994)로 10원이 깎이는 것을 막습니다.
    var eps = 1e-6;
    return Math.floor((n + eps) / unit) * unit;
  }
  function clamp(n, lo, hi) {
    return Math.min(Math.max(n, lo), hi);
  }
  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v == null ? 0 : v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : 0;
  }
  function roundWon(n) {
    return floorTo(Math.abs(n), 10) * (n < 0 ? -1 : 1);
  }
  function presetOf(id) {
    for (var i = 0; i < INDUSTRIES.length; i++) {
      if (INDUSTRIES[i].id === id) return INDUSTRIES[i];
    }
    return INDUSTRIES[INDUSTRIES.length - 1];
  }

  /* ────────────────────────────────────────────────────────────
   * 3. 소득 계산
   * ──────────────────────────────────────────────────────────── */

  /** 근로소득공제액 (총급여 기준) */
  function earnedDeductionAmount(grossSalary) {
    var g = Math.max(0, num(grossSalary));
    if (g <= 0) return 0;
    var d = 0;
    for (var i = 0; i < RULES.earnedDeduction.tiers.length; i++) {
      var t = RULES.earnedDeduction.tiers[i];
      if (g <= t.upTo) {
        d = t.base + (g - t.from) * t.rate;
        break;
      }
    }
    return Math.min(d, RULES.earnedDeduction.cap, g);
  }

  function laborIncomeOf(grossSalary) {
    var g = Math.max(0, num(grossSalary));
    var ded = earnedDeductionAmount(g);
    return { gross: g, deduction: ded, income: g - ded };
  }

  /**
   * 단순경비율 사업소득.
   * 수입금액 4,000만원 이하분은 기본율, 초과분은 초과율을 적용합니다.
   */
  function businessIncome(input) {
    input = input || {};
    var revenue = Math.max(0, num(input.revenue));
    var mode = input.expenseMode || "simple";
    var preset = presetOf(input.industryId);
    var basic = input.basicRate != null ? num(input.basicRate) : preset.basic;
    var excess = input.excessRate != null ? num(input.excessRate) : preset.excess;
    if (mode === "rate" || mode === "custom") {
      // 직접 입력한 단일 경비율
      var r = clamp(num(input.customRate != null ? input.customRate : basic), 0, 0.98);
      basic = r;
      excess = r;
    }
    var threshold = RULES.simpleExpense.revenueThreshold;
    var base = Math.min(revenue, threshold);
    var over = Math.max(0, revenue - threshold);
    var expense = base * basic + over * excess;
    if (mode === "none") {
      expense = 0;
    }
    expense = Math.min(expense, revenue);
    return {
      revenue: revenue,
      expense: expense,
      income: revenue - expense,
      expenseRate: revenue > 0 ? expense / revenue : 0,
      needsBookkeeping: revenue >= RULES.simpleExpense.bookkeepingRevenue
    };
  }

  /** 기타소득(인적용역): 필요경비 60%, 과세최저한 5만원 */
  function otherIncome(input) {
    input = input || {};
    var revenue = Math.max(0, num(input.revenue));
    var rate = clamp(num(input.expenseRate != null ? input.expenseRate : RULES.otherIncome.expenseRate), 0, 0.98);
    var expense = revenue * rate;
    var gross = revenue - expense;
    var income = Math.max(0, gross - RULES.otherIncome.minimumTaxable);
    return {
      revenue: revenue,
      expense: expense,
      income: income,
      expenseRate: rate
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 4. 세금 계산
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

  /**
   * 4대보험 근로자 부담 (연간, 소득공제용)
   * 월 보험료를 10원 미만 버림한 뒤 12개월로 환산합니다.
   */
  function employeeSocialInsurance(grossSalary) {
    var g = Math.max(0, num(grossSalary));
    if (g <= 0) return { nps: 0, health: 0, ltc: 0, total: 0, monthlyBase: 0, monthly: {} };
    var monthlyPay = g / 12;
    var npsBase = Math.min(monthlyPay, RULES.social.npsMonthlyCap);
    var npsM = floorTo(npsBase * RULES.social.npsRate, 10);
    var healthM = floorTo(monthlyPay * RULES.social.healthRate, 10);
    var ltcM = floorTo(monthlyPay * RULES.social.ltcRate, 1);
    var nps = npsM * 12;
    var health = healthM * 12;
    var ltc = ltcM * 12;
    return {
      nps: nps, health: health, ltc: ltc, total: nps + health + ltc,
      monthlyBase: npsBase,
      monthly: { nps: npsM, health: healthM, ltc: ltcM }
    };
  }

  /** 근로소득세액공제 (산출세액·총급여 기준) */
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
    if (n === 1) return RULES.childTaxCredit.first;         // 15만원
    if (n === 2) return RULES.childTaxCredit.second;        // 30만원
    return RULES.childTaxCredit.second + (n - 2) * RULES.childTaxCredit.extra;
  }

  /**
   * 종합소득세 계산.
   * 표준세액공제는 특별소득공제(건강보험료·장기요양)와 함께 받을 수 없어
   * (소득세법 제59조의4 ⑨, 국세청 안내) 유리한 쪽을 자동으로 고릅니다.
   *  - 근로소득 있음: ①건강보험료 특별소득공제 ②표준세액공제 13만원 중 세금이 적은 쪽
   *  - 근로소득 없음: 표준세액공제 7만원(종합소득자)
   *
   * opts = { laborIncome, businessIncome, otherIncome, dependents, children,
   *          grossSalary, extraCredits, creditMode }
   */
  function taxOn(opts) {
    opts = opts || {};
    var labor = Math.max(0, num(opts.laborIncome));
    var biz = Math.max(0, num(opts.businessIncome));
    var etc = Math.max(0, num(opts.otherIncome));
    var grossSalary = Math.max(0, num(opts.grossSalary));
    var dependents = Math.max(0, Math.floor(num(opts.dependents)));
    var children = Math.max(0, Math.floor(num(opts.children)));
    var extraCredits = Math.max(0, num(opts.extraCredits));
    var hasLabor = labor > 0;
    var totalIncome = labor + biz + etc;

    var basic = totalIncome > 0 ? RULES.basicDeductionPerPerson * (1 + dependents) : 0;
    var si = employeeSocialInsurance(grossSalary);
    var pension = hasLabor ? si.nps : 0;
    var childCredit = childTaxCredit(children);

    function build(mode) {
      var special = mode === "special" && hasLabor ? si.health + si.ltc : 0;
      var deductionTotal = basic + pension + special;
      var bracket = applyBrackets(Math.max(0, totalIncome - deductionTotal));
      var laborShare = totalIncome > 0 ? labor / totalIncome : 0;
      var taxOnLabor = bracket.tax * laborShare;
      var creditLabor = hasLabor ? laborTaxCredit(taxOnLabor, grossSalary) : 0;
      var creditStandard = 0;
      if (mode === "standard" && hasLabor) creditStandard = RULES.standardTaxCredit;
      if (mode === "none" && !hasLabor) creditStandard = RULES.standardTaxCreditNoLabor;
      var creditTotal = creditLabor + creditStandard + childCredit + extraCredits;
      var determined = Math.max(0, floorTo(bracket.tax - creditTotal, 10));
      return {
        mode: mode,
        laborIncome: labor,
        businessIncome: biz,
        otherIncome: etc,
        totalIncome: totalIncome,
        basicDeduction: basic,
        pensionDeduction: pension,
        healthDeduction: special,
        deductionTotal: deductionTotal,
        taxBase: bracket.taxBase,
        bracket: bracket,
        calculatedTax: bracket.tax,
        credits: {
          labor: creditLabor,
          standard: creditStandard,
          child: childCredit,
          extra: extraCredits,
          total: creditTotal
        },
        determinedTax: determined,
        localTax: floorTo(determined * RULES.localTaxRate, 10),
        totalTax: determined + floorTo(determined * RULES.localTaxRate, 10)
      };
    }

    var specialOnly = build("special");
    var standardOnly = build(hasLabor ? "standard" : "none");
    var chosen = standardOnly.determinedTax < specialOnly.determinedTax ? standardOnly : specialOnly;
    chosen.creditMode = chosen.mode;
    chosen.creditLabel = chosen.mode === "special"
      ? "건강보험료 특별소득공제"
      : (hasLabor ? "표준세액공제 13만원" : "표준세액공제 7만원");
    chosen.creditNote = chosen.mode === "special"
      ? "표준세액공제 대신 건강보험료·장기요양보험료 소득공제를 적용했습니다."
      : (hasLabor
        ? "건강보험료 소득공제보다 표준세액공제가 유리해 표준세액공제를 적용했습니다."
        : "근로소득이 없어 종합소득자 표준세액공제 7만원을 적용했습니다.");
    chosen.alternativeTax = specialOnly === chosen ? standardOnly.determinedTax : specialOnly.determinedTax;
    return chosen;
  }

  /* ────────────────────────────────────────────────────────────
   * 5. 탭1 — 부업 세금 비교 (핵심 API)
   * ──────────────────────────────────────────────────────────── */
  /**
   * input = {
   *   hasSalary: true, salary: 50_000_000,
   *   sideType: "business" | "other", sideRevenue: 15_000_000,
   *   industryId: "content", expenseMode: "simple"|"rate"|"none", customRate: 0.641,
   *   otherExpenseRate: 0.6,
   *   dependents: 0, children: 0, useStandardCredit: true
   * }
   */
  function compareSideIncome(input) {
    input = input || {};
    var hasSalary = input.hasSalary !== false;
    var salary = hasSalary ? Math.max(0, num(input.salary)) : 0;
    var sideType = input.sideType === "other" ? "other" : "business";
    var revenue = Math.max(0, num(input.sideRevenue));

    var raw;
    if (sideType === "business") {
      var preset = presetOf(input.industryId);
      raw = businessIncome({
        revenue: revenue,
        expenseMode: input.expenseMode || "simple",
        basicRate: input.basicRate != null ? input.basicRate : preset.basic,
        excessRate: input.excessRate != null ? input.excessRate : preset.excess,
        customRate: input.customRate
      });
    } else {
      raw = otherIncome({ revenue: revenue, expenseRate: input.otherExpenseRate });
    }

    var labor = laborIncomeOf(salary);
    var common = {
      dependents: input.dependents,
      children: input.children,
      useStandardCredit: input.useStandardCredit
    };

    /* ① 본업만 있을 때 (회사 연말정산으로 이미 정산된 세금) */
    var salaryOnly = taxOn(Object.assign({}, common, {
      laborIncome: labor.income,
      businessIncome: 0,
      otherIncome: 0,
      grossSalary: salary
    }));

    /* ② 부업까지 합산했을 때 */
    var combined = taxOn(Object.assign({}, common, {
      laborIncome: labor.income,
      businessIncome: sideType === "business" ? raw.income : 0,
      otherIncome: sideType === "other" ? raw.income : 0,
      grossSalary: salary
    }));

    /* ③ 원천징수된 세금 */
    var wRate = sideType === "business" ? RULES.withholding.business : RULES.withholding.other;
    var wNational = sideType === "business" ? RULES.withholding.businessNational : RULES.withholding.otherNational;
    var wLocal = sideType === "business" ? RULES.withholding.businessLocal : RULES.withholding.otherLocal;
    var withheldNational = floorTo(revenue * wNational, 10);
    var withheldLocal = floorTo(revenue * wLocal, 10);

    /* ④ 부업 때문에 늘어난 세금과의 차액 */
    var incNational = combined.determinedTax - salaryOnly.determinedTax;
    var incLocal = combined.localTax - salaryOnly.localTax;
    var incTotal = incNational + incLocal;

    var balanceNational = incNational - withheldNational;
    var balanceLocal = incLocal - withheldLocal;
    var balanceTotal = balanceNational + balanceLocal;

    var sideIncomeAmount = raw.income;
    var netSide = revenue - incTotal; // 부업 세금까지 반영한 실수령(경비 제외 전, 원천징수 포함 기준)

    return {
      rulesYear: RULES.year,
      hasSalary: hasSalary,
      sideType: sideType,
      revenue: revenue,
      side: {
        revenue: revenue,
        expense: raw.expense,
        income: raw.income,
        expenseRate: raw.expenseRate,
        needsBookkeeping: !!raw.needsBookkeeping,
        withheld: withheldNational + withheldLocal,
        withheldNational: withheldNational,
        withheldLocal: withheldLocal,
        withholdingRate: wRate
      },
      labor: labor,
      salaryOnly: salaryOnly,
      combined: combined,
      delta: {
        national: incNational,
        local: incLocal,
        total: incTotal
      },
      balance: {
        national: balanceNational,
        local: balanceLocal,
        total: balanceTotal,
        isRefund: balanceTotal < 0,
        isZero: Math.abs(balanceTotal) < 10
      },
      rates: {
        marginal: combined.bracket.rate,
        effectiveOnRevenue: revenue > 0 ? incTotal / revenue : 0,
        effectiveOnIncome: sideIncomeAmount > 0 ? incTotal / sideIncomeAmount : 0,
        withholding: revenue > 0 ? (withheldNational + withheldLocal) / revenue : 0
      },
      net: {
        sideAfterTax: netSide,
        monthly: netSide / 12
      }
    };
  }

  /** 같은 입력을 3.3%(사업소득)와 8.8%(기타소득)로 각각 계산해 비교 */
  function compareWithholdingTypes(input) {
    var asBiz = compareSideIncome(Object.assign({}, input, { sideType: "business" }));
    var asEtc = compareSideIncome(Object.assign({}, input, { sideType: "other" }));
    return {
      business: asBiz,
      other: asEtc,
      betterType: asBiz.balance.total <= asEtc.balance.total ? "business" : "other",
      saving: Math.abs(asBiz.balance.total - asEtc.balance.total)
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 6. 탭2 — 건강보험료
   * ──────────────────────────────────────────────────────────── */
  /**
   * input = {
   *   mode: "employee" | "dependent",
   *   sideIncome: 0,          // 부업 소득금액(필요경비 차감 후)
   *   extraIncome: 0,         // 이자·배당·연금 등 그 밖의 소득금액
   *   bizIncome: 0,           // 사업소득금액(피부양자 사업소득 요건용)
   *   bizRegistered: false,
   *   propertyTaxBase: 0
   * }
   */
  function healthInsurance(input) {
    input = input || {};
    var mode = input.mode === "dependent" ? "dependent" : "employee";
    var sideIncome = Math.max(0, num(input.sideIncome));
    var extra = Math.max(0, num(input.extraIncome));
    var bizIncome = Math.max(0, num(input.bizIncome));
    var evaluated = sideIncome + extra;
    var H = RULES.health;

    if (mode === "employee") {
      var over = Math.max(0, evaluated - H.externalIncomeThreshold);
      var monthlyBase = over / 12;
      var baseEff = Math.min(monthlyBase, H.externalMonthlyCap / H.totalRate);
      var health = floorTo(baseEff * H.totalRate, 10);
      var ltc = floorTo(baseEff * H.ltcTotalRate, 1);
      return {
        mode: mode,
        evaluatedIncome: evaluated,
        threshold: H.externalIncomeThreshold,
        overThreshold: over,
        isOver: over > 0,
        monthlyBase: monthlyBase,
        healthMonthly: health,
        ltcMonthly: ltc,
        monthly: health + ltc,
        yearly: (health + ltc) * 12,
        capped: monthlyBase * H.totalRate > H.externalMonthlyCap,
        conditions: null,
        regional: null
      };
    }

    /* 피부양자 판정 */
    var condIncome = evaluated <= H.dependentIncomeLimit;
    var condBusiness = input.bizRegistered
      ? bizIncome <= 0
      : bizIncome <= H.dependentBusinessLimit;
    var propertyBase = Math.max(0, num(input.propertyTaxBase));
    var condProperty = propertyBase <= H.dependentPropertyLimit ||
      (propertyBase <= H.dependentPropertyLimitHigh && evaluated <= H.dependentPropertyIncomeLimit);

    var qualify = condIncome && condBusiness && condProperty;

    /* 탈락 시 지역가입자 보험료 (소득분) */
    var regionalMonthlyIncome = evaluated / 12;
    var regionalHealth = floorTo(regionalMonthlyIncome * H.totalRate, 10);
    var regionalLtc = floorTo(regionalMonthlyIncome * H.ltcTotalRate, 1);
    var propertyPoints = Math.max(0, num(input.propertyPoints));
    var propertyPremium = propertyPoints > 0 ? floorTo(propertyPoints * H.propertyPointValue, 10) : 0;

    return {
      mode: mode,
      evaluatedIncome: evaluated,
      threshold: H.dependentIncomeLimit,
      overThreshold: Math.max(0, evaluated - H.dependentIncomeLimit),
      isOver: evaluated > H.dependentIncomeLimit,
      monthlyBase: regionalMonthlyIncome,
      healthMonthly: qualify ? 0 : regionalHealth,
      ltcMonthly: qualify ? 0 : regionalLtc,
      propertyPremium: qualify ? 0 : propertyPremium,
      monthly: qualify ? 0 : regionalHealth + regionalLtc + propertyPremium,
      yearly: qualify ? 0 : (regionalHealth + regionalLtc + propertyPremium) * 12,
      capped: false,
      qualify: qualify,
      conditions: {
        income: { pass: condIncome, limit: H.dependentIncomeLimit, value: evaluated },
        business: {
          pass: condBusiness,
          limit: input.bizRegistered ? 0 : H.dependentBusinessLimit,
          value: bizIncome,
          registered: !!input.bizRegistered
        },
        property: { pass: condProperty, limit: H.dependentPropertyLimit, value: propertyBase }
      },
      regional: {
        healthMonthly: regionalHealth,
        ltcMonthly: regionalLtc,
        incomeMonthly: regionalHealth + regionalLtc,
        propertyPremium: propertyPremium,
        monthly: regionalHealth + regionalLtc + propertyPremium
      }
    };
  }

  /**
   * 기준선까지 쓸 수 있는 부업 수입 역산.
   * 목표 소득금액(500만원/2,000만원)에 닿는 수입금액을 계산합니다.
   */
  function revenueLimit(input, targetIncome) {
    input = input || {};
    var t = Math.max(0, num(targetIncome));
    if (input.sideType === "other") {
      var rate = clamp(num(input.otherExpenseRate != null ? input.otherExpenseRate : 0.6), 0, 0.98);
      // income = revenue*(1-rate) - 5만  ⇒ revenue = (t + 5만) / (1-rate)
      return (t + RULES.otherIncome.minimumTaxable) / (1 - rate);
    }
    var preset = presetOf(input.industryId);
    var basic = input.basicRate != null ? num(input.basicRate) : preset.basic;
    var excess = input.excessRate != null ? num(input.excessRate) : preset.excess;
    if (input.expenseMode === "rate" || input.expenseMode === "custom") {
      basic = excess = clamp(num(input.customRate != null ? input.customRate : basic), 0, 0.98);
    }
    if (input.expenseMode === "none") { basic = excess = 0; }
    var th = RULES.simpleExpense.revenueThreshold;
    var atThreshold = th * (1 - basic);
    if (t <= atThreshold) return t / (1 - basic || 1);
    if (excess >= 1) return Infinity;
    return th + (t - atThreshold) / (1 - excess);
  }

  /** 부업 수입이 기준선을 넘는지 빠르게 보는 지표 묶음 */
  function thresholds(input) {
    var biz5000 = revenueLimit(input, RULES.health.dependentBusinessLimit);
    var inc2000 = revenueLimit(input, RULES.health.dependentIncomeLimit);
    return {
      businessDependentLimit: biz5000,
      incomeDependentLimit: inc2000,
      incomeEmployeeLimit: inc2000
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 7. 표시용 포맷터
   * ──────────────────────────────────────────────────────────── */
  function comma(n) {
    var v = Math.round(num(n));
    var neg = v < 0;
    var s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + s;
  }
  /** 원 → "1,234만 5,600원" 형태의 짧은 표기 */
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
  /** 퍼센트 표기 (소수 1자리) */
  function percent(x, digits) {
    var d = digits == null ? 1 : digits;
    var v = num(x) * 100;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) + "%";
  }

  return {
    RULES: RULES,
    INDUSTRIES: INDUSTRIES,
    // 계산
    earnedDeductionAmount: earnedDeductionAmount,
    laborIncomeOf: laborIncomeOf,
    businessIncome: businessIncome,
    otherIncome: otherIncome,
    applyBrackets: applyBrackets,
    employeeSocialInsurance: employeeSocialInsurance,
    laborTaxCredit: laborTaxCredit,
    childTaxCredit: childTaxCredit,
    taxOn: taxOn,
    compareSideIncome: compareSideIncome,
    compareWithholdingTypes: compareWithholdingTypes,
    healthInsurance: healthInsurance,
    revenueLimit: revenueLimit,
    thresholds: thresholds,
    presetOf: presetOf,
    // 표시
    comma: comma,
    shortWon: shortWon,
    percent: percent,
    // 내부 유틸(테스트용)
    _util: { floorTo: floorTo, clamp: clamp, num: num }
  };
});
