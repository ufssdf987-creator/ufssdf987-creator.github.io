/*!
 * calc.js — 2026 보유세(재산세·종합부동산세) 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.HTCalc 로 노출합니다.
 *
 * 근거 (2026년 11월 27일 기준, 모두 원문·국세청 안내 확인)
 *  [재산세 — 지방세법 시행 2026. 1. 1., 시행령 시행 2026. 10. 1.]
 *  - 과세표준 = 공시가격(시가표준액) × 공정시장가액비율. 주택 60%,
 *    2026년도 납세의무 성립분은 1세대 1주택 3억 이하 43%·3억 초과 6억 이하 44%·6억 초과 45%
 *    (시행령 제109조제1항제2호 단서, 9억 초과 1주택도 포함. 2026년분 한정).
 *  - 표준세율(법 제111조제1항제3호나목): 6천만 이하 0.1%, 1.5억 이하 6만원+0.15%,
 *    3억 이하 19만5천원+0.25%, 3억 초과 57만원+0.4%.
 *    특례세율(법 제111조의2, 공시 9억 이하 1세대 1주택): 0.05%·3만원+0.1%·12만원+0.2%·42만원+0.35%.
 *    특례세율은 2026년 12월 28일까지 성립한 납세의무에 적용됩니다(2026년분).
 *  - 도시지역분 = 과세표준 × 0.14%(법 제112조, 도시지역 중 조례로 고시한 지역, 0.23%까지 가능).
 *  - 지방교육세 = 재산세 본세(도시지역분 제외) × 20%(법 제151조제1항제6호).
 *  - 주택 재산세 세액 세부담상한(105·110·130%)은 2024년 폐지되고 과세표준상한제로 바뀌었습니다
 *    (법 제122조 단서, 제110조제3항). 과세표준상한액 = 직전연도 공시가격 × 올해 비율 + 올해 과세표준 × 5%
 *    (시행령 제109조의2, 상한율 5%). 2024년 1월 1일 전에 재산세가 과세된 주택은 2028년 12월 31일까지
 *    경과조치로 종전 105·110·130% 상한이 본세와 도시지역분에 각각 적용됩니다(법률 제19230호 부칙 제15조).
 *  - 납기: 7월 16~31일·9월 16~30일에 1/2씩(법 제115조), 20만원 이하는 7월 일괄 가능.
 *
 *  [종합부동산세 — 종합부동산세법, 2026년분]
 *  - 과세기준일 6월 1일, 납부 12월 1~15일.
 *  - 기본공제: 1세대 1주택자 12억원, 그 밖의 개인 9억원(법 제8조제1항).
 *  - 과세표준 = (공시가격 합계 − 기본공제) × 공정시장가액비율 60%(법 제8조, 시행령 제2조의4).
 *  - 세율(법 제9조제1항): 2주택 이하 0.5%·0.7%·1.0%·1.3%·1.5%·2.0%·2.7%,
 *    3주택 이상은 과세표준 12억 초과 구간부터 2.0%·3.0%·4.0%·5.0%(누진공제 있음).
 *  - 산출세액 = (과세표준 × 세율 − 누진공제) − 공제할 재산세액.
 *    공제할 재산세액 = 재산세 본세 × (종부세 과세표준 × 재산세 공정시장가액비율 × 0.4%)
 *                     ÷ (주택을 합산해 재산세 표준세율로 계산한 재산세)
 *    (법 제9조제3항, 시행령 제4조의3. 도시지역분·지방교육세는 공제하지 않음)
 *  - 1세대 1주택자 세액공제: 고령자 60세 20%·65세 30%·70세 40%,
 *    장기보유 5년 20%·10년 40%·15년 50%, 합산 최대 80%(법 제9조제5항~제8항).
 *    2주택 이상·공동명의 일반과세에는 적용되지 않습니다.
 *  - 세부담상한: (재산세 + 종부세)가 직전연도 총세액의 150%를 넘으면 초과분을 뺍니다(법 제10조).
 *  - 농어촌특별세: 종부세 결정세액의 20%(농어촌특별세법 제5조).
 *  - 분납: 납부할 세액 250만원 초과 시 6개월 이내 분납(250만~500만원은 초과분,
 *    500만원 초과는 50% 이하).
 *
 *  [공동명의 — 2026년 시행령 개정]
 *  - 부부 공동명의 1주택은 지분율과 관계없이 합의로 특례 납세의무자를 정할 수 있습니다
 *    (2026년 과세분부터, 시행령 제36132호).
 *  - 특례 미적용: 부부가 각자 지분에 대해 9억원씩 공제, 세액공제 없음.
 *  - 특례 적용: 1명이 12억원 공제 + 고령자·장기보유 세액공제(최대 80%).
 *  - 신청 9월 16~30일, 한 번 신청하면 변동 없으면 계속 적용.
 *
 * 금액은 원 단위에서 버림(지방세·국세 실무 관행)해 보여 주고, 모든 결과는 참고용 모의 계산입니다.
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-27';

  var LIMITS = {
    price: { min: 0, max: 50000000000 },       // 500억원
    share: { min: 0, max: 100 },
    age: { min: 0, max: 120 },
    years: { min: 0, max: 100 },
    tax: { min: 0, max: 10000000000 }          // 100억원
  };

  /* ── 재산세 ───────────────────────────────────────────── */
  var PROP = {
    year: 2026,
    otherRatio: 0.60,
    singleRatio: [
      { limit: 300000000, ratio: 0.43 },
      { limit: 600000000, ratio: 0.44 },
      { limit: Infinity, ratio: 0.45 }
    ],
    specialPriceLimit: 900000000,
    specialSunset: '2026-12-28',
    cityRate: 0.0014,
    eduRate: 0.20,
    baseCapRate: 0.05,
    legacyCaps: [
      { limit: 300000000, rate: 1.05 },
      { limit: 600000000, rate: 1.10 },
      { limit: Infinity, rate: 1.30 }
    ],
    standard: [
      { limit: 60000000, rate: 0.0010, deduction: 0 },
      { limit: 150000000, rate: 0.0015, deduction: 30000 },
      { limit: 300000000, rate: 0.0025, deduction: 180000 },
      { limit: Infinity, rate: 0.0040, deduction: 630000 }
    ],
    special: [
      { limit: 60000000, rate: 0.0005, deduction: 0 },
      { limit: 150000000, rate: 0.0010, deduction: 30000 },
      { limit: 300000000, rate: 0.0020, deduction: 180000 },
      { limit: Infinity, rate: 0.0035, deduction: 630000 }
    ]
  };

  /* ── 종합부동산세 ─────────────────────────────────────── */
  var HOLD = {
    year: 2026,
    ratio: 0.60,
    baseSingle: 1200000000,
    baseOther: 900000000,
    normal: [
      { limit: 300000000, rate: 0.005, deduction: 0 },
      { limit: 600000000, rate: 0.007, deduction: 600000 },
      { limit: 1200000000, rate: 0.010, deduction: 2400000 },
      { limit: 2500000000, rate: 0.013, deduction: 6000000 },
      { limit: 5000000000, rate: 0.015, deduction: 11000000 },
      { limit: 9400000000, rate: 0.020, deduction: 36000000 },
      { limit: Infinity, rate: 0.027, deduction: 101800000 }
    ],
    heavy: [
      { limit: 300000000, rate: 0.005, deduction: 0 },
      { limit: 600000000, rate: 0.007, deduction: 600000 },
      { limit: 1200000000, rate: 0.010, deduction: 2400000 },
      { limit: 2500000000, rate: 0.020, deduction: 14400000 },
      { limit: 5000000000, rate: 0.030, deduction: 39400000 },
      { limit: 9400000000, rate: 0.040, deduction: 89400000 },
      { limit: Infinity, rate: 0.050, deduction: 183400000 }
    ],
    senior: [
      { age: 70, rate: 0.40 },
      { age: 65, rate: 0.30 },
      { age: 60, rate: 0.20 }
    ],
    longHold: [
      { years: 15, rate: 0.50 },
      { years: 10, rate: 0.40 },
      { years: 5, rate: 0.20 }
    ],
    creditCap: 0.80,
    capRate: 1.50,
    farmRate: 0.20,
    splitThreshold: 2500000,
    splitHalfThreshold: 5000000,
    deductorTopRate: 0.004
  };

  function floor(n) {
    if (!isFinite(n)) return 0;
    return Math.floor(n + 1e-7);
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  /** 누진세율표 — 기초금액 + 초과분 × 세율 (누진공제 방식과 같은 값) */
  function taxBy(brackets, base) {
    if (!(base > 0)) return 0;
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      if (base <= b.limit) {
        return Math.max(0, floor(base * b.rate - b.deduction));
      }
    }
    return 0;
  }

  /** 해당 과세표준이 속한 구간의 세율 */
  function bandRate(brackets, base) {
    if (!(base > 0)) return brackets[0].rate;
    for (var i = 0; i < brackets.length; i++) {
      if (base <= brackets[i].limit) return brackets[i].rate;
    }
    return brackets[brackets.length - 1].rate;
  }

  function propertyRatio(price, single) {
    if (!single) return PROP.otherRatio;
    for (var i = 0; i < PROP.singleRatio.length; i++) {
      if (price <= PROP.singleRatio[i].limit) return PROP.singleRatio[i].ratio;
    }
    return PROP.otherRatio;
  }

  function legacyCapRate(price) {
    for (var i = 0; i < PROP.legacyCaps.length; i++) {
      if (price <= PROP.legacyCaps[i].limit) return PROP.legacyCaps[i].rate;
    }
    return PROP.legacyCaps[PROP.legacyCaps.length - 1].rate;
  }

  /**
   * 재산세(주택) 계산
   * @param {object} o
   *   price      공시가격(원)
   *   single     1세대 1주택 여부(공정시장가액비율 43~45% + 9억 이하 특례세율)
   *   city       도시지역분 부과 여부(기본 true)
   *   prevPrice  직전연도 공시가격(원, 선택) — 과세표준상한 5%
   *   legacy     경과조치 세부담상한(105·110·130%) 적용 여부
   *   lastTax    직전연도 재산세 본세(원, 선택)
   */
  function propertyTax(o) {
    var opt = o || {};
    var price = Math.max(0, Number(opt.price) || 0);
    var single = !!opt.single;
    var city = opt.city !== false;
    var ratio = propertyRatio(price, single);

    var rawBase = floor(price * ratio);
    var capBase = null;
    var capApplied = false;
    var prevPrice = Number(opt.prevPrice) || 0;
    if (prevPrice > 0) {
      capBase = floor(prevPrice * ratio + rawBase * PROP.baseCapRate);
      if (rawBase > capBase) {
        capApplied = true;
      }
    }
    var taxable = capApplied ? capBase : rawBase;
    var taxableBeforeCap = rawBase;

    var special = single && price > 0 && price <= PROP.specialPriceLimit;
    var table = special ? PROP.special : PROP.standard;
    var grossTax = taxBy(table, taxable);

    var legacyApplied = false;
    var legacyLimit = null;
    var lastTax = Number(opt.lastTax) || 0;
    if (opt.legacy && lastTax > 0) {
      var capRate = legacyCapRate(price);
      legacyLimit = floor(lastTax * capRate);
      if (grossTax > legacyLimit) {
        grossTax = legacyLimit;
        legacyApplied = true;
      }
    }

    var cityTax = city ? floor(taxable * PROP.cityRate) : 0;
    var eduTax = floor(grossTax * PROP.eduRate);
    var total = grossTax + cityTax + eduTax;

    return {
      price: floor(price),
      single: single,
      city: city,
      ratio: ratio,
      taxable: taxable,
      taxableBeforeCap: taxableBeforeCap,
      capBase: capBase,
      capApplied: capApplied,
      special: special,
      rate: bandRate(table, taxable),
      rateTable: special ? 'special' : 'standard',
      grossTax: grossTax,
      cityTax: cityTax,
      eduTax: eduTax,
      total: total,
      half: floor(total / 2),
      effectiveRate: price > 0 ? total / price : 0,
      legacyApplied: legacyApplied,
      legacyLimit: legacyLimit,
      legacyRate: opt.legacy ? legacyCapRate(price) : null
    };
  }

  /**
   * 종부세 1인분 계산
   * @param {object} o
   *   price        공시가격(원) — 납세의무자 몫
   *   fullPrice    주택 전체 공시가격(원). 재산세 중복분 계산 기준
   *   houses       주택 수(1·2·3 이상)
   *   single       1세대 1주택자 여부(12억 공제 + 세액공제)
   *   age          만 나이
   *   years        보유기간(년)
   *   propertySingle 재산세 1세대 1주택 특례 적용 여부
   *   prevTotal    직전연도 재산세+종부세(원, 선택) — 세부담상한 150%
   */
  function holdingTax(o) {
    var opt = o || {};
    var price = Math.max(0, Number(opt.price) || 0);
    var fullPrice = Math.max(price, Number(opt.fullPrice) || price);
    var houses = Math.max(1, Math.min(9, Math.round(Number(opt.houses) || 1)));
    var single = !!opt.single && houses === 1;
    var age = clamp(Math.round(Number(opt.age) || 0), 0, 120);
    var years = clamp(Math.round(Number(opt.years) || 0), 0, 100);
    var propertySingle = opt.propertySingle == null ? single : !!opt.propertySingle;

    var baseDeduction = single ? HOLD.baseSingle : HOLD.baseOther;
    var excess = Math.max(0, price - baseDeduction);
    var taxable = floor(excess * HOLD.ratio);

    var heavy = houses >= 3;
    var table = heavy ? HOLD.heavy : HOLD.normal;
    var grossTax = taxBy(table, taxable);

    // 공제할 재산세액 — 재산세 본세 × (종부세 과표 × 재산세 비율 × 0.4%) ÷ 표준세율 재산세
    var pRatio = propertyRatio(fullPrice, propertySingle);
    var pStandardBase = floor(fullPrice * pRatio);
    var pStandardTax = taxBy(PROP.standard, pStandardBase);
    var pBilled = propertyTax({ price: fullPrice, single: propertySingle, city: false }).grossTax;
    var numerator = taxable * pRatio * HOLD.deductorTopRate;
    var propertyCredit = 0;
    if (taxable > 0 && pStandardTax > 0 && pBilled > 0) {
      propertyCredit = floor(pBilled * (numerator / pStandardTax));
      propertyCredit = Math.min(propertyCredit, grossTax);
    }
    var afterProperty = Math.max(0, grossTax - propertyCredit);

    var seniorRate = 0;
    var holdRate = 0;
    if (single) {
      for (var i = 0; i < HOLD.senior.length; i++) {
        if (age >= HOLD.senior[i].age) { seniorRate = HOLD.senior[i].rate; break; }
      }
      for (var j = 0; j < HOLD.longHold.length; j++) {
        if (years >= HOLD.longHold[j].years) { holdRate = HOLD.longHold[j].rate; break; }
      }
    }
    var creditRate = Math.min(HOLD.creditCap, seniorRate + holdRate);
    var ageCredit = floor(afterProperty * creditRate);
    var beforeCap = Math.max(0, afterProperty - ageCredit);

    // 세부담상한 150% — 재산세 + 종부세(공제 반영) 기준
    var prevTotal = Number(opt.prevTotal) || 0;
    var capAmount = null;
    var capExcess = 0;
    var capApplied = false;
    if (prevTotal > 0) {
      capAmount = floor(prevTotal * HOLD.capRate);
      var pTotal = propertyTax({ price: fullPrice, single: propertySingle }).total;
      if (pTotal + beforeCap > capAmount) {
        capExcess = pTotal + beforeCap - capAmount;
        capApplied = true;
      }
    }
    var decided = Math.max(0, beforeCap - capExcess);
    var farmTax = floor(decided * HOLD.farmRate);
    var total = decided + farmTax;

    // 12월 분납 안내
    var split = {
      eligible: decided > HOLD.splitThreshold,
      first: decided,
      deferred: 0,
      deferredFarm: 0
    };
    if (split.eligible) {
      if (decided <= HOLD.splitHalfThreshold) {
        split.first = HOLD.splitThreshold;
        split.deferred = decided - HOLD.splitThreshold;
      } else {
        split.first = floor(decided / 2);
        split.deferred = decided - split.first;
      }
      split.deferredFarm = floor(farmTax * (decided > 0 ? split.deferred / decided : 0));
    }

    return {
      price: floor(price),
      fullPrice: floor(fullPrice),
      houses: houses,
      single: single,
      heavy: heavy,
      baseDeduction: baseDeduction,
      excess: floor(excess),
      taxable: taxable,
      rate: bandRate(table, taxable),
      rateTable: heavy ? 'heavy' : 'normal',
      grossTax: grossTax,
      propertyRatio: pRatio,
      propertyStandardTax: pStandardTax,
      propertyBilled: pBilled,
      propertyCredit: propertyCredit,
      afterProperty: afterProperty,
      seniorRate: seniorRate,
      holdRate: holdRate,
      creditRate: creditRate,
      ageCredit: ageCredit,
      beforeCap: beforeCap,
      capAmount: capAmount,
      capExcess: capExcess,
      capApplied: capApplied,
      decided: decided,
      farmTax: farmTax,
      total: total,
      split: split
    };
  }

  /** 1세대 1주택 단독명의 계산(입력 묶음) */
  function singleHolding(o) {
    var opt = o || {};
    return holdingTax({
      price: opt.price,
      fullPrice: opt.price,
      houses: 1,
      single: true,
      age: opt.age,
      years: opt.years,
      propertySingle: true,
      prevTotal: opt.prevTotal
    });
  }

  /** 공동명의 일반과세 — 각자 지분에 9억 공제, 세액공제 없음 */
  function jointGeneral(o) {
    var opt = o || {};
    var price = Math.max(0, Number(opt.price) || 0);
    var shareA = clamp(Number(opt.shareA) || 0, 0, 100) / 100;
    var shareB = 1 - shareA;
    var a = holdingTax({
      price: floor(price * shareA),
      fullPrice: price,
      houses: 1,
      single: false,
      propertySingle: true,
      age: opt.ageA,
      years: opt.yearsA
    });
    var b = holdingTax({
      price: floor(price * shareB),
      fullPrice: price,
      houses: 1,
      single: false,
      propertySingle: true,
      age: opt.ageB,
      years: opt.yearsB
    });
    return {
      a: a,
      b: b,
      grossTax: a.grossTax + b.grossTax,
      propertyCredit: a.propertyCredit + b.propertyCredit,
      decided: a.decided + b.decided,
      farmTax: a.farmTax + b.farmTax,
      total: a.total + b.total
    };
  }

  /** 공동명의 특례 — 12억 공제 + 선택한 배우자 기준 세액공제 */
  function jointSpecial(o) {
    var opt = o || {};
    var price = Math.max(0, Number(opt.price) || 0);
    var asA = holdingTax({
      price: price, fullPrice: price, houses: 1, single: true,
      age: opt.ageA, years: opt.yearsA, propertySingle: true
    });
    var asB = holdingTax({
      price: price, fullPrice: price, houses: 1, single: true,
      age: opt.ageB, years: opt.yearsB, propertySingle: true
    });
    var pickA = asA.total <= asB.total;
    return {
      a: asA,
      b: asB,
      chosen: pickA ? 'A' : 'B',
      result: pickA ? asA : asB,
      grossTax: (pickA ? asA : asB).grossTax,
      propertyCredit: (pickA ? asA : asB).propertyCredit,
      decided: (pickA ? asA : asB).decided,
      farmTax: (pickA ? asA : asB).farmTax,
      total: (pickA ? asA : asB).total
    };
  }

  /** 단독명의 vs 공동명의(일반·특례) 3가지 비교 */
  function compareOwnership(o) {
    var opt = o || {};
    var price = Math.max(0, Number(opt.price) || 0);
    var shareA = clamp(Number(opt.shareA) || 50, 0, 100);
    var single = singleHolding({ price: price, age: opt.ageA, years: opt.yearsA });
    var general = jointGeneral({
      price: price, shareA: shareA, ageA: opt.ageA, yearsA: opt.yearsA,
      ageB: opt.ageB, yearsB: opt.yearsB
    });
    var special = jointSpecial({
      price: price, ageA: opt.ageA, yearsA: opt.yearsA,
      ageB: opt.ageB, yearsB: opt.yearsB
    });

    var rows = [
      {
        key: 'single', label: '단독명의',
        note: '12억 공제 + 고령·장기보유 세액공제 ' + (single.creditRate ? Math.round(single.creditRate * 100) + '%' : '없음'),
        grossTax: single.grossTax,
        propertyCredit: single.propertyCredit,
        creditRate: single.creditRate,
        decided: single.decided,
        farmTax: single.farmTax,
        total: single.total,
        detail: single
      },
      {
        key: 'general', label: '공동명의 · 각자',
        note: '지분별 9억씩 공제, 세액공제 없음',
        grossTax: general.grossTax,
        propertyCredit: general.propertyCredit,
        creditRate: 0,
        decided: general.decided,
        farmTax: general.farmTax,
        total: general.total,
        detail: general
      },
      {
        key: 'special', label: '공동명의 · 특례',
        note: '12억 공제 + ' + (special.chosen === 'A' ? '본인' : '배우자') + ' 기준 세액공제 ' + Math.round(special.result.creditRate * 100) + '%',
        grossTax: special.grossTax,
        propertyCredit: special.propertyCredit,
        creditRate: special.result.creditRate,
        decided: special.decided,
        farmTax: special.farmTax,
        total: special.total,
        detail: special
      }
    ];

    var best = rows[0];
    rows.forEach(function (r) { if (r.total < best.total) best = r; });
    var worst = rows[0];
    rows.forEach(function (r) { if (r.total > worst.total) worst = r; });
    rows.forEach(function (r) {
      r.diff = r.total - best.total;
      r.isBest = r.key === best.key;
      r.saving = worst.total - r.total;
    });

    var property = propertyTax({ price: price, single: true });

    return {
      price: price,
      shareA: shareA,
      rows: rows,
      best: best,
      worst: worst,
      maxSaving: worst.total - best.total,
      propertyTax: property,
      chosenSpecial: special.chosen
    };
  }

  /** 공시가격 구간별 재산세 표 */
  function propertyScale(o) {
    var opt = o || {};
    var prices = opt.prices || [300000000, 500000000, 600000000, 900000000, 1200000000, 1500000000];
    return prices.map(function (p) {
      var r = propertyTax({ price: p, single: opt.single !== false, city: opt.city !== false });
      return {
        price: p,
        ratio: r.ratio,
        taxable: r.taxable,
        special: r.special,
        grossTax: r.grossTax,
        total: r.total
      };
    });
  }

  /** 공시가격 구간별 종부세 표(입력 조건 기준) */
  function holdingScale(o) {
    var opt = o || {};
    var prices = opt.prices || [1200000000, 1500000000, 2000000000, 3000000000, 5000000000];
    return prices.map(function (p) {
      var r = holdingTax({
        price: p, fullPrice: p,
        houses: opt.houses || 1,
        single: opt.houses === 1,
        age: opt.age, years: opt.years
      });
      return { price: p, taxable: r.taxable, grossTax: r.grossTax, total: r.total };
    });
  }

  /** +1억원이 늘 때 종부세 증가분 */
  function marginal(o) {
    var opt = o || {};
    var price = Math.max(0, Number(opt.price) || 0);
    var delta = 100000000;
    var a = holdingTax({
      price: price, fullPrice: price, houses: opt.houses || 1,
      single: opt.houses === 1, age: opt.age, years: opt.years
    });
    var b = holdingTax({
      price: price + delta, fullPrice: price + delta, houses: opt.houses || 1,
      single: opt.houses === 1, age: opt.age, years: opt.years
    });
    return {
      delta: delta,
      increase: b.total - a.total,
      rate: b.total > 0 ? (b.total - a.total) / delta : 0
    };
  }

  var API = {
    RULES: {
      year: 2026,
      verifiedAt: DATA_DATE,
      property: PROP,
      holding: HOLD,
      limits: LIMITS
    },
    LIMITS: LIMITS,
    propertyRatio: propertyRatio,
    legacyCapRate: legacyCapRate,
    propertyTax: propertyTax,
    holdingTax: holdingTax,
    singleHolding: singleHolding,
    jointGeneral: jointGeneral,
    jointSpecial: jointSpecial,
    compareOwnership: compareOwnership,
    propertyScale: propertyScale,
    holdingScale: holdingScale,
    marginal: marginal
  };

  root.HTCalc = API;
})(typeof window !== 'undefined' ? window : this);
