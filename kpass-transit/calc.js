/*!
 * calc.js — K-패스(모두의카드)·대중교통 환급 & 출퇴근 교통비 계산 엔진
 * ------------------------------------------------------------------
 * 근거(2026-11-26 확인)
 *  · 국토교통부 대도시권광역교통위원회 '모두의카드'(K-패스) — 기본형 정률 + 일반형·플러스형 정액,
 *    셋 중 가장 큰 금액 자동 적용. 월 15회 이상 이용 시 지급(가입 첫 달 예외).
 *  · 기본형 환급률: 일반 20%, 청년(만 19~34) 30%, 어르신(만 65 이상) 30%, 2자녀 30%,
 *    3자녀 이상 50%, 저소득(수급자·차상위) 53.3%.
 *  · 정액형 기준금액(수도권): 일반 62,000/100,000원, 청년·2자녀·어르신 55,000/90,000원,
 *    3자녀 이상·저소득 45,000/80,000원. 일반형은 1회 3,000원 미만 이용분, 플러스형은 전체 이용분.
 *  · 2025년까지 월 60회·월 20만원 적립 상한 → 2026-01-01 폐지(legacy 옵션으로만 재현).
 *  · 출퇴근 시차시간(+30%p)은 2026-04-01~2026-12-31 한시 운영.
 *  · 서울 기후동행카드 30일권은 2026-10-01 운영 종료 → 기후동행패스(모두의카드 + 서울 특화)로 통합.
 * 이 파일은 계산만 합니다. 화면 조작은 app.js, 수익화 설정은 config.js.
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-26';

  /* ── 제도 상수 ─────────────────────────────────────────── */
  var MIN_TRIPS = 15;          // 월 최소 이용 횟수(가입 첫 달 예외)
  var LEGACY_MAX_TRIPS = 60;   // 2025년까지 월 적립 상한(2026-01-01 폐지)
  var LEGACY_MONTH_CAP = 200000; // 2025년까지 월 이용금액 상한(폐지)
  var PEAK_BONUS = 0.3;        // 시차시간 추가 환급률(%p), 2026-12-31까지
  var NORMAL_FARE_LIMIT = 3000; // 일반형 정액 대상: 1회 3,000원 미만
  var SEOUL_END_30DAY = '2026-10-01'; // 기후동행카드 30일권 운영 종료일

  var TYPES = [
    { key: 'general', label: '일반', rate: 0.2, group: 'general', age: '만 35세 이상', short: '20%' },
    { key: 'youth', label: '청년', rate: 0.3, group: 'mid', age: '만 19~34세', short: '30%' },
    { key: 'senior', label: '어르신', rate: 0.3, group: 'mid', age: '만 65세 이상', short: '30%' },
    { key: 'kids2', label: '2자녀', rate: 0.3, group: 'mid', age: '미성년 자녀 2명', short: '30%' },
    { key: 'kids3', label: '3자녀 이상', rate: 0.5, group: 'low', age: '미성년 자녀 3명 이상', short: '50%' },
    { key: 'low', label: '저소득', rate: 0.533, group: 'low', age: '수급자·차상위', short: '53.3%' }
  ];

  var REGIONS = [
    { key: 'metro', label: '수도권', short: '수도권' },
    { key: 'local', label: '일반 지방권', short: '지방권' },
    { key: 'prefer', label: '우대지원지역', short: '우대' },
    { key: 'special', label: '특별지원지역', short: '특별' }
  ];

  /* 정액형 기준금액 [일반형, 플러스형] — 유형군 × 지역 */
  var FIXED = {
    general: { metro: [62000, 100000], local: [55000, 95000], prefer: [50000, 90000], special: [45000, 85000] },
    mid: { metro: [55000, 90000], local: [50000, 85000], prefer: [45000, 80000], special: [40000, 75000] },
    low: { metro: [45000, 80000], local: [40000, 75000], prefer: [35000, 70000], special: [30000, 65000] }
  };

  var PEAK_WINDOWS = ['오전 5:30~6:30', '오전 9:00~10:00', '오후 16:00~17:00', '오후 19:00~20:00'];

  var LIMITS = {
    trips: { min: 0, max: 200 },
    fare: { min: 0, max: 30000 },
    spend: { min: 0, max: 3000000 },
    km: { min: 0, max: 200 },
    days: { min: 1, max: 31 },
    mileage: { min: 1, max: 40 },
    fuel: { min: 0, max: 5000 },
    money: { min: 0, max: 2000000 },
    peak: { min: 0, max: 100 }
  };

  function clamp(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  }

  function typeInfo(key) {
    for (var i = 0; i < TYPES.length; i++) {
      if (TYPES[i].key === key) return TYPES[i];
    }
    return TYPES[0];
  }

  function regionInfo(key) {
    for (var i = 0; i < REGIONS.length; i++) {
      if (REGIONS[i].key === key) return REGIONS[i];
    }
    return REGIONS[0];
  }

  /** 유형·지역의 정액형 기준금액 { normal, plus } */
  function fixedFor(typeKey, regionKey) {
    var t = typeInfo(typeKey);
    var region = FIXED[t.group][regionKey] ? regionKey : 'metro';
    var pair = FIXED[t.group][region];
    return { normal: pair[0], plus: pair[1], region: region, group: t.group };
  }

  /** 시차시간 반영 정률(0~1). peakShare 는 0~1 */
  function blendedRate(typeKey, peakShare) {
    var r = typeInfo(typeKey).rate;
    var p = clamp(peakShare || 0, 0, 1);
    var boosted = Math.min(1, r + PEAK_BONUS);
    return { base: r, boosted: boosted, blend: r * (1 - p) + boosted * p };
  }

  /**
   * 월 환급액 계산
   * opts: { spend, trips, fare, type, region, peakShare, legacy }
   */
  function refund(opts) {
    var o = opts || {};
    var type = typeInfo(o.type);
    var region = regionInfo(o.region);
    var trips = Math.round(clamp(o.trips, LIMITS.trips.min, LIMITS.trips.max));
    var spend = Math.round(clamp(o.spend, LIMITS.spend.min, LIMITS.spend.max));
    var fare = (o.fare === null || o.fare === undefined || o.fare === '')
      ? (trips > 0 ? spend / trips : 0)
      : clamp(o.fare, LIMITS.fare.min, LIMITS.fare.max);
    var peakShare = clamp(o.peakShare || 0, LIMITS.peak.min, LIMITS.peak.max) / 100;
    var legacy = !!o.legacy;
    var fixed = fixedFor(type.key, region.key);

    /* 2025년 제도 재현: 60회·20만원 상한 */
    var countedTrips = legacy ? Math.min(trips, LEGACY_MAX_TRIPS) : trips;
    var counted = trips > 0 ? spend * (countedTrips / trips) : 0;
    if (legacy) counted = Math.min(counted, LEGACY_MONTH_CAP);
    counted = Math.round(counted);

    var rate = blendedRate(type.key, peakShare);
    var base = Math.round(counted * rate.blend);
    /* 일반형: 1회 3,000원 미만 이용분만 대상.
       wide(광역 위주)면 일반형 제외, assumeNormalFare(월 총액 입력)면 전액을 일반형 대상으로 봅니다. */
    var normalTarget;
    if (o.wide) normalTarget = 0;
    else if (fare < NORMAL_FARE_LIMIT || o.assumeNormalFare) normalTarget = counted;
    else normalTarget = 0;
    var normal = Math.max(0, normalTarget - fixed.normal);
    var plus = Math.max(0, counted - fixed.plus);

    var best = base;
    var method = 'rate';
    if (normal > best) { best = normal; method = 'normal'; }
    if (plus > best) { best = plus; method = 'plus'; }

    var eligible = trips >= MIN_TRIPS && spend > 0;
    var refundWon = eligible ? Math.round(best) : 0;
    var burden = spend - refundWon;

    var labels = { rate: '정률형', normal: '일반형(정액)', plus: '플러스형(정액)', none: '지급 없음' };
    return {
      type: type.key,
      typeLabel: type.label,
      typeRate: type.rate,
      region: region.key,
      regionLabel: region.label,
      trips: trips,
      fare: Math.round(fare),
      spend: spend,
      counted: counted,
      legacy: legacy,
      countedTrips: countedTrips,
      peakShare: Math.round(peakShare * 1000) / 10,
      rate: rate.blend,
      baseRate: rate.base,
      boostedRate: rate.boosted,
      base: base,
      normal: normal,
      normalTarget: normalTarget,
      wide: !!o.wide,
      assumeNormalFare: !!o.assumeNormalFare,
      plus: plus,
      fixedNormal: fixed.normal,
      fixedPlus: fixed.plus,
      best: eligible ? Math.round(best) : 0,
      rawBest: Math.round(best),
      method: eligible ? method : 'none',
      methodLabel: eligible ? labels[method] : labels.none,
      refund: refundWon,
      burden: burden,
      yearRefund: refundWon * 12,
      yearBurden: burden * 12,
      effective: spend > 0 ? refundWon / spend : 0,
      eligible: eligible,
      shortfall: eligible ? 0 : MIN_TRIPS - trips
    };
  }

  /**
   * 손익분기 — 정률형과 정액형이 갈리는 월 지출액
   * 정률 r, 기준금액 T → 지출×(1-r) > T 이면 정액형이 유리
   */
  function breakEven(typeKey, regionKey, peakShare) {
    var fixed = fixedFor(typeKey, regionKey);
    var rate = blendedRate(typeKey, peakShare).blend;
    var denom = 1 - rate;
    var normalAt = denom > 0 ? Math.ceil(fixed.normal / denom) : null;
    var plusAt = denom > 0 ? Math.ceil(fixed.plus / denom) : null;
    return {
      rate: rate,
      normalAt: normalAt,
      plusAt: plusAt,
      plusGap: fixed.plus - fixed.normal,
      fixedNormal: fixed.normal,
      fixedPlus: fixed.plus
    };
  }

  /** 정액형 두 가지를 1회 요금으로 판정 */
  function fixedRule(fare) {
    return {
      normalEligible: fare < NORMAL_FARE_LIMIT,
      limit: NORMAL_FARE_LIMIT
    };
  }

  /**
   * 카드 3종 비교 — 모두의카드 / 기후동행패스(서울) / 일반 교통카드
   * opts: { spend, trips, fare, type, region, peakShare, seoul }
   */
  function compare(opts) {
    var o = opts || {};
    /* 1회 요금을 주지 않으면 월 총액 입력으로 보고, 광역 위주가 아니면 전액을 일반형 대상으로 봅니다 */
    var rOpts = {
      spend: o.spend,
      trips: o.trips,
      fare: o.fare,
      type: o.type,
      region: o.region,
      peakShare: o.peakShare,
      wide: o.wide,
      assumeNormalFare: (o.fare === undefined || o.fare === null) ? !o.wide : !!o.assumeNormalFare
    };
    var base = refund(rOpts);
    var seoul = o.seoul !== false;
    var rows = [
      {
        key: 'kpass',
        name: '모두의카드(K-패스)',
        refund: base.refund,
        burden: base.burden,
        yearRefund: base.yearRefund,
        method: base.methodLabel,
        note: '전국 · 참여 지자체 주민',
        available: true
      },
      {
        key: 'climate',
        name: '기후동행패스(서울)',
        refund: seoul ? base.refund : 0,
        burden: seoul ? base.burden : base.spend,
        yearRefund: seoul ? base.yearRefund : 0,
        method: seoul ? base.methodLabel : '해당 없음',
        note: seoul ? '서울시민 · 청년 만 39세까지 · 따릉이 할인' : '서울시민만 가입',
        available: seoul
      },
      {
        key: 'plain',
        name: '일반 교통카드',
        refund: 0,
        burden: base.spend,
        yearRefund: 0,
        method: '환급 없음',
        note: '카드사 자체 할인은 별도',
        available: true
      }
    ];

    var bestKey = 'kpass';
    var bestBurden = base.spend;
    rows.forEach(function (r) {
      if (!r.available) return;
      if (r.burden < bestBurden - 0.5) { bestBurden = r.burden; bestKey = r.key; }
    });
    if (bestBurden >= base.spend - 0.5 && base.refund <= 0) bestKey = 'plain';
    /* 모두의카드와 기후동행패스는 금액이 같으니 서울이면 기후동행패스가 낫다(추가 혜택) */
    if (seoul && base.refund > 0) bestKey = 'climate';

    var be = breakEven(o.type, o.region, o.peakShare);
    return {
      base: base,
      rows: rows,
      bestKey: bestKey,
      savingVsPlain: base.refund,
      yearSaving: base.yearRefund,
      breaks: be,
      seoul: seoul
    };
  }

  /**
   * 자차 출퇴근 vs 대중교통
   * opts: { km, days, mileage, fuelPrice, parking, toll, fixedCost, fare, trips, type, region, peakShare }
   */
  function commute(opts) {
    var o = opts || {};
    var km = clamp(o.km, LIMITS.km.min, LIMITS.km.max);
    var days = Math.round(clamp(o.days, LIMITS.days.min, LIMITS.days.max));
    var mileage = clamp(o.mileage, LIMITS.mileage.min, LIMITS.mileage.max);
    var fuelPrice = clamp(o.fuelPrice, LIMITS.fuel.min, LIMITS.fuel.max);
    var parking = Math.round(clamp(o.parking, LIMITS.money.min, LIMITS.money.max));
    var toll = Math.round(clamp(o.toll, LIMITS.money.min, LIMITS.money.max));
    var fixedCost = Math.round(clamp(o.fixedCost, LIMITS.money.min, LIMITS.money.max));
    var fare = clamp(o.fare, LIMITS.fare.min, LIMITS.fare.max);

    var monthlyKm = km * 2 * days;
    var liters = mileage > 0 ? monthlyKm / mileage : 0;
    var fuel = Math.round(liters * fuelPrice);
    var carTotal = fuel + parking + toll + fixedCost;

    var trips = days * 2;
    var spend = Math.round(fare * trips);
    var transit = refund({
      spend: spend,
      trips: trips,
      fare: fare,
      type: o.type,
      region: o.region,
      peakShare: o.peakShare
    });

    var diff = carTotal - transit.burden;
    var perKm = mileage > 0 ? fuelPrice / mileage : 0;
    var fixedOnly = parking + toll + fixedCost;
    var breakEvenKm = null;
    if (perKm > 0 && days > 0 && transit.burden > fixedOnly) {
      breakEvenKm = (transit.burden - fixedOnly) / (2 * days * perKm);
    }

    return {
      km: km,
      days: days,
      mileage: mileage,
      fuelPrice: fuelPrice,
      parking: parking,
      toll: toll,
      fixedCost: fixedCost,
      fare: fare,
      trips: trips,
      monthlyKm: Math.round(monthlyKm),
      liters: Math.round(liters * 10) / 10,
      fuel: fuel,
      carTotal: carTotal,
      carYear: carTotal * 12,
      transitSpend: spend,
      transitRefund: transit.refund,
      transitBurden: transit.burden,
      transitMethod: transit.methodLabel,
      transitYear: transit.burden * 12,
      transit: transit,
      diff: diff,
      diffYear: diff * 12,
      cheaper: diff > 0 ? 'transit' : (diff < 0 ? 'car' : 'same'),
      perKm: Math.round(perKm * 10) / 10,
      fixedOnly: fixedOnly,
      breakEvenKm: breakEvenKm,
      carShare: carTotal + transit.burden > 0 ? carTotal / (carTotal + transit.burden) : 0
    };
  }

  var api = {
    DATA_DATE: DATA_DATE,
    MIN_TRIPS: MIN_TRIPS,
    LEGACY_MAX_TRIPS: LEGACY_MAX_TRIPS,
    LEGACY_MONTH_CAP: LEGACY_MONTH_CAP,
    PEAK_BONUS: PEAK_BONUS,
    NORMAL_FARE_LIMIT: NORMAL_FARE_LIMIT,
    SEOUL_END_30DAY: SEOUL_END_30DAY,
    PEAK_WINDOWS: PEAK_WINDOWS,
    TYPES: TYPES,
    REGIONS: REGIONS,
    FIXED: FIXED,
    LIMITS: LIMITS,
    typeInfo: typeInfo,
    regionInfo: regionInfo,
    fixedFor: fixedFor,
    blendedRate: blendedRate,
    refund: refund,
    breakEven: breakEven,
    fixedRule: fixedRule,
    compare: compare,
    commute: commute
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KPassCalc = api;
})(typeof window !== 'undefined' ? window : this);
