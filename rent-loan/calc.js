/*!
 * calc.js — 2026 전세·월세 전환율 · 월 주거비 비교 · 주담대 상환 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.RentCalc 로 노출합니다.
 *
 * 근거
 *  - 전월세 전환율 상한: 주택임대차보호법 제7조의2, 같은 법 시행령 제9조(시행 2026.7.1)
 *      · 연 1할(10%)과 「한국은행 기준금리 + 연 2%p」 중 낮은 비율
 *      · 한국은행 기준금리 3.25% (2026.11.26 금통위 인상) → 상한 5.25%
 *  - 시장 전환율: KB부동산 서울 아파트 4.31%(2026.10), 서울시 4.5%(2026년 3분기),
 *      한국부동산원 전국 주택 6.6%(2025.12), HUG 전세보증 기준 6.4%(2026.1.30부터)
 *  - 버팀목 전세자금대출: 주택도시기금 상품안내(2026.10.19 시행) 소득·보증금별 금리표,
 *      수도권 호당 1억 2,000만원(보증금 70%), 지방 8,000만원, 순자산 3억 4,500만원 이하
 *  - 시중 전세자금대출 4.63%·주택담보대출 4.98%: 한국은행 「금융시장 동향」 2026.10
 *      예금은행 신규취급액 기준 평균금리
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-26';

  /* ── 기준값 ───────────────────────────────────────────────── */
  var RATE = {
    bokBase: 3.25,          // 한국은행 기준금리 (2026-11-26)
    legalAdd: 2.0,          // 주택임대차보호법 시행령 제9조 제2항
    legalMax: 10.0,         // 같은 영 제9조 제1항 (연 1할)
    bankJeonse: 4.63,       // 은행권 전세자금대출 신규취급 평균 (2026.10)
    mortgage: 4.98,         // 은행권 주택담보대출 신규취급 평균 (2026.10)
    deposit: 3.0            // 자기자본 기회비용 기본 가정 (사용자 입력값)
  };

  var MARKET_RATES = [
    { id: 'seoul-apt', label: '서울 아파트', value: 4.31, note: 'KB부동산 2026.10' },
    { id: 'seoul', label: '서울 전체', value: 4.5, note: '서울시 2026년 3분기' },
    { id: 'hug', label: 'HUG 전세보증', value: 6.4, note: '2026.1.30부터' },
    { id: 'national', label: '전국 주택', value: 6.6, note: '한국부동산원 2025.12' }
  ];

  /* 버팀목 전세자금대출 (주택도시기금, 2026.10.19 시행) */
  var BUTIMOK = {
    netAssetCap: 345000000,
    incomeCap: { general: 50000000, newlywed: 75000000 },
    depositCap: { general: { capital: 300000000, local: 200000000 },
                  newlywed: { capital: 400000000, local: 300000000 } },
    limit: { general: { capital: 120000000, local: 80000000 },
             newlywed: { capital: 250000000, local: 160000000 } },
    ratio: { general: 0.70, newlywed: 0.80 },
    floor: { general: 1.3, newlywed: 1.0 },
    localCut: 0.2,
    /* 보증금 구간: 5,000만 이하 / 5,000만~1억 / 1억~1.5억 / 1억 5,000만 초과 */
    general: [
      { max: 20000000, label: '2,000만원 이하', rates: [2.5, 2.6, 2.7, 2.7] },
      { max: 40000000, label: '2,000만~4,000만원', rates: [2.7, 2.8, 2.9, 2.9] },
      { max: 60000000, label: '4,000만~6,000만원', rates: [3.0, 3.1, 3.2, 3.2] },
      { max: Infinity, label: '6,000만~7,500만원', rates: [3.3, 3.4, 3.5, 3.5] }
    ],
    newlywed: [
      { max: 20000000, label: '2,000만원 이하', rates: [1.9, 2.0, 2.1, 2.2] },
      { max: 40000000, label: '2,000만~4,000만원', rates: [2.2, 2.3, 2.4, 2.5] },
      { max: 60000000, label: '4,000만~6,000만원', rates: [2.6, 2.7, 2.8, 2.9] },
      { max: Infinity, label: '6,000만~7,500만원', rates: [3.0, 3.1, 3.2, 3.3] }
    ]
  };

  var DEPOSIT_BANDS = [50000000, 100000000, 150000000, Infinity];
  var DEPOSIT_LABELS = ['5,000만원 이하', '5,000만~1억원', '1억~1억 5,000만원', '1억 5,000만원 초과'];

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
     1. 전월세 전환 (법정 전환율 · 시장 전환율)
     ══════════════════════════════════════════════════════════ */

  /** 법정 전환율 상한 = min(10%, 기준금리 + 2%p) */
  function legalInfo(baseRate) {
    var base = num(baseRate, RATE.bokBase);
    var byBase = base + RATE.legalAdd;
    return {
      base: base,
      add: RATE.legalAdd,
      byBase: byBase,
      legalMax: RATE.legalMax,
      rate: Math.min(RATE.legalMax, byBase),
      limitedByBase: byBase <= RATE.legalMax
    };
  }

  /**
   * 전세 → 월세
   * 월세 = (전세보증금 − 남길 보증금) × 전환율 ÷ 12
   */
  function monthlyFromJeonse(jeonse, deposit, rate) {
    var diff = Math.max(0, num(jeonse, 0) - num(deposit, 0));
    return diff * Math.max(0, num(rate, 0)) / 100 / 12;
  }

  /**
   * 월세 → 전세
   * 전세보증금 = 월세보증금 + 월세 × 12 ÷ 전환율
   * 전환율이 0이면 계산할 수 없으므로 null
   */
  function jeonseFromMonthly(deposit, monthly, rate) {
    var r = Math.max(0, num(rate, 0));
    if (r === 0) return null;
    return num(deposit, 0) + Math.max(0, num(monthly, 0)) * 12 / (r / 100);
  }

  /**
   * 전환 계산 통합
   * input = { direction:'to-monthly'|'to-jeonse', jeonse, deposit, monthly, rate }
   * 반환: { direction, rate, converted, jeonse, deposit, monthly, diff }
   */
  function convert(input) {
    input = input || {};
    var direction = input.direction === 'to-jeonse' ? 'to-jeonse' : 'to-monthly';
    var rate = clamp(num(input.rate, 0), 0, 100);
    var deposit = Math.max(0, num(input.deposit, 0));
    if (direction === 'to-monthly') {
      var jeonse = Math.max(0, num(input.jeonse, 0));
      var diff = Math.max(0, jeonse - deposit);
      return {
        direction: direction,
        rate: rate,
        jeonse: jeonse,
        deposit: deposit,
        diff: diff,
        monthly: monthlyFromJeonse(jeonse, deposit, rate),
        converted: monthlyFromJeonse(jeonse, deposit, rate)
      };
    }
    var monthly = Math.max(0, num(input.monthly, 0));
    var total = jeonseFromMonthly(deposit, monthly, rate);
    return {
      direction: direction,
      rate: rate,
      jeonse: total,
      deposit: deposit,
      diff: total === null ? 0 : Math.max(0, total - deposit),
      monthly: monthly,
      converted: total
    };
  }

  /**
   * 법정 상한 검사
   * input = { jeonse, deposit, monthly, rate }
   * 반환: { legalRate, legalMonthly, over, overMonthly, overAnnual, rate, monthly }
   */
  function legalCheck(input) {
    input = input || {};
    var info = legalInfo(input.baseRate);
    var jeonse = Math.max(0, num(input.jeonse, 0));
    var deposit = Math.max(0, num(input.deposit, 0));
    var diff = Math.max(0, jeonse - deposit);
    var legalMonthly = diff * info.rate / 100 / 12;
    var monthly = Math.max(0, num(input.monthly, 0));
    var overMonthly = Math.max(0, monthly - legalMonthly);
    return {
      legalRate: info.rate,
      legalMonthly: legalMonthly,
      monthly: monthly,
      over: overMonthly > 0.5,
      overMonthly: overMonthly,
      overAnnual: overMonthly * 12,
      diff: diff
    };
  }

  /**
   * 전환율별 월세 표
   * rates 를 넘기지 않으면 법정 상한과 시장 전환율을 섞어 만듭니다.
   */
  function conversionTable(jeonse, deposit, rates) {
    var diff = Math.max(0, num(jeonse, 0) - num(deposit, 0));
    var list = rates && rates.length ? rates : [4.0, 4.5, legalInfo().rate, 5.5, 6.0, 6.6];
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = Math.round(num(list[i], 0) * 100) / 100;
      if (r <= 0 || seen[r]) continue;
      seen[r] = true;
      out.push({
        rate: r,
        monthly: diff * r / 100 / 12,
        annual: diff * r / 100
      });
    }
    out.sort(function (a, b) { return a.rate - b.rate; });
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     2. 버팀목 전세자금대출
     ══════════════════════════════════════════════════════════ */

  function depositIndex(deposit) {
    var d = Math.max(0, num(deposit, 0));
    for (var i = 0; i < DEPOSIT_BANDS.length; i++) {
      if (d <= DEPOSIT_BANDS[i]) return i;
    }
    return DEPOSIT_BANDS.length - 1;
  }

  function incomeBand(income, bands) {
    var inc = Math.max(0, num(income, 0));
    for (var i = 0; i < bands.length; i++) {
      if (inc <= bands[i].max) return bands[i];
    }
    return null;
  }

  /**
   * 버팀목 금리·한도
   * input = { income, deposit, capitalArea, newlywed, netAssets }
   * 반환: { rate, band, depositBand, cap, limit, byRatio, incomeCap, depositCap,
   *         eligible, reasons[] }
   */
  function butimok(input) {
    input = input || {};
    var newlywed = !!input.newlywed;
    var capital = input.capitalArea !== false;
    var kind = newlywed ? 'newlywed' : 'general';
    var income = Math.max(0, num(input.income, 0));
    var deposit = Math.max(0, num(input.deposit, 0));
    var incomeCap = BUTIMOK.incomeCap[kind];
    var depositCap = BUTIMOK.depositCap[kind][capital ? 'capital' : 'local'];
    var limit = BUTIMOK.limit[kind][capital ? 'capital' : 'local'];
    var byRatio = deposit * BUTIMOK.ratio[kind];
    var cap = Math.max(0, Math.min(limit, byRatio));
    var band = income <= incomeCap ? incomeBand(income, BUTIMOK[kind]) : null;
    var di = depositIndex(deposit);
    var rate = band ? band.rates[di] : null;
    if (rate !== null && !capital) rate = rate - BUTIMOK.localCut;
    if (rate !== null) rate = Math.max(BUTIMOK.floor[kind], Math.round(rate * 100) / 100);

    var reasons = [];
    if (income <= 0) reasons.push({ id: 'income', text: '연소득을 입력하면 금리를 찾아 드립니다.' });
    else if (income > incomeCap) {
      reasons.push({ id: 'income', text: '부부합산 연소득 ' + (incomeCap / 10000) + '만원을 넘어 일반 버팀목 대상이 아닙니다.' });
    }
    if (deposit > depositCap) {
      reasons.push({ id: 'deposit', text: '임차보증금 ' + (depositCap / 100000000) + '억원(' + (capital ? '수도권' : '지방') + ')을 넘습니다.' });
    }
    if (input.netAssets !== undefined && num(input.netAssets, 0) > BUTIMOK.netAssetCap) {
      reasons.push({ id: 'assets', text: '합산 순자산 3억 4,500만원을 넘습니다.' });
    }
    return {
      rate: rate,
      band: band,
      depositBand: DEPOSIT_LABELS[di],
      incomeCap: incomeCap,
      depositCap: depositCap,
      limit: limit,
      byRatio: byRatio,
      cap: cap,
      ratio: BUTIMOK.ratio[kind],
      eligible: reasons.length === 0 && rate !== null,
      reasons: reasons,
      kind: kind
    };
  }

  /* ══════════════════════════════════════════════════════════
     3. 전세 vs 월세 — 월 주거비와 손익분기
     ══════════════════════════════════════════════════════════ */

  /**
   * input = { jeonse, loan, loanRate, equityRate, monthlyDeposit, monthlyRent, months }
   *  - 전세: 대출 이자 + 자기자본(보증금−대출)의 기회비용
   *  - 월세: 월세 + 월세보증금의 기회비용
   *  - diff > 0 이면 전세가 더 저렴(월세가 비쌈)
   */
  function compareHousing(input) {
    input = input || {};
    var jeonse = Math.max(0, num(input.jeonse, 0));
    var loan = clamp(num(input.loan, 0), 0, jeonse);
    var loanRate = clamp(num(input.loanRate, 0), 0, 30);
    var equityRate = clamp(num(input.equityRate, 0), 0, 30);
    var deposit = Math.max(0, num(input.monthlyDeposit, 0));
    var rent = Math.max(0, num(input.monthlyRent, 0));
    var months = clamp(round(num(input.months, 24)), 12, 120);

    var loanMonthly = loan * loanRate / 100 / 12;
    var equity = Math.max(0, jeonse - loan);
    var equityMonthly = equity * equityRate / 100 / 12;
    var jeonseMonthly = loanMonthly + equityMonthly;

    var depositCost = deposit * equityRate / 100 / 12;
    var rentMonthly = rent + depositCost;

    var diff = rentMonthly - jeonseMonthly;
    var diffCash = rent - loanMonthly;
    var gap = Math.max(0, jeonse - deposit);
    var breakEvenRate = gap > 0 ? jeonseMonthly * 12 / gap * 100 : null;
    var breakEvenRent = Math.max(0, jeonseMonthly - depositCost);
    var breakEvenLoanRate = loan > 0
      ? ((rentMonthly - equityRate / 100 / 12 * equity) * 12 / loan * 100)
      : null;

    return {
      jeonse: jeonse,
      loan: loan,
      equity: equity,
      loanRate: loanRate,
      equityRate: equityRate,
      deposit: deposit,
      rent: rent,
      months: months,
      loanMonthly: loanMonthly,
      equityMonthly: equityMonthly,
      jeonseMonthly: jeonseMonthly,
      depositCost: depositCost,
      rentMonthly: rentMonthly,
      diff: diff,
      diffCash: diffCash,
      annualDiff: diff * 12,
      totalDiff: diff * months,
      cheaper: Math.abs(diff) < 500 ? 'same' : (diff > 0 ? 'jeonse' : 'rent'),
      breakEvenRate: breakEvenRate,
      breakEvenRent: breakEvenRent,
      breakEvenLoanRate: breakEvenLoanRate,
      loanExceedsButimok: null
    };
  }

  /* ══════════════════════════════════════════════════════════
     4. 주담대 상환
     ══════════════════════════════════════════════════════════ */
  var METHOD_LABEL = {
    equal: '원리금균등',
    principal: '원금균등',
    interest: '만기일시(이자만)'
  };

  function monthlyRate(annualPercent) {
    return Math.max(0, num(annualPercent, 0)) / 100 / 12;
  }

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
   * 월별 상환 스케줄 + 연 단위 요약
   * input = { principal, rate, years, method }
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
      rows.push({ m: m, principal: principalPart, interest: interest, payment: pay, balance: bal });
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
   * 두 상환 방식 비교
   * 반환: { equal, principal, interestSaving, firstMonthDiff, sameTotal }
   */
  function methodCompare(principal, rate, years) {
    var eq = amortize({ principal: principal, rate: rate, years: years, method: 'equal' });
    var pr = amortize({ principal: principal, rate: rate, years: years, method: 'principal' });
    return {
      equal: eq,
      principal: pr,
      interestSaving: eq.totalInterest - pr.totalInterest,
      firstMonthDiff: pr.monthlyFirst - eq.monthlyFirst,
      lastMonthDiff: pr.monthlyLast - eq.monthlyLast
    };
  }

  /** DSR(참고) = 첫해 원리금 상환액 ÷ 연소득 × 100 */
  function dsr(firstYearPayment, income) {
    var inc = Math.max(0, num(income, 0));
    if (inc <= 0) return null;
    return Math.max(0, num(firstYearPayment, 0)) / inc * 100;
  }

  /** 원리금균등·원금균등 요약 (탭3 결과) */
  function loanSummary(input) {
    input = input || {};
    var method = METHOD_LABEL[input.method] && input.method !== 'interest' ? input.method : 'equal';
    var years = clamp(num(input.years, 30), 1, 50);
    var am = amortize({
      principal: input.principal, rate: input.rate, years: years, method: method
    });
    var cmp = methodCompare(input.principal, input.rate, years);
    return {
      summary: {
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
        dsr: dsr(am.firstYearPayment, input.income)
      },
      compare: {
        interestSaving: cmp.interestSaving,
        firstMonthDiff: cmp.firstMonthDiff,
        equalMonthly: cmp.equal.monthlyFirst,
        equalInterest: cmp.equal.totalInterest,
        principalMonthly: cmp.principal.monthlyFirst,
        principalInterest: cmp.principal.totalInterest
      },
      years: am.years,
      rows: am.rows
    };
  }

  root.RentCalc = {
    DATA_DATE: DATA_DATE,
    RATE: RATE,
    MARKET_RATES: MARKET_RATES,
    BUTIMOK: BUTIMOK,
    DEPOSIT_BANDS: DEPOSIT_BANDS,
    DEPOSIT_LABELS: DEPOSIT_LABELS,
    METHOD_LABEL: METHOD_LABEL,
    legalInfo: legalInfo,
    monthlyFromJeonse: monthlyFromJeonse,
    jeonseFromMonthly: jeonseFromMonthly,
    convert: convert,
    legalCheck: legalCheck,
    conversionTable: conversionTable,
    depositIndex: depositIndex,
    butimok: butimok,
    compareHousing: compareHousing,
    equalPayment: equalPayment,
    amortize: amortize,
    methodCompare: methodCompare,
    dsr: dsr,
    loanSummary: loanSummary,
    num: num,
    clamp: clamp,
    round: round
  };
})(typeof window !== 'undefined' ? window : this);
