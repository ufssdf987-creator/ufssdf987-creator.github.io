/*!
 * calc.js — 2026 예금·적금 만기 이자 & 세후 수령액 · 비과세 비교 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.SavingsCalc 로 노출합니다.
 *
 * 근거 (2026년 기준)
 *  - 이자소득 원천징수: 소득세 14% + 지방소득세(소득세액의 10%) 1.4% = 15.4%
 *      소득세법 제129조제1항제1호라목, 지방세법 제103조의13
 *  - 세금우대 9.5%: 조세특례제한법 제89조(세금우대종합저축). 2014.12.31까지 가입분 유지,
 *      신규 가입은 중단된 제도입니다.
 *  - 농특세 1.4%: 조세특례제한법 제89조의3(농·수협 조합원 예탁금) — 소득세는 비과세이고
 *      농어촌특별세법에 따른 농특세 1.4%(지방소득세 포함 상당)만 부과됩니다.
 *  - 비과세 0%: 조세특례제한법 제88조의2(비과세종합저축). 1인 원금 5,000만원(전 금융기관 합산),
 *      2028.12.31까지 가입분. 2026.1.1 이후 가입분은 65세 이상 중 기초연금 수급자로 대상이 좁혀졌습니다.
 *  - ISA: 일반형 순이익 200만원·서민형(농어민형) 400만원까지 비과세, 초과분 9.9% 분리과세
 *      조세특례제한법 제91조의18
 *  - 금융소득종합과세 기준: 이자·배당 합계 연 2,000만원 (소득세법 제14조제3항제6호)
 *  - 예금자보호 한도: 1인당 1억원 (예금자보호법, 2025.9.1 시행)
 *
 * 계산식
 *  - 예금(거치식) 단리      : 이자 = 원금 × 연이율 × 개월/12
 *  - 예금(거치식) 월복리    : 이자 = 원금 × ((1 + 연이율/12)^개월 − 1)
 *  - 적금(적립식) 단리      : 이자 = 월납입액 × (연이율/12) × 개월×(개월+1)/2
 *  - 적금(적립식) 월복리    : 매달 초 납입 기준
 *      만기액 = 월납입액 × ((1+i)^n − 1)/i × (1+i),  i = 연이율/12
 *  - 세금 = 세전 이자 × 세율, 세후 이자 = 세전 이자 − 세금, 만기 수령액 = 원금 + 세후 이자
 *  - 원 단위는 반올림(은행의 10원 절사와 최대 몇 원 차이가 날 수 있음)
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-26';

  /* ── 과세 유형 ────────────────────────────────────────────── */
  var TAX = {
    general: {
      id: 'general', label: '일반과세', short: '15.4%', rate: 15.4,
      note: '이자소득세 14% + 지방소득세 1.4%'
    },
    preferential: {
      id: 'preferential', label: '세금우대', short: '9.5%', rate: 9.5,
      note: '세금우대종합저축 등 (2014.12.31까지 가입분 유지, 신규 가입 중단)'
    },
    farm: {
      id: 'farm', label: '농특세', short: '1.4%', rate: 1.4,
      note: '농·수협 조합원 예탁금 — 소득세는 비과세, 농특세만 부과'
    },
    none: {
      id: 'none', label: '비과세', short: '0%', rate: 0,
      note: '비과세종합저축 (1인 원금 5,000만원 한도)'
    }
  };
  var TAX_ORDER = ['general', 'preferential', 'farm', 'none'];

  var PRODUCT_LABEL = { installment: '적금', lump: '예금' };
  var METHOD_LABEL = { simple: '단리', compound: '월복리' };

  /* ── 제도 한도 ────────────────────────────────────────────── */
  var LIMIT = {
    months: { min: 1, max: 120 },
    rate: { min: 0, max: 30 },
    amount: { min: 0, max: 10000000000 },   // 100억원
    target: { min: 0, max: 100000000000 },  // 1,000억원
    taxFreePrincipal: 50000000,             // 비과세종합저축 1인 원금 5,000만원
    comprehensiveIncome: 20000000,          // 금융소득종합과세 2,000만원
    depositProtect: 100000000,              // 예금자보호 1억원
    isaGeneral: 2000000,                    // ISA 일반형 비과세 200만원
    isaSeomin: 4000000,                     // ISA 서민형·농어민형 비과세 400만원
    isaRate: 9.9                            // ISA 초과분 분리과세 9.9%
  };

  /* ── 공통 유틸 ───────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function won(n) { return Math.round(n); }

  function normalize(opts) {
    var o = opts || {};
    var product = o.product === 'lump' ? 'lump' : 'installment';
    var method = o.method === 'compound' ? 'compound' : 'simple';
    var taxId = TAX[o.tax] ? o.tax : 'general';
    var months = clamp(Math.round(num(o.months, 12)), LIMIT.months.min, LIMIT.months.max);
    var annualRate = clamp(num(o.annualRate, 3), LIMIT.rate.min, LIMIT.rate.max);
    var amount = clamp(num(o.amount, 0), LIMIT.amount.min, LIMIT.amount.max);
    return {
      product: product,
      productLabel: PRODUCT_LABEL[product],
      method: method,
      methodLabel: METHOD_LABEL[method],
      tax: taxId,
      taxLabel: TAX[taxId].label,
      taxShort: TAX[taxId].short,
      taxRate: TAX[taxId].rate,
      months: months,
      annualRate: annualRate,
      amount: amount
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 1. 세전 이자
   * ══════════════════════════════════════════════════════════ */
  function grossInterest(amount, months, annualRate, method, product) {
    var a = Math.max(0, num(amount, 0));
    var n = Math.max(0, Math.round(num(months, 0)));
    var r = Math.max(0, num(annualRate, 0)) / 100;
    if (a <= 0 || n <= 0 || r <= 0) return 0;
    var i = r / 12;

    if (product === 'lump') {
      if (method === 'compound') return a * Math.expm1(n * Math.log1p(i));
      return a * r * n / 12;
    }
    if (method === 'compound') {
      /* 매달 초 납입하는 적립식의 만기액 − 원금 */
      var fv = a * Math.expm1(n * Math.log1p(i)) / i * (1 + i);
      return fv - a * n;
    }
    return a * i * (n * (n + 1) / 2);
  }

  /* ══════════════════════════════════════════════════════════
   * 2. 만기 실수령액 (세후)
   * ══════════════════════════════════════════════════════════ */
  function calc(opts) {
    var o = normalize(opts);
    var monthly = o.product === 'installment' ? o.amount : 0;
    var rawPrincipal = o.product === 'installment' ? o.amount * o.months : o.amount;
    var principal = won(rawPrincipal);
    var gross = won(grossInterest(o.amount, o.months, o.annualRate, o.method, o.product));
    var taxAmount = won(gross * o.taxRate / 100);
    var netInterest = gross - taxAmount;
    var maturity = principal + netInterest;

    /* 일반과세 대비 아낀 세금 */
    var generalTax = won(gross * TAX.general.rate / 100);
    var taxSaved = generalTax - taxAmount;

    /* 원금 대비 연 단순 수익률(세후) */
    var effectiveRate = principal > 0 ? (netInterest / principal) * (12 / o.months) * 100 : 0;

    var taxFreeRoom = LIMIT.taxFreePrincipal - principal;

    return {
      product: o.product,
      productLabel: o.productLabel,
      method: o.method,
      methodLabel: o.methodLabel,
      tax: o.tax,
      taxLabel: o.taxLabel,
      taxShort: o.taxShort,
      taxRate: o.taxRate,
      taxNote: TAX[o.tax].note,
      amount: o.amount,
      monthly: monthly,
      months: o.months,
      annualRate: o.annualRate,
      principal: principal,
      grossInterest: gross,
      taxAmount: taxAmount,
      netInterest: netInterest,
      maturity: maturity,
      effectiveRate: effectiveRate,
      generalTax: generalTax,
      taxSaved: taxSaved,
      isTaxFree: o.tax === 'none',
      taxFreeRoom: taxFreeRoom,
      overTaxFreeLimit: o.tax === 'none' && taxFreeRoom < 0,
      overComprehensive: gross >= LIMIT.comprehensiveIncome,
      overProtect: principal > LIMIT.depositProtect
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 3. 과세 유형 4가지 비교
   * ══════════════════════════════════════════════════════════ */
  function taxTable(opts) {
    var base = normalize(opts);
    return TAX_ORDER.map(function (id) {
      var r = calc({
        product: base.product, amount: base.amount, months: base.months,
        annualRate: base.annualRate, method: base.method, tax: id
      });
      return {
        tax: id,
        label: TAX[id].label,
        short: TAX[id].short,
        rate: TAX[id].rate,
        note: TAX[id].note,
        grossInterest: r.grossInterest,
        taxAmount: r.taxAmount,
        netInterest: r.netInterest,
        maturity: r.maturity,
        saved: r.taxSaved
      };
    });
  }

  /* ══════════════════════════════════════════════════════════
   * 4. 예금 vs 적금 — 같은 총납입액·같은 금리
   * ══════════════════════════════════════════════════════════ */
  function compare(opts) {
    var o = opts || {};
    var total = clamp(num(o.total, 12000000), LIMIT.amount.min, LIMIT.amount.max);
    var months = clamp(Math.round(num(o.months, 12)), LIMIT.months.min, LIMIT.months.max);
    var annualRate = clamp(num(o.annualRate, 3), LIMIT.rate.min, LIMIT.rate.max);
    var method = o.method === 'compound' ? 'compound' : 'simple';
    var tax = TAX[o.tax] ? o.tax : 'general';
    var monthly = months > 0 ? total / months : 0;

    var lump = calc({ product: 'lump', amount: total, months: months, annualRate: annualRate, method: method, tax: tax });
    var installment = calc({
      product: 'installment', amount: monthly, months: months,
      annualRate: annualRate, method: method, tax: tax
    });

    var diff = lump.maturity - installment.maturity;
    var netDiff = lump.netInterest - installment.netInterest;

    return {
      total: total,
      months: months,
      annualRate: annualRate,
      method: method,
      methodLabel: METHOD_LABEL[method],
      tax: tax,
      taxLabel: TAX[tax].label,
      taxShort: TAX[tax].short,
      taxRate: TAX[tax].rate,
      monthly: monthly,
      monthlyRounded: won(monthly),
      lump: lump,
      installment: installment,
      diff: diff,
      netDiff: netDiff,
      winner: diff > 0 ? 'lump' : (diff < 0 ? 'installment' : 'same'),
      diffRate: lump.maturity > 0 ? (Math.abs(diff) / lump.maturity) * 100 : 0
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 5. 목표 목돈 역산 (세후 목표 기준)
   * ══════════════════════════════════════════════════════════ */
  function goal(opts) {
    var o = opts || {};
    var target = clamp(num(o.target, 10000000), LIMIT.target.min, LIMIT.target.max);
    var months = clamp(Math.round(num(o.months, 12)), LIMIT.months.min, LIMIT.months.max);
    var annualRate = clamp(num(o.annualRate, 3), LIMIT.rate.min, LIMIT.rate.max);
    var method = o.method === 'compound' ? 'compound' : 'simple';
    var taxId = TAX[o.tax] ? o.tax : 'general';
    var keep = 1 - TAX[taxId].rate / 100;   // 세후 이자 비율

    /* 1원당 세전 이자 = grossInterest(1, ...) */
    var perWonInstall = grossInterest(1, months, annualRate, method, 'installment');
    var perWonLump = grossInterest(1, months, annualRate, method, 'lump');

    /* 목표 = 원금 + (원금 × 1원당이자 × 세후비율) */
    var monthly = months > 0 ? target / (months + perWonInstall * keep) : 0;
    var lump = target / (1 + perWonLump * keep);

    var monthlyUp = Math.ceil(monthly / 10000) * 10000;
    var lumpUp = Math.ceil(lump / 10000) * 10000;

    var checkMonthly = calc({
      product: 'installment', amount: monthlyUp, months: months,
      annualRate: annualRate, method: method, tax: taxId
    });
    var checkLump = calc({
      product: 'lump', amount: lumpUp, months: months,
      annualRate: annualRate, method: method, tax: taxId
    });

    return {
      target: target,
      months: months,
      annualRate: annualRate,
      method: method,
      methodLabel: METHOD_LABEL[method],
      tax: taxId,
      taxLabel: TAX[taxId].label,
      taxShort: TAX[taxId].short,
      taxRate: TAX[taxId].rate,
      monthly: monthly,
      monthlyUp: monthlyUp,
      lump: lump,
      lumpUp: lumpUp,
      totalPaid: monthlyUp * months,
      grossNeededMonthly: monthlyUp * perWonInstall,
      checkMonthly: checkMonthly,
      checkLump: checkLump
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 6. 기간별 표 (예금 vs 적금 / 목표 역산)
   * ══════════════════════════════════════════════════════════ */
  var TABLE_MONTHS = [6, 12, 24, 36, 60];

  function compareTable(opts) {
    var o = opts || {};
    return TABLE_MONTHS.map(function (m) {
      var r = compare({
        total: o.total, months: m, annualRate: o.annualRate,
        method: o.method, tax: o.tax
      });
      return {
        months: m,
        lump: r.lump.maturity,
        installment: r.installment.maturity,
        diff: r.diff,
        monthly: r.monthlyRounded
      };
    });
  }

  function goalTable(opts) {
    var o = opts || {};
    return TABLE_MONTHS.map(function (m) {
      var g = goal({
        target: o.target, months: m, annualRate: o.annualRate,
        method: o.method, tax: o.tax
      });
      return {
        months: m,
        monthly: g.monthly,
        monthlyUp: g.monthlyUp,
        lump: g.lump,
        lumpUp: g.lumpUp
      };
    });
  }

  /* ══════════════════════════════════════════════════════════
   * 내보내기
   * ══════════════════════════════════════════════════════════ */
  var api = {
    DATA_DATE: DATA_DATE,
    TAX: TAX,
    TAX_ORDER: TAX_ORDER,
    PRODUCT_LABEL: PRODUCT_LABEL,
    METHOD_LABEL: METHOD_LABEL,
    LIMIT: LIMIT,
    TABLE_MONTHS: TABLE_MONTHS,
    normalize: normalize,
    grossInterest: grossInterest,
    calc: calc,
    taxTable: taxTable,
    compare: compare,
    goal: goal,
    compareTable: compareTable,
    goalTable: goalTable
  };

  root.SavingsCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
