/*!
 * calc.js — 2026 부가가치세(일반·간이과세) & 노란우산공제 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.VatBizCalc 로 노출합니다.
 *
 * 근거 (2026년 11월 기준)
 *  [일반과세자 부가가치세]
 *  - 세율: 부가가치세법 제30조. 일반세율 10%, 영세율 0%(수출 등).
 *    납부세액 = 매출세액(공급가액 × 10%) − 매입세액(공급가액 × 10%) − 공제세액.
 *  - 매입세액 불공제: 같은 법 제39조. 접대비, 비영업용 소형승용차의 구입·임차·유지비,
 *    면세사업 관련 매입, 토지 관련 매입, 사업자등록 신청 전 매입, 세금계산서 미교부분 등.
 *  - 과세기간: 같은 법 제5조. 제1기 1.1~6.30, 제2기 7.1~12.31.
 *    개인 일반과세자는 확정신고 7.25·다음 해 1.25, 4월·10월 예정고지(직전 납부세액의 50%).
 *    기한이 토·일·공휴일이면 다음 날(국세기본법 제5조). 2026년은 1기 확정 7.27,
 *    2기 예정고지 10.26, 2기 확정 2027.1.25.
 *  - 무신고가산세 20%(부정행위 40%), 납부지연가산세 하루 0.022%(국세기본법 제47조의2·제47조의4).
 *
 *  [간이과세자 부가가치세]
 *  - 적용 기준: 같은 법 제61조·시행령 제109조. 직전 연도 공급대가 합계액이 1억 400만원
 *    미만인 개인사업자(부동산임대업·과세유흥장소는 4,800만원 미만).
 *  - 과세표준: 같은 법 제63조제1항. 해당 과세기간 공급대가(부가세 포함) 합계액.
 *  - 납부세액: 같은 법 제63조제2항. 과세표준 × 업종별 부가가치율 × 10%.
 *  - 업종별 부가가치율: 같은 법 시행령 제111조제2항(2021.7.1 이후 공급분).
 *      소매업·재생용 재료수집 및 판매업·음식점업 15%, 제조업·농업·임업 및 어업·
 *      소화물 전문 운송업 20%, 숙박업 25%, 건설업·운수 및 창고업(소화물 전문 운송업 제외)·
 *      정보통신업 30%, 금융 및 보험 관련 서비스업·전문과학 및 기술서비스업(인물사진 및
 *      행사용 영상 촬영업 제외)·사업시설관리·사업지원 및 임대서비스업·부동산 관련 서비스업·
 *      부동산임대업 40%, 그 밖의 서비스업 30%.
 *    → 실효세율은 매출의 1.5%(15%×10%)~4%(40%×10%)입니다.
 *  - 매입세액 공제: 같은 법 제63조제3항. 세금계산서등을 발급받아 합계표·수령명세서를 내면
 *    공급대가의 0.5%를 납부세액에서 공제합니다.
 *  - 납부의무 면제: 같은 법 제69조제1항. 해당 과세기간 공급대가 합계액이 4,800만원 미만이면
 *    납부의무를 면제합니다(신고의무는 남습니다. 신규·휴업·폐업·과세유형 전환 시 12개월 환산).
 *  - 세금계산서 발급의무: 같은 법 제36조. 직전 연도 공급대가 4,800만원 이상인 간이과세자.
 *    그 미만이거나 신규 개업한 간이과세자는 세금계산서를 발급할 수 없고 영수증을 발급합니다.
 *  - 신고·납부: 과세기간 1.1~12.31, 다음 해 1.25까지 확정신고(폐업 시 폐업일이 속한 달의
 *    다음 달 25일). 상반기에 세금계산서를 발급했거나 7.1 일반과세로 전환되면 7.25까지
 *    예정신고·신고. 그 밖에는 7월 예정부과 고지.
 *
 *  [노란우산공제(소기업·소상공인 공제부금)]
 *  - 소득공제: 조세특례제한법 제86조의3제1항(법률 제20778호, 2025년 납입분부터).
 *      해당 연도 사업소득금액 4,000만원 이하 600만원, 4,000만원 초과 6,000만원 이하 500만원,
 *      6,000만원 초과 1억원 이하 400만원, 1억원 초과 200만원.
 *    부동산임대업 소득은 공제 대상에서 빠지고, 공제액은 (사업소득금액 − 임대소득금액)을
 *    넘을 수 없습니다. 법인 대표는 총급여 8,000만원 이하일 때 근로소득금액 기준입니다.
 *  - 납입한도: 같은 법 시행령 제80조의3(2026.7.1 이후 납입분부터) 연 1,800만원,
 *    월부금 5만원~150만원. 납입한도와 소득공제 한도는 다릅니다.
 *  - 과세: 폐업·노령(60세)·사망·장해로 받는 공제금은 퇴직소득으로 과세(실제 소득공제받은
 *    부금과 이자만), 중도해지 환급금은 기타소득세 16.5%. 공제금은 압류할 수 없습니다
 *    (같은 법 제86조의3제3항).
 *
 * 금액은 원 단위에서 버림하고, 모든 결과는 참고용 모의 계산입니다.
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-26';

  var LIMITS = {
    money: { min: 0, max: 100000000000 },     // 1,000억원
    payment: { min: 0, max: 18000000 },       // 노란우산 연 납입한도
    taxBase: { min: 0, max: 1000000000 },
    income: { min: 0, max: 1000000000 }
  };

  var VAT_RATE = 0.10;
  var SIMPLE_PURCHASE_CREDIT = 0.005;         // 간이과세 매입세액 0.5%
  var SIMPLE_ELIGIBLE = 104000000;            // 간이과세 적용 기준(직전연도 공급대가)
  var SIMPLE_ELIGIBLE_RENTAL = 48000000;      // 부동산임대업·과세유흥장소
  var INVOICE_REQUIRED = 48000000;            // 세금계산서 발급의무 기준(직전연도)
  var EXEMPT_BELOW = 48000000;                // 간이과세 납부의무 면제(해당 과세기간)
  var SOHO_PAYMENT_CAP = 18000000;            // 노란우산 연 납입한도(2026.7.1~)

  /* ── 공통 유틸 ───────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function floorWon(n) { return Math.floor(n + 1e-7); }
  function round(n) { return Math.round(n); }

  /* ── 업종별 부가가치율 (부가가치세법 시행령 제111조제2항) ── */
  var INDUSTRIES = {
    retail: {
      label: '소매업·음식점업',
      short: '소매·음식',
      rate: 0.15,
      note: '재생용 재료수집 및 판매업 포함'
    },
    manufacture: {
      label: '제조업·농림어업',
      short: '제조·농림',
      rate: 0.20,
      note: '소화물 전문 운송업 포함'
    },
    lodging: {
      label: '숙박업',
      short: '숙박',
      rate: 0.25,
      note: '숙박업 단일 업종'
    },
    construction: {
      label: '건설업·운수창고·정보통신업',
      short: '건설·운수',
      rate: 0.30,
      note: '소화물 전문 운송업은 제외'
    },
    service: {
      label: '그 밖의 서비스업',
      short: '기타 서비스',
      rate: 0.30,
      note: '위 업종에 들지 않는 서비스'
    },
    finance: {
      label: '금융·전문서비스·부동산임대업',
      short: '금융·전문·임대',
      rate: 0.40,
      note: '부동산임대업은 간이과세 기준 4,800만원'
    }
  };

  var INDUSTRY_ORDER = ['retail', 'manufacture', 'lodging', 'construction', 'service', 'finance'];

  /* ── 종합소득세 기본세율 (소득세법 제55조, 2023년 이후) ── */
  var BASIC_BRACKETS = [
    { upTo: 14000000, rate: 0.06, prog: 0 },
    { upTo: 50000000, rate: 0.15, prog: 1260000 },
    { upTo: 88000000, rate: 0.24, prog: 5760000 },
    { upTo: 150000000, rate: 0.35, prog: 15440000 },
    { upTo: 300000000, rate: 0.38, prog: 19940000 },
    { upTo: 500000000, rate: 0.40, prog: 25940000 },
    { upTo: 1000000000, rate: 0.42, prog: 35940000 },
    { upTo: Infinity, rate: 0.45, prog: 65940000 }
  ];

  function bracketOf(base) {
    for (var i = 0; i < BASIC_BRACKETS.length; i++) {
      if (base <= BASIC_BRACKETS[i].upTo) return BASIC_BRACKETS[i];
    }
    return BASIC_BRACKETS[BASIC_BRACKETS.length - 1];
  }

  /** 과세표준에 대한 종합소득세 산출세액(지방소득세 제외) */
  function basicTax(base) {
    var b = clamp(num(base, 0), 0, LIMITS.taxBase.max * 10);
    if (b <= 0) return 0;
    var br = bracketOf(b);
    return floorWon(Math.max(0, b * br.rate - br.prog));
  }

  /* ══════════════════════════════════════════════════════════
   * 1. 일반과세자 부가가치세
   * ══════════════════════════════════════════════════════════ */

  /**
   * 일반과세자 납부세액
   * @param {object} opts sales(매출 공급가액), purchases(매입 공급가액),
   *                      nonDeductible(매입세액 중 불공제액)
   */
  function general(opts) {
    var o = opts || {};
    var sales = clamp(num(o.sales, 0), 0, LIMITS.money.max);
    var purchases = clamp(num(o.purchases, 0), 0, LIMITS.money.max);
    var saleTax = floorWon(sales * VAT_RATE);
    var purchaseTax = floorWon(purchases * VAT_RATE);
    var nonDeductible = clamp(num(o.nonDeductible, 0), 0, purchaseTax);
    var deductible = Math.max(0, purchaseTax - nonDeductible);
    var balance = saleTax - deductible;
    var payable = Math.max(0, balance);
    var refund = Math.max(0, -balance);
    var purchaseRatio = sales > 0 ? purchases / sales : 0;
    var effective = sales > 0 ? balance / sales * 100 : 0;

    var notes = [];
    if (sales > 0 && balance < 0) {
      notes.push('매입세액이 매출세액보다 커서 ' + refund.toLocaleString('ko-KR') +
        '원이 환급되거나 다음 과세기간으로 이월됩니다. 조기환급은 신고 시 요건을 갖춰야 합니다.');
    }
    if (nonDeductible > 0) {
      notes.push('불공제 매입세액 ' + nonDeductible.toLocaleString('ko-KR') +
        '원은 접대비·비영업용 승용차 등으로 보아 공제하지 않았습니다.');
    }
    if (sales > 0 && purchaseRatio < 0.1 && saleTax > 0) {
      notes.push('매입 비중이 낮아 매출세액의 대부분을 납부합니다. 세금계산서를 빠뜨린 매입이 없는지 확인하세요.');
    }
    if (sales >= 104000000 * 2) {
      notes.push('연 매출이 2억원을 넘으면 간이과세 대상이 아닙니다. 일반과세자로 신고합니다.');
    }

    return {
      valid: sales > 0,
      sales: sales,
      purchases: purchases,
      purchaseTax: purchaseTax,
      nonDeductible: nonDeductible,
      deductible: deductible,
      purchaseRatio: purchaseRatio,
      saleTax: saleTax,
      balance: balance,
      payable: payable,
      refund: refund,
      totalHalfYear: payable,
      effectiveRate: effective,
      notes: notes
    };
  }

  /** 매입 비중별 납부세액 (매출은 현재 값 고정) */
  function generalTable(opts) {
    var o = opts || {};
    var ratios = [0, 0.2, 0.4, 0.6, 0.8, 1];
    return ratios.map(function (r) {
      var sales = clamp(num(o.sales, 0), 0, LIMITS.money.max);
      var res = general({
        sales: sales,
        purchases: sales * r,
        nonDeductible: o.nonDeductible
      });
      return {
        ratio: r,
        purchases: sales * r,
        saleTax: res.saleTax,
        deductible: res.deductible,
        payable: res.payable,
        refund: res.refund
      };
    });
  }

  /* ══════════════════════════════════════════════════════════
   * 2. 간이과세자 부가가치세
   * ══════════════════════════════════════════════════════════ */

  function industryInfo(key) {
    return INDUSTRIES[key] || INDUSTRIES.retail;
  }

  /**
   * 간이과세자 납부세액과 과세유형 판정
   * @param {object} opts industry, sales(연 공급대가), purchases(세금계산서 받은 공급대가),
   *                      priorYear(직전연도 공급대가), rental(부동산임대업·과세유흥장소)
   */
  function simple(opts) {
    var o = opts || {};
    var key = INDUSTRIES[o.industry] ? o.industry : 'retail';
    var info = INDUSTRIES[key];
    var sales = clamp(num(o.sales, 0), 0, LIMITS.money.max);
    var purchases = clamp(num(o.purchases, 0), 0, LIMITS.money.max);
    var priorYear = clamp(num(o.priorYear, 0), 0, LIMITS.money.max);
    var rental = !!o.rental;

    var grossTax = floorWon(sales * info.rate * VAT_RATE);
    var credit = Math.min(floorWon(purchases * SIMPLE_PURCHASE_CREDIT), grossTax);
    var taxBeforeExempt = Math.max(0, grossTax - credit);
    var exempt = sales > 0 && sales < EXEMPT_BELOW;
    var payable = exempt ? 0 : taxBeforeExempt;

    var eligibleThreshold = rental ? SIMPLE_ELIGIBLE_RENTAL : SIMPLE_ELIGIBLE;
    var simpleEligible = priorYear < eligibleThreshold;
    var invoiceRequired = priorYear >= INVOICE_REQUIRED;

    var effective = sales > 0 ? payable / sales * 100 : 0;
    var nominal = info.rate * VAT_RATE * 100;   // 1.5 ~ 4%

    var notes = [];
    if (exempt) {
      notes.push('이번 과세기간 공급대가가 4,800만원 미만이라 납부의무가 면제됩니다. ' +
        '납부할 세금은 없지만 확정신고는 해야 합니다.');
    }
    if (!simpleEligible && priorYear > 0) {
      notes.push('직전연도 공급대가가 ' + eligibleThreshold.toLocaleString('ko-KR') +
        '원 이상이라 간이과세 대상이 아닙니다. 일반과세자로 신고해야 합니다.');
    }
    if (!invoiceRequired) {
      notes.push('직전연도 공급대가가 4,800만원 미만이라 세금계산서를 발급할 수 없고 영수증만 발급합니다. ' +
        '사업자 거래처가 세금계산서를 요구하면 일반과세로 전환해야 합니다.');
    }
    if (purchases > 0) {
      notes.push('간이과세자는 매입액 전액이 아니라 세금계산서 받은 공급대가의 0.5%만 공제됩니다(공제액 ' +
        credit.toLocaleString('ko-KR') + '원).');
    }

    return {
      valid: sales > 0,
      industry: key,
      industryLabel: info.label,
      rate: info.rate,
      nominalRate: nominal,
      sales: sales,
      purchases: purchases,
      grossTax: grossTax,
      credit: credit,
      taxBeforeExempt: taxBeforeExempt,
      exempt: exempt,
      payable: payable,
      effectiveRate: effective,
      priorYear: priorYear,
      rental: rental,
      eligibleThreshold: eligibleThreshold,
      simpleEligible: simpleEligible,
      invoiceRequired: invoiceRequired,
      notes: notes
    };
  }

  /** 업종별 납부세액 비교 (매출·매입은 현재 값 고정) */
  function simpleTable(opts) {
    var o = opts || {};
    return INDUSTRY_ORDER.map(function (key) {
      var r = simple({
        industry: key,
        sales: o.sales,
        purchases: o.purchases,
        priorYear: o.priorYear,
        rental: key === 'finance' ? !!o.rental : false
      });
      return {
        industry: key,
        label: INDUSTRIES[key].label,
        rate: INDUSTRIES[key].rate,
        grossTax: r.grossTax,
        credit: r.credit,
        payable: r.payable,
        exempt: r.exempt
      };
    });
  }

  /* ══════════════════════════════════════════════════════════
   * 3. 간이 vs 일반 비교
   * ══════════════════════════════════════════════════════════ */

  /**
   * 같은 매출·매입(부가세 포함 공급대가)에서 두 과세유형의 부가세 비교
   * @param {object} opts sales(부가세 포함 연 매출), purchases(부가세 포함 연 매입), industry
   */
  function compare(opts) {
    var o = opts || {};
    var key = INDUSTRIES[o.industry] ? o.industry : 'retail';
    var info = INDUSTRIES[key];
    var sales = clamp(num(o.sales, 0), 0, LIMITS.money.max);
    var purchases = clamp(num(o.purchases, 0), 0, LIMITS.money.max);

    // 일반과세: (매출 공급대가 − 매입 공급대가) ÷ 11
    var generalBalance = (sales - purchases) / (1 + VAT_RATE);
    var generalTax = generalBalance * VAT_RATE;
    var generalPayable = floorWon(Math.max(0, generalTax));
    var generalRefund = floorWon(Math.max(0, -generalTax));
    var generalSigned = generalPayable - generalRefund;

    // 간이과세: 매출 공급대가 × 부가가치율 × 10% − 매입 공급대가 × 0.5%
    var simpleGross = floorWon(sales * info.rate * VAT_RATE);
    var simpleCredit = Math.min(floorWon(purchases * SIMPLE_PURCHASE_CREDIT), simpleGross);
    var exempt = sales > 0 && sales < EXEMPT_BELOW;
    var simplePayable = exempt ? 0 : Math.max(0, simpleGross - simpleCredit);

    var diff = generalSigned - simplePayable;     // > 0 이면 간이가 유리 (일반이 더 부담)
    var better = diff > 0 ? 'simple' : (diff < 0 ? 'general' : 'same');
    var savings = Math.abs(diff);

    // 일반과세와 간이과세 부담이 같아지는 매입 비중
    var crossover = (VAT_RATE / (1 + VAT_RATE) - info.rate * VAT_RATE) /
      (VAT_RATE / (1 + VAT_RATE) - SIMPLE_PURCHASE_CREDIT);
    crossover = clamp(crossover, 0, 1);

    var notes = [];
    if (exempt) {
      notes.push('연 매출이 4,800만원 미만이라 간이과세는 납부의무가 면제됩니다. ' +
        '일반과세자는 매입세액을 전액 공제하지만 세금계산서 발급·신고 부담이 큽니다.');
    }
    if (better === 'simple' && savings > 0) {
      notes.push('이 조건에서는 간이과세가 ' + savings.toLocaleString('ko-KR') + '원 적습니다. ' +
        '다만 간이과세는 세금계산서 발급에 제한이 있어 거래처가 사업자라면 불리할 수 있습니다.');
    }
    if (better === 'general' && savings > 0) {
      notes.push('매입 비중이 높아 일반과세가 ' + savings.toLocaleString('ko-KR') + '원 적습니다. ' +
        '매입세금계산서를 빠짐없이 받는 것이 전제입니다.');
    }
    if (sales >= SIMPLE_ELIGIBLE) {
      notes.push('연 매출 1억 400만원 이상이면 간이과세 대상이 아닙니다. 비교는 참고용입니다.');
    }

    return {
      valid: sales > 0,
      industry: key,
      industryLabel: info.label,
      rate: info.rate,
      sales: sales,
      purchases: purchases,
      purchaseRatio: sales > 0 ? purchases / sales : 0,
      generalSalesNet: sales / (1 + VAT_RATE),
      generalPurchaseNet: purchases / (1 + VAT_RATE),
      generalTax: generalPayable,
      generalRefund: generalRefund,
      generalPayable: generalPayable,
      generalSigned: generalSigned,
      generalEffective: sales > 0 ? generalPayable / sales * 100 : 0,
      simpleGross: simpleGross,
      simpleCredit: simpleCredit,
      simplePayable: simplePayable,
      simpleEffective: sales > 0 ? simplePayable / sales * 100 : 0,
      exempt: exempt,
      diff: diff,
      better: better,
      savings: savings,
      crossover: crossover,
      notes: notes
    };
  }

  /** 매입 비중별 두 제도 비교표 (매출·업종은 현재 값 고정) */
  function compareTable(opts) {
    var o = opts || {};
    var sales = clamp(num(o.sales, 0), 0, LIMITS.money.max);
    return [0, 0.2, 0.4, 0.6, 0.8, 1].map(function (r) {
      var res = compare({ sales: sales, purchases: sales * r, industry: o.industry });
      return {
        ratio: r,
        purchases: sales * r,
        general: res.generalPayable,
        generalRefund: res.generalRefund,
        simple: res.simplePayable,
        better: res.better,
        diff: res.diff
      };
    });
  }

  /* ══════════════════════════════════════════════════════════
   * 4. 노란우산공제 소득공제
   * ══════════════════════════════════════════════════════════ */

  /** 사업소득금액 구간별 소득공제 한도 */
  function sohoLimit(income) {
    var v = clamp(num(income, 0), 0, LIMITS.income.max);
    if (v <= 40000000) return 6000000;
    if (v <= 60000000) return 5000000;
    if (v <= 100000000) return 4000000;
    return 2000000;
  }

  function sohoLimitLabel(income) {
    var v = clamp(num(income, 0), 0, LIMITS.income.max);
    if (v <= 40000000) return '4,000만원 이하';
    if (v <= 60000000) return '4,000만~6,000만원';
    if (v <= 100000000) return '6,000만~1억원';
    return '1억원 초과';
  }

  /**
   * 노란우산공제 절세액
   * @param {object} opts income(사업소득금액), payment(연 납입액), taxBase(공제 전 종합소득 과세표준),
   *                      rentalIncome(사업소득 중 부동산임대소득)
   */
  function yellow(opts) {
    var o = opts || {};
    var income = clamp(num(o.income, 0), 0, LIMITS.income.max);
    var payment = clamp(num(o.payment, 0), 0, 100000000);
    var taxBase = clamp(num(o.taxBase, 0), 0, LIMITS.taxBase.max);
    var rentalIncome = clamp(num(o.rentalIncome, 0), 0, income);

    var limit = sohoLimit(income);
    var eligibleIncome = Math.max(0, income - rentalIncome);
    var baseDeductible = Math.min(payment, limit);
    // 공제액 = min(납입액, 한도) × (사업소득금액 − 임대소득금액) ÷ 사업소득금액
    var ratio = income > 0 ? eligibleIncome / income : 0;
    var deduction = Math.min(floorWon(baseDeductible * ratio), eligibleIncome);
    deduction = Math.max(0, deduction);

    var taxBefore = basicTax(taxBase);
    var taxAfterBase = Math.max(0, taxBase - deduction);
    var taxAfter = basicTax(taxAfterBase);
    var incomeTaxSaving = Math.max(0, taxBefore - taxAfter);
    var localSaving = floorWon(incomeTaxSaving * 0.1);
    var saving = incomeTaxSaving + localSaving;

    var effective = payment > 0 ? saving / payment * 100 : 0;
    var marginal = bracketOf(taxBase).rate * 100;

    var notes = [];
    if (deduction === 0 && payment > 0) {
      notes.push(income <= 0
        ? '사업소득금액이 없으면 노란우산공제 소득공제를 받을 수 없습니다.'
        : '부동산임대소득만 있어 소득공제 대상금액이 없습니다.');
    }
    if (payment > limit) {
      notes.push('납입액 중 ' + (payment - limit).toLocaleString('ko-KR') +
        '원은 소득공제 한도를 넘어 공제되지 않습니다. 넘긴 금액은 나중에 공제금을 받을 때 과세에서 빠집니다.');
    }
    if (payment > SOHO_PAYMENT_CAP) {
      notes.push('노란우산 납입한도는 2026년 7월 1일 납입분부터 연 1,800만원입니다. 한도를 넘는 납입은 불가능합니다.');
    }
    if (rentalIncome > 0) {
      notes.push('부동산임대소득 ' + rentalIncome.toLocaleString('ko-KR') +
        '원은 소득공제 대상에서 빠지도록 비율로 줄였습니다.');
    }
    if (payment > 0 && payment / 12 > 1500000) {
      notes.push('월부금 상한은 150만원입니다. 연 1,800만원을 넘겨 납입할 수 없습니다.');
    }

    return {
      valid: payment > 0,
      income: income,
      payment: payment,
      taxBase: taxBase,
      rentalIncome: rentalIncome,
      limit: limit,
      limitLabel: sohoLimitLabel(income),
      baseDeductible: baseDeductible,
      deduction: deduction,
      taxBefore: taxBefore,
      taxAfter: taxAfter,
      taxBaseAfter: taxAfterBase,
      incomeTaxSaving: incomeTaxSaving,
      localSaving: localSaving,
      saving: saving,
      savingRate: payment > 0 ? saving / payment * 100 : 0,
      effectiveRate: effective,
      marginalRate: marginal,
      monthly: payment / 12,
      tenYearSaving: saving * 10,
      overLimit: payment > limit,
      overCap: payment > SOHO_PAYMENT_CAP,
      notes: notes
    };
  }

  /** 과세표준 구간별 절세액 (납입액·사업소득은 현재 값 고정) */
  function yellowTable(opts) {
    var o = opts || {};
    return [10000000, 30000000, 50000000, 88000000, 150000000, 300000000].map(function (base) {
      var r = yellow({
        income: o.income,
        payment: o.payment,
        taxBase: base,
        rentalIncome: o.rentalIncome
      });
      return {
        taxBase: base,
        taxBefore: r.taxBefore,
        deduction: r.deduction,
        saving: r.saving,
        marginalRate: r.marginalRate
      };
    });
  }

  root.VatBizCalc = {
    DATA_DATE: DATA_DATE,
    LIMITS: LIMITS,
    VAT_RATE: VAT_RATE,
    INDUSTRIES: INDUSTRIES,
    INDUSTRY_ORDER: INDUSTRY_ORDER,
    BASIC_BRACKETS: BASIC_BRACKETS,
    CONSTANTS: {
      SIMPLE_ELIGIBLE: SIMPLE_ELIGIBLE,
      SIMPLE_ELIGIBLE_RENTAL: SIMPLE_ELIGIBLE_RENTAL,
      INVOICE_REQUIRED: INVOICE_REQUIRED,
      EXEMPT_BELOW: EXEMPT_BELOW,
      SIMPLE_PURCHASE_CREDIT: SIMPLE_PURCHASE_CREDIT,
      SOHO_PAYMENT_CAP: SOHO_PAYMENT_CAP
    },
    industryInfo: industryInfo,
    basicTax: basicTax,
    bracketOf: bracketOf,
    general: general,
    generalTable: generalTable,
    simple: simple,
    simpleTable: simpleTable,
    compare: compare,
    compareTable: compareTable,
    sohoLimit: sohoLimit,
    sohoLimitLabel: sohoLimitLabel,
    yellow: yellow,
    yellowTable: yellowTable,
    floorWon: floorWon,
    round: round
  };
})(typeof window !== 'undefined' ? window : this);
