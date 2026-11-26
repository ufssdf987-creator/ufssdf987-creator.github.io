/*!
 * calc.js — 2026 전기요금(한전 주택용 누진)·도시가스 난방비·복지할인 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.UBCalc 로 노출합니다.
 *
 * 근거 (2026년 11월 27일 확인)
 *  [전기 — 한국전력공사 주택용 전력 요금표, 2023.11.9 시행분이 2026년 11월 현재 최신]
 *  - 저압: 기본요금 200kWh 이하 910원·201~400kWh 1,600원·400kWh 초과 7,300원,
 *    전력량요금 120.0·214.6·307.3원/kWh, 1,000kWh 초과분(하계 7~8월·동계 12~2월) 736.2원/kWh
 *  - 고압: 기본요금 730·1,260·6,060원, 전력량요금 105.0·174.0·242.3원/kWh,
 *    1,000kWh 초과분 593.3원/kWh
 *  - 누진 구간: 기타계절(1~6월·9~12월) 200·400kWh, 하계(7~8월) 300·450kWh.
 *    단가는 계절과 무관하게 같고 구간 경계만 넓어집니다.
 *  - 기후환경요금 9.0원/kWh(2023.1.1~), 연료비조정단가 +5.0원/kWh
 *    (2026년 4분기 = 10~12월분, 한전 2026.9.21 공지, 18분기 연속 상한)
 *  - 부가가치세 10%(원 미만 반올림), 전력산업기반기금 2.7%(2025.7.1 사용분부터, 10원 미만 절사)
 *  - 청구금액 10원 미만 절사. 월간 최저요금 1,000원(기본공급약관 별표1)
 *  - 계산 순서: 기본+전력량+기후환경+연료비조정 = 전기요금계 → 복지할인 차감 →
 *    부가세 10% → 기금 2.7% → 10원 미만 절사
 *
 *  [도시가스 — 서울도시가스·삼천리 요금표, 2026년 11월 1일 사용분]
 *  - 서울: 주택용 22.5268원/MJ(도매 20.8495 + 소매 1.6773), 기본요금 월 1,250원
 *  - 경기: 주택용 22.6226원/MJ, 기본요금 월 1,250원 (삼천리·서울도시가스 경기 등 도 전체 동일)
 *  - 인천: 주택용 22.5084원/MJ, 기본요금 월 1,000원 (삼천리 인천)
 *  - 사용열량(MJ) = 검침량(㎥) × 온압보정계수 × 월간가중평균열량(MJ/㎥)
 *    (서울 보정계수 0.9940, 공급 열량 범위 41.0~44.4MJ/㎥, 어림값 43.1MJ/㎥은 산업통상자원부 안내)
 *  - 취사·난방 겸용은 월 516MJ까지 취사단가, 초과분은 난방단가(서울·경기·인천은 두 단가가 같음)
 *  - 청구액 = (기본요금 + 사용요금 − 요금경감) × 1.1(부가세), 10원 미만 절사
 *
 *  [복지할인 — 한국전력공사 복지할인, 2026년 기준]
 *  - 정액: 유공자(1~3급)·심한 장애인·생계·의료급여 16,000원(여름철 6~8월 20,000원),
 *    주거·교육급여 10,000원(여름 12,000원), 차상위 8,000원(여름 10,000원)
 *  - 정률: 다자녀(3자녀)·대가족(5인)·출산가구 = 전기요금의 30%, 월 16,000원 한도
 *    생명유지장치 = 30% 한도 없음. 정률은 전기요금계(부가세·기금 전) 기준.
 *  - 기초생활수급자·차상위계층은 가족 할인(다자녀·대가족·출산·생명유지장치)과 중복 적용 가능.
 *    그 밖의 자격은 할인이 가장 큰 하나만 적용됩니다.
 *
 *  [도시가스 요금경감 — 도시가스사업법 시행규칙 별표9의2, 2026년 11월 기준]
 *  - 동절기(12~3월): 수급자·차상위(바우처 미수급) 148,000원, 바우처 수급 86,000원,
 *    장애인·유공자 72,000원, 다자녀·차상위 확인서 발급대상 18,000원
 *  - 기타월(4~11월): 9,900·4,950·2,470원, 취사 전용 1,680·840·420원
 *  - 경감은 기본요금을 뺀 사용요금에만, 여러 자격이면 가장 큰 하나만 적용
 *
 *  [에너지바우처 2026 — 산업통상자원부·에너지바우처 통합센터]
 *  - 1인 295,200원·2인 407,500원·3인 532,700원·4인 이상 701,300원(연간 총액)
 *  - 사용기간 2026.7.1.~2027.5.31. 하절기는 전기만, 동절기는 전기·도시가스·지역난방 중 택1
 *  - 연탄쿠폰 등과 중복 시 하절기만 지원(1인 40,700원~4인 102,000원)
 *
 * 금액은 원 단위에서 버림(전기 부가세만 반올림)해 보여 주고, 모든 결과는 참고용 모의 계산입니다.
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-27';

  var LIMITS = {
    usage: { min: 0, max: 5000 },        // kWh
    mj: { min: 0, max: 30000 },          // MJ
    cubic: { min: 0, max: 3000 },        // ㎥
    charge: { min: 0, max: 5000000 },    // 원
    household: { min: 1, max: 10 }
  };

  /* ── 전기 ─────────────────────────────────────────────── */
  var ELEC = {
    effective: '2023-11-09',
    fuelQuarter: '2026년 4분기',
    low: {
      key: 'low',
      label: '주택용 저압',
      sub: '단독·빌라·오래된 아파트',
      base: [910, 1600, 7300],
      rate: [120.0, 214.6, 307.3],
      superUser: 736.2
    },
    high: {
      key: 'high',
      label: '주택용 고압',
      sub: '2000년대 이후 대단지 아파트',
      base: [730, 1260, 6060],
      rate: [105.0, 174.0, 242.3],
      superUser: 593.3
    },
    tierGeneral: [200, 400],
    tierSummer: [300, 450],
    climate: 9.0,
    fuel: 5.0,
    vat: 0.10,
    fund: 0.027,
    superThreshold: 1000,
    minCharge: 1000
  };

  /* ── 도시가스 ─────────────────────────────────────────── */
  var GAS = {
    effective: '2026-11-01',
    cookingSplit: 516,      // MJ — 취사·난방 겸용 기준
    heatDefault: 42.5,      // MJ/㎥ — 고지서 평균열량을 모를 때
    heatRange: [41.0, 44.4],
    heatArithmetic: 43.1,   // 산업통상자원부 안내 어림값
    vat: 0.10,
    regions: {
      seoul: {
        key: 'seoul',
        label: '서울',
        sub: '서울도시가스·예스코 등 서울 5사',
        base: 1250,
        cooking: 22.5268,
        heating: 22.5268,
        wholesale: 20.8495,
        retail: 1.6773,
        correction: 0.9940,
        heat: 42.5
      },
      gyeonggi: {
        key: 'gyeonggi',
        label: '경기',
        sub: '삼천리·서울도시가스(경기)·코원 등',
        base: 1250,
        cooking: 22.6226,
        heating: 22.6226,
        wholesale: 20.8495,
        retail: 1.7731,
        correction: 0.9939,
        heat: 42.5
      },
      incheon: {
        key: 'incheon',
        label: '인천',
        sub: '삼천리 인천·인천도시가스 등',
        base: 1000,
        cooking: 22.5084,
        heating: 22.5084,
        wholesale: 20.8495,
        retail: 1.6589,
        correction: 0.9945,
        heat: 42.5
      }
    }
  };

  /* ── 복지할인 ─────────────────────────────────────────── */
  var WELFARE = {
    // 전기 정액 할인 (원/월)
    elecFixed: {
      veteran:        { label: '국가·독립·5·18유공자(1~3급)', normal: 16000, summer: 20000, gas: 'veteran' },
      disability:     { label: '장애의 정도가 심한 장애인', normal: 16000, summer: 20000, gas: 'disability' },
      livelihood:     { label: '생계·의료급여 수급자', normal: 16000, summer: 20000, gas: 'livelihood' },
      housing:        { label: '주거급여 수급자', normal: 10000, summer: 12000, gas: 'housing' },
      education:      { label: '교육급여 수급자', normal: 10000, summer: 12000, gas: 'education' },
      near_poor:      { label: '차상위계층', normal: 8000, summer: 10000, gas: 'near_poor' }
    },
    // 전기 정률 할인 (30%)
    elecRate: {
      multi_child:    { label: '자녀 3명 이상 다자녀가구', gas: 'multi_child' },
      large_family:   { label: '가구원 5인 이상 대가족', gas: null },
      birth:          { label: '출생 3년 미만 영아가 있는 출산가구', gas: null },
      life_support:   { label: '생명유지장치 사용 가구', gas: null }
    },
    elecRatePct: 30,
    elecRateCap: 16000,
    stackableFixed: ['livelihood', 'housing', 'education', 'near_poor'],
    summerMonths: [6, 7, 8],

    // 도시가스 요금경감 (원/월) — winter 12~3월, other 4~11월, cooking 취사 전용
    gas: {
      livelihood:    { winter: 148000, winterVoucher: 86000, other: 9900, cooking: 1680 },
      housing:       { winter: 148000, winterVoucher: 86000, other: 4950, cooking: 840 },
      education:     { winter: 148000, winterVoucher: 86000, other: 2470, cooking: 420 },
      near_poor:     { winter: 148000, winterVoucher: 86000, other: 4950, cooking: 840 },
      near_poor_cert:{ winter: 18000, winterVoucher: 18000, other: 2470, cooking: 420 },
      disability:    { winter: 72000, winterVoucher: 72000, other: 9900, cooking: 1680 },
      veteran:       { winter: 72000, winterVoucher: 72000, other: 9900, cooking: 1680 },
      multi_child:   { winter: 18000, winterVoucher: 18000, other: 2470, cooking: 420 }
    },
    gasWinterMonths: [12, 1, 2, 3],

    // 에너지바우처 2026 (연간 총액 / 연탄·긴급복지 중복 시 하절기만)
    voucher: [
      { size: 1, total: 295200, summerOnly: 40700, label: '1인 세대' },
      { size: 2, total: 407500, summerOnly: 58800, label: '2인 세대' },
      { size: 3, total: 532700, summerOnly: 75800, label: '3인 세대' },
      { size: 4, total: 701300, summerOnly: 102000, label: '4인 이상 세대' }
    ],
    voucherPeriod: '2026.7.1.~2027.5.31.',
    voucherApply: '2026.6.15.~2026.12.31.'
  };

  /* ── 유틸 ─────────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function floorWon(v) { return Math.floor(v + 1e-7); }
  function roundHalfUp(v) { return Math.floor(v + 0.5 + 1e-7); }
  function floor10(v) { return Math.floor((v + 1e-7) / 10) * 10; }
  function monthOf(v) {
    var m = Math.round(num(v, 1));
    if (m < 1) m = 1;
    if (m > 12) m = 12;
    return m;
  }

  /* ── 계절 ─────────────────────────────────────────────── */
  function isSummerTariff(month) {
    var m = monthOf(month);
    return m === 7 || m === 8;
  }
  function isSuperSeason(month) {
    var m = monthOf(month);
    return m === 7 || m === 8 || m === 12 || m === 1 || m === 2;
  }
  function isSummerWelfare(month) {
    return WELFARE.summerMonths.indexOf(monthOf(month)) >= 0;
  }
  function isGasWinter(month) {
    return WELFARE.gasWinterMonths.indexOf(monthOf(month)) >= 0;
  }
  function seasonLabel(month) {
    var m = monthOf(month);
    if (m === 7 || m === 8) return '하계(7~8월)';
    if (m === 12 || m === 1 || m === 2) return '동계(12~2월)';
    return '기타계절';
  }
  function tierBounds(type, month) {
    var t = type === 'high' ? ELEC.high : ELEC.low;
    void t;
    return isSummerTariff(month) ? ELEC.tierSummer : ELEC.tierGeneral;
  }
  function tierOf(usage, month) {
    var b = tierBounds('low', month);
    if (usage <= b[0]) return 1;
    if (usage <= b[1]) return 2;
    return 3;
  }

  /* ── 전기요금 ─────────────────────────────────────────── */
  /**
   * @param {object} o
   *   usage  사용량(kWh)
   *   type   'low' | 'high'
   *   month  1~12
   *   keys   복지할인 자격 키 배열
   */
  function electricityBill(o) {
    var opt = o || {};
    var usage = Math.max(0, num(opt.usage, 0));
    var type = opt.type === 'high' ? 'high' : 'low';
    var tariff = ELEC[type];
    var month = monthOf(opt.month);
    var bounds = tierBounds(type, month);
    var tier = usage <= bounds[0] ? 1 : (usage <= bounds[1] ? 2 : 3);
    var superSeason = isSuperSeason(month);

    var superKwh = superSeason && usage > ELEC.superThreshold ? usage - ELEC.superThreshold : 0;
    var normalUsage = usage - superKwh;

    var segs = [
      { tier: 1, from: 0, to: bounds[0] },
      { tier: 2, from: bounds[0], to: bounds[1] },
      { tier: 3, from: bounds[1], to: ELEC.superThreshold }
    ];
    var energyLines = [];
    var energyRaw = 0;
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var kwh = Math.max(0, Math.min(normalUsage, seg.to) - seg.from);
      if (kwh <= 0) continue;
      var rate = tariff.rate[seg.tier - 1];
      energyRaw += kwh * rate;
      energyLines.push({
        tier: seg.tier,
        label: seg.tier + '단계',
        kwh: kwh,
        rate: rate,
        amount: floorWon(kwh * rate)
      });
    }
    if (superKwh > 0) {
      energyRaw += superKwh * tariff.superUser;
      energyLines.push({
        tier: 4,
        label: '슈퍼유저(1,000kWh 초과)',
        kwh: superKwh,
        rate: tariff.superUser,
        amount: floorWon(superKwh * tariff.superUser)
      });
    }
    var energyFee = floorWon(energyRaw);
    var baseFee = usage > 0 ? tariff.base[tier - 1] : 0;
    var climateFee = floorWon(usage * ELEC.climate);
    var fuelFee = floorWon(usage * ELEC.fuel);
    var chargeBase = baseFee + energyFee + climateFee + fuelFee;

    var discount = electricityDiscount({ keys: opt.keys, chargeBase: chargeBase, month: month });
    var chargeAfter = Math.max(0, chargeBase - discount.total);
    var vat = roundHalfUp(chargeAfter * ELEC.vat);
    var fund = floor10(chargeAfter * ELEC.fund);
    var total = floor10(chargeAfter + vat + fund);

    return {
      usage: usage,
      type: type,
      typeLabel: tariff.label,
      month: month,
      season: seasonLabel(month),
      isSummer: isSummerTariff(month),
      superSeason: superSeason,
      bounds: bounds,
      tier: tier,
      tierLabel: superKwh > 0 ? '슈퍼유저' : tier + '단계',
      baseFee: baseFee,
      energyLines: energyLines,
      energyFee: energyFee,
      superKwh: superKwh,
      superFee: superKwh > 0 ? floorWon(superKwh * tariff.superUser) : 0,
      climateFee: climateFee,
      fuelFee: fuelFee,
      climateRate: ELEC.climate,
      fuelRate: ELEC.fuel,
      chargeBase: chargeBase,
      discount: discount,
      discountAmount: discount.total,
      chargeAfter: chargeAfter,
      vat: vat,
      fund: fund,
      total: total,
      minChargeApplied: false,
      avgRate: usage > 0 ? total / usage : 0,
      blockRate: usage > 0 ? energyFee / usage : 0
    };
  }

  /**
   * 전기요금 복지할인
   * @param {object} o  { keys: [...], chargeBase: 전기요금계, month }
   */
  function electricityDiscount(o) {
    var opt = o || {};
    var keys = Array.isArray(opt.keys) ? opt.keys : (opt.keys ? [opt.keys] : []);
    var chargeBase = Math.max(0, num(opt.chargeBase, 0));
    var month = monthOf(opt.month);
    var summer = isSummerWelfare(month);
    var items = [];
    var fixedKey = null;
    var fixedAmount = 0;
    var familyKey = null;
    var familyRaw = 0;
    var familyAmount = 0;
    var familyCap = 0;

    keys.forEach(function (key) {
      var f = WELFARE.elecFixed[key];
      if (f) {
        var amount = summer ? f.summer : f.normal;
        if (amount > fixedAmount) {
          fixedAmount = amount;
          fixedKey = key;
        }
      }
      var r = WELFARE.elecRate[key];
      if (r) {
        var raw = chargeBase * (WELFARE.elecRatePct / 100);
        var cap = key === 'life_support' ? 0 : WELFARE.elecRateCap;
        var amt = cap ? Math.min(raw, cap) : raw;
        if (amt > familyAmount) {
          familyAmount = amt;
          familyRaw = raw;
          familyCap = cap;
          familyKey = key;
        }
      }
    });

    if (!chargeBase) {
      fixedAmount = 0;
      familyAmount = 0;
    }

    var stackable = fixedKey && WELFARE.stackableFixed.indexOf(fixedKey) >= 0;
    var fixedPart = Math.min(fixedAmount, chargeBase);
    var familyPart = Math.min(floorWon(familyAmount), Math.max(0, chargeBase - (stackable ? fixedPart : 0)));
    var total;

    if (fixedKey && familyKey && stackable) {
      total = fixedPart + familyPart;
    } else if (fixedKey && familyKey) {
      total = Math.max(fixedPart, floorWon(familyAmount));
      if (total === fixedPart) familyPart = 0;
      else fixedPart = 0;
    } else if (fixedKey) {
      total = fixedPart;
    } else {
      total = familyPart;
    }
    total = Math.min(total, chargeBase);

    if (fixedKey && fixedPart > 0) {
      var fl = WELFARE.elecFixed[fixedKey];
      items.push({
        key: fixedKey,
        kind: 'fixed',
        label: fl.label,
        amount: fixedPart,
        note: (summer ? '여름철 한도 ' : '월 한도 ') + fmt(fl.summer) + '원'
      });
    }
    if (familyKey && familyPart > 0) {
      var rl = WELFARE.elecRate[familyKey];
      items.push({
        key: familyKey,
        kind: 'rate',
        label: rl.label,
        amount: familyPart,
        ratePct: WELFARE.elecRatePct,
        capped: familyCap > 0 && familyRaw > familyCap,
        note: familyCap > 0
          ? '전기요금계의 30% · 월 ' + fmt(familyCap) + '원 한도'
          : '전기요금계의 30% · 한도 없음'
      });
    }

    return {
      keys: keys,
      fixedKey: fixedKey,
      fixedAmount: fixedPart,
      familyKey: familyKey,
      familyAmount: familyPart,
      familyRaw: floorWon(familyRaw),
      familyCapped: familyCap > 0 && familyRaw > familyCap,
      stacked: !!(fixedKey && familyKey && stackable),
      stackable: !!stackable,
      summer: summer,
      total: total
    };
  }

  function fmt(n) {
    return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 청구금액 → 사용량 역산 (이분탐색) */
  function usageForBill(amount, o) {
    var target = Math.max(0, num(amount, 0));
    var base = {};
    for (var k in (o || {})) if (Object.prototype.hasOwnProperty.call(o, k)) base[k] = o[k];
    var lo = 0, hi = 5000;
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (electricityBill(shrink(base, mid)).total < target) lo = mid + 1;
      else hi = mid;
    }
    var cand = [lo - 1, lo, lo + 1].filter(function (v) { return v >= 0 && v <= 5000; })
      .map(function (v) {
        var t = electricityBill(shrink(base, v)).total;
        return { usage: v, total: t, diff: Math.abs(t - target) };
      }).sort(function (a, b) { return a.diff - b.diff; });
    var best = cand[0] || { usage: 0, total: 0, diff: target };
    return { target: target, usage: best.usage, total: best.total, diff: best.diff, exact: best.diff === 0 };
  }

  function shrink(o, usage) {
    var copy = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) copy[k] = o[k];
    copy.usage = usage;
    return copy;
  }

  /** 1kWh 더 쓸 때 늘어나는 금액 · 다음 구간까지 남은 양 */
  function tierInfo(o) {
    var opt = o || {};
    var bill = electricityBill(opt);
    var usage = bill.usage;
    var bounds = bill.bounds;
    var info = {
      tier: bill.tier,
      label: bill.tierLabel,
      bounds: bounds,
      marginal: electricityBill(shrink(opt, usage + 1)).total - bill.total,
      nextThreshold: null,
      remaining: null,
      jump: null,
      lowerTo: null,
      lowerNeed: null,
      lowerSave: null
    };
    if (usage < bounds[0]) {
      info.nextThreshold = bounds[0];
      info.remaining = bounds[0] - usage;
      info.jump = electricityBill(shrink(opt, bounds[0] + 1)).total - electricityBill(shrink(opt, bounds[0])).total;
    } else if (usage < bounds[1]) {
      info.nextThreshold = bounds[1];
      info.remaining = bounds[1] - usage;
      info.jump = electricityBill(shrink(opt, bounds[1] + 1)).total - electricityBill(shrink(opt, bounds[1])).total;
    } else if (bill.superSeason && usage < ELEC.superThreshold) {
      info.nextThreshold = ELEC.superThreshold;
      info.remaining = ELEC.superThreshold - usage;
      info.jump = electricityBill(shrink(opt, ELEC.superThreshold + 1)).total - electricityBill(shrink(opt, ELEC.superThreshold)).total;
    }
    if (usage > bounds[0]) {
      var to = usage <= bounds[1] ? bounds[0] : bounds[1];
      info.lowerTo = to;
      info.lowerNeed = usage - to;
      info.lowerSave = bill.total - electricityBill(shrink(opt, to)).total;
    }
    return info;
  }

  /** 사용량 구간별 표 */
  function electricityScale(o) {
    var opt = o || {};
    var list = opt.usages || [100, 200, 300, 350, 400, 450, 500, 600];
    return list.map(function (u) {
      var b = electricityBill({ usage: u, type: opt.type, month: opt.month, keys: opt.keys });
      return { usage: u, tier: b.tier, baseFee: b.baseFee, energyFee: b.energyFee, total: b.total, discount: b.discountAmount };
    });
  }

  /* ── 도시가스 ─────────────────────────────────────────── */
  function gasRegion(key) {
    return GAS.regions[key] || GAS.regions.seoul;
  }

  /**
   * @param {object} o
   *   region  'seoul' | 'gyeonggi' | 'incheon'
   *   mode    'cubic' | 'mj'
   *   cubic   검침량(㎥)
   *   mj      사용열량(MJ) — mode==='mj' 일 때 사용
   *   heat    평균열량(MJ/㎥)
   *   correction 보정계수
   *   month   1~12
   *   usageType 'combined' | 'cooking'
   *   keys    도시가스 경감 자격 키 배열(가장 큰 하나만 적용)
   *   voucher 에너지바우처 수급 여부
   */
  function gasBill(o) {
    var opt = o || {};
    var region = gasRegion(opt.region);
    var month = monthOf(opt.month);
    var winter = isGasWinter(month);
    var heat = clamp(num(opt.heat, region.heat), GAS.heatRange[0], GAS.heatRange[1]);
    var correction = clamp(num(opt.correction, region.correction), 0.9, 1.1);
    var cubic = Math.max(0, num(opt.cubic, 0));
    var mj = 0;
    var fromCubic = false;
    if (opt.mode === 'mj') {
      mj = Math.max(0, num(opt.mj, 0));
      cubic = heat > 0 && correction > 0 ? mj / (heat * correction) : 0;
    } else {
      mj = cubic * correction * heat;
      fromCubic = true;
    }

    var cookingMj = opt.usageType === 'cooking' ? mj : Math.min(mj, GAS.cookingSplit);
    var heatingMj = opt.usageType === 'cooking' ? 0 : Math.max(0, mj - GAS.cookingSplit);
    var cookingCharge = floorWon(cookingMj * region.cooking);
    var heatingCharge = floorWon(heatingMj * region.heating);
    var usageCharge = cookingCharge + heatingCharge;
    var baseFee = mj > 0 || cubic > 0 ? region.base : 0;

    var discount = gasDiscount({
      keys: opt.keys,
      month: month,
      usageCharge: usageCharge,
      voucher: opt.voucher,
      usageType: opt.usageType
    });
    var supply = Math.max(0, baseFee + usageCharge - discount.amount);
    var vat = roundHalfUp(supply * GAS.vat);
    var total = floor10(supply + vat);

    return {
      region: region.key,
      regionLabel: region.label,
      month: month,
      winter: winter,
      seasonLabel: winter ? '동절기(12~3월)' : '기타월(4~11월)',
      mode: opt.mode === 'mj' ? 'mj' : 'cubic',
      cubic: Math.round(cubic * 10) / 10,
      mj: Math.round(mj * 10) / 10,
      heat: heat,
      correction: correction,
      fromCubic: fromCubic,
      usageType: opt.usageType === 'cooking' ? 'cooking' : 'combined',
      cookingMj: Math.round(cookingMj * 10) / 10,
      heatingMj: Math.round(heatingMj * 10) / 10,
      cookingRate: region.cooking,
      heatingRate: region.heating,
      cookingCharge: cookingCharge,
      heatingCharge: heatingCharge,
      usageCharge: usageCharge,
      baseFee: baseFee,
      discount: discount,
      discountAmount: discount.amount,
      supply: supply,
      vat: vat,
      total: total,
      perMj: mj > 0 ? total / mj : 0,
      perCubic: cubic > 0 ? total / cubic : 0
    };
  }

  function gasDiscount(o) {
    var opt = o || {};
    var keys = Array.isArray(opt.keys) ? opt.keys : (opt.keys ? [opt.keys] : []);
    var month = monthOf(opt.month);
    var winter = isGasWinter(month);
    var cookingOnly = opt.usageType === 'cooking';
    var usageCharge = Math.max(0, num(opt.usageCharge, 0));
    var best = { key: null, label: null, cap: 0, amount: 0, note: null };

    keys.forEach(function (key) {
      var row = WELFARE.gas[key];
      if (!row) return;
      var cap;
      var note;
      if (cookingOnly) {
        cap = row.cooking;
        note = '취사 전용 월 ' + fmt(row.cooking) + '원';
      } else if (winter) {
        cap = opt.voucher ? row.winterVoucher : row.winter;
        note = (opt.voucher ? '바우처 수급 동절기 ' : '동절기 ') + fmt(cap) + '원';
      } else {
        cap = row.other;
        note = '기타월 ' + fmt(row.other) + '원';
      }
      if (cap > best.cap) {
        best = { key: key, label: gasLabel(key), cap: cap, amount: 0, note: note };
      }
    });

    best.amount = Math.min(best.cap, usageCharge);
    best.capped = usageCharge < best.cap;
    best.full = best.cap;
    return best;
  }

  function gasLabel(key) {
    if (WELFARE.elecFixed[key]) return WELFARE.elecFixed[key].label;
    if (key === 'multi_child') return WELFARE.elecRate.multi_child.label;
    if (key === 'near_poor_cert') return '차상위계층 확인서 발급대상';
    return key;
  }

  /** 도시가스 사용열량 구간별 표 */
  function gasScale(o) {
    var opt = o || {};
    var list = opt.mjs || [500, 1000, 1500, 2000, 3000, 4000, 5000];
    return list.map(function (mj) {
      var g = gasBill({ region: opt.region, mode: 'mj', mj: mj, month: opt.month, usageType: opt.usageType });
      return { mj: mj, usageCharge: g.usageCharge, total: g.total, perMj: g.perMj };
    });
  }

  /** ㎥ ↔ MJ */
  function mjFromCubic(cubic, o) {
    var opt = o || {};
    var region = gasRegion(opt.region);
    var heat = clamp(num(opt.heat, region.heat), GAS.heatRange[0], GAS.heatRange[1]);
    var correction = clamp(num(opt.correction, region.correction), 0.9, 1.1);
    return Math.max(0, num(cubic, 0)) * correction * heat;
  }

  /* ── 에너지바우처 ─────────────────────────────────────── */
  function voucher(o) {
    var opt = o || {};
    var size = Math.round(clamp(num(opt.household, 4), 1, 99));
    var row = WELFARE.voucher[WELFARE.voucher.length - 1];
    for (var i = 0; i < WELFARE.voucher.length; i++) {
      if (size <= WELFARE.voucher[i].size) { row = WELFARE.voucher[i]; break; }
    }
    return {
      household: size,
      label: row.label,
      total: row.total,
      summerOnly: row.summerOnly,
      winter: row.total - row.summerOnly,
      period: WELFARE.voucherPeriod,
      apply: WELFARE.voucherApply
    };
  }

  /**
   * 복지할인 종합 — 한 달/1년 예상 혜택
   * @param {object} o
   *   keys       자격 키 배열
   *   household  세대원 수
   *   usage      월 전기 사용량(kWh)
   *   type       전기 계약종별
   *   region     도시가스 지역
   *   mj         월 가스 사용열량(MJ)
   *   usageType  가스 용도
   *   voucherOn  에너지바우처 수급 여부
   */
  function welfareSummary(o) {
    var opt = o || {};
    var keys = Array.isArray(opt.keys) ? opt.keys : (opt.keys ? [opt.keys] : []);
    var household = Math.round(clamp(num(opt.household, 4), 1, 10));
    var usage = Math.max(0, num(opt.usage, 350));
    var type = opt.type === 'high' ? 'high' : 'low';
    var region = opt.region || 'seoul';
    var mj = Math.max(0, num(opt.mj, 1500));
    var usageType = opt.usageType === 'cooking' ? 'cooking' : 'combined';
    var voucherOn = !!opt.voucherOn;

    // 전기 — 여름(7월)·기타(11월)·동계(1월) 세 달
    var elecBase = electricityBill({ usage: usage, type: type, month: 11, keys: keys });
    var elecSummer = electricityBill({ usage: usage, type: type, month: 7, keys: keys });
    var elecNoKeys = electricityBill({ usage: usage, type: type, month: 11, keys: [] });
    var eDiscountGeneral = elecBase.discountAmount;
    var eDiscountSummer = elecSummer.discountAmount;
    var elecAnnual = eDiscountGeneral * 9 + eDiscountSummer * 3;

    // 가스 — 동절기 4개월 + 기타 8개월 (요금경감은 사용요금 한도)
    var gasWinterBill = gasBill({ region: region, mode: 'mj', mj: mj, month: 1, usageType: usageType, keys: keys, voucher: voucherOn });
    var gasOtherBill = gasBill({ region: region, mode: 'mj', mj: mj, month: 5, usageType: usageType, keys: keys, voucher: voucherOn });
    var gasAnnual = gasWinterBill.discountAmount * 4 + gasOtherBill.discountAmount * 8;

    var voc = voucher({ household: household });
    var voucherEligible = keys.some(function (k) {
      return ['livelihood', 'housing', 'education', 'near_poor'].indexOf(k) >= 0;
    });
    var voucherAnnual = voucherOn && voucherEligible ? voc.total : 0;

    var annual = elecAnnual + gasAnnual + voucherAnnual;
    var monthlyWinterElec = elecBase.discountAmount;
    var monthlyWinterGas = gasWinterBill.discountAmount;

    return {
      keys: keys,
      household: household,
      usage: usage,
      region: region,
      mj: mj,
      usageType: usageType,
      voucherOn: voucherOn,
      voucherEligible: voucherEligible,
      elec: {
        general: elecBase,
        summer: elecSummer,
        noDiscount: elecNoKeys,
        generalDiscount: eDiscountGeneral,
        summerDiscount: eDiscountSummer,
        annualDiscount: elecAnnual
      },
      gas: {
        winter: gasWinterBill,
        other: gasOtherBill,
        annualDiscount: gasAnnual
      },
      voucher: voc,
      voucherAnnual: voucherAnnual,
      annual: annual,
      monthlyWinter: monthlyWinterElec + monthlyWinterGas,
      monthlySummer: eDiscountSummer + gasOtherBill.discountAmount
    };
  }

  /** 자격 목록 (UI·표에서 사용) */
  function qualificationList() {
    var out = [];
    Object.keys(WELFARE.elecFixed).forEach(function (key) {
      var row = WELFARE.elecFixed[key];
      out.push({
        key: key,
        label: row.label,
        group: 'fixed',
        elec: row.normal,
        elecSummer: row.summer,
        gas: WELFARE.gas[row.gas || key] || null,
        gasKey: row.gas
      });
    });
    Object.keys(WELFARE.elecRate).forEach(function (key) {
      var row = WELFARE.elecRate[key];
      out.push({
        key: key,
        label: row.label,
        group: 'rate',
        elec: '30%',
        elecSummer: '30%',
        gas: row.gas ? WELFARE.gas[row.gas] : null,
        gasKey: row.gas
      });
    });
    var extra = { key: 'near_poor_cert', label: '차상위계층 확인서 발급대상', group: 'gas', elec: null, elecSummer: null, gas: WELFARE.gas.near_poor_cert, gasKey: 'near_poor_cert' };
    out.push(extra);
    return out;
  }

  var API = {
    RULES: {
      verifiedAt: DATA_DATE,
      electricity: ELEC,
      gas: GAS,
      welfare: WELFARE,
      limits: LIMITS
    },
    LIMITS: LIMITS,
    monthOf: monthOf,
    seasonLabel: seasonLabel,
    isSummerTariff: isSummerTariff,
    isSuperSeason: isSuperSeason,
    isSummerWelfare: isSummerWelfare,
    isGasWinter: isGasWinter,
    tierBounds: tierBounds,
    tierOf: tierOf,
    electricityBill: electricityBill,
    electricityDiscount: electricityDiscount,
    electricityScale: electricityScale,
    usageForBill: usageForBill,
    tierInfo: tierInfo,
    gasBill: gasBill,
    gasDiscount: gasDiscount,
    gasScale: gasScale,
    mjFromCubic: mjFromCubic,
    gasRegion: gasRegion,
    voucher: voucher,
    welfareSummary: welfareSummary,
    qualificationList: qualificationList
  };

  root.UBCalc = API;
})(typeof window !== 'undefined' ? window : this);
