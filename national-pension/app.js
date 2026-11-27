/*!
 * app.js — 2026 국민연금·기초연금 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.NPCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'np.state.v1';
  var THEME_KEY = 'ctx.theme';
  var TABS = ['expect', 'timing', 'basic', 'guide'];
  var L = S.LIMITS;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function won(n) { return nf.format(Math.round(n || 0)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /** 137만 3,210원처럼 읽기 쉽게 */
  function wonShort(v) {
    var n = Math.round(Math.abs(v));
    var sign = v < 0 ? '-' : '';
    if (n >= 100000000) {
      var eok = Math.floor(n / 100000000);
      var man = Math.round((n % 100000000) / 10000);
      return sign + eok + '억' + (man ? ' ' + nf.format(man) + '만' : '') + '원';
    }
    if (n >= 10000) {
      var m = Math.floor(n / 10000);
      var rest = Math.round(n % 10000);
      if (rest === 0) return sign + nf.format(m) + '만원';
      return sign + nf.format(m) + '만 ' + nf.format(rest) + '원';
    }
    return sign + nf.format(n) + '원';
  }

  function pct(v, digits) {
    var d = digits == null ? 1 : digits;
    var s = (Number(v) * 100).toFixed(d).replace(/\.0+$/, '');
    return s + '%';
  }

  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'expect',
    expect: {
      years: 20, income: 3000000, birth: 1970,
      spouse: false, others: 0
    },
    timing: { compare: 80 },
    basic: {
      couple: false, dual: false, region: 'metro',
      labor: 0, laborSpouse: 0, interest: 0, nps: 0,
      real: 0, fin: 0, debt: 0
    },
    checks: {}
  };

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    function take(target, source, spec) {
      if (!source || typeof source !== 'object') return;
      spec.forEach(function (pair) {
        var v = parseFloat(source[pair[0]]);
        if (isFinite(v)) target[pair[0]] = clamp(v, pair[1].min, pair[1].max);
      });
    }

    take(state.expect, raw.expect, [
      ['years', L.years], ['income', L.income], ['birth', L.birthYear], ['others', L.others]
    ]);
    if (raw.expect && typeof raw.expect === 'object') state.expect.spouse = !!raw.expect.spouse;

    take(state.timing, raw.timing, [['compare', { min: 70, max: 95 }]]);

    take(state.basic, raw.basic, [
      ['labor', L.labor], ['laborSpouse', L.labor], ['interest', { min: 0, max: 10000000 }],
      ['nps', { min: 0, max: 10000000 }],
      ['real', L.money], ['fin', L.money], ['debt', L.money]
    ]);
    if (raw.basic && typeof raw.basic === 'object') {
      state.basic.couple = !!raw.basic.couple;
      state.basic.dual = !!raw.basic.dual;
      if (['metro', 'city', 'rural'].indexOf(raw.basic.region) >= 0) state.basic.region = raw.basic.region;
    }

    if (raw.checks && typeof raw.checks === 'object') {
      Object.keys(raw.checks).forEach(function (key) {
        if (raw.checks[key]) state.checks[key] = true;
      });
    }
    if (TABS.indexOf(raw.tab) >= 0) state.tab = raw.tab;
  }

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }

  var saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 180);
  }

  /* ── 엘리먼트 ─────────────────────────────────────────── */
  var el = {};
  function cacheEls() {
    el.tabExpect = $('#tabExpect');
    el.tabTiming = $('#tabTiming');
    el.tabBasic = $('#tabBasic');
    el.tabGuide = $('#tabGuide');
    el.panelExpect = $('#panelExpect');
    el.panelTiming = $('#panelTiming');
    el.panelBasic = $('#panelBasic');
    el.panelGuide = $('#panelGuide');

    /* 탭 1 */
    el.exYears = $('#exYears');
    el.exYearsBadge = $('#exYearsBadge');
    el.exIncome = $('#exIncome');
    el.exIncomeBadge = $('#exIncomeBadge');
    el.exBirth = $('#exBirth');
    el.exBirthBadge = $('#exBirthBadge');
    el.exDepGroup = $('#exDepGroup');
    el.exDepBadge = $('#exDepBadge');
    el.exTotal = $('#exTotal');
    el.exSub = $('#exSub');
    el.exVerdict = $('#exVerdict');
    el.exRows = $('#exRows');
    el.exStatAnnual = $('#exStatAnnual');
    el.exStatRate = $('#exStatRate');
    el.exStatPayout = $('#exStatPayout');
    el.exStatPaid = $('#exStatPaid');
    el.exElig = $('#exElig');
    el.exNext = $('#exNext');
    el.exInsight = $('#exInsight');
    el.exScaleBody = $('#exScaleTable tbody');
    el.exShare = $('#exShare');

    /* 탭 2 */
    el.tmCompare = $('#tmCompare');
    el.tmCompareBadge = $('#tmCompareBadge');
    el.tmHeadline = $('#tmHeadline');
    el.tmSub = $('#tmSub');
    el.tmVerdict = $('#tmVerdict');
    el.tmRows = $('#tmRows');
    el.tmStatEarly = $('#tmStatEarly');
    el.tmStatDefer = $('#tmStatDefer');
    el.tmTableHint = $('#tmTableHint');
    el.tmCumHead = $('#tmCumHead');
    el.tmBody = $('#tmTable tbody');
    el.tmElig = $('#tmElig');
    el.tmInsight = $('#tmInsight');
    el.tmShare = $('#tmShare');

    /* 탭 3 */
    el.bpCoupleGroup = $('#bpCoupleGroup');
    el.bpDualGroup = $('#bpDualGroup');
    el.bpRegionGroup = $('#bpRegionGroup');
    el.bpLabor = $('#bpLabor');
    el.bpLaborBadge = $('#bpLaborBadge');
    el.bpLaborSpouseField = $('#bpLaborSpouseField');
    el.bpLaborSpouse = $('#bpLaborSpouse');
    el.bpLaborSpouseBadge = $('#bpLaborSpouseBadge');
    el.bpInterest = $('#bpInterest');
    el.bpInterestBadge = $('#bpInterestBadge');
    el.bpNps = $('#bpNps');
    el.bpNpsBadge = $('#bpNpsBadge');
    el.bpReal = $('#bpReal');
    el.bpRealBadge = $('#bpRealBadge');
    el.bpFin = $('#bpFin');
    el.bpFinBadge = $('#bpFinBadge');
    el.bpDebt = $('#bpDebt');
    el.bpDebtBadge = $('#bpDebtBadge');
    el.bpTotal = $('#bpTotal');
    el.bpSub = $('#bpSub');
    el.bpVerdict = $('#bpVerdict');
    el.bpRows = $('#bpRows');
    el.bpStatIncome = $('#bpStatIncome');
    el.bpStatLimit = $('#bpStatLimit');
    el.bpStatAsset = $('#bpStatAsset');
    el.bpStatHouse = $('#bpStatHouse');
    el.bpElig = $('#bpElig');
    el.bpInsight = $('#bpInsight');
    el.bpShare = $('#bpShare');

    /* 탭 4 */
    el.gdBar = $('#gdBar');
    el.gdCount = $('#gdCount');
    el.gdList = $('#gdList');
    el.gdReset = $('#gdReset');

    el.promoSection = $('#promoSection');
    el.promoHeading = $('#promoHeading');
    el.promoSub = $('#promoSub');
    el.promoList = $('#promoList');
    el.promoDisclosure = $('#promoDisclosure');
    el.footerDisclosure = $('#footerDisclosure');
    el.appVersion = $('#appVersion');
    el.toast = $('#toast');
    el.installBtn = $('#installBtn');
    el.themeBtn = $('#themeBtn');
    el.themeIcon = $('#themeIcon');
  }

  /* ── 탭 전환 ─────────────────────────────────────────── */
  function setTab(tab) {
    state.tab = tab;
    var map = {
      expect: [el.tabExpect, el.panelExpect],
      timing: [el.tabTiming, el.panelTiming],
      basic: [el.tabBasic, el.panelBasic],
      guide: [el.tabGuide, el.panelGuide]
    };
    TABS.forEach(function (key) {
      var pair = map[key];
      var active = key === tab;
      pair[0].classList.toggle('is-active', active);
      pair[0].setAttribute('aria-selected', active ? 'true' : 'false');
      pair[0].tabIndex = active ? 0 : -1;
      pair[1].classList.toggle('is-active', active);
      pair[1].hidden = !active;
    });
    persist();
  }

  /* ── 공통 UI ─────────────────────────────────────────── */
  function row(label, value, small, cls) {
    return '<div class="bd-row' + (cls ? ' ' + cls : '') + '">' +
      '<span class="bd-label">' + label + (small ? '<small>' + small + '</small>' : '') + '</span>' +
      '<span class="bd-value">' + value + '</span></div>';
  }

  function setInsight(node, html, tone) {
    node.className = 'insight' + (tone ? ' ' + tone : '');
    node.innerHTML = html;
  }

  function setBadge(node, text, tier) {
    node.textContent = text;
    node.setAttribute('data-tier', String(tier));
  }

  function renderElig(node, reasons) {
    node.innerHTML = reasons.map(function (r) {
      return '<div class="elig-item ' + (r.ok ? 'is-pass' : 'is-fail') + '">' +
        '<span class="elig-mark" aria-hidden="true">' + (r.ok ? '✓' : '!') + '</span>' +
        '<span class="elig-body"><span class="elig-name">' + r.label + '</span>' +
        '<span class="elig-note">' + r.note + '</span></span></div>';
    }).join('');
  }

  function syncGroup(group, attr, value) {
    if (!group) return;
    $$('[data-' + attr + ']', group).forEach(function (btn) {
      var on = btn.getAttribute('data-' + attr) === String(value);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function bindGroup(group, attr, onPick) {
    if (!group) return;
    group.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-' + attr + ']');
      if (!btn || !group.contains(btn)) return;
      onPick(btn.getAttribute('data-' + attr));
    });
  }

  /* ══════════════ 탭 1: 예상수령액 ══════════════ */
  function syncDepChips() {
    var e = state.expect;
    $$('[data-dep]', el.exDepGroup).forEach(function (btn) {
      var key = btn.getAttribute('data-dep');
      var on = key === 'spouse' ? e.spouse : e.others === parseInt(key.replace('other', ''), 10);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function calcExpected() {
    var e = state.expect;
    return S.expected({
      years: e.years, avgIncome: e.income, birthYear: e.birth,
      spouse: e.spouse, others: e.others
    });
  }

  function renderExpect() {
    var e = state.expect;
    var exp = calcExpected();

    el.exYearsBadge.textContent = e.years + '년';
    el.exIncomeBadge.textContent = wonShort(e.income);
    el.exBirthBadge.textContent = exp.claimAge + '세 수급';
    el.exDepBadge.textContent = exp.dependentTotal > 0 ? '월 ' + won(exp.dependentTotal) + '원' : '월 0원';
    syncDepChips();

    el.exTotal.textContent = won(exp.monthly);
    el.exSub.textContent = '가입기간 ' + e.years + '년 · 개시 ' + exp.claimAge + '세 · ' +
      (exp.capped ? '평균 기준소득월액 상한 반영' : '기본연금액 기준');

    var rows = [];
    rows.push(row('기본연금액(월)', won(exp.basic) + '원',
      '연 ' + wonShort(exp.annualBase) + ' × 지급률 ' + pct(exp.payoutRate, 0)));
    rows.push(row('A값 + 평균소득(월)', wonShort(S.RULES.aValue + exp.avgIncome),
      '연금액 산정 기준 (A값 ' + wonShort(S.RULES.aValue) + ')'));
    if (exp.dependentTotal > 0) {
      rows.push(row('부양가족연금(월)', won(exp.dependentTotal) + '원',
        (e.spouse ? '배우자 25,550원 ' : '') + (e.others > 0 ? '자녀·부모 17,030원 × ' + e.others : '')));
    }
    el.exRows.innerHTML = rows.join('');

    el.exStatAnnual.textContent = wonShort(exp.annual);
    el.exStatRate.textContent = pct(exp.replacementRate, 1);
    el.exStatPayout.textContent = pct(exp.payoutRate, 0);
    el.exStatPaid.textContent = wonShort(exp.totalPaid);

    var elig = [];
    elig.push({
      ok: e.years >= 10,
      label: e.years >= 10
        ? '가입기간 ' + e.years + '년 — 노령연금 수급 자격이 있습니다'
        : '가입기간 10년 미만 — 노령연금 자격이 없습니다',
      note: e.years >= 10
        ? '지급률 ' + pct(exp.payoutRate, 0) + ' · 본인 납입 보험료 ' + wonShort(exp.totalPaid) + '은 ' + exp.recoupMonths + '개월 수령으로 회수'
        : '60세에 반환일시금 선택 가능 · 임의가입·추납(최대 5년)으로 가입기간을 채울 수 있습니다'
    });
    if (e.years < 20 && e.years >= 10) {
      elig.push({
        ok: false,
        label: '20년 미만 지급률 ' + pct(exp.payoutRate, 0),
        note: '10년 50%에서 1년에 5%p씩 올라 20년에 100%가 됩니다. 60~65세 임의계속가입으로 채울 수 있습니다.'
      });
    }
    if (exp.capped) {
      elig.push({
        ok: false,
        label: '월 연금액 상한 적용',
        note: '월 연금액은 평균 기준소득월액(' + wonShort(exp.avgIncome) + ')을 넘을 수 없습니다(법 제53조).'
      });
    }
    renderElig(el.exElig, elig);

    el.exNext.textContent = e.years < 10
      ? '임의가입·추납(최대 5년)으로 가입기간을 채운 뒤 노령연금을 청구할 수 있습니다. 60세 도달 시 반환일시금 선택도 가능합니다.'
      : '조기(연 6% 감액)와 연기(연 7.2% 증액) 비교는 조기·연기 탭에서 확인하세요. 청구는 개시연령 생일이 속한 달부터 가능하고 소급되지 않습니다.';

    if (e.years >= 10) {
      var next = S.expected({
        years: Math.min(40, e.years + 1), avgIncome: e.income, birthYear: e.birth,
        spouse: e.spouse, others: e.others
      });
      setInsight(el.exInsight,
        '같은 조건으로 1년 더 가입하면 월 <strong>' + won(next.monthly - exp.monthly) + '원</strong>이 늘어납니다. ' +
        '40년 평균소득자는 월 약 137만원(소득대체율 43%)입니다.');
    } else {
      setInsight(el.exInsight,
        '10년을 채우면 같은 소득 기준 월 <strong>' + won(S.expected({
          years: 10, avgIncome: e.income, birthYear: e.birth, spouse: e.spouse, others: e.others
        }).basic) + '원</strong>부터 받을 수 있습니다.', 'is-ok');
    }

    var tbody = el.exScaleBody;
    tbody.innerHTML = '';
    [10, 15, 20, 25, 30, 35, 40].forEach(function (y) {
      var r = S.expected({ years: y, avgIncome: e.income, birthYear: e.birth });
      var tr = document.createElement('tr');
      tr.innerHTML = '<th scope="row">' + y + '년</th><td>' + won(r.monthly) + '원</td><td>' +
        wonShort(r.annual) + '</td><td>' + pct(r.replacementRate, 1) + '</td>';
      tbody.appendChild(tr);
    });

    setBadge(el.exVerdict, e.years >= 20 ? '20년 이상' : (e.years >= 10 ? '10년 이상' : '자격 미달'),
      e.years >= 20 ? 1 : (e.years >= 10 ? 2 : 3));
  }

  /* ══════════════ 탭 2: 조기·연기 ══════════════ */
  function renderTiming() {
    var e = state.expect;
    var t = state.timing;
    var sc = S.scenarios({ years: e.years, avgIncome: e.income, birthYear: e.birth }, t.compare);
    var normal = null;
    sc.rows.forEach(function (r) { if (r.isNormal) normal = r; });

    el.tmCompareBadge.textContent = t.compare + '세';
    el.tmTableHint.textContent = t.compare + '세까지 누적';
    el.tmCumHead.textContent = t.compare + '세까지 누적';

    var best = sc.rows.reduce(function (a, b) { return b.cumulative > a.cumulative ? b : a; });
    el.tmHeadline.textContent = won(best.monthly);
    el.tmSub.textContent = '누적 최다 개시 시점은 ' + best.startAge + '세(' + wonShort(best.cumulative) +
      '), 정상 개시 ' + sc.claimAge + '세는 월 ' + won(normal.monthly) + '원';

    var earlyStart = Math.max(60, sc.claimAge - 5);
    var beEarly = earlyStart < sc.claimAge ? S.breakEven(sc.claimAge, earlyStart - sc.claimAge) : null;
    var beDefer = S.breakEven(sc.claimAge, 5);
    el.tmStatEarly.textContent = beEarly ? beEarly + '세' : '-';
    el.tmStatDefer.textContent = beDefer + '세';

    var rows = [];
    rows.push(row('조기 5년(' + earlyStart + '세 개시)', won(S.scenarioMonthly(sc.base, earlyStart, sc.claimAge).monthly) + '원',
      '감액 30% · 누적 역전 ' + (beEarly ? beEarly + '세' : '-')));
    rows.push(row('정상(' + sc.claimAge + '세 개시)', won(normal.monthly) + '원', '감액·증액 없음', 'total'));
    rows.push(row('연기 5년(' + (sc.claimAge + 5) + '세 개시)', won(S.scenarioMonthly(sc.base, sc.claimAge + 5, sc.claimAge).monthly) + '원',
      '증액 36% · 누적 역전 ' + beDefer + '세'));
    el.tmRows.innerHTML = rows.join('');

    var tbody = el.tmBody;
    tbody.innerHTML = '';
    sc.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      var diffTxt = r.isNormal ? '기준' : ((r.factor > 1 ? '+' : '') + pct(r.factor - 1, 1));
      var tag = r.maxEarly ? ' · 최대 조기' : (r.maxDefer ? ' · 최대 연기' : '');
      tr.innerHTML = '<th scope="row">' + r.startAge + '세' + (r.isNormal ? ' · 정상' : tag) +
        '</th><td>' + won(r.monthly) + '원</td><td>' + diffTxt + '</td><td>' +
        won(r.cumulative) + '원</td>';
      tbody.appendChild(tr);
    });

    renderElig(el.tmElig, [
      { ok: true, label: '출생연도 ' + e.birth + '년생 수급연령 ' + sc.claimAge + '세', note: '조기 가능 나이 ' + earlyStart + '세 · 연기 종료 ' + (sc.claimAge + 5) + '세' },
      { ok: true, label: '조기요건 — 60세 도달 시 월평균 소득금액 A값 이하', note: 'A값 3,193,511원 · 초과하면 조기노령연금을 받을 수 없습니다' },
      { ok: true, label: '소득 감액 — 수급 개시 후 5년간 월소득 5,193,511원(A값+200만원) 이상', note: '그 기간은 연금이 감액되고 부양가족연금도 지급되지 않습니다' }
    ]);

    setInsight(el.tmInsight,
      '누적으로 보면 조기 5년은 <strong>' + (beEarly || '-') + '세</strong>에 정상수령을 앞지르고, 연기 5년은 <strong>' +
      beDefer + '세</strong>에 역전합니다. ' + t.compare + '세까지의 누적 최다 개시 시점은 <strong>' + best.startAge + '세</strong>입니다.');

    setBadge(el.tmVerdict, best.startAge + '세 개시 유리',
      best.yearsDeferred > 0 ? 1 : (best.startAge === sc.claimAge ? 2 : 2));
  }

  /* ══════════════ 탭 3: 기초연금 ══════════════ */
  function renderBasic() {
    var b = state.basic;
    var r = S.basicPension({
      couple: b.couple, dual: b.dual, region: b.region,
      labor: b.labor, laborSpouse: b.laborSpouse, interest: b.interest, nps: b.nps,
      realAsset: b.real, finAsset: b.fin, debt: b.debt
    });

    syncGroup(el.bpCoupleGroup, 'couple', b.couple ? 'couple' : 'single');
    el.bpDualGroup.hidden = !b.couple;
    syncGroup(el.bpDualGroup, 'dual', b.dual ? 'both' : 'one');
    syncGroup(el.bpRegionGroup, 'region', b.region);
    el.bpLaborSpouseField.hidden = !b.couple || !b.dual;

    el.bpLaborBadge.textContent = wonShort(b.labor);
    el.bpLaborSpouseBadge.textContent = wonShort(b.laborSpouse);
    el.bpInterestBadge.textContent = wonShort(b.interest);
    el.bpNpsBadge.textContent = wonShort(b.nps);
    el.bpRealBadge.textContent = wonShort(b.real);
    el.bpFinBadge.textContent = wonShort(b.fin);
    el.bpDebtBadge.textContent = wonShort(b.debt);

    el.bpTotal.textContent = won(r.householdAmount);
    el.bpSub.textContent = r.eligible
      ? (r.dual ? '부부 2인 수급 · 1인당 ' + won(r.selfAmount) + '원' : (r.couple ? '부부가구 1인 수급' : '단독가구'))
      : '소득인정액이 선정기준액을 넘었습니다';

    var rows = r.rows.map(function (row2) {
      return row(row2.label, won(row2.value) + '원', row2.note);
    });
    rows.push(row('소득인정액(월)', won(r.incomeRecognized) + '원',
      '선정기준액 ' + wonShort(r.selectLimit) + (r.eligible ? ' 이하 · 수급 가능' : ' 초과 ' + wonShort(r.over)), 'total'));
    el.bpRows.innerHTML = rows.join('');

    el.bpStatIncome.textContent = won(r.incomeRecognized) + '원';
    el.bpStatLimit.textContent = won(r.selectLimit) + '원';
    el.bpStatAsset.textContent = won(r.assetMonthly) + '원';
    el.bpStatHouse.textContent = won(r.householdAmount) + '원';

    var elig = [{
      ok: r.eligible,
      label: r.eligible
        ? '소득인정액이 선정기준액 이하 — 기초연금 수급 대상'
        : '선정기준액을 ' + wonShort(r.over) + ' 넘었습니다',
      note: r.eligible
        ? (r.dual ? '부부 2인 수급은 각 20% 감액 — 1인당 279,760원' : '무소득 단독가구 기준연금액은 월 349,700원')
        : '재산·소득을 정리하면 달라질 수 있습니다. 부부가구는 배우자 소득·재산도 함께 봅니다'
    }];
    if (b.nps > 0) {
      elig.push({
        ok: b.nps <= 524550,
        label: '국민연금 월 ' + wonShort(b.nps) + ' 수령',
        note: b.nps <= 349700
          ? '기준연금액(349,700원) 이하라 소득인정액에서 제외됩니다'
          : (b.nps <= 524550 ? '기준연금액의 150%(524,550원) 이하 — 기초연금 전액 유지' : '기준연금액의 150% 초과 — 소득재분배급여금액에 따라 감액, 최저 174,850원')
      });
    }
    renderElig(el.bpElig, elig);

    setInsight(el.bpInsight, r.notes[0] || '');
    setBadge(el.bpVerdict, r.eligible ? (r.dual ? '2인 수급' : '수급 가능') : '기준 초과',
      r.eligible ? (r.dual ? 1 : 2) : 3);
  }

  /* ══════════════ 탭 4: 체크리스트 ══════════════ */
  function renderGuide() {
    var boxes = $$('input[type="checkbox"]', el.gdList);
    var done = boxes.filter(function (b) { return b.checked; }).length;
    el.gdCount.textContent = done + ' / ' + boxes.length;
    el.gdBar.style.width = (boxes.length ? (done / boxes.length) * 100 : 0) + '%';
  }

  /* ── 이벤트 ─────────────────────────────────────────── */
  function bindAll() {
    el.tabExpect.addEventListener('click', function () { setTab('expect'); });
    el.tabTiming.addEventListener('click', function () { setTab('timing'); });
    el.tabBasic.addEventListener('click', function () { setTab('basic'); });
    el.tabGuide.addEventListener('click', function () { setTab('guide'); });

    function refreshApplicant() {
      renderExpect();
      renderTiming();
      saveState();
    }

    el.exYears.addEventListener('input', function () {
      state.expect.years = readNum(el.exYears, 20, L.years.min, L.years.max);
      refreshApplicant();
    });
    el.exIncome.addEventListener('input', function () {
      state.expect.income = readNum(el.exIncome, 3000000, L.income.min, L.income.max);
      refreshApplicant();
    });
    el.exBirth.addEventListener('input', function () {
      state.expect.birth = clamp(readNum(el.exBirth, 1970, L.birthYear.min, L.birthYear.max), L.birthYear.min, L.birthYear.max);
      refreshApplicant();
    });
    el.exDepGroup.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-dep]');
      if (!btn || !el.exDepGroup.contains(btn)) return;
      var key = btn.getAttribute('data-dep');
      if (key === 'spouse') {
        state.expect.spouse = !state.expect.spouse;
      } else {
        var n = parseInt(key.replace('other', ''), 10) || 0;
        state.expect.others = state.expect.others === n ? 0 : n;
      }
      refreshApplicant();
    });

    el.tmCompare.addEventListener('input', function () {
      state.timing.compare = clamp(readNum(el.tmCompare, 80, 70, 95), 70, 95);
      renderTiming();
      saveState();
    });

    bindGroup(el.bpCoupleGroup, 'couple', function (v) {
      state.basic.couple = v === 'couple';
      if (!state.basic.couple) state.basic.dual = false;
      renderBasic();
      saveState();
    });
    bindGroup(el.bpDualGroup, 'dual', function (v) {
      state.basic.dual = v === 'both';
      renderBasic();
      saveState();
    });
    bindGroup(el.bpRegionGroup, 'region', function (v) {
      state.basic.region = v;
      renderBasic();
      saveState();
    });
    ['bpLabor', 'bpLaborSpouse', 'bpInterest', 'bpNps', 'bpReal', 'bpFin', 'bpDebt'].forEach(function (id) {
      var key = {
        bpLabor: 'labor', bpLaborSpouse: 'laborSpouse', bpInterest: 'interest',
        bpNps: 'nps', bpReal: 'real', bpFin: 'fin', bpDebt: 'debt'
      }[id];
      el[id].addEventListener('input', function () {
        var spec = (id === 'bpInterest' || id === 'bpNps') ? { min: 0, max: 10000000 }
          : (id === 'bpLabor' || id === 'bpLaborSpouse') ? L.labor : L.money;
        state.basic[key] = readNum(el[id], 0, spec.min, spec.max);
        renderBasic();
        saveState();
      });
    });

    el.gdList.addEventListener('change', function (ev) {
      var box = ev.target;
      if (box.type !== 'checkbox') return;
      var key = box.getAttribute('data-check');
      if (!key) return;
      if (box.checked) state.checks[key] = true; else delete state.checks[key];
      renderGuide();
      saveState();
    });
    el.gdReset.addEventListener('click', function () {
      state.checks = {};
      $$('input[type="checkbox"]', el.gdList).forEach(function (b) { b.checked = false; });
      renderGuide();
      saveState();
    });

    el.exShare.addEventListener('click', function () {
      var exp = calcExpected();
      var text = '[국민연금 예상수령액 2026]\n가입기간 ' + state.expect.years + '년 · 평균소득 ' + wonShort(exp.avgIncome) +
        '\n월 예상 ' + won(exp.monthly) + '원 (연 ' + wonShort(exp.annual) + ')\n소득대체율 ' + pct(exp.replacementRate) +
        ' · 개시 ' + exp.claimAge + '세\n→ 국민연금·기초연금 계산기 ' + CFG.siteUrl;
      copyText(text);
    });
    el.tmShare.addEventListener('click', function () {
      var sc = S.scenarios(state.expect, state.timing.compare);
      var beEarly = S.breakEven(sc.claimAge, -5);
      var beDefer = S.breakEven(sc.claimAge, 5);
      var text = '[조기·연기 국민연금 비교 2026]\n수급연령 ' + sc.claimAge + '세 · 정상 월 ' + won(sc.base) + '원' +
        '\n조기 5년: 월 ' + won(sc.base * 0.7) + '원 (누적 역전 ' + beEarly + '세)' +
        '\n연기 5년: 월 ' + won(sc.base * 1.36) + '원 (누적 역전 ' + beDefer + '세)' +
        '\n→ 국민연금·기초연금 계산기 ' + CFG.siteUrl;
      copyText(text);
    });
    el.bpShare.addEventListener('click', function () {
      var r = S.basicPension(state.basic);
      var text = '[기초연금 모의계산 2026]\n' + (r.couple ? '부부가구' : '단독가구') +
        ' · 소득인정액 월 ' + won(r.incomeRecognized) + ' / 선정기준액 ' + wonShort(r.selectLimit) +
        '\n' + (r.eligible ? '예상 기초연금 월 ' + won(r.householdAmount) + '원' : '선정기준액 ' + wonShort(r.over) + ' 초과') +
        '\n→ 국민연금·기초연금 계산기 ' + CFG.siteUrl;
      copyText(text);
    });
  }

  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('is-visible'); }, 2200);
  }

  function copyText(text) {
    function done() { toast('복사했습니다.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('복사에 실패했습니다.'); }
    document.body.removeChild(ta);
  }

  /* ── 테마·설치·프로모션 ─────────────────────────────────── */
  function bindTheme() {
    function apply() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      el.themeIcon.textContent = dark ? '☀️' : '🌙';
    }
    el.themeBtn.addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 무시 */ }
      apply();
    });
    apply();
  }

  function bindInstall() {
    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      deferred = ev;
      el.installBtn.hidden = false;
    });
    el.installBtn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () {
        deferred = null;
        el.installBtn.hidden = true;
      });
    });
  }

  function renderPromo() {
    var c = CFG.coupang;
    if (!c || !c.items || !c.items.length) return;
    var items = c.items.filter(function (it) { return it && it.url; });
    if (!items.length) return;

    el.promoSection.hidden = false;
    el.promoHeading.textContent = c.heading || '';
    el.promoSub.textContent = c.subheading || '';
    el.promoList.innerHTML = items.map(function (it) {
      return '<div class="promo-item">' +
        '<span class="promo-thumb" aria-hidden="true">' + (it.emoji || '🛍️') + '</span>' +
        '<div class="promo-body">' +
        '<p class="promo-name">' + it.name + '</p>' +
        '<p class="promo-meta">' + (it.tag || '') + '</p>' +
        '</div>' +
        '<a class="promo-cta" href="' + it.url + '" target="_blank" rel="sponsored nofollow noopener">' +
        (it.cta || '쿠팡에서 보기') + '</a></div>';
    }).join('');
    el.promoDisclosure.textContent = '「' + (c.disclosure || '') + '」 구매 전 옵션·가격·재고를 확인하세요.';
    el.footerDisclosure.hidden = false;
    el.footerDisclosure.textContent = c.disclosure || '';
  }

  /* ── 초기화 ─────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();

    if (CFG.version) el.appVersion.textContent = CFG.version;

    $$('input[type="checkbox"]', el.gdList).forEach(function (b) {
      b.checked = !!state.checks[b.getAttribute('data-check')];
    });

    setTab(state.tab);
    bindAll();
    bindTheme();
    bindInstall();
    renderPromo();
    renderExpect();
    renderTiming();
    renderBasic();
    renderGuide();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function (e) { /* 오프라인 미지원 환경 무시 */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
