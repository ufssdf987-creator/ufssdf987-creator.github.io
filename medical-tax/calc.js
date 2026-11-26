/*!
 * MTCalc — 2026년 귀속 의료비 세액공제 계산 엔진
 * ------------------------------------------------------------
 * DOM에 의존하지 않는 순수 모듈입니다. 브라우저(app.js)와 테스트(QuickJS)가 같은 코드를 씁니다.
 *
 * 기준 확인일: 2026-11-26 (2026년 귀속 = 2027년 1~2월 연말정산)
 *  - 소득세법 제59조의4 제2항(특별세액공제 중 의료비)
 *      · 문턱: 총급여액 × 3%를 넘는 금액부터 (제1호)
 *      · 일반 부양가족 의료비: 공제 대상금액 연 700만원 한도, 15% (제1호)
 *      · 본인·과세기간 개시일 현재 6세 이하·과세기간 종료일 현재 65세 이상·장애인·
 *        중증질환자·희귀난치성질환자·결핵환자(건강보험 산정특례자): 한도 없음, 15% (제2호)
 *      · 미숙아·선천성이상아: 한도 없음, 20% (제3호)
 *      · 난임시술비(처방 의약품 포함): 한도 없음, 30% (제4호)
 *      · 문턱 차감 순서(각 호 단서): 제1호 → 제2호 → 제3호 → 제4호 (공제율이 낮은 쪽부터)
 *  - 같은 법 시행령 제118조의5
 *      · 의료비 범위: 의료기관 진찰·치료·질병예방, 의약품(한약 포함), 장애인 보장구·처방 의료기기,
 *        시력보정용 안경·콘택트렌즈(1명당 연 50만원), 보청기, 장기요양급여 본인부담금,
 *        활동지원급여 본인부담금, 산후조리원(출산 1회당 200만원)
 *      · 실손의료보험금 등으로 보전받은 금액은 제외
 *      · 미용·성형수술 비용, 건강증진을 위한 의약품 구입비용은 제외
 *      · 산후조리원의 총급여 7,000만원 이하 요건은 2024.1.1. 지출분부터 삭제
 *  - 세액공제 → 산출세액에서 직접 차감, 개인지방소득세는 소득세의 10%
 *  - 4세대 실손의료보험: 급여 자기부담 20%, 비급여 자기부담 30%(통원 최소 3만원),
 *    비급여 보험금 지급액에 따른 특약보험료 5단계 할인·할증(2024.7. 이후 갱신분)
 *
 * 모든 결과는 참고용 모의 계산입니다.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MTCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ────────────────────────────────────────────────────────────
   * 1. 2026년 기준값
   * ──────────────────────────────────────────────────────────── */
  var RULES = {
    year: 2026,
    verifiedAt: "2026-11-26",

    /* 총급여 3% 문턱 — 제59조의4 제2항 제1호 */
    thresholdRate: 0.03,

    /* 일반 부양가족 의료비 공제 대상금액 한도 — 제1호 단서 */
    generalLimit: 7000000,

    /* 시력보정용 안경·콘택트렌즈 1명당 연 한도 — 시행령 제118조의5 제1항 제4호 */
    glassesLimit: 500000,

    /* 산후조리원 출산 1회당 한도 — 시행령 제118조의5 제1항 제7호 */
    postpartumLimit: 2000000,

    /* 공제율 — 제59조의4 제2항 */
    rates: {
      general: 0.15,
      special: 0.15,
      premature: 0.20,
      infertility: 0.30
    },

    localTaxRate: 0.10,

    /* 4세대·5세대 실손 자기부담·통원 공제 (2026년 기준) */
    insurance: {
      benefitSelfPay: 0.20,        // 급여 자기부담률
      nonBenefitSelfPay: 0.30,     // 4세대 비급여 자기부담률 (5세대 중증 비급여도 30%)
      fifthNonSevereSelfPay: 0.50, // 5세대 비중증 비급여 자기부담률
      clinicDeduct: 10000,         // 통원 급여 최소 공제(의원)
      hospitalDeduct: 20000,       // 통원 급여 최소 공제(상급·종합병원)
      nonBenefitDeduct: 30000,     // 통원 비급여 최소 공제
      fifthNonSevereDeduct: 50000, // 5세대 비중증 통원 최소 공제
      discountRate: 0.05,          // 1등급 비급여 특약 할인율(보험사별 4.1~11%)
      tiers: [
        { upTo: 0, step: 1, label: "1단계 할인", surcharge: 0, discount: true },
        { upTo: 1000000, step: 2, label: "2단계 유지", surcharge: 0, discount: false },
        { upTo: 1500000, step: 3, label: "3단계 100% 할증", surcharge: 1.0, discount: false },
        { upTo: 3000000, step: 4, label: "4단계 200% 할증", surcharge: 2.0, discount: false },
        { upTo: Infinity, step: 5, label: "5단계 300% 할증", surcharge: 3.0, discount: false }
      ]
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

    /* 2026년 국민연금 근로자 부담 4.75% (월 소득 상한 659만원 → 연 7,908만원) */
    npsRate: 0.0475,
    npsAnnualCap: 6590000 * 12,

    /* 기본공제 1인 150만원 — 과세표준 추정에만 사용 */
    basicDeduction: 1500000,

    /* 종합소득세 기본세율 — 소득세법 제55조 */
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

  /* 입력 한계 */
  var LIMITS = {
    salary: { min: 0, max: 300000000, step: 1000000 },
    money: { min: 0, max: 50000000, step: 10000 },
    people: { min: 1, max: 6 },
    births: { min: 1, max: 3 },
    premium: { min: 0, max: 200000, step: 1000 }
  };

  /* 의료비 구분 메타 (화면·표에서 공통 사용) */
  var CATS = [
    {
      key: "general",
      name: "일반 부양가족 의료비",
      short: "일반",
      rate: 0.15,
      limit: 7000000,
      tone: "brand",
      who: "배우자·7세 이상 자녀·65세 미만 부모 등"
    },
    {
      key: "special",
      name: "본인·6세 이하·65세 이상·장애인·산정특례",
      short: "본인·고령·장애",
      rate: 0.15,
      limit: 0,
      tone: "mint",
      who: "한도 없음"
    },
    {
      key: "premature",
      name: "미숙아·선천성이상아",
      short: "미숙아·선천성",
      rate: 0.20,
      limit: 0,
      tone: "gold",
      who: "한도 없음"
    },
    {
      key: "infertility",
      name: "난임시술비",
      short: "난임시술",
      rate: 0.30,
      limit: 0,
      tone: "hot",
      who: "한도 없음"
    }
  ];

  /* 문턱을 깎는 순서 — 제1호 → 제2호 → 제3호 → 제4호 */
  var ORDER = ["general", "special", "premature", "infertility"];

  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function clampInt(v, lo, hi, fallback) {
    var n = Math.floor(num(v));
    if (!isFinite(n) || n <= 0) return fallback;
    return Math.min(hi, Math.max(lo, n));
  }

  function floorTo(v, unit) {
    return Math.floor(v / unit) * unit;
  }

  function catMeta(key) {
    for (var i = 0; i < CATS.length; i++) {
      if (CATS[i].key === key) return CATS[i];
    }
    return null;
  }

  /* ────────────────────────────────────────────────────────────
   * 2. 세율·과세표준 추정
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

  /** 근로소득공제 + 국민연금 + 기본공제만 반영한 과세표준 추정 */
  function estimateTaxable(salary, dependents) {
    var s = Math.max(0, num(salary));
    var people = Math.max(1, Math.floor(num(dependents) || 1));
    var nps = RULES.npsRate * Math.min(s, RULES.npsAnnualCap);
    var taxable = s - earnedDeduction(s) - nps - RULES.basicDeduction * people;
    return Math.max(0, floorTo(taxable, 10));
  }

  function marginalRate(taxable) {
    var t = Math.max(0, num(taxable));
    for (var i = 0; i < RULES.brackets.length; i++) {
      if (t <= RULES.brackets[i].upTo) return RULES.brackets[i];
    }
    return RULES.brackets[RULES.brackets.length - 1];
  }

  /** 과세표준 → 산출세액 (누진공제 방식) */
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

  /**
   * creditBenefit(salary, dependents, credit)
   *  - credit : 의료비로 계산된 세액공제액
   *  - 산출세액을 넘는 세액공제는 반영되지 않으므로 cap 합니다.
   */
  function creditBenefit(salary, dependents, credit) {
    var taxable = estimateTaxable(salary, dependents);
    var bracket = marginalRate(taxable);
    var incomeTax = incomeTaxOf(taxable);
    var wanted = Math.max(0, num(credit));
    var applied = Math.min(wanted, incomeTax);
    return {
      taxable: taxable,
      bracket: bracket,
      incomeTax: incomeTax,
      credit: wanted,
      applied: applied,
      capped: applied < wanted - 0.5,
      localTax: Math.round(applied * RULES.localTaxRate),
      total: applied + Math.round(applied * RULES.localTaxRate)
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 3. 의료비 세액공제 (제59조의4 제2항)
   * ──────────────────────────────────────────────────────────── */
  /**
   * input = {
   *   salary, general, self, familySpecial, premature, infertility,
   *   glasses, glassesPeople, postpartum, births,
   *   insurance, insuranceTarget
   * }
   *  - general       : 일반 부양가족 의료비 (안경·산후조리원 제외)
   *  - self          : 근로자 본인 의료비
   *  - familySpecial : 6세 이하·65세 이상·장애인·산정특례자 의료비
   *  - glasses       : 시력보정용 안경·콘택트렌즈 구입비 (1명당 50만원까지 인정)
   *  - postpartum    : 산후조리원 비용 (출산 1회당 200만원까지 인정)
   *  - insurance     : 실손의료보험금 등으로 보전받은 금액
   *  - insuranceTarget : 실손을 받은 진료 구분(general|special|premature|infertility)
   */
  function medicalCredit(input) {
    input = input || {};
    var salary = Math.max(0, num(input.salary));

    var spent = {
      general: Math.max(0, num(input.general)),
      self: Math.max(0, num(input.self)),
      familySpecial: Math.max(0, num(input.familySpecial)),
      premature: Math.max(0, num(input.premature)),
      infertility: Math.max(0, num(input.infertility)),
      glasses: Math.max(0, num(input.glasses)),
      postpartum: Math.max(0, num(input.postpartum))
    };

    var glassesPeople = clampInt(input.glassesPeople, LIMITS.people.min, LIMITS.people.max, 1);
    var births = clampInt(input.births, LIMITS.births.min, LIMITS.births.max, 1);

    var glassesAllowed = Math.min(spent.glasses, RULES.glassesLimit * glassesPeople);
    var postpartumAllowed = Math.min(spent.postpartum, RULES.postpartumLimit * births);
    var glassesOver = Math.max(0, spent.glasses - glassesAllowed);
    var postpartumOver = Math.max(0, spent.postpartum - postpartumAllowed);

    /* 제1호 = 일반 + 안경(한도 내) + 산후조리원(한도 내), 제2호 = 본인 + 특정 가족 */
    var base = {
      general: spent.general + glassesAllowed + postpartumAllowed,
      special: spent.self + spent.familySpecial,
      premature: spent.premature,
      infertility: spent.infertility
    };
    var baseTotal = base.general + base.special + base.premature + base.infertility;

    /* ── 실손의료보험금 차감 (시행령 제118조의5 제1항) ── */
    var insurance = Math.max(0, num(input.insurance));
    var target = ORDER.indexOf(input.insuranceTarget) >= 0 ? input.insuranceTarget : "general";
    var insOrder = [target].concat(ORDER.filter(function (k) { return k !== target; }));
    var insUsed = { general: 0, special: 0, premature: 0, infertility: 0 };
    var insLeft = insurance;
    insOrder.forEach(function (key) {
      if (insLeft <= 0) return;
      var use = Math.min(base[key], insLeft);
      base[key] -= use;
      insUsed[key] += use;
      insLeft -= use;
    });
    var insuranceUnused = Math.max(0, insLeft);
    var afterInsurance = base.general + base.special + base.premature + base.infertility;

    /* ── 총급여 3% 문턱 차감 ── */
    var threshold = floorTo(salary * RULES.thresholdRate, 1);
    var rem = threshold;
    var used = { general: 0, special: 0, premature: 0, infertility: 0 };
    ORDER.forEach(function (key) {
      if (rem <= 0) return;
      var use = Math.min(base[key], rem);
      base[key] -= use;
      used[key] += use;
      rem -= use;
    });
    var thresholdShort = Math.max(0, rem);
    var afterThreshold = base.general + base.special + base.premature + base.infertility;

    /* ── 한도 적용 ── */
    var generalCreditBase = Math.min(base.general, RULES.generalLimit);
    var generalForfeit = Math.max(0, base.general - RULES.generalLimit);
    var creditBase = {
      general: generalCreditBase,
      special: base.special,
      premature: base.premature,
      infertility: base.infertility
    };
    var deductible = creditBase.general + creditBase.special + creditBase.premature + creditBase.infertility;

    var byCat = {};
    ORDER.forEach(function (key) {
      byCat[key] = creditBase[key] * RULES.rates[key];
    });
    var credit = byCat.general + byCat.special + byCat.premature + byCat.infertility;

    var spendTotal = spent.general + spent.self + spent.familySpecial + spent.premature +
      spent.infertility + spent.glasses + spent.postpartum;
    var insuranceTotal = insurance - insuranceUnused;

    return {
      salary: salary,
      spent: spent,
      glassesAllowed: glassesAllowed,
      glassesOver: glassesOver,
      glassesPeople: glassesPeople,
      postpartumAllowed: postpartumAllowed,
      postpartumOver: postpartumOver,
      births: births,
      threshold: threshold,
      baseBeforeInsurance: baseTotal,
      insurance: insurance,
      insuranceUsed: insuranceTotal,
      insuranceUnused: insuranceUnused,
      insuranceTarget: target,
      insUsed: insUsed,
      afterInsurance: afterInsurance,
      used: used,
      thresholdShort: thresholdShort,
      passed: afterInsurance > threshold,
      gap: Math.max(0, threshold - afterInsurance),
      over: Math.max(0, afterInsurance - threshold),
      baseAfterThreshold: afterThreshold,
      creditBase: creditBase,
      generalForfeit: generalForfeit,
      deductible: deductible,
      byCat: byCat,
      credit: credit,
      spendTotal: spendTotal,
      maxGeneral: RULES.generalLimit,
      generalRoom: Math.max(0, RULES.generalLimit - generalCreditBase)
    };
  }

  /** 의료비 입력 + 한계세율·부양가족 → 공제액과 예상 절세액 */
  function medicalBenefit(input, dependents) {
    var m = medicalCredit(input);
    var b = creditBenefit(m.salary, dependents, m.credit);
    return { medical: m, benefit: b };
  }

  /* ────────────────────────────────────────────────────────────
   * 4. 실손보험 청구 vs 의료비 공제 손익 (탭 2)
   * ──────────────────────────────────────────────────────────── */
  function premiumTier(nonBenefitPaid) {
    var n = Math.max(0, num(nonBenefitPaid));
    var tiers = RULES.insurance.tiers;
    if (n <= 0) return tiers[0];
    for (var i = 1; i < tiers.length; i++) {
      if (n < tiers[i].upTo) return tiers[i];
    }
    return tiers[tiers.length - 1];
  }

  /**
   * insurancePlan(o)
   *  o = { salary, benefit, nonBenefit, visit: 'outpatient'|'inpatient',
   *        hospital: 'clinic'|'general', generation: 4|5, severe: true|false,
   *        monthlyPremium, priorNonBenefit, thresholdPassed, dependents }
   *
   *  - benefit      : 내가 낸 급여 본인부담금
   *  - nonBenefit   : 내가 낸 비급여 진료비
   *  - monthlyPremium : 비급여 특약 월 보험료(차등제 대상)
   *  - priorNonBenefit: 올해 이미 받은 비급여 보험금(등급 산정용)
   */
  function insurancePlan(o) {
    o = o || {};
    var benefit = Math.max(0, num(o.benefit));
    var nonBenefit = Math.max(0, num(o.nonBenefit));
    var outpatient = o.visit !== "inpatient";
    var genRaw = Number(o.generation);
    var gen = genRaw === 5 ? 5 : (genRaw === 0 ? 0 : 4);
    var severe = !!o.severe;

    var benefitDeduct = outpatient
      ? (o.hospital === "general" ? RULES.insurance.hospitalDeduct : RULES.insurance.clinicDeduct)
      : 0;
    var benefitPaid = Math.max(0, benefit * (1 - RULES.insurance.benefitSelfPay) - benefitDeduct);

    var rate = RULES.insurance.nonBenefitSelfPay;
    var nonDeduct = RULES.insurance.nonBenefitDeduct;
    if (gen === 0) {
      /* 1~3세대: 급여·비급여 모두 80% 보장, 비급여 통원 최소공제 없음 */
      rate = 0.20;
      nonDeduct = 0;
    } else if (gen === 5 && !severe) {
      rate = RULES.insurance.fifthNonSevereSelfPay;
      nonDeduct = RULES.insurance.fifthNonSevereDeduct;
    }
    var nonDeductAmt = outpatient ? nonDeduct : 0;
    var nonBenefitPaid = Math.max(0, nonBenefit * (1 - rate) - nonDeductAmt);

    var paid = benefitPaid + nonBenefitPaid;
    var selfPay = Math.max(0, benefit + nonBenefit - paid);

    /* 세액공제 손실 = 보험금만큼 의료비가 줄어 공제 대상금액이 줄어드는 몫 × 15% × 지방세 1.1 */
    var creditLoss = o.thresholdPassed === false
      ? 0
      : paid * RULES.rates.general * (1 + RULES.localTaxRate);

    /* 4세대·5세대 비급여 차등제 — 청구 전 등급과 청구 후 등급의 차이만 비용으로 봅니다 */
    var prior = Math.max(0, num(o.priorNonBenefit));
    var cumulative = prior + nonBenefitPaid;
    var tier = premiumTier(cumulative);
    var tierBefore = premiumTier(prior);

    function tierFactor(t) {
      if (t.discount) return -RULES.insurance.discountRate;
      return t.surcharge;
    }

    var monthlyPremium = Math.max(0, num(o.monthlyPremium));
    var deltaFactor = tierFactor(tier) - tierFactor(tierBefore);
    var premiumCost = gen === 0 ? 0 : Math.max(0, monthlyPremium * 12 * deltaFactor);
    if (monthlyPremium === 0) premiumCost = 0;

    var net = paid - creditLoss - premiumCost;

    return {
      benefit: benefit,
      nonBenefit: nonBenefit,
      generation: gen,
      severe: severe,
      visit: outpatient ? "outpatient" : "inpatient",
      hospital: o.hospital === "general" ? "general" : "clinic",
      selfPayRate: rate,
      benefitPaid: benefitPaid,
      nonBenefitPaid: nonBenefitPaid,
      paid: paid,
      selfPay: selfPay,
      creditLoss: creditLoss,
      cumulativeNonBenefit: cumulative,
      tier: tier,
      tierBefore: tierBefore,
      monthlyPremium: monthlyPremium,
      premiumCost: premiumCost,
      deltaFactor: deltaFactor,
      net: net,
      claimAdvice: net > 0 ? "claim" : (net > -10000 ? "even" : "skip"),
      /* 실손 청구 없이 공제만 받을 때 */
      noClaim: { paid: 0, creditLoss: 0, premiumCost: 0, net: 0 }
    };
  }

  /** 비급여 청구액이 이 금액을 넘으면 할증 비용이 보험금을 잠식하는 지점(월 보험료 기준) */
  function premiumBreakEven(monthlyPremium, priorNonBenefit) {
    var monthly = Math.max(0, num(monthlyPremium));
    var prior = Math.max(0, num(priorNonBenefit));
    if (monthly === 0) return null;
    var tiers = RULES.insurance.tiers;
    var out = [];
    for (var i = 2; i < tiers.length; i++) {
      var tier = tiers[i];
      var from = tiers[i - 1].upTo;
      var cost = monthly * 12 * tier.surcharge;
      out.push({ step: tier.step, label: tier.label, from: from, cost: cost, prior: prior });
    }
    return out;
  }

  /* ────────────────────────────────────────────────────────────
   * 5. 맞벌이 부부 몰아주기 (탭 3)
   * ──────────────────────────────────────────────────────────── */
  /**
   * couplePlan(o)
   *  o = { aSalary, bSalary, aSelf, bSelf, shared, claim: 'a'|'b', dependentsA, dependentsB }
   *  - aSelf / bSelf : A·B 각자 본인 의료비 (한도 없음, 각자만 공제 가능)
   *  - shared        : 자녀·부모님 등 부양가족 의료비 (일반, 700만원 한도)
   *  - claim         : shared 의료비를 지출하고 그 부양가족의 기본공제를 받는 쪽
   */
  function couplePlan(o) {
    o = o || {};
    var aSalary = Math.max(0, num(o.aSalary));
    var bSalary = Math.max(0, num(o.bSalary));
    var aSelf = Math.max(0, num(o.aSelf));
    var bSelf = Math.max(0, num(o.bSelf));
    var shared = Math.max(0, num(o.shared));
    var claim = o.claim === "b" ? "b" : "a";
    var depA = Math.max(1, Math.floor(num(o.dependentsA) || 1));
    var depB = Math.max(1, Math.floor(num(o.dependentsB) || 1));

    function side(salary, self, sharedAmt, dependents) {
      var m = medicalCredit({
        salary: salary,
        general: sharedAmt,
        self: self,
        insuranceTarget: "general"
      });
      var b = creditBenefit(salary, dependents, m.credit);
      return {
        salary: salary,
        self: self,
        shared: sharedAmt,
        medical: m,
        benefit: b,
        credit: m.credit,
        saving: b.total,
        threshold: m.threshold,
        passed: m.passed,
        gap: m.gap
      };
    }

    function scenario(key, name, note, sharedA, sharedB) {
      var a = side(aSalary, aSelf, sharedA, depA);
      var b = side(bSalary, bSelf, sharedB, depB);
      return {
        key: key,
        name: name,
        note: note,
        a: a,
        b: b,
        credit: a.credit + b.credit,
        saving: a.saving + b.saving
      };
    }

    var byA = scenario("a", "A에게 몰아주기", "A가 자녀·부모님 의료비 지출·기본공제", shared, 0);
    var byB = scenario("b", "B에게 몰아주기", "B가 자녀·부모님 의료비 지출·기본공제", 0, shared);
    var mismatch = scenario("mismatch", "지출자≠기본공제자", "지출한 사람과 기본공제 받는 사람이 다르면 아무도 공제 못 받음", 0, 0);

    var chosen = { a: byA, b: byB, mismatch: mismatch }[claim] || byA;
    var best = byA.saving >= byB.saving ? byA : byB;
    var worst = byA.saving <= byB.saving ? byA : byB;
    var thresholds = {
      a: Math.floor(aSalary * RULES.thresholdRate),
      b: Math.floor(bSalary * RULES.thresholdRate)
    };

    return {
      aSalary: aSalary,
      bSalary: bSalary,
      shared: shared,
      claim: claim,
      chosen: chosen,
      byA: byA,
      byB: byB,
      mismatch: mismatch,
      best: best,
      worst: worst,
      bestSide: best.a.saving >= best.b.saving ? "a" : "b",
      gain: best.saving - chosen.saving,
      gapToBest: best.saving - chosen.saving,
      maxGain: best.saving - mismatch.saving,
      thresholds: thresholds,
      scenarios: [byA, byB, mismatch]
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 6. 내보내기
   * ──────────────────────────────────────────────────────────── */
  return {
    RULES: RULES,
    LIMITS: LIMITS,
    CATS: CATS,
    ORDER: ORDER,
    catMeta: catMeta,
    earnedDeduction: earnedDeduction,
    estimateTaxable: estimateTaxable,
    marginalRate: marginalRate,
    incomeTaxOf: incomeTaxOf,
    creditBenefit: creditBenefit,
    medicalCredit: medicalCredit,
    medicalBenefit: medicalBenefit,
    premiumTier: premiumTier,
    insurancePlan: insurancePlan,
    premiumBreakEven: premiumBreakEven,
    couplePlan: couplePlan
  };
});
