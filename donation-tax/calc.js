/*!
 * DTCalc — 2026년 기부금 세액공제 계산 엔진 (고향사랑기부제 · 정치자금 · 특례 · 일반)
 * ------------------------------------------------------------
 * DOM에 의존하지 않는 순수 모듈입니다. 브라우저(app.js)와 테스트(QuickJS)가 같은 코드를 씁니다.
 *
 * 기준 확인일: 2026-11-26 (2026년 기부분 = 2027년 1~2월 연말정산)
 *  - 조세특례제한법 제58조 (고향사랑기부금, 2026.1.1. 이후 기부분)
 *      · 10만원 이하: 기부금 × 110분의 100
 *      · 10만원 초과 20만원 이하: 10만원 × 110분의 100 + (기부금 − 10만원) × 40%
 *      · 20만원 초과 2,000만원 이하: 위 금액 + (기부금 − 20만원) × 15%
 *        (특별재난지역 선포일부터 3개월 이내 기부는 20만원 초과분 30%)
 *      · ② 공제액은 종합소득산출세액 한도, ③ 다른 기부금 공제와 중복 불가
 *      · 10만~20만원 40% 구간은 2025.12.23. 개정(법률 제21223호)으로 신설, 부칙 제13조에 따라
 *        2026.1.1. 이후 기부분부터 적용. 2025년 기부분까지는 15%였습니다.
 *  - 조세특례제한법 제76조 (정치자금기부금)
 *      · 10만원 이하 110분의 100, 10만원 초과 3,000만원 이하 15%, 3,000만원 초과 25%
 *  - 소득세법 제59조의4 제4항 (특례기부금·일반기부금)
 *      · 합산 금액의 15%, 1,000만원 초과분은 30%
 *      · 일반기부금 한도: 종교단체 기부가 없으면 소득금액 × 30%
 *        종교단체 기부가 있으면 소득금액 × 10% + min(소득금액 × 20%, 종교단체 외 기부금)
 *      · 특례기부금 먼저, 그다음 일반기부금(종교단체 외 → 종교단체) 순서
 *      · 2024년에만 적용된「3,000만원 초과분 40%」는 2026년 기부분에 없습니다(제8항).
 *  - 이월: 특례·일반기부금의 한도 초과분과 산출세액 초과분은 10년 이월(소득세법 제61조 제2항).
 *    정치자금·고향사랑기부금은 이월 불가.
 *  - 지방소득세: 소득세 공제액의 10% (지방세법 제103조의13, 지방세특례제한법 제167조의2).
 *  - 공제 순서: 정치자금 → 고향사랑 → 특례 → 우리사주 → 종교단체 외 일반 → 종교단체 일반.
 *  - 기부 한도: 고향사랑기부금은 개인별 연 2,000만원(고향사랑 기부금에 관한 법률 제8조 제3항),
 *    답례품은 매회 기부액의 30% 이내(같은 법 제9조, 시행령 제5조 제1항).
 *
 * 모든 결과는 참고용 모의 계산입니다.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.DTCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FIRST_RATE = 100 / 110; // 10만원 이하·정치자금 10만원 이하: 110분의 100

  var RULES = {
    year: 2026,
    verifiedAt: "2026-11-26",
    localTaxRate: 0.10,

    hometown: {
      cap: 20000000,          // 개인별 연간 한도
      first: 100000,          // 10만원 이하 100/110
      firstRate: FIRST_RATE,
      mid: 200000,            // 10만~20만원 40%
      midRate: 0.40,
      highRate: 0.15,         // 20만원 초과분 15%
      disasterRate: 0.30,     // 특별재난지역 20만원 초과분 30%
      disasterMonths: 3,
      giftRate: 0.30,         // 답례품(기부 포인트) 한도
      giftYears: 5,           // 포인트 유효기간
      minAmount: 10000        // 고향사랑e음 최소 기부 단위(참고)
    },

    political: {
      first: 100000,
      firstRate: FIRST_RATE,
      rate: 0.15,
      high: 30000000,
      highRate: 0.25
    },

    general: {
      threshold: 10000000,    // 1,000만원
      lowRate: 0.15,
      highRate: 0.30,
      limitRate: 0.30,        // 종교단체 기부 없을 때 소득금액 × 30%
      religionLimitRate: 0.10,
      religionExtraRate: 0.20,
      carryYears: 10
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
    money: { min: 0, max: 50000000, step: 10000 },
    income: { min: 0, max: 300000000, step: 1000000 },
    tax: { min: 0, max: 200000000, step: 100000 },
    amount: { min: 0, max: 20000000, step: 100000 }
  };

  /* 기부금 종류 메타 (화면·표에서 공통 사용) */
  var TYPES = [
    {
      key: "political",
      name: "정치자금기부금",
      short: "정치자금",
      law: "조세특례제한법 제76조",
      rateLabel: "10만원까지 100/110, 그 위 15%·25%",
      limitLabel: "근로소득금액 한도",
      carry: false,
      where: "정당·후원회·선거관리위원회"
    },
    {
      key: "hometown",
      name: "고향사랑기부금",
      short: "고향사랑",
      law: "조세특례제한법 제58조",
      rateLabel: "10만원까지 100%, 20만원까지 44%",
      limitLabel: "연 2,000만원",
      carry: false,
      where: "주소지가 아닌 지방자치단체"
    },
    {
      key: "special",
      name: "특례기부금",
      short: "특례",
      law: "소득세법 제59조의4 제4항",
      rateLabel: "1,000만원까지 15%, 초과분 30%",
      limitLabel: "소득금액 한도",
      carry: true,
      where: "국가·지자체, 국방헌금, 이재민 구호금품 등"
    },
    {
      key: "general",
      name: "일반기부금",
      short: "일반",
      law: "소득세법 제59조의4 제4항",
      rateLabel: "1,000만원까지 15%, 초과분 30%",
      limitLabel: "소득금액의 30%",
      carry: true,
      where: "사회복지·문화·예술·교육·자선 단체"
    },
    {
      key: "religion",
      name: "종교단체기부금",
      short: "종교단체",
      law: "소득세법 제59조의4 제4항",
      rateLabel: "1,000만원까지 15%, 초과분 30%",
      limitLabel: "소득금액의 10%+α",
      carry: true,
      where: "허가받은 종교 비영리법인과 소속 단체"
    }
  ];

  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function clampAmount(v, max) {
    var n = num(v);
    if (n < 0) return 0;
    return Math.min(max == null ? 50000000 : max, n);
  }

  function typeMeta(key) {
    for (var i = 0; i < TYPES.length; i++) {
      if (TYPES[i].key === key) return TYPES[i];
    }
    return null;
  }

  /* ────────────────────────────────────────────────────────────
   * 2. 소득 추정 (한도·산출세액 참고용)
   * ──────────────────────────────────────────────────────────── */
  function earnedDeduction(salary) {
    var s = Math.max(0, num(salary));
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

  /** 근로소득금액 = 총급여 − 근로소득공제 (기부금 한도의 기준이 되는 소득금액) */
  function earnedIncome(salary) {
    return Math.max(0, num(salary) - earnedDeduction(salary));
  }

  function estimateTaxable(salary, dependents) {
    var s = Math.max(0, num(salary));
    var people = Math.max(1, Math.floor(num(dependents) || 1));
    var nps = RULES.npsRate * Math.min(s, RULES.npsAnnualCap);
    var taxable = s - earnedDeduction(s) - nps - RULES.basicDeduction * people;
    return Math.max(0, Math.floor(taxable / 10) * 10);
  }

  function incomeTaxOf(taxable) {
    var t = Math.max(0, num(taxable));
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

  function estimateIncomeTax(salary, dependents) {
    var taxable = estimateTaxable(salary, dependents);
    return { taxable: taxable, incomeTax: incomeTaxOf(taxable) };
  }

  /* ────────────────────────────────────────────────────────────
   * 3. 고향사랑기부금 (조세특례제한법 제58조)
   * ──────────────────────────────────────────────────────────── */
  /**
   * hometownCredit(amount, disaster)
   *  - amount : 연간 누적 기부금액 (한도 2,000만원까지)
   *  - disaster: 특별재난지역 선포일부터 3개월 이내 기부 여부
   */
  function hometownCredit(amount, disaster) {
    var a = Math.max(0, num(amount));
    var paid = Math.min(a, RULES.hometown.cap);
    var overCap = Math.max(0, a - RULES.hometown.cap);

    var b1 = Math.min(paid, RULES.hometown.first);
    var b2 = Math.max(0, Math.min(paid, RULES.hometown.mid) - RULES.hometown.first);
    var b3 = Math.max(0, paid - RULES.hometown.mid);

    var r1 = b1 * RULES.hometown.firstRate;
    var r2 = b2 * RULES.hometown.midRate;
    var r3 = b3 * (disaster ? RULES.hometown.disasterRate : RULES.hometown.highRate);
    var raw = r1 + r2 + r3;
    var credit = Math.floor(raw);
    var local = Math.floor(credit * RULES.localTaxRate);

    return {
      amount: a,
      paid: paid,
      overCap: overCap,
      disaster: !!disaster,
      bands: [
        { key: "b1", label: "10만원 이하", base: b1, rate: RULES.hometown.firstRate, text: "100/110", credit: Math.floor(r1) },
        { key: "b2", label: "10만~20만원", base: b2, rate: RULES.hometown.midRate, text: "40%", credit: Math.floor(r2) },
        { key: "b3", label: disaster ? "20만원 초과 (특별재난지역)" : "20만원 초과", base: b3, rate: disaster ? RULES.hometown.disasterRate : RULES.hometown.highRate, text: disaster ? "30%" : "15%", credit: Math.floor(r3) }
      ],
      credit: credit,
      local: local,
      total: credit + local,
      effective: paid > 0 ? (credit + local) / paid : 0,
      gift: Math.floor(paid * RULES.hometown.giftRate)
    };
  }

  /**
   * hometownPlan(o)
   *  o = { amount, prior, disaster, incomeTax }
   *  - amount : 이번에 기부할 금액
   *  - prior  : 올해 이미 기부한 금액 (구간은 연간 누적 기준)
   *  - incomeTax : 산출세액 (넘으면 공제 불가, 0·미입력이면 제한 없음)
   */
  function hometownPlan(o) {
    o = o || {};
    var amount = Math.max(0, num(o.amount));
    var prior = Math.max(0, num(o.prior));
    var disaster = !!o.disaster;
    var incomeTax = Math.max(0, num(o.incomeTax));

    var before = hometownCredit(prior, disaster);
    var after = hometownCredit(prior + amount, disaster);

    var allowed = Math.min(amount, Math.max(0, RULES.hometown.cap - Math.min(prior, RULES.hometown.cap)));
    var overCap = Math.max(0, amount - allowed);

    var dCredit = Math.max(0, after.credit - before.credit);
    var dLocal = Math.max(0, after.local - before.local);
    var dTotal = dCredit + dLocal;
    var gift = Math.floor(allowed * RULES.hometown.giftRate);

    var cap = incomeTax > 0 ? incomeTax : Infinity;
    var appliedCredit = Math.min(dCredit, Math.max(0, cap - Math.min(before.credit, cap)));
    var appliedLocal = Math.floor(appliedCredit * RULES.localTaxRate);
    var applied = appliedCredit + appliedLocal;
    var lost = Math.max(0, dTotal - applied);
    var capped = lost > 0;

    var net = applied + gift - amount;
    var netWithoutGift = applied - amount;

    /* 특별재난지역 여부에 따른 차액 (이번 기부분 기준) */
    var dNormal = Math.max(0, hometownCredit(prior + amount, false).credit - hometownCredit(prior, false).credit);
    var dDisaster = Math.max(0, hometownCredit(prior + amount, true).credit - hometownCredit(prior, true).credit);
    var alt = hometownCredit(prior + amount, !disaster);

    return {
      amount: amount,
      prior: prior,
      cumulative: prior + amount,
      allowed: allowed,
      overCap: overCap,
      disaster: disaster,
      before: before,
      after: after,
      credit: dCredit,
      local: dLocal,
      total: dTotal,
      effective: amount > 0 ? dTotal / amount : 0,
      gift: gift,
      giftRate: RULES.hometown.giftRate,
      applied: applied,
      appliedCredit: appliedCredit,
      capped: capped,
      lost: lost,
      incomeTax: incomeTax,
      net: net,
      netWithoutGift: netWithoutGift,
      netRate: amount > 0 ? net / amount : 0,
      disasterGain: Math.max(0, dDisaster - dNormal),
      disasterTotal: alt.total,
      capLeft: Math.max(0, RULES.hometown.cap - Math.min(prior + amount, RULES.hometown.cap)),
      capUsedRate: Math.min(1, (prior + amount) / RULES.hometown.cap),
      annualCredit: after.credit,
      annualTotal: after.total,
      scale: [100000, 200000, 300000, 500000, 1000000, 2000000, 5000000, 10000000, 20000000]
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 4. 정치자금·특례·일반 기부금 (탭 2)
   * ──────────────────────────────────────────────────────────── */
  function politicalCredit(amount) {
    var a = Math.max(0, num(amount));
    var b1 = Math.min(a, RULES.political.first);
    var b2 = Math.max(0, Math.min(a, RULES.political.high) - RULES.political.first);
    var b3 = Math.max(0, a - RULES.political.high);
    var r1 = b1 * RULES.political.firstRate;
    var r2 = b2 * RULES.political.rate;
    var r3 = b3 * RULES.political.highRate;
    var credit = Math.floor(r1 + r2 + r3);
    return {
      amount: a,
      credit: credit,
      local: Math.floor(credit * RULES.localTaxRate),
      total: credit + Math.floor(credit * RULES.localTaxRate),
      bands: [
        { label: "10만원 이하", base: b1, rate: RULES.political.firstRate, text: "100/110", credit: Math.floor(r1) },
        { label: "10만~3,000만원", base: b2, rate: RULES.political.rate, text: "15%", credit: Math.floor(r2) },
        { label: "3,000만원 초과", base: b3, rate: RULES.political.highRate, text: "25%", credit: Math.floor(r3) }
      ]
    };
  }

  /** 특례·일반·종교단체를 합친 15%/30% 세액공제 (한도 안에서 인정된 금액 기준) */
  function poolCredit(pool) {
    var p = Math.max(0, num(pool));
    var low = Math.min(p, RULES.general.threshold);
    var high = Math.max(0, p - RULES.general.threshold);
    var credit = Math.floor(low * RULES.general.lowRate + high * RULES.general.highRate);
    return {
      pool: p,
      low: low,
      high: high,
      credit: credit,
      local: Math.floor(credit * RULES.localTaxRate),
      total: credit + Math.floor(credit * RULES.localTaxRate)
    };
  }

  /**
   * allDonations(o)
   *  o = { salary, dependents, income (직접 입력 시), political, hometown, special, general, religion, disaster }
   *  - salary   : 총급여 (근로소득금액 자동 계산)
   *  - income   : 소득금액 직접 입력 (0이면 salary로 계산)
   *  - political: 정치자금기부금
   *  - hometown : 고향사랑기부금 (연 2,000만원 한도)
   *  - special  : 특례기부금
   *  - general  : 일반기부금(종교단체 외)
   *  - religion : 종교단체기부금
   */
  function allDonations(o) {
    o = o || {};
    var salary = Math.max(0, num(o.salary));
    var income = Math.max(0, num(o.income)) || earnedIncome(salary);
    var disaster = !!o.disaster;

    var amounts = {
      political: Math.max(0, num(o.political)),
      hometown: Math.max(0, num(o.hometown)),
      special: Math.max(0, num(o.special)),
      general: Math.max(0, num(o.general)),
      religion: Math.max(0, num(o.religion))
    };

    /* ① 정치자금: 근로소득금액 한도, 본인 기부만 */
    var politicalAllowed = Math.min(amounts.political, income);
    var political = politicalCredit(politicalAllowed);
    var politicalOver = Math.max(0, amounts.political - politicalAllowed);
    var remaining = Math.max(0, income - politicalAllowed);

    /* ② 고향사랑: 연 2,000만원, 남은 소득금액 범위 */
    var hometownAllowed = Math.min(amounts.hometown, RULES.hometown.cap, remaining);
    var hometown = hometownCredit(hometownAllowed, disaster);
    var hometownOver = Math.max(0, amounts.hometown - hometownAllowed);
    remaining -= hometownAllowed;

    /* ③ 특례: 소득금액 한도 */
    var specialAllowed = Math.min(amounts.special, remaining);
    var specialOver = Math.max(0, amounts.special - specialAllowed);
    remaining -= specialAllowed;

    /* ④ 일반 + 종교단체: 남은 소득금액 기준 한도 */
    var base = remaining;
    var religionGiven = amounts.religion;
    var limit;
    if (religionGiven > 0) {
      limit = base * RULES.general.religionLimitRate +
        Math.min(base * RULES.general.religionExtraRate, amounts.general);
    } else {
      limit = base * RULES.general.limitRate;
    }
    var generalAllowed = Math.min(amounts.general, limit);
    var religionAllowed = Math.min(amounts.religion, Math.max(0, limit - generalAllowed));
    var generalTotal = amounts.general + amounts.religion;
    var generalAllowedTotal = generalAllowed + religionAllowed;
    var generalOver = Math.max(0, generalTotal - generalAllowedTotal);

    var pool = poolCredit(specialAllowed + generalAllowedTotal);

    var types = [
      {
        key: "political", amount: amounts.political, limit: income, limitLabel: "소득금액",
        allowed: politicalAllowed, over: politicalOver, credit: political.credit,
        local: political.local, total: political.total, carry: false,
        note: politicalOver > 0 ? "한도 초과분은 공제 불가" : "본인 기부만 공제"
      },
      {
        key: "hometown", amount: amounts.hometown, limit: RULES.hometown.cap, limitLabel: "연 2,000만원",
        allowed: hometownAllowed, over: hometownOver, credit: hometown.credit,
        local: hometown.local, total: hometown.total, carry: false,
        note: hometownOver > 0 ? "연 한도 초과분은 공제 불가" : "이월 불가"
      },
      {
        key: "special", amount: amounts.special, limit: income, limitLabel: "소득금액",
        allowed: specialAllowed, over: specialOver,
        credit: 0, local: 0, total: 0, carry: true,
        note: specialOver > 0 ? "한도 초과분은 10년 이월" : "10년 이월 가능"
      },
      {
        key: "general", amount: amounts.general, limit: Math.max(0, limit - religionAllowed), limitLabel: "일반 한도",
        allowed: generalAllowed, over: Math.max(0, amounts.general - generalAllowed),
        credit: 0, local: 0, total: 0, carry: true,
        note: "종교단체 외 기부금"
      },
      {
        key: "religion", amount: amounts.religion, limit: Math.max(0, limit - generalAllowed), limitLabel: "일반 한도 잔여",
        allowed: religionAllowed, over: Math.max(0, amounts.religion - religionAllowed),
        credit: 0, local: 0, total: 0, carry: true,
        note: religionGiven > 0 ? "종교단체 기부가 있으면 기본 한도가 10%로 낮아짐" : "종교단체 기부 없음"
      }
    ];

    /* 특례·일반·종교단체는 15%/30% 풀에서 계산 — 표에는 몫을 나눠 표시 */
    var poolBase = specialAllowed + generalAllowedTotal;
    var lowPart = Math.min(poolBase, RULES.general.threshold);
    var highPart = Math.max(0, poolBase - RULES.general.threshold);
    function shareCredit(part) {
      if (poolBase <= 0) return 0;
      var lowShare = lowPart * (part / poolBase) * RULES.general.lowRate;
      var highShare = highPart * (part / poolBase) * RULES.general.highRate;
      return Math.floor(lowShare + highShare);
    }
    types.forEach(function (t) {
      if (t.key === "special" || t.key === "general" || t.key === "religion") {
        t.credit = shareCredit(t.allowed);
        t.local = Math.floor(t.credit * RULES.localTaxRate);
        t.total = t.credit + t.local;
      }
    });

    var totalCredit = political.credit + hometown.credit + pool.credit;
    var totalLocal = Math.floor(political.credit * RULES.localTaxRate) +
      Math.floor(hometown.credit * RULES.localTaxRate) + pool.local;
    var totalAmount = amounts.political + amounts.hometown + amounts.special + amounts.general + amounts.religion;
    var allowedTotal = politicalAllowed + hometownAllowed + specialAllowed + generalAllowedTotal;
    var overTotal = politicalOver + hometownOver + specialOver + generalOver;

    return {
      salary: salary,
      income: income,
      disaster: disaster,
      amounts: amounts,
      totalAmount: totalAmount,
      allowedTotal: allowedTotal,
      overTotal: overTotal,
      types: types,
      political: political,
      hometown: hometown,
      pool: pool,
      generalLimit: limit,
      generalBase: base,
      totalCredit: totalCredit,
      totalLocal: totalLocal,
      total: totalCredit + totalLocal,
      effective: totalAmount > 0 ? (totalCredit + totalLocal) / totalAmount : 0,
      carryTotal: specialOver + generalOver,
      lostTotal: politicalOver + hometownOver,
      order: ["political", "hometown", "special", "general", "religion"]
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 5. 결정세액 0원(면세점) 시뮬레이터 (탭 3)
   * ──────────────────────────────────────────────────────────── */
  /**
   * zeroPoint(o)
   *  o = { incomeTax, otherCredit, hometown, political, general, disaster }
   *  - incomeTax   : 종합소득산출세액 (결정세액 계산 전)
   *  - otherCredit : 근로소득세액공제·자녀세액공제·연금계좌·특별세액공제 등 이미 적용되는 세액공제 합계
   *  - general     : 특례·일반기부금 합계 (15%/30% 풀)
   *
   *  기타 세액공제를 먼저 반영한 뒤 남은 산출세액을 기부금 공제로 채우는 순서로 계산합니다.
   *  실제로는 세액공제 순서에 따라 어느 공제가 잘리는지가 달라질 수 있으나,
   *  총액과 이월 가능 여부(정치자금·고향사랑은 이월 불가)는 같습니다.
   */
  function zeroPoint(o) {
    o = o || {};
    var incomeTax = Math.max(0, num(o.incomeTax));
    var otherCredit = Math.min(Math.max(0, num(o.otherCredit)), incomeTax);
    var capacity = Math.max(0, incomeTax - otherCredit);

    var wanted = {
      political: politicalCredit(Math.max(0, num(o.political))),
      hometown: hometownCredit(Math.max(0, num(o.hometown)), !!o.disaster),
      pool: poolCredit(Math.max(0, num(o.general)))
    };
    var totalWanted = wanted.political.credit + wanted.hometown.credit + wanted.pool.credit;

    var left = capacity;
    function take(credit) {
      var use = Math.min(credit, left);
      left -= use;
      return Math.floor(use);
    }
    var appliedPolitical = take(wanted.political.credit);
    var appliedHometown = take(wanted.hometown.credit);
    var appliedPool = take(wanted.pool.credit);
    var appliedCredit = appliedPolitical + appliedHometown + appliedPool;
    var appliedLocal = Math.floor(appliedCredit * RULES.localTaxRate);
    var appliedTotal = appliedCredit + appliedLocal;

    var lostPolitical = wanted.political.credit - appliedPolitical;
    var lostHometown = wanted.hometown.credit - appliedHometown;
    var lostPool = wanted.pool.credit - appliedPool;

    var hometownAmount = Math.max(0, num(o.hometown));
    var gift = Math.floor(Math.min(hometownAmount, RULES.hometown.cap) * RULES.hometown.giftRate);

    var types = [
      { key: "political", name: "정치자금", wanted: wanted.political.credit, applied: appliedPolitical, lost: lostPolitical, carry: false },
      { key: "hometown", name: "고향사랑", wanted: wanted.hometown.credit, applied: appliedHometown, lost: lostHometown, carry: false },
      { key: "general", name: "특례·일반", wanted: wanted.pool.credit, applied: appliedPool, lost: lostPool, carry: true }
    ];

    var verdict;
    if (incomeTax <= 0) verdict = "no-tax";
    else if (capacity <= 0) verdict = "zero";
    else if (totalWanted > capacity) verdict = "partial";
    else verdict = "full";

    return {
      incomeTax: incomeTax,
      otherCredit: otherCredit,
      capacity: capacity,
      decidedTax: Math.max(0, incomeTax - otherCredit - appliedCredit),
      decidedBefore: Math.max(0, incomeTax - otherCredit),
      wanted: totalWanted,
      wantedLocal: Math.floor(totalWanted * RULES.localTaxRate),
      appliedCredit: appliedCredit,
      appliedLocal: appliedLocal,
      applied: appliedTotal,
      lost: lostPolitical + lostHometown + lostPool,
      lostLocal: Math.floor((lostPolitical + lostHometown + lostPool) * RULES.localTaxRate),
      lostCarryable: lostPool,
      lostGone: lostPolitical + lostHometown,
      types: types,
      gift: gift,
      net: appliedTotal + gift,
      verdict: verdict,
      hometownCredit: wanted.hometown.credit,
      politicalCredit: wanted.political.credit,
      poolCredit: wanted.pool.credit
    };
  }

  /** 결정세액(공제 여력)별로 이 기부가 실제로 돌려주는 금액 표 */
  function capacityTable(o) {
    o = o || {};
    var capacities = [0, 50000, 100000, 150000, 200000, 300000, 500000];
    var base = {
      incomeTax: 0, otherCredit: 0,
      hometown: o.hometown, political: o.political, general: o.general, disaster: o.disaster
    };
    return capacities.map(function (cap) {
      var r = zeroPoint(Object.assign({}, base, { incomeTax: cap }));
      return { capacity: cap, applied: r.applied, gift: r.gift, total: r.applied + r.gift, lost: r.lostGone };
    });
  }

  /* ────────────────────────────────────────────────────────────
   * 6. 내보내기
   * ──────────────────────────────────────────────────────────── */
  return {
    RULES: RULES,
    LIMITS: LIMITS,
    TYPES: TYPES,
    typeMeta: typeMeta,
    earnedDeduction: earnedDeduction,
    earnedIncome: earnedIncome,
    estimateTaxable: estimateTaxable,
    incomeTaxOf: incomeTaxOf,
    estimateIncomeTax: estimateIncomeTax,
    hometownCredit: hometownCredit,
    hometownPlan: hometownPlan,
    politicalCredit: politicalCredit,
    poolCredit: poolCredit,
    allDonations: allDonations,
    zeroPoint: zeroPoint,
    capacityTable: capacityTable
  };
});
