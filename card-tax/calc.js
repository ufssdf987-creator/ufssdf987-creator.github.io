/*!
 * CTCalc — 2026년 귀속 신용카드 등 사용금액 소득공제 계산 엔진
 * ---------------------------------------------------------------
 * DOM에 의존하지 않는 순수 모듈입니다. 브라우저(app.js)와 테스트(QuickJS)가 같은 코드를 씁니다.
 *
 * 기준 확인일: 2026-11-26 (2026년 귀속 = 2027년 1~2월 연말정산)
 *  - 조세특례제한법 제126조의2(신용카드 등 사용금액에 대한 소득공제)
 *      [법률 제21223호, 2025.12.23. 일부개정, 2026.1.1. 시행 / 일몰 2028.12.31.]
 *      · 최저사용금액 = 총급여액 × 25% (제1항) — 넘는 금액에만 공제
 *      · 공제율 (제2항): 신용 15% · 직불·선불·현금영수증 30% · 전통시장 40% · 대중교통 40%
 *        · 문화체육(도서·신문·공연·박물관·미술관·영화관·수영장·체력단련장) 30% (총급여 7천만원 이하만)
 *      · 최저사용금액 차감 순서 (제2항 제6호): 신용카드 → 직불·현금+문화체육(30%) → 전통시장·대중교통(40%)
 *      · 기본한도 (제10항): 7천만원 이하 300만원(자녀등 1명 350·2명 이상 400),
 *                          7천만원 초과 250만원(275·300) — 2026년 사용분부터 자녀 수 반영
 *      · 추가한도 (제11항): 기본한도 초과액과 전통시장·대중교통(+7천만원 이하 문화체육) 공제합계 중 적은 금액,
 *                          연 300만원(7천만원 이하) / 200만원(초과)
 *  - 시행령 제121조의2 제6항: 보험료·학교 공납금·세금·공과금(전기·수도·가스·통신·관리비·통행료)·
 *    상품권 등 유가증권·리스료·취득세 대상 재산 구입비·금융 수수료·면세점 사용분은 사용액에서 제외
 *  - 소득공제 → 과세표준 감소분 × 한계세율 = 절세액(소득세), 개인지방소득세는 소득세의 10%
 *
 * 모든 결과는 참고용 모의 계산입니다.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.CTCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ────────────────────────────────────────────────────────────
   * 1. 2026년 기준값
   * ──────────────────────────────────────────────────────────── */
  var RULES = {
    year: 2026,
    verifiedAt: "2026-11-26",

    /* 최저사용금액(25% 문턱) — 제1항 */
    thresholdRate: 0.25,

    /* 공제율 — 제2항 */
    creditRate: 0.15,
    checkRate: 0.30,
    cultureRate: 0.30,
    marketRate: 0.40,
    transitRate: 0.40,

    /* 총급여 7천만원 초과자는 문화체육 30%를 못 받고 결제수단 공제율로 계산 */
    salaryBreak: 70000000,

    /* 기본한도 — 제10항 (2026년 사용분부터 자녀등 1명당 50만원/25만원 상향) */
    baseLimit: {
      under: { none: 3000000, one: 3500000, many: 4000000 },
      over: { none: 2500000, one: 2750000, many: 3000000 }
    },

    /* 추가한도 — 제11항 */
    addLimit: { under: 3000000, over: 2000000 },

    localTaxRate: 0.10,

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
    money: { min: 0, max: 50000000, step: 100000 },
    share: { min: 0, max: 100, step: 5 },
    children: { min: 0, max: 5 }
  };

  /* 공제 항목 메타 (화면·표에서 공통 사용) */
  var CATS = [
    { key: "credit", name: "신용카드", short: "신용", rate: RULES.creditRate, tone: "brand" },
    { key: "check", name: "체크·직불·현금영수증", short: "체크·현금", rate: RULES.checkRate, tone: "mint" },
    { key: "market", name: "전통시장", short: "전통시장", rate: RULES.marketRate, tone: "gold" },
    { key: "transit", name: "대중교통", short: "대중교통", rate: RULES.transitRate, tone: "violet" },
    { key: "culture", name: "문화체육(도서·공연·영화·체육시설)", short: "문화체육", rate: RULES.cultureRate, tone: "hot" }
  ];

  var KEYS = ["credit", "check", "market", "transit", "culture"];

  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function floorTo(v, unit) {
    return Math.floor(v / unit) * unit;
  }

  /* ────────────────────────────────────────────────────────────
   * 2. 한도·세율
   * ──────────────────────────────────────────────────────────── */
  function childBucket(children) {
    var n = Math.max(0, Math.floor(num(children)));
    return n <= 0 ? "none" : (n === 1 ? "one" : "many");
  }

  function cardLimits(salary, children) {
    var s = Math.max(0, num(salary));
    var over = s > RULES.salaryBreak;
    var key = childBucket(children);
    return {
      threshold: floorTo(s * RULES.thresholdRate, 10),
      baseLimit: over ? RULES.baseLimit.over[key] : RULES.baseLimit.under[key],
      addLimit: over ? RULES.addLimit.over : RULES.addLimit.under,
      maxDeduction: (over ? RULES.baseLimit.over[key] : RULES.baseLimit.under[key]) +
        (over ? RULES.addLimit.over : RULES.addLimit.under),
      over70: over,
      kids: Math.max(0, Math.floor(num(children))),
      kidsBucket: key
    };
  }

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

  function bracketForRate(ratePct) {
    var r = Math.max(0, num(ratePct)) / 100;
    for (var i = 0; i < RULES.brackets.length; i++) {
      if (Math.abs(RULES.brackets[i].rate - r) < 1e-9) return RULES.brackets[i];
    }
    return null;
  }

  /* ────────────────────────────────────────────────────────────
   * 3. 카드 소득공제 (제2항·제10항·제11항)
   * ──────────────────────────────────────────────────────────── */
  /**
   * input = { salary, children, credit, check, market, transit, culture }
   *  - credit  : 신용카드 사용분
   *  - check   : 체크·직불·선불카드 + 현금영수증
   *  - market  : 전통시장 사용분 (결제수단과 무관하게 40%)
   *  - transit : 대중교통 이용분 (40%)
   *  - culture : 문화체육 사용분 (총급여 7천만 이하만 30%, 초과자는 신용카드 사용분으로 합산)
   * 네 항목(market·transit·culture)은 credit·check 와 중복되지 않는 금액으로 받습니다.
   */
  function cardDeduction(input) {
    input = input || {};
    var salary = Math.max(0, num(input.salary));
    var children = Math.max(0, Math.floor(num(input.children)));
    var limits = cardLimits(salary, children);

    var spend = {
      credit: Math.max(0, num(input.credit)),
      check: Math.max(0, num(input.check)),
      market: Math.max(0, num(input.market)),
      transit: Math.max(0, num(input.transit)),
      culture: Math.max(0, num(input.culture))
    };
    /* 7천만원 초과자는 문화체육 사용분을 따로 떼지 않고 결제수단(신용카드) 공제율로 계산 */
    var cultureInput = spend.culture;
    if (limits.over70) {
      spend.credit += cultureInput;
      spend.culture = 0;
    }
    spend.total = spend.credit + spend.check + spend.market + spend.transit + spend.culture;

    var threshold = limits.threshold;
    var rem = threshold;
    function take(x) {
      var u = Math.min(x, rem);
      rem -= u;
      return u;
    }
    /* 제2항 제6호 차감 순서: 신용카드 → 직불·현금+문화체육 → 전통시장 → 대중교통 */
    var used = {
      credit: take(spend.credit),
      check: take(spend.check),
      culture: take(spend.culture),
      market: take(spend.market),
      transit: take(spend.transit)
    };
    var taxable = {
      credit: Math.max(0, spend.credit - used.credit),
      check: Math.max(0, spend.check - used.check),
      culture: Math.max(0, spend.culture - used.culture),
      market: Math.max(0, spend.market - used.market),
      transit: Math.max(0, spend.transit - used.transit)
    };
    var ded = {
      credit: taxable.credit * RULES.creditRate,
      check: taxable.check * RULES.checkRate,
      culture: taxable.culture * RULES.cultureRate,
      market: taxable.market * RULES.marketRate,
      transit: taxable.transit * RULES.transitRate
    };
    var raw = ded.credit + ded.check + ded.culture + ded.market + ded.transit;

    /* 문턱을 못 넘으면 공제 0 */
    var base = Math.min(raw, limits.baseLimit);
    var over = Math.max(0, raw - limits.baseLimit);
    var addEligible = ded.market + ded.transit + ded.culture;
    var additional = Math.min(over, addEligible, limits.addLimit);
    var final = floorTo(base + additional, 10);

    return {
      salary: salary,
      children: children,
      limits: limits,
      spend: spend,
      cultureInput: cultureInput,
      cultureTreatedAsCredit: limits.over70 ? cultureInput : 0,
      threshold: threshold,
      gap: Math.max(0, threshold - spend.total),
      overThreshold: Math.max(0, spend.total - threshold),
      passed: spend.total > threshold,
      used: used,
      taxable: taxable,
      ded: ded,
      raw: raw,
      base: base,
      over: over,
      addEligible: addEligible,
      additional: additional,
      final: final,
      baseRoom: Math.max(0, limits.baseLimit - base),
      addRoom: Math.max(0, limits.addLimit - additional),
      maxDeduction: limits.maxDeduction,
      reachedBase: base >= limits.baseLimit,
      reachedAdd: additional >= limits.addLimit
    };
  }

  /** 카드 사용액만 더해 다시 계산 */
  function withSpend(input, add) {
    add = add || {};
    var out = {
      salary: input.salary,
      children: input.children,
      credit: Math.max(0, num(input.credit)),
      check: Math.max(0, num(input.check)),
      market: Math.max(0, num(input.market)),
      transit: Math.max(0, num(input.transit)),
      culture: Math.max(0, num(input.culture))
    };
    KEYS.forEach(function (k) {
      out[k] += Math.max(0, num(add[k]));
    });
    return out;
  }

  /** room 만큼의 공제를 만드는 데 필요한 사용액 */
  function spendToFill(room, rate) {
    if (room <= 0 || rate <= 0) return 0;
    return Math.ceil(room / rate);
  }

  /* ────────────────────────────────────────────────────────────
   * 4. 절세액 (소득공제 → 세금)
   * ──────────────────────────────────────────────────────────── */
  /**
   * benefit(salary, dependents, deduction, ratePct)
   *  - deduction : 인정된 카드 소득공제액
   *  - ratePct   : 한계세율을 직접 지정할 때(6·15·24·35·38·40·42·45). 0/생략이면 자동 추정
   * 소득공제는 과세표준을 줄이므로 절세액 = 줄어든 과세표준 × 한계세율.
   * 과세표준보다 큰 공제는 그만큼 효과가 없으므로 cap 합니다.
   */
  function benefit(salary, dependents, deduction, ratePct) {
    var taxable = estimateTaxable(salary, dependents);
    var bracket = ratePct ? bracketForRate(ratePct) : marginalRate(taxable);
    if (!bracket) bracket = marginalRate(taxable);
    var ded = Math.max(0, num(deduction));
    var applied = Math.min(ded, taxable);
    var incomeTax = Math.round(applied * bracket.rate);
    var localTax = Math.round(incomeTax * RULES.localTaxRate);
    return {
      taxable: taxable,
      rate: bracket.rate,
      rateLabel: bracket.label,
      deduction: ded,
      applied: applied,
      capped: applied < ded,
      incomeTax: incomeTax,
      localTax: localTax,
      total: incomeTax + localTax
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 5. 남은 기간 배분 시뮬레이터 (탭 2)
   * ──────────────────────────────────────────────────────────── */
  var STEP = 10000;

  function addTo(alloc, key, amount) {
    var out = {};
    KEYS.forEach(function (k) { out[k] = alloc[k] || 0; });
    out[key] = (out[key] || 0) + amount;
    return out;
  }

  /**
   * 예산을 어떻게 나눠 쓰면 공제가 가장 커지는지 1만원 단위로 탐색합니다.
   * 같은 이득이면 앞 항목(신용 → 체크 → 전통시장 → 대중교통 → 문화체육)을 먼저 채웁니다.
   * 문턱 아래 구간은 어디에 써도 이득이 0이라 신용카드가 먼저 채워지고,
   * 이는 문턱을 15%로 소진해 나머지 사용분을 가장 많이 남기는 순서입니다.
   */
  function bestAllocation(input, budget) {
    var limits = cardLimits(input.salary, input.children);
    var keys = limits.over70 ? ["credit", "check", "market", "transit"] : KEYS;
    var alloc = { credit: 0, check: 0, market: 0, transit: 0, culture: 0 };
    var left = Math.max(0, num(budget));
    var cur = cardDeduction(withSpend(input, alloc)).final;

    while (left >= STEP) {
      var bestKey = keys[0];
      var bestVal = -1;
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = cardDeduction(withSpend(input, addTo(alloc, k, STEP))).final;
        if (v > bestVal) {
          bestVal = v;
          bestKey = k;
        }
      }
      alloc[bestKey] += STEP;
      cur = bestVal;
      left -= STEP;
    }
    if (left > 0) {
      var tailKey = keys[0];
      var tailVal = -1;
      for (var j = 0; j < keys.length; j++) {
        var kk = keys[j];
        var vv = cardDeduction(withSpend(input, addTo(alloc, kk, left))).final;
        if (vv > tailVal) {
          tailVal = vv;
          tailKey = kk;
        }
      }
      alloc[tailKey] += left;
      cur = tailVal;
    }
    return { alloc: alloc, deduction: cur };
  }

  /**
   * 현실적인 배분: 25% 문턱까지는 신용카드 → 그다음 기본한도까지 체크·현금
   *               → 기본한도가 찼으면 추가한도 대상(전통시장 40%)으로.
   */
  function practicalAllocation(input, budget) {
    var before = cardDeduction(input);
    var alloc = { credit: 0, check: 0, market: 0, transit: 0, culture: 0 };
    var left = Math.max(0, num(budget));

    var fill = Math.min(before.gap, left);
    alloc.credit += fill;
    left -= fill;

    var mid = cardDeduction(withSpend(input, alloc));
    var needCheck = Math.min(left, spendToFill(mid.baseRoom, RULES.checkRate));
    alloc.check += needCheck;
    left -= needCheck;

    var mid2 = cardDeduction(withSpend(input, alloc));
    if (left > 0 && mid2.addRoom > 0 && mid2.reachedBase) {
      var needMarket = Math.min(left, spendToFill(mid2.addRoom, RULES.marketRate));
      alloc.market += needMarket;
      left -= needMarket;
    }
    if (left > 0) alloc.check += left;
    return alloc;
  }

  /**
   * goldenPlan(input, budget)
   *  - input : { salary, children, credit, check, market, transit, culture, dependents, rate }
   *  - budget: 남은 기간(12월) 쓸 금액
   * 시나리오별 공제액·절세액과 최적 배분을 돌려줍니다.
   */
  function goldenPlan(input, budget) {
    var b = Math.max(0, num(budget));
    var before = cardDeduction(input);
    var baseBenefit = benefit(input.salary, input.dependents, before.final, input.rate);
    var best = bestAllocation(input, b);
    var practical = practicalAllocation(input, b);

    var defs = [
      { key: "credit", name: "전액 신용카드", note: "공제율 15% · 실적·포인트는 유리", alloc: { credit: b } },
      { key: "check", name: "전액 체크·현금영수증", note: "공제율 30% · 신용의 두 배", alloc: { check: b } },
      { key: "golden", name: "황금비율 (문턱 신용 → 체크)", note: "문턱까지 신용, 그 뒤는 체크", alloc: practical },
      { key: "market", name: "전액 전통시장·대중교통", note: "공제율 40% · 추가한도 대상", alloc: { market: b } },
      { key: "best", name: "공제 최대 배분", note: "공제율 높은 순서로 자동 배분", alloc: best.alloc }
    ];

    var scenarios = defs.map(function (d) {
      var after = cardDeduction(withSpend(input, d.alloc));
      var bn = benefit(input.salary, input.dependents, after.final, input.rate);
      return {
        key: d.key,
        name: d.name,
        note: d.note,
        alloc: d.alloc,
        deduction: after.final,
        added: Math.max(0, after.final - before.final),
        refund: bn.total,
        addedRefund: Math.max(0, bn.total - baseBenefit.total),
        reachedBase: after.reachedBase,
        reachedAdd: after.reachedAdd,
        gap: after.gap
      };
    });
    var pick = function (key) {
      return scenarios.filter(function (s) { return s.key === key; })[0] || scenarios[0];
    };
    var top = scenarios.reduce(function (a, s) { return s.deduction > a.deduction ? s : a; }, scenarios[0]);

    return {
      before: before,
      baseBenefit: baseBenefit,
      budget: b,
      scenarios: scenarios,
      golden: pick("golden"),
      credit: pick("credit"),
      check: pick("check"),
      market: pick("market"),
      best: top,
      bestAlloc: best.alloc,
      practicalAlloc: practical
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 6. 부부·맞벌이 몰아주기 (탭 3)
   * ──────────────────────────────────────────────────────────── */
  /**
   * couplePlan(o)
   *  o = { aSalary, bSalary, spend, creditShare, children, claim: 'a'|'b', rateA, rateB, dependents }
   *  - spend      : 부부 합계 연간 카드 사용액(신용+체크)
   *  - creditShare: 그중 신용카드 비중(%)
   *  - claim      : 자녀등 기본한도(350·400만원)를 받는 쪽
   * 전통시장·대중교통은 결제 수단과 무관하게 40%라 몰아주기 효과가 없어 제외했습니다.
   */
  function couplePlan(o) {
    o = o || {};
    var spend = Math.max(0, num(o.spend));
    var share = Math.min(100, Math.max(0, num(o.creditShare)));
    var kids = Math.max(0, Math.floor(num(o.children)));
    var kidsA = o.claim === "b" ? 0 : kids;
    var kidsB = o.claim === "b" ? kids : 0;

    function split(amountA) {
      var amountB = Math.max(0, spend - amountA);
      return { a: amountA, b: amountB };
    }

    function evalSplit(amountA) {
      var s = split(amountA);
      var a = cardDeduction({
        salary: o.aSalary, children: kidsA,
        credit: s.a * share / 100, check: s.a * (1 - share / 100)
      });
      var b = cardDeduction({
        salary: o.bSalary, children: kidsB,
        credit: s.b * share / 100, check: s.b * (1 - share / 100)
      });
      var ba = benefit(o.aSalary, o.dependents, a.final, o.rateA);
      var bb = benefit(o.bSalary, o.dependents, b.final, o.rateB);
      return {
        amountA: s.a,
        amountB: s.b,
        dedA: a.final,
        dedB: b.final,
        deduction: a.final + b.final,
        refundA: ba.total,
        refundB: bb.total,
        refund: ba.total + bb.total,
        rateA: ba.rate,
        rateB: bb.rate,
        gapA: a.gap,
        gapB: b.gap,
        passedA: a.passed,
        passedB: b.passed,
        limitA: a.limits.maxDeduction,
        limitB: b.limits.maxDeduction
      };
    }

    var scanStep = 100000;
    var best = evalSplit(0);
    for (var x = scanStep; x <= spend; x += scanStep) {
      var cur = evalSplit(x);
      if (cur.refund > best.refund || (cur.refund === best.refund && cur.deduction > best.deduction)) best = cur;
    }

    var allA = evalSplit(spend);
    var allB = evalSplit(0);
    var half = evalSplit(Math.round(spend / 2));

    var scenarios = [
      { key: "a", name: "한쪽에 몰아주기 (A)", note: "A 카드로 전액", data: allA },
      { key: "half", name: "반반 나눠 쓰기", note: "A·B 각 50%", data: half },
      { key: "b", name: "한쪽에 몰아주기 (B)", note: "B 카드로 전액", data: allB },
      { key: "best", name: "최적 분배", note: "절세액이 가장 큰 조합", data: best }
    ].map(function (s) {
      s.delta = s.data.refund - allA.refund;
      return s;
    });

    var curve = [0, 0.25, 0.5, 0.75, 1].map(function (p) {
      return evalSplit(Math.round(spend * p));
    });

    return {
      spend: spend,
      creditShare: share,
      children: kids,
      claim: o.claim === "b" ? "b" : "a",
      scenarios: scenarios,
      allA: allA,
      allB: allB,
      half: half,
      best: best,
      bestA: best.amountA,
      bestB: best.amountB,
      gain: best.refund - allA.refund,
      curve: curve
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 7. 내보내기
   * ──────────────────────────────────────────────────────────── */
  return {
    RULES: RULES,
    LIMITS: LIMITS,
    CATS: CATS,
    KEYS: KEYS,
    childBucket: childBucket,
    cardLimits: cardLimits,
    earnedDeduction: earnedDeduction,
    estimateTaxable: estimateTaxable,
    marginalRate: marginalRate,
    bracketForRate: bracketForRate,
    cardDeduction: cardDeduction,
    withSpend: withSpend,
    spendToFill: spendToFill,
    benefit: benefit,
    bestAllocation: bestAllocation,
    goldenPlan: goldenPlan,
    couplePlan: couplePlan
  };
});
