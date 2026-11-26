/*!
 * calc.js — 2026 연금저축·IRP 세액공제 & 노후 수령액 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.PensionCalc 로 노출합니다.
 *
 * 근거 (2026년 11월 26일 확인)
 *  [납입 — 연금계좌세액공제]
 *  - 소득세법 제59조의3제1항: 연금계좌 납입액의 12%(종합소득금액 4,500만원 이하 또는
 *    근로소득만 있는 경우 총급여 5,500만원 이하는 15%)를 종합소득산출세액에서 공제.
 *    단서: 연금저축계좌 납입액은 연 600만원, 연금저축 600만원 이내 + 퇴직연금계좌 납입액은
 *    연 900만원을 초과하는 금액은 없는 것으로 봄.
 *    → 지방소득세 10%를 더한 체감 공제율은 16.5% / 13.2%입니다.
 *  - 같은 조 제3항: ISA 계약기간 만료 후 60일 이내(시행령 제118조의2제3항) 연금계좌로 납입한
 *    전환금액은 그 과세기간의 연금계좌 납입액에 포함합니다.
 *  - 같은 조 제4항: 전환금액이 있으면 전환금액의 10% 또는 300만원 중 적은 금액을
 *    제1항 단서에 따른 금액(최대 900만원)에 더합니다. 두 해에 걸쳐 납입하면 300만원에서
 *    직전 과세기간에 적용된 금액을 뺍니다. → 한 해 최대 공제대상 1,200만원.
 *  - 시행령 제40조의2제2항: 연금계좌 납입한도는 연 1,800만원이며, ISA 전환금액(같은 항
 *    제1호 나목)은 이 한도와 별도입니다. 연금수령 개시 후에는 납입할 수 없습니다.
 *  - 시행령 제118조의3: 공제받지 못한 납입액은 금융기관에 '납입연도 전환'을 신청해
 *    다음 연도 공제로 돌릴 수 있습니다(영구 소멸 아님).
 *
 *  [수령 — 연금소득세]
 *  - 시행령 제40조의2제3항: ① 55세 이후 연금수령 개시 신청 후 인출 ② 가입일부터 5년 경과
 *    (이연퇴직소득만 있는 계좌는 예외) ③ 연금수령한도 이내 인출 — 세 요건을 모두 갖춰야
 *    '연금수령'입니다. 연금수령한도 = 연초(과세기간 개시일) 평가액 ÷ (11 − 연금수령연차) × 120%,
 *    연금수령연차 11년차부터는 한도를 적용하지 않습니다(같은 조 제4항: 2013.3.1 전 가입 계좌는
 *    6년차부터 계산). 한도를 넘긴 금액은 연금외수령입니다.
 *  - 소득세법 제129조제1항: 연금소득 원천징수세율은 연금수령 당시 나이 기준 5%(70세 미만),
 *    4%(70~79세), 3%(80세 이상), 종신계약은 3%(2026.1.1 이후 수령분부터). 지방소득세 10%를
 *    더해 5.5%·4.4%·3.3%·3.3%가 됩니다.
 *  - 소득세법 제14조제3항제9호·제64조의4: 사적연금소득(세액공제받은 납입액+운용수익, 이연퇴직소득
 *    제외) 합계가 연 1,500만원 이하면 원천징수로 분리과세 종결. 넘으면 전액을 종합과세하거나
 *    같은 조에 따라 15%(지방소득세 포함 16.5%) 분리과세를 선택합니다.
 *  - 소득세법 제47조의2: 종합과세 시 연금소득공제 — 총연금액 350만원 이하 전액, 350~700만원
 *    350만원+초과분 40%, 700~1,400만원 490만원+초과분 20%, 1,400만원 초과 630만원+초과분 10%,
 *    한도 900만원.
 *  - 소득세법 제21조제1항제21호·제129조: 연금외수령(중도해지·한도 초과)은 세액공제받은 납입액과
 *    운용수익에 기타소득세 15%(지방소득세 포함 16.5%)가 붙습니다.
 *  - 소득세법 시행령 제40조의3: 일부 인출은 과세제외금액 → 이연퇴직소득 → 세액공제받은
 *    납입액·운용수익 순서로 나간 것으로 봅니다.
 *
 *  [계좌 선택 — 연금저축 vs IRP]
 *  - 근로자퇴직급여 보장법 시행령 제18조: IRP는 법정 사유(무주택자 주택구입·전세보증금,
 *    6개월 이상 요양 의료비, 재난 피해, 파산선고·개인회생, 담보대출 상환 등)에만 55세 전
 *    중도인출이 가능하고, 연금은 55세 이후 5년 이상 나눠 지급합니다.
 *  - 연금저축은 중도인출 사유 제한 없이 일부 인출이 가능합니다(금융회사 절차).
 *  - 근로자퇴직급여 보장법 시행규칙 제10조·시행령 제26조: DC형·IRP는 위험자산을 적립금의
 *    70%까지만 담을 수 있습니다(적격 TDF·디폴트옵션 등 예외). 연금저축펀드에는 이 70% 한도가
 *    적용되지 않아 주식형 ETF로 100% 운용할 수 있습니다(단, 레버리지·인버스는 불가).
 *  - 수수료는 상품·금융회사별로 달라 이 계산기는 이용자가 넣은 연 수수료율 가정으로만 비교합니다.
 *
 * 금액은 원 단위에서 버림하고, 모든 결과는 참고용 모의 계산입니다.
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-26';

  var LIMITS = {
    income: { min: 0, max: 1000000000 },        // 총급여·종합소득금액 10억원
    money: { min: 0, max: 100000000000 },       // 납입·평가액 1,000억원
    balance: { min: 0, max: 100000000000 },
    withdraw: { min: 0, max: 100000000000 },
    taxBefore: { min: 0, max: 1000000000 }
  };

  /* ── 2026년 기준값 ───────────────────────────────────────── */
  var RULES = {
    salaryThreshold: 55000000,        // 총급여 5,500만원
    incomeThreshold: 45000000,        // 종합소득금액 4,500만원
    rateHigh: 0.165,                  // 지방소득세 포함 16.5%
    rateLow: 0.132,                   // 지방소득세 포함 13.2%
    localRate: 0.10,                  // 지방소득세 = 소득세의 10%
    pensionLimit: 6000000,            // 연금저축 단독 세액공제 한도
    combinedLimit: 9000000,           // 연금저축 + IRP 합산 한도
    isaRate: 0.10,                    // ISA 전환금액의 10%
    isaCap: 3000000,                  // ISA 추가 한도 300만원
    isaWindowDays: 60,                // ISA 만기 후 60일 이내
    depositCap: 18000000,             // 연금계좌 납입한도(ISA 전환금액 별도)
    pensionAge: 55,                   // 연금수령 개시 나이
    pensionYears: 5,                  // 가입 후 5년
    privateThreshold: 15000000,       // 사적연금 분리과세 기준 1,500만원
    separateRate: 0.165,              // 16.5% 분리과세(지방소득세 포함)
    earlyRate: 0.165,                 // 연금외수령 기타소득세 16.5%
    lifetimeRate: 0.033,              // 종신계약 3.3%(2026.1.1 수령분부터)
    ageRates: [
      { min: 80, rate: 0.033, label: '80세 이상' },
      { min: 70, rate: 0.044, label: '70~79세' },
      { min: 0, rate: 0.055, label: '70세 미만' }
    ],
    pensionDeductionCap: 9000000,     // 연금소득공제 한도
    /* 종합소득세 기본세율 8구간 — 소득세법 제55조 (2026년) */
    basicBrackets: [
      { upTo: 14000000, rate: 0.06, prog: 0, label: '1,400만원 이하' },
      { upTo: 50000000, rate: 0.15, prog: 1260000, label: '1,400만~5,000만원' },
      { upTo: 88000000, rate: 0.24, prog: 5760000, label: '5,000만~8,800만원' },
      { upTo: 150000000, rate: 0.35, prog: 15440000, label: '8,800만~1억5,000만원' },
      { upTo: 300000000, rate: 0.38, prog: 19940000, label: '1억5,000만~3억원' },
      { upTo: 500000000, rate: 0.40, prog: 25940000, label: '3억~5억원' },
      { upTo: 1000000000, rate: 0.42, prog: 35940000, label: '5억~10억원' },
      { upTo: Infinity, rate: 0.45, prog: 65940000, label: '10억원 초과' }
    ]
  };

  /* ── 공통 유틸 ───────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function floorWon(n) { return Math.floor(n + 1e-7); }
  function round(n) { return Math.round(n); }

  function bracketOf(base) {
    for (var i = 0; i < RULES.basicBrackets.length; i++) {
      if (base <= RULES.basicBrackets[i].upTo) return RULES.basicBrackets[i];
    }
    return RULES.basicBrackets[RULES.basicBrackets.length - 1];
  }

  /** 과세표준에 대한 종합소득 산출세액(지방소득세 제외) */
  function basicTax(base) {
    var b = clamp(num(base, 0), 0, 1e13);
    if (b <= 0) return 0;
    var br = bracketOf(b);
    return floorWon(Math.max(0, b * br.rate - br.prog));
  }

  /** 과세표준의 한계세율(지방소득세 포함) */
  function marginalRate(base) {
    var br = bracketOf(clamp(num(base, 0), 0, 1e13));
    return br.rate * (1 + RULES.localRate) * 100;
  }

  /** 연금소득공제 — 소득세법 제47조의2 */
  function pensionDeduction(total) {
    var t = clamp(num(total, 0), 0, LIMITS.money.max);
    var d;
    if (t <= 3500000) d = t;
    else if (t <= 7000000) d = 3500000 + (t - 3500000) * 0.40;
    else if (t <= 14000000) d = 4900000 + (t - 7000000) * 0.20;
    else d = 6300000 + (t - 14000000) * 0.10;
    return {
      amount: floorWon(Math.min(d, RULES.pensionDeductionCap)),
      income: t - floorWon(Math.min(d, RULES.pensionDeductionCap))
    };
  }

  /* ── 1. 세액공제 ─────────────────────────────────────────── */
  function rateFor(opts) {
    var o = opts || {};
    var type = o.incomeType === 'income' ? 'income' : 'salary';
    var income = clamp(num(o.income, 0), 0, LIMITS.income.max);
    var threshold = type === 'income' ? RULES.incomeThreshold : RULES.salaryThreshold;
    var high = income <= threshold;
    var rate = high ? RULES.rateHigh : RULES.rateLow;
    return {
      incomeType: type,
      income: income,
      threshold: threshold,
      high: high,
      rate: rate,
      incomeRate: rate / (1 + RULES.localRate),
      localRate: rate - rate / (1 + RULES.localRate),
      thresholdLabel: type === 'income' ? '종합소득금액 4,500만원' : '총급여 5,500만원'
    };
  }

  /**
   * 연금계좌 세액공제
   * @param {object} opts incomeType('salary'|'income'), income, pension(연금저축),
   *                      irp(IRP·DC 본인 추가납입), isa(ISA 만기 전환금액),
   *                      taxBefore(공제 전 결정세액, 선택)
   */
  function credit(opts) {
    var o = opts || {};
    var r = rateFor(o);
    var pension = clamp(num(o.pension, 0), 0, LIMITS.money.max);
    var irp = clamp(num(o.irp, 0), 0, LIMITS.money.max);
    var isa = clamp(num(o.isa, 0), 0, LIMITS.money.max);
    var taxBefore = clamp(num(o.taxBefore, 0), 0, LIMITS.taxBefore.max);

    // ① 연금저축은 600만원까지만 인정
    var pensionUsed = Math.min(pension, RULES.pensionLimit);
    var pensionRoom = Math.max(0, RULES.pensionLimit - pensionUsed);

    // ② 연금저축 600 + IRP + ISA 전환금액 → 합산 900만원
    //    (전환금액은 소득세법 제59조의3③에 따라 그 과세기간 납입액에 포함)
    var irpUsed = Math.min(irp, Math.max(0, RULES.combinedLimit - pensionUsed));
    var isaUsed = Math.min(isa, Math.max(0, RULES.combinedLimit - pensionUsed - irpUsed));
    var baseTotal = pensionUsed + irpUsed + isaUsed;
    var combinedRoom = Math.max(0, RULES.combinedLimit - baseTotal);

    // ③ ISA 전환금액의 10%, 최대 300만원 추가
    var isaExtra = Math.min(floorWon(isa * RULES.isaRate), RULES.isaCap);
    var isaRoom = Math.max(0, RULES.isaCap - isaExtra);

    var target = baseTotal + isaExtra;
    var incomeTax = floorWon(target * r.incomeRate);
    var localTax = floorWon(incomeTax * RULES.localRate);
    var creditAmount = incomeTax + localTax;
    var applied = taxBefore > 0 ? Math.min(creditAmount, taxBefore) : creditAmount;
    var capped = taxBefore > 0 && creditAmount > taxBefore;

    var paid = pension + irp;
    var paidTotal = pension + irp + isa;
    var refundRate = paidTotal > 0 ? (applied / paidTotal) * 100 : 0;

    // 12월 31일까지 더 넣어 세액공제를 늘릴 수 있는 금액(IRP 쪽)
    var roomToFill = combinedRoom;
    var extraCreditIfFilled = roomToFill > 0 ? floorWon(roomToFill * r.rate) : 0;

    var notes = [];
    if (pension > RULES.pensionLimit) {
      notes.push('연금저축에 ' + (pension - RULES.pensionLimit).toLocaleString('ko-KR') +
        '원을 더 넣어도 세액공제는 600만원까지만 인정됩니다. 600만원을 넘는 금액은 IRP로 옮겨 담아야 공제 대상이 됩니다.');
    }
    if (isa > 0 && isa < RULES.isaCap / RULES.isaRate) {
      notes.push('ISA 전환금액 ' + isa.toLocaleString('ko-KR') + '원의 10%인 ' +
        isaExtra.toLocaleString('ko-KR') + '원이 추가 한도로 잡혔습니다. 3,000만원을 넘겨 옮겨도 추가 한도는 300만원에서 멈춥니다.');
    }
    if (capped) {
      notes.push('산출된 세액공제 ' + creditAmount.toLocaleString('ko-KR') + '원보다 공제 전 결정세액이 적어 ' +
        applied.toLocaleString('ko-KR') + '원까지만 적용됩니다. 세액공제는 낼 세금을 0원 아래로 깎지 못합니다.');
    }
    if (paid > 0 && combinedRoom > 0 && !capped) {
      notes.push('합산 한도가 ' + combinedRoom.toLocaleString('ko-KR') + '원 남았습니다. 12월 31일까지 IRP에 더 넣으면 최대 ' +
        extraCreditIfFilled.toLocaleString('ko-KR') + '원을 더 돌려받습니다.');
    }

    return {
      valid: r.income > 0,
      incomeType: r.incomeType,
      income: r.income,
      threshold: r.threshold,
      thresholdLabel: r.thresholdLabel,
      high: r.high,
      rate: r.rate,
      ratePct: r.rate * 100,
      incomeRate: r.incomeRate,
      localRate: r.localRate,
      pension: pension,
      irp: irp,
      isa: isa,
      taxBefore: taxBefore,
      pensionUsed: pensionUsed,
      irpUsed: irpUsed,
      isaUsed: isaUsed,
      pensionRoom: pensionRoom,
      combinedRoom: combinedRoom,
      isaExtra: isaExtra,
      isaRoom: isaRoom,
      baseTotal: baseTotal,
      target: target,
      incomeTax: incomeTax,
      localTax: localTax,
      credit: creditAmount,
      applied: applied,
      capped: capped,
      paid: paid,
      paidTotal: paidTotal,
      refundRate: refundRate,
      roomToFill: roomToFill,
      extraCreditIfFilled: extraCreditIfFilled,
      accountRoom: Math.max(0, RULES.depositCap - pension - irp),
      notes: notes
    };
  }

  /** 세액공제 단계표 — 0 → 연금저축 600 → +IRP 300 → +ISA 300 */
  function creditSteps(opts) {
    var o = opts || {};
    var r = rateFor(o);
    var steps = [
      { label: '납입 없음', pension: 0, irp: 0, isa: 0 },
      { label: '연금저축 600만원', pension: RULES.pensionLimit, irp: 0, isa: 0 },
      { label: '＋IRP 300만원', pension: RULES.pensionLimit, irp: 3000000, isa: 0 },
      { label: '＋ISA 전환 3,000만원', pension: RULES.pensionLimit, irp: 3000000, isa: 30000000 }
    ];
    return steps.map(function (s) {
      var c = credit({ incomeType: r.incomeType, income: r.income, pension: s.pension, irp: s.irp, isa: s.isa });
      return {
        label: s.label,
        pension: s.pension,
        irp: s.irp,
        isa: s.isa,
        target: c.target,
        credit: c.credit,
        added: c.credit
      };
    });
  }

  /* ── 2. 연금저축 vs IRP 조합 ─────────────────────────────── */
  function creditOf(pension, irp, rate) {
    var target = Math.min(pension, RULES.pensionLimit) + irp;
    target = Math.min(target, RULES.combinedLimit);
    var incomeTax = floorWon(target * (rate / (1 + RULES.localRate)));
    var localTax = floorWon(incomeTax * RULES.localRate);
    return { target: target, credit: incomeTax + localTax };
  }

  /**
   * 연금저축 vs IRP 배분 시뮬레이터
   * @param {object} opts incomeType, income, budget(연 납입 가능액),
   *                      feePension(연금저축 연 수수료율 %), feeIrp(IRP 연 수수료율 %), years(비교 기간)
   */
  function combo(opts) {
    var o = opts || {};
    var r = rateFor(o);
    var budget = clamp(num(o.budget, 0), 0, LIMITS.money.max);
    var feePension = clamp(num(o.feePension, 0.25), 0, 3);
    var feeIrp = clamp(num(o.feeIrp, 0.35), 0, 3);
    var years = clamp(Math.round(num(o.years, 10)), 1, 40);

    // 권장: 유연한 연금저축을 600만원까지 먼저, 나머지는 IRP로 900만원까지
    var pension = Math.min(budget, RULES.pensionLimit);
    var irp = Math.min(Math.max(0, budget - pension), RULES.combinedLimit - pension);
    var overflow = Math.max(0, budget - pension - irp);
    var plan = creditOf(pension, irp, r.rate);

    var onlyPension = creditOf(Math.min(budget, RULES.pensionLimit), 0, r.rate);
    var onlyIrp = creditOf(0, Math.min(budget, RULES.combinedLimit), r.rate);
    var full = creditOf(RULES.pensionLimit, RULES.combinedLimit - RULES.pensionLimit, r.rate);

    var feeP = floorWon(pension * (feePension / 100) * years);
    var feeI = floorWon(irp * (feeIrp / 100) * years);

    var notes = [];
    if (budget < RULES.pensionLimit) {
      notes.push('1년에 ' + (budget / 10000).toFixed(0) + '만원까지밖에 못 넣는다면 연금저축부터 채우세요. IRP는 900만원을 넘겨 담을 때 필요한 계좌입니다.');
    } else if (budget <= RULES.combinedLimit) {
      notes.push('연금저축 600만원을 채우고 남은 ' + ((budget - pension) / 10000).toFixed(0) +
        '만원을 IRP에 넣으면 세액공제를 최대로 받으면서, 목돈이 필요할 때 꺼내기 쉬운 연금저축 비중을 지킬 수 있습니다.');
    } else {
      notes.push('900만원을 넘는 ' + (overflow / 10000).toFixed(0) + '만원은 세액공제가 붙지 않습니다. 다만 과세이연 효과는 그대로라 노후 자금으로는 의미가 있습니다.');
    }
    if (onlyIrp.credit === plan.credit && plan.credit > 0) {
      notes.push('세액공제 금액만 보면 IRP만 넣어도 같습니다. 차이는 중도인출 자유도(연금저축)와 위험자산 70% 한도·상품 범위(IRP)입니다.');
    }
    notes.push('IRP는 55세 전에 꺼내려면 법정 사유(무주택자 주택구입·전세보증금, 6개월 이상 요양, 재난, 파산·개인회생, 담보대출 상환)가 있어야 하고, 없으면 해지해야 합니다.');

    return {
      valid: r.income > 0,
      incomeType: r.incomeType,
      income: r.income,
      high: r.high,
      rate: r.rate,
      ratePct: r.rate * 100,
      budget: budget,
      pension: pension,
      irp: irp,
      overflow: overflow,
      credit: plan.credit,
      target: plan.target,
      maxCredit: floorWon(RULES.combinedLimit * r.rate),
      missCredit: Math.max(0, floorWon(RULES.combinedLimit * r.rate) - plan.credit),
      pensionShare: budget > 0 ? (pension / budget) * 100 : 0,
      irpShare: budget > 0 ? (irp / budget) * 100 : 0,
      overflowShare: budget > 0 ? (overflow / budget) * 100 : 0,
      feePension: feePension,
      feeIrp: feeIrp,
      years: years,
      feeP: feeP,
      feeI: feeI,
      feeDiff: feeI - feeP,
      feeTotal: feeP + feeI,
      creditAfterFee: plan.credit - (feeP + feeI),
      scenarios: [
        { key: 'pension', label: '연금저축만', pension: onlyPension.target, irp: 0, credit: onlyPension.credit, note: '중도인출 자유 · 주식 100%' },
        { key: 'irp', label: 'IRP만', pension: 0, irp: onlyIrp.target, credit: onlyIrp.credit, note: '법정 사유만 인출 · 위험자산 70%' },
        { key: 'mix', label: '권장 배분', pension: pension, irp: irp, credit: plan.credit, note: '유연성 + 한도 900만원' },
        { key: 'full', label: '900만원 풀', pension: RULES.pensionLimit, irp: RULES.combinedLimit - RULES.pensionLimit, credit: full.credit, note: '한도 100% 활용' }
      ],
      notes: notes
    };
  }

  /* ── 3. 연금 수령 & 세금 ─────────────────────────────────── */
  function ageRate(age, lifetime) {
    if (lifetime) return { rate: RULES.lifetimeRate, label: '종신계약 3.3%' };
    var a = clamp(Math.round(num(age, 60)), 0, 120);
    for (var i = 0; i < RULES.ageRates.length; i++) {
      if (a >= RULES.ageRates[i].min) {
        return { rate: RULES.ageRates[i].rate, label: RULES.ageRates[i].label + ' ' + (RULES.ageRates[i].rate * 100).toFixed(1) + '%' };
      }
    }
    return { rate: RULES.ageRates[RULES.ageRates.length - 1].rate, label: '70세 미만 5.5%' };
  }

  /** 연금수령한도 — 시행령 제40조의2제3항 제3호 */
  function pensionLimit(balance, year) {
    var b = clamp(num(balance, 0), 0, LIMITS.balance.max);
    var y = clamp(Math.round(num(year, 1)), 1, 60);
    if (y >= 11) return { limit: b, ratio: 1.2, unlimited: true, year: y };
    var limit = floorWon((b / (11 - y)) * 1.2);
    return { limit: limit, ratio: 1.2 / (11 - y), unlimited: false, year: y };
  }

  function pensionLimitTable(balance) {
    var b = clamp(num(balance, 0), 0, LIMITS.balance.max);
    var rows = [];
    for (var y = 1; y <= 11; y++) {
      var l = pensionLimit(b, y);
      rows.push({ year: y, ratio: l.ratio, limit: l.limit, unlimited: l.unlimited });
    }
    return rows;
  }

  /**
   * 연금 수령 세금
   * @param {object} opts balance(연초 평가액), year(연금수령연차), age, withdraw(올해 인출액),
   *                      otherPrivate(다른 사적연금 연금수령액), nonTaxable(공제받지 않은 원금),
   *                      lifetime(종신형), otherIncome(연금 외 종합소득금액)
   */
  function pension(opts) {
    var o = opts || {};
    var balance = clamp(num(o.balance, 0), 0, LIMITS.balance.max);
    var year = clamp(Math.round(num(o.year, 1)), 1, 60);
    var age = clamp(Math.round(num(o.age, 60)), 55, 120);
    var withdraw = clamp(num(o.withdraw, 0), 0, LIMITS.withdraw.max);
    var otherPrivate = clamp(num(o.otherPrivate, 0), 0, LIMITS.withdraw.max);
    var nonTaxable = clamp(num(o.nonTaxable, 0), 0, LIMITS.money.max);
    var otherIncome = clamp(num(o.otherIncome, 0), 0, LIMITS.income.max);
    var lifetime = !!o.lifetime;

    var lim = pensionLimit(balance, year);
    var within = Math.min(withdraw, lim.limit);
    var over = Math.max(0, withdraw - lim.limit);

    // 인출 순서: 과세제외금액 → (이연퇴직소득) → 세액공제분·운용수익
    var nonTaxableUsed = Math.min(nonTaxable, within);
    var taxableWithin = Math.max(0, within - nonTaxableUsed);
    var ar = ageRate(age, lifetime);

    var taxWithin = floorWon(taxableWithin * ar.rate);
    var taxOver = floorWon(over * RULES.earlyRate);
    var taxTotal = taxWithin + taxOver;
    var taxableTotal = taxableWithin + over;

    var privateTotal = taxableWithin + otherPrivate;
    var overThreshold = privateTotal > RULES.privateThreshold;

    var separateTax = floorWon(privateTotal * RULES.separateRate);
    var ded = pensionDeduction(privateTotal);
    var addTax = floorWon((basicTax(otherIncome + ded.income) - basicTax(otherIncome)) * (1 + RULES.localRate));
    var comprehensiveTax = addTax;
    var comparison = null;
    if (privateTotal > RULES.privateThreshold) {
      var better = separateTax <= comprehensiveTax ? 'separate' : 'comprehensive';
      comparison = {
        privateTotal: privateTotal,
        threshold: RULES.privateThreshold,
        over: overThreshold,
        separateTax: separateTax,
        comprehensiveTax: comprehensiveTax,
        pensionDeduction: ded.amount,
        pensionIncome: ded.income,
        otherIncome: otherIncome,
        marginal: marginalRate(otherIncome + ded.income),
        better: better,
        diff: Math.abs(separateTax - comprehensiveTax),
        withheld: taxWithin,
        separateExtra: Math.max(0, separateTax - taxWithin),
        comprehensiveExtra: Math.max(0, comprehensiveTax - taxWithin)
      };
    }

    var earlyTax = floorWon(withdraw * RULES.earlyRate);
    var effectiveRate = withdraw > 0 ? (taxTotal / withdraw) * 100 : 0;

    var notes = [];
    if (over > 0) {
      notes.push('연금수령한도 ' + lim.limit.toLocaleString('ko-KR') + '원을 넘긴 ' + over.toLocaleString('ko-KR') +
        '원은 연금외수령으로 보아 기타소득세 16.5%가 붙습니다. 한도 안에서 나눠 받는 편이 낫습니다.');
    }
    if (lim.unlimited) {
      notes.push('연금수령연차 11년차부터는 연금수령한도가 적용되지 않습니다. 다만 사적연금 1,500만원 기준은 그대로입니다.');
    }
    if (overThreshold) {
      notes.push('사적연금 수령액이 연 1,500만원을 넘어 ' + (comparison.better === 'separate' ? '16.5% 분리과세' : '종합과세') +
        '가 유리합니다(연금 외 소득이 지금 값 그대로일 때). 선택은 다음 해 5월 종합소득세 신고 때 합니다.');
    }
    if (age < RULES.pensionAge) {
      notes.push('55세 이전 인출은 연금수령으로 인정되지 않아 기타소득세 16.5%가 붙습니다(부득이한 사유 제외).');
    }
    if (nonTaxable > 0 && nonTaxableUsed > 0) {
      notes.push('공제받지 않은 원금 ' + nonTaxableUsed.toLocaleString('ko-KR') + '원이 먼저 나간 것으로 보아 세금이 붙지 않았습니다(시행령 제40조의3).');
    }

    return {
      valid: balance > 0 || withdraw > 0,
      balance: balance,
      year: year,
      age: age,
      lifetime: lifetime,
      withdraw: withdraw,
      limit: lim.limit,
      limitRatio: lim.ratio,
      unlimited: lim.unlimited,
      within: within,
      over: over,
      nonTaxable: nonTaxable,
      nonTaxableUsed: nonTaxableUsed,
      taxableWithin: taxableWithin,
      taxableTotal: taxableTotal,
      ageRate: ar.rate,
      ageRatePct: ar.rate * 100,
      ageLabel: ar.label,
      taxWithin: taxWithin,
      taxOver: taxOver,
      taxTotal: taxTotal,
      effectiveRate: effectiveRate,
      otherPrivate: otherPrivate,
      privateTotal: privateTotal,
      overThreshold: overThreshold,
      comparison: comparison,
      earlyTax: earlyTax,
      earlyDiff: earlyTax - taxTotal,
      notes: notes
    };
  }

  root.PensionCalc = {
    DATA_DATE: DATA_DATE,
    RULES: RULES,
    LIMITS: LIMITS,
    rateFor: rateFor,
    credit: credit,
    creditSteps: creditSteps,
    combo: combo,
    pension: pension,
    pensionLimit: pensionLimit,
    pensionLimitTable: pensionLimitTable,
    pensionDeduction: pensionDeduction,
    ageRate: ageRate,
    basicTax: basicTax,
    marginalRate: marginalRate
  };
})(typeof window !== 'undefined' ? window : this);
