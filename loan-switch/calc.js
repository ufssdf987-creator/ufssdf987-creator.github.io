/*!
 * calc.js — 2026 대출 갈아타기(대환) 손익분기 · 중도상환수수료 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.LoanSwitchCalc 로 노출합니다.
 *
 * 근거 (2026년 기준)
 *  - 중도상환수수료 계산식: 중도상환금액 × 수수료율 × (대출잔여일수 ÷ 대출기간)
 *      은행연합회 소비자포털 「중도상환수수료 계산방법」, 각 은행 대출 상품설명서.
 *      대출기간이 3년을 넘으면 '대출일로부터 3년째 되는 날'을 만기로 봅니다.
 *  - 중도상환수수료 부과 근거: 금융소비자 보호에 관한 법률 제20조제1항제4호나목.
 *      원칙적으로 부과 금지, 계약 성립일부터 3년 이내 상환 시에만 부과할 수 있습니다.
 *  - 2025.1.13 개편: 금융소비자보호 감독규정 개정으로 수수료를 실비용(자금운용 기회비용,
 *      인지세·감정평가수수료·담보권설정비 등 행정·모집비용) 범위 안에서만 부과합니다.
 *      은행권 평균 주담대 고정금리 1.43% → 0.56%, 변동금리 1.25% → 0.55%,
 *      신용대출 고정 0.95% → 0.12%, 변동 0.83% → 0.11% (금융위원회 2025.1.9 보도자료).
 *  - 인지세(인지세법 제3조·제8조): 5,000만원 이하 비과세, 5,000만원 초과~1억원 이하 7만원,
 *      1억원 초과~10억원 이하 15만원. 은행과 차주가 절반씩 부담합니다.
 *  - 대환대출 인프라(금융위원회): 신용대출·아파트 주담대는 기존 대출 실행 후 6개월,
 *      전세대출은 3개월 경과 후 신청할 수 있고, 증액 대환은 되지 않습니다.
 *  - 총부채원리금상환비율(DSR): 은행권 40%, 2금융권 50%. 2025.7.1부터 스트레스 DSR 3단계.
 *
 * 계산식
 *  - 원리금균등: 월 상환액 = 잔액 × i ÷ (1 − (1+i)^−n), i = 연이율 ÷ 12
 *  - 원금균등  : 매달 원금 = 잔액 ÷ n, 이자 = 남은 잔액 × i
 *  - 만기일시  : 매달 이자 = 잔액 × i, 만기에 원금 일시 상환
 *  - 갈아타기 순이익 = (기존 총 이자 − 새 총 이자) − 중도상환수수료 − 부대비용
 *  - 손익분기 개월 = 누적 이자 절감액이 (수수료 + 부대비용)을 처음 넘는 달
 *  - 일부 상환 후 기간 단축: 같은 월 상환액으로 잔액이 0이 되는 개월 수를 계산
 *
 * 금액은 원 단위로 반올림해 보여 주고, 중도상환수수료는 금융회사 관행대로 원 미만을 버립니다.
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-26';

  /* ── 2026년 은행권 평균 중도상환수수료율 (2025.1.13 개편 이후) ───── */
  var AVERAGE_FEE = [
    { id: 'mortgage-fixed', loan: '주택담보', rateType: '고정', rate: 0.56 },
    { id: 'mortgage-var', loan: '주택담보', rateType: '변동', rate: 0.55 },
    { id: 'other-fixed', loan: '기타담보', rateType: '고정', rate: 0.45 },
    { id: 'other-var', loan: '기타담보', rateType: '변동', rate: 0.40 },
    { id: 'credit-fixed', loan: '신용대출', rateType: '고정', rate: 0.12 },
    { id: 'credit-var', loan: '신용대출', rateType: '변동', rate: 0.11 }
  ];

  var METHOD_LABEL = {
    equal: '원리금균등',
    principal: '원금균등',
    bullet: '만기일시'
  };

  var LIMITS = {
    balance: { min: 0, max: 10000000000 },      // 100억원
    months: { min: 1, max: 600 },               // 50년
    rate: { min: 0, max: 30 },
    feeRate: { min: 0, max: 5 },
    feeRatio: { min: 0, max: 100 },
    termMonths: { min: 1, max: 600 },
    costs: { min: 0, max: 100000000 },
    repay: { min: 0, max: 10000000000 },
    exemption: { min: 0, max: 100 }
  };

  /* ── 공통 유틸 ───────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round(n) { return Math.round(n); }
  function floorWon(n) { return Math.floor(n + 1e-7); }
  function rate(v) { return clamp(num(v, 0), LIMITS.rate.min, LIMITS.rate.max); }
  function methodOf(v) { return METHOD_LABEL[v] ? v : 'equal'; }

  /* ── 날짜 ────────────────────────────────────────────────── */
  function parseDate(text) {
    if (!text) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text).trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var t = Date.UTC(y, mo - 1, d);
    var dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return t;
  }
  function daysInMonth(y, moIndex) {
    return new Date(Date.UTC(y, moIndex + 1, 0)).getUTCDate();
  }
  function addMonths(t, months) {
    var d = new Date(t);
    var y = d.getUTCFullYear();
    var mo = d.getUTCMonth() + months;
    var day = d.getUTCDate();
    var ny = y + Math.floor(mo / 12);
    var nm = ((mo % 12) + 12) % 12;
    day = Math.min(day, daysInMonth(ny, nm));
    return Date.UTC(ny, nm, day);
  }
  function dayDiff(a, b) { return Math.round((b - a) / 86400000); }
  function isoDate(t) {
    var d = new Date(t);
    var mm = ('0' + (d.getUTCMonth() + 1)).slice(-2);
    var dd = ('0' + d.getUTCDate()).slice(-2);
    return d.getUTCFullYear() + '-' + mm + '-' + dd;
  }

  /* ══════════════════════════════════════════════════════════
   * 1. 상환 스케줄 (잔액·금리·남은 기간 → 총 이자)
   * ══════════════════════════════════════════════════════════ */
  function amortize(opts) {
    var o = opts || {};
    var balance = clamp(num(o.balance, 0), 0, LIMITS.balance.max);
    var months = clamp(Math.round(num(o.months, 0)), 0, LIMITS.months.max);
    var annual = rate(o.annualRate);
    var method = methodOf(o.method);
    var i = annual / 1200;

    if (balance <= 0 || months <= 0) {
      return {
        balance: balance, months: months, method: method, methodLabel: METHOD_LABEL[method],
        annualRate: annual, payment: 0, firstPayment: 0, totalInterest: 0, totalPayment: 0,
        monthlyInterest: [], monthlyPayment: [], rows: []
      };
    }

    var firstPayment;
    if (method === 'bullet') {
      firstPayment = balance * i;
    } else if (method === 'principal') {
      firstPayment = balance / months + balance * i;
    } else {
      firstPayment = i === 0 ? balance / months : balance * i / (1 - Math.pow(1 + i, -months));
    }

    var left = balance;
    var totalInterest = 0;
    var totalPayment = 0;
    var monthlyInterest = [];
    var monthlyPayment = [];
    var rows = [];

    for (var m = 1; m <= months; m++) {
      var interest = left * i;
      var principalPart;
      if (method === 'bullet') {
        principalPart = m === months ? left : 0;
      } else if (method === 'principal') {
        principalPart = m === months ? left : balance / months;
        if (principalPart > left) principalPart = left;
      } else {
        principalPart = firstPayment - interest;
        if (m === months || principalPart > left) principalPart = left;
        if (principalPart < 0) principalPart = 0;
      }
      var pay = interest + principalPart;
      totalInterest += interest;
      totalPayment += pay;
      monthlyInterest.push(interest);
      monthlyPayment.push(pay);
      if (m <= 3 || m === months) {
        rows.push({
          month: m, interest: interest, principal: principalPart,
          payment: pay, balance: left - principalPart
        });
      }
      left -= principalPart;
    }

    return {
      balance: balance,
      months: months,
      method: method,
      methodLabel: METHOD_LABEL[method],
      annualRate: annual,
      payment: firstPayment,
      firstPayment: firstPayment,
      lastPayment: monthlyPayment[monthlyPayment.length - 1],
      totalInterest: totalInterest,
      totalPayment: totalPayment,
      monthlyInterest: monthlyInterest,
      monthlyPayment: monthlyPayment,
      rows: rows
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 2. 중도상환수수료 (일할 계산)
   * ══════════════════════════════════════════════════════════ */
  function fee(opts) {
    var o = opts || {};
    var amount = clamp(num(o.amount, 0), 0, LIMITS.repay.max);
    var feeRate = clamp(num(o.feeRate, 0), LIMITS.feeRate.min, LIMITS.feeRate.max);
    var termMonths = clamp(Math.round(num(o.termMonths, 36)), LIMITS.termMonths.min, LIMITS.termMonths.max);
    var principal = clamp(num(o.principal, amount), 0, LIMITS.balance.max);
    var exemptionPct = clamp(num(o.exemptionPct, 0), LIMITS.exemption.min, LIMITS.exemption.max);

    var start = parseDate(o.startDate);
    var pay = parseDate(o.payDate);
    if (!start) return { valid: false, reason: '대출 실행일을 YYYY-MM-DD 형식으로 넣어 주세요.', fee: 0, amount: amount };
    if (!pay) return { valid: false, reason: '상환일을 YYYY-MM-DD 형식으로 넣어 주세요.', fee: 0, amount: amount };

    var maturity = addMonths(start, termMonths);
    if (pay < start) {
      return {
        valid: false, reason: '상환일이 대출 실행일보다 빠릅니다.', fee: 0, amount: amount,
        startDate: isoDate(start), maturityDate: isoDate(maturity)
      };
    }
    if (pay > maturity) {
      return {
        valid: false, reason: '상환일이 대출 만기일 이후입니다. 만기 상환은 중도상환이 아닙니다.',
        fee: 0, amount: amount, startDate: isoDate(start), maturityDate: isoDate(maturity)
      };
    }

    var capEnd = addMonths(start, 36);
    var baseEnd = maturity < capEnd ? maturity : capEnd;
    var baseDays = dayDiff(start, baseEnd);
    var elapsedDays = dayDiff(start, pay);
    var remainDays = baseDays - elapsedDays;
    if (remainDays < 0) remainDays = 0;
    var ratio = baseDays > 0 ? remainDays / baseDays : 0;

    var exemptAmount = floorWon(Math.min(amount, principal * exemptionPct / 100));
    var feeBase = Math.max(0, amount - exemptAmount);
    var applied = feeBase * (feeRate / 100) * ratio;
    var feeAmount = floorWon(applied);

    var toMaturityDays = dayDiff(pay, maturity);
    return {
      valid: true,
      amount: amount,
      principal: principal,
      feeRate: feeRate,
      termMonths: termMonths,
      startDate: isoDate(start),
      maturityDate: isoDate(maturity),
      baseEndDate: isoDate(baseEnd),
      payDate: isoDate(pay),
      baseDays: baseDays,
      elapsedDays: elapsedDays,
      remainDays: remainDays,
      ratio: ratio,
      cappedBy3Years: maturity > capEnd,
      exemptAmount: exemptAmount,
      exemptionPct: exemptionPct,
      feeBase: feeBase,
      fee: feeAmount,
      waived: remainDays <= 0 || feeRate <= 0 || feeBase <= 0,
      daysToMaturity: toMaturityDays,
      underThreeMonthsLeft: toMaturityDays < 92
    };
  }

  function feeTable(opts) {
    var o = opts || {};
    var start = parseDate(o.startDate);
    var termMonths = clamp(Math.round(num(o.termMonths, 36)), LIMITS.termMonths.min, LIMITS.termMonths.max);
    if (!start) return [];
    var points = [0, 6, 12, 18, 24, 30, 36].filter(function (m) { return m <= termMonths; });
    return points.map(function (m) {
      var r = fee({
        amount: o.amount, feeRate: o.feeRate, termMonths: termMonths,
        principal: o.principal, exemptionPct: o.exemptionPct,
        startDate: o.startDate, payDate: isoDate(addMonths(start, m))
      });
      return {
        elapsedMonths: m,
        payDate: isoDate(addMonths(start, m)),
        elapsedDays: r.elapsedDays,
        remainDays: r.remainDays,
        ratio: r.ratio,
        fee: r.fee
      };
    });
  }

  /* ══════════════════════════════════════════════════════════
   * 3. 갈아타기(대환) 손익 · 손익분기
   * ══════════════════════════════════════════════════════════ */
  function refinance(opts) {
    var o = opts || {};
    var balance = clamp(num(o.balance, 0), 0, LIMITS.balance.max);
    var months = clamp(Math.round(num(o.months, 0)), 0, LIMITS.months.max);
    var oldRate = rate(o.oldRate);
    var newRate = rate(o.newRate);
    var method = methodOf(o.method);
    var feeRate = clamp(num(o.feeRate, 0), LIMITS.feeRate.min, LIMITS.feeRate.max);
    var feeRatio = clamp(num(o.feeRatio, 100), LIMITS.feeRatio.min, LIMITS.feeRatio.max);
    var costs = clamp(num(o.costs, 0), LIMITS.costs.min, LIMITS.costs.max);

    var oldLoan = amortize({ balance: balance, months: months, annualRate: oldRate, method: method });
    var newLoan = amortize({ balance: balance, months: months, annualRate: newRate, method: method });

    var feeAmount = floorWon(balance * (feeRate / 100) * (feeRatio / 100));
    var totalCost = feeAmount + costs;
    var interestSaving = oldLoan.totalInterest - newLoan.totalInterest;
    var netSaving = interestSaving - totalCost;
    var rateGap = oldRate - newRate;

    /* 누적 이자 절감이 비용을 넘는 달 = 손익분기 */
    var cum = 0;
    var bepMonths = null;
    for (var m = 0; m < months; m++) {
      cum += (oldLoan.monthlyInterest[m] || 0) - (newLoan.monthlyInterest[m] || 0);
      if (totalCost > 0 && cum >= totalCost - 1e-6) { bepMonths = m + 1; break; }
    }
    if (totalCost <= 0) bepMonths = 0;

    var monthlySaving = oldLoan.firstPayment - newLoan.firstPayment;
    var verdict = 'even';
    if (netSaving > 0) verdict = 'gain';
    else if (netSaving < 0) verdict = 'loss';

    return {
      valid: balance > 0 && months > 0,
      balance: balance,
      months: months,
      method: method,
      methodLabel: METHOD_LABEL[method],
      oldRate: oldRate,
      newRate: newRate,
      rateGap: rateGap,
      feeRate: feeRate,
      feeRatio: feeRatio,
      costs: costs,
      fee: feeAmount,
      totalCost: totalCost,
      oldLoan: oldLoan,
      newLoan: newLoan,
      oldTotalInterest: oldLoan.totalInterest,
      newTotalInterest: newLoan.totalInterest,
      oldTotalPayment: oldLoan.totalPayment,
      newTotalPayment: newLoan.totalPayment,
      interestSaving: interestSaving,
      netSaving: netSaving,
      monthlySaving: monthlySaving,
      bepMonths: bepMonths,
      monthsAfterBep: bepMonths === null ? null : Math.max(0, months - bepMonths),
      verdict: verdict
    };
  }

  function refinanceTable(opts) {
    var o = opts || {};
    var oldRate = rate(o.oldRate);
    var gaps = [0.3, 0.5, 0.7, 1.0, 1.3, 1.5];
    if (o.newRate !== undefined && o.newRate !== null) {
      var nowGap = Math.round((oldRate - rate(o.newRate)) * 100) / 100;
      if (nowGap > 0 && gaps.indexOf(nowGap) < 0) gaps.push(nowGap);
      gaps.sort(function (a, b) { return a - b; });
    }
    var rows = [];
    for (var k = 0; k < gaps.length; k++) {
      var gap = gaps[k];
      var newRate = Math.max(0, oldRate - gap);
      if (newRate === oldRate) continue;
      var r = refinance({
        balance: o.balance, months: o.months, oldRate: oldRate, newRate: newRate,
        method: o.method, feeRate: o.feeRate, feeRatio: o.feeRatio, costs: o.costs
      });
      rows.push({
        gap: gap,
        newRate: newRate,
        interestSaving: r.interestSaving,
        netSaving: r.netSaving,
        bepMonths: r.bepMonths,
        verdict: r.verdict
      });
    }
    return rows;
  }

  /* ══════════════════════════════════════════════════════════
   * 4. 일부 중도상환 vs 유지
   * ══════════════════════════════════════════════════════════ */
  function partial(opts) {
    var o = opts || {};
    var balance = clamp(num(o.balance, 0), 0, LIMITS.balance.max);
    var months = clamp(Math.round(num(o.months, 0)), 0, LIMITS.months.max);
    var annual = rate(o.annualRate);
    var repay = clamp(num(o.repay, 0), 0, LIMITS.repay.max);
    var feeRate = clamp(num(o.feeRate, 0), LIMITS.feeRate.min, LIMITS.feeRate.max);
    var feeRatio = clamp(num(o.feeRatio, 100), LIMITS.feeRatio.min, LIMITS.feeRatio.max);
    var mode = o.mode === 'reduce' ? 'reduce' : 'shorten';

    if (repay > balance) repay = balance;
    var keep = amortize({ balance: balance, months: months, annualRate: annual, method: 'equal' });
    var afterBalance = balance - repay;
    var i = annual / 1200;
    var feeAmount = floorWon(repay * (feeRate / 100) * (feeRatio / 100));

    var interestAfter = 0;
    var monthsAfter = months;
    var paymentAfter = 0;
    var monthlyCut = 0;

    if (afterBalance <= 0) {
      interestAfter = 0;
      monthsAfter = 0;
      monthlyCut = keep.firstPayment;
    } else if (months <= 0) {
      interestAfter = 0;
      monthsAfter = 0;
    } else if (mode === 'reduce') {
      var sched = amortize({ balance: afterBalance, months: months, annualRate: annual, method: 'equal' });
      interestAfter = sched.totalInterest;
      paymentAfter = sched.firstPayment;
      monthlyCut = keep.firstPayment - paymentAfter;
    } else {
      var pay = keep.firstPayment;
      var left = afterBalance;
      var m = 0;
      var ok = true;
      while (left > 0.5 && m < 1200) {
        m++;
        var interest = left * i;
        var principalPart = pay - interest;
        if (principalPart <= 0) { ok = false; break; }
        if (principalPart > left) principalPart = left;
        interestAfter += interest;
        left -= principalPart;
      }
      monthsAfter = ok ? m : months;
      paymentAfter = pay;
    }

    var interestSaved = keep.totalInterest - interestAfter;
    var netSaving = interestSaved - feeAmount;
    var years = months / 12;
    var effectiveYield = repay > 0 && years > 0 ? (netSaving / repay) / years * 100 : 0;
    var verdict = netSaving > 0 ? 'gain' : (netSaving < 0 ? 'loss' : 'even');

    return {
      valid: balance > 0 && months > 0 && repay > 0,
      balance: balance,
      months: months,
      annualRate: annual,
      repay: repay,
      feeRate: feeRate,
      feeRatio: feeRatio,
      mode: mode,
      modeLabel: mode === 'reduce' ? '월 상환액 감소' : '기간 단축',
      fee: feeAmount,
      keep: keep,
      keepInterest: keep.totalInterest,
      interestAfter: interestAfter,
      interestSaved: interestSaved,
      netSaving: netSaving,
      balanceAfter: afterBalance,
      monthsAfter: monthsAfter,
      monthsShortened: Math.max(0, months - monthsAfter),
      paymentAfter: paymentAfter,
      monthlyCut: monthlyCut,
      effectiveYield: effectiveYield,
      verdict: verdict
    };
  }

  function partialTable(opts) {
    var o = opts || {};
    var balance = clamp(num(o.balance, 0), 0, LIMITS.balance.max);
    var shares = [0.1, 0.2, 0.3, 0.5];
    return shares.map(function (s) {
      var r = partial({
        balance: balance, months: o.months, annualRate: o.annualRate,
        repay: balance * s, feeRate: o.feeRate, feeRatio: o.feeRatio, mode: 'shorten'
      });
      return {
        share: s,
        repay: balance * s,
        interestSaved: r.interestSaved,
        fee: r.fee,
        netSaving: r.netSaving,
        monthsShortened: r.monthsShortened
      };
    });
  }

  /* ── 인지세 (참고용) ─────────────────────────────────────── */
  function stampTax(amount) {
    var a = num(amount, 0);
    if (a <= 50000000) return 0;
    if (a <= 100000000) return 70000;
    if (a <= 1000000000) return 150000;
    return 350000;
  }

  root.LoanSwitchCalc = {
    DATA_DATE: DATA_DATE,
    AVERAGE_FEE: AVERAGE_FEE,
    METHOD_LABEL: METHOD_LABEL,
    LIMITS: LIMITS,
    parseDate: parseDate,
    addMonths: addMonths,
    isoDate: isoDate,
    amortize: amortize,
    fee: fee,
    feeTable: feeTable,
    refinance: refinance,
    refinanceTable: refinanceTable,
    partial: partial,
    partialTable: partialTable,
    stampTax: stampTax,
    round: round,
    floorWon: floorWon
  };
})(typeof window !== 'undefined' ? window : this);
