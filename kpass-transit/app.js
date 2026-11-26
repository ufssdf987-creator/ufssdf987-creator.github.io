/*!
 * app.js — 2026 K-패스(모두의카드)·대중교통 환급 & 출퇴근 교통비 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.KPassCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'kpx.state.v1';
  var THEME_KEY = 'kpx.theme';
  var TABS = ['refund', 'compare', 'commute', 'apply'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function won(n) { return nf.format(Math.round(n || 0)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /** 5억원 · 6만 8,200원처럼 읽기 쉽게 */
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

  function pct(v) {
    var n = Number(v) || 0;
    var s = (n * 100).toFixed(1).replace(/\.0$/, '');
    return s + '%';
  }

  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'refund',
    type: 'general',
    region: 'metro',
    mode: 'count',
    trips: 44,
    fare: 1550,
    spend: 68200,
    peak: 0,
    legacy: false,
    cpType: 'general',
    cpSpend: 68200,
    cpTrips: 44,
    cpRegion: 'metro',
    cpSeoul: true,
    cpWide: false,
    km: 24,
    days: 22,
    mileage: 12,
    fuelPrice: 1854,
    parking: 0,
    toll: 0,
    fixedCost: 100000,
    cmFare: 1550,
    cmType: 'general',
    checks: {}
  };

  var L = S.LIMITS;

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    var typeKeys = S.TYPES.map(function (t) { return t.key; });
    var regionKeys = S.REGIONS.map(function (r) { return r.key; });
    if (typeKeys.indexOf(raw.type) >= 0) state.type = raw.type;
    if (typeKeys.indexOf(raw.cpType) >= 0) state.cpType = raw.cpType;
    if (typeKeys.indexOf(raw.cmType) >= 0) state.cmType = raw.cmType;
    if (regionKeys.indexOf(raw.region) >= 0) state.region = raw.region;
    if (raw.cpRegion === 'metro' || raw.cpRegion === 'local') state.cpRegion = raw.cpRegion;
    if (raw.mode === 'count' || raw.mode === 'total') state.mode = raw.mode;

    [
      ['trips', 'trips', L.trips], ['fare', 'fare', L.fare], ['spend', 'spend', L.spend],
      ['peak', 'peak', L.peak],
      ['cpSpend', 'cpSpend', L.spend], ['cpTrips', 'cpTrips', L.trips],
      ['km', 'km', L.km], ['days', 'days', L.days], ['mileage', 'mileage', L.mileage],
      ['fuelPrice', 'fuelPrice', L.fuel], ['parking', 'parking', L.money],
      ['toll', 'toll', L.money], ['fixedCost', 'fixedCost', L.money], ['cmFare', 'cmFare', L.fare]
    ].forEach(function (k) {
      var v = parseFloat(raw[k[0]]);
      if (isFinite(v) && v >= 0) state[k[1]] = clamp(v, k[2].min, k[2].max);
    });

    if (typeof raw.legacy === 'boolean') state.legacy = raw.legacy;
    if (typeof raw.cpSeoul === 'boolean') state.cpSeoul = raw.cpSeoul;
    if (typeof raw.cpWide === 'boolean') state.cpWide = raw.cpWide;
    if (raw.checks && typeof raw.checks === 'object') {
      Object.keys(raw.checks).forEach(function (k) {
        if (raw.checks[k]) state.checks[k] = true;
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
    el.tabRefund = $('#tabRefund');
    el.tabCompare = $('#tabCompare');
    el.tabCommute = $('#tabCommute');
    el.tabApply = $('#tabApply');
    el.panelRefund = $('#panelRefund');
    el.panelCompare = $('#panelCompare');
    el.panelCommute = $('#panelCommute');
    el.panelApply = $('#panelApply');

    el.rfTypeGroup = $('#rfTypeGroup');
    el.rfTypeHelp = $('#rfTypeHelp');
    el.rfRegion = $('#rfRegion');
    el.rfModeGroup = $('#rfModeGroup');
    el.rfFareWrap = $('#rfFareWrap');
    el.rfSpendWrap = $('#rfSpendWrap');
    el.rfTrips = $('#rfTrips');
    el.rfTripsBadge = $('#rfTripsBadge');
    el.rfFare = $('#rfFare');
    el.rfFareBadge = $('#rfFareBadge');
    el.rfSpend = $('#rfSpend');
    el.rfSpendBadge = $('#rfSpendBadge');
    el.rfPeak = $('#rfPeak');
    el.rfPeakBadge = $('#rfPeakBadge');
    el.rfLegacy = $('#rfLegacy');
    el.rfResultCard = $('#rfResultCard');
    el.rfTotal = $('#rfTotal');
    el.rfSub = $('#rfSub');
    el.rfVerdict = $('#rfVerdict');
    el.rfRows = $('#rfRows');
    el.rfStatSpend = $('#rfStatSpend');
    el.rfStatBurden = $('#rfStatBurden');
    el.rfStatYear = $('#rfStatYear');
    el.rfStatRate = $('#rfStatRate');
    el.rfNextBox = $('#rfNextBox');
    el.rfNextTitle = $('#rfNextTitle');
    el.rfNext = $('#rfNext');
    el.rfInsight = $('#rfInsight');
    el.rfRateTable = $('#rfRateTable');
    el.rfFixedTable = $('#rfFixedTable');
    el.shareRefund = $('#shareRefund');

    el.cpTypeGroup = $('#cpTypeGroup');
    el.cpSpend = $('#cpSpend');
    el.cpSpendBadge = $('#cpSpendBadge');
    el.cpTrips = $('#cpTrips');
    el.cpTripsBadge = $('#cpTripsBadge');
    el.cpRegionGroup = $('#cpRegionGroup');
    el.cpSeoul = $('#cpSeoul');
    el.cpWide = $('#cpWide');
    el.cpResultCard = $('#cpResultCard');
    el.cpSaving = $('#cpSaving');
    el.cpSub = $('#cpSub');
    el.cpVerdict = $('#cpVerdict');
    el.cpRows = $('#cpRows');
    el.cpNextBox = $('#cpNextBox');
    el.cpNextTitle = $('#cpNextTitle');
    el.cpNext = $('#cpNext');
    el.cpInsight = $('#cpInsight');
    el.cpBeTable = $('#cpBeTable');
    el.shareCompare = $('#shareCompare');

    el.cmKm = $('#cmKm');
    el.cmKmBadge = $('#cmKmBadge');
    el.cmDays = $('#cmDays');
    el.cmDaysBadge = $('#cmDaysBadge');
    el.cmMileage = $('#cmMileage');
    el.cmMileageBadge = $('#cmMileageBadge');
    el.cmFuel = $('#cmFuel');
    el.cmFuelBadge = $('#cmFuelBadge');
    el.cmParking = $('#cmParking');
    el.cmParkingBadge = $('#cmParkingBadge');
    el.cmToll = $('#cmToll');
    el.cmTollBadge = $('#cmTollBadge');
    el.cmFixed = $('#cmFixed');
    el.cmFixedBadge = $('#cmFixedBadge');
    el.cmFare = $('#cmFare');
    el.cmFareBadge = $('#cmFareBadge');
    el.cmTypeGroup = $('#cmTypeGroup');
    el.cmResultCard = $('#cmResultCard');
    el.cmDiffLabel = $('#cmDiffLabel');
    el.cmDiff = $('#cmDiff');
    el.cmSub = $('#cmSub');
    el.cmVerdict = $('#cmVerdict');
    el.cmRows = $('#cmRows');
    el.cmCarTotal = $('#cmCarTotal');
    el.cmTransitTotal = $('#cmTransitTotal');
    el.cmLiters = $('#cmLiters');
    el.cmYearDiff = $('#cmYearDiff');
    el.cmNextBox = $('#cmNextBox');
    el.cmNextTitle = $('#cmNextTitle');
    el.cmNext = $('#cmNext');
    el.cmInsight = $('#cmInsight');
    el.shareCommute = $('#shareCommute');

    el.checkBar = $('#checkBar');
    el.checkCount = $('#checkCount');
    el.checkList = $('#checkList');
    el.checkReset = $('#checkReset');

    el.themeBtn = $('#themeBtn');
    el.themeIcon = $('#themeIcon');
    el.installBtn = $('#installBtn');
    el.toast = $('#toast');
    el.promoSection = $('#promoSection');
    el.promoHeading = $('#promoHeading');
    el.promoSub = $('#promoSub');
    el.promoList = $('#promoList');
    el.promoDisclosure = $('#promoDisclosure');
    el.footerDisclosure = $('#footerDisclosure');
    el.dataDate = $('#dataDate');
    el.appVersion = $('#appVersion');
  }

  /* ── 탭 ───────────────────────────────────────────────── */
  function setTab(name, focus) {
    if (TABS.indexOf(name) < 0) name = 'refund';
    state.tab = name;
    var map = {
      refund: [el.tabRefund, el.panelRefund],
      compare: [el.tabCompare, el.panelCompare],
      commute: [el.tabCommute, el.panelCommute],
      apply: [el.tabApply, el.panelApply]
    };
    TABS.forEach(function (key) {
      var tab = map[key][0];
      var panel = map[key][1];
      var active = key === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
      panel.classList.toggle('is-active', active);
      if (active) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    });
    if (focus) map[name][0].focus();
    try {
      if (history.replaceState) history.replaceState(null, '', '#' + name);
    } catch (e) { /* file:// 등 */ }
    saveState();
  }

  function initTabs() {
    el.tabRefund.addEventListener('click', function () { setTab('refund'); });
    el.tabCompare.addEventListener('click', function () { setTab('compare'); });
    el.tabCommute.addEventListener('click', function () { setTab('commute'); });
    el.tabApply.addEventListener('click', function () { setTab('apply'); });
    $$('.tabs .tab').forEach(function (tab) {
      tab.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var i = TABS.indexOf(state.tab);
        var next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : (i + TABS.length - 1) % TABS.length;
        setTab(TABS[next], true);
      });
    });
    var hash = (location.hash || '').replace('#', '');
    setTab(TABS.indexOf(hash) >= 0 ? hash : (state.tab || 'refund'));
    window.addEventListener('hashchange', function () {
      var next = (location.hash || '').replace('#', '');
      if (TABS.indexOf(next) >= 0 && next !== state.tab) setTab(next);
    });
  }

  /* ── 공통 UI ─────────────────────────────────────────── */
  function row(label, value, small, cls) {
    return '<div class="bd-row' + (cls ? ' ' + cls : '') + '">' +
      '<span class="bd-label">' + label + (small ? '<small>' + small + '</small>' : '') + '</span>' +
      '<span class="bd-value">' + value + '</span></div>';
  }

  function syncChips(attr, value) {
    $$('.chips [data-' + attr + ']').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-' + attr)) === Number(value));
    });
  }

  function setInsight(node, html, tone) {
    node.className = 'insight' + (tone ? ' ' + tone : '');
    node.innerHTML = html;
  }

  function setBadge(node, text, tier) {
    node.textContent = text;
    node.setAttribute('data-tier', String(tier));
  }

  function syncGroup(group, attr, value) {
    $$('[data-' + attr + ']', group).forEach(function (btn) {
      var on = btn.getAttribute('data-' + attr) === String(value);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function bindGroup(group, attr, onPick) {
    $$('[data-' + attr + ']', group).forEach(function (btn) {
      btn.addEventListener('click', function () {
        onPick(btn.getAttribute('data-' + attr));
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var items = $$('[data-' + attr + ']', group);
        var i = items.indexOf(btn);
        var next = e.key === 'ArrowRight' ? (i + 1) % items.length : (i + items.length - 1) % items.length;
        e.preventDefault();
        items[next].focus();
        items[next].click();
      });
    });
  }

  /* ── 탭 1: 환급 ─────────────────────────────────────── */
  function refundInput() {
    var fare = state.mode === 'count' ? state.fare : null;
    var spend = state.mode === 'count' ? state.trips * state.fare : state.spend;
    return {
      spend: spend,
      trips: state.trips,
      fare: fare,
      type: state.type,
      region: state.region,
      peakShare: state.peak,
      legacy: state.legacy,
      assumeNormalFare: state.mode === 'total'
    };
  }

  function syncRefundForm() {
    syncGroup(el.rfTypeGroup, 'rf-type', state.type);
    syncGroup(el.rfModeGroup, 'rf-mode', state.mode);
    el.rfRegion.value = state.region;
    el.rfTrips.value = String(state.trips);
    el.rfFare.value = String(state.fare);
    el.rfSpend.value = String(state.spend);
    el.rfPeak.value = String(state.peak);
    el.rfLegacy.checked = !!state.legacy;
    el.rfTripsBadge.textContent = state.trips + '회';
    el.rfFareBadge.textContent = won(state.fare) + '원';
    el.rfSpendBadge.textContent = won(state.mode === 'count' ? state.trips * state.fare : state.spend) + '원';
    el.rfPeakBadge.textContent = state.peak + '%';
    el.rfFareWrap.hidden = state.mode !== 'count';
    el.rfSpendWrap.hidden = state.mode !== 'total';
    var t = S.typeInfo(state.type);
    el.rfTypeHelp.textContent = t.label + ' 유형은 정률형 ' + pct(t.rate) + '입니다. ' + t.age + ' 기준입니다.';
    syncChips('rf-trips', state.trips);
    syncChips('rf-fare', state.fare);
    syncChips('rf-peak', state.peak);
  }

  function renderRefund() {
    var r = S.refund(refundInput());

    el.rfTotal.textContent = won(r.refund);
    el.rfSub.textContent = r.typeLabel + ' ' + pct(r.typeRate) + ' · ' + r.trips + '회 · ' +
      wonShort(r.spend) + ' 지출 · ' + r.methodLabel + ' 적용';

    if (!r.eligible) setBadge(el.rfVerdict, '15회 미달', 3);
    else if (r.method === 'rate') setBadge(el.rfVerdict, '정률형', 1);
    else if (r.method === 'normal') setBadge(el.rfVerdict, '일반형(정액)', 2);
    else setBadge(el.rfVerdict, '플러스형(정액)', 2);

    var rows = '';
    rows += row('월 교통비', won(r.spend) + '원', r.trips + '회 × ' + won(r.fare) + '원');
    rows += row('정률형', won(r.base) + '원',
      pct(r.rate) + (r.peakShare > 0 ? ' · 시차 ' + r.peakShare + '% 반영' : ''));
    rows += row('일반형 정액', won(r.normal) + '원', '기준 ' + won(r.fixedNormal) + '원 초과분');
    rows += row('플러스형 정액', won(r.plus) + '원', '기준 ' + won(r.fixedPlus) + '원 초과분');
    if (r.legacy) {
      rows += row('2025년 상한 적용', won(r.counted) + '원', '60회 · 20만원까지 인정', 'is-dim');
    }
    rows += row('이번 달 환급액', won(r.refund) + '원', r.methodLabel, 'total');
    el.rfRows.innerHTML = rows;

    el.rfStatSpend.textContent = won(r.spend) + '원';
    el.rfStatBurden.textContent = won(r.burden) + '원';
    el.rfStatYear.textContent = wonShort(r.yearRefund);
    el.rfStatRate.textContent = pct(r.effective);

    var be = S.breakEven(state.type, state.region, state.peak);
    el.rfNextBox.className = 'after-box';
    if (!r.eligible) {
      el.rfNextBox.className = 'after-box after-box--warn';
      el.rfNextTitle.textContent = '15회를 채워야 지급됩니다';
      el.rfNext.innerHTML = '지금 ' + r.trips + '회로 <strong>' + Math.max(1, r.shortfall) + '회</strong> 부족합니다. ' +
        '이달 적립금 ' + won(r.rawBest) + '원은 지급되지 않습니다. 가입한 첫 달만 15회 미만도 지급됩니다.';
    } else if (r.method === 'normal') {
      el.rfNextBox.className = 'after-box after-box--special';
      el.rfNextTitle.textContent = '정액형 일반형이 가장 큽니다';
      el.rfNext.innerHTML = '기준 ' + won(r.fixedNormal) + '원을 넘은 <strong>' + won(r.normal) + '원</strong>을 전액 돌려받습니다. ' +
        '실부담은 ' + won(r.fixedNormal) + '원으로 고정됩니다. 정률형(' + won(r.base) + '원)보다 ' + won(r.normal - r.base) + '원 많습니다.';
    } else if (r.method === 'plus') {
      el.rfNextBox.className = 'after-box after-box--special';
      el.rfNextTitle.textContent = '정액형 플러스형이 가장 큽니다';
      el.rfNext.innerHTML = '1회 ' + won(r.fare) + '원은 3,000원 이상이라 일반형 대상에서 빠집니다. ' +
        '기준 ' + won(r.fixedPlus) + '원을 넘은 <strong>' + won(r.plus) + '원</strong>을 돌려받습니다.';
    } else {
      var diff = r.base - Math.max(r.normal, r.plus);
      el.rfNextTitle.textContent = '정률형이 가장 큽니다';
      el.rfNext.innerHTML = '지출의 ' + pct(r.rate) + '인 <strong>' + won(r.base) + '원</strong>을 돌려받습니다. ' +
        '정액형보다 ' + won(diff) + '원 많습니다. 지출이 ' + wonShort(be.normalAt || 0) + '을 넘으면 정액형이 더 커집니다.';
    }

    var ins = '실부담은 <strong>' + won(r.burden) + '원</strong>, 1년이면 <strong>' + wonShort(r.yearRefund) + '</strong>을 돌려받는 셈입니다.';
    if (r.legacy) {
      ins += ' 2025년 기준(60회 상한)이라 ' + won(r.spend - r.counted) + '원어치 이용분은 적립에서 빠졌습니다.';
    } else if (r.trips >= 60) {
      ins += ' 월 60회를 넘겼지만 2026년부터 상한이 없어 전부 적립됩니다.';
    }
    setInsight(el.rfInsight, ins);

    /* 유형별 표 */
    el.rfRateTable.tBodies[0].innerHTML = S.TYPES.map(function (t) {
      var f = S.fixedFor(t.key, 'metro');
      var now = t.key === state.type ? ' class="is-now"' : '';
      return '<tr' + now + '><th scope="row">' + t.label + ' <small>' + t.age + '</small></th>' +
        '<td>' + pct(t.rate) + '</td>' +
        '<td>' + won(f.normal) + '</td>' +
        '<td>' + won(f.plus) + '</td></tr>';
    }).join('');

    /* 지역별 정액 기준금액 표 */
    el.rfFixedTable.tBodies[0].innerHTML = S.REGIONS.map(function (reg) {
      var g = S.fixedFor('general', reg.key);
      var m = S.fixedFor('youth', reg.key);
      var l = S.fixedFor('kids3', reg.key);
      var now = reg.key === state.region ? ' class="is-now"' : '';
      return '<tr' + now + '><th scope="row">' + reg.label + '</th>' +
        '<td>' + won(g.normal) + ' / ' + won(g.plus) + '</td>' +
        '<td>' + won(m.normal) + ' / ' + won(m.plus) + '</td>' +
        '<td>' + won(l.normal) + ' / ' + won(l.plus) + '</td></tr>';
    }).join('');
  }

  function refundShareText() {
    var r = S.refund(refundInput());
    return '[K-패스 환급 계산] ' + r.typeLabel + ' ' + pct(r.typeRate) + '\n' +
      '월 ' + r.trips + '회 · ' + won(r.spend) + '원 지출\n' +
      '예상 환급 ' + won(r.refund) + '원 (' + r.methodLabel + ')\n' +
      '실부담 ' + won(r.burden) + '원 · 1년 ' + won(r.yearRefund) + '원\n' +
      'https://ufssdf987-creator.github.io/kpass-transit/';
  }

  /* ── 탭 2: 카드 비교 ─────────────────────────────────── */
  function syncCompareForm() {
    syncGroup(el.cpTypeGroup, 'cp-type', state.cpType);
    syncGroup(el.cpRegionGroup, 'cp-region', state.cpRegion);
    el.cpSpend.value = String(state.cpSpend);
    el.cpTrips.value = String(state.cpTrips);
    el.cpSeoul.checked = !!state.cpSeoul;
    el.cpWide.checked = !!state.cpWide;
    el.cpSpendBadge.textContent = won(state.cpSpend) + '원';
    el.cpTripsBadge.textContent = state.cpTrips + '회';
    syncChips('cp-spend', state.cpSpend);
  }

  function renderCompare() {
    var c = S.compare({
      spend: state.cpSpend,
      trips: state.cpTrips,
      type: state.cpType,
      region: state.cpRegion,
      seoul: state.cpSeoul,
      wide: state.cpWide
    });
    var b = c.base;

    el.cpSaving.textContent = won(c.savingVsPlain);
    el.cpSub.textContent = b.typeLabel + ' ' + pct(b.typeRate) + ' · ' + b.methodLabel + ' · 월 환급 ' + won(b.refund) + '원';
    if (b.refund <= 0) setBadge(el.cpVerdict, '환급 없음', 3);
    else if (c.bestKey === 'climate') setBadge(el.cpVerdict, '기후동행패스', 1);
    else setBadge(el.cpVerdict, '모두의카드', 1);

    var maxBurden = Math.max.apply(null, c.rows.map(function (r) { return r.burden; })) || 1;
    el.cpRows.innerHTML = c.rows.map(function (r) {
      var pctW = Math.round(r.burden / maxBurden * 100);
      var best = r.key === c.bestKey && r.available;
      return '<div class="compare-row compare-row--' + r.key + (best ? ' is-best' : '') + '">' +
        '<div class="compare-top">' +
        '<span class="compare-name">' + r.name + (best ? ' <em>유리</em>' : '') + '</span>' +
        '<strong>' + won(r.burden) + '원</strong>' +
        '</div>' +
        '<div class="compare-bar" aria-hidden="true"><i style="width:' + pctW + '%"></i></div>' +
        '<small>' + '월 환급 ' + won(r.refund) + '원 · 연 ' + won(r.yearRefund) + '원 · ' + r.note + '</small>' +
        '</div>';
    }).join('');

    el.cpNextBox.className = 'after-box';
    if (b.refund <= 0) {
      el.cpNextBox.className = 'after-box after-box--warn';
      el.cpNextTitle.textContent = '지금은 환급이 없습니다';
      el.cpNext.innerHTML = '월 <strong>15회</strong> 이상 타야 지급됩니다. 지금 ' + b.trips + '회입니다.';
    } else if (c.bestKey === 'climate') {
      el.cpNextTitle.textContent = '서울시민이면 기후동행패스';
      el.cpNext.innerHTML = '모두의카드와 환급액은 <strong>같고</strong>, 청년 만 39세까지·따릉이 할인·문화시설 할인이 더 붙습니다. ' +
        '이미 모두의카드를 쓰고 있다면 자동 적용됩니다.';
    } else if (c.bestKey === 'kpass') {
      el.cpNextTitle.textContent = '모두의카드가 유리합니다';
      el.cpNext.innerHTML = '월 ' + won(b.refund) + '원, 연 ' + wonShort(b.yearRefund) + '을 돌려받습니다. ' +
        '서울시민이라면 같은 금액에 기후동행패스 혜택이 더해집니다.';
    } else {
      el.cpNextTitle.textContent = '일반 교통카드와 같습니다';
      el.cpNext.innerHTML = '이번 조건에서는 환급이 없어 카드만 바꿔도 차이가 없습니다.';
    }

    setInsight(el.cpInsight,
      '일반 교통카드로 계속 내면 1년에 <strong>' + won(c.yearSaving) + '원</strong>을 그냥 버리게 됩니다. ' +
      '지출이 ' + wonShort(c.breaks.normalAt || 0) + '을 넘으면 정액형이, ' +
      '광역 교통비가 ' + won(c.breaks.plusGap) + '원을 넘으면 플러스형이 유리해집니다.');

    var normalWin = b.base - b.normal;
    var plusWin = b.base - b.plus;
    el.cpBeTable.tBodies[0].innerHTML =
      '<tr><th scope="row">정률형 ↔ 일반형</th><td>' + won(c.breaks.normalAt) + '원</td>' +
      '<td>' + (normalWin > 0 ? '지금은 정률형이 ' + won(normalWin) + '원 우세' : '일반형이 ' + won(-normalWin) + '원 우세') + '</td></tr>' +
      '<tr><th scope="row">정률형 ↔ 플러스형</th><td>' + won(c.breaks.plusAt) + '원</td>' +
      '<td>' + (plusWin > 0 ? '지금은 정률형이 ' + won(plusWin) + '원 우세' : '플러스형이 ' + won(-plusWin) + '원 우세') + '</td></tr>' +
      '<tr><th scope="row">일반형 ↔ 플러스형</th><td>광역 ' + won(c.breaks.plusGap) + '원</td>' +
      '<td>' + (b.plus > b.normal ? '플러스형이 ' + won(b.plus - b.normal) + '원 우세' : '일반형이 ' + won(b.normal - b.plus) + '원 우세') + '</td></tr>' +
      '<tr><th scope="row">지급 문턱</th><td>월 15회</td>' +
      '<td>' + (b.trips >= 15 ? b.trips + '회 · 지급 대상' : b.trips + '회 · 미달') + '</td></tr>';
  }

  function compareShareText() {
    var c = S.compare({
      spend: state.cpSpend,
      trips: state.cpTrips,
      type: state.cpType,
      region: state.cpRegion,
      seoul: state.cpSeoul,
      wide: state.cpWide
    });
    var lines = c.rows.filter(function (r) { return r.available; }).map(function (r) {
      return r.name + ' ' + won(r.burden) + '원 (환급 ' + won(r.refund) + ')';
    });
    return '[교통카드 비교] 월 ' + won(state.cpSpend) + '원 · ' + state.cpTrips + '회\n' +
      lines.join('\n') + '\n' +
      'https://ufssdf987-creator.github.io/kpass-transit/#compare';
  }

  /* ── 탭 3: 출퇴근 ────────────────────────────────────── */
  function commuteInput() {
    return {
      km: state.km,
      days: state.days,
      mileage: state.mileage,
      fuelPrice: state.fuelPrice,
      parking: state.parking,
      toll: state.toll,
      fixedCost: state.fixedCost,
      fare: state.cmFare,
      type: state.cmType,
      region: state.region,
      peakShare: state.peak
    };
  }

  function syncCommuteForm() {
    syncGroup(el.cmTypeGroup, 'cm-type', state.cmType);
    el.cmKm.value = String(state.km);
    el.cmDays.value = String(state.days);
    el.cmMileage.value = String(state.mileage);
    el.cmFuel.value = String(state.fuelPrice);
    el.cmParking.value = String(state.parking);
    el.cmToll.value = String(state.toll);
    el.cmFixed.value = String(state.fixedCost);
    el.cmFare.value = String(state.cmFare);
    el.cmKmBadge.textContent = state.km + 'km';
    el.cmDaysBadge.textContent = state.days + '일';
    el.cmMileageBadge.textContent = state.mileage + 'km/L';
    el.cmFuelBadge.textContent = won(state.fuelPrice) + '원';
    el.cmParkingBadge.textContent = won(state.parking) + '원';
    el.cmTollBadge.textContent = won(state.toll) + '원';
    el.cmFixedBadge.textContent = won(state.fixedCost) + '원';
    el.cmFareBadge.textContent = won(state.cmFare) + '원';
    syncChips('cm-km', state.km);
  }

  function renderCommute() {
    var c = S.commute(commuteInput());

    if (c.cheaper === 'car') {
      el.cmDiffLabel.textContent = '대중교통이 더 드는 금액 (월)';
      el.cmDiff.textContent = won(Math.abs(c.diff));
      setBadge(el.cmVerdict, '자차 유리', 2);
    } else if (c.cheaper === 'transit') {
      el.cmDiffLabel.textContent = '자차가 더 드는 금액 (월)';
      el.cmDiff.textContent = won(Math.abs(c.diff));
      setBadge(el.cmVerdict, '대중교통 유리', 1);
    } else {
      el.cmDiffLabel.textContent = '월 비용 차이';
      el.cmDiff.textContent = '0';
      setBadge(el.cmVerdict, '비슷함', 2);
    }
    el.cmSub.textContent = '왕복 ' + c.km + 'km × ' + c.days + '일 · 월 ' + won(c.monthlyKm) + 'km · ' +
      '대중교통 ' + c.trips + '회';

    var rows = '';
    rows += row('주유비', won(c.fuel) + '원', won(c.monthlyKm) + 'km ÷ ' + c.mileage + 'km/L = ' + c.liters + 'L');
    if (c.parking > 0) rows += row('주차비', won(c.parking) + '원', '월 정액');
    if (c.toll > 0) rows += row('통행료', won(c.toll) + '원', '월 합계');
    if (c.fixedCost > 0) rows += row('보험·자동차세', won(c.fixedCost) + '원', '연 비용 ÷ 12');
    rows += row('자차 월 비용', won(c.carTotal) + '원', '합계', 'total');
    rows += row('대중교통 지출', won(c.transitSpend) + '원', c.trips + '회 × ' + won(c.fare) + '원', 'is-dim');
    rows += row('K-패스 환급', '-' + won(c.transitRefund) + '원', c.transitMethod, 'is-dim');
    rows += row('대중교통 실부담', won(c.transitBurden) + '원', '환급 반영', 'total');
    el.cmRows.innerHTML = rows;

    el.cmCarTotal.textContent = won(c.carTotal) + '원';
    el.cmTransitTotal.textContent = won(c.transitBurden) + '원';
    el.cmLiters.textContent = c.liters + 'L';
    el.cmYearDiff.textContent = wonShort(Math.abs(c.diffYear));

    el.cmNextBox.className = 'after-box';
    if (c.breakEvenKm === null) {
      el.cmNextTitle.textContent = '고정비만으로 이미 대중교통보다 비쌉니다';
      el.cmNext.innerHTML = '주차비·통행료·보험을 합치면 <strong>' + won(c.fixedOnly) + '원</strong>으로, ' +
        '대중교통 실부담(' + won(c.transitBurden) + '원)을 넘습니다. 거리를 줄여도 차이는 줄지 않습니다.';
    } else {
      el.cmNextTitle.textContent = '손익분기 왕복 ' + (Math.round(c.breakEvenKm * 10) / 10) + 'km';
      el.cmNext.innerHTML = '주차비·고정비를 빼고 주유비만 보면, 왕복 <strong>' +
        (Math.round(c.breakEvenKm * 10) / 10) + 'km</strong>보다 가까우면 자차가, 멀면 대중교통이 쌉니다. ' +
        '지금은 ' + c.km + 'km입니다.';
    }

    var ins = c.cheaper === 'transit'
      ? '대중교통이 월 <strong>' + won(Math.abs(c.diff)) + '원</strong>, 연 <strong>' + wonShort(Math.abs(c.diffYear)) + '</strong> 더 쌉니다.'
      : '자차가 월 <strong>' + won(Math.abs(c.diff)) + '원</strong> 더 쌉니다. 다만 감가상각·정비비는 빠져 있습니다.';
    setInsight(el.cmInsight, ins + ' 킬로미터당 주유비는 ' + won(c.perKm) + '원입니다.');
  }

  function commuteShareText() {
    var c = S.commute(commuteInput());
    return '[출퇴근 교통비 비교] 왕복 ' + c.km + 'km × ' + c.days + '일\n' +
      '자차 ' + won(c.carTotal) + '원 (주유 ' + won(c.fuel) + '원)\n' +
      '대중교통 ' + won(c.transitBurden) + '원 (환급 ' + won(c.transitRefund) + '원 반영)\n' +
      '차이 ' + won(Math.abs(c.diff)) + '원/월\n' +
      'https://ufssdf987-creator.github.io/kpass-transit/#commute';
  }

  /* ── 체크리스트 ───────────────────────────────────────── */
  function checkInputs() {
    return $$('input[data-check]', el.checkList);
  }

  function syncChecks() {
    var boxes = checkInputs();
    var done = boxes.filter(function (b) { return b.checked; }).length;
    var rate = boxes.length ? Math.round(done / boxes.length * 100) : 0;
    el.checkCount.textContent = done + ' / ' + boxes.length;
    el.checkBar.setAttribute('aria-valuenow', String(rate));
    var fill = el.checkBar.querySelector('i');
    if (fill) fill.style.width = rate + '%';
  }

  function bindChecks() {
    checkInputs().forEach(function (box) {
      var key = box.getAttribute('data-check');
      if (state.checks[key]) box.checked = true;
      box.addEventListener('change', function () {
        if (box.checked) state.checks[key] = true;
        else delete state.checks[key];
        syncChecks();
        persist();
      });
    });
    el.checkReset.addEventListener('click', function () {
      state.checks = {};
      checkInputs().forEach(function (b) { b.checked = false; });
      syncChecks();
      persist();
      toast('체크를 모두 지웠습니다.');
    });
  }

  /* ── 복사·토스트 ─────────────────────────────────────── */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (e) { reject(e); }
    });
  }

  var toastTimer = null;
  function toast(message) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('is-visible');
    }, 2600);
  }

  function doShare(text) {
    copyText(text).then(function () {
      toast('결과를 복사했어요. 붙여넣기 해 보세요.');
    }).catch(function () {
      toast('복사가 막혔어요. 화면을 길게 눌러 복사해 주세요.');
    });
  }

  /* ── 테마 ─────────────────────────────────────────────── */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    el.themeBtn.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
    var meta = $('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#070c16' : '#eef2f8');
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 무시 */ }
  }

  function initTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'dark' : 'light');
    el.themeBtn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }

  /* ── 광고 ─────────────────────────────────────────────── */
  function initAds() {
    var ads = CFG.adsense || {};
    var slots = $$('.ad-slot');
    var live = [];
    slots.forEach(function (slot) {
      var key = slot.getAttribute('data-ad-slot');
      var id = ads.slots && ads.slots[key];
      if (ads.client && id) {
        slot.hidden = false;
        slot.classList.add('ad-slot--live');
        slot.removeAttribute('aria-hidden');
        slot.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="' + ads.client +
          '" data-ad-slot="' + id + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
        live.push(slot.querySelector('ins'));
      } else if (ads.showPlaceholders) {
        slot.hidden = false;
        slot.removeAttribute('aria-hidden');
        slot.innerHTML = '<span>AD · 광고 영역</span>';
      } else {
        slot.hidden = true;
      }
    });
    if (!ads.client || !live.length) return;
    if (document.querySelector('script[src*="adsbygoogle.js"]')) {
      live.forEach(function (ins) {
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* 광고 차단 등 */ }
      });
      return;
    }
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
      encodeURIComponent(ads.client);
    script.crossOrigin = 'anonymous';
    script.onload = function () {
      live.forEach(function (ins) {
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) { /* 광고 차단 등 */ }
      });
    };
    document.head.appendChild(script);
  }

  /* ── 제휴 카드 ────────────────────────────────────────── */
  function initPromo() {
    var coupang = CFG.coupang || {};
    var items = (coupang.items || []).filter(function (it) { return it && it.url; });
    if (!items.length) {
      el.promoSection.hidden = true;
      return;
    }
    el.promoSection.hidden = false;
    el.promoHeading.textContent = coupang.heading || '겨울 출퇴근, 돌아온 방';
    el.promoSub.textContent = coupang.subheading || '';
    var disclosure = coupang.disclosure || '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
    el.promoDisclosure.textContent = disclosure;
    el.footerDisclosure.textContent = disclosure;
    el.footerDisclosure.hidden = false;
    el.promoList.innerHTML = items.map(function (it) {
      return '<div class="promo-item">' +
        '<span class="promo-thumb" aria-hidden="true">' + (it.emoji || '📦') + '</span>' +
        '<div class="promo-body">' +
        '<p class="promo-name">' + it.name + '</p>' +
        '<p class="promo-meta">' + (it.tag || '') + '</p>' +
        '</div>' +
        '<a class="promo-cta" href="' + it.url + '" target="_blank" rel="sponsored nofollow noopener">' +
        (it.cta || '쿠팡에서 보기') + '</a></div>';
    }).join('');
  }

  /* ── PWA ──────────────────────────────────────────────── */
  function initInstall() {
    var deferred = null;
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (isIOS && !standalone) {
      el.installBtn.hidden = false;
      el.installBtn.addEventListener('click', function () {
        toast('Safari 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 열려요.');
      });
    }
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
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
    window.addEventListener('appinstalled', function () {
      el.installBtn.hidden = true;
      toast('홈 화면에 추가했어요. 앱처럼 열 수 있습니다.');
    });
    if (standalone) el.installBtn.hidden = true;
  }

  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    var hadController = !!navigator.serviceWorker.controller;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              toast('새 버전이 준비됐어요. 새로고침하면 적용됩니다.');
            }
          });
        });
      }).catch(function () { /* 오프라인 캐시는 없어도 동작 */ });
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (hadController) location.reload();
      });
    });
  }

  /* ── 이벤트 ───────────────────────────────────────────── */
  function bindRefundEvents() {
    bindGroup(el.rfTypeGroup, 'rf-type', function (v) {
      if (S.TYPES.some(function (t) { return t.key === v; })) state.type = v;
      refresh();
    });
    bindGroup(el.rfModeGroup, 'rf-mode', function (v) {
      state.mode = v === 'total' ? 'total' : 'count';
      refresh();
    });
    el.rfRegion.addEventListener('change', function () {
      state.region = el.rfRegion.value;
      refresh();
    });
    el.rfTrips.addEventListener('input', function () {
      state.trips = Math.round(readNum(el.rfTrips, 0, L.trips.min, L.trips.max));
      syncChips('rf-trips', state.trips);
      refresh();
    });
    el.rfFare.addEventListener('input', function () {
      state.fare = Math.round(readNum(el.rfFare, 0, L.fare.min, L.fare.max));
      syncChips('rf-fare', state.fare);
      refresh();
    });
    el.rfSpend.addEventListener('input', function () {
      state.spend = Math.round(readNum(el.rfSpend, 0, L.spend.min, L.spend.max));
      syncChips('rf-spend', state.spend);
      refresh();
    });
    el.rfPeak.addEventListener('input', function () {
      state.peak = Math.round(readNum(el.rfPeak, 0, L.peak.min, L.peak.max));
      syncChips('rf-peak', state.peak);
      refresh();
    });
    el.rfLegacy.addEventListener('change', function () {
      state.legacy = el.rfLegacy.checked;
      refresh();
    });
    $$('.chips [data-rf-trips]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.trips = Number(b.getAttribute('data-rf-trips'));
        refresh();
      });
    });
    $$('.chips [data-rf-fare]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.fare = Number(b.getAttribute('data-rf-fare'));
        refresh();
      });
    });
    $$('.chips [data-rf-spend]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.spend = Number(b.getAttribute('data-rf-spend'));
        refresh();
      });
    });
    $$('.chips [data-rf-peak]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.peak = Number(b.getAttribute('data-rf-peak'));
        refresh();
      });
    });
    el.shareRefund.addEventListener('click', function () { doShare(refundShareText()); });
  }

  function bindCompareEvents() {
    bindGroup(el.cpTypeGroup, 'cp-type', function (v) {
      if (S.TYPES.some(function (t) { return t.key === v; })) state.cpType = v;
      refresh();
    });
    bindGroup(el.cpRegionGroup, 'cp-region', function (v) {
      state.cpRegion = v === 'local' ? 'local' : 'metro';
      refresh();
    });
    el.cpSpend.addEventListener('input', function () {
      state.cpSpend = Math.round(readNum(el.cpSpend, 0, L.spend.min, L.spend.max));
      syncChips('cp-spend', state.cpSpend);
      refresh();
    });
    el.cpTrips.addEventListener('input', function () {
      state.cpTrips = Math.round(readNum(el.cpTrips, 0, L.trips.min, L.trips.max));
      refresh();
    });
    el.cpSeoul.addEventListener('change', function () {
      state.cpSeoul = el.cpSeoul.checked;
      refresh();
    });
    el.cpWide.addEventListener('change', function () {
      state.cpWide = el.cpWide.checked;
      refresh();
    });
    $$('.chips [data-cp-spend]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cpSpend = Number(b.getAttribute('data-cp-spend'));
        refresh();
      });
    });
    el.shareCompare.addEventListener('click', function () { doShare(compareShareText()); });
  }

  function bindCommuteEvents() {
    bindGroup(el.cmTypeGroup, 'cm-type', function (v) {
      if (S.TYPES.some(function (t) { return t.key === v; })) state.cmType = v;
      refresh();
    });
    [['cmKm', 'km', L.km], ['cmDays', 'days', L.days], ['cmMileage', 'mileage', L.mileage],
     ['cmFuel', 'fuelPrice', L.fuel], ['cmParking', 'parking', L.money], ['cmToll', 'toll', L.money],
     ['cmFixed', 'fixedCost', L.money], ['cmFare', 'cmFare', L.fare]].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        state[cfg[1]] = readNum(el[cfg[0]], 0, cfg[2].min, cfg[2].max);
        if (cfg[1] === 'km') syncChips('cm-km', state.km);
        refresh();
      });
    });
    $$('.chips [data-cm-km]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.km = Number(b.getAttribute('data-cm-km'));
        refresh();
      });
    });
    el.shareCommute.addEventListener('click', function () { doShare(commuteShareText()); });
  }

  function refresh() {
    syncRefundForm();
    syncCompareForm();
    syncCommuteForm();
    renderRefund();
    renderCompare();
    renderCommute();
    syncChecks();
    saveState();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    el.appVersion.textContent = CFG.version || '1.0.0';
    el.dataDate.textContent = S.DATA_DATE;
    el.dataDate.setAttribute('datetime', S.DATA_DATE);

    bindRefundEvents();
    bindCompareEvents();
    bindCommuteEvents();
    bindChecks();
    initTabs();
    initTheme();
    initAds();
    initPromo();
    initInstall();
    initSW();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
