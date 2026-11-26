/*!
 * MRCalc — 2026년 월세 세액공제 · 전세대출(주택임차차입금) 소득공제 계산 엔진
 * ------------------------------------------------------------
 * DOM에 의존하지 않는 순수 모듈입니다. 브라우저(app.js)와 테스트(QuickJS)가 같은 코드를 씁니다.
 *
 * 기준 확인일: 2026-11-26 (2026년 귀속분 = 2027년 1~2월 연말정산)
 *
 * 1) 월세액 세액공제 — 조세특례제한법 제95조의2
 *    (2025.12.23. 일부개정 법률 제21223호, 2026.1.1. 시행)
 *    · 대상: 과세기간 종료일(12.31.) 현재 무주택 세대의 세대주
 *            (세대주가 이 항·제87조제2항·소득세법 제52조제4항·제5항 공제를 받지 않으면 세대원)
 *            총급여 8,000만원 이하 근로자, 종합소득금액 7,000만원 이하
 *    · 공제율: 총급여 5,500만원 이하이면서 종합소득금액 4,500만원 이하 → 17%
 *             그 밖의 대상자 → 15%
 *    · 한도: 월세액 연 1,000만원 (초과분은 없는 것으로 봄)
 *    · 주택: 국민주택규모(주거전용 85㎡, 수도권 외 도시지역이 아닌 읍·면은 100㎡,
 *            기본공제대상 자녀·손자녀 3명 이상이면 100㎡) 또는 기준시가 4억원 이하
 *            (주거용 오피스텔·고시원 포함)
 *    · 계약자: 본인 또는 기본공제대상자. 임대차계약서 주소 = 주민등록표 주소
 *    · 2026년 지급분부터: 세대주가 공제받아도 세대주와 주소지의 시·군·구가 다른 배우자가
 *      요건을 갖추면 추가 공제. 배우자와 같은 주소의 직계존비속·형제자매도 무주택이어야 하며,
 *      부부 합산 월세 1,000만원 초과분은 배우자 월세에서 뺌(제2항, 시행령 제95조 제5항)
 *    · 산출세액 한도: 세액공제이므로 종합소득산출세액을 넘지 못하고 이월되지 않음
 *
 * 2) 주택임차차입금 원리금상환액 소득공제 — 소득세법 제52조 제4항
 *    · 대상: 12.31. 현재 무주택 세대의 세대주(세대원 예외)로서 근로소득이 있는 거주자
 *    · 주택: 국민주택규모 이하(85㎡, 수도권 외 읍·면 100㎡, 주거용 오피스텔 포함)
 *            — 월세와 달리 기준시가 요건은 없음
 *    · 공제: 원리금 상환액의 40%, 연 400만원 한도
 *    · 조세특례제한법 제87조 제2항의 주택청약종합저축 공제액(납입액 40%, 연 300만원 한도)과
 *      합쳐 400만원이 한도(초과분 없음). 청약저축은 총급여 7,000만원 이하 무주택 세대주 등 대상
 *    · 개인(대부업자 아닌 거주자)에게서 빌린 차입금은 총급여 5,000만원 이하만 대상
 *    · 소득공제이므로 절세액 = 공제액 × 한계세율 (+ 지방소득세 10%)
 *
 * 3) 비교: 월세 세액공제 vs 월세 현금영수증(신용카드 등 소득공제)
 *    · 신용카드 등 — 조세특례제한법 제126조의2: 총급여의 25% 초과분에 대해
 *      신용카드 15%, 현금영수증·직불·선불카드 30%, 전통시장·대중교통 40%
 *      기본 한도 총급여 7,000만원 이하 300만원 / 초과 250만원
 *      (최저사용금액은 공제율이 낮은 신용카드부터 차감)
 *    · 세액공제받은 월세액은 신용카드 등 사용금액에서 제외
 *    · 표준세액공제 13만원(소득세법 제59조의4 제9항)은 특별소득공제·특별세액공제·월세
 *      세액공제를 신청하지 않은 근로자에게만 적용 — 월세 공제 시 사라짐
 *    · 주택 월세 현금영수증은 임대인 동의 없이 홈택스에서 신고 가능(지급일부터 3년 이내)
 *
 * 4) 지방소득세: 소득세 감소액의 10% (지방세법 제103조의13)
 * 5) 경정청구: 법정신고기한이 지난 후 5년 이내 (국세기본법 제45조의2 제1항)
 * 6) 2026년 8월 세제개편안의 2027년 시행 예정분(월세 한도 1,200만원, 청년 17%)은
 *    국회 심의 중이라 반영하지 않았습니다.
 *
 * 모든 결과는 참고용 모의 계산입니다.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MRCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RULES = {
    year: 2026,
    verifiedAt: "2026-11-26",
    localTaxRate: 0.10,
    standardCredit: 130000,

    rent: {
      cap: 10000000,          // 월세액 연 1,000만원
      salaryLow: 55000000,    // 17% 구간 총급여
      salaryCap: 80000000,    // 대상 총급여 상한
      incomeLow: 45000000,    // 17% 구간 종합소득금액
      incomeCap: 70000000,    // 대상 종합소득금액 상한
      rateLow: 0.17,
      rateHigh: 0.15,
      area: 85,               // 국민주택규모 (수도권)
      areaWide: 100,          // 수도권 외 도시지역이 아닌 읍·면
      areaMulti: 100,         // 자녀·손자녀 3명 이상
      priceCap: 400000000,    // 기준시가 4억원
      monthsInYear: 12
    },

    loan: {
      rate: 0.40,
      cap: 4000000,           // 청약저축 공제와 합산 한도
      savingsRate: 0.40,
      savingsCap: 3000000,    // 청약저축 공제액 한도
      savingsSalaryCap: 70000000,
      area: 85,
      areaWide: 100,
      privateSalaryCap: 50000000
    },

    card: {
      threshold: 0.25,        // 총급여의 25%
      creditRate: 0.15,
      cashRate: 0.30,
      marketRate: 0.40,
      limitLow: 3000000,      // 총급여 7,000만원 이하
      limitHigh: 2500000,     // 7,000만원 초과
      limitSalary: 70000000
    },

    /* 근로소득공제 — 소득세법 제47조 (한도 2,000만원) */
    earned: {
      cap: 20000000,
      tiers: [
        { upTo: 5000000, rate: 0.70, base: 0, from: 0 },
        { upTo: 15000000, rate: 0.40, base: 3500000, from: 5000000 },
        { upTo: 45000000, rate: 0.15, base: 7500000, from: 15000000 },
        { upTo: 100000000, rate: 0.05, base: 12000000, from: 45000000 },
        { upTo: Infinity, rate: 0.02, base: 14750000, from: 100000000 }
      ]
    },

    basicDeduction: 1500000,
    npsRate: 0.0475,
    npsAnnualCap: 6590000 * 12,

    brackets: [
      { upTo: 14000000, rate: 0.06, label: "1,400만원 이하" },
      { upTo: 50000000, rate: 0.15, label: "1,400만~5,000만원" },
      { upTo: 88000000, rate: 0.24, label: "5,000만~8,800만원" },
      { upTo: 150000000, rate: 0.35, label: "8,800만~1억5,000만원" },
      { upTo: 300000000, rate: 0.38, label: "1억5,000만~3억원" },
      { upTo: 500000000, rate: 0.40, label: "3억~5억원" },
      { upTo: 1000000000, rate: 0.42, label: "5억~10억원" },
      { upTo: Infinity, rate: 0.45, label: "10억원 초과" }
    ]
  };

  var LIMITS = {
    salary: { min: 0, max: 300000000, step: 1000000 },
    income: { min: 0, max: 300000000, step: 1000000 },
    monthlyRent: { min: 0, max: 5000000, step: 10000 },
    months: { min: 0, max: 12, step: 1 },
    amount: { min: 0, max: 50000000, step: 100000 },
    price: { min: 0, max: 3000000000, step: 10000000 },
    area: { min: 0, max: 300, step: 1 },
    tax: { min: 0, max: 200000000, step: 100000 }
  };

  var MONTHLY_SCALE = [300000, 400000, 500000, 600000, 700000, 800000, 1000000];
  var RATE_SCALE = [0.06, 0.15, 0.24, 0.35, 0.38, 0.40, 0.42, 0.45];

  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function money(v) {
    var n = num(v);
    return n < 0 ? 0 : n;
  }

  function floor(v) {
    return Math.floor(num(v) + 1e-7);
  }

  /* ────────────────────────────────────────────────────────────
   * 1. 소득 추정 — 과세표준·한계세율·절세액 계산용
   * ──────────────────────────────────────────────────────────── */
  function earnedDeduction(salary) {
    var s = money(salary);
    var out = 0;
    for (var i = 0; i < RULES.earned.tiers.length; i++) {
      var t = RULES.earned.tiers[i];
      if (s <= t.upTo) {
        out = t.base + (s - t.from) * t.rate;
        break;
      }
    }
    return Math.min(out, RULES.earned.cap);
  }

  /** 근로소득금액 = 총급여 − 근로소득공제 (총급여만 있을 때 종합소득금액 추정) */
  function earnedIncome(salary) {
    return Math.max(0, money(salary) - earnedDeduction(salary));
  }

  /** 과세표준 추정: 근로소득금액 − 국민연금 − 기본공제 */
  function estimateTaxable(salary, dependents) {
    var s = money(salary);
    var people = Math.max(1, Math.floor(num(dependents) || 1));
    var nps = RULES.npsRate * Math.min(s, RULES.npsAnnualCap);
    var taxable = s - earnedDeduction(s) - nps - RULES.basicDeduction * people;
    return Math.max(0, Math.floor(taxable / 10) * 10);
  }

  function taxOf(taxable) {
    var t = money(taxable);
    var prev = 0;
    var tax = 0;
    for (var i = 0; i < RULES.brackets.length; i++) {
      var b = RULES.brackets[i];
      if (t <= b.upTo) {
        tax += (t - prev) * b.rate;
        break;
      }
      tax += (b.upTo - prev) * b.rate;
      prev = b.upTo;
    }
    return Math.round(tax);
  }

  /** 한계세율(과세표준이 속한 구간의 세율) */
  function marginalRate(taxable) {
    var t = money(taxable);
    for (var i = 0; i < RULES.brackets.length; i++) {
      if (t <= RULES.brackets[i].upTo) return RULES.brackets[i].rate;
    }
    return RULES.brackets[RULES.brackets.length - 1].rate;
  }

  function bracketLabel(taxable) {
    var t = money(taxable);
    for (var i = 0; i < RULES.brackets.length; i++) {
      if (t <= RULES.brackets[i].upTo) return RULES.brackets[i].label;
    }
    return "10억원 초과";
  }

  /** 소득공제 1건이 줄여 주는 세금 (소득세 + 지방소득세) */
  function deductionSaving(taxable, deduction) {
    var base = money(taxable);
    var ded = Math.min(money(deduction), base);
    var before = taxOf(base);
    var after = taxOf(base - ded);
    var income = before - after;
    var local = floor(income * RULES.localTaxRate);
    return {
      deduction: ded,
      taxableBefore: base,
      taxableAfter: base - ded,
      incomeTax: income,
      local: local,
      total: income + local,
      rate: ded > 0 ? (income + local) / ded : 0
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 2. 월세 세액공제 (조세특례제한법 제95조의2)
   * ──────────────────────────────────────────────────────────── */
  /** 공제율 — 총급여·종합소득금액 두 요건을 모두 봅니다. */
  function rentRate(salary, income) {
    var s = money(salary);
    var i = income == null ? earnedIncome(s) : money(income);
    var salaryOk = s <= RULES.rent.salaryCap;
    var incomeOk = i <= RULES.rent.incomeCap;
    var eligible = salaryOk && incomeOk;
    var low = s <= RULES.rent.salaryLow && i <= RULES.rent.incomeLow;
    return {
      salary: s,
      income: i,
      salaryOk: salaryOk,
      incomeOk: incomeOk,
      eligible: eligible,
      low: low,
      rate: eligible ? (low ? RULES.rent.rateLow : RULES.rent.rateHigh) : 0,
      label: !eligible ? "대상 아님" : (low ? "17%" : "15%")
    };
  }

  function annualRent(monthlyRent, months) {
    var m = Math.min(RULES.rent.monthsInYear, Math.max(0, Math.floor(num(months))));
    return money(monthlyRent) * m;
  }

  /** 대상 주택 요건: 면적 또는 기준시가 중 하나만 맞으면 됩니다. */
  function housingCheck(area, price, opts) {
    opts = opts || {};
    var limit = opts.multiChild || opts.wideArea ? RULES.rent.areaMulti : RULES.rent.area;
    var a = money(area);
    var p = money(price);
    var areaOk = a > 0 && a <= limit;
    var priceOk = p > 0 && p <= RULES.rent.priceCap;
    return {
      area: a,
      price: p,
      areaLimit: limit,
      areaOk: areaOk,
      priceOk: priceOk,
      ok: areaOk || priceOk
    };
  }

  /**
   * rentCredit(o)
   *  o = {
   *    salary, income,            // 총급여, 종합소득금액(없으면 총급여로 추정)
   *    monthlyRent, months,       // 월세액, 납부 개월 수
   *    area, price,               // 전용면적(㎡), 기준시가
   *    multiChild, wideArea,      // 자녀·손자녀 3명 이상, 수도권 외 읍·면
   *    head, addressOk,           // 무주택 세대주(또는 세대원), 주소·명의 요건
   *    incomeTax,                 // 산출세액 (0이면 한도 없음으로 봄)
   *    spouse: { enabled, salary, income, monthlyRent, months, otherRegion }
   *  }
   */
  function rentCredit(o) {
    o = o || {};
    var salary = money(o.salary);
    var income = o.income == null || o.income === "" ? earnedIncome(salary) : money(o.income);
    var rate = rentRate(salary, income);
    var house = housingCheck(o.area, o.price, { multiChild: !!o.multiChild, wideArea: !!o.wideArea });
    var head = o.head == null ? true : !!o.head;
    var addressOk = o.addressOk == null ? true : !!o.addressOk;

    var months = Math.min(RULES.rent.monthsInYear, Math.max(0, Math.floor(num(o.months))));
    var monthlyRent = money(o.monthlyRent);
    var annual = monthlyRent * months;

    var eligible = rate.eligible && house.ok && head && addressOk;
    var base = Math.min(annual, RULES.rent.cap);
    var credit = eligible ? floor(base * rate.rate) : 0;

    /* 배우자 추가 공제 (2026년 지급분부터) */
    var sp = o.spouse || {};
    var spouse = {
      enabled: !!sp.enabled,
      otherRegion: sp.otherRegion == null ? true : !!sp.otherRegion,
      rate: rentRate(sp.salary, sp.income == null || sp.income === "" ? earnedIncome(sp.salary) : sp.income),
      monthlyRent: money(sp.monthlyRent),
      months: Math.min(RULES.rent.monthsInYear, Math.max(0, Math.floor(num(sp.months)))),
      annualRent: 0,
      base: 0,
      credit: 0,
      eligible: false,
      excess: 0
    };
    spouse.annualRent = spouse.monthlyRent * spouse.months;
    if (spouse.enabled) {
      var combined = annual + spouse.annualRent;
      spouse.excess = Math.max(0, combined - RULES.rent.cap);
      spouse.base = Math.max(0, spouse.annualRent - spouse.excess);
      spouse.eligible = eligible && spouse.rate.eligible && spouse.otherRegion && spouse.base > 0;
      spouse.credit = spouse.eligible ? floor(spouse.base * spouse.rate.rate) : 0;
    }

    var totalCredit = credit + spouse.credit;
    var local = floor(totalCredit * RULES.localTaxRate);
    var total = totalCredit + local;

    /* 세액공제는 산출세액 한도 — 이월 없음 */
    var incomeTax = money(o.incomeTax);
    var appliedCredit = incomeTax > 0 ? Math.min(totalCredit, incomeTax) : totalCredit;
    var appliedLocal = floor(appliedCredit * RULES.localTaxRate);
    var applied = appliedCredit + appliedLocal;
    var lost = totalCredit - appliedCredit;
    var capped = incomeTax > 0 && lost > 0;

    var reasons = [
      {
        key: "salary", label: "총급여 8,000만원 이하",
        ok: rate.salaryOk,
        note: rate.salaryOk ? "내 총급여 " + Math.round(salary / 10000) + "만원" : "총급여 " + Math.round(salary / 10000) + "만원 — 대상 아님"
      },
      {
        key: "income", label: "종합소득금액 7,000만원 이하",
        ok: rate.incomeOk,
        note: rate.incomeOk ? "근로소득만 있으면 자동 충족" : "종합소득금액 " + Math.round(income / 10000) + "만원 — 대상 아님"
      },
      {
        key: "house", label: "국민주택규모 또는 기준시가 4억원 이하",
        ok: house.ok,
        note: house.ok
          ? (house.areaOk ? "전용 " + house.area + "㎡ (기준 " + house.areaLimit + "㎡)" : "기준시가 " + Math.round(house.price / 100000000 * 10) / 10 + "억원")
          : "전용 " + house.area + "㎡ · 기준시가 " + Math.round(house.price / 100000000 * 10) / 10 + "억원 — 둘 다 초과"
      },
      {
        key: "head", label: "무주택 세대주(또는 세대주의 공제를 받지 않는 세대원)",
        ok: head,
        note: head ? "12월 31일 기준 무주택" : "세대주·세대원 요건 확인 필요"
      },
      {
        key: "address", label: "임대차계약서 주소 = 주민등록 주소, 본인·기본공제대상자 명의",
        ok: addressOk,
        note: addressOk ? "전입신고 완료" : "전입신고·계약자 명의 확인 필요"
      }
    ];
    if (spouse.enabled) {
      reasons.push({
        key: "spouse", label: "배우자 추가 공제 요건",
        ok: spouse.eligible,
        note: !spouse.otherRegion ? "세대주와 같은 시·군·구 — 추가 공제 불가"
          : (!spouse.rate.eligible ? "배우자 소득 요건 초과"
            : (spouse.base <= 0 ? "부부 합산 1,000만원 한도에 걸림" : "배우자 월세 " + Math.round(spouse.base / 10000) + "만원 반영"))
      });
    }

    return {
      salary: salary,
      income: income,
      rate: rate.rate,
      rateLabel: rate.label,
      low: rate.low,
      eligible: eligible,
      house: house,
      head: head,
      addressOk: addressOk,
      monthlyRent: monthlyRent,
      months: months,
      annualRent: annual,
      base: base,
      capLeft: Math.max(0, RULES.rent.cap - base),
      capUsedRate: Math.min(1, base / RULES.rent.cap),
      credit: credit,
      spouse: spouse,
      totalCredit: totalCredit,
      local: local,
      total: total,
      incomeTax: incomeTax,
      appliedCredit: appliedCredit,
      appliedLocal: appliedLocal,
      applied: applied,
      lost: lost,
      capped: capped,
      effective: base > 0 ? totalCredit / base : 0,
      maxCredit: floor(RULES.rent.cap * rate.rate),
      reasons: reasons,
      missing: reasons.filter(function (r) { return !r.ok; }).length,
      scale: MONTHLY_SCALE
    };
  }

  /** 월세액(월)별 공제 비교 표 */
  function rentScale(o) {
    o = o || {};
    return MONTHLY_SCALE.map(function (monthly) {
      var r = rentCredit(Object.assign({}, o, { monthlyRent: monthly, spouse: { enabled: false } }));
      return {
        monthly: monthly,
        annual: r.annualRent,
        base: r.base,
        rate: r.rate,
        credit: r.credit,
        total: r.credit + floor(r.credit * RULES.localTaxRate)
      };
    });
  }

  /* ────────────────────────────────────────────────────────────
   * 3. 전세대출(주택임차차입금) 원리금상환액 소득공제 (소득세법 제52조 제4항)
   * ──────────────────────────────────────────────────────────── */
  /**
   * loanDeduction(o)
   *  o = { salary, repay, savings, area, wideArea, head, loanType, dependents, incomeTax }
   *   - repay    : 연간 원리금 상환액
   *   - savings  : 연간 주택청약종합저축 납입액
   *   - loanType : 'bank'(금융기관) | 'private'(개인)
   */
  function loanDeduction(o) {
    o = o || {};
    var salary = money(o.salary);
    var repay = money(o.repay);
    var savings = money(o.savings);
    var areaLimit = o.wideArea ? RULES.loan.areaWide : RULES.loan.area;
    var area = money(o.area);
    var areaOk = area > 0 && area <= areaLimit;
    var head = o.head == null ? true : !!o.head;
    var loanType = o.loanType === "private" ? "private" : "bank";
    var privateOk = loanType === "bank" || salary <= RULES.loan.privateSalaryCap;

    var loanRaw = floor(repay * RULES.loan.rate);
    var loanCapOnly = Math.min(loanRaw, RULES.loan.cap);

    var savingsEligible = savings > 0 && salary <= RULES.loan.savingsSalaryCap;
    var savingsRaw = savingsEligible ? floor(savings * RULES.loan.savingsRate) : 0;
    var savingsCapOnly = Math.min(savingsRaw, RULES.loan.savingsCap);

    var loanEligible = head && areaOk && privateOk;
    var combinedCap = RULES.loan.cap;
    var totalDed = Math.min(savingsCapOnly + loanCapOnly, combinedCap);
    var savingsPart = Math.min(savingsCapOnly, totalDed);
    var loanPart = totalDed - savingsPart;
    if (!loanEligible) {
      loanPart = 0;
      savingsPart = Math.min(savingsCapOnly, combinedCap);
      totalDed = savingsPart;
    }

    var taxable = estimateTaxable(salary, o.dependents);
    var marginal = marginalRate(taxable);
    var saving = deductionSaving(taxable, totalDed);

    var reasons = [
      {
        key: "head", label: "무주택 세대주(또는 세대원 예외)",
        ok: head, note: head ? "12월 31일 기준 무주택" : "세대주 요건 확인 필요"
      },
      {
        key: "area", label: "국민주택규모 이하 주택(기준시가 요건 없음)",
        ok: areaOk, note: areaOk ? "전용 " + area + "㎡ (기준 " + areaLimit + "㎡)" : "전용 " + area + "㎡ — 85㎡ 초과분은 대상 아님"
      },
      {
        key: "lender", label: "금융기관 대출(개인 차입은 총급여 5,000만원 이하만)",
        ok: privateOk, note: loanType === "bank" ? "은행·제2금융권 등" : (privateOk ? "개인 차입 · 총급여 5,000만원 이하" : "개인 차입 · 총급여 5,000만원 초과")
      }
    ];

    return {
      salary: salary,
      repay: repay,
      savings: savings,
      loanType: loanType,
      area: area,
      areaLimit: areaLimit,
      areaOk: areaOk,
      head: head,
      eligible: loanEligible,
      loanRaw: loanRaw,
      loanCapOnly: loanCapOnly,
      loanPart: loanPart,
      savingsRaw: savingsRaw,
      savingsCapOnly: savingsCapOnly,
      savingsPart: savingsPart,
      savingsEligible: savingsEligible,
      totalDed: totalDed,
      capLeft: Math.max(0, combinedCap - totalDed),
      capUsedRate: Math.min(1, totalDed / combinedCap),
      repayForFullCap: RULES.loan.cap / RULES.loan.rate,
      taxable: taxable,
      marginal: marginal,
      bracket: bracketLabel(taxable),
      saving: saving,
      effective: repay > 0 ? saving.total / repay : 0,
      reasons: reasons,
      missing: reasons.filter(function (r) { return !r.ok; }).length,
      rateScale: RATE_SCALE
    };
  }

  /** 한계세율별 절세액 표 (같은 공제액 기준) */
  function marginalTable(deduction) {
    var ded = money(deduction);
    return RATE_SCALE.map(function (rate) {
      var income = Math.round(ded * rate);
      var local = floor(income * RULES.localTaxRate);
      return { rate: rate, deduction: ded, incomeTax: income, local: local, total: income + local };
    });
  }

  /* ────────────────────────────────────────────────────────────
   * 4. 월세 세액공제 vs 현금영수증(신용카드 등 소득공제) 비교
   * ──────────────────────────────────────────────────────────── */
  /**
   * cardDeduction(o)
   *  o = { salary, credit, cash, dependents }
   *  - 최저사용금액(총급여 25%)은 공제율이 낮은 신용카드부터 차감합니다.
   */
  function cardDeduction(o) {
    o = o || {};
    var salary = money(o.salary);
    var credit = money(o.credit);
    var cash = money(o.cash);
    var total = credit + cash;
    var threshold = salary * RULES.card.threshold;
    var excess = Math.max(0, total - threshold);
    var creditPart = Math.min(credit, excess);
    var cashPart = Math.min(cash, Math.max(0, excess - creditPart));
    var raw = creditPart * RULES.card.creditRate + cashPart * RULES.card.cashRate;
    var limit = salary <= RULES.card.limitSalary ? RULES.card.limitLow : RULES.card.limitHigh;
    var deduction = Math.min(floor(raw), limit);

    var taxable = estimateTaxable(salary, o.dependents);
    var saving = deductionSaving(taxable, deduction);

    return {
      salary: salary,
      credit: credit,
      cash: cash,
      total: total,
      threshold: threshold,
      excess: excess,
      creditPart: creditPart,
      cashPart: cashPart,
      raw: floor(raw),
      limit: limit,
      deduction: deduction,
      capped: floor(raw) > limit,
      taxable: taxable,
      saving: saving,
      overThreshold: total > threshold
    };
  }

  /**
   * compareCard(o)
   *  o = { salary, income, monthlyRent, months, area, price, multiChild, wideArea, head, addressOk,
   *        incomeTax, credit, cash, standardOnly, dependents }
   *
   *  A안: 월세를 세액공제로 받는다 → 월세는 신용카드 등 사용액에서 빠진다.
   *  B안: 월세를 현금영수증으로 받는다 → 세액공제 대신 30% 소득공제(25% 문턱·한도 적용).
   */
  function compareCard(o) {
    o = o || {};
    var salary = money(o.salary);
    var months = Math.min(12, Math.max(0, Math.floor(num(o.months))));
    var annual = money(o.monthlyRent) * months;
    var rent = rentCredit({
      salary: salary,
      income: o.income,
      monthlyRent: o.monthlyRent,
      months: months,
      area: o.area,
      price: o.price,
      multiChild: o.multiChild,
      wideArea: o.wideArea,
      head: o.head,
      addressOk: o.addressOk,
      incomeTax: o.incomeTax,
      spouse: { enabled: false }
    });

    var incomeTax = money(o.incomeTax);
    var standardOnly = !!o.standardOnly;
    var standardWorth = floor(RULES.standardCredit * (1 + RULES.localTaxRate));

    /* A안 — 세액공제 + 월세를 뺀 카드 공제 */
    var cardA = cardDeduction({ salary: salary, credit: o.credit, cash: o.cash, dependents: o.dependents });
    var aRentCredit = incomeTax > 0 ? Math.min(rent.credit, incomeTax) : rent.credit;
    var aRentTotal = aRentCredit + floor(aRentCredit * RULES.localTaxRate);
    var aStandardLoss = standardOnly ? Math.min(standardWorth, aRentTotal + cardA.saving.total) : 0;
    var aTotal = aRentTotal + cardA.saving.total - aStandardLoss;

    /* B안 — 현금영수증(월세 포함) 소득공제만, 표준세액공제 유지 */
    var cardB = cardDeduction({
      salary: salary, credit: o.credit, cash: money(o.cash) + annual, dependents: o.dependents
    });
    var bStandard = standardOnly ? standardWorth : 0;
    var bTotal = cardB.saving.total + bStandard;
    var bRentDeduction = Math.max(0, cardB.deduction - cardA.deduction);

    var diff = aTotal - bTotal;
    var verdict;
    if (annual <= 0) verdict = "none";
    else if (diff > 1000) verdict = "rent";
    else if (diff < -1000) verdict = "cash";
    else verdict = "tie";

    return {
      salary: salary,
      annualRent: annual,
      months: months,
      rent: rent,
      incomeTax: incomeTax,
      standardOnly: standardOnly,
      standardWorth: standardWorth,
      a: {
        rentCredit: aRentCredit,
        rentLocal: floor(aRentCredit * RULES.localTaxRate),
        rentTotal: aRentTotal,
        card: cardA,
        standardLoss: aStandardLoss,
        total: aTotal,
        cardDeduction: cardA.deduction,
        cardSaving: cardA.saving.total
      },
      b: {
        card: cardB,
        cardDeduction: cardB.deduction,
        cardSaving: cardB.saving.total,
        rentExtraDeduction: bRentDeduction,
        standardCredit: bStandard,
        total: bTotal
      },
      diff: diff,
      verdict: verdict,
      marginal: cardA.saving.deduction > 0 ? marginalRate(cardA.taxable) : marginalRate(cardA.taxable),
      rateScale: RATE_SCALE
    };
  }

  /** 한계세율별로 세액공제(15%·17%)와 현금영수증(30%) 중 어느 쪽이 유리한지 */
  function rateCompareTable(rentRateValue) {
    var rate = rentRateValue || RULES.rent.rateHigh;
    return RATE_SCALE.map(function (m) {
      var cashEffective = RULES.card.cashRate * m * (1 + RULES.localTaxRate);
      return {
        rate: m,
        rentEffective: rate * (1 + RULES.localTaxRate),
        cashEffective: cashEffective,
        better: rate * (1 + RULES.localTaxRate) >= cashEffective ? "rent" : "cash",
        diff: rate * (1 + RULES.localTaxRate) - cashEffective
      };
    });
  }

  /* ────────────────────────────────────────────────────────────
   * 5. 내보내기
   * ──────────────────────────────────────────────────────────── */
  return {
    RULES: RULES,
    LIMITS: LIMITS,
    MONTHLY_SCALE: MONTHLY_SCALE,
    RATE_SCALE: RATE_SCALE,
    earnedDeduction: earnedDeduction,
    earnedIncome: earnedIncome,
    estimateTaxable: estimateTaxable,
    taxOf: taxOf,
    marginalRate: marginalRate,
    bracketLabel: bracketLabel,
    deductionSaving: deductionSaving,
    rentRate: rentRate,
    annualRent: annualRent,
    housingCheck: housingCheck,
    rentCredit: rentCredit,
    rentScale: rentScale,
    loanDeduction: loanDeduction,
    marginalTable: marginalTable,
    cardDeduction: cardDeduction,
    compareCard: compareCard,
    rateCompareTable: rateCompareTable
  };
});
