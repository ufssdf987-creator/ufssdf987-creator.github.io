/*!
 * app.js — 2026 복비(부동산 중개보수)·이사비용 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.BrokerageCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'bfx.state.v1';
  var THEME_KEY = 'bfx.theme';
  var TABS = ['sale', 'lease', 'move', 'check'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function won(n) { return nf.format(Math.round(n || 0)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /** 5억원 · 1억 8,000만원 · 2,200만원처럼 읽기 쉽게 */
  function wonShort(v) {
    var n = Math.round(Math.abs(v));
    var sign = v < 0 ? '-' : '';
    if (n >= 100000000) {
      var eok = Math.floor(n / 100000000);
      var man = Math.round((n % 100000000) / 10000);
      if (man === 0) return sign + eok + '억원';
      if (man >= 10000) return sign + eok + '억 ' + nf.format(Math.floor(man / 10000)) + '억 ' + nf.format(man % 10000) + '만원';
      return sign + eok + '억 ' + nf.format(man) + '만원';
    }
    if (n >= 10000) return sign + nf.format(Math.round(n / 10000)) + '만원';
    return sign + nf.format(n) + '원';
  }

  function wonRange(lo, hi) {
    if (Math.round(lo) === Math.round(hi)) return won(lo) + '원';
    return wonShort(lo) + ' ~ ' + wonShort(hi);
  }

  function pct(v) {
    var n = Number(v) || 0;
    var s = n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return s + '%';
  }

  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'sale',
    saleKind: 'sale',
    price: 500000000,
    paid: 300000000,
    premium: 50000000,
    rateMode: 'cap',
    rate: 0.3,
    vat: 'general',
    leaseType: 'jeonse',
    deposit: 300000000,
    monthly: 500000,
    lsRateMode: 'cap',
    lsRate: 0.2,
    lsVat: 'general',
    mvDeal: 'jeonse',
    mvPrice: 500000000,
    mvDeposit: 300000000,
    mvMonthly: 500000,
    mvVat: 'general',
    pyeong: 24,
    moveMethod: 'full',
    season: false,
    ladder: false,
    moveQuote: 0,
    cleanType: 'in',
    cleanQuote: 0,
    stampCopies: 2,
    regMethod: 'online',
    regCount: 1,
    lawyer: 0,
    fixedDate: true,
    copyCount: 1,
    insurance: false,
    insuranceRate: 0.128,
    checks: {}
  };

  var MAX_MONEY = S.LIMITS.money.max;

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    if (raw.saleKind === 'presale' || raw.saleKind === 'sale') state.saleKind = raw.saleKind;
    if (raw.leaseType === 'monthly' || raw.leaseType === 'jeonse') state.leaseType = raw.leaseType;
    if (raw.mvDeal === 'sale' || raw.mvDeal === 'jeonse' || raw.mvDeal === 'monthly') state.mvDeal = raw.mvDeal;
    if (raw.rateMode === 'custom' || raw.rateMode === 'cap') state.rateMode = raw.rateMode;
    if (raw.lsRateMode === 'custom' || raw.lsRateMode === 'cap') state.lsRateMode = raw.lsRateMode;
    if (S.VAT_RATES[raw.vat] !== undefined) state.vat = raw.vat;
    if (S.VAT_RATES[raw.lsVat] !== undefined) state.lsVat = raw.lsVat;
    if (S.VAT_RATES[raw.mvVat] !== undefined) state.mvVat = raw.mvVat;
    if (S.MOVE_TABLE && ['full', 'half', 'general'].indexOf(raw.moveMethod) >= 0) state.moveMethod = raw.moveMethod;
    if (['in', 'new', 'none'].indexOf(raw.cleanType) >= 0) state.cleanType = raw.cleanType;
    if (['online', 'eform', 'paper'].indexOf(raw.regMethod) >= 0) state.regMethod = raw.regMethod;

    [
      ['price', 'price', MAX_MONEY],
      ['paid', 'paid', MAX_MONEY],
      ['premium', 'premium', MAX_MONEY],
      ['deposit', 'deposit', MAX_MONEY],
      ['monthly', 'monthly', MAX_MONEY],
      ['mvPrice', 'mvPrice', MAX_MONEY],
      ['mvDeposit', 'mvDeposit', MAX_MONEY],
      ['mvMonthly', 'mvMonthly', MAX_MONEY],
      ['moveQuote', 'moveQuote', MAX_MONEY],
      ['cleanQuote', 'cleanQuote', MAX_MONEY],
      ['lawyer', 'lawyer', 10000000]
    ].forEach(function (k) {
      var v = parseFloat(raw[k[0]]);
      if (isFinite(v) && v >= 0) state[k[1]] = clamp(v, 0, k[2]);
    });

    [['rate', 0, 2], ['lsRate', 0, 2], ['insuranceRate', 0, 2]].forEach(function (k) {
      var v = parseFloat(raw[k[0]]);
      if (isFinite(v) && v >= 0) state[k[0]] = clamp(v, k[1], k[2]);
    });

    var p = parseFloat(raw.pyeong);
    if (isFinite(p)) state.pyeong = clamp(Math.round(p), S.LIMITS.pyeong.min, S.LIMITS.pyeong.max);
    var sc = parseInt(raw.stampCopies, 10);
    if (sc === 1 || sc === 2) state.stampCopies = sc;
    var rc = parseInt(raw.regCount, 10);
    if (rc >= 1 && rc <= 3) state.regCount = rc;
    var cc = parseInt(raw.copyCount, 10);
    if (cc >= 0 && cc <= 3) state.copyCount = cc;
    if (typeof raw.season === 'boolean') state.season = raw.season;
    if (typeof raw.ladder === 'boolean') state.ladder = raw.ladder;
    if (typeof raw.fixedDate === 'boolean') state.fixedDate = raw.fixedDate;
    if (typeof raw.insurance === 'boolean') state.insurance = raw.insurance;
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
    el.tabSale = $('#tabSale');
    el.tabLease = $('#tabLease');
    el.tabMove = $('#tabMove');
    el.tabCheck = $('#tabCheck');
    el.panelSale = $('#panelSale');
    el.panelLease = $('#panelLease');
    el.panelMove = $('#panelMove');
    el.panelCheck = $('#panelCheck');

    el.saleKindGroup = $('#saleKindGroup');
    el.saPriceWrap = $('#saPriceWrap');
    el.saPresaleWrap = $('#saPresaleWrap');
    el.saPrice = $('#saPrice');
    el.saPriceBadge = $('#saPriceBadge');
    el.saPaid = $('#saPaid');
    el.saPaidBadge = $('#saPaidBadge');
    el.saPremium = $('#saPremium');
    el.saPremiumBadge = $('#saPremiumBadge');
    el.saRateGroup = $('#saRateGroup');
    el.saRateWrap = $('#saRateWrap');
    el.saRate = $('#saRate');
    el.saRateBadge = $('#saRateBadge');
    el.saVatGroup = $('#saVatGroup');
    el.saTotal = $('#saTotal');
    el.saSub = $('#saSub');
    el.saVerdict = $('#saVerdict');
    el.saRows = $('#saRows');
    el.saMax = $('#saMax');
    el.saFee = $('#saFee');
    el.saVat = $('#saVat');
    el.saBoth = $('#saBoth');
    el.saNextBox = $('#saNextBox');
    el.saNextTitle = $('#saNextTitle');
    el.saNext = $('#saNext');
    el.saInsight = $('#saInsight');
    el.saTable = $('#saTable');
    el.saVatTable = $('#saVatTable');
    el.shareSale = $('#shareSale');

    el.leaseTypeGroup = $('#leaseTypeGroup');
    el.lsDeposit = $('#lsDeposit');
    el.lsDepositBadge = $('#lsDepositBadge');
    el.lsMonthlyWrap = $('#lsMonthlyWrap');
    el.lsMonthly = $('#lsMonthly');
    el.lsMonthlyBadge = $('#lsMonthlyBadge');
    el.lsRateGroup = $('#lsRateGroup');
    el.lsRateWrap = $('#lsRateWrap');
    el.lsRate = $('#lsRate');
    el.lsRateBadge = $('#lsRateBadge');
    el.lsVatGroup = $('#lsVatGroup');
    el.lsTotal = $('#lsTotal');
    el.lsSub = $('#lsSub');
    el.lsVerdict = $('#lsVerdict');
    el.lsRows = $('#lsRows');
    el.lsAmount = $('#lsAmount');
    el.lsMax = $('#lsMax');
    el.lsVat = $('#lsVat');
    el.lsGuarantee = $('#lsGuarantee');
    el.lsSpecial = $('#lsSpecial');
    el.lsSpecialTitle = $('#lsSpecialTitle');
    el.lsSpecialText = $('#lsSpecialText');
    el.lsNextBox = $('#lsNextBox');
    el.lsNextTitle = $('#lsNextTitle');
    el.lsNext = $('#lsNext');
    el.lsInsight = $('#lsInsight');
    el.lsTable = $('#lsTable');
    el.lsSensTable = $('#lsSensTable');
    el.shareLease = $('#shareLease');

    el.mvDealGroup = $('#mvDealGroup');
    el.mvPriceWrap = $('#mvPriceWrap');
    el.mvDepositWrap = $('#mvDepositWrap');
    el.mvMonthlyWrap = $('#mvMonthlyWrap');
    el.mvPrice = $('#mvPrice');
    el.mvPriceBadge = $('#mvPriceBadge');
    el.mvDeposit = $('#mvDeposit');
    el.mvDepositBadge = $('#mvDepositBadge');
    el.mvMonthly = $('#mvMonthly');
    el.mvMonthlyBadge = $('#mvMonthlyBadge');
    el.mvVatGroup = $('#mvVatGroup');
    el.mvPyeong = $('#mvPyeong');
    el.mvPyeongBadge = $('#mvPyeongBadge');
    el.mvMethodGroup = $('#mvMethodGroup');
    el.mvSeason = $('#mvSeason');
    el.mvLadder = $('#mvLadder');
    el.mvMoveQuote = $('#mvMoveQuote');
    el.mvCleanGroup = $('#mvCleanGroup');
    el.mvCleanQuote = $('#mvCleanQuote');
    el.mvCleanQuoteWrap = $('#mvCleanQuoteWrap');
    el.mvSaleDocs = $('#mvSaleDocs');
    el.mvLeaseDocs = $('#mvLeaseDocs');
    el.mvDocsSub = $('#mvDocsSub');
    el.mvStampGroup = $('#mvStampGroup');
    el.mvRegMethod = $('#mvRegMethod');
    el.mvRegCount = $('#mvRegCount');
    el.mvLawyer = $('#mvLawyer');
    el.mvFixed = $('#mvFixed');
    el.mvCopyCount = $('#mvCopyCount');
    el.mvInsurance = $('#mvInsurance');
    el.mvInsuranceRate = $('#mvInsuranceRate');
    el.mvInsuranceWrap = $('#mvInsuranceWrap');
    el.mvTotalCard = $('#mvResultCard');
    el.mvTotalMin = $('#mvTotalMin');
    el.mvTotalMax = $('#mvTotalMax');
    el.mvSub = $('#mvSub');
    el.mvVerdict = $('#mvVerdict');
    el.mvTable = $('#mvTable');
    el.mvBroker = $('#mvBroker');
    el.mvMove = $('#mvMove');
    el.mvClean = $('#mvClean');
    el.mvDocs = $('#mvDocs');
    el.mvTip = $('#mvTip');
    el.mvInsight = $('#mvInsight');
    el.shareMove = $('#shareMove');

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
    if (TABS.indexOf(name) < 0) name = 'sale';
    state.tab = name;
    var map = {
      sale: [el.tabSale, el.panelSale],
      lease: [el.tabLease, el.panelLease],
      move: [el.tabMove, el.panelMove],
      check: [el.tabCheck, el.panelCheck]
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
    el.tabSale.addEventListener('click', function () { setTab('sale'); });
    el.tabLease.addEventListener('click', function () { setTab('lease'); });
    el.tabMove.addEventListener('click', function () { setTab('move'); });
    el.tabCheck.addEventListener('click', function () { setTab('check'); });
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
    setTab(TABS.indexOf(hash) >= 0 ? hash : (state.tab || 'sale'));
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

  /** 세그먼트 그룹의 활성 버튼을 값과 맞춥니다 */
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
        var v = btn.getAttribute('data-' + attr);
        onPick(v);
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

  /* ── 탭 1: 매매·분양권 ─────────────────────────────── */
  function saleInput() {
    return {
      kind: state.saleKind,
      price: state.price,
      paid: state.paid,
      premium: state.premium,
      ratePct: state.rateMode === 'custom' ? state.rate : null,
      vat: state.vat
    };
  }

  function renderSaleTable(r) {
    var rows = S.bracketList('sale');
    var body = rows.map(function (b) {
      var base = Math.floor(r.amount * b.rate);
      var val = b.cap == null ? base : Math.min(base, b.cap);
      return '<tr' + (b.index === r.bracketIndex ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + (b.short || b.label) + '</th>' +
        '<td>' + (b.rate * 100).toFixed(1) + '%</td>' +
        '<td>' + (b.cap == null ? '없음' : won(b.cap) + '원') + '</td>' +
        '<td>' + won(val) + '원</td>' +
        '</tr>';
    }).join('');
    el.saTable.tBodies[0].innerHTML = body;
  }

  function renderSaleVat(r) {
    var fee = r.fee;
    var rows = [
      { key: 'general', label: '일반과세', rate: 10 },
      { key: 'simple', label: '간이과세', rate: 4 },
      { key: 'none', label: '미청구', rate: 0 }
    ];
    el.saVatTable.tBodies[0].innerHTML = rows.map(function (v) {
      var vat = Math.round(fee * v.rate / 100);
      var now = v.key === r.vatKey;
      return '<tr' + (now ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + v.label + (now ? ' · 선택' : '') + '</th>' +
        '<td>' + v.rate + '%</td>' +
        '<td>' + won(vat) + '원</td>' +
        '<td>' + won(fee + vat) + '원</td>' +
        '</tr>';
    }).join('');
  }

  function renderSale() {
    var r = S.saleFee(saleInput());
    var vatLabel = r.vatRate === 0.1 ? '부가세 10%' : (r.vatRate > 0 ? '부가세 약 4%' : '부가세 없음');

    el.saTotal.textContent = won(r.total);
    el.saSub.textContent = (r.kind === 'presale' ? '분양권 ' : '') + wonShort(r.amount) +
      ' · ' + r.bracketLabel + ' ' + pct(r.capRate * 100) + ' · ' + vatLabel;

    if (r.overCap) setBadge(el.saVerdict, '상한 초과', 3);
    else if (r.limitApplied) setBadge(el.saVerdict, '한도액 적용', 2);
    else if (r.custom) setBadge(el.saVerdict, '상한 이내', 1);
    else setBadge(el.saVerdict, '법정 상한', 1);

    var rows = '';
    if (r.kind === 'presale') {
      rows += row('납입한 분양대금', won(r.paid) + '원');
      rows += row('프리미엄', won(r.premium) + '원');
    }
    rows += row('거래금액', won(r.amount) + '원');
    rows += row('적용 구간', r.bracketLabel);
    rows += row('상한요율', pct(r.capRate * 100), r.custom ? '협의 ' + pct(r.rate * 100) : null);
    rows += row('한도액', r.capAmount == null ? '없음' : won(r.capAmount) + '원');
    rows += row('산출 보수', won(r.fee) + '원', r.limitApplied ? '한도액으로 제한' : null);
    rows += row('부가세', r.vatRate > 0 ? won(r.vat) + '원' : '0원', r.vatRate === 0.1 ? '10%' : (r.vatRate > 0 ? '약 4%' : '미청구'));
    rows += row('<strong>합계</strong>', '<strong>' + won(r.total) + '원</strong>');
    el.saRows.innerHTML = rows;

    el.saMax.textContent = won(r.legalMax) + '원';
    el.saFee.textContent = won(r.fee) + '원';
    el.saVat.textContent = won(r.vat) + '원';
    el.saBoth.textContent = won(r.both) + '원';

    var next = '';
    if (r.overCap) {
      el.saNextTitle.textContent = '법정 상한을 넘겼습니다';
      next = '이 구간 상한은 ' + pct(r.capRate * 100) + '이고 1인당 최대 ' + won(r.legalMax) +
        '원입니다. 입력한 ' + pct(r.rate * 100) + '는 상한을 넘어, 넘는 부분은 무효입니다. ' +
        '요율을 ' + pct(r.capRate * 100) + ' 이하로 다시 정하세요.';
      el.saNextBox.className = 'after-box after-box--warn';
    } else if (r.limitApplied) {
      el.saNextTitle.textContent = '한도액이 걸렸습니다';
      next = '요율로 계산하면 ' + won(Math.floor(r.amount * (r.custom ? r.rate : r.capRate))) +
        '원이지만, 이 구간 한도액 ' + won(r.capAmount) + '원이 우선이라 상한은 ' + won(r.legalMax) + '원입니다.';
      el.saNextBox.className = 'after-box';
    } else if (r.custom) {
      el.saNextTitle.textContent = '상한보다 ' + won(r.diffFromMax) + '원 낮게 정했습니다';
      next = '법정 상한 ' + won(r.legalMax) + '원 안에서 협의한 결과입니다. 계약서·확인설명서에 이 요율이 적혀 있는지 확인하세요.';
      el.saNextBox.className = 'after-box';
    } else {
      el.saNextTitle.textContent = '이 금액은 최대치입니다';
      next = '상한까지 채우지 않아도 됩니다. 협의로 낮추면 그만큼 줄어듭니다. 요율을 0.1%p 낮추면 약 ' +
        won(Math.floor(r.amount * 0.001)) + '원이 줄어듭니다.';
      el.saNextBox.className = 'after-box';
    }
    el.saNext.textContent = next;

    var ins = [];
    if (r.overCap) {
      ins.push('<strong>초과 수수는 신고 대상입니다.</strong> 영수증을 받고 구청 부동산과·1372에 상담하세요.');
    } else {
      if (Math.abs(r.fee - r.legalMax) < 1) {
        ins.push('부가세를 뺀 보수 <strong>' + won(r.fee) + '원</strong>이 법정 상한과 같습니다. 이보다 낮게 협의할 수 있고, 낮춘 만큼 그대로 줄어듭니다.');
      } else {
        ins.push('부가세를 뺀 보수 <strong>' + won(r.fee) + '원</strong>은 법정 상한 <strong>' + won(r.legalMax) + '원</strong>보다 ' + won(r.legalMax - r.fee) + '원 적습니다.');
      }
    }
    var note = boundaryNote('sale', r.amount, r.bracketIndex);
    if (note) ins.push(note);
    setInsight(el.saInsight, ins.join(' '), r.overCap ? 'is-warn' : 'is-ok');

    renderSaleTable(r);
    renderSaleVat(r);
    return r;
  }

  /** 구간 경계에 가까우면 알려 줍니다 */
  function boundaryNote(kind, amount, index) {
    var list = S.bracketList(kind);
    var here = list[index];
    if (!here) return '';
    var table = kind === 'lease' ? S.LEASE_BRACKETS : S.SALE_BRACKETS;
    var to = table[index].to;
    if (!isFinite(to)) return '';
    var gap = to - amount;
    if (gap < 0 || gap > Math.max(2000000, to * 0.01)) return '';
    var nextRow = list[index + 1];
    if (!nextRow) return '';
    return '여기서 <strong>' + won(gap) + '원</strong>만 더하면 ' + nextRow.label +
      ' 구간(' + pct(nextRow.rate * 100) + ')으로 넘어갑니다.';
  }

  function saleShareText() {
    var r = S.saleFee(saleInput());
    var head = r.kind === 'presale' ? '분양권' : '매매';
    return '[복비 계산 2026]\n' + head + ' ' + wonShort(r.amount) + ' → 1인당 상한 ' + won(r.fee) + '원' +
      (r.vat > 0 ? ' + 부가세 ' + won(r.vat) + '원 = ' + won(r.total) + '원' : '') +
      '\n적용 ' + r.bracketLabel + ' ' + pct(r.capRate * 100) +
      (r.capAmount != null ? ' · 한도 ' + won(r.capAmount) + '원' : '') +
      '\n매도인 포함 합계 ' + won(r.both) + '원 · 부동산 중개보수 상한(공인중개사법 시행규칙 별표 1)\n' +
      (CFG.siteUrl || '');
  }

  /* ── 탭 2: 전세·월세 ───────────────────────────────── */
  function leaseInput() {
    return {
      deposit: state.deposit,
      monthly: state.leaseType === 'monthly' ? state.monthly : 0,
      ratePct: state.lsRateMode === 'custom' ? state.lsRate : null,
      vat: state.lsVat
    };
  }

  function renderLeaseTable(r) {
    var rows = S.bracketList('lease');
    el.lsTable.tBodies[0].innerHTML = rows.map(function (b) {
      var base = Math.floor(r.amount * b.rate);
      var val = b.cap == null ? base : Math.min(base, b.cap);
      return '<tr' + (b.index === r.bracketIndex ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + (b.short || b.label) + '</th>' +
        '<td>' + (b.rate * 100).toFixed(1) + '%</td>' +
        '<td>' + (b.cap == null ? '없음' : won(b.cap) + '원') + '</td>' +
        '<td>' + won(val) + '원</td>' +
        '</tr>';
    }).join('');
  }

  function renderLeaseSens() {
    if (state.leaseType !== 'monthly' || state.monthly <= 0) {
      el.lsSensTable.tBodies[0].innerHTML = '<tr><td colspan="3">월세를 입력하면 표시됩니다.</td></tr>';
      return;
    }
    var deltas = [-100000, -50000, 0, 50000, 100000];
    el.lsSensTable.tBodies[0].innerHTML = deltas.map(function (d) {
      var m = Math.max(0, state.monthly + d);
      var r = S.leaseFee({ deposit: state.deposit, monthly: m });
      var mark = d === 0 ? ' · 지금' : '';
      return '<tr' + (d === 0 ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + won(m) + '원' + mark + '</th>' +
        '<td>' + won(r.amount) + '원' + (r.used70 ? ' <small>×70</small>' : '') + '</td>' +
        '<td>' + won(r.fee) + '원</td>' +
        '</tr>';
    }).join('');
  }

  function renderLease() {
    var r = S.leaseFee(leaseInput());
    var vatLabel = r.vatRate === 0.1 ? '부가세 10%' : (r.vatRate > 0 ? '부가세 약 4%' : '부가세 없음');

    el.lsTotal.textContent = won(r.total);
    el.lsSub.textContent = (state.leaseType === 'monthly' ? '월세 ' + wonShort(r.monthly) + ' ' : '전세 ') +
      wonShort(r.deposit) + ' · 환산 ' + wonShort(r.amount) + ' · ' + r.bracketLabel + ' ' + pct(r.capRate * 100) + ' · ' + vatLabel;

    if (r.overCap) setBadge(el.lsVerdict, '상한 초과', 3);
    else if (r.limitApplied) setBadge(el.lsVerdict, '한도액 적용', 2);
    else if (r.used70) setBadge(el.lsVerdict, '×70 특례', 2);
    else if (r.custom) setBadge(el.lsVerdict, '상한 이내', 1);
    else setBadge(el.lsVerdict, '법정 상한', 1);

    var rows = '';
    rows += row('보증금', won(r.deposit) + '원');
    if (r.monthly > 0) {
      rows += row('월세', won(r.monthly) + '원', '×100 = ' + won(r.raw100) + '원');
      rows += row('환산보증금', won(r.amount) + '원', r.used70 ? '합이 5천만원 미만 → ×70 재계산' : null);
    } else {
      rows += row('거래금액', won(r.amount) + '원', '전세는 보증금이 곧 거래금액');
    }
    rows += row('적용 구간', r.bracketLabel);
    rows += row('상한요율', pct(r.capRate * 100), r.custom ? '협의 ' + pct(r.rate * 100) : null);
    rows += row('한도액', r.capAmount == null ? '없음' : won(r.capAmount) + '원');
    rows += row('산출 보수', won(r.fee) + '원', r.limitApplied ? '한도액으로 제한' : null);
    rows += row('부가세', r.vatRate > 0 ? won(r.vat) + '원' : '0원', r.vatRate === 0.1 ? '10%' : (r.vatRate > 0 ? '약 4%' : '미청구'));
    rows += row('<strong>합계</strong>', '<strong>' + won(r.total) + '원</strong>');
    el.lsRows.innerHTML = rows;

    el.lsAmount.textContent = won(r.amount) + '원';
    el.lsMax.textContent = won(r.legalMax) + '원';
    el.lsVat.textContent = won(r.vat) + '원';
    var g = S.guaranteeFee(r.deposit, 0.128);
    el.lsGuarantee.textContent = won(g.fee) + '원';

    if (r.monthly > 0) {
      el.lsSpecialTitle.textContent = r.used70 ? '×70 특례가 적용됐습니다' : '×100으로 환산했습니다';
      el.lsSpecialText.textContent = r.used70
        ? '보증금 ' + wonShort(r.deposit) + ' + 월세 ' + wonShort(r.monthly) + '×100 = ' + wonShort(r.raw100) +
          '이라 5,000만원 미만입니다. 그래서 월세×70으로 다시 계산해 ' + wonShort(r.amount) + '을 거래금액으로 씁니다.'
        : '보증금 ' + wonShort(r.deposit) + ' + 월세 ' + wonShort(r.monthly) + '×100 = ' + wonShort(r.raw100) +
          '으로 5,000만원 이상이라 ×70을 쓰지 않습니다.';
      el.lsSpecial.hidden = false;
    } else {
      el.lsSpecialTitle.textContent = '전세는 보증금이 거래금액';
      el.lsSpecialText.textContent = '월세가 없어 환산하지 않습니다. 보증금 ' + wonShort(r.deposit) + ' 그대로 구간을 찾습니다.';
      el.lsSpecial.hidden = false;
    }

    var next = '';
    if (r.overCap) {
      el.lsNextTitle.textContent = '법정 상한을 넘겼습니다';
      next = '이 구간 상한 ' + pct(r.capRate * 100) + ' · 1인당 최대 ' + won(r.legalMax) + '원입니다. 넘는 부분은 무효입니다.';
      el.lsNextBox.className = 'after-box after-box--warn';
    } else if (r.limitApplied) {
      el.lsNextTitle.textContent = '한도액이 걸렸습니다';
      next = '요율로는 ' + won(Math.floor(r.amount * (r.custom ? r.rate : r.capRate))) + '원이지만 한도액 ' +
        won(r.capAmount) + '원이 우선입니다.';
      el.lsNextBox.className = 'after-box';
    } else {
      el.lsNextTitle.textContent = '임대인도 같은 금액을 냅니다';
      next = '임차인 ' + won(r.total) + '원, 임대인 ' + won(r.total) + '원으로 합계 ' + won(r.both) +
        '원입니다. 실제 금액은 이 안에서 각각 협의해 정합니다.';
      el.lsNextBox.className = 'after-box';
    }
    el.lsNext.textContent = next;

    var ins;
    if (Math.abs(r.fee - r.legalMax) < 1) {
      ins = '부가세를 뺀 보수 <strong>' + won(r.fee) + '원</strong>이 법정 상한과 같습니다. 이보다 낮게 협의할 수 있습니다.';
    } else {
      ins = '부가세를 뺀 보수 <strong>' + won(r.fee) + '원</strong>은 법정 상한 <strong>' + won(r.legalMax) + '원</strong>보다 ' + won(r.legalMax - r.fee) + '원 적습니다.';
    }
    if (r.used70) ins += ' ×70 특례 덕분에 ×100 기준(' + won(Math.floor(r.raw100 * 0.005)) + '원 수준)보다 낮아졌습니다.';
    var note = boundaryNote('lease', r.amount, r.bracketIndex);
    if (note) ins += ' ' + note;
    setInsight(el.lsInsight, ins, r.overCap ? 'is-warn' : 'is-ok');

    renderLeaseTable(r);
    renderLeaseSens();
    return r;
  }

  function leaseShareText() {
    var r = S.leaseFee(leaseInput());
    var head = r.monthly > 0 ? '월세 보증금 ' + wonShort(r.deposit) + ' / 월세 ' + wonShort(r.monthly) : '전세 ' + wonShort(r.deposit);
    return '[복비 계산 2026]\n' + head + ' → 환산 ' + wonShort(r.amount) +
      (r.used70 ? ' (×70 특례)' : '') +
      '\n1인당 상한 ' + won(r.fee) + '원' + (r.vat > 0 ? ' + 부가세 ' + won(r.vat) + '원 = ' + won(r.total) + '원' : '') +
      '\n적용 ' + r.bracketLabel + ' ' + pct(r.capRate * 100) +
      (r.capAmount != null ? ' · 한도 ' + won(r.capAmount) + '원' : '') + '\n' +
      (CFG.siteUrl || '');
  }

  /* ── 탭 3: 이사 총비용 ─────────────────────────────── */
  function moveInput() {
    return {
      deal: state.mvDeal,
      price: state.mvPrice,
      deposit: state.mvDeposit,
      monthly: state.mvMonthly,
      vat: state.mvVat,
      pyeong: state.pyeong,
      moveMethod: state.moveMethod,
      season: state.season,
      ladder: state.ladder,
      moveQuote: state.moveQuote,
      cleanType: state.cleanType,
      cleanQuote: state.cleanQuote,
      stampCopies: state.stampCopies,
      regMethod: state.regMethod,
      regCount: state.regCount,
      lawyer: state.lawyer,
      fixedDate: state.fixedDate,
      copyCount: state.copyCount,
      depositInsurance: state.insurance,
      insuranceRate: state.insuranceRate
    };
  }

  function renderMove() {
    var r = S.movingTotal(moveInput());
    var dealLabel = r.deal === 'sale' ? '매매' : (r.deal === 'monthly' ? '월세' : '전세');

    el.mvTotalMin.textContent = won(r.min);
    el.mvTotalMax.textContent = won(r.max);
    el.mvSub.textContent = dealLabel + ' · ' + r.move.pyeong + '평 · ' + r.move.methodLabel + ' · ' + r.clean.typeLabel;

    var brokerShare = r.max > 0 ? Math.round(r.brokerage.total / r.max * 100) : 0;
    setBadge(el.mvVerdict, '복비 ' + brokerShare + '%', brokerShare < 30 ? 1 : (brokerShare < 50 ? 2 : 3));

    el.mvTable.tBodies[0].innerHTML = r.items.map(function (it) {
      var same = it.min === it.max;
      return '<tr><td>' + it.label + '<small>' + it.note + '</small></td>' +
        '<td>' + won(it.min) + '원</td>' +
        '<td>' + (same ? '—' : won(it.max) + '원') + '</td></tr>';
    }).join('') +
      '<tr><td><strong>합계</strong></td><td><strong>' + won(r.min) + '원</strong></td>' +
      '<td><strong>' + won(r.max) + '원</strong></td></tr>';

    el.mvBroker.textContent = won(r.brokerage.total) + '원';
    el.mvMove.textContent = wonRange(r.move.lo, r.move.hi);
    el.mvClean.textContent = r.clean.type === 'none' ? '0원' : wonRange(r.clean.lo, r.clean.hi);
    var docs = 0;
    r.items.forEach(function (it) {
      if (['stamp', 'reg', 'lawyer', 'copy', 'fixed', 'insurance'].indexOf(it.key) >= 0) docs += it.min;
    });
    el.mvDocs.textContent = won(docs) + '원';

    // 절약 팁
    var tips = [];
    if (state.season) {
      var off = S.moveEstimate({ pyeong: state.pyeong, method: state.moveMethod, season: false, ladder: state.ladder, quote: state.moveQuote });
      var saveLo = Math.max(0, r.move.lo - off.lo);
      var saveHi = Math.max(0, r.move.hi - off.hi);
      if (saveHi > 0) tips.push('<strong>성수기·주말을 피하면</strong> 이사비가 ' + won(saveLo) + '~' + won(saveHi) + '원 줄어듭니다.');
    }
    if (state.moveMethod === 'full' && state.moveQuote === 0) {
      var half = S.moveEstimate({ pyeong: state.pyeong, method: 'half', season: state.season, ladder: state.ladder });
      tips.push('<strong>포장을 반포장으로</strong> 바꾸면 약 ' + won(Math.max(0, r.move.lo - half.lo)) + '~' + won(Math.max(0, r.move.hi - half.hi)) + '원 아낄 수 있습니다(짐을 직접 싸는 시간이 대가).');
    }
    if (state.moveQuote === 0) tips.push('<strong>견적은 3곳 이상</strong> 비교하세요. 같은 조건에서도 업체별 차이가 20%를 넘습니다.');
    if (r.deal === 'sale') tips.push('취득세는 빠져 있습니다. <strong>부동산 세금 계산기</strong>에서 함께 확인하세요.');
    if (!tips.length) tips.push('입력한 견적을 기준으로 계산했습니다. 항목을 바꾸면 총액이 바로 달라집니다.');
    el.mvTip.innerHTML = tips.join(' ');

    var ins = [];
    ins.push('이 중 <strong>복비 ' + won(r.brokerage.total) + '원</strong>은 협의로 줄일 수 있고, ' +
      '<strong>이사비</strong>는 날짜와 포장 범위로 줄입니다.');
    var docSum = r.deal === 'sale' ? '인지세·등기수수료는' : '확정일자·등본은';
    var docRate = r.max > 0 ? (docs / r.max * 100) : 0;
    ins.push(docSum + ' ' + won(docs) + '원으로 전체의 ' + (docRate < 1 ? docRate.toFixed(1).replace('.0', '') : Math.round(docRate)) + '% 수준입니다.');
    setInsight(el.mvInsight, ins.join(' '), 'is-ok');
    return r;
  }

  function moveShareText() {
    var r = S.movingTotal(moveInput());
    var dealLabel = r.deal === 'sale' ? '매매' : (r.deal === 'monthly' ? '월세' : '전세');
    var lines = ['[이사 총비용 2026]', dealLabel + ' · ' + r.move.pyeong + '평 · ' + r.move.methodLabel];
    r.items.forEach(function (it) {
      lines.push('· ' + it.label + ' ' + (it.min === it.max ? won(it.min) : won(it.min) + '~' + won(it.max)) + '원');
    });
    lines.push('합계 ' + won(r.min) + '~' + won(r.max) + '원');
    lines.push((CFG.siteUrl || ''));
    return lines.join('\n');
  }

  /* ── 폼 동기화 ───────────────────────────────────────── */
  function syncSaleForm() {
    var presale = state.saleKind === 'presale';
    el.saPriceWrap.hidden = presale;
    el.saPresaleWrap.hidden = !presale;
    el.saRateWrap.hidden = state.rateMode !== 'custom';
    el.saPrice.value = String(state.price);
    el.saPaid.value = String(state.paid);
    el.saPremium.value = String(state.premium);
    el.saRate.value = String(state.rate);
    el.saPriceBadge.textContent = wonShort(state.price);
    el.saPaidBadge.textContent = wonShort(state.paid);
    el.saPremiumBadge.textContent = wonShort(state.premium);
    el.saRateBadge.textContent = pct(state.rate);
    syncGroup(el.saleKindGroup, 'sale-kind', state.saleKind);
    syncGroup(el.saRateGroup, 'sa-rate-mode', state.rateMode);
    syncGroup(el.saVatGroup, 'sa-vat', state.vat);
    syncChips('sa-price', state.price);
  }

  function syncLeaseForm() {
    var monthly = state.leaseType === 'monthly';
    el.lsMonthlyWrap.hidden = !monthly;
    el.lsRateWrap.hidden = state.lsRateMode !== 'custom';
    el.lsDeposit.value = String(state.deposit);
    el.lsMonthly.value = String(state.monthly);
    el.lsRate.value = String(state.lsRate);
    el.lsDepositBadge.textContent = wonShort(state.deposit);
    el.lsMonthlyBadge.textContent = wonShort(state.monthly);
    el.lsRateBadge.textContent = pct(state.lsRate);
    syncGroup(el.leaseTypeGroup, 'lease-type', state.leaseType);
    syncGroup(el.lsRateGroup, 'ls-rate-mode', state.lsRateMode);
    syncGroup(el.lsVatGroup, 'ls-vat', state.lsVat);
    syncChips('ls-deposit', state.deposit);
    syncChips('ls-monthly', state.monthly);
  }

  function syncMoveForm() {
    var deal = state.mvDeal;
    el.mvPriceWrap.hidden = deal !== 'sale';
    el.mvDepositWrap.hidden = deal === 'sale';
    el.mvMonthlyWrap.hidden = deal !== 'monthly';
    el.mvSaleDocs.hidden = deal !== 'sale';
    el.mvLeaseDocs.hidden = deal === 'sale';
    el.mvDocsSub.textContent = deal === 'sale'
      ? '매매는 인지세와 등기신청 수수료가 붙습니다. 부동산 1개마다 계산합니다.'
      : '임대차는 확정일자 600원과 등기사항증명서 발급료가 전부입니다.';
    el.mvInsuranceWrap.hidden = !state.insurance;
    el.mvCleanQuoteWrap.hidden = state.cleanType === 'none';

    el.mvPrice.value = String(state.mvPrice);
    el.mvDeposit.value = String(state.mvDeposit);
    el.mvMonthly.value = String(state.mvMonthly);
    el.mvPyeong.value = String(state.pyeong);
    el.mvMoveQuote.value = String(state.moveQuote);
    el.mvCleanQuote.value = String(state.cleanQuote);
    el.mvLawyer.value = String(state.lawyer);
    el.mvInsuranceRate.value = String(state.insuranceRate);
    el.mvRegMethod.value = state.regMethod;
    el.mvRegCount.value = String(state.regCount);
    el.mvCopyCount.value = String(state.copyCount);
    el.mvSeason.checked = state.season;
    el.mvLadder.checked = state.ladder;
    el.mvFixed.checked = state.fixedDate;
    el.mvInsurance.checked = state.insurance;

    el.mvPriceBadge.textContent = wonShort(state.mvPrice);
    el.mvDepositBadge.textContent = wonShort(state.mvDeposit);
    el.mvMonthlyBadge.textContent = wonShort(state.mvMonthly);
    el.mvPyeongBadge.textContent = state.pyeong + '평';

    syncGroup(el.mvDealGroup, 'mv-deal', deal);
    syncGroup(el.mvVatGroup, 'mv-vat', state.mvVat);
    syncGroup(el.mvMethodGroup, 'mv-method', state.moveMethod);
    syncGroup(el.mvCleanGroup, 'mv-clean', state.cleanType);
    syncGroup(el.mvStampGroup, 'mv-stamp', state.stampCopies);
    syncChips('mv-pyeong', state.pyeong);
  }

  /* ── 체크리스트 ──────────────────────────────────────── */
  function checkInputs() {
    return $$('input[data-check]', el.panelCheck);
  }

  function syncChecks() {
    var items = checkInputs();
    var done = 0;
    items.forEach(function (input) {
      var on = !!state.checks[input.getAttribute('data-check')];
      input.checked = on;
      if (on) done += 1;
    });
    var total = items.length || 1;
    var pctDone = Math.round(done / total * 100);
    var bar = $('i', el.checkBar);
    if (bar) bar.style.width = pctDone + '%';
    el.checkBar.setAttribute('aria-valuenow', String(pctDone));
    el.checkCount.textContent = done + ' / ' + items.length;
  }

  function bindChecks() {
    checkInputs().forEach(function (input) {
      input.addEventListener('change', function () {
        var key = input.getAttribute('data-check');
        if (input.checked) state.checks[key] = true;
        else delete state.checks[key];
        syncChecks();
        persist();
      });
    });
    el.checkReset.addEventListener('click', function () {
      state.checks = {};
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
    el.promoHeading.textContent = coupang.heading || '이사 첫날, 새집에서 잘 때';
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
  function bindSaleEvents() {
    bindGroup(el.saleKindGroup, 'sale-kind', function (v) {
      state.saleKind = v === 'presale' ? 'presale' : 'sale';
      refresh();
    });
    bindGroup(el.saRateGroup, 'sa-rate-mode', function (v) {
      state.rateMode = v === 'custom' ? 'custom' : 'cap';
      refresh();
    });
    bindGroup(el.saVatGroup, 'sa-vat', function (v) {
      state.vat = S.VAT_RATES[v] === undefined ? 'general' : v;
      refresh();
    });
    [['saPrice', 'price', 0, MAX_MONEY, 'sa-price'],
     ['saPaid', 'paid', 0, MAX_MONEY, ''],
     ['saPremium', 'premium', 0, MAX_MONEY, ''],
     ['saRate', 'rate', 0, 2, '']].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        state[cfg[1]] = readNum(el[cfg[0]], 0, cfg[2], cfg[3]);
        if (cfg[4]) syncChips(cfg[4], state[cfg[1]]);
        refresh();
      });
    });
    $$('.chips [data-sa-price]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.price = Number(b.getAttribute('data-sa-price'));
        el.saPrice.value = String(state.price);
        syncChips('sa-price', state.price);
        refresh();
      });
    });
    el.shareSale.addEventListener('click', function () { doShare(saleShareText()); });
  }

  function bindLeaseEvents() {
    bindGroup(el.leaseTypeGroup, 'lease-type', function (v) {
      state.leaseType = v === 'monthly' ? 'monthly' : 'jeonse';
      refresh();
    });
    bindGroup(el.lsRateGroup, 'ls-rate-mode', function (v) {
      state.lsRateMode = v === 'custom' ? 'custom' : 'cap';
      refresh();
    });
    bindGroup(el.lsVatGroup, 'ls-vat', function (v) {
      state.lsVat = S.VAT_RATES[v] === undefined ? 'general' : v;
      refresh();
    });
    [['lsDeposit', 'deposit', 0, MAX_MONEY, 'ls-deposit'],
     ['lsMonthly', 'monthly', 0, MAX_MONEY, 'ls-monthly'],
     ['lsRate', 'lsRate', 0, 2, '']].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        state[cfg[1]] = readNum(el[cfg[0]], 0, cfg[2], cfg[3]);
        if (cfg[4]) syncChips(cfg[4], state[cfg[1]]);
        refresh();
      });
    });
    [['ls-deposit', 'deposit', 'lsDeposit'], ['ls-monthly', 'monthly', 'lsMonthly']].forEach(function (cfg) {
      $$('.chips [data-' + cfg[0] + ']').forEach(function (b) {
        b.addEventListener('click', function () {
          state[cfg[1]] = Number(b.getAttribute('data-' + cfg[0]));
          el[cfg[2]].value = String(state[cfg[1]]);
          syncChips(cfg[0], state[cfg[1]]);
          refresh();
        });
      });
    });
    el.shareLease.addEventListener('click', function () { doShare(leaseShareText()); });
  }

  function bindMoveEvents() {
    bindGroup(el.mvDealGroup, 'mv-deal', function (v) {
      state.mvDeal = (v === 'sale' || v === 'monthly') ? v : 'jeonse';
      refresh();
    });
    bindGroup(el.mvVatGroup, 'mv-vat', function (v) {
      state.mvVat = S.VAT_RATES[v] === undefined ? 'general' : v;
      refresh();
    });
    bindGroup(el.mvMethodGroup, 'mv-method', function (v) {
      state.moveMethod = ['full', 'half', 'general'].indexOf(v) >= 0 ? v : 'full';
      refresh();
    });
    bindGroup(el.mvCleanGroup, 'mv-clean', function (v) {
      state.cleanType = ['in', 'new', 'none'].indexOf(v) >= 0 ? v : 'in';
      refresh();
    });
    bindGroup(el.mvStampGroup, 'mv-stamp', function (v) {
      state.stampCopies = v === '1' ? 1 : 2;
      refresh();
    });

    [['mvPrice', 'mvPrice', 0, MAX_MONEY],
     ['mvDeposit', 'mvDeposit', 0, MAX_MONEY],
     ['mvMonthly', 'mvMonthly', 0, MAX_MONEY],
     ['mvMoveQuote', 'moveQuote', 0, MAX_MONEY],
     ['mvCleanQuote', 'cleanQuote', 0, MAX_MONEY],
     ['mvLawyer', 'lawyer', 0, 10000000]].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        state[cfg[1]] = readNum(el[cfg[0]], 0, cfg[2], cfg[3]);
        refresh();
      });
    });
    el.mvPyeong.addEventListener('input', function () {
      state.pyeong = Math.round(readNum(el.mvPyeong, 24, S.LIMITS.pyeong.min, S.LIMITS.pyeong.max));
      syncChips('mv-pyeong', state.pyeong);
      refresh();
    });
    $$('.chips [data-mv-pyeong]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.pyeong = Number(b.getAttribute('data-mv-pyeong'));
        el.mvPyeong.value = String(state.pyeong);
        syncChips('mv-pyeong', state.pyeong);
        refresh();
      });
    });
    [['mvSeason', 'season'], ['mvLadder', 'ladder'], ['mvFixed', 'fixedDate'], ['mvInsurance', 'insurance']].forEach(function (cfg) {
      el[cfg[0]].addEventListener('change', function () {
        state[cfg[1]] = el[cfg[0]].checked;
        refresh();
      });
    });
    el.mvInsuranceRate.addEventListener('input', function () {
      state.insuranceRate = readNum(el.mvInsuranceRate, 0.128, 0, 2);
      refresh();
    });
    el.mvRegMethod.addEventListener('change', function () {
      state.regMethod = ['online', 'eform', 'paper'].indexOf(el.mvRegMethod.value) >= 0 ? el.mvRegMethod.value : 'online';
      refresh();
    });
    el.mvRegCount.addEventListener('change', function () {
      state.regCount = clamp(parseInt(el.mvRegCount.value, 10) || 1, 1, 3);
      refresh();
    });
    el.mvCopyCount.addEventListener('change', function () {
      state.copyCount = clamp(parseInt(el.mvCopyCount.value, 10) || 0, 0, 3);
      refresh();
    });
    el.shareMove.addEventListener('click', function () { doShare(moveShareText()); });
  }

  function refresh() {
    syncSaleForm();
    syncLeaseForm();
    syncMoveForm();
    renderSale();
    renderLease();
    renderMove();
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

    bindSaleEvents();
    bindLeaseEvents();
    bindMoveEvents();
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
