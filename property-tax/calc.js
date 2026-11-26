/*!
 * calc.js — 2026 부동산 세금(취득세·양도소득세·증여세) 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.PropertyTaxCalc 로 노출합니다.
 *
 * 근거 (2026년 11월 기준)
 *  [취득세]
 *  - 주택 유상거래 세율: 지방세법 제11조제1항제8호.
 *      6억원 이하 1%, 6억원 초과~9억원 이하 (취득당시가액 × 2/3억원 − 3)%, 9억원 초과 3%.
 *      세율은 소수점 이하 다섯째 자리에서 반올림해 넷째 자리까지 계산합니다(같은 법 시행령).
 *  - 다주택 중과: 지방세법 제13조의2. 조정대상지역 2주택 8%·3주택 이상 12%,
 *      그 밖의 지역 3주택 8%·4주택 이상 12%. 일시적 2주택은 시행령 제28조의5에 따라
 *      종전 주택을 기한(두 집 모두 조정대상지역이면 2년, 그 밖에는 3년) 안에 팔면 중과 제외.
 *  - 지방교육세: 지방세법 제151조. 일반세율 구간은 취득세율의 10%, 중과(8%·12%)는 0.4%.
 *  - 농어촌특별세: 농어촌특별세법 제4조·제5조. 전용면적 85㎡ 초과 주택에만 부과하며
 *      일반 0.2%, 8% 중과 0.6%, 12% 중과 1.0%. 85㎡ 이하(국민주택규모)는 비과세.
 *  - 생애최초 주택 취득세 감면: 지방세특례제한법 제36조의3. 본인·배우자 무주택, 취득당시가액
 *      12억원 이하, 2028년 12월 31일까지. 산출세액에서 200만원(소형주택·인구감소지역 300만원) 공제.
 *      감면 시 중과세율을 적용하지 않으며, 취득일부터 3년 이내 매각·증여 시 추징됩니다.
 *  - 신고·납부: 취득일부터 60일 이내(지방세법 제20조).
 *
 *  [양도소득세]
 *  - 1세대 1주택 비과세: 소득세법 제89조제1항제3호, 시행령 제154조. 2년 이상 보유,
 *      취득 당시 조정대상지역이었던 주택은 보유기간 중 2년 이상 거주, 양도가액 12억원 이하.
 *  - 고가주택 안분: 시행령 제160조. 과세 양도차익 = 양도차익 × (양도가액 − 12억원) ÷ 양도가액.
 *      장기보유특별공제액도 같은 비율로 안분합니다.
 *  - 장기보유특별공제: 소득세법 제95조제2항.
 *      표1(일반) 3년 6%에서 1년마다 2%p, 15년 이상 30%.
 *      표2(2년 이상 거주한 1세대 1주택) 보유 연 4%(최대 40%) + 거주 연 4%(최대 40%), 최대 80%.
 *  - 기본공제 250만원(소득세법 제103조), 세율은 제104조·제55조(6~45%).
 *      보유 1년 미만 70%, 1년 이상 2년 미만 60%, 2년 이상 기본세율.
 *  - 개인지방소득세: 지방세법 제103조의3. 양도소득세의 10%.
 *  - 신고: 양도일이 속한 달의 말일부터 2개월 이내(소득세법 제105조).
 *
 *  [증여세]
 *  - 증여재산공제: 상속세 및 증여세법 제53조(10년 합산). 배우자 6억원,
 *      직계존속 5천만원(미성년 2천만원), 직계비속 5천만원, 그 밖의 친족 1천만원.
 *  - 혼인·출산 증여재산공제: 같은 법 제53조의2. 혼인신고일 전후 2년 또는 자녀 출생·입양일부터
 *      2년 이내 직계존속 증여 시 기본공제와 별도로 1억원(혼인·출산 합산 1억원 한도).
 *  - 세율: 같은 법 제56조. 1억원 이하 10%, 5억원 이하 20%, 10억원 이하 30%,
 *      30억원 이하 40%, 30억원 초과 50%(누진공제).
 *  - 세대생략 할증: 같은 법 제57조. 증여자가 직계존속이고 수증자가 자녀가 아닌 직계비속이면
 *      산출세액의 30%(수증자가 미성년자면 40%)를 가산합니다.
 *  - 신고세액공제: 같은 법 제69조. 기한 내 신고 시 산출세액(할증 포함)의 3%.
 *  - 과세최저한: 과세표준 50만원 미만은 과세하지 않습니다(같은 법 제55조).
 *  - 신고: 증여일이 속한 달의 말일부터 3개월 이내(같은 법 제68조).
 *
 * 금액은 원 단위에서 버림(지방세·국세 실무 관행)해 보여 주고, 모든 결과는 참고용 모의 계산입니다.
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-26';

  var LIMITS = {
    price: { min: 0, max: 50000000000 },      // 500억원
    houses: { min: 1, max: 9 },
    months: { min: 0, max: 1200 },            // 100년
    expenses: { min: 0, max: 10000000000 },
    gift: { min: 0, max: 50000000000 },
    used: { min: 0, max: 600000000 }
  };

  /* ── 공통 유틸 ───────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function floorWon(n) { return Math.floor(n + 1e-7); }
  function round(n) { return Math.round(n); }

  /* ══════════════════════════════════════════════════════════
   * 1. 취득세
   * ══════════════════════════════════════════════════════════ */

  /** 1~3% 구간의 기본세율(소수). 6억 이하 1%, 6~9억 비례, 9억 초과 3% */
  function baseRate(price) {
    var p = clamp(num(price, 0), 0, LIMITS.price.max);
    if (p <= 0) return 0;
    if (p <= 600000000) return 0.01;
    if (p > 900000000) return 0.03;
    var pct = p / 300000000 * 2 - 3;           // 6억에서 1%, 9억에서 3%
    pct = Math.round(pct * 10000) / 10000;     // 소수점 넷째 자리까지
    return pct / 100;
  }

  /** 주택 수·지역·일시적 2주택을 반영한 취득세율과 구분 */
  function acqRate(price, houses, adjust, temporary2) {
    var h = clamp(round(num(houses, 1)), LIMITS.houses.min, LIMITS.houses.max);
    var base = baseRate(price);
    if (h === 1) return { rate: base, kind: 'base', houseCount: h };
    if (adjust) {
      if (h === 2) {
        if (temporary2) return { rate: base, kind: 'base', houseCount: h };
        return { rate: 0.08, kind: 'mid8', houseCount: h };
      }
      return { rate: 0.12, kind: 'mid12', houseCount: h };
    }
    if (h === 2) return { rate: base, kind: 'base', houseCount: h };
    if (h === 3) return { rate: 0.08, kind: 'mid8', houseCount: h };
    return { rate: 0.12, kind: 'mid12', houseCount: h };
  }

  /**
   * 취득세 계산
   * @param {object} opts price(취득가액), houses(취득 후 주택 수), adjust(조정대상지역),
   *                      over85(전용 85㎡ 초과), temporary2(일시적 2주택), firstTime(생애최초),
   *                      firstTimeLimit(감면 한도 200만/300만)
   */
  function acquisition(opts) {
    var o = opts || {};
    var price = clamp(num(o.price, 0), 0, LIMITS.price.max);
    var adj = !!o.adjust;
    var over = !!o.over85;
    var temp2 = !!o.temporary2;
    var r = acqRate(price, o.houses, adj, temp2);

    var acq = floorWon(price * r.rate);
    var edu = floorWon(r.kind === 'base' ? acq * 0.1 : price * 0.004);
    var rural = 0;
    if (over) {
      var ruralRate = r.kind === 'base' ? 0.002 : (r.kind === 'mid8' ? 0.006 : 0.01);
      rural = floorWon(price * ruralRate);
    }

    var limit = num(o.firstTimeLimit, 2000000) >= 3000000 ? 3000000 : 2000000;
    var firstTimeOk = !!o.firstTime && r.houseCount === 1 && price > 0 && price <= 1200000000;
    var reduction = firstTimeOk ? Math.min(acq, limit) : 0;

    var total = acq - reduction + edu + rural;
    var effective = price > 0 ? total / price * 100 : 0;

    var kindLabel = r.kind === 'base' ? '일반세율(1~3%)'
      : (r.kind === 'mid8' ? '중과 8%' : '중과 12%');
    var notes = [];
    if (r.kind !== 'base') {
      notes.push('다주택 중과가 적용됩니다. 중과세율에는 지방교육세 0.4%와 농어촌특별세 ' +
        (r.kind === 'mid8' ? '0.6%' : '1.0%') + '가 함께 붙습니다.');
    }
    if (temp2 && adj && r.houseCount === 2 && r.kind === 'base') {
      notes.push('일시적 2주택으로 보아 일반세율을 적용했습니다. 종전 주택을 기한 안에 팔지 못하면 중과세율과의 차액을 추징합니다.');
    }
    if (!!o.firstTime && !firstTimeOk) {
      notes.push(price > 1200000000
        ? '생애최초 감면은 취득당시가액 12억원 이하 주택만 받을 수 있어 이번 계산에는 반영하지 않았습니다.'
        : '생애최초 감면은 취득 후 1주택(무주택 세대)일 때만 적용되어 이번 계산에는 반영하지 않았습니다.');
    }
    if (!over) {
      notes.push('전용면적 85㎡ 이하(국민주택규모)라 농어촌특별세는 부과되지 않습니다.');
    }

    return {
      valid: price > 0,
      price: price,
      houses: r.houseCount,
      adjust: adj,
      over85: over,
      rate: r.rate,
      ratePct: r.rate * 100,
      kind: r.kind,
      kindLabel: kindLabel,
      acq: acq,
      acqBeforeReduction: acq,
      reduction: reduction,
      edu: edu,
      rural: rural,
      total: total,
      effectiveRate: effective,
      firstTimeApplied: reduction > 0,
      firstTimeLimit: limit,
      notes: notes
    };
  }

  /** 주택 수별 취득세 비교표 (현재 가액·지역 기준) */
  function acquisitionTable(opts) {
    var o = opts || {};
    return [1, 2, 3, 4].map(function (h) {
      var r = acquisition({
        price: o.price, houses: h, adjust: o.adjust, over85: o.over85,
        temporary2: h === 2 ? !!o.temporary2 : false
      });
      return {
        houses: h,
        rate: r.rate,
        kind: r.kind,
        acq: r.acq,
        edu: r.edu,
        rural: r.rural,
        total: r.total
      };
    });
  }

  /** 1주택 기준 취득가액별 총 부담 비교표 */
  function acquisitionPriceTable(opts) {
    var o = opts || {};
    var prices = [300000000, 500000000, 600000000, 700000000, 800000000, 900000000, 1200000000];
    return prices.map(function (p) {
      var r = acquisition({ price: p, houses: 1, adjust: false, over85: !!o.over85 });
      return {
        price: p,
        rate: r.rate,
        acq: r.acq,
        total: r.total,
        effectiveRate: r.effectiveRate
      };
    });
  }

  /* ══════════════════════════════════════════════════════════
   * 2. 양도소득세
   * ══════════════════════════════════════════════════════════ */

  /* 기본세율(소득세법 제55조, 2023년 이후) — 과세표준 상한, 세율, 누진공제 */
  var BRACKETS = [
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
    for (var i = 0; i < BRACKETS.length; i++) {
      if (base <= BRACKETS[i].upTo) return BRACKETS[i];
    }
    return BRACKETS[BRACKETS.length - 1];
  }

  /** 장기보유특별공제율(%) — 표1(일반) / 표2(1세대 1주택) */
  function deductionRate(holdMonths, liveMonths, oneHouse) {
    var holdYears = Math.floor(clamp(num(holdMonths, 0), 0, LIMITS.months.max) / 12);
    var liveYears = Math.floor(clamp(num(liveMonths, 0), 0, LIMITS.months.max) / 12);
    if (holdMonths < 24) {
      return { table: 'none', own: 0, live: 0, total: 0, holdYears: holdYears, liveYears: liveYears };
    }
    if (oneHouse && liveMonths >= 24) {
      // 표2: 보유 공제는 3년부터(3년 12%), 거주 공제는 2년부터(2년 8%)
      var own = holdYears >= 3 ? Math.min(40, 4 * holdYears) : 0;
      var live = Math.min(40, 4 * liveYears);
      return { table: '2', own: own, live: live, total: own + live, holdYears: holdYears, liveYears: liveYears };
    }
    if (holdMonths < 36) {
      return { table: 'none', own: 0, live: 0, total: 0, holdYears: holdYears, liveYears: liveYears };
    }
    return { table: '1', own: Math.min(30, 2 * holdYears), live: 0, total: Math.min(30, 2 * holdYears),
      holdYears: holdYears, liveYears: liveYears };
  }

  /**
   * 양도소득세 계산
   * @param {object} opts sale(양도가액), buy(취득가액), expenses(필요경비),
   *                      holdMonths, liveMonths, oneHouse, adjustAtBuy(취득 당시 조정대상지역)
   */
  function transfer(opts) {
    var o = opts || {};
    var sale = clamp(num(o.sale, 0), 0, LIMITS.price.max);
    var buy = clamp(num(o.buy, 0), 0, LIMITS.price.max);
    var exp = clamp(num(o.expenses, 0), 0, LIMITS.expenses.max);
    var hold = clamp(round(num(o.holdMonths, 0)), 0, LIMITS.months.max);
    var live = clamp(round(num(o.liveMonths, 0)), 0, LIMITS.months.max);
    var one = !!o.oneHouse;
    var adjBuy = !!o.adjustAtBuy;

    var gain = Math.max(0, sale - buy - exp);
    var holdOk = hold >= 24;
    var liveOk = !adjBuy || live >= 24;
    var exemptByValue = sale <= 1200000000;
    var exempt = one && holdOk && liveOk && exemptByValue && sale > 0;

    var ratio = 1;
    if (one && holdOk && liveOk && !exemptByValue && sale > 1200000000) {
      ratio = (sale - 1200000000) / sale;
    }
    var taxedGain = exempt ? 0 : gain * ratio;

    var ded = exempt ? { table: 'none', own: 0, live: 0, total: 0, holdYears: Math.floor(hold / 12),
      liveYears: Math.floor(live / 12) } : deductionRate(hold, live, one);
    var deduction = taxedGain * ded.total / 100;
    var gainAfter = Math.max(0, taxedGain - deduction);
    var baseDeduction = Math.min(2500000, gainAfter);
    var taxBase = Math.max(0, gainAfter - baseDeduction);

    var rate, prog, rateLabel;
    if (hold < 12) { rate = 0.70; prog = 0; rateLabel = '70%(1년 미만)'; }
    else if (hold < 24) { rate = 0.60; prog = 0; rateLabel = '60%(1~2년)'; }
    else {
      var b = bracketOf(taxBase);
      rate = b.rate; prog = b.prog;
      rateLabel = (b.rate * 100) + '%';
    }
    var tax = taxBase > 0 ? floorWon(Math.max(0, taxBase * rate - prog)) : 0;
    var local = floorWon(tax * 0.1);

    var notes = [];
    if (exempt) {
      notes.push('1세대 1주택 비과세 요건을 갖춰 양도소득세가 0원입니다. 양도가액 12억원 이하, 2년 이상 보유' +
        (adjBuy ? ', 2년 이상 거주' : '') + ' 요건을 모두 채웠습니다.');
    } else if (one && holdOk && liveOk && !exemptByValue) {
      notes.push('양도가액이 12억원을 넘어 ' + (ratio * 100).toFixed(2) + '%(초과분 비율)만 과세했습니다. ' +
        '장기보유특별공제도 같은 비율로 안분했습니다.');
    }
    if (one && !liveOk) {
      notes.push('취득 당시 조정대상지역 주택은 2년 이상 거주해야 비과세·표2 공제를 받을 수 있습니다.');
    }
    if (one && !holdOk && hold > 0) {
      notes.push('보유기간이 2년 미만이면 1세대 1주택 비과세가 적용되지 않습니다.');
    }
    if (hold < 36 && !exempt) {
      notes.push('장기보유특별공제는 3년 이상 보유해야 적용됩니다.');
    }
    if (adjBuy && live < 24 && hold >= 24 && !one) {
      notes.push('거주 요건은 1세대 1주택 비과세·표2 공제에만 적용됩니다.');
    }

    return {
      valid: sale > 0,
      sale: sale,
      buy: buy,
      expenses: exp,
      gain: gain,
      holdMonths: hold,
      liveMonths: live,
      holdYears: Math.floor(hold / 12),
      liveYears: Math.floor(live / 12),
      oneHouse: one,
      adjustAtBuy: adjBuy,
      exempt: exempt,
      ratio: ratio,
      taxedGain: taxedGain,
      deductionTable: ded.table,
      deductionOwnRate: ded.own,
      deductionLiveRate: ded.live,
      deductionRate: ded.total,
      deduction: deduction,
      gainAfter: gainAfter,
      baseDeduction: baseDeduction,
      taxBase: taxBase,
      rate: rate,
      rateLabel: rateLabel,
      tax: tax,
      local: local,
      total: tax + local,
      effectiveRate: sale > 0 ? (tax + local) / sale * 100 : 0,
      notes: notes
    };
  }

  /** 거주기간별 양도세 비교 (보유기간은 현재 값 고정) */
  function transferTable(opts) {
    var o = opts || {};
    var lives = [0, 24, 60, 120];
    var out = lives.map(function (m) {
      var r = transfer({
        sale: o.sale, buy: o.buy, expenses: o.expenses,
        holdMonths: o.holdMonths, liveMonths: m,
        oneHouse: o.oneHouse, adjustAtBuy: o.adjustAtBuy
      });
      return {
        liveMonths: m,
        liveYears: m / 12,
        deductionRate: r.deductionRate,
        taxBase: r.taxBase,
        total: r.total,
        exempt: r.exempt
      };
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════
   * 3. 증여세
   * ══════════════════════════════════════════════════════════ */

  var GIFT_RELATION = {
    spouse: { label: '배우자', deduction: 600000000, direct: false },
    parent: { label: '직계존속(성년 수증자)', deduction: 50000000, direct: true },
    'parent-minor': { label: '직계존속(미성년 수증자)', deduction: 20000000, direct: true, minor: true },
    child: { label: '직계비속(자녀→부모)', deduction: 50000000, direct: false },
    relative: { label: '그 밖의 친족(4촌 이내)', deduction: 10000000, direct: false },
    other: { label: '그 밖의 사람', deduction: 0, direct: false }
  };

  var GIFT_BRACKETS = [
    { upTo: 100000000, rate: 0.10, prog: 0 },
    { upTo: 500000000, rate: 0.20, prog: 10000000 },
    { upTo: 1000000000, rate: 0.30, prog: 60000000 },
    { upTo: 3000000000, rate: 0.40, prog: 160000000 },
    { upTo: Infinity, rate: 0.50, prog: 460000000 }
  ];

  function giftBracketOf(base) {
    for (var i = 0; i < GIFT_BRACKETS.length; i++) {
      if (base <= GIFT_BRACKETS[i].upTo) return GIFT_BRACKETS[i];
    }
    return GIFT_BRACKETS[GIFT_BRACKETS.length - 1];
  }

  /**
   * 증여세 계산
   * @param {object} opts amount(증여재산가액), relation, marriage(혼인·출산 공제),
   *                      priorUsed(10년 내 이미 공제받은 금액), skipGeneration(세대생략 할증),
   *                      reportCredit(신고세액공제 3%)
   */
  function gift(opts) {
    var o = opts || {};
    var amount = clamp(num(o.amount, 0), 0, LIMITS.gift.max);
    var rel = GIFT_RELATION[o.relation] ? o.relation : 'parent';
    var info = GIFT_RELATION[rel];
    var used = clamp(num(o.priorUsed, 0), 0, LIMITS.used.max);
    // 공제는 증여재산가액을 넘지 않도록 표시·계산합니다(넘는 부분은 어차피 과세표준 0).
    var baseDeduction = Math.min(Math.max(0, info.deduction - used), amount);
    var extra = 0;
    var marriageApplied = false;
    if (o.marriage && info.direct) {
      extra = Math.min(100000000, Math.max(0, amount - baseDeduction));
      marriageApplied = extra > 0;
    }

    var afterDeduction = Math.max(0, amount - baseDeduction - extra);
    var taxBase = afterDeduction < 500000 ? 0 : afterDeduction;  // 과세최저한
    var bracket = giftBracketOf(taxBase);
    var tax = taxBase > 0 ? floorWon(Math.max(0, taxBase * bracket.rate - bracket.prog)) : 0;

    var surchargeRate = 0;
    if (o.skipGeneration && info.direct) surchargeRate = info.minor ? 0.40 : 0.30;
    var surcharge = floorWon(tax * surchargeRate);

    var credit = o.reportCredit === false ? 0 : floorWon((tax + surcharge) * 0.03);
    var payable = Math.max(0, tax + surcharge - credit);

    var notes = [];
    if (marriageApplied) {
      notes.push('혼인·출산 증여재산공제 1억원을 기본공제와 별도로 적용했습니다(혼인·출산 합산 1억원 한도).');
    }
    if (o.marriage && !info.direct) {
      notes.push('혼인·출산 공제는 직계존속이 증여할 때만 받을 수 있습니다.');
    }
    if (used > 0) {
      notes.push('10년 내 이미 공제받은 ' + used.toLocaleString('ko-KR') + '원을 빼고 남은 한도만 적용했습니다.');
    }
    if (afterDeduction > 0 && taxBase === 0) {
      notes.push('과세표준이 50만원 미만이어서 증여세를 부과하지 않습니다(과세최저한).');
    }
    if (surchargeRate > 0) {
      notes.push('세대생략 할증 ' + Math.round(surchargeRate * 100) + '%가 산출세액에 가산됩니다.');
    }

    return {
      valid: amount > 0,
      amount: amount,
      relation: rel,
      relationLabel: info.label,
      minor: !!info.minor,
      baseLimit: info.deduction,
      priorUsed: used,
      baseDeduction: baseDeduction,
      extraDeduction: extra,
      marriageApplied: marriageApplied,
      afterDeduction: afterDeduction,
      taxBase: taxBase,
      rate: bracket.rate,
      marginalLabel: (bracket.rate * 100) + '%',
      tax: tax,
      surchargeRate: surchargeRate,
      surcharge: surcharge,
      credit: credit,
      payable: payable,
      effectiveRate: amount > 0 ? payable / amount * 100 : 0,
      notes: notes
    };
  }

  /** 증여액별 증여세 비교표 (현재 관계·공제 설정 기준) */
  function giftTable(opts) {
    var o = opts || {};
    var amounts = [50000000, 100000000, 200000000, 300000000, 500000000, 1000000000];
    return amounts.map(function (a) {
      var r = gift({
        amount: a, relation: o.relation, marriage: o.marriage,
        priorUsed: o.priorUsed, skipGeneration: o.skipGeneration, reportCredit: o.reportCredit
      });
      return {
        amount: a,
        taxBase: r.taxBase,
        tax: r.tax,
        surcharge: r.surcharge,
        credit: r.credit,
        payable: r.payable,
        effectiveRate: r.effectiveRate
      };
    });
  }

  root.PropertyTaxCalc = {
    DATA_DATE: DATA_DATE,
    LIMITS: LIMITS,
    BRACKETS: BRACKETS,
    GIFT_BRACKETS: GIFT_BRACKETS,
    GIFT_RELATION: GIFT_RELATION,
    baseRate: baseRate,
    acqRate: acqRate,
    acquisition: acquisition,
    acquisitionTable: acquisitionTable,
    acquisitionPriceTable: acquisitionPriceTable,
    deductionRate: deductionRate,
    transfer: transfer,
    transferTable: transferTable,
    gift: gift,
    giftTable: giftTable,
    floorWon: floorWon,
    round: round
  };
})(typeof window !== 'undefined' ? window : this);
