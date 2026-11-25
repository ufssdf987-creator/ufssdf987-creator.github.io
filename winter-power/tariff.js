/*!
 * tariff.js — 한국전력 주택용 전력 요금 계산 엔진
 * ------------------------------------------------------------------
 * 근거 자료 (2026-11-25 확인)
 *  · 한전 사이버지점 "한글 전기요금표(주택용-저압/고압)" — 2023.11.9 시행 단가
 *    저압  기본 910 / 1,600 / 7,300원, 전력량 120.0 / 214.6 / 307.3원/kWh, 슈퍼유저 736.2
 *    고압  기본 730 / 1,260 / 6,060원, 전력량 105.0 / 174.0 / 242.3원/kWh, 슈퍼유저 593.3
 *  · 기후환경요금 9.0원/kWh (2023.1~)
 *  · 연료비조정단가 +5.0원/kWh (2026년 4분기, 2026.9.21 공지 / 분기마다 변경)
 *  · 부가가치세 10%, 전력산업기반기금 2.7% (전기사업법 시행령 §36, 2025.7~)
 *  · 복지할인: 대가족·3자녀·출산가구 30%(월 16,000원 한도), 생명유지장치 30%(한도 없음)
 *  · 끝수 처리: 기본·전력량요금 원 미만 절사, 부가세 4사5입, 기금·청구액 10원 미만 절사
 *
 * 브라우저에서는 window.WinterPower, Node에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WinterPower = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DATA_DATE = '2026-11-25';
  var TARIFF_EFFECTIVE = '2023-11-09';   // 기본요금·전력량요금 시행일
  var FUEL_QUARTER = '2026년 4분기';      // 연료비조정단가 기준 분기

  var RATES = {
    low: {
      key: 'low',
      label: '주택용 저압',
      sub: '단독·빌라·오피스텔',
      tiers: [
        { base: 910, rate: 120.0 },
        { base: 1600, rate: 214.6 },
        { base: 7300, rate: 307.3 }
      ],
      superUser: 736.2
    },
    high: {
      key: 'high',
      label: '주택용 고압',
      sub: '아파트 단지',
      tiers: [
        { base: 730, rate: 105.0 },
        { base: 1260, rate: 174.0 },
        { base: 6060, rate: 242.3 }
      ],
      superUser: 593.3
    }
  };

  var CONST = {
    climate: 9.0,        // 원/kWh
    fuel: 5.0,           // 원/kWh (분기 조정)
    vat: 0.10,
    fund: 0.027,
    superThreshold: 1000,
    familyCap: 16000     // 대가족·다자녀·출산가구 월 할인 한도
  };

  var DEVICES = [
    { id: 'partition', name: '파티션 히터', watt: 195, emoji: '🟧', note: '195W · 발밑 소형 히터', defaultHours: 5 },
    { id: 'carbon', name: '카본 히터', watt: 400, emoji: '🟠', note: '400W · 카본 열선', defaultHours: 4 },
    { id: 'fan', name: '온풍기', watt: 1000, emoji: '🌀', note: '1,000W · PTC 온풍', defaultHours: 3 },
    { id: 'fanheater', name: '팬히터', watt: 2000, emoji: '🔥', note: '2,000W · 거실용', defaultHours: 2 },
    { id: 'mat', name: '온수매트', watt: 250, emoji: '♨️', note: '250W · 침대용', defaultHours: 8 },
    { id: 'blanket', name: '전기요', watt: 100, emoji: '🛏️', note: '100W · 소비전력 최저', defaultHours: 8 }
  ];

  /* ── 유틸 ─────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function floorWon(v) { return Math.floor(v + 1e-9); }
  function roundHalfUp(v) { return Math.floor(v + 0.5 + 1e-9); }
  function floor10(v) { return Math.floor((v + 1e-9) / 10) * 10; }

  /* ── 계절·구간 ────────────────────────────────────── */
  function normalizeMonth(m) {
    var n = Math.round(num(m, 1));
    if (n < 1) n = 1;
    if (n > 12) n = 12;
    return n;
  }
  function seasonOf(month) {
    var m = normalizeMonth(month);
    return (m === 7 || m === 8) ? 'summer' : 'general';
  }
  function isSummer(month) { return seasonOf(month) === 'summer'; }
  /** 슈퍼유저(1,000kWh 초과) 적용 계절: 하계 7~8월, 동계 12~2월 */
  function isSuperSeason(month) {
    var m = normalizeMonth(month);
    return m === 7 || m === 8 || m === 12 || m === 1 || m === 2;
  }
  /** 누진 구간 경계 [1단계 상한, 2단계 상한] */
  function tierBounds(month) {
    return isSummer(month) ? [300, 450] : [200, 400];
  }
  function tierOf(usage, month) {
    var b = tierBounds(month);
    if (usage <= b[0]) return 1;
    if (usage <= b[1]) return 2;
    return 3;
  }

  /* ── 복지할인 ─────────────────────────────────────── */
  var DISCOUNT_LABELS = {
    large: '대가족(5인 이상)',
    multi: '다자녀(3자녀 이상)',
    birth: '출산가구(3년 미만)',
    life: '생명유지장치'
  };

  /**
   * 할인액 계산. 한전 기준 가족 할인(대가족·다자녀·출산)은 30%·월 16,000원 한도,
   * 생명유지장치는 30%에 한도 없음. 여러 자격이 겹쳐도 한 가지만 적용되므로
   * 가장 큰 할인 하나를 고른다.
   */
  function calcDiscount(chargeBase, discounts) {
    var d = discounts || {};
    var best = { amount: 0, key: null, label: null, ratePct: 0, capped: false };
    function consider(key, ratePct, cap) {
      if (!d[key]) return;
      var raw = chargeBase * (ratePct / 100);
      var amount = cap ? Math.min(raw, cap) : raw;
      if (amount > best.amount + 1e-9) {
        best = {
          amount: floorWon(amount),
          key: key,
          label: DISCOUNT_LABELS[key],
          ratePct: ratePct,
          capped: !!(cap && raw > cap)
        };
      }
    }
    consider('life', 30, 0);
    consider('large', 30, CONST.familyCap);
    consider('multi', 30, CONST.familyCap);
    consider('birth', 30, CONST.familyCap);
    return best;
  }

  /* ── 핵심: 청구액 계산 ────────────────────────────── */
  /**
   * @param {Object} opts
   *   usage  사용량(kWh)
   *   type   'low' | 'high'
   *   month  1~12 (계절·슈퍼유저 판정)
   *   discounts {large,multi,birth,life}
   */
  function calcBill(opts) {
    opts = opts || {};
    var usage = Math.max(0, num(opts.usage, 0));
    var type = opts.type === 'high' ? 'high' : 'low';
    var month = normalizeMonth(opts.month);
    var tariff = RATES[type];
    var bounds = tierBounds(month);
    var tier = tierOf(usage, month);
    var superSeason = isSuperSeason(month);

    // 1,000kWh 초과분은 슈퍼유저 단가 (3단계 단가 대신 적용)
    var superKwh = 0;
    if (superSeason && usage > CONST.superThreshold) {
      superKwh = usage - CONST.superThreshold;
    }
    var normalUsage = usage - superKwh;

    // 전력량요금: 구간별 분할 계산
    var segs = [
      { from: 0, to: bounds[0], tier: 1 },
      { from: bounds[0], to: bounds[1], tier: 2 },
      { from: bounds[1], to: Infinity, tier: 3 }
    ];
    var energyLines = [];
    var energyRaw = 0;
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var kwh = Math.max(0, Math.min(normalUsage, seg.to) - seg.from);
      if (kwh <= 0) continue;
      var rate = tariff.tiers[seg.tier - 1].rate;
      var amount = floorWon(kwh * rate);
      energyRaw += kwh * rate;
      energyLines.push({
        tier: seg.tier,
        label: seg.tier + '단계',
        kwh: kwh,
        rate: rate,
        amount: amount
      });
    }
    var superFee = 0;
    if (superKwh > 0) {
      superFee = floorWon(superKwh * tariff.superUser);
      energyLines.push({
        tier: 4,
        label: '슈퍼유저(1,000kWh 초과)',
        kwh: superKwh,
        rate: tariff.superUser,
        amount: superFee
      });
    }
    var energyFee = floorWon(energyRaw + superKwh * tariff.superUser);

    var baseFee = tariff.tiers[tier - 1].base;
    var climateFee = floorWon(usage * CONST.climate);
    var fuelFee = floorWon(usage * CONST.fuel);
    var chargeBase = baseFee + energyFee + climateFee + fuelFee;

    var discount = calcDiscount(chargeBase, opts.discounts);
    var chargeAfterDiscount = Math.max(0, chargeBase - discount.amount);

    var vat = roundHalfUp(chargeAfterDiscount * CONST.vat);
    var fund = floor10(chargeAfterDiscount * CONST.fund);
    var total = floor10(chargeAfterDiscount + vat + fund);

    return {
      usage: usage,
      type: type,
      typeLabel: tariff.label,
      month: month,
      season: seasonOf(month),
      isSummer: isSummer(month),
      superSeason: superSeason,
      isSuperUser: superKwh > 0,
      superKwh: superKwh,
      bounds: bounds,
      tier: tier,
      tierLabel: superKwh > 0 ? '슈퍼유저' : tier + '단계',
      baseFee: baseFee,
      energyFee: energyFee,
      energyLines: energyLines,
      superFee: superFee,
      climateFee: climateFee,
      fuelFee: fuelFee,
      chargeBase: chargeBase,
      discount: discount,
      discountAmount: discount.amount,
      chargeAfterDiscount: chargeAfterDiscount,
      vat: vat,
      fund: fund,
      total: total,
      avgRate: usage > 0 ? total / usage : 0,
      rates: {
        climate: CONST.climate,
        fuel: CONST.fuel,
        vat: CONST.vat,
        fund: CONST.fund
      }
    };
  }

  /* ── 구간 인사이트 ────────────────────────────────── */
  /**
   * 다음 구간까지 남은 사용량, 그 구간을 넘을 때의 요금 점프, 한 단계 내리는 절약액
   */
  function tierInfo(opts) {
    var bill = calcBill(opts);
    var usage = bill.usage;
    var bounds = bill.bounds;
    var info = {
      tier: bill.tier,
      label: bill.tierLabel,
      nextThreshold: null,
      remaining: null,
      jumpCost: null,
      lowerTo: null,
      lowerNeed: null,
      saveByLowering: null,
      marginalCost: null,
      superAt: CONST.superThreshold,
      superRemaining: null
    };

    // 1kWh 더 쓸 때 실제로 늘어나는 금액(기본요금 점프 포함)
    info.marginalCost = calcBill(withUsage(opts, usage + 1)).total - bill.total;

    var next = usage <= bounds[0] ? bounds[0] : (usage <= bounds[1] ? bounds[1] : CONST.superThreshold);
    if (usage <= bounds[1]) {
      info.nextThreshold = next;
      info.remaining = Math.max(0, next - usage);
      if (info.remaining === 0) {
        // 경계에 딱 걸친 경우: 1kWh만 넘어도 기본요금이 오른다
        info.jumpCost = calcBill(withUsage(opts, next + 1)).total - bill.total;
      } else {
        info.jumpCost = calcBill(withUsage(opts, next + 1)).total - calcBill(withUsage(opts, next)).total;
      }
    } else if (bill.superSeason) {
      info.nextThreshold = CONST.superThreshold;
      info.superRemaining = Math.max(0, CONST.superThreshold - usage);
    }

    if (usage > bounds[0]) {
      var lowerTo = usage <= bounds[1] ? bounds[0] : bounds[1];
      info.lowerTo = lowerTo;
      info.lowerNeed = usage - lowerTo;
      info.saveByLowering = bill.total - calcBill(withUsage(opts, lowerTo)).total;
    }
    return info;
  }

  function withUsage(opts, usage) {
    var copy = {};
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) copy[k] = opts[k];
    copy.usage = usage;
    return copy;
  }

  /* ── 고지서 금액 → 사용량 역산 ────────────────────── */
  function usageForBill(billAmount, opts) {
    var target = Math.max(0, num(billAmount, 0));
    var base = withUsage(opts || {}, 0);
    var lo = 0, hi = 5000;
    // 청구액은 사용량에 대해 단조 증가하므로 이분 탐색
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (calcBill(withUsage(base, mid)).total < target) lo = mid + 1;
      else hi = mid;
    }
    var candidates = [lo - 1, lo, lo + 1]
      .filter(function (v) { return v >= 0 && v <= 5000; })
      .map(function (v) {
        var t = calcBill(withUsage(base, v)).total;
        return { usage: v, total: t, diff: Math.abs(t - target) };
      })
      .sort(function (a, b) { return a.diff - b.diff; });
    var best = candidates[0] || { usage: 0, total: 0, diff: target };
    return {
      usage: best.usage,
      bill: best.total,
      diff: best.diff,
      exact: best.diff === 0,
      outOfRange: target > calcBill(withUsage(base, 5000)).total || target < calcBill(withUsage(base, 0)).total
    };
  }

  /* ── 난방가전 시뮬레이션 ──────────────────────────── */
  function deviceKwh(watt, hoursPerDay, days) {
    return (Math.max(0, num(watt)) / 1000) * Math.max(0, num(hoursPerDay)) * Math.max(0, num(days));
  }

  /**
   * @param {Object} opts
   *   baseUsage 기존 월 사용량
   *   month, type, discounts
   *   days 사용 일수
   *   items [{id,name,watt,hours}]
   */
  function simulate(opts) {
    opts = opts || {};
    var days = Math.max(0, num(opts.days, 30));
    var items = (opts.items || []).filter(function (it) { return it && num(it.watt) > 0 && num(it.hours) > 0; });
    var detail = items.map(function (it) {
      var kwh = deviceKwh(it.watt, it.hours, days);
      return {
        id: it.id || it.name,
        name: it.name || '직접 입력',
        watt: num(it.watt),
        hours: num(it.hours),
        kwh: kwh
      };
    });
    var addedKwh = detail.reduce(function (s, d) { return s + d.kwh; }, 0);
    var baseUsage = Math.max(0, num(opts.baseUsage, opts.usage || 0));
    var before = calcBill(withUsage(opts, baseUsage));
    var after = calcBill(withUsage(opts, baseUsage + addedKwh));

    var tierJump = after.tier > before.tier;
    var superEnter = !before.isSuperUser && after.isSuperUser;

    return {
      days: days,
      addedKwh: addedKwh,
      totalKwh: after.usage,
      items: detail,
      before: before,
      after: after,
      addedCost: after.total - before.total,
      dailyCost: days > 0 ? (after.total - before.total) / days : 0,
      tierJump: tierJump,
      superEnter: superEnter,
      stepChanged: before.tierLabel !== after.tierLabel,
      addedAvgRate: addedKwh > 0 ? (after.total - before.total) / addedKwh : 0
    };
  }

  /* ── 표시용 라벨 ──────────────────────────────────── */
  function seasonLabel(month) {
    var m = normalizeMonth(month);
    if (m === 7 || m === 8) return '하계(7~8월)';
    if (m === 12 || m === 1 || m === 2) return '동계(12~2월)';
    return '기타계절';
  }
  function monthLabel(month) { return normalizeMonth(month) + '월'; }

  return {
    DATA_DATE: DATA_DATE,
    TARIFF_EFFECTIVE: TARIFF_EFFECTIVE,
    FUEL_QUARTER: FUEL_QUARTER,
    RATES: RATES,
    CONST: CONST,
    DEVICES: DEVICES,
    DISCOUNT_LABELS: DISCOUNT_LABELS,
    // utils
    clamp: clamp,
    // season & tier
    normalizeMonth: normalizeMonth,
    seasonOf: seasonOf,
    isSummer: isSummer,
    isSuperSeason: isSuperSeason,
    tierBounds: tierBounds,
    tierOf: tierOf,
    seasonLabel: seasonLabel,
    monthLabel: monthLabel,
    // money
    calcDiscount: calcDiscount,
    calcBill: calcBill,
    tierInfo: tierInfo,
    usageForBill: usageForBill,
    deviceKwh: deviceKwh,
    simulate: simulate
  };
});
