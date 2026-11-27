/*!
 * calc.js — 2026 국민연금 예상수령액·조기/연기 손익분기·기초연금 계산
 * ------------------------------------------------------------------
 * 기준: 국민연금법(법률 제22096호, 2026. 10. 20. 시행) 제51조·제52조·제61조·제62조·제63조,
 *       보건복지부고시 제2026-31호(2026. 7. 1. 시행, 기준소득월액 하한 41만·상한 659만원),
 *       2026년도 연금액 조정 고시(2.1% 인상, 부양가족연금 배우자 연 306,630원),
 *       기초연금법(법률 제21065호)·같은 법 시행령(대통령령 제36371호)·
 *       기초연금 지급대상자 선정기준액 고시(보건복지부고시 제2026-156호).
 * 화면(app.js)과 분리되어 브라우저·테스트에서 함께 씁니다.
 */
(function (global) {
  'use strict';

  var NP = {};

  /* ── 2026년 기준값 ─────────────────────────────────────── */
  NP.RULES = {
    year: 2026,
    verifiedAt: '2026-11-27',

    // 기준소득월액 상·하한 (2026. 7. ~ 2027. 6. 적용)
    baseIncomeMin: 410000,
    baseIncomeMax: 6590000,

    // 보험료율: 2026년 9.5% → 2033년 13% (매년 0.5%p 인상)
    premiumRate: 0.095,
    premiumRateSchedule: {
      2026: 0.095, 2027: 0.1, 2028: 0.105, 2029: 0.11, 2030: 0.115,
      2031: 0.12, 2032: 0.125, 2033: 0.13
    },

    // 연금액 산정
    aValue: 3193511,          // 2025.12~2026.11 지급사유 발생자 적용 A값
    constant2026: 1.29,       // 2026년 이후 가입분 상수 (소득대체율 43%)
    over20AnnualGain: 0.05,   // 20년 초과 매 1년 5% 가산
    under20Base: 0.5,         // 10년 지급률 50%
    under20Step: 0.05,        // 10년 초과 매 1년 5%p

    // 부양가족연금액 (2026년, 월)
    dependent: { spouse: 25550, other: 17030 },

    // 조기·연기 (국민연금법 제61조·제62조)
    early: { perYear: 0.06, maxYears: 5 },
    defer: { perYear: 0.072, maxYears: 5 },

    // 소득 있는 업무 감액 기준: 월평균 소득금액 ≥ A값 + 200만원
    workIncomeThreshold: 3193511 + 2000000,

    // 출생연도별 노령연금 지급개시 연령
    claimAges: { 1952: 60, 1956: 61, 1960: 62, 1964: 63, 1968: 64, 1969: 65 },

    // ── 기초연금 (2026년) ──
    basic: {
      selectSingle: 2470000,    // 선정기준액 · 단독가구
      selectCouple: 3952000,    // 선정기준액 · 부부가구
      basePension: 349700,      // 기준연금액
      coupleReduction: 0.2,     // 부부 2인 수급 시 각 20% 감액
      laborDeduct: 1160000,     // 근로소득 기본공제(월)
      laborExtraRate: 0.3,      // 근로소득 추가공제 30% (공제 후 70%만 산입)
      interestDeduct: 40000,    // 이자소득 월 4만원 제외
      financeDeduct: 20000000,  // 금융재산 공제
      assetAnnualRate: 0.04,    // 재산 소득환산율 연 4%
      assetBase: { metro: 135000000, city: 85000000, rural: 72500000 },
      npsFullCapRatio: 1.5,     // 국민연금 급여액 ≤ 기준연금액의 150%면 기준연금액 전액
      npsDeductRatio: 2 / 3,    // A급여(소득재분배급여금액)의 2/3를 기준연금액에서 뺌
      npsARatio: 0.5,           // A급여를 모를 때 국민연금 급여액의 절반으로 가정
      npsSupplementRatio: 0.5
    }
  };

  var R = NP.RULES;

  /* ── 공통 도우미 ───────────────────────────────────────── */
  function num(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clampInt(v, lo, hi) {
    var n = Math.round(num(v, lo));
    return Math.min(hi, Math.max(lo, n));
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, num(v, lo))); }
  function won0(n) { return Math.max(0, Math.round(num(n, 0))); }

  NP.util = { num: num, clamp: clamp, clampInt: clampInt, won0: won0 };

  /** 출생연도 → 노령연금 지급개시 연령 */
  NP.claimAge = function (birthYear) {
    var y = clampInt(birthYear, 1900, 2010);
    if (y <= 1952) return 60;
    if (y <= 1956) return 61;
    if (y <= 1960) return 62;
    if (y <= 1964) return 63;
    if (y <= 1968) return 64;
    return 65;
  };

  /* ══════════════ 1. 예상 노령연금 ══════════════ */
  /**
   * input: {
   *   years: 가입기간(년, 10~40),
   *   avgIncome: 평균 기준소득월액(원),
   *   birthYear: 출생연도,
   *   spouse: 배우자 부양 여부,
   *   others: 자녀·부모 부양가족 수(0~5)
   * }
   */
  NP.expected = function (input) {
    var d = input || {};
    var years = clamp(d.years, 10, 40);
    var months = Math.round(years * 12);
    var B = clamp(d.avgIncome, R.baseIncomeMin, R.baseIncomeMax);
    var A = R.aValue;
    var claimAge = NP.claimAge(d.birthYear);

    // 기본연금액(연) = 1.29 × (A + B) × (1 + 0.05 × 20년 초과 연수)
    var over = Math.max(0, years - 20);
    var annualBase = R.constant2026 * (A + B) * (1 + R.over20AnnualGain * over);
    var monthlyBase = annualBase / 12;

    // 지급률: 10년 50% → 20년 100%
    var payoutRate = years < 20
      ? R.under20Base + R.under20Step * (years - 10)
      : 1;

    // 월 연금액은 평균 기준소득월액(재평가)을 넘지 못함(법 제53조)
    var basic = Math.min(monthlyBase * payoutRate, B);

    var depSpouse = d.spouse ? R.dependent.spouse : 0;
    var depOthers = clampInt(d.others, 0, 5) * R.dependent.other;

    var monthly = basic + depSpouse + depOthers;
    var employeePremium = B * R.premiumRate * 0.5;   // 사업장가입자 본인 부담분(월)
    var totalPaid = employeePremium * months;
    var recoupMonths = basic > 0 ? Math.ceil(totalPaid / basic) : 0;

    return {
      years: years,
      months: months,
      avgIncome: B,
      birthYear: clampInt(d.birthYear, 1900, 2010),
      claimAge: claimAge,
      aValue: A,
      annualBase: annualBase,
      monthlyBase: monthlyBase,
      payoutRate: payoutRate,
      basic: basic,
      capped: monthlyBase * payoutRate > B,
      depSpouse: depSpouse,
      depOthers: depOthers,
      dependentTotal: depSpouse + depOthers,
      monthly: monthly,
      annual: monthly * 12,
      replacementRate: B > 0 ? basic / B : 0,
      monthlyPremium: B * R.premiumRate,
      employeePremium: employeePremium,
      totalPaid: totalPaid,
      recoupMonths: recoupMonths,
      recoupYears: recoupMonths / 12,
      workIncomeThreshold: R.workIncomeThreshold
    };
  };

  /* ══════════════ 2. 조기·정상·연기 시나리오 ══════════════ */
  /**
   * 정상 수급연령 기준 기본연금액(부양가족연금 제외)을 개시 연령별로 가감.
   * input: { years, avgIncome } — basic 만 씀
   */
  NP.scenarioMonthly = function (base, startAge, claimAge) {
    var diff = startAge - claimAge;
    var factor;
    if (diff < 0) {
      factor = 1 - R.early.perYear * Math.min(-diff, R.early.maxYears);
    } else if (diff > 0) {
      factor = 1 + R.defer.perYear * Math.min(diff, R.defer.maxYears);
    } else {
      factor = 1;
    }
    return { startAge: startAge, factor: factor, monthly: base * factor };
  };

  /** 개시 연령 목록(수급연령 −5 ~ +5)의 월액·비교나이까지 누적액 */
  NP.scenarios = function (input, compareAge) {
    var d = input || {};
    var exp = NP.expected({ years: d.years, avgIncome: d.avgIncome, birthYear: d.birthYear });
    var claimAge = exp.claimAge;
    var base = exp.basic;
    var cmp = compareAge || claimAge + 15;

    var rows = [];
    for (var age = claimAge - 5; age <= claimAge + 5; age++) {
      if (age < 60) continue;
      var sc = NP.scenarioMonthly(base, age, claimAge);
      var months = Math.max(0, Math.round((cmp - age) * 12));
      rows.push({
        startAge: age,
        yearsEarly: Math.max(0, claimAge - age),
        yearsDeferred: Math.max(0, age - claimAge),
        factor: sc.factor,
        monthly: sc.monthly,
        cumulative: sc.monthly * months,
        isNormal: age === claimAge,
        maxEarly: age === claimAge - 5 && claimAge - 5 >= 60,
        maxDefer: age === claimAge + 5
      });
    }
    return { claimAge: claimAge, base: base, compareAge: cmp, rows: rows };
  };

  /**
   * 누적 수령액 손익분기 나이.
   * 조기 y년: f(t−start) = (t−claim) → t = (claim − f×start) / (1 − f)
   * 연기 y년: (t−claim) = f(t−start) → t = (claim − f×start) / (1 − f)
   */
  NP.breakEven = function (claimAge, years) {
    var early = years < 0;
    var f = early ? 1 - R.early.perYear * (-years) : 1 + R.defer.perYear * years;
    var start = claimAge + years;
    var t = (claimAge - f * start) / (1 - f);
    return Math.round(t * 10) / 10;
  };

  /* ══════════════ 3. 기초연금 모의계산 ══════════════ */
  /**
   * input: {
   *   couple: 부부가구, dual: 부부 2인 수급,
   *   region: 'metro' | 'city' | 'rural',
   *   labor: 본인 근로소득(월), laborSpouse: 배우자 근로소득(월),
   *   interest: 이자소득(월), nps: 본인 국민연금(월), npsSpouse: 배우자 국민연금(월),
   *   realAsset: 일반재산, finAsset: 금융재산, debt: 부채
   * }
   */
  NP.basicPension = function (input) {
    var d = input || {};
    var B = R.basic;
    var couple = !!d.couple;
    var dual = couple && !!d.dual;
    var region = B.assetBase[d.region] ? d.region : 'city';

    function personPerson(o) {
      var o2 = o || {};
      var labor = won0(o2.labor);
      var interest = won0(o2.interest);
      var nps = won0(o2.nps);

      var rows = [];

      // 근로소득: 116만원 기본공제 + 나머지 30% 추가공제, 남은 70%만 산입
      var laborCounted = 0;
      if (labor > B.laborDeduct) {
        laborCounted = (labor - B.laborDeduct) * (1 - B.laborExtraRate);
      }
      if (labor > 0) {
        rows.push({
          key: 'labor', label: '근로소득 평가액',
          value: Math.round(laborCounted),
          note: '월 ' + labor.toLocaleString('ko-KR') + '원 − 기본공제 116만원 − 추가공제 30%'
        });
      }

      // 이자소득: 월 4만원 제외
      var interestCounted = Math.max(0, interest - B.interestDeduct);
      if (interest > 0) {
        rows.push({
          key: 'interest', label: '이자소득 평가액',
          value: Math.round(interestCounted),
          note: '월 4만원 공제 후'
        });
      }

      // 국민연금 연계(소득역전방지기준): 기준연금액 이하면 제외, 초과하면 전액 산입
      var npsCounted = 0;
      if (nps > 0) {
        npsCounted = nps <= B.basePension ? 0 : nps;
        rows.push({
          key: 'nps', label: '국민연금 소득 산입액',
          value: Math.round(npsCounted),
          note: npsCounted === 0
            ? '기준연금액(349,700원) 이하라 제외'
            : '기준연금액 초과 → 월 수령액 전액 산입'
        });
      }

      return { rows: rows, income: laborCounted + interestCounted + npsCounted };
    }

    var self = personPerson({ labor: d.labor, interest: d.interest, nps: d.nps });
    var spouse = dual ? personPerson({ labor: d.laborSpouse, interest: 0, nps: d.npsSpouse }) : null;

    // 재산의 소득환산액: (일반재산 − 기본재산액 + 금융재산 − 2,000만원 − 부채) × 연 4% ÷ 12
    var realAsset = won0(d.realAsset);
    var finAsset = won0(d.finAsset);
    var debt = won0(d.debt);
    var baseAsset = B.assetBase[region];
    var assetNet = realAsset - baseAsset + finAsset - B.financeDeduct - debt;
    var assetMonthly = Math.max(0, assetNet) * B.assetAnnualRate / 12;
    var assetRows = [];
    assetRows.push({
      key: 'assetBase', label: '기본재산액 공제', value: -baseAsset,
      note: region === 'metro' ? '대도시 1억 3,500만원' : region === 'rural' ? '농어촌 7,250만원' : '중소도시 8,500만원'
    });
    if (finAsset > 0 || realAsset > 0) {
      assetRows.push({
        key: 'assetFin', label: '금융재산 공제', value: -B.financeDeduct,
        note: '가구당 2,000만원'
      });
    }
    if (debt > 0) {
      assetRows.push({ key: 'assetDebt', label: '부채 차감', value: -debt, note: '확인된 부채액' });
    }
    if (assetMonthly > 0) {
      assetRows.push({
        key: 'assetConv', label: '재산의 월 소득환산액', value: Math.round(assetMonthly),
        note: '환산 대상 재산 × 연 4% ÷ 12'
      });
    }

    var incomeRecognized = self.income + assetMonthly + (spouse ? spouse.income : 0);
    var selectLimit = couple ? B.selectCouple : B.selectSingle;
    var eligible = incomeRecognized <= selectLimit;

    // 기초연금액: 국민연금 수급권자는 소득재분배급여금액(A급여)으로 감액, 아니면 기준연금액
    //  · 기준연금액의 150% 이하 → 기준연금액 전액(법 제6조①)
    //  · 150~200% → 시행령 제10조(기준연금액×250% − 연금액)와 제5조 산정식 중 큰 금액
    //  · 200% 초과 → 제5조 산정식(기준연금액 − A급여×2/3 + 부가연금액)
    //  A급여는 개인 가입이력에 따라 달라 입력받지 않으므로, 국민연금 급여액의 절반으로 가정합니다.
    function amountFor(nps) {
      var n = won0(nps);
      if (n === 0) return B.basePension;
      if (n <= B.basePension * B.npsFullCapRatio) return B.basePension; // 법 제6조 ①
      var aValue = n * B.npsARatio;
      var byFormula = Math.max(0, B.basePension - aValue * B.npsDeductRatio) + B.basePension * B.npsSupplementRatio;
      var by250 = B.basePension * 2.5 - n; // 시행령 제10조(150~200% 구간)
      var reduced = n <= B.basePension * 2 ? Math.max(byFormula, by250) : byFormula;
      return Math.min(Math.max(reduced, 0), B.basePension);
    }

    var selfAmount = eligible ? amountFor(d.nps) : 0;
    var spouseAmount = eligible && dual ? amountFor(d.npsSpouse) : 0;
    if (dual) {
      selfAmount *= (1 - B.coupleReduction);
      spouseAmount *= (1 - B.coupleReduction);
    }

    var notes = [];
    if (couple && !dual) {
      notes.push('부부가구는 1인만 수급해도 배우자의 소득·재산을 함께 조사합니다. 두 분 모두 수급하면 각 20% 감액됩니다.');
    }
    if (d.nps > 0) {
      notes.push('국민연금을 받으면 소득연계 감액이 적용됩니다. 월 524,550원(기준연금액의 150%) 이하면 전액 지급되고, 그 위에서는 소득재분배급여금액에 따라 줄어들며 가장 적어도 17만 4,850원은 받습니다. 이 계산기는 소득재분배급여금액을 국민연금 급여액의 절반으로 가정했습니다.');
    }
    notes.push('기초연금액은 소득인정액이 선정기준액 이하일 때 기준연금액(349,700원)이 원칙입니다. 실제로는 가구 조사와 감액 규정에 따라 달라질 수 있습니다.');

    var rowsAll = self.rows.concat(assetRows);
    if (spouse) rowsAll = rowsAll.concat(spouse.rows.map(function (r) {
      return { key: 'sp-' + r.key, label: '배우자 ' + r.label, value: Math.round(r.value), note: r.note };
    }));

    return {
      couple: couple,
      dual: dual,
      region: region,
      selfIncome: Math.round(self.income),
      spouseIncome: spouse ? Math.round(spouse.income) : 0,
      assetMonthly: Math.round(assetMonthly),
      incomeRecognized: Math.round(incomeRecognized),
      selectLimit: selectLimit,
      eligible: eligible,
      over: Math.max(0, Math.round(incomeRecognized - selectLimit)),
      rows: rowsAll,
      selfAmount: Math.round(selfAmount),
      spouseAmount: Math.round(spouseAmount),
      householdAmount: Math.round(selfAmount + spouseAmount),
      basePension: B.basePension,
      notes: notes
    };
  };

  NP.LIMITS = {
    years: { min: 10, max: 40 },
    income: { min: 0, max: 20000000 },
    birthYear: { min: 1930, max: 2000 },
    others: { min: 0, max: 5 },
    money: { min: 0, max: 5000000000 },
    labor: { min: 0, max: 20000000 }
  };

  global.NPCalc = NP;
})(typeof window !== 'undefined' ? window : this);
