/* ══════════════════════════════════════════════════════════════
   2026 자동차세 연납·겨울 유류비 계산기 — 계산 엔진 (calc.js)
   - 자동차세: 지방세법 제127조·제128조, 같은 법 시행령 제122조·제125조
   - 유류비: 주행거리 ÷ 연비 × 단가 (겨울철 연비 저하 반영)
   화면과 분리된 순수 함수만 둡니다. window.CarTaxCalc 로 노출합니다.
   ══════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  /* ── 비영업용 승용자동차 cc당 세액 (지방세법 제127조①1) ───────── */
  var CC_BRACKETS = [
    { max: 1000, rate: 80 },
    { max: 1600, rate: 140 },
    { max: Infinity, rate: 200 }
  ];

  var TAX = {
    evAnnual: 100000,   // 그 밖의 승용자동차(전기·수소 등) 비영업용 정액 10만원
    eduRate: 0.3,       // 지방교육세 = 자동차세액의 30%
    ageStart: 3,        // 차령 3년부터 경감
    ageStep: 0.05,      // 1년마다 5%p
    ageCap: 12,         // 12년을 넘으면 12년으로 계산
    ageMax: 0.5,        // 최대 50%
    prepayRate: 0.05,   // 2026년 연납 공제 이자율 (시행령 제125조⑥)
    // 납부기한 다음 날 ~ 12월 31일까지 남은 일수로 계산 (연납분 기준, 윤년은 366)
    windows: [
      { month: 1, days: 334, denom: 365, covers: "2월~12월분" },
      { month: 3, days: 275, denom: 365, covers: "4월~12월분" },
      { month: 6, days: 184, denom: 365, covers: "7월~12월분(2기분)" },
      { month: 9, days: 92, denom: 365, covers: "10월~12월분(2기분)" }
    ]
  };

  /* ── 유종별 기본값 (2026-11-25 확인) ────────────────────────── */
  var FUELS = {
    gasoline: {
      label: "휘발유", unit: "L", effUnit: "km/L",
      eff: 12.0, price: 1854,
      priceNote: "2026-11-25 전국 평균 1,853.88원/L"
    },
    diesel: {
      label: "경유", unit: "L", effUnit: "km/L",
      eff: 14.0, price: 1841,
      priceNote: "2026-11-25 전국 평균 1,840.57원/L"
    },
    lpg: {
      label: "LPG(부탄)", unit: "L", effUnit: "km/L",
      eff: 9.0, price: 1178,
      priceNote: "2026-11-25 전국 평균 1,178.07원/L"
    },
    ev: {
      label: "전기", unit: "kWh", effUnit: "km/kWh",
      eff: 5.5, price: 295,
      priceNote: "공공 완속 충전 295원/kWh (2026.8.1~)"
    }
  };

  var WINTER_RATES = [0.10, 0.15];  // 겨울철 연비 저하 10% / 15%

  /* ── 공통 도우미 ────────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : fallback;
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  // 10원 미만 절사 (부동소수 오차 보정)
  function floor10(v) {
    return Math.floor(v / 10 + 1e-9) * 10;
  }

  function roundWon(v) {
    return Math.round(v);
  }

  /* ── 차량 유형·세율 ─────────────────────────────────────────── */
  function ccRate(cc) {
    var c = clamp(num(cc, 0), 0, 20000);
    for (var i = 0; i < CC_BRACKETS.length; i++) {
      if (c <= CC_BRACKETS[i].max) return CC_BRACKETS[i].rate;
    }
    return 200;
  }

  /* 차령 (지방세법 시행령 제122조②)
     기산일 1~6월: 차령 = 과세연도 - 기산연도 + 1 (1·2기분 동일)
     기산일 7~12월: 1기분 = 과세연도 - 기산연도, 2기분 = 과세연도 - 기산연도 + 1 */
  function ageOf(regYear, regMonth, taxYear, half) {
    var ry = clamp(num(regYear, taxYear), 1900, 2100);
    var rm = clamp(num(regMonth, 1), 1, 12);
    var ty = clamp(num(taxYear, 2026), 1900, 2100);
    var age;
    if (rm <= 6) {
      age = ty - ry + 1;
    } else {
      age = half === 2 ? ty - ry + 1 : ty - ry;
    }
    return clamp(age, 1, 60);
  }

  // 경감률: 차령 3년부터 5%p씩, 12년 이상 50%
  function ageDiscount(age) {
    var n = clamp(age, 1, TAX.ageCap);
    if (n < TAX.ageStart) return 0;
    return Math.min(50, (n - 2) * 5) / 100;   // 12년 이상은 50%
  }

  /* ── 자동차세 연세액·연납 ────────────────────────────────────── */
  function calcCarTax(input) {
    var o = input || {};
    var type = o.type === "ev" ? "ev" : "ice";
    var taxYear = clamp(num(o.taxYear, 2026), 2000, 2100);
    var applyMonth = [1, 3, 6, 9].indexOf(num(o.applyMonth, 1)) >= 0 ? num(o.applyMonth, 1) : 1;

    var cc = clamp(num(o.cc, 0), 0, 20000);
    var rate = ccRate(cc);
    var baseAnnual = type === "ev" ? TAX.evAnnual : Math.round(cc * rate);

    var ageFirst = ageOf(o.regYear, o.regMonth, taxYear, 1);
    var ageSecond = ageOf(o.regYear, o.regMonth, taxYear, 2);

    var discountFirst = 0;
    var discountSecond = 0;
    var halfFirst;
    var halfSecond;

    if (type === "ev") {
      // 전기차는 정액이라 차령 경감을 적용하지 않습니다(제127조①3).
      halfFirst = floor10(baseAnnual / 2);
      halfSecond = halfFirst;
    } else {
      discountFirst = ageDiscount(ageFirst);
      discountSecond = ageDiscount(ageSecond);
      halfFirst = floor10(baseAnnual / 2 - (baseAnnual / 2) * discountFirst);
      halfSecond = floor10(baseAnnual / 2 - (baseAnnual / 2) * discountSecond);
    }

    var baseTax = halfFirst + halfSecond;                    // 1·2기분 자동차세 합계
    var eduFirst = floor10(halfFirst * TAX.eduRate);         // 기분별 지방교육세 30%
    var eduSecond = floor10(halfSecond * TAX.eduRate);
    var eduTax = eduFirst + eduSecond;
    var annualTotal = baseTax + eduTax;

    var windows = TAX.windows.map(function (w) {
      var discount = floor10(annualTotal * TAX.prepayRate * (w.days / w.denom));
      return {
        month: w.month,
        covers: w.covers,
        days: w.days,
        discount: discount,
        pay: annualTotal - discount,
        rate: annualTotal > 0 ? discount / annualTotal : 0
      };
    });

    var picked = windows.filter(function (w) { return w.month === applyMonth; })[0] || windows[0];

    return {
      type: type,
      cc: cc,
      ccRate: type === "ev" ? 0 : rate,
      baseAnnual: baseAnnual,
      taxYear: taxYear,
      age: Math.max(ageFirst, ageSecond),
      ageFirst: ageFirst,
      ageSecond: ageSecond,
      ageSame: ageFirst === ageSecond,
      discountRateFirst: discountFirst,
      discountRateSecond: discountSecond,
      discountRate: Math.max(discountFirst, discountSecond),
      halfFirst: halfFirst,
      halfSecond: halfSecond,
      baseTax: baseTax,
      eduTax: eduTax,
      annualTotal: annualTotal,
      installmentFirst: halfFirst + eduFirst,
      installmentSecond: halfSecond + eduSecond,
      installments: halfFirst + eduFirst + halfSecond + eduSecond,
      windows: windows,
      applyMonth: picked.month,
      pick: picked,
      saving: picked.discount,
      pay: picked.pay
    };
  }

  /* ── 유류비 ─────────────────────────────────────────────────── */
  function calcFuel(input) {
    var o = input || {};
    var key = FUELS[o.fuel] ? o.fuel : "gasoline";
    var preset = FUELS[key];

    var efficiency = clamp(num(o.efficiency, preset.eff), 0.1, 100);
    var monthlyKm = clamp(num(o.monthlyKm, 0), 0, 1000000);
    var unitPrice = clamp(num(o.unitPrice, preset.price), 0, 100000);

    var unitsPerMonth = monthlyKm / efficiency;
    var monthly = unitsPerMonth * unitPrice;
    var costPerKm = monthlyKm > 0 ? monthly / monthlyKm : 0;

    var winter = WINTER_RATES.map(function (r) {
      var eff = efficiency * (1 - r);
      var units = monthlyKm / eff;
      var cost = units * unitPrice;
      return {
        rate: r,
        efficiency: eff,
        unitsPerMonth: units,
        monthly: cost,
        extraMonthly: cost - monthly,
        extraWinter: (cost - monthly) * 3,   // 12월~2월
        annual: cost * 12
      };
    });

    return {
      fuel: key,
      label: preset.label,
      unit: preset.unit,
      effUnit: preset.effUnit,
      priceNote: preset.priceNote,
      efficiency: efficiency,
      monthlyKm: monthlyKm,
      unitPrice: unitPrice,
      unitsPerMonth: unitsPerMonth,
      monthly: monthly,
      annual: monthly * 12,
      costPerKm: costPerKm,
      costPer100km: costPerKm * 100,
      winter: winter
    };
  }

  /* ── 표시용 도우미 ──────────────────────────────────────────── */
  function percent(v, digits) {
    var d = digits === undefined ? 2 : digits;
    return (v * 100).toFixed(d) + "%";
  }

  function group(n) {
    var s = String(Math.round(Math.abs(n)));
    var out = "";
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ",";
      out += s.charAt(i);
    }
    return (n < 0 ? "-" : "") + out;
  }

  function won(v) {
    return group(v) + "원";
  }

  root.CarTaxCalc = {
    TAX: TAX,
    FUELS: FUELS,
    WINTER_RATES: WINTER_RATES,
    CC_BRACKETS: CC_BRACKETS,
    ccRate: ccRate,
    ageOf: ageOf,
    ageDiscount: ageDiscount,
    calcCarTax: calcCarTax,
    calcFuel: calcFuel,
    floor10: floor10,
    roundWon: roundWon,
    percent: percent,
    won: won,
    group: group,
    toNumber: num
  };
})(typeof window !== "undefined" ? window : globalThis);
