/*!
 * app.js — 전세·월세 전환·주거비 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var H = window.RentCalc;
  var CFG = window.APP_CONFIG || {};
  if (!H) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'rln.state.v1';
  var THEME_KEY = 'rln.theme';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function won(n) { return nf.format(Math.round(n)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function pct(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return v.toFixed(digits === undefined ? 2 : digits) + '%';
  }

  /** 3억 5,000만원 · 2,400만원 · 85만원처럼 읽기 쉽게 */
  function wonShort(v) {
    var n = Math.round(Math.abs(v));
    var sign = v < 0 ? '-' : '';
    if (n >= 100000000) {
      var eok = Math.floor(n / 100000000);
      var man = Math.round((n % 100000000) / 10000);
      if (man === 0) return sign + eok + '억원';
      return sign + eok + '억 ' + nf.format(man) + '만원';
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
    tab: 'convert',
    convert: {
      direction: 'to-monthly',
      jeonse: 300000000,
      deposit: 30000000,
      monthly: 950000,
      rateMode: 'legal',
      marketRate: 4.31,
      customRate: 5.25,
      years: 2
    },
    compare: {
      jeonse: 300000000,
      loan: 120000000,
      loanMode: 'butimok',
      customRate: 3.2,
      income: 45000000,
      capital: true,
      newlywed: false,
      equityRate: 3,
      deposit: 30000000,
      rent: 950000,
      months: 24
    },
    loan: {
      principal: 300000000,
      rate: 4.98,
      years: 30,
      method: 'equal',
      income: 60000000
    }
  };

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    var c = raw.convert;
    if (c && typeof c === 'object') {
      if (c.direction === 'to-jeonse' || c.direction === 'to-monthly') state.convert.direction = c.direction;
      ['jeonse', 'deposit', 'monthly', 'marketRate', 'customRate'].forEach(function (k) {
        var v = parseFloat(c[k]);
        if (isFinite(v) && v >= 0) state.convert[k] = v;
      });
      if (c.rateMode === 'legal' || c.rateMode === 'market' || c.rateMode === 'custom') state.convert.rateMode = c.rateMode;
      var y = parseInt(c.years, 10);
      if (isFinite(y) && [1, 2, 3, 4].indexOf(y) >= 0) state.convert.years = y;
    }

    var m = raw.compare;
    if (m && typeof m === 'object') {
      ['jeonse', 'loan', 'income', 'equityRate', 'deposit', 'rent', 'customRate'].forEach(function (k) {
        var v = parseFloat(m[k]);
        if (isFinite(v) && v >= 0) state.compare[k] = v;
      });
      if (m.loanMode === 'butimok' || m.loanMode === 'bank' || m.loanMode === 'custom') state.compare.loanMode = m.loanMode;
      if (typeof m.capital === 'boolean') state.compare.capital = m.capital;
      if (typeof m.newlywed === 'boolean') state.compare.newlywed = m.newlywed;
      var mo = parseInt(m.months, 10);
      if (isFinite(mo) && [12, 24, 36, 60].indexOf(mo) >= 0) state.compare.months = mo;
    }

    var l = raw.loan;
    if (l && typeof l === 'object') {
      ['principal', 'rate', 'income'].forEach(function (k) {
        var v = parseFloat(l[k]);
        if (isFinite(v) && v >= 0) state.loan[k] = v;
      });
      var ly = parseInt(l.years, 10);
      if (isFinite(ly) && [10, 15, 20, 25, 30, 35, 40].indexOf(ly) >= 0) state.loan.years = ly;
      if (l.method === 'equal' || l.method === 'principal') state.loan.method = l.method;
    }

    if (raw.tab === 'compare' || raw.tab === 'loan' || raw.tab === 'convert') state.tab = raw.tab;
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
    el.tabConvert = $('#tabConvert');
    el.tabCompare = $('#tabCompare');
    el.tabLoan = $('#tabLoan');
    el.panelConvert = $('#panelConvert');
    el.panelCompare = $('#panelCompare');
    el.panelLoan = $('#panelLoan');

    el.cvJeonseField = $('#cvJeonseField');
    el.cvJeonse = $('#cvJeonse');
    el.cvJeonseLabel = $('#cvJeonseLabel');
    el.cvDeposit = $('#cvDeposit');
    el.cvDepositLabel = $('#cvDepositLabel');
    el.cvMonthlyField = $('#cvMonthlyField');
    el.cvMonthly = $('#cvMonthly');
    el.cvRateBadge = $('#cvRateBadge');
    el.cvRateAuto = $('#cvRateAuto');
    el.cvRateValue = $('#cvRateValue');
    el.cvRateBand = $('#cvRateBand');
    el.cvRateInputWrap = $('#cvRateInputWrap');
    el.cvRateInput = $('#cvRateInput');
    el.cvMarketTable = $('#cvMarketTable');
    el.cvYears = $('#cvYears');
    el.cvDiffBadge = $('#cvDiffBadge');
    el.cvDiffAmount = $('#cvDiffAmount');

    el.cvResultLabel = $('#cvResultLabel');
    el.cvResult = $('#cvResult');
    el.cvResultUnit = $('#cvResultUnit');
    el.cvSub = $('#cvSub');
    el.cvBadge = $('#cvBadge');
    el.cvRows = $('#cvRows');
    el.cvLegalMonthly = $('#cvLegalMonthly');
    el.cvAnnual = $('#cvAnnual');
    el.cvPeriodLabel = $('#cvPeriodLabel');
    el.cvPeriodTotal = $('#cvPeriodTotal');
    el.cvDiff = $('#cvDiff');
    el.cvInsight = $('#cvInsight');
    el.cvRateTable = $('#cvRateTable');
    el.shareConvert = $('#shareConvert');

    el.cmpJeonse = $('#cmpJeonse');
    el.cmpGapBadge = $('#cmpGapBadge');
    el.cmpLoan = $('#cmpLoan');
    el.cmpLoanHelp = $('#cmpLoanHelp');
    el.fillButimok = $('#fillButimok');
    el.cmpRateBadge = $('#cmpRateBadge');
    el.cmpRateAuto = $('#cmpRateAuto');
    el.cmpRateValue = $('#cmpRateValue');
    el.cmpRateBand = $('#cmpRateBand');
    el.cmpRateInputWrap = $('#cmpRateInputWrap');
    el.cmpRateInput = $('#cmpRateInput');
    el.cmpIncome = $('#cmpIncome');
    el.cmpNewlywed = $('#cmpNewlywed');
    el.butimokInfo = $('#butimokInfo');
    el.butimokSummary = $('#butimokSummary');
    el.cmpEquityRate = $('#cmpEquityRate');
    el.cmpDeposit = $('#cmpDeposit');
    el.cmpRent = $('#cmpRent');
    el.cmpMonths = $('#cmpMonths');

    el.cmpDiff = $('#cmpDiff');
    el.cmpSub = $('#cmpSub');
    el.cmpBadge = $('#cmpBadge');
    el.cmpJeonseMonthly = $('#cmpJeonseMonthly');
    el.cmpRentMonthly = $('#cmpRentMonthly');
    el.cmpJeonseNote = $('#cmpJeonseNote');
    el.cmpRentNote = $('#cmpRentNote');
    el.cmpBarJeonse = $('#cmpBarJeonse');
    el.cmpBarRent = $('#cmpBarRent');
    el.cmpRows = $('#cmpRows');
    el.cmpBreakRate = $('#cmpBreakRate');
    el.cmpBreakRent = $('#cmpBreakRent');
    el.cmpAnnual = $('#cmpAnnual');
    el.cmpBreakLoanRate = $('#cmpBreakLoanRate');
    el.cmpInsight = $('#cmpInsight');
    el.cmpPeriodTable = $('#cmpPeriodTable');
    el.shareCompare = $('#shareCompare');

    el.lnPrincipal = $('#lnPrincipal');
    el.lnRate = $('#lnRate');
    el.lnYears = $('#lnYears');
    el.lnIncome = $('#lnIncome');
    el.lnResultLabel = $('#lnResultLabel');
    el.lnMonthly = $('#lnMonthly');
    el.lnSub = $('#lnSub');
    el.lnBadge = $('#lnBadge');
    el.lnInterest = $('#lnInterest');
    el.lnTotal = $('#lnTotal');
    el.lnRange = $('#lnRange');
    el.lnDsr = $('#lnDsr');
    el.lnCompareBox = $('#lnCompareBox');
    el.lnCompareText = $('#lnCompareText');
    el.lnInsight = $('#lnInsight');
    el.lnScheduleTable = $('#lnScheduleTable');
    el.shareLoan = $('#shareLoan');

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
  var TABS = ['convert', 'compare', 'loan'];
  function setTab(tab, focus) {
    state.tab = TABS.indexOf(tab) >= 0 ? tab : 'convert';
    var map = { convert: [el.tabConvert, el.panelConvert], compare: [el.tabCompare, el.panelCompare], loan: [el.tabLoan, el.panelLoan] };
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
    el.tabConvert.addEventListener('click', function () { setTab('convert'); });
    el.tabCompare.addEventListener('click', function () { setTab('compare'); });
    el.tabLoan.addEventListener('click', function () { setTab('loan'); });
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
    setTab(TABS.indexOf(hash) >= 0 ? hash : 'convert');
  }

  /* ── 공통 UI ─────────────────────────────────────────── */
  function row(label, value, small) {
    return '<div class="bd-row">' +
      '<span class="bd-label">' + label + (small ? '<small>' + small + '</small>' : '') + '</span>' +
      '<span class="bd-value">' + value + '</span></div>';
  }

  function syncSegments(segment, active) {
    $$('.segmented[data-segment="' + segment + '"] button').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-value') === active);
    });
  }

  /* ── 탭 1: 전환 계산 ─────────────────────────────────── */
  function convertRate() {
    if (state.convert.rateMode === 'legal') return H.legalInfo().rate;
    if (state.convert.rateMode === 'market') return clamp(state.convert.marketRate, 0, 20);
    return clamp(state.convert.customRate, 0.1, 20);
  }

  function convertInput() {
    return {
      direction: state.convert.direction,
      jeonse: state.convert.jeonse,
      deposit: state.convert.deposit,
      monthly: state.convert.monthly,
      rate: convertRate()
    };
  }

  function syncConvertForm() {
    var c = state.convert;
    syncSegments('direction', c.direction);
    syncSegments('cvrate', c.rateMode);
    el.cvJeonse.value = String(Math.round(c.jeonse));
    el.cvDeposit.value = String(Math.round(c.deposit));
    el.cvMonthly.value = String(Math.round(c.monthly));
    el.cvYears.value = String(c.years);
    el.cvRateInputWrap.hidden = c.rateMode !== 'custom';
    el.cvRateAuto.hidden = c.rateMode === 'custom';
    if (document.activeElement !== el.cvRateInput) el.cvRateInput.value = String(c.customRate);

    var isToMonthly = c.direction === 'to-monthly';
    el.cvJeonseField.hidden = !isToMonthly;
    el.cvMonthlyField.hidden = isToMonthly;
    el.cvDepositLabel.textContent = isToMonthly ? '남길 보증금' : '월세보증금';
    el.cvJeonseLabel.textContent = '전세보증금';

    $$('.chips [data-cv-jeonse]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-cv-jeonse')) === c.jeonse);
    });
    $$('.chips [data-cv-deposit]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-cv-deposit')) === c.deposit);
    });
  }

  function renderMarketTable() {
    el.cvMarketTable.innerHTML = H.MARKET_RATES.map(function (m) {
      return '<tr><th scope="row">' + m.label + '</th>' +
        '<td><button type="button" class="link-btn" data-market-rate="' + m.value + '">' + m.value.toFixed(2) + '%</button></td>' +
        '<td>' + m.note + '</td></tr>';
    }).join('');
  }

  function renderConvert() {
    var c = state.convert;
    var rate = convertRate();
    var conv = H.convert(convertInput());
    var legalRate = H.legalInfo().rate;

    /* 전환율 표시 */
    if (c.rateMode === 'legal') {
      el.cvRateValue.textContent = legalRate.toFixed(2) + '%';
      el.cvRateBand.textContent = '기준금리 ' + H.RATE.bokBase + '% + 2%p (법정 상한)';
      el.cvRateBadge.textContent = '법정 상한';
      el.cvRateBadge.classList.remove('is-on');
    } else if (c.rateMode === 'market') {
      var market = H.MARKET_RATES.filter(function (m) { return Math.abs(m.value - c.marketRate) < 0.001; })[0];
      el.cvRateValue.textContent = c.marketRate.toFixed(2) + '%';
      el.cvRateBand.textContent = (market ? market.label + ' · ' + market.note : '시장 전환율');
      el.cvRateBadge.textContent = c.marketRate > legalRate ? '법정 초과' : '법정 이내';
      el.cvRateBadge.classList.toggle('is-on', c.marketRate > legalRate);
    } else {
      el.cvRateValue.textContent = rate.toFixed(2) + '%';
      el.cvRateBand.textContent = '직접 입력한 전환율';
      el.cvRateBadge.textContent = rate > legalRate ? '법정 초과' : '법정 이내';
      el.cvRateBadge.classList.toggle('is-on', rate > legalRate);
    }

    var isToMonthly = c.direction === 'to-monthly';
    var jeonse = isToMonthly ? c.jeonse : (conv.jeonse || 0);
    var diff = Math.max(0, jeonse - c.deposit);
    var legal = H.legalCheck({ jeonse: jeonse, deposit: c.deposit, monthly: conv.monthly });

    /* 결과 */
    if (isToMonthly) {
      el.cvResultLabel.textContent = '전환하면 월세는';
      el.cvResult.textContent = won(conv.monthly);
      el.cvResultUnit.textContent = '원 / 월';
    } else {
      el.cvResultLabel.textContent = '전환하면 전세보증금은';
      el.cvResult.textContent = conv.converted === null ? '—' : won(conv.converted);
      el.cvResultUnit.textContent = '원';
    }
    el.cvSub.textContent = isToMonthly
      ? '전세 ' + wonShort(jeonse) + ' · 보증금 ' + wonShort(c.deposit) + ' · 전환율 ' + rate.toFixed(2) + '%'
      : '보증금 ' + wonShort(c.deposit) + ' · 월세 ' + wonShort(conv.monthly) + ' · 전환율 ' + rate.toFixed(2) + '%';

    el.cvBadge.textContent = legal.over ? '법정 초과' : '법정 이내';
    el.cvBadge.setAttribute('data-tier', legal.over ? '3' : '1');

    el.cvDiffBadge.textContent = '전환 대상 ' + wonShort(diff);
    el.cvDiffAmount.textContent = jeonse > 0 ? '전세의 ' + Math.round(c.deposit / jeonse * 100) + '%' : '—';

    el.cvRows.innerHTML =
      row('전세보증금', wonShort(jeonse)) +
      row(isToMonthly ? '남길 보증금' : '월세보증금', wonShort(c.deposit)) +
      row('전환 대상 보증금', wonShort(diff), '전세보증금 − 보증금') +
      row('적용 전환율', rate.toFixed(2) + '%', '법정 상한 ' + legalRate.toFixed(2) + '%') +
      row('법정 상한 월세', won(legal.legalMonthly) + '원', '연 ' + won(legal.legalMonthly * 12) + '원') +
      '<div class="bd-row total"><span class="bd-label">' + (isToMonthly ? '계산된 월세' : '계산된 전세보증금') +
      '</span><span class="bd-value">' + (isToMonthly ? won(conv.monthly) + '원' : wonShort(conv.converted)) + '</span></div>';

    el.cvLegalMonthly.textContent = won(legal.legalMonthly) + '원';
    el.cvAnnual.textContent = won(conv.monthly * 12) + '원';
    el.cvPeriodLabel.textContent = c.years + '년 합계';
    el.cvPeriodTotal.textContent = won(conv.monthly * 12 * c.years) + '원';
    el.cvDiff.textContent = wonShort(diff);

    var notes = [];
    if (legal.over) {
      notes.push('<strong>법정 상한보다 ' + (rate - legalRate).toFixed(2) + '%p 높습니다.</strong> 월세가 ' +
        won(legal.overMonthly) + '원, 연 ' + won(legal.overAnnual) + '원 많습니다. 존속 중인 계약이라면 초과분의 반환을 청구할 수 있습니다.');
    } else if (rate < legalRate) {
      notes.push('법정 상한 ' + legalRate.toFixed(2) + '%보다 ' + (legalRate - rate).toFixed(2) +
        '%p 낮은 전환율입니다. 월세로 돌리면 월 ' + won(conv.monthly) + '원입니다.');
    } else {
      notes.push('법정 상한과 같은 ' + legalRate.toFixed(2) + '%를 적용했습니다. 이보다 높은 전환율은 존속 계약에서 효력이 없습니다.');
    }
    if (diff <= 0) {
      notes.push('전환 대상 보증금이 0원입니다. 남길 보증금을 전세보증금보다 작게 입력하세요.');
    }
    if (!isToMonthly && conv.converted === null) {
      notes.push('전환율이 0%이면 월세를 전세로 바꿀 수 없습니다. 0.1% 이상을 입력하세요.');
    }
    el.cvInsight.innerHTML = notes.join(' ');
    el.cvInsight.classList.toggle('is-warn', legal.over || diff <= 0);
    el.cvInsight.classList.toggle('is-ok', !legal.over && diff > 0);

    /* 전환율별 표 */
    var rows = H.conversionTable(jeonse, c.deposit).map(function (t) {
      var isCurrent = Math.abs(t.rate - rate) < 0.005;
      return '<tr' + (isCurrent ? ' style="background:var(--brand-soft)"' : '') + '>' +
        '<th scope="row">' + t.rate.toFixed(2) + '%' + (isCurrent ? ' (적용)' : '') + '</th>' +
        '<td>' + won(t.monthly) + '원</td><td>' + won(t.annual) + '원</td></tr>';
    }).join('');
    el.cvRateTable.tBodies[0].innerHTML = rows;
  }

  /* ── 탭 2: 전세 vs 월세 ──────────────────────────────── */
  function butimokInfo() {
    var c = state.compare;
    return H.butimok({
      income: c.income,
      deposit: c.jeonse,
      capitalArea: c.capital,
      newlywed: c.newlywed,
      netAssets: 0
    });
  }

  function compareRateInfo() {
    var c = state.compare;
    if (c.loanMode === 'bank') {
      return { rate: H.RATE.bankJeonse, source: 'bank', butimok: butimokInfo() };
    }
    if (c.loanMode === 'custom') {
      return { rate: clamp(c.customRate, 0.1, 20), source: 'custom', butimok: butimokInfo() };
    }
    var info = butimokInfo();
    if (info.rate === null) {
      return { rate: H.RATE.bankJeonse, source: 'fallback', butimok: info };
    }
    return { rate: info.rate, source: 'butimok', butimok: info };
  }

  function compareInput() {
    return {
      jeonse: state.compare.jeonse,
      loan: state.compare.loan,
      loanRate: compareRateInfo().rate,
      equityRate: state.compare.equityRate,
      monthlyDeposit: state.compare.deposit,
      monthlyRent: state.compare.rent,
      months: state.compare.months
    };
  }

  function syncCompareForm() {
    var c = state.compare;
    syncSegments('loanrate', c.loanMode);
    syncSegments('area', c.capital ? 'capital' : 'local');
    el.cmpJeonse.value = String(Math.round(c.jeonse));
    el.cmpLoan.value = String(Math.round(c.loan));
    el.cmpIncome.value = String(Math.round(c.income));
    el.cmpNewlywed.checked = c.newlywed;
    el.cmpEquityRate.value = String(c.equityRate);
    el.cmpDeposit.value = String(Math.round(c.deposit));
    el.cmpRent.value = String(Math.round(c.rent));
    el.cmpMonths.value = String(c.months);
    el.cmpRateInputWrap.hidden = c.loanMode !== 'custom';
    el.cmpRateAuto.hidden = c.loanMode === 'custom';
    if (document.activeElement !== el.cmpRateInput) el.cmpRateInput.value = String(c.customRate);
    $$('.chips [data-cmp-jeonse]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-cmp-jeonse')) === c.jeonse);
    });
    $$('.chips [data-cmp-income]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-cmp-income')) === c.income);
    });
  }

  function renderCompare() {
    var c = state.compare;
    var info = compareRateInfo();
    var rate = info.rate;
    var bm = info.butimok;

    /* 금리 표시 */
    if (c.loanMode === 'custom') {
      el.cmpRateValue.textContent = rate.toFixed(2) + '%';
      el.cmpRateBand.textContent = '직접 입력한 금리';
    } else if (c.loanMode === 'bank') {
      el.cmpRateValue.textContent = H.RATE.bankJeonse.toFixed(2) + '%';
      el.cmpRateBand.textContent = '은행권 전세자금대출 평균 (2026.10)';
    } else if (info.source === 'fallback') {
      el.cmpRateValue.textContent = H.RATE.bankJeonse.toFixed(2) + '%';
      el.cmpRateBand.textContent = '버팀목 대상 아님 · 시중 평균으로 계산';
    } else {
      el.cmpRateValue.textContent = rate.toFixed(2) + '%';
      el.cmpRateBand.textContent = bm.band.label + ' · 보증금 ' + bm.depositBand + (c.capital ? '' : ' · 지방 0.2%p 인하');
    }
    el.cmpRateBadge.textContent = c.loanMode === 'butimok' ? '버팀목' : (c.loanMode === 'bank' ? '시중' : '직접');

    el.butimokSummary.textContent = (bm.rate === null ? '대상 확인' : bm.rate.toFixed(2) + '%') + ' · ' + wonShort(bm.cap);
    el.butimokInfo.innerHTML = bm.reasons.length
      ? bm.reasons.map(function (r) { return '· ' + r.text; }).join('<br>')
      : '한도 ' + wonShort(bm.cap) + ' (호당 ' + wonShort(bm.limit) + ' · 보증금의 ' +
        Math.round(bm.ratio * 100) + '% ' + wonShort(bm.byRatio) + ' 중 작은 금액)';

    var res = H.compareHousing(compareInput());

    /* 결과 */
    var absDiff = Math.abs(res.diff);
    el.cmpDiff.textContent = won(absDiff);
    el.cmpSub.textContent = '전세 월 ' + won(res.jeonseMonthly) + '원 vs 월세 월 ' + won(res.rentMonthly) + '원';
    if (res.cheaper === 'jeonse') {
      el.cmpBadge.textContent = '전세 유리';
      el.cmpBadge.setAttribute('data-tier', '1');
    } else if (res.cheaper === 'rent') {
      el.cmpBadge.textContent = '월세 유리';
      el.cmpBadge.setAttribute('data-tier', '3');
    } else {
      el.cmpBadge.textContent = '비슷함';
      el.cmpBadge.setAttribute('data-tier', '2');
    }

    var maxMonthly = Math.max(res.jeonseMonthly, res.rentMonthly, 1);
    el.cmpJeonseMonthly.textContent = won(res.jeonseMonthly) + '원';
    el.cmpRentMonthly.textContent = won(res.rentMonthly) + '원';
    el.cmpJeonseNote.textContent = '대출이자 ' + won(res.loanMonthly) + ' + 기회비용 ' + won(res.equityMonthly);
    el.cmpRentNote.textContent = '월세 ' + won(res.rent) + ' + 기회비용 ' + won(res.depositCost);
    el.cmpBarJeonse.style.width = (res.jeonseMonthly / maxMonthly * 100) + '%';
    el.cmpBarRent.style.width = (res.rentMonthly / maxMonthly * 100) + '%';
    $$('.compare-row').forEach(function (rowEl) {
      rowEl.classList.toggle('is-cheaper', res.cheaper !== 'same' && rowEl.getAttribute('data-who') === res.cheaper);
    });

    el.cmpRows.innerHTML =
      row('전세 대출이자', won(res.loanMonthly) + '원', wonShort(res.loan) + ' × ' + rate.toFixed(2) + '%') +
      row('전세 자기자본 기회비용', won(res.equityMonthly) + '원', wonShort(res.equity) + ' × ' + res.equityRate.toFixed(1) + '%') +
      row('전세 월 주거비', won(res.jeonseMonthly) + '원', '이자 + 기회비용') +
      row('월세', won(res.rent) + '원') +
      row('월세보증금 기회비용', won(res.depositCost) + '원', wonShort(res.deposit) + ' × ' + res.equityRate.toFixed(1) + '%') +
      '<div class="bd-row total"><span class="bd-label">월세 월 주거비</span><span class="bd-value">' +
      won(res.rentMonthly) + '원</span></div>';

    el.cmpBreakRate.textContent = res.breakEvenRate === null ? '—' : pct(res.breakEvenRate, 2);
    el.cmpBreakRent.textContent = won(res.breakEvenRent) + '원';
    el.cmpAnnual.textContent = (res.diff >= 0 ? '' : '-') + wonShort(Math.abs(res.annualDiff));
    el.cmpBreakLoanRate.textContent = res.breakEvenLoanRate === null ? '—' : pct(res.breakEvenLoanRate, 2);

    el.cmpGapBadge.textContent = '월세와 ' + wonShort(Math.max(0, res.jeonse - res.deposit)) + ' 차이';

    /* 대출 한도 안내 */
    if (c.loanMode === 'butimok' && info.source === 'butimok' && res.loan > bm.cap + 1) {
      el.cmpLoanHelp.textContent = '버팀목 한도 ' + wonShort(bm.cap) + '를 넘었습니다. 초과분은 시중 금리로 빌려야 할 수 있습니다.';
      el.cmpLoanHelp.classList.add('is-warn-text');
    } else {
      el.cmpLoanHelp.textContent = '전세대출은 이자만 내고 만기에 보증금으로 원금을 돌려받는 구조로 계산합니다.';
      el.cmpLoanHelp.classList.remove('is-warn-text');
    }

    /* 인사이트 */
    var implied = res.jeonse > res.deposit ? res.rent * 12 / (res.jeonse - res.deposit) * 100 : null;
    var notes = [];
    if (res.cheaper === 'jeonse') {
      notes.push('<strong>전세가 월 ' + won(absDiff) + '원(연 ' + wonShort(Math.abs(res.annualDiff)) +
        ') 저렴합니다.</strong> 지금 월세 조건은 전환율 ' + (implied === null ? '—' : pct(implied, 2)) +
        ' 수준이고, 손익분기 전환율 ' + pct(res.breakEvenRate, 2) + '보다 ' +
        (implied !== null && implied > res.breakEvenRate ? '높아 전세가 유리합니다.' : '낮아 조건에 따라 달라질 수 있습니다.'));
    } else if (res.cheaper === 'rent') {
      notes.push('<strong>월세가 월 ' + won(absDiff) + '원(연 ' + wonShort(Math.abs(res.annualDiff)) +
        ') 저렴합니다.</strong> 전세대출 금리가 오르면 차이는 더 벌어집니다. 손익분기 전환율은 ' +
        pct(res.breakEvenRate, 2) + '입니다.');
    } else {
      notes.push('두 조건의 월 주거비가 거의 같습니다. 이사비·중개보수·보증금 반환 위험까지 보면 월세 쪽이 편할 수 있습니다.');
    }
    if (res.breakEvenLoanRate !== null && rate > res.breakEvenLoanRate) {
      notes.push('지금 대출금리 ' + pct(rate, 2) + '가 손익분기 대출금리 ' + pct(res.breakEvenLoanRate, 2) +
        '보다 높아, 금리만 보면 월세가 유리한 구간입니다.');
    }
    if (info.source === 'fallback') {
      notes.push('입력한 소득·보증금으로는 버팀목 대상이 아니어서 시중 평균 금리로 계산했습니다.');
    }
    if (res.loan > bm.cap + 1 && c.loanMode === 'butimok') {
      notes.push('버팀목 한도를 넘는 대출금은 실제로는 더 높은 금리가 적용됩니다.');
    }
    el.cmpInsight.innerHTML = notes.join(' ');
    el.cmpInsight.classList.toggle('is-warn', res.cheaper === 'rent' || info.source === 'fallback');
    el.cmpInsight.classList.toggle('is-ok', res.cheaper === 'jeonse' && info.source !== 'fallback');

    /* 기간별 누적 */
    el.cmpPeriodTable.tBodies[0].innerHTML = [12, 24, 36, 60].map(function (m) {
      var j = res.jeonseMonthly * m;
      var r = res.rentMonthly * m;
      return '<tr><th scope="row">' + (m / 12) + '년</th><td>' + won(j) + '</td><td>' + won(r) +
        '</td><td>' + (j <= r ? '+' : '-') + won(Math.abs(r - j)) + '</td></tr>';
    }).join('');
  }

  /* ── 탭 3: 주담대 상환 ───────────────────────────────── */
  function loanInput() {
    return {
      principal: state.loan.principal,
      rate: state.loan.rate,
      years: state.loan.years,
      method: state.loan.method,
      income: state.loan.income
    };
  }

  function syncLoanForm() {
    var l = state.loan;
    el.lnPrincipal.value = String(Math.round(l.principal));
    el.lnRate.value = String(l.rate);
    el.lnYears.value = String(l.years);
    el.lnIncome.value = String(Math.round(l.income));
    syncSegments('method', l.method);
    $$('.chips [data-ln-principal]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-ln-principal')) === l.principal);
    });
  }

  function renderLoan() {
    var l = state.loan;
    var res = H.loanSummary(loanInput());
    var s = res.summary;

    el.lnResultLabel.textContent = s.method === 'principal' ? '월 상환액 (첫 달)' : '월 상환액';
    el.lnMonthly.textContent = won(s.monthlyFirst);
    el.lnSub.textContent = wonShort(s.principal) + ' · ' + s.years + '년 · ' + s.methodLabel + ' · ' + s.rate.toFixed(2) + '%';
    el.lnBadge.textContent = s.methodLabel;
    el.lnBadge.setAttribute('data-tier', s.method === 'equal' ? '1' : '2');

    el.lnInterest.textContent = won(s.totalInterest) + '원';
    el.lnTotal.textContent = won(s.totalPayment) + '원';
    el.lnRange.textContent = Math.round(s.monthlyFirst) === Math.round(s.monthlyLast)
      ? won(s.monthlyFirst) + '원 (고정)'
      : wonShort(s.monthlyFirst) + ' → ' + wonShort(s.monthlyLast);
    el.lnDsr.textContent = s.dsr === null ? '—' : pct(s.dsr, 1);
    el.lnDsr.style.color = (s.dsr !== null && s.dsr > 40) ? 'var(--hot)' : '';

    var otherLabel = s.method === 'equal' ? '원금균등' : '원리금균등';
    var saving = res.compare.interestSaving;
    if (s.method === 'equal') {
      el.lnCompareText.innerHTML = '원금균등으로 바꾸면 총 이자가 <strong>' + won(saving) + '원</strong> 줄어듭니다. ' +
        '대신 첫 달 상환액은 <strong>' + won(res.compare.firstMonthDiff) + '원</strong> 늘어납니다.';
    } else {
      el.lnCompareText.innerHTML = '원리금균등으로 바꾸면 총 이자가 <strong>' + won(saving) + '원</strong> 늘어나는 대신, ' +
        '첫 달 상환액이 <strong>' + won(res.compare.firstMonthDiff) + '원</strong> 줄어듭니다.';
    }
    el.lnCompareBox.hidden = saving <= 0;

    var notes = [];
    if (s.dsr !== null && s.dsr > 40) {
      notes.push('<strong>DSR ' + pct(s.dsr, 1) + '</strong>로 일반적인 관리 기준 40%를 넘습니다. 기간을 늘리거나 대출금을 줄여 보세요.');
    } else if (s.dsr !== null) {
      notes.push('이 대출 하나의 DSR은 <strong>' + pct(s.dsr, 1) + '</strong>입니다. 실제 심사는 신용대출 등 모든 대출을 합산합니다.');
    }
    if (s.rate >= 5) {
      notes.push('금리가 5%를 넘습니다. 1%p 오르면 월 상환액이 약 ' +
        won(H.equalPayment(s.principal, s.rate + 1, s.months) - s.monthlyFirst) + '원 늘어납니다.');
    }
    el.lnInsight.innerHTML = notes.join(' ');
    el.lnInsight.classList.toggle('is-warn', s.dsr !== null && s.dsr > 40);

    el.lnScheduleTable.tBodies[0].innerHTML = res.years.map(function (y) {
      return '<tr><th scope="row">' + y.year + '년</th><td>' + won(y.principal) +
        '</td><td>' + won(y.interest) + '</td><td>' + won(y.balance) + '</td></tr>';
    }).join('');
  }

  function refresh() {
    renderConvert();
    renderCompare();
    renderLoan();
    saveState();
  }

  /* ── 공유 ─────────────────────────────────────────────── */
  function shareUrl() {
    var url = (CFG.siteUrl || '').trim();
    if (url && /^https?:\/\//.test(url)) return url.replace(/\/?$/, '/');
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return location.origin + location.pathname;
    }
    return '';
  }

  function convertShareText() {
    var c = state.convert;
    var rate = convertRate();
    var conv = H.convert(convertInput());
    var lines = c.direction === 'to-monthly'
      ? [
          '🔄 전세 → 월세 전환',
          '· 전세 ' + wonShort(c.jeonse) + ' · 남길 보증금 ' + wonShort(c.deposit),
          '· 전환 대상 ' + wonShort(Math.max(0, c.jeonse - c.deposit)) + ' × ' + rate.toFixed(2) + '%',
          '· 월세 ' + won(conv.monthly) + '원 (연 ' + won(conv.monthly * 12) + '원)'
        ]
      : [
          '🔄 월세 → 전세 전환',
          '· 월세보증금 ' + wonShort(c.deposit) + ' · 월세 ' + wonShort(conv.monthly),
          '· 전환율 ' + rate.toFixed(2) + '%',
          '· 전세보증금 ' + (conv.converted === null ? '—' : wonShort(conv.converted))
        ];
    lines.push('· 법정 상한 ' + H.legalInfo().rate.toFixed(2) + '% (기준금리 ' + H.RATE.bokBase + '% + 2%p)');
    var url = shareUrl();
    if (url) lines.push('', '전세·월세 전환 계산기 → ' + url);
    return lines.join('\n');
  }

  function compareShareText() {
    var res = H.compareHousing(compareInput());
    var lines = [
      '⚖️ 전세 vs 월세 월 주거비',
      '· 전세 ' + wonShort(res.jeonse) + ' (대출 ' + wonShort(res.loan) + ' · ' + res.loanRate.toFixed(2) + '%)',
      '· 전세 월 ' + won(res.jeonseMonthly) + '원 / 월세 월 ' + won(res.rentMonthly) + '원',
      '· 차이 ' + (res.diff >= 0 ? '전세가 ' : '월세가 ') + won(Math.abs(res.diff)) + '원 저렴',
      '· 손익분기 전환율 ' + pct(res.breakEvenRate, 2) + ' · 손익분기 월세 ' + won(res.breakEvenRent) + '원'
    ];
    var url = shareUrl();
    if (url) lines.push('', '전세·월세 전환 계산기 → ' + url);
    return lines.join('\n');
  }

  function loanShareText() {
    var res = H.loanSummary(loanInput());
    var s = res.summary;
    var lines = [
      '🏦 주담대 월 상환액',
      '· ' + wonShort(s.principal) + ' · ' + s.years + '년 · ' + s.methodLabel + ' · ' + s.rate.toFixed(2) + '%',
      '· 월 상환액 ' + won(s.monthlyFirst) + '원',
      '· 총 이자 ' + won(s.totalInterest) + '원',
      '· 총 상환액 ' + won(s.totalPayment) + '원',
      '· DSR(참고) ' + (s.dsr === null ? '—' : pct(s.dsr, 1))
    ];
    var url = shareUrl();
    if (url) lines.push('', '전세·월세 전환 계산기 → ' + url);
    return lines.join('\n');
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
    el.promoHeading.textContent = coupang.heading || '이사 전에 챙기는 것';
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
  function bindConvertEvents() {
    $$('.segmented[data-segment="direction"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.convert.direction = b.getAttribute('data-value') === 'to-jeonse' ? 'to-jeonse' : 'to-monthly';
        syncConvertForm();
        refresh();
      });
    });
    $$('.segmented[data-segment="cvrate"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-value');
        state.convert.rateMode = (v === 'market' || v === 'custom') ? v : 'legal';
        syncConvertForm();
        refresh();
      });
    });
    el.cvJeonse.addEventListener('input', function () {
      state.convert.jeonse = readNum(el.cvJeonse, 0, 0, 3000000000);
      $$('.chips [data-cv-jeonse]').forEach(function (b) {
        b.classList.toggle('is-active', Number(b.getAttribute('data-cv-jeonse')) === state.convert.jeonse);
      });
      refresh();
    });
    $$('.chips [data-cv-jeonse]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.convert.jeonse = Number(b.getAttribute('data-cv-jeonse'));
        el.cvJeonse.value = String(state.convert.jeonse);
        refresh();
      });
    });
    el.cvDeposit.addEventListener('input', function () {
      state.convert.deposit = readNum(el.cvDeposit, 0, 0, 3000000000);
      $$('.chips [data-cv-deposit]').forEach(function (b) {
        b.classList.toggle('is-active', Number(b.getAttribute('data-cv-deposit')) === state.convert.deposit);
      });
      refresh();
    });
    $$('.chips [data-cv-deposit]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.convert.deposit = Number(b.getAttribute('data-cv-deposit'));
        el.cvDeposit.value = String(state.convert.deposit);
        refresh();
      });
    });
    el.cvMonthly.addEventListener('input', function () {
      state.convert.monthly = readNum(el.cvMonthly, 0, 0, 20000000);
      refresh();
    });
    el.cvRateInput.addEventListener('input', function () {
      state.convert.customRate = readNum(el.cvRateInput, 5.25, 0.1, 20);
      state.convert.rateMode = 'custom';
      refresh();
    });
    el.cvYears.addEventListener('change', function () {
      state.convert.years = parseInt(el.cvYears.value, 10) || 2;
      refresh();
    });
    el.cvMarketTable.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-market-rate]');
      if (!btn) return;
      var v = parseFloat(btn.getAttribute('data-market-rate'));
      if (!isFinite(v)) return;
      state.convert.marketRate = v;
      state.convert.rateMode = 'market';
      syncConvertForm();
      refresh();
      toast('시장 전환율 ' + v.toFixed(2) + '%를 적용했어요.');
    });
    el.shareConvert.addEventListener('click', function () { doShare(convertShareText()); });
  }

  function bindCompareEvents() {
    el.cmpJeonse.addEventListener('input', function () {
      state.compare.jeonse = readNum(el.cmpJeonse, 0, 0, 3000000000);
      $$('.chips [data-cmp-jeonse]').forEach(function (b) {
        b.classList.toggle('is-active', Number(b.getAttribute('data-cmp-jeonse')) === state.compare.jeonse);
      });
      refresh();
    });
    $$('.chips [data-cmp-jeonse]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.compare.jeonse = Number(b.getAttribute('data-cmp-jeonse'));
        el.cmpJeonse.value = String(state.compare.jeonse);
        refresh();
      });
    });
    el.cmpLoan.addEventListener('input', function () {
      state.compare.loan = readNum(el.cmpLoan, 0, 0, 3000000000);
      refresh();
    });
    el.fillButimok.addEventListener('click', function () {
      var info = butimokInfo();
      state.compare.loanMode = 'butimok';
      state.compare.loan = Math.round(info.cap);
      el.cmpLoan.value = String(state.compare.loan);
      syncCompareForm();
      refresh();
      toast('버팀목 한도 ' + wonShort(info.cap) + '을 넣었어요.');
    });
    $$('.segmented[data-segment="loanrate"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-value');
        state.compare.loanMode = (v === 'bank' || v === 'custom') ? v : 'butimok';
        syncCompareForm();
        refresh();
      });
    });
    $$('.segmented[data-segment="area"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.compare.capital = b.getAttribute('data-value') !== 'local';
        syncCompareForm();
        refresh();
      });
    });
    el.cmpIncome.addEventListener('input', function () {
      state.compare.income = readNum(el.cmpIncome, 0, 0, 200000000);
      $$('.chips [data-cmp-income]').forEach(function (b) {
        b.classList.toggle('is-active', Number(b.getAttribute('data-cmp-income')) === state.compare.income);
      });
      refresh();
    });
    $$('.chips [data-cmp-income]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.compare.income = Number(b.getAttribute('data-cmp-income'));
        el.cmpIncome.value = String(state.compare.income);
        refresh();
      });
    });
    el.cmpNewlywed.addEventListener('change', function () {
      state.compare.newlywed = el.cmpNewlywed.checked;
      refresh();
    });
    el.cmpRateInput.addEventListener('input', function () {
      state.compare.customRate = readNum(el.cmpRateInput, 3.2, 0.1, 20);
      state.compare.loanMode = 'custom';
      refresh();
    });
    el.cmpEquityRate.addEventListener('input', function () {
      state.compare.equityRate = readNum(el.cmpEquityRate, 3, 0, 20);
      refresh();
    });
    el.cmpDeposit.addEventListener('input', function () {
      state.compare.deposit = readNum(el.cmpDeposit, 0, 0, 3000000000);
      refresh();
    });
    el.cmpRent.addEventListener('input', function () {
      state.compare.rent = readNum(el.cmpRent, 0, 0, 20000000);
      refresh();
    });
    el.cmpMonths.addEventListener('change', function () {
      state.compare.months = parseInt(el.cmpMonths.value, 10) || 24;
      refresh();
    });
    el.shareCompare.addEventListener('click', function () { doShare(compareShareText()); });
  }

  function bindLoanEvents() {
    el.lnPrincipal.addEventListener('input', function () {
      state.loan.principal = readNum(el.lnPrincipal, 0, 0, 3000000000);
      $$('.chips [data-ln-principal]').forEach(function (b) {
        b.classList.toggle('is-active', Number(b.getAttribute('data-ln-principal')) === state.loan.principal);
      });
      refresh();
    });
    $$('.chips [data-ln-principal]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.loan.principal = Number(b.getAttribute('data-ln-principal'));
        el.lnPrincipal.value = String(state.loan.principal);
        refresh();
      });
    });
    el.lnRate.addEventListener('input', function () {
      state.loan.rate = readNum(el.lnRate, 4.98, 0.1, 20);
      refresh();
    });
    el.lnYears.addEventListener('change', function () {
      state.loan.years = parseInt(el.lnYears.value, 10) || 30;
      refresh();
    });
    el.lnIncome.addEventListener('input', function () {
      state.loan.income = readNum(el.lnIncome, 0, 0, 500000000);
      refresh();
    });
    $$('.segmented[data-segment="method"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.loan.method = b.getAttribute('data-value') === 'principal' ? 'principal' : 'equal';
        syncLoanForm();
        refresh();
      });
    });
    el.shareLoan.addEventListener('click', function () { doShare(loanShareText()); });
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    el.appVersion.textContent = CFG.version || '1.0.0';
    el.dataDate.textContent = H.DATA_DATE;
    el.dataDate.setAttribute('datetime', H.DATA_DATE);

    renderMarketTable();
    syncConvertForm();
    syncCompareForm();
    syncLoanForm();
    bindConvertEvents();
    bindCompareEvents();
    bindLoanEvents();
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
