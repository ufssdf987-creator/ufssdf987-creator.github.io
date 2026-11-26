/*!
 * calc.js — 2026 건강보험료 · 피부양자 자격 · 임의계속가입 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.HealthCalc 로 노출합니다.
 *
 * 근거 (2026년 1월분부터 적용)
 *  - 건강보험료율 7.19% (직장·지역 동일), 재산보험료부과점수당 211.5원
 *      국민건강보험법 시행령 제44조 (2025.12.23 개정)
 *  - 장기요양보험료율 0.9448% (소득 대비), 건강보험료 대비 13.14%
 *      노인장기요양보험법 시행령 제4조, 보건복지부 2026년도 장기요양보험료율
 *  - 지역가입자: [소득월액 × 7.19%] + [재산보험료부과점수 × 211.5원]
 *      국민건강보험법 제69조제5항, 제71조제2항, 제72조
 *  - 지역가입자 소득월액: 연간 소득 ÷ 12, 근로·연금 50%, 사업·기타·이자배당 100%
 *      (이자·배당은 연 1,000만원 이하면 미반영), 소득월액 28만원 이하는 하한 적용
 *      시행규칙 제44조
 *  - 재산: 재산세 과세표준 합 − 기본공제 1억원 → 60등급 점수 (자동차는 2022.7부터 부과 폐지)
 *      시행령 별표 4
 *  - 상한 4,591,740원 · 하한 20,160원: 「월별 건강보험료액의 상한과 하한에 관한 고시」
 *      (보건복지부고시 제2025-222호, 2026.1.1 시행)
 *  - 피부양자 소득·재산 요건: 시행규칙 별표 1의2 (2025.4.23 개정)
 *      · 소득 합계 연 2,000만원 이하, 사업소득은 없을 것
 *        (사업자등록이 없거나 장애인·유공자 등이면 사업소득 연 500만원 이하까지 인정,
 *         주택임대소득이 있으면 이 예외를 쓰지 못함)
 *      · 재산세 과세표준 합 5.4억원 이하 / 5.4억 초과 9억 이하이면 소득 1,000만원 이하
 *      · 형제·자매는 재산세 과세표준 1.8억원 이하
 *  - 임의계속가입: 국민건강보험법 제110조, 시행령 제77조, 시행규칙 제62조
 *      퇴직 전 18개월 중 통산 1년 이상 → 최대 36개월, 최근 12개월 보수월액 평균,
 *      본인이 전액 부담하되 보수월액보험료의 50% 경감(보험료 경감고시 제9조)
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-26';

  /* ── 기준값 ───────────────────────────────────────────────── */
  var RATE = {
    health: 7.19,             // 2026년 건강보험료율 (%)
    ltc: 0.9448,              // 2026년 장기요양보험료율 (소득 대비 %)
    ltcRatio: 13.14,          // 건강보험료 대비 장기요양보험료 (%)
    propertyPoint: 211.5,     // 재산보험료부과점수당 금액 (원)
    propertyBase: 100000000,  // 재산 기본공제 1억원
    premiumMin: 20160,        // 월 보험료 하한
    premiumMax: 4591740,      // 지역가입자 월 보험료 상한
    incomeFloorMonthly: 280000, // 소득월액 하한 기준
    extraThreshold: 20000000, // 직장가입자 보수 외 소득 기준 (연 2,000만원)
    dependentIncome: 20000000,      // 피부양자 소득 합계 기준
    dependentTightIncome: 10000000, // 재산 5.4억 초과 9억 이하 구간의 소득 기준
    dependentProperty: 540000000,   // 재산세 과세표준 5.4억원
    dependentPropertyMax: 900000000,// 재산세 과세표준 9억원
    siblingProperty: 180000000,     // 형제·자매 재산세 과세표준 1.8억원
    businessLimit: 5000000,   // 사업소득 500만원 (미등록·장애인 등 예외)
    continueMonths: 36,       // 임의계속가입 최대 기간
    continueDiscount: 50      // 임의계속가입 보수월액보험료 경감 (%)
  };

  /* 재산보험료부과점수 등급표 — 시행령 별표 4 (공제 후 재산, 만원 단위 상한) */
  var PROPERTY_GRADES = [
    [450, 22], [900, 44], [1350, 66], [1800, 97], [2250, 122],
    [2700, 146], [3150, 171], [3600, 195], [4050, 219], [4500, 244],
    [5020, 268], [5590, 294], [6220, 320], [6930, 344], [7710, 365],
    [8590, 386], [9570, 412], [10700, 439], [11900, 465], [13300, 490],
    [14800, 516], [16400, 535], [18300, 559], [20400, 586], [22700, 611],
    [25300, 637], [28100, 659], [31300, 681], [34900, 706], [38800, 731],
    [43200, 757], [48100, 785], [53600, 812], [59700, 841], [66500, 881],
    [74000, 921], [82400, 961], [91800, 1001], [103000, 1041], [114000, 1091],
    [127000, 1141], [142000, 1191], [158000, 1241], [176000, 1291], [196000, 1341],
    [218000, 1391], [242000, 1451], [270000, 1511], [300000, 1571], [330000, 1641],
    [363000, 1711], [399300, 1781], [439230, 1851], [483153, 1921], [531468, 1991],
    [584615, 2061], [643077, 2131], [707385, 2201], [778124, 2271], [Infinity, 2341]
  ];

  var RELATION_LABEL = {
    spouse: '배우자',
    parent: '직계존속(부모)',
    child: '직계비속(자녀)',
    sibling: '형제·자매'
  };

  var INCOME_TYPE_LABEL = {
    earned: '근로·연금 (50% 반영)',
    business: '사업·기타 (100% 반영)'
  };

  /* ── 공통 유틸 ───────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }
  function won(n) {
    return Math.round(n);
  }

  /* 장기요양보험료 = 건강보험료 × 0.9448 / 7.19 */
  function ltcOf(health) {
    var h = num(health, 0);
    if (h <= 0) return 0;
    return won(h * RATE.ltc / RATE.health);
  }

  /* ══════════════════════════════════════════════════════════
   * 1. 지역가입자 재산보험료부과점수
   * ══════════════════════════════════════════════════════════ */
  function propertyInfo(assessed) {
    var a = Math.max(0, num(assessed, 0));
    var net = Math.max(0, a - RATE.propertyBase);
    if (net <= 0) {
      return { assessed: a, net: 0, grade: 0, score: 0, premium: 0, capped: false };
    }
    var man = net / 10000;   // 만원
    var grade = 60;
    var score = 2341;
    for (var i = 0; i < PROPERTY_GRADES.length; i++) {
      if (man <= PROPERTY_GRADES[i][0]) {
        grade = i + 1;
        score = PROPERTY_GRADES[i][1];
        break;
      }
    }
    return {
      assessed: a,
      net: net,
      grade: grade,
      score: score,
      premium: won(score * RATE.propertyPoint),
      capped: false
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 2. 지역가입자 소득분
   * ══════════════════════════════════════════════════════════ */
  function incomeInfo(annualIncome, incomeType) {
    var annual = Math.max(0, num(annualIncome, 0));
    var type = incomeType === 'business' ? 'business' : 'earned';
    var evaluated = type === 'business' ? annual : annual * 0.5;
    var monthly = evaluated / 12;
    var floored = false;
    var premium;
    if (monthly <= RATE.incomeFloorMonthly) {
      floored = true;
      premium = RATE.premiumMin;
      monthly = RATE.premiumMin / (RATE.health / 100);
    } else {
      premium = won(monthly * RATE.health / 100);
    }
    return {
      annual: annual,
      type: type,
      typeLabel: INCOME_TYPE_LABEL[type],
      evaluated: evaluated,
      monthly: monthly,
      premium: premium,
      floored: floored
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 3. 지역가입자 월 보험료 (세대 단위 · 1인 기준 모의 계산)
   * ══════════════════════════════════════════════════════════ */
  function regional(opts) {
    var o = opts || {};
    var inc = incomeInfo(o.annualIncome, o.incomeType);
    var prop = propertyInfo(o.property);
    var health = inc.premium + prop.premium;
    var capped = false;
    if (health > RATE.premiumMax) {
      health = RATE.premiumMax;
      capped = true;
    }
    if (health < RATE.premiumMin && inc.premium + prop.premium <= RATE.premiumMin) {
      health = RATE.premiumMin;
    }
    var ltc = ltcOf(health);
    return {
      annualIncome: inc.annual,
      incomeType: inc.type,
      incomeTypeLabel: inc.typeLabel,
      incomeMonthly: inc.monthly,
      incomePremium: inc.premium,
      incomeFloored: inc.floored,
      property: prop.assessed,
      propertyNet: prop.net,
      propertyGrade: prop.grade,
      propertyScore: prop.score,
      propertyPremium: prop.premium,
      health: health,
      ltc: ltc,
      total: health + ltc,
      capped: capped
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 4. 직장가입자 월 보험료 (본인부담 · 사업주 부담)
   * ══════════════════════════════════════════════════════════ */
  function employee(opts) {
    var o = opts || {};
    var salary = Math.max(0, num(o.salary, 0));
    var health = salary > 0 ? Math.max(RATE.premiumMin, won(salary * RATE.health / 100 * 0.5)) : 0;
    var ltc = ltcOf(health);

    /* 보수 외 소득: 연 2,000만원 초과분만 부과, 가입자 본인 전액 부담 */
    var extra = Math.max(0, num(o.extraIncome, 0));
    var extraBase = Math.max(0, extra - RATE.extraThreshold);
    var extraMonthly = extraBase / 12;
    var extraHealth = extraBase > 0 ? won(extraMonthly * RATE.health / 100) : 0;
    var extraLtc = ltcOf(extraHealth);

    var total = health + ltc + extraHealth + extraLtc;
    var employer = health + ltc;
    return {
      salary: salary,
      health: health,
      ltc: ltc,
      extraIncome: extra,
      extraBase: extraBase,
      extraHealth: extraHealth,
      extraLtc: extraLtc,
      healthAll: health + extraHealth,
      ltcAll: ltc + extraLtc,
      total: total,
      employer: employer,
      both: total + employer,
      floored: salary > 0 && won(salary * RATE.health / 100 * 0.5) < RATE.premiumMin
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 5. 직장 vs 지역 비교
   * ══════════════════════════════════════════════════════════ */
  function compare(opts) {
    var o = opts || {};
    var emp = employee(o);
    var reg = regional(o);
    var diff = reg.total - emp.total;   // 양수 = 직장가입자(본인부담)가 유리
    var cheaper = diff > 0 ? 'employee' : (diff < 0 ? 'regional' : 'same');
    return {
      employee: emp,
      regional: reg,
      diff: diff,
      annualDiff: diff * 12,
      cheaper: cheaper
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 6. 피부양자 자격 판정
   * ══════════════════════════════════════════════════════════ */
  function dependent(opts) {
    var o = opts || {};
    var relation = RELATION_LABEL[o.relation] ? o.relation : 'parent';
    var income = Math.max(0, num(o.income, 0));
    var business = Math.max(0, num(o.businessIncome, 0));
    var property = Math.max(0, num(o.property, 0));
    var registered = !!o.registered;          // 사업자등록 여부
    var rental = !!o.rental;                  // 주택임대소득 유무
    var siblingOk = o.siblingOk === undefined ? true : !!o.siblingOk;

    var checks = [];

    /* ① 소득 요건 */
    checks.push({
      id: 'income',
      label: '소득 요건',
      detail: '연 소득 합계 2,000만원 이하',
      value: income,
      limit: RATE.dependentIncome,
      pass: income <= RATE.dependentIncome,
      note: '이자·배당·사업·근로·연금·기타소득 합계 (비과세소득 제외)'
    });

    /* ② 사업소득 요건 */
    var bizPass;
    var bizNote;
    if (rental) {
      bizPass = false;
      bizNote = '주택임대소득이 있으면 사업자등록 여부와 관계없이 탈락';
    } else if (registered) {
      bizPass = business <= 0;
      bizNote = '사업자등록이 있으면 사업소득이 없어야 인정';
    } else {
      bizPass = business <= RATE.businessLimit;
      bizNote = '사업자등록이 없으면 사업소득 연 500만원 이하까지 인정';
    }
    checks.push({
      id: 'business',
      label: '사업소득 요건',
      detail: registered ? '사업자등록자: 사업소득 0원' : '사업자등록 없음: 사업소득 500만원 이하',
      value: business,
      limit: registered ? 0 : RATE.businessLimit,
      pass: bizPass,
      note: bizNote
    });

    /* ③ 재산 요건 */
    var propLimit = relation === 'sibling' ? RATE.siblingProperty : RATE.dependentProperty;
    var propPass;
    var propNote;
    if (relation === 'sibling') {
      propPass = property <= RATE.siblingProperty;
      propNote = '형제·자매는 재산세 과세표준 1억 8,000만원 이하만 인정';
    } else if (property <= RATE.dependentProperty) {
      propPass = true;
      propNote = '재산세 과세표준 5억 4,000만원 이하';
    } else if (property <= RATE.dependentPropertyMax) {
      propPass = income <= RATE.dependentTightIncome;
      propNote = '5억 4,000만원 초과 9억원 이하 구간은 연 소득 1,000만원 이하일 때만 인정';
    } else {
      propPass = false;
      propNote = '재산세 과세표준 9억원 초과는 소득과 관계없이 탈락';
    }
    checks.push({
      id: 'property',
      label: '재산 요건',
      detail: relation === 'sibling' ? '재산세 과세표준 1.8억원 이하' : '재산세 과세표준 5.4억원 이하 (9억원 초과 탈락)',
      value: property,
      limit: propLimit,
      pass: propPass,
      note: propNote
    });

    /* ④ 형제·자매 추가 요건 */
    if (relation === 'sibling') {
      checks.push({
        id: 'sibling',
        label: '형제·자매 요건',
        detail: '30세 미만·65세 이상·장애인·유공자 등',
        value: siblingOk ? 1 : 0,
        limit: 1,
        pass: siblingOk,
        note: '형제·자매는 원칙적으로 피부양자가 될 수 없고 위 요건에 해당할 때만 인정'
      });
    }

    var failed = checks.filter(function (c) { return !c.pass; });
    var eligible = failed.length === 0;

    /* 탈락 시 대안: 지역가입자 예상 보험료 */
    var fallback = regional({ annualIncome: income, incomeType: 'earned', property: property });

    return {
      relation: relation,
      relationLabel: RELATION_LABEL[relation],
      income: income,
      incomeRoom: RATE.dependentIncome - income,
      businessIncome: business,
      registered: registered,
      rental: rental,
      property: property,
      propertyBand: property <= RATE.dependentProperty ? '5.4억원 이하'
        : (property <= RATE.dependentPropertyMax ? '5.4억원 초과 9억원 이하' : '9억원 초과'),
      checks: checks,
      eligible: eligible,
      failed: failed,
      failCount: failed.length,
      fallback: fallback,
      marriedNote: !!o.married
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 7. 퇴직 후: 임의계속가입 vs 지역가입자
   * ══════════════════════════════════════════════════════════ */
  function retire(opts) {
    var o = opts || {};
    var salary = Math.max(0, num(o.salary, 0));
    var history = o.history === undefined ? true : !!o.history;

    /* 임의계속가입: 최근 12개월 평균 보수월액 × 7.19% × 50%(경감) + 장기요양 */
    var contHealth = salary > 0
      ? Math.max(RATE.premiumMin, won(salary * RATE.health / 100 * (1 - RATE.continueDiscount / 100)))
      : 0;
    var contLtc = ltcOf(contHealth);
    var continuation = {
      salary: salary,
      health: contHealth,
      ltc: contLtc,
      total: contHealth + contLtc,
      months: RATE.continueMonths,
      discount: RATE.continueDiscount
    };

    var reg = regional(o);
    var diff = reg.total - continuation.total;  // 양수 = 임의계속가입이 유리
    var cheaper = diff > 0 ? 'continue' : (diff < 0 ? 'regional' : 'same');
    var eligible = history && salary > 0;
    return {
      eligible: eligible,
      reason: eligible ? null : (salary > 0 ? 'history' : 'salary'),
      continuation: continuation,
      regional: reg,
      diff: diff,
      cheapSide: cheaper,
      months: RATE.continueMonths,
      total36: {
        continuation: continuation.total * RATE.continueMonths,
        regional: reg.total * RATE.continueMonths,
        diff: Math.abs(diff) * RATE.continueMonths
      }
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 8. 참고 표: 재산 구간별 지역 보험료
   * ══════════════════════════════════════════════════════════ */
  function propertyTable(annualIncome, incomeType) {
    var levels = [0, 100000000, 200000000, 300000000, 500000000, 700000000, 900000000];
    return levels.map(function (p) {
      var r = regional({ annualIncome: annualIncome, incomeType: incomeType, property: p });
      return {
        property: p,
        net: r.propertyNet,
        grade: r.propertyGrade,
        score: r.propertyScore,
        propertyPremium: r.propertyPremium,
        health: r.health,
        ltc: r.ltc,
        total: r.total
      };
    });
  }

  /* ══════════════════════════════════════════════════════════
   * 내보내기
   * ══════════════════════════════════════════════════════════ */
  var api = {
    DATA_DATE: DATA_DATE,
    RATE: RATE,
    PROPERTY_GRADES: PROPERTY_GRADES,
    RELATION_LABEL: RELATION_LABEL,
    INCOME_TYPE_LABEL: INCOME_TYPE_LABEL,
    ltcOf: ltcOf,
    propertyInfo: propertyInfo,
    incomeInfo: incomeInfo,
    regional: regional,
    employee: employee,
    compare: compare,
    dependent: dependent,
    retire: retire,
    propertyTable: propertyTable
  };

  root.HealthCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
