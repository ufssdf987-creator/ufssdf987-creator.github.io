/*!
 * calc.js — 청약 가점(84점) · 신생아 특례대출 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.HousingCalc 로 노출합니다.
 *
 * 근거
 *  - 청약 가점: 「주택공급에 관한 규칙」 별표 1, 청약홈 가점계산 안내 (2026년 현행)
 *  - 가점제·추첨제 비율: 같은 규칙 제28조
 *  - 신생아 특례대출: 주택도시기금 신생아 특례 디딤돌·버팀목 상품 안내 (2026년 공고)
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-26';

  /* ── 공통 유틸 ───────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }
  function round(n) {
    return Math.round(n);
  }

  /* ══════════════════════════════════════════════════════════
     1. 청약 가점 (84점 만점)
     ══════════════════════════════════════════════════════════ */
  var SCORE_MAX = { house: 32, family: 35, account: 17, total: 84 };

  /**
   * 무주택기간 점수 (0·2·4 … 32점)
   *  - 유주택 세대이거나 만 30세 미만 미혼이면 0점
   *  - 1년 미만 2점, 1년마다 2점, 15년 이상 32점
   */
  function houseScore(years, opts) {
    opts = opts || {};
    if (opts.ownsHome || opts.under30Single) return 0;
    var y = Math.max(0, num(years, 0));
    if (y < 1) return 2;
    return Math.min(SCORE_MAX.house, 2 + 2 * Math.floor(y));
  }

  /** 부양가족수 점수 (0명 5점 ~ 6명 이상 35점) */
  function familyScore(count) {
    var n = clamp(Math.floor(num(count, 0)), 0, 6);
    return Math.min(SCORE_MAX.family, 5 + 5 * n);
  }

  /** 청약통장 가입기간 점수 (6개월 미만 1점 ~ 15년 이상 17점) */
  function accountScore(years) {
    var y = Math.max(0, num(years, 0));
    if (y < 0.5) return 1;
    if (y < 1) return 2;
    return Math.min(SCORE_MAX.account, 2 + Math.floor(y));
  }

  /** 배우자 통장 가산 (가입기간의 50%를 같은 표로 계산, 최대 3점) */
  function spouseAccountBonus(years) {
    var y = Math.max(0, num(years, 0));
    if (y <= 0) return 0;
    return Math.min(3, accountScore(y / 2));
  }

  /**
   * 가점 총점
   * input = { houseYears, dependents, accountYears, spouseYears, ownsHome, under30Single }
   */
  function subscriptionScore(input) {
    input = input || {};
    var house = houseScore(input.houseYears, {
      ownsHome: !!input.ownsHome,
      under30Single: !!input.under30Single
    });
    var family = familyScore(input.dependents);
    var base = accountScore(input.accountYears);
    var bonus = spouseAccountBonus(input.spouseYears);
    var account = Math.min(SCORE_MAX.account, base + bonus);
    return {
      house: house,
      family: family,
      account: account,
      accountBase: base,
      spouseBonus: Math.min(bonus, Math.max(0, SCORE_MAX.account - base)),
      total: house + family + account,
      max: SCORE_MAX,
      percent: Math.round((house + family + account) / SCORE_MAX.total * 1000) / 10
    };
  }

  /** 1년 뒤 예상 가점 (같은 조건에서 기간만 1년 늘었을 때) */
  function nextYearScore(input) {
    input = input || {};
    return subscriptionScore({
      houseYears: num(input.houseYears, 0) + 1,
      dependents: input.dependents,
      accountYears: num(input.accountYears, 0) + 1,
      spouseYears: num(input.spouseYears, 0) + (num(input.spouseYears, 0) > 0 ? 1 : 0),
      ownsHome: !!input.ownsHome,
      under30Single: !!input.under30Single
    });
  }

  /* ══════════════════════════════════════════════════════════
     2. 신생아 특례대출 조건
     ══════════════════════════════════════════════════════════ */
  var LOAN = {
    incomeCap: 130000000,      // 부부합산 1억 3천만원
    dualIncomeCap: 200000000,  // 맞벌이 합산 2억원
    perPersonCap: 130000000,   // 맞벌이 각자 1억 3천만원
    netAssetCap: { buy: 511000000, rent: 345000000 },
    mainLimit: { buy: 400000000, rent: 240000000 },
    priceCap: 900000000,       // 구입 대상 주택 평가액
    depositCap: { capital: 500000000, local: 400000000 },
    ltv: { base: 0.70, first: 0.80 },
    dti: 0.60,
    rentRatio: 0.80,           // 전세는 보증금의 80% 이내
    terms: [10, 15, 20, 30],
    rentTerms: [2, 4, 6, 8, 10, 12],
    specialYears: { buy: 5, rent: 4 },
    floorRate: { buy: 1.2, rent: 1.0 },
    localDiscount: 0.2,
    maxExtraDiscount: 0.5
  };

  /* 구입자금(디딤돌) 특례금리 — 부부합산 소득 × 만기 (2026년 공고) */
  var BUY_BANDS = [
    { max: 20000000,  label: '2,000만원 이하',    dual: false, rates: [1.80, 1.90, 2.00, 2.05] },
    { max: 40000000,  label: '2,000만~4,000만원', dual: false, rates: [2.15, 2.25, 2.35, 2.40] },
    { max: 60000000,  label: '4,000만~6,000만원', dual: false, rates: [2.40, 2.50, 2.60, 2.65] },
    { max: 85000000,  label: '6,000만~8,500만원', dual: false, rates: [2.65, 2.75, 2.85, 2.90] },
    { max: 100000000, label: '8,500만~1억원',     dual: false, rates: [2.90, 3.00, 3.10, 3.20] },
    { max: 130000000, label: '1억~1억 3,000만원', dual: false, rates: [3.20, 3.30, 3.40, 3.50] },
    { max: 150000000, label: '맞벌이 1억 3,000만~1억 5,000만원', dual: true, rates: [3.50, 3.60, 3.70, 3.80] },
    { max: 170000000, label: '맞벌이 1억 5,000만~1억 7,000만원', dual: true, rates: [3.85, 3.95, 4.05, 4.15] },
    { max: 200000000, label: '맞벌이 1억 7,000만~2억원', dual: true, rates: [4.20, 4.30, 4.40, 4.50] }
  ];

  /* 전세자금(버팀목) 특례금리 — 소득 × 보증금 (2026년 공고) */
  var RENT_BANDS = [
    { max: 20000000,  label: '2,000만원 이하',    dual: false, rates: [1.30, 1.40, 1.50, 1.60] },
    { max: 40000000,  label: '2,000만~4,000만원', dual: false, rates: [1.60, 1.70, 1.80, 1.90] },
    { max: 60000000,  label: '4,000만~6,000만원', dual: false, rates: [1.90, 2.00, 2.10, 2.20] },
    { max: 75000000,  label: '6,000만~7,500만원', dual: false, rates: [2.20, 2.30, 2.40, 2.50] },
    { max: 100000000, label: '7,500만~1억원',     dual: false, rates: [2.55, 2.65, 2.75, 2.85] },
    { max: 130000000, label: '1억~1억 3,000만원', dual: false, rates: [2.90, 3.00, 3.10, 3.20] },
    { max: 150000000, label: '맞벌이 1억 3,000만~1억 5,000만원', dual: true, rates: [3.25, 3.35, 3.45, 3.55] },
    { max: 170000000, label: '맞벌이 1억 5,000만~1억 7,000만원', dual: true, rates: [3.60, 3.70, 3.80, 3.90] },
    { max: 200000000, label: '맞벌이 1억 7,000만~2억원', dual: true, rates: [4.00, 4.10, 4.20, 4.30] }
  ];

  var DEPOSIT_BANDS = [50000000, 100000000, 150000000, Infinity];
  var DEPOSIT_LABELS = ['5,000만원 이하', '5,000만~1억원', '1억~1억 5,000만원', '1억 5,000만원 초과'];

  function findBand(bands, income, dual) {
    var inc = Math.max(0, num(income, 0));
    if (inc > LOAN.dualIncomeCap) return null;
    if (inc <= LOAN.incomeCap) {
      for (var i = 0; i < bands.length; i++) {
        if (inc <= bands[i].max) return bands[i];
      }
      return null;
    }
    if (!dual) return null;
    for (var j = 0; j < bands.length; j++) {
      if (bands[j].dual && inc <= bands[j].max) return bands[j];
    }
    return null;
  }

  function depositIndex(deposit) {
    var d = Math.max(0, num(deposit, 0));
    for (var i = 0; i < DEPOSIT_BANDS.length; i++) {
      if (d <= DEPOSIT_BANDS[i]) return i;
    }
    return DEPOSIT_BANDS.length - 1;
  }

  /**
   * 특례 기본금리 조회
   * input = { product:'buy'|'rent', income, dual, term, deposit }
   * 반환: { rate, band, termIndex, depositIndex, label }
   */
  function baseRate(input) {
    input = input || {};
    var product = input.product === 'rent' ? 'rent' : 'buy';
    var income = num(input.income, 0);
    var dual = !!input.dual;
    var band = findBand(product === 'rent' ? RENT_BANDS : BUY_BANDS, income, dual);
    if (!band) {
      return { rate: null, band: null, reason: dual ? '합산 2억원 초과' : '부부합산 1억 3,000만원 초과' };
    }
    if (product === 'rent') {
      var di = depositIndex(input.deposit);
      return {
        rate: band.rates[di],
        band: band,
        label: band.label,
        depositIndex: di,
        depositLabel: DEPOSIT_LABELS[di]
      };
    }
    var ti = LOAN.terms.indexOf(Math.round(num(input.term, 30)));
    if (ti < 0) ti = LOAN.terms.length - 1;
    return { rate: band.rates[ti], band: band, label: band.label, termIndex: ti, term: LOAN.terms[ti] };
  }

  /**
   * 우대·감면 반영 금리
   * opt = { local:boolean, extraPp:number }
   */
  function finalRate(productR, base, opt) {
    opt = opt || {};
    var p = productR === 'rent' ? 'rent' : 'buy';
    if (base == null || !isFinite(base)) return null;
    var cut = 0;
    if (opt.local) cut += LOAN.localDiscount;
    cut += clamp(num(opt.extraPp, 0), 0, LOAN.maxExtraDiscount);
    var r = base - cut;
    return Math.max(LOAN.floorRate[p], Math.round(r * 1000) / 1000);
  }

  /**
   * 자가진단
   * input = { product, income, spouseIncome, dual, netAssets, price, capitalArea,
   *           newbornWithin2y, noHome }
   */
  function eligibility(input) {
    input = input || {};
    var product = input.product === 'rent' ? 'rent' : 'buy';
    var income = Math.max(0, num(input.income, 0));
    var spouse = input.dual ? Math.max(0, num(input.spouseIncome, 0)) : 0;
    var combined = income + spouse;
    var cap = input.dual ? LOAN.dualIncomeCap : LOAN.incomeCap;
    var eachMax = Math.max(income, spouse);
    var price = Math.max(0, num(input.price, 0));
    var assets = Math.max(0, num(input.netAssets, 0));
    var checks = [];

    checks.push({
      id: 'newborn',
      label: '출산·입양 2년 이내',
      pass: !!input.newbornWithin2y,
      value: input.newbornWithin2y ? '해당' : '해당 없음',
      note: '대출 접수일 기준 2년 내 출산·입양 (2023.1.1 이후 출생아, 태아 제외)'
    });
    checks.push({
      id: 'nohome',
      label: '무주택 세대주',
      pass: !!input.noHome,
      value: input.noHome ? '해당' : '해당 없음',
      note: '세대원 전원 무주택. 분양권·입주권도 주택으로 봅니다(1주택자는 대환만)'
    });

    var incomePass = combined > 0 && combined <= cap && (!input.dual || eachMax <= LOAN.perPersonCap);
    var incomeNote = input.dual
      ? '맞벌이는 합산 2억원 이하이면서 각자 1억 3,000만원 이하여야 합니다'
      : '부부합산 1억 3,000만원 이하';
    if (input.dual && eachMax > LOAN.perPersonCap) {
      incomeNote = '한 사람 소득이 1억 3,000만원을 넘어 맞벌이 기준을 쓸 수 없습니다';
    }
    checks.push({
      id: 'income',
      label: '소득 기준',
      pass: incomePass,
      value: incomePass ? '충족' : '초과',
      note: incomeNote
    });

    var assetCap = LOAN.netAssetCap[product];
    checks.push({
      id: 'assets',
      label: '순자산 기준',
      pass: assets <= assetCap,
      value: assets <= assetCap ? '충족' : '초과',
      note: (product === 'buy' ? '구입 5억 1,100만원' : '전세 3억 4,500만원') + ' 이하 (2026년 기준)'
    });

    if (product === 'buy') {
      checks.push({
        id: 'price',
        label: '대상 주택',
        pass: price > 0 && price <= LOAN.priceCap,
        value: price > 0 && price <= LOAN.priceCap ? '충족' : '초과',
        note: '평가액 9억원 이하 · 전용 85㎡ 이하 (수도권 외 읍·면 100㎡)'
      });
    } else {
      var depCap = input.capitalArea ? LOAN.depositCap.capital : LOAN.depositCap.local;
      checks.push({
        id: 'deposit',
        label: '보증금 기준',
        pass: price > 0 && price <= depCap,
        value: price > 0 && price <= depCap ? '충족' : '초과',
        note: (input.capitalArea ? '수도권 5억원' : '수도권 외 4억원') + ' 이하 · 전용 85㎡ 이하'
      });
    }

    var failed = [];
    for (var i = 0; i < checks.length; i++) {
      if (!checks[i].pass) failed.push(checks[i].id);
    }
    return {
      ok: failed.length === 0,
      combinedIncome: combined,
      perPersonMax: eachMax,
      checks: checks,
      failed: failed
    };
  }

  /* ══════════════════════════════════════════════════════════
     3. 상환 계산
     ══════════════════════════════════════════════════════════ */
  var METHOD_LABEL = {
    equal: '원리금균등',
    principal: '원금균등',
    interest: '만기일시(이자만)'
  };

  function monthlyRate(annualPercent) {
    return Math.max(0, num(annualPercent, 0)) / 100 / 12;
  }

  /** 원리금균등 월 상환액 */
  function equalPayment(principal, annualPercent, months) {
    var P = Math.max(0, num(principal, 0));
    var n = Math.max(0, Math.round(num(months, 0)));
    if (n === 0) return 0;
    var r = monthlyRate(annualPercent);
    if (r === 0) return P / n;
    var f = Math.pow(1 + r, n);
    return P * r * f / (f - 1);
  }

  /**
   * 월별 상환 스케줄 (연 단위 요약 포함)
   * input = { principal, rate, years, method }
   * 반환: { months, monthlyFirst, monthlyLast, totalInterest, totalPayment,
   *         firstYearPayment, rows:[{m, principal, interest, payment, balance}], years:[...] }
   */
  function amortize(input) {
    input = input || {};
    var P = Math.max(0, num(input.principal, 0));
    var rate = Math.max(0, num(input.rate, 0));
    var years = clamp(num(input.years, 0), 0, 50);
    var n = Math.round(years * 12);
    var method = METHOD_LABEL[input.method] ? input.method : 'equal';
    var rows = [];
    if (n === 0 || P === 0) {
      return {
        principal: P, rate: rate, months: n, method: method,
        monthlyFirst: 0, monthlyLast: 0, totalInterest: 0, totalPayment: 0,
        firstYearPayment: 0, rows: [], years: []
      };
    }
    var r = monthlyRate(rate);
    var bal = P;
    var totalInterest = 0;
    var firstPay = 0;
    var lastPay = 0;
    var fixed = method === 'equal' ? equalPayment(P, rate, n) : 0;
    var fixedPrincipal = method === 'principal' ? P / n : 0;
    for (var m = 1; m <= n; m++) {
      var interest = bal * r;
      var principalPart;
      var pay;
      if (method === 'interest') {
        principalPart = m === n ? bal : 0;
        pay = interest + principalPart;
      } else if (method === 'principal') {
        principalPart = m === n ? bal : Math.min(fixedPrincipal, bal);
        pay = principalPart + interest;
      } else {
        pay = m === n ? bal + interest : fixed;
        principalPart = pay - interest;
        if (principalPart > bal) principalPart = bal;
        if (m === n) pay = principalPart + interest;
      }
      bal = Math.max(0, bal - principalPart);
      totalInterest += interest;
      if (m === 1) firstPay = pay;
      lastPay = pay;
      rows.push({
        m: m, principal: principalPart, interest: interest, payment: pay, balance: bal
      });
    }
    var yearRows = [];
    for (var y = 0; y * 12 < n; y++) {
      var slice = rows.slice(y * 12, y * 12 + 12);
      var pSum = 0, iSum = 0, paySum = 0;
      for (var k = 0; k < slice.length; k++) {
        pSum += slice[k].principal;
        iSum += slice[k].interest;
        paySum += slice[k].payment;
      }
      yearRows.push({
        year: y + 1, principal: pSum, interest: iSum, payment: paySum,
        balance: slice[slice.length - 1].balance
      });
    }
    var firstYearPayment = 0;
    for (var q = 0; q < Math.min(12, rows.length); q++) firstYearPayment += rows[q].payment;
    return {
      principal: P, rate: rate, months: n, method: method,
      monthlyFirst: firstPay, monthlyLast: lastPay,
      totalInterest: totalInterest, totalPayment: P + totalInterest,
      firstYearPayment: firstYearPayment,
      rows: rows, years: yearRows
    };
  }

  /**
   * DTI 60%로 빌릴 수 있는 최대 금액
   * annualBudget = 연소득 × 0.6
   */
  function maxLoanForDti(annualBudget, rate, years, method) {
    var budget = Math.max(0, num(annualBudget, 0));
    if (budget <= 0) return 0;
    var unit = amortize({ principal: 1000000, rate: rate, years: years, method: method });
    if (!unit.firstYearPayment) return 0;
    return budget * 1000000 / unit.firstYearPayment;
  }

  /**
   * 대출 한도 분해
   * input = { product, price, capitalArea, firstHome, income, rate, years, method }
   */
  function loanCap(input) {
    input = input || {};
    var product = input.product === 'rent' ? 'rent' : 'buy';
    var price = Math.max(0, num(input.price, 0));
    var limit = LOAN.mainLimit[product];
    var parts = [{ id: 'limit', label: product === 'buy' ? '상품 한도' : '상품 한도', amount: limit }];
    if (product === 'rent') {
      var byDeposit = price * LOAN.rentRatio;
      parts.push({ id: 'ratio', label: '보증금의 80%', amount: byDeposit });
      return {
        cap: Math.max(0, Math.min(limit, byDeposit)),
        parts: parts,
        ltv: null, dti: null
      };
    }
    var ltvRate = (input.firstHome && !input.capitalArea) ? LOAN.ltv.first : LOAN.ltv.base;
    var byLtv = price * ltvRate;
    var byDti = maxLoanForDti(Math.max(0, num(input.income, 0)) * LOAN.dti,
      num(input.rate, 0), clamp(num(input.years, 30), 1, 50), input.method);
    parts.push({ id: 'ltv', label: 'LTV ' + Math.round(ltvRate * 100) + '%', amount: byLtv });
    parts.push({ id: 'dti', label: 'DTI 60%', amount: byDti });
    return {
      cap: Math.max(0, Math.min(limit, byLtv, byDti)),
      parts: parts,
      ltvRate: ltvRate,
      byLtv: byLtv,
      byDti: byDti
    };
  }

  /**
   * 대출 요약
   * input = { product, principal, rate, years, method, income, specialYears, hikePp }
   */
  function loanSummary(input) {
    input = input || {};
    var product = input.product === 'rent' ? 'rent' : 'buy';
    var method = product === 'rent' ? 'interest' : (METHOD_LABEL[input.method] ? input.method : 'equal');
    var years = clamp(num(input.years, product === 'rent' ? 2 : 30), 1, 50);
    var am = amortize({
      principal: input.principal, rate: input.rate, years: years, method: method
    });
    var income = Math.max(0, num(input.income, 0));
    var dsr = income > 0 ? (am.firstYearPayment / income) * 100 : null;
    var specialYears = clamp(num(input.specialYears, LOAN.specialYears[product]), 0, years);
    var hike = num(input.hikePp, 1);
    var afterRate = Math.round((num(input.rate, 0) + hike) * 1000) / 1000;
    var remainMonths = Math.max(0, am.months - Math.round(specialYears * 12));
    var paid = am.rows.slice(0, am.months - remainMonths);
    var balance = paid.length ? paid[paid.length - 1].balance : am.principal;
    var afterMonthly = 0;
    var afterTotalInterest = 0;
    if (remainMonths > 0) {
      var after = amortize({
        principal: balance, rate: afterRate, years: remainMonths / 12, method: method
      });
      afterMonthly = after.monthlyFirst;
      afterTotalInterest = after.totalInterest;
    }
    return {
      summary: {
        product: product,
        method: method,
        methodLabel: METHOD_LABEL[method],
        years: years,
        months: am.months,
        rate: num(input.rate, 0),
        principal: am.principal,
        monthlyFirst: am.monthlyFirst,
        monthlyLast: am.monthlyLast,
        totalInterest: am.totalInterest,
        totalPayment: am.totalPayment,
        firstYearPayment: am.firstYearPayment,
        dsr: dsr,
        specialYears: specialYears,
        afterRate: afterRate,
        afterMonthly: afterMonthly,
        afterTotalInterest: afterTotalInterest,
        balanceAtSpecialEnd: balance
      },
      years: am.years,
      rows: am.rows
    };
  }

  root.HousingCalc = {
    DATA_DATE: DATA_DATE,
    SCORE_MAX: SCORE_MAX,
    LOAN: LOAN,
    BUY_BANDS: BUY_BANDS,
    RENT_BANDS: RENT_BANDS,
    DEPOSIT_BANDS: DEPOSIT_BANDS,
    DEPOSIT_LABELS: DEPOSIT_LABELS,
    METHOD_LABEL: METHOD_LABEL,
    houseScore: houseScore,
    familyScore: familyScore,
    accountScore: accountScore,
    spouseAccountBonus: spouseAccountBonus,
    subscriptionScore: subscriptionScore,
    nextYearScore: nextYearScore,
    findBand: findBand,
    baseRate: baseRate,
    finalRate: finalRate,
    eligibility: eligibility,
    loanCap: loanCap,
    equalPayment: equalPayment,
    amortize: amortize,
    maxLoanForDti: maxLoanForDti,
    loanSummary: loanSummary,
    num: num,
    clamp: clamp,
    round: round
  };
})(typeof window !== 'undefined' ? window : this);
