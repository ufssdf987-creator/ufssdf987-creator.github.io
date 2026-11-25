/*!
 * SPCalc — 2026년 퇴직금·실업급여(구직급여)·주휴수당 계산 엔진
 * ---------------------------------------------------------------
 * 세 계산을 한 파일에 두고 DOM 없이 동작합니다.
 * 브라우저(app.js)와 테스트(QuickJS)가 같은 코드를 씁니다.
 *
 * 기준 확인일: 2026-11-26
 *  - 퇴직금: 근로자퇴직급여 보장법 제4조·제8조, 근로기준법 제2조(평균임금)
 *      퇴직금 = 1일 평균임금 × 30일 × (재직일수 ÷ 365)
 *      1일 평균임금 = (퇴직 전 3개월 임금총액 + 연간상여금×3/12 + 연차수당×3/12) ÷ 3개월 총일수
 *      평균임금 < 통상임금이면 통상임금을 평균임금으로 봄(근로기준법 제2조 제2항)
 *  - 퇴직소득세: 소득세법 제48조(퇴직소득공제)·제55조(기본세율), 2023.1.1. 개정 반영
 *      근속연수공제 5년 이하 100만×연수 / 10년 이하 500만+200만×(연수-5)
 *                   20년 이하 1,500만+250만×(연수-10) / 20년 초과 4,000만+300만×(연수-20)
 *      환산급여공제 800만 이하 전액 / 7,000만 이하 800만+60% / 1억 이하 4,520만+55%
 *                   3억 이하 6,170만+45% / 3억 초과 1억5,170만+35%
 *      근속연수는 1년 미만 기간을 1년으로 봄(올림), 지방소득세는 소득세의 10%
 *  - 실업급여: 고용보험법 제45조·제46조·제50조 및 별표 1, 시행령 제68조
 *      2026.1.1. 이후 이직자: 기초일액 상한 113,500원 → 1일 상한 68,100원
 *      하한 = 최저임금 10,320원 × 1일 소정근로시간(8시간 기준) × 80% = 66,048원
 *      지급률 60%, 소정급여일수 120~270일
 *  - 주휴수당: 근로기준법 제18조 제3항·제55조, 시행령 제30조·별표 2
 *      4주 평균 1주 소정근로시간 15시간 이상 + 그 주 소정근로일 개근
 *      주휴수당 = min(8, 주 소정근로시간 ÷ 40 × 8) × 시급, 40시간 초과분은 늘지 않음
 *      2026년 최저임금 10,320원
 *
 * 모든 결과는 참고용 모의 계산입니다. 실제 금액은 회사·고용센터·근로계약서로 확인하세요.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.SPCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ────────────────────────────────────────────────────────────
   * 0. 기준값
   * ──────────────────────────────────────────────────────────── */
  var RULES = {
    year: 2026,
    verifiedAt: "2026-11-26",
    minWage: 10320,

    /* 종합소득 기본세율 — 소득세법 제55조 */
    taxBrackets: [
      { upTo: 14000000, rate: 0.06, progressive: 0 },
      { upTo: 50000000, rate: 0.15, progressive: 1260000 },
      { upTo: 88000000, rate: 0.24, progressive: 5760000 },
      { upTo: 150000000, rate: 0.35, progressive: 15440000 },
      { upTo: 300000000, rate: 0.38, progressive: 19940000 },
      { upTo: 500000000, rate: 0.40, progressive: 25940000 },
      { upTo: 1000000000, rate: 0.42, progressive: 35940000 },
      { upTo: Infinity, rate: 0.45, progressive: 65940000 }
    ],
    localTaxRate: 0.10,

    /* 퇴직금 */
    severance: {
      minServiceDays: 365,        // 계속근로 1년 이상
      bonusMonths: 3 / 12,        // 연간 상여금의 3/12
      payDaysPerYear: 30
    },

    /* 실업급여 — 2026.1.1. 이후 이직자 */
    jobSeek: {
      basisCap: 113500,           // 기초일액 상한(시행령 제68조)
      benefitRate: 0.60,
      dailyCap: 68100,            // 113,500 × 60%
      periodDaysDefault: 92,      // 퇴직 전 3개월 총일수(89~92)
      minPeriodDays: 89,
      maxPeriodDays: 92,
      waitingDays: 7,             // 실업인정 대기기간(총 지급일수에서 차감되지 않음)
      minInsuredDays: 180,
      bands: [
        { key: "lt1", label: "1년 미만", under50: 120, over50: 120 },
        { key: "1to3", label: "1년 이상 ~ 3년 미만", under50: 150, over50: 180 },
        { key: "3to5", label: "3년 이상 ~ 5년 미만", under50: 180, over50: 210 },
        { key: "5to10", label: "5년 이상 ~ 10년 미만", under50: 210, over50: 240 },
        { key: "gte10", label: "10년 이상", under50: 240, over50: 270 }
      ]
    },

    /* 주휴수당 */
    weekly: {
      thresholdHours: 15,
      fullWeekHours: 40,
      holidayHoursPerFullWeek: 8,
      weeksPerMonth: 4.345          // 365 ÷ 12 ÷ 7
    }
  };

  /* ────────────────────────────────────────────────────────────
   * 1. 숫자·날짜 도우미
   * ──────────────────────────────────────────────────────────── */
  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[^0-9.-]/g, ""));
    return isFinite(n) ? n : 0;
  }
  function floor(v) { return Math.floor(num(v)); }
  function comma(n) {
    var v = Math.round(num(n));
    var s = String(Math.abs(v));
    s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 ? "-" : "") + s;
  }
  function won(n) { return comma(n) + "원"; }
  /* 1,234만원 · 1억 2,340만원 처럼 읽기 쉽게 */
  function shortWon(n) {
    var v = Math.round(num(n));
    var sign = v < 0 ? "-" : "";
    v = Math.abs(v);
    if (v >= 100000000) {
      var eok = Math.floor(v / 100000000);
      var man = Math.round((v % 100000000) / 10000);
      if (man >= 10000) { eok += Math.floor(man / 10000); man = man % 10000; }
      return sign + eok + "억" + (man ? " " + comma(man) + "만" : "") + "원";
    }
    if (v >= 10000) {
      var m = Math.floor(v / 10000);
      var rest = v % 10000;
      return sign + comma(m) + "만" + (rest ? " " + comma(rest) : "") + "원";
    }
    return sign + comma(v) + "원";
  }
  function round2(v) { return Math.round(num(v) * 100) / 100; }

  function parseDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || "").trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var t = Date.UTC(y, mo - 1, d);
    var check = new Date(t);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
    return t;
  }
  var DAY = 86400000;
  function daysBetween(from, to) {
    var a = parseDate(from), b = parseDate(to);
    if (a == null || b == null) return null;
    return Math.round((b - a) / DAY);
  }
  function isoOf(t) {
    var d = new Date(t);
    var p = function (v) { return (v < 10 ? "0" : "") + v; };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
  }
  /* 말일 보정해서 n개월 전 날짜 */
  function addMonths(str, n) {
    var t = parseDate(str);
    if (t == null) return null;
    var d = new Date(t);
    var y = d.getUTCFullYear();
    var m = d.getUTCMonth() + n;
    var day = d.getUTCDate();
    var target = new Date(Date.UTC(y, m, 1));
    var lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
    return isoOf(target.getTime());
  }
  /* 퇴직일 직전 3개월의 달력 총일수(89~92) */
  function threeMonthDays(leaveDate) {
    if (parseDate(leaveDate) == null) return RULES.jobSeek.periodDaysDefault;
    var from = addMonths(leaveDate, -3);
    var n = daysBetween(from, leaveDate);
    if (!isFinite(n) || n < 28) return RULES.jobSeek.periodDaysDefault;
    return n;
  }
  /* 재직일수를 "6년 8개월" 처럼 */
  function periodText(days) {
    var d = Math.max(0, Math.round(num(days)));
    var y = Math.floor(d / 365);
    var rem = d - y * 365;
    var m = Math.floor(rem / 30);
    var r = rem - m * 30;
    var out = [];
    if (y) out.push(y + "년");
    if (m) out.push(m + "개월");
    if (!y && !m) out.push(r + "일");
    return out.join(" ");
  }

  /* ────────────────────────────────────────────────────────────
   * 2. 세율
   * ──────────────────────────────────────────────────────────── */
  function applyBrackets(base) {
    var b = Math.max(0, num(base));
    for (var i = 0; i < RULES.taxBrackets.length; i++) {
      var t = RULES.taxBrackets[i];
      if (b <= t.upTo) {
        return {
          tax: Math.max(0, b * t.rate - t.progressive),
          rate: t.rate,
          progressive: t.progressive
        };
      }
    }
    return { tax: 0, rate: 0, progressive: 0 };
  }

  /* ────────────────────────────────────────────────────────────
   * 3. 퇴직금
   * ──────────────────────────────────────────────────────────── */
  function serviceDeduction(years) {
    var y = Math.max(1, Math.floor(num(years)));
    if (y <= 5) return y * 1000000;
    if (y <= 10) return 5000000 + (y - 5) * 2000000;
    if (y <= 20) return 15000000 + (y - 10) * 2500000;
    return 40000000 + (y - 20) * 3000000;
  }

  function convertedDeduction(converted) {
    var c = Math.max(0, num(converted));
    if (c <= 8000000) return c;
    if (c <= 70000000) return 8000000 + (c - 8000000) * 0.6;
    if (c <= 100000000) return 45200000 + (c - 70000000) * 0.55;
    if (c <= 300000000) return 61700000 + (c - 100000000) * 0.45;
    return 151700000 + (c - 300000000) * 0.35;
  }

  function retirementTax(severanceAmount, serviceYears) {
    var income = Math.max(0, floor(severanceAmount));
    var years = Math.max(1, Math.floor(num(serviceYears)));
    var deduction = Math.min(income, serviceDeduction(years));
    var afterDeduction = Math.max(0, income - deduction);
    var converted = floor(afterDeduction / years * 12);
    var convDed = Math.min(converted, floor(convertedDeduction(converted)));
    var taxBase = Math.max(0, converted - convDed);
    var convertedTax = floor(applyBrackets(taxBase).tax);
    var tax = floor(convertedTax / 12 * years);
    var local = floor(tax * RULES.localTaxRate);
    return {
      income: income,
      years: years,
      serviceDeduction: deduction,
      afterDeduction: afterDeduction,
      converted: converted,
      convertedDeduction: convDed,
      taxBase: taxBase,
      convertedTax: convertedTax,
      tax: tax,
      localTax: local,
      total: tax + local,
      effectiveRate: income ? (tax + local) / income : 0
    };
  }

  function severance(input) {
    var o = input || {};
    var hire = o.hireDate;
    var leave = o.leaveDate;
    var days = daysBetween(hire, leave);
    var res = {
      ok: false,
      error: "",
      hireDate: hire || "",
      leaveDate: leave || "",
      days: 0,
      years: 0,
      serviceYears: 0,
      serviceText: "",
      eligible: false,
      wage3: Math.max(0, floor(o.wage3)),
      bonus: Math.max(0, floor(o.annualBonus)),
      annualLeave: Math.max(0, floor(o.annualLeavePay)),
      bonus3: 0,
      annual3: 0,
      totalWage: 0,
      periodDays: RULES.jobSeek.periodDaysDefault,
      dailyAvg: 0,
      dailyOrdinary: Math.max(0, floor(o.dailyOrdinary)),
      dailyUsed: 0,
      ordinaryApplied: false,
      severance: 0,
      tax: null,
      net: 0
    };

    if (parseDate(hire) == null) { res.error = "입사일을 다시 확인해 주세요."; return res; }
    if (parseDate(leave) == null) { res.error = "퇴사일을 다시 확인해 주세요."; return res; }
    if (days == null || days <= 0) {
      res.error = "퇴사일이 입사일보다 빠릅니다.";
      return res;
    }

    res.days = days;
    res.years = days / 365;
    res.serviceYears = Math.max(1, Math.ceil(days / 365)); // 1년 미만 기간은 1년으로 봄
    res.serviceText = periodText(days);
    res.eligible = days >= RULES.severance.minServiceDays;

    res.bonus3 = floor(res.bonus * RULES.severance.bonusMonths);
    res.annual3 = floor(res.annualLeave * RULES.severance.bonusMonths);
    res.totalWage = res.wage3 + res.bonus3 + res.annual3;
    res.periodDays = threeMonthDays(leave);
    res.dailyAvg = res.totalWage / res.periodDays;
    res.dailyUsed = Math.max(res.dailyAvg, res.dailyOrdinary);
    res.ordinaryApplied = res.dailyOrdinary > res.dailyAvg;
    res.severance = floor(res.dailyUsed * RULES.severance.payDaysPerYear * days / 365);
    res.tax = retirementTax(res.severance, res.serviceYears);
    res.net = Math.max(0, res.severance - res.tax.total);
    res.ok = true;
    return res;
  }

  /* ────────────────────────────────────────────────────────────
   * 4. 실업급여(구직급여)
   * ──────────────────────────────────────────────────────────── */
  function bandOf(key) {
    for (var i = 0; i < RULES.jobSeek.bands.length; i++) {
      if (RULES.jobSeek.bands[i].key === key) return RULES.jobSeek.bands[i];
    }
    return RULES.jobSeek.bands[0];
  }
  function benefitDays(bandKey, over50) {
    var b = bandOf(bandKey);
    return over50 ? b.over50 : b.under50;
  }

  function jobSeek(input) {
    var o = input || {};
    var mode = o.mode === "monthly" ? "monthly" : "total";
    var periodDays = Math.min(RULES.jobSeek.maxPeriodDays,
      Math.max(RULES.jobSeek.minPeriodDays, floor(o.periodDays) || RULES.jobSeek.periodDaysDefault));
    var hours = Math.min(RULES.weekly.holidayHoursPerFullWeek, Math.max(1, Math.round(num(o.dailyHours) || 8)));
    var over50 = !!o.over50;
    var band = bandOf(o.band);

    var total3 = mode === "monthly" ? Math.max(0, floor(o.monthlyWage)) * 3 : Math.max(0, floor(o.totalWage));
    var basis = total3 / periodDays;
    var basisApplied = Math.min(basis, RULES.jobSeek.basisCap);
    var raw = basisApplied * RULES.jobSeek.benefitRate;
    var lowLimit = floor(RULES.minWage * hours * 0.8);
    var highLimit = RULES.jobSeek.dailyCap;

    var daily, rule;
    if (raw < lowLimit) { daily = lowLimit; rule = "min"; }
    else if (raw > highLimit || basis > RULES.jobSeek.basisCap) { daily = highLimit; rule = "max"; }
    else { daily = floor(raw); rule = "pct"; }
    daily = floor(daily);

    var days = benefitDays(band.key, over50);
    var total = daily * days;

    return {
      ok: true,
      mode: mode,
      periodDays: periodDays,
      total3: total3,
      basis: basis,
      basisApplied: basisApplied,
      basisCapped: basis > RULES.jobSeek.basisCap,
      rawBenefit: raw,
      lowLimit: lowLimit,
      highLimit: highLimit,
      lowCappedHours: hours,
      daily: daily,
      rule: rule,
      dailyHours: hours,
      band: band.key,
      bandLabel: band.label,
      over50: over50,
      days: days,
      total: total,
      monthly: daily * 30,
      waitingDays: RULES.jobSeek.waitingDays
    };
  }

  /* ────────────────────────────────────────────────────────────
   * 5. 주휴수당
   * ──────────────────────────────────────────────────────────── */
  function weekly(input) {
    var o = input || {};
    var hourly = Math.max(0, Math.round(num(o.hourly)));
    var hours = Math.max(0, round2(o.weeklyHours));
    var attended = o.attended !== false;
    var over15 = hours >= RULES.weekly.thresholdHours;
    var holidayHours = 0;
    if (over15 && attended) {
      holidayHours = Math.min(
        RULES.weekly.holidayHoursPerFullWeek,
        hours / RULES.weekly.fullWeekHours * RULES.weekly.holidayHoursPerFullWeek
      );
      holidayHours = round2(holidayHours);
    }
    var holidayPay = floor(holidayHours * hourly);
    var weeklyPay = floor(hours * hourly);
    var weekTotal = weeklyPay + holidayPay;
    var monthlyTotal = floor(weekTotal * RULES.weekly.weeksPerMonth);
    var monthlyHoliday = floor(holidayPay * RULES.weekly.weeksPerMonth);

    return {
      ok: true,
      hourly: hourly,
      weeklyHours: hours,
      attended: attended,
      over15: over15,
      eligible: over15 && attended,
      holidayHours: holidayHours,
      holidayPay: holidayPay,
      weeklyPay: weeklyPay,
      weekTotal: weekTotal,
      monthlyTotal: monthlyTotal,
      monthlyHoliday: monthlyHoliday,
      weeksPerMonth: RULES.weekly.weeksPerMonth,
      belowMin: hourly > 0 && hourly < RULES.minWage,
      minWageGap: Math.max(0, RULES.minWage - hourly),
      minWage: RULES.minWage,
      /* 40시간 초과분은 주휴가 늘지 않음 */
      cappedByFullWeek: hours > RULES.weekly.fullWeekHours
    };
  }

  return {
    RULES: RULES,
    num: num,
    comma: comma,
    won: won,
    shortWon: shortWon,
    round2: round2,
    periodText: periodText,
    parseDate: parseDate,
    daysBetween: daysBetween,
    addMonths: addMonths,
    threeMonthDays: threeMonthDays,
    applyBrackets: applyBrackets,
    serviceDeduction: serviceDeduction,
    convertedDeduction: convertedDeduction,
    retirementTax: retirementTax,
    severance: severance,
    jobSeek: jobSeek,
    benefitDays: benefitDays,
    weekly: weekly
  };
});
