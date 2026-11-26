/*!
 * app.js — 2026 예금·적금 만기 이자 & 세후 수령액 · 비과세 비교 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.SavingsCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'svt.state.v1';
  var THEME_KEY = 'svt.theme';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function won(n) { return nf.format(Math.round(n || 0)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /** 3억 5,000만원 · 2,400만원 · 85만원처럼 읽기 쉽게 */
  function wonShort(v) {
    var n = Math.round(Math.abs(v));
    var sign = v < 0 ? '-' : '';
    if (n >= 100000000) {
      var eok = Math.floor(n / 100000000);
      var man = Math.round((n % 100000000) / 10000);
      if (man === 0) return sign + eok + '억원';
      return sign + eok + '억 ' + (man >= 10000
        ? nf.format(Math.round(man / 10000)) + '억 ' + nf.format(man % 10000) + '만원'
        : nf.format(man) + '만원');
    }
    if (n >= 10000) return sign + nf.format(Math.round(n / 10000)) + '만원';
    return sign + nf.format(n) + '원';
  }

  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'maturity',
    mt: {
      product: 'installment',
      amountInst: 300000,
      amountLump: 10000000,
      months: 12,
      rate: 3.5,
      method: 'simple',
      tax: 'general'
    },
    cmp: { total: 12000000, months: 12, rate: 3.5, method: 'simple', tax: 'general' },
    gl: { target: 10000000, months: 36, rate: 3.5, method: 'simple', tax: 'general' }
  };

  function mtAmount() {
    return state.mt.product === 'lump' ? state.mt.amountLump : state.mt.amountInst;
  }

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    var m = raw.mt;
    if (m && typeof m === 'object') {
      if (m.product === 'lump' || m.product === 'installment') state.mt.product = m.product;
      ['amountInst', 'amountLump', 'months', 'rate'].forEach(function (k) {
        var v = parseFloat(m[k]);
        if (isFinite(v) && v >= 0) state.mt[k] = v;
      });
      if (m.method === 'simple' || m.method === 'compound') state.mt.method = m.method;
      if (S.TAX[m.tax]) state.mt.tax = m.tax;
    }

    var c = raw.cmp;
    if (c && typeof c === 'object') {
      ['total', 'months', 'rate'].forEach(function (k) {
        var v = parseFloat(c[k]);
        if (isFinite(v) && v >= 0) state.cmp[k] = v;
      });
      if (c.method === 'simple' || c.method === 'compound') state.cmp.method = c.method;
      if (S.TAX[c.tax]) state.cmp.tax = c.tax;
    }

    var g = raw.gl;
    if (g && typeof g === 'object') {
      ['target', 'months', 'rate'].forEach(function (k) {
        var v = parseFloat(g[k]);
        if (isFinite(v) && v >= 0) state.gl[k] = v;
      });
      if (g.method === 'simple' || g.method === 'compound') state.gl.method = g.method;
      if (S.TAX[g.tax]) state.gl.tax = g.tax;
    }

    if (raw.tab === 'maturity' || raw.tab === 'compare' || raw.tab === 'goal') state.tab = raw.tab;
  }

  var saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
    }, 180);
  }

  /* ── 엘리먼트 ─────────────────────────────────────────── */
  var el = {};
  function cacheEls() {
    el.tabMaturity = $('#tabMaturity');
    el.tabCompare = $('#tabCompare');
    el.tabGoal = $('#tabGoal');
    el.panelMaturity = $('#panelMaturity');
    el.panelCompare = $('#panelCompare');
    el.panelGoal = $('#panelGoal');

    el.mtAmount = $('#mtAmount');
    el.mtAmountLabel = $('#mtAmountLabel');
    el.mtAmountUnit = $('#mtAmountUnit');
    el.mtAmountBadge = $('#mtAmountBadge');
    el.mtAmountHelp = $('#mtAmountHelp');
    el.mtChipsInst = $('#mtChipsInst');
    el.mtChipsLump = $('#mtChipsLump');
    el.mtMonths = $('#mtMonths');
    el.mtMonthsBadge = $('#mtMonthsBadge');
    el.mtRate = $('#mtRate');
    el.mtRateBadge = $('#mtRateBadge');
    el.mtTaxHelp = $('#mtTaxHelp');
    el.mtResultLabel = $('#mtResultLabel');
    el.mtMaturity = $('#mtMaturity');
    el.mtSub = $('#mtSub');
    el.mtTier = $('#mtTier');
    el.mtRows = $('#mtRows');
    el.mtPrincipal = $('#mtPrincipal');
    el.mtGross = $('#mtGross');
    el.mtTax = $('#mtTax');
    el.mtNet = $('#mtNet');
    el.mtInsight = $('#mtInsight');
    el.mtTable = $('#mtTable');
    el.mtTableBox = $('#mtTableBox');
    el.shareMaturity = $('#shareMaturity');

    el.cmpTotal = $('#cmpTotal');
    el.cmpTotalBadge = $('#cmpTotalBadge');
    el.cmpMonths = $('#cmpMonths');
    el.cmpMonthsBadge = $('#cmpMonthsBadge');
    el.cmpRate = $('#cmpRate');
    el.cmpRateBadge = $('#cmpRateBadge');
    el.cmpDiffLabel = $('#cmpDiffLabel');
    el.cmpDiff = $('#cmpDiff');
    el.cmpSub = $('#cmpSub');
    el.cmpWinner = $('#cmpWinner');
    el.cmpRows = $('#cmpRows');
    el.cmpLumpMaturity = $('#cmpLumpMaturity');
    el.cmpInstMaturity = $('#cmpInstMaturity');
    el.cmpNetDiff = $('#cmpNetDiff');
    el.cmpMonthly = $('#cmpMonthly');
    el.cmpInsight = $('#cmpInsight');
    el.cmpTable = $('#cmpTable');
    el.shareCompare = $('#shareCompare');

    el.glTarget = $('#glTarget');
    el.glTargetBadge = $('#glTargetBadge');
    el.glMonths = $('#glMonths');
    el.glMonthsBadge = $('#glMonthsBadge');
    el.glRate = $('#glRate');
    el.glRateBadge = $('#glRateBadge');
    el.glMonthly = $('#glMonthly');
    el.glSub = $('#glSub');
    el.glBadge = $('#glBadge');
    el.glRows = $('#glRows');
    el.glTargetStat = $('#glTargetStat');
    el.glTotalPaid = $('#glTotalPaid');
    el.glGrossNeeded = $('#glGrossNeeded');
    el.glLump = $('#glLump');
    el.glInsight = $('#glInsight');
    el.glTable = $('#glTable');
    el.shareGoal = $('#shareGoal');

    el.themeBtn = $('#themeBtn');
    el.themeIcon = $('#themeIcon');
    el.installBtn = $('#installBtn');
    el.toast = $('#toast');
    el.appVersion = $('#appVersion');
    el.dataDate = $('#dataDate');
    el.promoSection = $('#promoSection');
    el.promoHeading = $('#promoHeading');
    el.promoSub = $('#promoSub');
    el.promoList = $('#promoList');
    el.promoDisclosure = $('#promoDisclosure');
    el.footerDisclosure = $('#footerDisclosure');
  }

  /* ── 탭 ───────────────────────────────────────────────── */
  var TABS = ['maturity', 'compare', 'goal'];
  function setTab(tab, focus) {
    state.tab = TABS.indexOf(tab) >= 0 ? tab : 'maturity';
    var map = {
      maturity: [el.tabMaturity, el.panelMaturity],
      compare: [el.tabCompare, el.panelCompare],
      goal: [el.tabGoal, el.panelGoal]
    };
    TABS.forEach(function (key) {
      var pair = map[key];
      var on = key === state.tab;
      pair[0].classList.toggle('is-active', on);
      pair[0].setAttribute('aria-selected', String(on));
      pair[0].tabIndex = on ? 0 : -1;
      pair[1].hidden = !on;
      pair[1].classList.toggle('is-active', on);
    });
    if (focus) map[state.tab][0].focus();
    try {
      if (history.replaceState) history.replaceState(null, '', '#' + state.tab);
    } catch (e) { /* file:// 등 */ }
    saveState();
  }

  function initTabs() {
    el.tabMaturity.addEventListener('click', function () { setTab('maturity'); });
    el.tabCompare.addEventListener('click', function () { setTab('compare'); });
    el.tabGoal.addEventListener('click', function () { setTab('goal'); });
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
    setTab(TABS.indexOf(hash) >= 0 ? hash : 'maturity');
  }

  /* ── 공통 UI ─────────────────────────────────────────── */
  function row(label, value, small, cls) {
    return '<div class="bd-row' + (cls ? ' ' + cls : '') + '">' +
      '<span class="bd-label">' + label + (small ? '<small>' + small + '</small>' : '') + '</span>' +
      '<span class="bd-value">' + value + '</span></div>';
  }

  function syncSegments(segment, active) {
    $$('.segmented[data-segment="' + segment + '"] button').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-value') === active);
    });
  }

  function syncChips(attr, value) {
    $$('.chips [data-' + attr + ']').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-' + attr)) === Number(value));
    });
  }

  function percent(v) {
    var n = Math.round(v * 10) / 10;
    return (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)) + '%';
  }

  /* ── 탭 1: 만기 실수령액 ─────────────────────────────── */
  function syncMaturityForm() {
    var m = state.mt;
    var lump = m.product === 'lump';
    el.mtAmountLabel.textContent = lump ? '예치 원금' : '월 납입액';
    el.mtAmountUnit.textContent = lump ? '원' : '원 / 월';
    el.mtAmountHelp.innerHTML = lump
      ? '예금은 <strong>맡기는 원금 전액</strong>이 가입 기간 내내 이자를 받습니다.'
      : '적금은 매달 넣는 금액입니다. 첫 달에 넣은 돈이 가장 오래 이자를 받고, 마지막 달에 넣은 돈은 한 달치만 받습니다.';
    el.mtAmount.value = String(Math.round(mtAmount()));
    el.mtChipsInst.hidden = lump;
    el.mtChipsLump.hidden = !lump;
    el.mtMonths.value = String(Math.round(m.months));
    el.mtRate.value = String(m.rate);
    el.mtMonthsBadge.textContent = m.months + '개월';
    el.mtRateBadge.textContent = '연 ' + percent(m.rate);
    syncSegments('product', m.product);
    syncSegments('mtmethod', m.method);
    syncSegments('mttax', m.tax);
    syncChips('mt-amount', mtAmount());
    syncChips('mt-months', m.months);
    syncChips('mt-rate', m.rate);
  }

  function renderMaturity() {
    var m = state.mt;
    var r = S.calc({
      product: m.product, amount: mtAmount(), months: m.months,
      annualRate: m.rate, method: m.method, tax: m.tax
    });

    el.mtAmountBadge.textContent = '총 납입 ' + wonShort(r.principal);
    el.mtTaxHelp.textContent = r.taxNote;

    el.mtResultLabel.textContent = r.productLabel + ' 만기 수령액 (세후)';
    el.mtMaturity.textContent = won(r.maturity);
    el.mtSub.textContent = r.productLabel + ' ' + wonShort(r.amount) +
      (r.product === 'installment' ? ' × ' + r.months + '개월' : '') +
      ' · 연 ' + percent(r.annualRate) + ' ' + r.methodLabel + ' · ' + r.taxLabel + ' ' + r.taxShort;
    el.mtTier.textContent = r.taxLabel + ' ' + r.taxShort;
    el.mtTier.setAttribute('data-tier', r.tax === 'none' ? '1' : (r.taxRate <= 9.5 ? '1' : (r.taxRate <= 15.4 ? '2' : '3')));

    var rows = '';
    rows += row(r.product === 'installment' ? '월 납입액' : '예치 원금', won(r.amount) + '원',
      r.product === 'installment' ? r.months + '개월 · 총 ' + won(r.principal) + '원' : '가입 기간 ' + r.months + '개월');
    rows += row('세전 이자', won(r.grossInterest) + '원', '연 ' + percent(r.annualRate) + ' ' + r.methodLabel + ' 기준');
    rows += row('이자소득세 ' + r.taxShort, '-' + won(r.taxAmount) + '원', r.taxNote);
    rows += row('세후 이자', won(r.netInterest) + '원', '원금 대비 연 ' + percent(r.effectiveRate) + ' 수준');
    rows += row('만기 수령액', won(r.maturity) + '원', '원금 + 세후 이자', 'total');
    el.mtRows.innerHTML = rows;

    el.mtPrincipal.textContent = won(r.principal) + '원';
    el.mtGross.textContent = won(r.grossInterest) + '원';
    el.mtTax.textContent = won(r.taxAmount) + '원';
    el.mtNet.textContent = won(r.netInterest) + '원';

    var lines = [];
    if (r.grossInterest <= 0) {
      lines.push('이자율이 0%라 이자가 붙지 않습니다. 금리를 넣으면 세후 수령액이 계산됩니다.');
    } else {
      lines.push('세전 이자 <strong>' + won(r.grossInterest) + '원</strong>에서 세금 <strong>' + won(r.taxAmount) +
        '원</strong>을 떼고 <strong>' + won(r.netInterest) + '원</strong>을 받습니다. 원금까지 합치면 만기 수령액은 <strong>' +
        won(r.maturity) + '원</strong>입니다.');
    }
    if (r.tax !== 'none' && r.taxSaved > 0) {
      lines.push('같은 조건에서 비과세라면 세금 ' + won(r.generalTax - 0) + '원을 아껴 세후 이자가 <strong>' +
        won(r.grossInterest) + '원</strong>이 됩니다.');
    }
    if (r.overTaxFreeLimit) {
      lines.push('비과세종합저축 한도(원금 5,000만원)를 <strong>' + wonShort(-r.taxFreeRoom) + '</strong> 넘었습니다. 넘는 원금에는 일반과세가 적용됩니다.');
    }
    if (r.isTaxFree && !r.overTaxFreeLimit) {
      lines.push('비과세종합저축 한도까지 <strong>' + wonShort(r.taxFreeRoom) + '</strong> 남아 있습니다(1인 원금 5,000만원, 전 금융기관 합산).');
    }
    if (r.overComprehensive) {
      lines.push('이자가 연 2,000만원을 넘어 <strong>금융소득종합과세</strong> 대상입니다. 15.4% 원천징수로 끝나지 않고 다음 해 종합소득세 신고 때 다시 계산됩니다.');
    }
    if (r.overProtect) {
      lines.push('원금이 1억원을 넘습니다. 예금자보호 한도가 1인당 1억원이니 금융회사를 나눠 두는 편이 안전합니다.');
    }
    el.mtInsight.innerHTML = lines.join(' ');

    /* 과세 유형 4가지 비교 */
    var table = S.taxTable({
      product: m.product, amount: mtAmount(), months: m.months,
      annualRate: m.rate, method: m.method, tax: m.tax
    });
    el.mtTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = t.tax === r.tax;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + t.label +
        (now ? ' <small>현재</small>' : '') + '</th>' +
        '<td>' + t.short + '</td>' +
        '<td>' + won(t.taxAmount) + '원</td>' +
        '<td>' + won(t.netInterest) + '원</td>' +
        '<td>' + won(t.maturity) + '원</td></tr>';
    }).join('');
  }

  function maturityShareText() {
    var m = state.mt;
    var r = S.calc({
      product: m.product, amount: mtAmount(), months: m.months,
      annualRate: m.rate, method: m.method, tax: m.tax
    });
    var lines = [
      '2026 ' + r.productLabel + ' 만기 계산 (세후, 모의 계산)',
      '· ' + (r.product === 'installment' ? '월 ' + won(r.amount) + '원 × ' + r.months + '개월' : '예치 원금 ' + won(r.amount) + '원 · ' + r.months + '개월'),
      '· 연 ' + percent(r.annualRate) + ' ' + r.methodLabel + ' · ' + r.taxLabel + ' ' + r.taxShort,
      '· 세전 이자 ' + won(r.grossInterest) + '원 · 세금 ' + won(r.taxAmount) + '원',
      '· 만기 수령액 ' + won(r.maturity) + '원 (원금 ' + won(r.principal) + '원)'
    ];
    var url = shareUrl();
    if (url) lines.push('', '예적금·비과세 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 2: 예금 vs 적금 ──────────────────────────────── */
  function syncCompareForm() {
    var c = state.cmp;
    el.cmpTotal.value = String(Math.round(c.total));
    el.cmpMonths.value = String(Math.round(c.months));
    el.cmpRate.value = String(c.rate);
    el.cmpMonthsBadge.textContent = c.months + '개월';
    el.cmpRateBadge.textContent = '연 ' + percent(c.rate);
    syncSegments('cmpmethod', c.method);
    syncSegments('cmptax', c.tax);
    syncChips('cmp-total', c.total);
    syncChips('cmp-months', c.months);
    syncChips('cmp-rate', c.rate);
  }

  function renderCompare() {
    var c = state.cmp;
    var r = S.compare({
      total: c.total, months: c.months, annualRate: c.rate, method: c.method, tax: c.tax
    });

    el.cmpTotalBadge.textContent = '월 ' + wonShort(r.monthly) + ' × ' + r.months + '개월';
    el.cmpSub.textContent = wonShort(r.total) + ' · ' + r.months + '개월 · 연 ' + percent(r.annualRate) +
      ' ' + r.methodLabel + ' · ' + r.taxLabel;

    var diff = r.diff;
    if (r.winner === 'lump') {
      el.cmpDiffLabel.textContent = '예금이 더 받는 금액';
      el.cmpWinner.textContent = '예금 유리';
      el.cmpWinner.setAttribute('data-tier', '1');
      el.cmpDiff.textContent = won(diff);
    } else if (r.winner === 'installment') {
      el.cmpDiffLabel.textContent = '적금이 더 받는 금액';
      el.cmpWinner.textContent = '적금 유리';
      el.cmpWinner.setAttribute('data-tier', '2');
      el.cmpDiff.textContent = won(-diff);
    } else {
      el.cmpDiffLabel.textContent = '두 방식의 차이';
      el.cmpWinner.textContent = '같음';
      el.cmpWinner.setAttribute('data-tier', '2');
      el.cmpDiff.textContent = '0';
    }

    var rows = '';
    rows += row('예금 — 예치 원금', won(r.lump.principal) + '원', '첫날 한 번에 납입');
    rows += row('예금 — 세전 이자', won(r.lump.grossInterest) + '원', '전액이 ' + r.months + '개월 동안 이자');
    rows += row('예금 — 세금', '-' + won(r.lump.taxAmount) + '원', r.taxLabel + ' ' + r.taxShort);
    rows += row('예금 — 만기 수령액', won(r.lump.maturity) + '원', '세후', 'total');
    rows += row('적금 — 월 납입액', won(r.monthly) + '원', '총 ' + won(r.installment.principal) + '원');
    rows += row('적금 — 세전 이자', won(r.installment.grossInterest) + '원', '평균 잔액이 절반 수준');
    rows += row('적금 — 세금', '-' + won(r.installment.taxAmount) + '원', r.taxLabel + ' ' + r.taxShort);
    rows += row('적금 — 만기 수령액', won(r.installment.maturity) + '원', '세후', 'total');
    el.cmpRows.innerHTML = rows;

    el.cmpLumpMaturity.textContent = won(r.lump.maturity) + '원';
    el.cmpInstMaturity.textContent = won(r.installment.maturity) + '원';
    el.cmpNetDiff.textContent = won(r.netDiff) + '원';
    el.cmpMonthly.textContent = won(r.monthlyRounded) + '원';

    var lines = [];
    if (r.winner === 'lump') {
      lines.push('같은 ' + wonShort(r.total) + '을 같은 금리로 굴리면 예금이 <strong>' + won(diff) +
        '원</strong> 더 받습니다. 적금은 돈이 매달 나눠 들어가 평균 잔액이 작기 때문입니다.');
    } else if (r.winner === 'installment') {
      lines.push('이 조건에서는 적금이 <strong>' + won(-diff) + '원</strong> 더 받습니다. 금리나 기간 조건이 특이한 경우이니 입력값을 확인해 보세요.');
    } else {
      lines.push('두 방식의 만기 수령액이 같습니다.');
    }
    if (r.months >= 12 && r.winner === 'lump') {
      lines.push('세전 이자만 보면 예금 ' + won(r.lump.grossInterest) + '원 vs 적금 ' +
        won(r.installment.grossInterest) + '원으로, 적금 이자가 예금의 ' +
        Math.round(r.installment.grossInterest / (r.lump.grossInterest || 1) * 100) + '% 수준입니다.');
    }
    el.cmpInsight.innerHTML = lines.join(' ');

    var table = S.compareTable({ total: r.total, annualRate: r.annualRate, method: r.method, tax: r.tax });
    el.cmpTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = t.months === r.months;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + t.months + '개월</th>' +
        '<td>' + won(t.lump) + '원</td>' +
        '<td>' + won(t.installment) + '원</td>' +
        '<td>' + won(t.diff) + '원</td></tr>';
    }).join('');
  }

  function compareShareText() {
    var c = state.cmp;
    var r = S.compare({ total: c.total, months: c.months, annualRate: c.rate, method: c.method, tax: c.tax });
    var lines = [
      '2026 예금 vs 적금 비교 (같은 총납입액, 모의 계산)',
      '· 총 ' + wonShort(r.total) + ' · ' + r.months + '개월 · 연 ' + percent(r.annualRate) + ' ' + r.methodLabel +
        ' · ' + r.taxLabel + ' ' + r.taxShort,
      '· 예금(거치) 만기 ' + won(r.lump.maturity) + '원',
      '· 적금(월 ' + won(r.monthlyRounded) + '원) 만기 ' + won(r.installment.maturity) + '원',
      '· 차이 ' + won(Math.abs(r.diff)) + '원 (' + (r.winner === 'lump' ? '예금 유리' : (r.winner === 'installment' ? '적금 유리' : '같음')) + ')'
    ];
    var url = shareUrl();
    if (url) lines.push('', '예적금·비과세 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 3: 목돈 역산 ─────────────────────────────────── */
  function syncGoalForm() {
    var g = state.gl;
    el.glTarget.value = String(Math.round(g.target));
    el.glMonths.value = String(Math.round(g.months));
    el.glRate.value = String(g.rate);
    el.glTargetBadge.textContent = wonShort(g.target);
    el.glMonthsBadge.textContent = g.months + '개월';
    el.glRateBadge.textContent = '연 ' + percent(g.rate);
    syncSegments('glmethod', g.method);
    syncSegments('gltax', g.tax);
    syncChips('gl-target', g.target);
    syncChips('gl-months', g.months);
    syncChips('gl-rate', g.rate);
  }

  function renderGoal() {
    var g = state.gl;
    var r = S.goal({
      target: g.target, months: g.months, annualRate: g.rate, method: g.method, tax: g.tax
    });

    el.glMonthly.textContent = won(r.monthlyUp);
    el.glSub.textContent = '목표 ' + wonShort(r.target) + ' · ' + r.months + '개월 · 연 ' +
      percent(r.annualRate) + ' ' + r.methodLabel + ' · ' + r.taxLabel;
    el.glBadge.textContent = r.methodLabel + ' 적립';
    el.glBadge.setAttribute('data-tier', r.taxRate <= 9.5 ? '1' : '2');

    var rows = '';
    rows += row('필요 월 납입액', won(r.monthly) + '원', '1만원 단위 올림 ' + won(r.monthlyUp) + '원');
    rows += row('그때 총 납입 원금', won(r.checkMonthly.principal) + '원', r.months + '개월 적립');
    rows += row('그때 세전 이자', won(r.checkMonthly.grossInterest) + '원', '연 ' + percent(r.annualRate) + ' ' + r.methodLabel);
    rows += row('그때 세후 이자', won(r.checkMonthly.netInterest) + '원', '세금 ' + won(r.checkMonthly.taxAmount) + '원 제외');
    rows += row('그때 만기 수령액', won(r.checkMonthly.maturity) + '원', '목표 ' + wonShort(r.target) + ' 대비', 'total');
    rows += row('예금으로 한 번에 넣는다면', won(r.lumpUp) + '원', '1만원 단위 올림 · 만기 ' + won(r.checkLump.maturity) + '원');
    el.glRows.innerHTML = rows;

    el.glTargetStat.textContent = won(r.target) + '원';
    el.glTotalPaid.textContent = won(r.checkMonthly.principal) + '원';
    el.glGrossNeeded.textContent = won(r.checkMonthly.grossInterest) + '원';
    el.glLump.textContent = won(r.lumpUp) + '원';

    var lines = [];
    lines.push('목표 <strong>' + wonShort(r.target) + '</strong>을 ' + r.months + '개월 안에 모으려면 매달 <strong>' +
      won(r.monthlyUp) + '원</strong>씩 넣으면 됩니다. 세전 이자 ' + won(r.checkMonthly.grossInterest) +
      '원이 붙고, 세금 ' + won(r.checkMonthly.taxAmount) + '원을 떼고도 목표를 넘깁니다.');
    if (r.lumpUp > 0) {
      lines.push('이미 목돈이 있다면 지금 <strong>' + won(r.lumpUp) + '원</strong>을 예금에 한 번에 넣는 것으로 같은 목표를 채울 수 있습니다(적립 총액 ' +
        won(r.checkMonthly.principal) + '원보다 ' + won(r.checkMonthly.principal - r.lumpUp) + '원 적습니다).');
    }
    if (r.months <= 12) {
      lines.push('1년 이내라면 이자보다 <strong>납입액 자체</strong>가 목표를 좌우합니다. 금리 1%p 차이보다 매달 1만원을 더 넣는 쪽이 효과가 큽니다.');
    }
    if (r.tax === 'general') {
      lines.push('일반과세 15.4%가 적용된 결과입니다. 비과세종합저축·ISA 대상이라면 필요한 금액이 조금 줄어듭니다.');
    }
    el.glInsight.innerHTML = lines.join(' ');

    var table = S.goalTable({ target: r.target, annualRate: r.annualRate, method: r.method, tax: r.tax });
    el.glTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = t.months === r.months;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + t.months + '개월</th>' +
        '<td>' + won(t.monthlyUp) + '원</td>' +
        '<td>' + won(t.lumpUp) + '원</td></tr>';
    }).join('');
  }

  function goalShareText() {
    var g = state.gl;
    var r = S.goal({ target: g.target, months: g.months, annualRate: g.rate, method: g.method, tax: g.tax });
    var lines = [
      '2026 목돈 역산 (세후 목표, 모의 계산)',
      '· 목표 ' + wonShort(r.target) + ' · ' + r.months + '개월 · 연 ' + percent(r.annualRate) + ' ' + r.methodLabel +
        ' · ' + r.taxLabel + ' ' + r.taxShort,
      '· 필요 월 납입액 ' + won(r.monthlyUp) + '원',
      '· 예금으로 한 번에 ' + won(r.lumpUp) + '원',
      '· 그때 만기 수령액 ' + won(r.checkMonthly.maturity) + '원'
    ];
    var url = shareUrl();
    if (url) lines.push('', '예적금·비과세 계산기 → ' + url);
    return lines.join('\n');
  }

  function shareUrl() {
    return (CFG.siteUrl || '').replace(/\/$/, '') + '/';
  }

  function copyText(text) {
    if (!text) return Promise.reject(new Error('empty'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
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
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#070c16' : '#eef2f7');
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
    el.promoHeading.textContent = coupang.heading || '적금 깨지 않으려면, 고정비부터';
    el.promoSub.textContent = coupang.subheading || '';
    var disclosure = coupang.disclosure || '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
    el.promoDisclosure.textContent = disclosure;
    el.footerDisclosure.textContent = disclosure;
    el.footerDisclosure.hidden = false;
    el.promoList.innerHTML = items.map(function (it) {
      return '<div class="promo-item">' +
        '<span class="promo-thumb" aria-hidden="true">' + (it.emoji || '🧾') + '</span>' +
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
  function setMtProduct(product) {
    state.mt.product = product === 'lump' ? 'lump' : 'installment';
    syncMaturityForm();
    refresh();
  }

  function bindMaturityEvents() {
    $$('.segmented[data-segment="product"] button').forEach(function (b) {
      b.addEventListener('click', function () { setMtProduct(b.getAttribute('data-value')); });
    });
    el.mtAmount.addEventListener('input', function () {
      var v = readNum(el.mtAmount, 0, 0, 10000000000);
      if (state.mt.product === 'lump') state.mt.amountLump = v;
      else state.mt.amountInst = v;
      syncChips('mt-amount', v);
      refresh();
    });
    $$('.chips [data-mt-amount]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = Number(b.getAttribute('data-mt-amount'));
        if (state.mt.product === 'lump') state.mt.amountLump = v;
        else state.mt.amountInst = v;
        el.mtAmount.value = String(v);
        syncChips('mt-amount', v);
        refresh();
      });
    });
    el.mtMonths.addEventListener('input', function () {
      state.mt.months = readNum(el.mtMonths, 12, 1, 120);
      syncChips('mt-months', state.mt.months);
      refresh();
    });
    $$('.chips [data-mt-months]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.mt.months = Number(b.getAttribute('data-mt-months'));
        el.mtMonths.value = String(state.mt.months);
        syncChips('mt-months', state.mt.months);
        refresh();
      });
    });
    el.mtRate.addEventListener('input', function () {
      state.mt.rate = readNum(el.mtRate, 0, 0, 30);
      syncChips('mt-rate', state.mt.rate);
      refresh();
    });
    $$('.chips [data-mt-rate]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.mt.rate = Number(b.getAttribute('data-mt-rate'));
        el.mtRate.value = String(state.mt.rate);
        syncChips('mt-rate', state.mt.rate);
        refresh();
      });
    });
    $$('.segmented[data-segment="mtmethod"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.mt.method = b.getAttribute('data-value') === 'compound' ? 'compound' : 'simple';
        syncSegments('mtmethod', state.mt.method);
        refresh();
      });
    });
    $$('.segmented[data-segment="mttax"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-value');
        if (!S.TAX[v]) return;
        state.mt.tax = v;
        syncSegments('mttax', v);
        refresh();
      });
    });
    el.shareMaturity.addEventListener('click', function () { doShare(maturityShareText()); });
  }

  function bindCompareEvents() {
    el.cmpTotal.addEventListener('input', function () {
      state.cmp.total = readNum(el.cmpTotal, 0, 0, 10000000000);
      syncChips('cmp-total', state.cmp.total);
      refresh();
    });
    $$('.chips [data-cmp-total]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cmp.total = Number(b.getAttribute('data-cmp-total'));
        el.cmpTotal.value = String(state.cmp.total);
        syncChips('cmp-total', state.cmp.total);
        refresh();
      });
    });
    el.cmpMonths.addEventListener('input', function () {
      state.cmp.months = readNum(el.cmpMonths, 12, 1, 120);
      syncChips('cmp-months', state.cmp.months);
      refresh();
    });
    $$('.chips [data-cmp-months]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cmp.months = Number(b.getAttribute('data-cmp-months'));
        el.cmpMonths.value = String(state.cmp.months);
        syncChips('cmp-months', state.cmp.months);
        refresh();
      });
    });
    el.cmpRate.addEventListener('input', function () {
      state.cmp.rate = readNum(el.cmpRate, 0, 0, 30);
      syncChips('cmp-rate', state.cmp.rate);
      refresh();
    });
    $$('.chips [data-cmp-rate]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cmp.rate = Number(b.getAttribute('data-cmp-rate'));
        el.cmpRate.value = String(state.cmp.rate);
        syncChips('cmp-rate', state.cmp.rate);
        refresh();
      });
    });
    $$('.segmented[data-segment="cmpmethod"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cmp.method = b.getAttribute('data-value') === 'compound' ? 'compound' : 'simple';
        syncSegments('cmpmethod', state.cmp.method);
        refresh();
      });
    });
    $$('.segmented[data-segment="cmptax"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-value');
        if (!S.TAX[v]) return;
        state.cmp.tax = v;
        syncSegments('cmptax', v);
        refresh();
      });
    });
    el.shareCompare.addEventListener('click', function () { doShare(compareShareText()); });
  }

  function bindGoalEvents() {
    el.glTarget.addEventListener('input', function () {
      state.gl.target = readNum(el.glTarget, 0, 0, 100000000000);
      syncChips('gl-target', state.gl.target);
      refresh();
    });
    $$('.chips [data-gl-target]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gl.target = Number(b.getAttribute('data-gl-target'));
        el.glTarget.value = String(state.gl.target);
        syncChips('gl-target', state.gl.target);
        refresh();
      });
    });
    el.glMonths.addEventListener('input', function () {
      state.gl.months = readNum(el.glMonths, 12, 1, 120);
      syncChips('gl-months', state.gl.months);
      refresh();
    });
    $$('.chips [data-gl-months]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gl.months = Number(b.getAttribute('data-gl-months'));
        el.glMonths.value = String(state.gl.months);
        syncChips('gl-months', state.gl.months);
        refresh();
      });
    });
    el.glRate.addEventListener('input', function () {
      state.gl.rate = readNum(el.glRate, 0, 0, 30);
      syncChips('gl-rate', state.gl.rate);
      refresh();
    });
    $$('.chips [data-gl-rate]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gl.rate = Number(b.getAttribute('data-gl-rate'));
        el.glRate.value = String(state.gl.rate);
        syncChips('gl-rate', state.gl.rate);
        refresh();
      });
    });
    $$('.segmented[data-segment="glmethod"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gl.method = b.getAttribute('data-value') === 'compound' ? 'compound' : 'simple';
        syncSegments('glmethod', state.gl.method);
        refresh();
      });
    });
    $$('.segmented[data-segment="gltax"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-value');
        if (!S.TAX[v]) return;
        state.gl.tax = v;
        syncSegments('gltax', v);
        refresh();
      });
    });
    el.shareGoal.addEventListener('click', function () { doShare(goalShareText()); });
  }

  function refreshBasics() {
    var m = state.mt;
    el.mtMonthsBadge.textContent = m.months + '개월';
    el.mtRateBadge.textContent = '연 ' + percent(m.rate);
    var c = state.cmp;
    el.cmpMonthsBadge.textContent = c.months + '개월';
    el.cmpRateBadge.textContent = '연 ' + percent(c.rate);
    var g = state.gl;
    el.glTargetBadge.textContent = wonShort(g.target);
    el.glMonthsBadge.textContent = g.months + '개월';
    el.glRateBadge.textContent = '연 ' + percent(g.rate);
  }

  function refresh() {
    refreshBasics();
    renderMaturity();
    renderCompare();
    renderGoal();
    saveState();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    el.appVersion.textContent = CFG.version || '1.0.0';
    el.dataDate.textContent = S.DATA_DATE;
    el.dataDate.setAttribute('datetime', S.DATA_DATE);

    syncMaturityForm();
    syncCompareForm();
    syncGoalForm();
    bindMaturityEvents();
    bindCompareEvents();
    bindGoalEvents();
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
