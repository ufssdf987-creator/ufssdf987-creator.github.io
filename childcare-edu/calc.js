/*!
 * calc.js — 2026 보육료·유아학비·초등 늘봄·교육비 세액공제 계산
 * ------------------------------------------------------------------
 * 기준: 2026년도 보육사업안내(보건복지부), 2026학년도 유아학비 지원계획(교육부),
 *       2026년도 누리과정 부담비용 고시(교육부고시 제2026-2호),
 *       2026년 온동네 초등돌봄·교육 추진 방안(교육부),
 *       소득세법 제59조의4 제3항 및 같은 법 시행령 제118조의6(2026.10.1. 시행).
 * 화면(app.js)과 분리되어 브라우저·테스트에서 함께 씁니다.
 */
(function (global) {
  'use strict';

  var CC = {};

  /* ── 2026년 기준값 ─────────────────────────────────────── */
  CC.RULES = {
    year: 2026,
    verifiedAt: '2026-11-27',
    schoolYear: { from: '2026-03-01', to: '2027-02-28' },

    // 2026학년도(2026.3~2027.2) 반 편성 기준 출생연도
    birth: {
      0: '2025. 1. 1. 이후 출생',
      1: '2024. 1. 1. ~ 12. 31.',
      2: '2023. 1. 1. ~ 12. 31.',
      3: '2022. 1. 1. ~ 2023. 2. 28.',
      4: '2021. 1. 1. ~ 12. 31.',
      5: '2020. 1. 1. ~ 12. 31.'
    },

    // 어린이집 부모보육료(정부지원 보육료) 월 단가
    daycare: { 0: 584000, 1: 515000, 2: 426000, 3: 280000, 4: 280000, 5: 280000 },
    // 24시간(야간 12시간·24시) 보육 단가
    daycare24: { 0: 876000, 1: 772500, 2: 639000, 3: 420000, 4: 420000, 5: 420000 },
    // 인건비 미지원(민간·가정) 어린이집에 지원되는 기관보육료 (0~2세·장애아)
    agency: { 0: 693000, 1: 377000, 2: 256000 },

    nuriExtra: 50000,          // 3~5세 누리과정비 추가지원 (2026.3~2027.2)
    freeCare: 70000,           // 4~5세 무상보육 — 어린이집 기타 필요경비
    freeKinderPrivate: 110000, // 4~5세 무상교육 — 사립유치원 유아교육비
    freeKinderPublic: 20000,   // 4~5세 무상교육 — 공립유치원 방과후과정비

    kinder: { public: 100000, private: 280000 },     // 유아학비(교육과정비)
    after: { public: 50000, private: 70000 },        // 방과후 과정비
    extension: { 0: 3000, 1: 2000, 2: 2000, 3: 1000, 4: 1000, 5: 1000 }, // 연장보육 시간당
    night: { rate: 4000, cap: 240000 },              // 야간연장 시간당·월 한도
    disabled: 634000,          // 장애아 보육료(만 12세 이하)
    lowIncome: 200000,         // 사립유치원 법정저소득층 추가 지원(최대)

    // 민간·가정 어린이집 3~5세 수납한도액(부모부담 포함, 참고값)
    tuitionCap: { 3: 408000, 4: 385000, 5: 385000 },

    // 연말정산 교육비 세액공제
    edu: {
      rate: 0.15,
      cap: { preschool: 3000000, school: 3000000, college: 9000000 },
      uniform: 500000,      // 중·고교 교복 (한도 안에서)
      fieldTrip: 300000     // 현장체험학습비 (한도 안에서)
    },

    // 초등 늘봄·방과후
    elem: {
      freeGrades: [1, 2],   // 매일 2시간 무상 맞춤형 프로그램
      voucherGrade: 3,      // 2026년 초3 방과후 프로그램 이용권
      voucher: 500000,      // 연 50만원 (학기당 25만원)
      voucherTerm: 250000
    },

    localTaxRate: 0.1         // 지방소득세 = 소득세의 10%
  };

  var R = CC.RULES;

  /* ── 공통 도우미 ───────────────────────────────────────── */
  function num(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clampInt(v, lo, hi) {
    var n = Math.round(num(v, lo));
    return Math.min(hi, Math.max(lo, n));
  }
  function won0(n) { return Math.max(0, Math.round(num(n, 0))); }

  CC.birthYear = function (age) {
    return R.birth[clampInt(age, 0, 5)] || '';
  };

  CC.ageLabel = function (age) {
    var a = clampInt(age, 0, 5);
    return a === 0 ? '만 0세' : '만 ' + a + '세';
  };

  /* ══════════════ 1. 어린이집·유치원 지원금 ══════════════ */
  /**
   * input: {
   *   age: 0~5,
   *   facility: 'daycare' | 'daycare_private' | 'kinder_public' | 'kinder_private',
   *   fee: 월 원비(지원금 차감 전),
   *   extra: 그 밖에 따로 내는 비용(특별활동·차량·교재 등),
   *   useAfter: 유치원 방과후 과정 이용,
   *   extHours: 어린이집 월 연장보육 이용시간,
   *   night: 24시간(야간) 보육,
   *   lowIncome: 사립유치원 법정저소득층,
   *   disabled: 장애아 보육료 대상
   * }
   */
  CC.careSupport = function (input) {
    var d = input || {};
    var age = clampInt(d.age, 0, 5);
    var facility = d.facility || 'daycare';
    var isDaycare = facility === 'daycare' || facility === 'daycare_private';
    var isPrivateDaycare = facility === 'daycare_private';
    var isPublicKinder = facility === 'kinder_public';
    var isPrivateKinder = facility === 'kinder_private';
    var fee = won0(d.fee);
    var extra = won0(d.extra);
    var useAfter = !!d.useAfter;
    var night = !!d.night;
    var disabled = !!d.disabled;
    var lowIncome = !!d.lowIncome && isPrivateKinder;
    var extHours = num(d.extHours, 0);

    var rows = [];
    var base = 0;
    var afterFee = 0;
    var nuri = 0;
    var free = 0;
    var extSupport = 0;

    if (isDaycare) {
      if (disabled) {
        base = R.disabled;
        rows.push({ key: 'base', label: '장애아 보육료 (만 12세 이하)', value: base });
      } else if (night) {
        base = R.daycare24[age];
        rows.push({ key: 'base', label: '24시간(야간) 보육료 · ' + CC.ageLabel(age), value: base });
      } else if (isPrivateDaycare && age <= 2) {
        base = R.agency[age];
        rows.push({ key: 'base', label: '기관보육료 · ' + CC.ageLabel(age), value: base });
      } else {
        base = R.daycare[age];
        rows.push({ key: 'base', label: '부모보육료 · ' + CC.ageLabel(age), value: base });
      }

      if (age >= 3) {
        nuri = R.nuriExtra;
        rows.push({ key: 'nuri', label: '누리과정비 추가지원', value: nuri });
      }
      if (age >= 4) {
        free = R.freeCare;
        rows.push({ key: 'free', label: '무상보육 · 기타 필요경비', value: free });
      }
      if (!night && extHours > 0) {
        var rate = disabled ? R.extension[0] : R.extension[age];
        extSupport = Math.round(rate * extHours);
        rows.push({ key: 'ext', label: '연장보육료 · 시간당 ' + rate.toLocaleString('ko-KR') + '원 × ' + extHours + '시간', value: extSupport });
      }
    } else {
      base = age < 3 ? 0 : (isPrivateKinder ? R.kinder.private : R.kinder.public);
      if (base > 0) rows.push({ key: 'base', label: '유아학비(교육과정비)', value: base });

      if (base > 0 && useAfter) {
        afterFee = isPrivateKinder ? R.after.private : R.after.public;
        rows.push({ key: 'after', label: '방과후 과정비', value: afterFee });
      }
      if (base > 0) {
        nuri = R.nuriExtra;
        rows.push({ key: 'nuri', label: '누리과정비 추가지원', value: nuri });
      }

      if (base > 0 && age >= 4) {
        if (isPrivateKinder) {
          free = R.freeKinderPrivate;
          rows.push({ key: 'free', label: '무상교육 · 유아교육비', value: free });
        } else if (useAfter) {
          free = R.freeKinderPublic;
          rows.push({ key: 'free', label: '무상교육 · 방과후 과정비', value: free });
        }
      }
    }

    var countable = base + afterFee + nuri + free + extSupport;
    var lowSupport = 0;
    if (lowIncome) {
      var remaining = Math.max(0, fee + extra - countable);
      lowSupport = Math.min(R.lowIncome, remaining);
      if (lowSupport > 0) {
        rows.push({ key: 'low', label: '법정저소득층 추가 지원', value: lowSupport });
      }
    }

    var support = countable + lowSupport;
    var burden = Math.max(0, fee + extra - support);
    var rate = (fee + extra) > 0 ? support / (fee + extra) : 0;

    var notes = [];
    if (!isDaycare && age < 3) {
      notes.push('유치원 유아학비는 만 3~5세부터 지원됩니다. 만 2세 이하는 어린이집 보육료 대상입니다.');
    }
    if (isDaycare && age <= 2 && !disabled) {
      notes.push('만 0~2세는 정부지원단가 안에서 보육료가 지원되어 학부모가 내는 보육료는 0원인 경우가 많습니다. 특별활동비·교재비·차량비는 지원 대상이 아닙니다.');
    }
    if (isDaycare && age >= 3) {
      notes.push('만 3~5세 어린이집은 누리보육료 28만원에 2026년 추가지원 5만원이 붙어 월 33만원이 지원됩니다.');
    }
    if (!isDaycare && age >= 4) {
      notes.push('4~5세 무상교육은 따로 신청하지 않아도 원비에서 차감됩니다. 사립유치원 11만원, 공립유치원 방과후 2만원, 어린이집 기타 필요경비 7만원입니다.');
    }
    if (isPrivateDaycare && age <= 2) {
      notes.push('민간·가정 어린이집 만 0~2세는 기관보육료가 기관에 지원됩니다. 기관보육료보다 원비가 높으면 차액은 학부모 부담입니다.');
    }
    if (age >= 3) {
      notes.push('누리과정 무상 지원 기간은 유치원·어린이집을 합쳐 3년을 넘을 수 없습니다.');
    }

    return {
      age: age,
      facility: facility,
      isDaycare: isDaycare,
      birth: CC.birthYear(age),
      fee: fee,
      extra: extra,
      totalFee: fee + extra,
      rows: rows,
      base: base,
      after: afterFee,
      nuri: nuri,
      free: free,
      extension: extSupport,
      lowIncome: lowSupport,
      support: support,
      burden: burden,
      monthlySaving: support,
      annualSupport: support * 12,
      annualBurden: burden * 12,
      supportRate: rate,
      notes: notes
    };
  };

  /* ══════════════ 2. 초등 늘봄·방과후 ══════════════ */
  /**
   * input: { grade: 1~6, fee: 월 방과후 수강료, months: 수강 개월, care: 돌봄교실 이용 }
   */
  CC.elemSupport = function (input) {
    var d = input || {};
    var grade = clampInt(d.grade, 1, 6);
    var fee = won0(d.fee);
    var months = Math.min(12, Math.max(0, Math.round(num(d.months, 12))));
    var annualFee = fee * months;
    var care = !!d.care;

    var rows = [];
    var support = 0;
    var freeProgram = R.elem.freeGrades.indexOf(grade) >= 0;

    if (freeProgram) {
      rows.push({ key: 'free', label: '맞춤형 프로그램 (매일 2시간)', value: 0, note: '현금 지원 아님 · 무상 수강' });
      rows.push({ key: 'afterschool', label: '방과후학교 수강료', value: annualFee, note: '본인 부담' });
    } else if (grade === R.elem.voucherGrade) {
      support = Math.min(annualFee, R.elem.voucher);
      rows.push({ key: 'voucher', label: '방과후 프로그램 이용권 (연 50만원)', value: support });
      if (annualFee > support) {
        rows.push({ key: 'self', label: '이용권 초과분 · 본인 부담', value: annualFee - support });
      }
    } else {
      rows.push({ key: 'afterschool', label: '방과후학교 수강료', value: annualFee, note: '본인 부담' });
    }

    if (care) {
      rows.push({ key: 'care', label: '선택형 돌봄(늘봄교실)', value: 0, note: '무상 · 급·간식비는 별도' });
    }

    var paid = Math.max(0, annualFee - support);
    var credit = Math.round(paid * R.edu.rate);
    var termCap = R.elem.voucherTerm;
    var firstTermSupport = Math.min(support, termCap);

    return {
      grade: grade,
      fee: fee,
      months: months,
      annualFee: annualFee,
      support: support,
      paid: paid,
      monthlyPaid: months > 0 ? Math.round(paid / months) : 0,
      monthlySupport: months > 0 ? Math.round(support / months) : 0,
      credit: credit,
      freeProgram: freeProgram,
      care: care,
      voucher: grade === R.elem.voucherGrade,
      firstTermSupport: firstTermSupport,
      secondTermSupport: Math.max(0, support - firstTermSupport),
      rows: rows
    };
  };

  /* ══════════════ 3. 교육비 세액공제 ══════════════ */
  /**
   * input: {
   *   tax: 올해 산출세액,
   *   members: [{ type: 'none'|'preschool'|'school'|'college'|'self'|'disabled', amount }]
   * }
   */
  CC.eduCredit = function (input) {
    var d = input || {};
    var tax = won0(d.tax);
    var members = Array.isArray(d.members) ? d.members : [];
    var rate = R.edu.rate;
    var rows = [];
    var totalEligible = 0;
    var credit = 0;
    var typeLabel = {
      preschool: '취학 전 아동',
      school: '초·중·고등학생',
      college: '대학생',
      self: '본인',
      disabled: '장애인 특수교육비'
    };

    members.forEach(function (m, i) {
      var type = m && m.type ? m.type : 'none';
      if (type === 'none' || !typeLabel[type]) return;
      var amount = won0(m.amount);
      var cap = R.edu.cap[type] || Infinity;
      var eligible = Math.min(amount, cap);
      var memberCredit = Math.round(eligible * rate);
      totalEligible += eligible;
      credit += memberCredit;
      rows.push({
        key: 'm' + i,
        label: typeLabel[type] + (members.length > 1 ? ' ' + (i + 1) : ''),
        type: type,
        amount: amount,
        cap: cap,
        eligible: eligible,
        over: Math.max(0, amount - eligible),
        credit: memberCredit,
        left: cap === Infinity ? Infinity : Math.max(0, cap - amount)
      });
    });

    var applied = Math.min(credit, tax);
    var lost = Math.max(0, credit - applied);
    var localTax = Math.round(applied * R.localTaxRate);
    var saved = applied + localTax;

    var capped = rows.filter(function (r) { return r.over > 0; });
    var leftTotal = rows.reduce(function (acc, r) {
      return acc + (r.cap === Infinity ? 0 : Math.max(0, r.cap - r.amount));
    }, 0);

    return {
      rows: rows,
      totalEligible: totalEligible,
      credit: credit,
      applied: applied,
      lost: lost,
      localTax: localTax,
      saved: saved,
      tax: tax,
      capped: capped,
      leftTotal: leftTotal,
      rate: rate,
      taxEnough: lost === 0
    };
  };

  /* ══════════════ 4. 비교 표용 ══════════════ */
  CC.careScale = function (base) {
    var d = base || {};
    var list = [];
    [0, 1, 2, 3, 4, 5].forEach(function (age) {
      var r = CC.careSupport({
        age: age,
        facility: d.facility || 'daycare',
        fee: 0,
        extra: 0,
        useAfter: !!d.useAfter
      });
      list.push({ age: age, label: CC.ageLabel(age), support: r.support });
    });
    return list;
  };

  CC.eduScale = function (tax) {
    var steps = [1000000, 2000000, 3000000, 4000000, 5000000, 7000000, 9000000];
    return steps.map(function (amount) {
      var r = CC.eduCredit({ tax: won0(tax) || 1200000, members: [{ type: 'preschool', amount: amount }] });
      return { amount: amount, credit: r.credit, saved: r.saved, applied: r.applied };
    });
  };

  CC.LIMITS = {
    age: { min: 0, max: 5 },
    fee: { min: 0, max: 2000000 },
    extra: { min: 0, max: 1000000 },
    hours: { min: 0, max: 120 },
    grade: { min: 1, max: 6 },
    months: { min: 0, max: 12 },
    amount: { min: 0, max: 30000000 },
    tax: { min: 0, max: 200000000 }
  };

  CC.util = { num: num, clampInt: clampInt, won0: won0 };

  global.CCCalc = CC;
})(typeof window !== 'undefined' ? window : this);
