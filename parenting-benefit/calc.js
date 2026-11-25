/* ══════════════════════════════════════════════════════════════
   2026 육아휴직 급여·부모급여 통합 계산기 — 계산 엔진 (calc.js)
   - 육아휴직 급여: 고용보험법 시행령 제95조(일반), 제95조의3(부모 함께·한부모)
   - 부모급여·아동수당·첫만남이용권: 아동수당법 및 같은 법 시행령 제2조·제10조의3
   - 가정양육수당: 영유아보육법 제34조의2 및 시행령
   화면과 분리된 순수 함수만 둡니다. window.ParentBenefitCalc 로 노출합니다.
   ══════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  /* ── 육아휴직 급여 기준 (고용보험법 시행령 제95조, 2025.1.1 이후 사용분) ── */
  var LEAVE = {
    general: [
      { from: 1, to: 3, rate: 1.0, cap: 2500000 },
      { from: 4, to: 6, rate: 1.0, cap: 2000000 },
      { from: 7, to: 18, rate: 0.8, cap: 1600000 }
    ],
    // 부모 함께 육아휴직제(6+6): 공통 사용 첫 6개월의 월 상한. 지급률 100%.
    bothCaps: [2500000, 2500000, 3000000, 3500000, 4000000, 4500000],
    singleCap: 3000000,   // 한부모 첫 3개월 상한 (제95조의3제3항)
    floor: 700000,        // 모든 구간 월 하한
    maxMonths: 18,        // 부모 모두 3개월 이상 사용 시 최대 1년 6개월
    maxGeneralMonths: 12
  };

  /* ── 출산·양육 지원금 (2026년 기준) ────────────────────────── */
  var BENEFIT = {
    parent: [
      { to: 11, amount: 1000000 },   // 만 0세 월 100만원
      { to: 23, amount: 500000 }     // 만 1세 월 50만원
    ],
    daycareFee: [
      { to: 11, fee: 584000 },       // 만 0세 영유아보육료
      { to: 23, fee: 515000 }        // 만 1세 영유아보육료
    ],
    childAllowance: { months: 108, base: 100000 },   // 2026년 만 9세 미만, 월 10만원
    careAllowance: { from: 24, to: 85, amount: 100000 },  // 24~85개월 월 10만원
    firstMeeting: { first: 2000000, second: 3000000, third: 3000000 },
    regions: {
      metro: { label: "수도권", add: 0 },
      nonmetro: { label: "비수도권", add: 5000 },
      declining: { label: "인구감소지역", add: 10000 },
      decliningPlus: { label: "인구감소 특별지역", add: 20000 }
    }
  };

  /* ── 공통 도우미 ────────────────────────────────────────────── */
  function num(v, fallback) {
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : fallback;
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function ruleFor(month) {
    for (var i = 0; i < LEAVE.general.length; i++) {
      if (month >= LEAVE.general[i].from && month <= LEAVE.general[i].to) return LEAVE.general[i];
    }
    return LEAVE.general[LEAVE.general.length - 1];
  }

  /* 한 달치 급여: 지급률 × 통상임금을 상한·하한으로 자른다. */
  function monthlyPay(wage, rate, cap) {
    if (wage <= 0) return { amount: 0, capped: "none", raw: 0 };
    var raw = wage * rate;
    var amount = Math.min(cap, raw);
    var capped = "none";
    if (raw > cap) capped = "cap";
    if (amount < LEAVE.floor) {
      amount = LEAVE.floor;
      capped = "floor";
    }
    return { amount: Math.round(amount), capped: capped, raw: Math.round(raw) };
  }

  /* ── 육아휴직 급여 ─────────────────────────────────────────── */
  function calcParentalLeave(input) {
    var o = input || {};
    var wage = clamp(num(o.wage, 0), 0, 100000000);
    var months = clamp(Math.round(num(o.months, 12)), 1, LEAVE.maxMonths);
    var spouseMonths = clamp(Math.round(num(o.spouseMonths, 0)), 0, LEAVE.maxMonths);
    var household = o.household === "single" ? "single" : "both";
    var under18 = o.under18 !== false;

    // 6+6: 같은 자녀에 대해 부모가 모두 사용하고, 공통 사용 기간만큼 최대 6개월.
    var bothEligible = household === "both" && under18 && spouseMonths > 0;
    var common = bothEligible ? Math.min(months, spouseMonths, 6) : 0;

    var rows = [];
    var total = 0;
    var generalTotal = 0;
    var bands = { first3: 0, m4to6: 0, m7plus: 0 };
    var cappedCount = { cap: 0, floor: 0, none: 0 };

    for (var m = 1; m <= months; m++) {
      var rate;
      var cap;
      var special = false;

      if (household === "single" && m <= 3) {
        rate = 1.0;
        cap = LEAVE.singleCap;
        special = true;
      } else if (m <= common) {
        rate = 1.0;
        cap = LEAVE.bothCaps[m - 1];
        special = true;
      } else {
        var rule = ruleFor(m);
        rate = rule.rate;
        cap = rule.cap;
      }

      var pay = monthlyPay(wage, rate, cap);
      total += pay.amount;
      cappedCount[pay.capped] += 1;

      var g = monthlyPay(wage, ruleFor(m).rate, ruleFor(m).cap);
      generalTotal += g.amount;

      if (m <= 3) bands.first3 += pay.amount;
      else if (m <= 6) bands.m4to6 += pay.amount;
      else bands.m7plus += pay.amount;

      rows.push({
        month: m,
        rate: rate,
        cap: cap,
        special: special,
        amount: pay.amount,
        capped: pay.capped,
        cumulative: total
      });
    }

    return {
      wage: wage,
      months: months,
      spouseMonths: spouseMonths,
      household: household,
      under18: under18,
      bothEligible: bothEligible,
      common: common,
      rows: rows,
      total: total,
      generalTotal: generalTotal,
      extra: total - generalTotal,
      bands: bands,
      capped: cappedCount,
      monthlyMax: rows.length ? Math.max.apply(null, rows.map(function (r) { return r.amount; })) : 0
    };
  }

  /* ── 출산·양육 지원금 ──────────────────────────────────────── */
  function parentBenefitAt(month, childcare) {
    for (var i = 0; i < BENEFIT.parent.length; i++) {
      if (month <= BENEFIT.parent[i].to) {
        var base = BENEFIT.parent[i].amount;
        if (!childcare) return base;
        var fee = BENEFIT.daycareFee[i].fee;
        return Math.max(0, base - fee);
      }
    }
    return 0;
  }

  function careAllowanceAt(month, childcare) {
    if (childcare) return 0;
    var c = BENEFIT.careAllowance;
    return month >= c.from && month <= c.to ? c.amount : 0;
  }

  function childAllowanceAt(month, regionKey) {
    if (month >= BENEFIT.childAllowance.months) return 0;
    var region = BENEFIT.regions[regionKey] || BENEFIT.regions.metro;
    return BENEFIT.childAllowance.base + region.add;
  }

  function sumRange(from, to, fn) {
    var s = 0;
    var n = 0;
    for (var m = from; m <= to; m++) {
      var v = fn(m);
      if (v !== null) {
        s += v;
        n += 1;
      }
    }
    return { total: s, months: n };
  }

  function calcBenefits(input) {
    var o = input || {};
    var age = clamp(Math.round(num(o.ageMonths, 0)), 0, 107);
    var rank = BENEFIT.firstMeeting[o.rank] ? o.rank : "first";
    var regionKey = BENEFIT.regions[o.region] ? o.region : "metro";
    var childcare = !!o.childcare;
    var includeFirst = o.includeFirst !== false && age < 24;

    var parent = sumRange(age, BENEFIT.parent[1].to, function (m) {
      return m >= age ? parentBenefitAt(m, childcare) : null;
    });
    var child = sumRange(age, BENEFIT.childAllowance.months - 1, function (m) {
      return childAllowanceAt(m, regionKey);
    });
    var care = sumRange(age, BENEFIT.careAllowance.to, function (m) {
      return careAllowanceAt(m, childcare);
    });
    var next12 = sumRange(age, Math.min(age + 11, BENEFIT.childAllowance.months - 1), function (m) {
      return parentBenefitAt(m, childcare) + childAllowanceAt(m, regionKey) + careAllowanceAt(m, childcare);
    });
    var to2 = age <= 23
      ? sumRange(age, 23, function (m) {
        return parentBenefitAt(m, childcare) + childAllowanceAt(m, regionKey) + careAllowanceAt(m, childcare);
      }).total
      : 0;

    var first = includeFirst ? BENEFIT.firstMeeting[rank] : 0;
    var monthlyNow = parentBenefitAt(age, childcare) + childAllowanceAt(age, regionKey) + careAllowanceAt(age, childcare);

    // 연령 구간별 표 (현재 나이부터)
    var bands = [];
    var defs = [
      { from: age, to: 11, label: "0세" },
      { from: Math.max(age, 12), to: 23, label: "1세" },
      { from: Math.max(age, 24), to: 85, label: "2~7세" },
      { from: Math.max(age, 86), to: 107, label: "8~9세" }
    ];
    defs.forEach(function (d) {
      if (d.to < d.from || d.from > 107) return;
      var p = parentBenefitAt(d.from, childcare);
      var c = childAllowanceAt(d.from, regionKey);
      var a = careAllowanceAt(d.from, childcare);
      var monthsInBand = d.to - d.from + 1;
      bands.push({
        from: d.from,
        to: d.to,
        label: d.label,
        months: monthsInBand,
        parent: p,
        child: c,
        care: a,
        monthly: p + c + a,
        total: (p + c + a) * monthsInBand
      });
    });

    return {
      age: age,
      rank: rank,
      region: regionKey,
      regionLabel: BENEFIT.regions[regionKey].label,
      regionAdd: BENEFIT.regions[regionKey].add,
      childcare: childcare,
      includeFirst: includeFirst,
      parent: parent.total,
      parentMonths: parent.months,
      child: child.total,
      childMonths: child.months,
      care: care.total,
      careMonths: care.months,
      firstMeeting: first,
      total: parent.total + child.total + care.total + first,
      totalTo2: to2 + first,
      next12: next12.total,
      monthlyNow: monthlyNow,
      monthlyChild: childAllowanceAt(age, regionKey),
      bands: bands
    };
  }

  /* ── 표시용 도우미 ──────────────────────────────────────────── */
  function group(n) {
    var neg = n < 0;
    var s = String(Math.round(Math.abs(n)));
    var out = "";
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ",";
      out += s.charAt(i);
    }
    return (neg ? "-" : "") + out;
  }

  function won(v) {
    return group(v) + "원";
  }

  // 큰 금액은 만원 단위로 (예: 37,540,000 → "3,754만원", 105,000 → "10만 5,000원")
  function manwon(v) {
    var n = Math.round(v);
    var sign = n < 0 ? "-" : "";
    n = Math.abs(n);
    if (n >= 100000000) {
      var eok = Math.floor(n / 100000000);
      var eokRest = n % 100000000;
      return sign + group(eok) + (eokRest ? "억 " + manwon(eokRest) : "억원");
    }
    if (n >= 10000) {
      var man = Math.floor(n / 10000);
      var rest = n % 10000;
      return sign + group(man) + "만" + (rest ? " " + group(rest) + "원" : "원");
    }
    return sign + group(n) + "원";
  }

  // 표 안의 만원 단위 숫자 (예: 13260000 → "1,326")
  function manNum(v) {
    var m = Math.round(v / 10000 * 10) / 10;
    var s = (m % 1 === 0) ? String(m) : m.toFixed(1);
    var parts = s.split(".");
    return group(Number(parts[0])) + (parts[1] ? "." + parts[1] : "");
  }

  function percent(v, digits) {
    var d = digits === undefined ? 0 : digits;
    return (v * 100).toFixed(d) + "%";
  }

  root.ParentBenefitCalc = {
    LEAVE: LEAVE,
    BENEFIT: BENEFIT,
    calcParentalLeave: calcParentalLeave,
    calcBenefits: calcBenefits,
    parentBenefitAt: parentBenefitAt,
    childAllowanceAt: childAllowanceAt,
    careAllowanceAt: careAllowanceAt,
    ruleFor: ruleFor,
    monthlyPay: monthlyPay,
    toNumber: num,
    group: group,
    won: won,
    manwon: manwon,
    manNum: manNum,
    percent: percent
  };
})(typeof window !== "undefined" ? window : globalThis);
