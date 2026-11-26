/*!
 * app.js — 2026 월세 세액공제 & 전세대출 소득공제 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.MRCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'mrt.state.v1';
  var THEME_KEY = 'ctx.theme';
  var TABS = ['rent', 'loan', 'compare', 'guide'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function won(n) { return nf.format(Math.round(n || 0)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /** 5,000만원 · 172만 5,000원처럼 읽기 쉽게 */
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
    tab: 'rent',
    rent: {
      salary: 45000000, income: 33000000, incomeAuto: true,
      monthly: 550000, months: 12, area: 59, price: 300000000, tax: 1200000,
      region: 0, head: true, address: true, multi: false,
      spouse: false, spouseSalary: 50000000, spouseMonthly: 400000, spouseRegion: 1
    },
    loan: { salary: 45000000, repay: 6000000, savings: 0, area: 59, dependents: 1, region: 0, lender: 'bank', head: true },
    compare: {
      salary: 45000000, tax: 1200000, monthly: 550000, months: 12,
      credit: 12000000, cash: 3000000, area: 59, price: 300000000, standard: 0, head: true
    },
    checks: {}
  };

  var L = S.LIMITS;

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    function take(target, source, spec) {
      if (!source || typeof source !== 'object') return;
      spec.forEach(function (pair) {
        if (typeof source[pair[0]] === 'boolean') { target[pair[0]] = source[pair[0]]; return; }
        var v = parseFloat(source[pair[0]]);
        if (isFinite(v)) target[pair[0]] = clamp(v, pair[1].min, pair[1].max);
      });
    }

    take(state.rent, raw.rent, [
      ['salary', L.salary], ['income', L.income], ['monthly', L.monthlyRent], ['months', L.months],
      ['area', L.area], ['price', L.price], ['tax', L.tax], ['spouseSalary', L.salary], ['spouseMonthly', L.monthlyRent]
    ]);
    if (raw.rent && typeof raw.rent === 'object') {
      state.rent.incomeAuto = raw.rent.incomeAuto !== false;
      state.rent.head = raw.rent.head !== false;
      state.rent.address = raw.rent.address !== false;
      state.rent.multi = !!raw.rent.multi;
      state.rent.spouse = !!raw.rent.spouse;
      state.rent.region = raw.rent.region === 1 ? 1 : 0;
      state.rent.spouseRegion = raw.rent.spouseRegion === 0 ? 0 : 1;
    }

    take(state.loan, raw.loan, [
      ['salary', L.salary], ['repay', L.amount], ['savings', L.amount], ['area', L.area], ['dependents', L.months]
    ]);
    if (raw.loan && typeof raw.loan === 'object') {
      state.loan.head = raw.loan.head !== false;
      state.loan.region = raw.loan.region === 1 ? 1 : 0;
      state.loan.lender = raw.loan.lender === 'private' ? 'private' : 'bank';
    }

    take(state.compare, raw.compare, [
      ['salary', L.salary], ['tax', L.tax], ['monthly', L.monthlyRent], ['months', L.months],
      ['credit', L.amount], ['cash', L.amount], ['area', L.area], ['price', L.price]
    ]);
    if (raw.compare && typeof raw.compare === 'object') {
      state.compare.standard = raw.compare.standard === 1 ? 1 : 0;
      state.compare.head = raw.compare.head !== false;
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
    el.tabRent = $('#tabRent');
    el.tabLoan = $('#tabLoan');
    el.tabCompare = $('#tabCompare');
    el.tabGuide = $('#tabGuide');
    el.panelRent = $('#panelRent');
    el.panelLoan = $('#panelLoan');
    el.panelCompare = $('#panelCompare');
    el.panelGuide = $('#panelGuide');

    /* 탭 1 */
    el.rtSalary = $('#rtSalary');
    el.rtSalaryBadge = $('#rtSalaryBadge');
    el.rtIncome = $('#rtIncome');
    el.rtIncomeBadge = $('#rtIncomeBadge');
    el.rtMonthly = $('#rtMonthly');
    el.rtMonthlyBadge = $('#rtMonthlyBadge');
    el.rtMonths = $('#rtMonths');
    el.rtMonthsBadge = $('#rtMonthsBadge');
    el.rtTax = $('#rtTax');
    el.rtTaxBadge = $('#rtTaxBadge');
    el.rtArea = $('#rtArea');
    el.rtAreaBadge = $('#rtAreaBadge');
    el.rtPrice = $('#rtPrice');
    el.rtPriceBadge = $('#rtPriceBadge');
    el.rtRegionGroup = $('#rtRegionGroup');
    el.rtSpouseGroup = $('#rtSpouseGroup');
    el.rtSpouseFields = $('#rtSpouseFields');
    el.rtSpouseSalary = $('#rtSpouseSalary');
    el.rtSpouseSalaryBadge = $('#rtSpouseSalaryBadge');
    el.rtSpouseMonthly = $('#rtSpouseMonthly');
    el.rtSpouseMonthlyBadge = $('#rtSpouseMonthlyBadge');
    el.rtSpouseRegionGroup = $('#rtSpouseRegionGroup');
    el.rtTotal = $('#rtTotal');
    el.rtSub = $('#rtSub');
    el.rtVerdict = $('#rtVerdict');
    el.rtRefund = $('#rtRefund');
    el.rtRows = $('#rtRows');
    el.rtStatRent = $('#rtStatRent');
    el.rtStatBase = $('#rtStatBase');
    el.rtStatRate = $('#rtStatRate');
    el.rtStatLeft = $('#rtStatLeft');
    el.rtMeterFill = $('#rtMeterFill');
    el.rtMeterLeft = $('#rtMeterLeft');
    el.rtMeterRight = $('#rtMeterRight');
    el.rtElig = $('#rtElig');
    el.rtNextTitle = $('#rtNextTitle');
    el.rtNext = $('#rtNext');
    el.rtInsight = $('#rtInsight');
    el.rtScaleTable = $('#rtScaleTable');
    el.shareRent = $('#shareRent');

    /* 탭 2 */
    el.lnSalary = $('#lnSalary');
    el.lnSalaryBadge = $('#lnSalaryBadge');
    el.lnRepay = $('#lnRepay');
    el.lnRepayBadge = $('#lnRepayBadge');
    el.lnSavings = $('#lnSavings');
    el.lnSavingsBadge = $('#lnSavingsBadge');
    el.lnArea = $('#lnArea');
    el.lnAreaBadge = $('#lnAreaBadge');
    el.lnDependents = $('#lnDependents');
    el.lnDependentsBadge = $('#lnDependentsBadge');
    el.lnRegionGroup = $('#lnRegionGroup');
    el.lnLenderGroup = $('#lnLenderGroup');
    el.lnTotal = $('#lnTotal');
    el.lnSub = $('#lnSub');
    el.lnVerdict = $('#lnVerdict');
    el.lnRefund = $('#lnRefund');
    el.lnRows = $('#lnRows');
    el.lnStatRate = $('#lnStatRate');
    el.lnStatDed = $('#lnStatDed');
    el.lnStatSaving = $('#lnStatSaving');
    el.lnStatEff = $('#lnStatEff');
    el.lnMeterFill = $('#lnMeterFill');
    el.lnMeterLeft = $('#lnMeterLeft');
    el.lnMeterRight = $('#lnMeterRight');
    el.lnElig = $('#lnElig');
    el.lnNextTitle = $('#lnNextTitle');
    el.lnNext = $('#lnNext');
    el.lnInsight = $('#lnInsight');
    el.lnMarginTable = $('#lnMarginTable');
    el.lnCompareTable = $('#lnCompareTable');
    el.shareLoan = $('#shareLoan');

    /* 탭 3 */
    el.cpSalary = $('#cpSalary');
    el.cpSalaryBadge = $('#cpSalaryBadge');
    el.cpTax = $('#cpTax');
    el.cpTaxBadge = $('#cpTaxBadge');
    el.cpMonthly = $('#cpMonthly');
    el.cpMonthlyBadge = $('#cpMonthlyBadge');
    el.cpMonths = $('#cpMonths');
    el.cpMonthsBadge = $('#cpMonthsBadge');
    el.cpCredit = $('#cpCredit');
    el.cpCreditBadge = $('#cpCreditBadge');
    el.cpCash = $('#cpCash');
    el.cpCashBadge = $('#cpCashBadge');
    el.cpArea = $('#cpArea');
    el.cpAreaBadge = $('#cpAreaBadge');
    el.cpPrice = $('#cpPrice');
    el.cpPriceBadge = $('#cpPriceBadge');
    el.cpStandardGroup = $('#cpStandardGroup');
    el.cpDiff = $('#cpDiff');
    el.cpSub = $('#cpSub');
    el.cpVerdict = $('#cpVerdict');
    el.cpATotal = $('#cpATotal');
    el.cpANote = $('#cpANote');
    el.cpBTotal = $('#cpBTotal');
    el.cpBNote = $('#cpBNote');
    el.cpRows = $('#cpRows');
    el.cpNextTitle = $('#cpNextTitle');
    el.cpNext = $('#cpNext');
    el.cpInsight = $('#cpInsight');
    el.cpRateTable = $('#cpRateTable');
    el.shareCompare = $('#shareCompare');

    /* 탭 4 */
    el.gdBar = $('#gdBar');
    el.gdCount = $('#gdCount');
    el.gdReset = $('#gdReset');

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
    if (TABS.indexOf(name) < 0) name = 'rent';
    state.tab = name;
    var map = {
      rent: [el.tabRent, el.panelRent],
      loan: [el.tabLoan, el.panelLoan],
      compare: [el.tabCompare, el.panelCompare],
      guide: [el.tabGuide, el.panelGuide]
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
    el.tabRent.addEventListener('click', function () { setTab('rent'); });
    el.tabLoan.addEventListener('click', function () { setTab('loan'); });
    el.tabCompare.addEventListener('click', function () { setTab('compare'); });
    el.tabGuide.addEventListener('click', function () { setTab('guide'); });
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
    setTab(TABS.indexOf(hash) >= 0 ? hash : (state.tab || 'rent'));
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

  function syncChips(attr, value) {
    $$('.chips [data-' + attr + ']').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-' + attr)) === Number(value));
    });
  }

  /* ── 탭 1: 월세 세액공제 ──────────────────────────────── */
  function rentInput() {
    return {
      salary: state.rent.salary,
      income: state.rent.income,
      monthlyRent: state.rent.monthly,
      months: state.rent.months,
      area: state.rent.area,
      price: state.rent.price,
      multiChild: state.rent.multi,
      wideArea: state.rent.region === 1,
      head: state.rent.head,
      addressOk: state.rent.address,
      incomeTax: state.rent.tax,
      spouse: {
        enabled: state.rent.spouse,
        salary: state.rent.spouseSalary,
        monthlyRent: state.rent.spouseMonthly,
        months: state.rent.months,
        otherRegion: state.rent.spouseRegion === 1
      }
    };
  }

  function syncRentForm() {
    el.rtSalary.value = state.rent.salary;
    el.rtIncome.value = state.rent.income;
    el.rtMonthly.value = state.rent.monthly;
    el.rtMonths.value = state.rent.months;
    el.rtTax.value = state.rent.tax;
    el.rtArea.value = state.rent.area;
    el.rtPrice.value = state.rent.price;
    el.rtSalaryBadge.textContent = wonShort(state.rent.salary);
    el.rtIncomeBadge.textContent = wonShort(state.rent.income);
    el.rtMonthlyBadge.textContent = wonShort(state.rent.monthly);
    el.rtMonthsBadge.textContent = state.rent.months + '개월';
    el.rtTaxBadge.textContent = wonShort(state.rent.tax);
    el.rtAreaBadge.textContent = Math.round(state.rent.area) + '㎡';
    el.rtPriceBadge.textContent = state.rent.price > 0 ? wonShort(state.rent.price) : '모름';
    el.rtSpouseSalary.value = state.rent.spouseSalary;
    el.rtSpouseMonthly.value = state.rent.spouseMonthly;
    el.rtSpouseSalaryBadge.textContent = wonShort(state.rent.spouseSalary);
    el.rtSpouseMonthlyBadge.textContent = wonShort(state.rent.spouseMonthly);
    el.rtSpouseFields.hidden = !state.rent.spouse;
    syncGroup(el.rtRegionGroup, 'rt-region', state.rent.region);
    syncGroup(el.rtSpouseGroup, 'rt-spouse', state.rent.spouse ? 1 : 0);
    syncGroup(el.rtSpouseRegionGroup, 'rt-spouse-region', state.rent.spouseRegion);
    syncChips('rt-salary', state.rent.salary);
    syncChips('rt-monthly', state.rent.monthly);
    syncChips('rt-tax', state.rent.tax);
  }

  function renderRent() {
    var r = S.rentCredit(rentInput());
    var spouseBase = r.spouse.enabled ? r.spouse.base : 0;
    var totalBase = r.base + spouseBase;

    el.rtTotal.textContent = won(r.appliedCredit);
    el.rtSub.textContent = '월세 ' + wonShort(r.annualRent) + ' · 공제율 ' + r.rateLabel +
      ' · 공제 대상 ' + wonShort(totalBase) +
      (r.capped ? ' · 산출세액 한도로 ' + wonShort(r.lost) + ' 소멸' : '');

    if (r.missing > 0) setBadge(el.rtVerdict, '요건 미달', 3);
    else if (r.capped) setBadge(el.rtVerdict, '산출세액 한도', 3);
    else if (r.rate === S.RULES.rent.rateLow) setBadge(el.rtVerdict, '17% 구간', 1);
    else setBadge(el.rtVerdict, '15% 구간', 2);

    el.rtRefund.textContent = '+' + won(r.applied) + '원';

    var html = '';
    html += row('연간 월세', won(r.annualRent) + '원', r.months + '개월 납부', 'is-dim');
    if (r.spouse.enabled) {
      html += row('배우자 월세', won(r.spouse.annualRent) + '원',
        r.spouse.excess > 0 ? '합산 한도 초과 ' + wonShort(r.spouse.excess) + ' 차감' : '부부 합산 1,000만원 이내');
    }
    html += row('공제 대상 월세', won(totalBase) + '원', '연 1,000만원 한도');
    html += row('공제율', r.rateLabel, '총급여 ' + wonShort(r.salary) + ' · 종합소득 ' + wonShort(r.income));
    html += row('세액공제', won(r.totalCredit) + '원',
      r.spouse.enabled ? '세대주 ' + won(r.credit) + ' + 배우자 ' + won(r.spouse.credit) : '공제 대상 × 공제율');
    html += row('지방소득세', won(r.local) + '원', '소득세 공제의 10%');
    if (r.capped) html += row('산출세액 한도 초과', '−' + won(r.lost) + '원', '이월되지 않아 사라짐', 'is-dim');
    html += row('실제 반영', '+' + won(r.applied) + '원',
      '소득세 ' + won(r.appliedCredit) + ' + 지방세 ' + won(r.appliedLocal), 'total');
    el.rtRows.innerHTML = html;

    el.rtStatRent.textContent = won(r.annualRent) + '원';
    el.rtStatBase.textContent = won(totalBase) + '원';
    el.rtStatRate.textContent = pct(r.effective, 1);
    el.rtStatLeft.textContent = won(r.capLeft) + '원';

    el.rtMeterFill.style.width = (r.capUsedRate * 100).toFixed(2) + '%';
    el.rtMeterFill.setAttribute('data-tone', r.capUsedRate > 0.999 ? 'warn' : '');
    el.rtMeterLeft.textContent = '연 1,000만원 한도 ' + Math.round(r.capUsedRate * 100) + '%';
    el.rtMeterRight.textContent = '한도 1,000만원';

    renderElig(el.rtElig, r.reasons);

    var nextTitle = '다음에 할 일';
    var next = '';
    if (r.missing > 0) {
      nextTitle = '요건을 다시 확인하세요';
      next = '체크되지 않은 항목이 있어 공제액을 0원으로 계산했습니다. ' +
        r.reasons.filter(function (x) { return !x.ok; }).map(function (x) { return '<strong>' + x.label + '</strong>'; }).join(', ') +
        '을 확인하세요. 주소 요건은 전입신고로 해결되는 경우가 많습니다.';
    } else if (r.capped) {
      nextTitle = '산출세액이 모자랍니다';
      next = '계산상 공제 <strong>' + won(r.totalCredit) + '원</strong> 중 <strong>' + won(r.appliedCredit) +
        '원</strong>만 반영되고 ' + won(r.lost) + '원은 사라집니다(이월 없음). 낼 세금이 이것뿐이라면 공제가 커도 환급은 늘지 않습니다.';
    } else if (r.annualRent > S.RULES.rent.cap) {
      nextTitle = '한도 초과분은 공제되지 않습니다';
      next = '연간 월세 <strong>' + won(r.annualRent) + '원</strong> 중 1,000만원까지만 공제됩니다. 넘는 ' +
        wonShort(r.annualRent - S.RULES.rent.cap) + '은 공제 대상이 아니니, 탭 3에서 <strong>현금영수증 30% 소득공제</strong>로 돌리는 편이 나은지 비교해 보세요.';
    } else if (r.rate === S.RULES.rent.rateLow) {
      nextTitle = '17% 구간입니다';
      next = '총급여 5,500만원 이하이면서 종합소득금액 4,500만원 이하라 <strong>17%</strong>가 적용됩니다. 한도까지 ' +
        wonShort(r.capLeft) + '이 남아 있으니, 월세가 오르면 그만큼 더 돌려받습니다.';
    } else {
      nextTitle = '지금은 15% 구간입니다';
      next = '총급여 ' + wonShort(r.salary) + ' · 종합소득금액 ' + wonShort(r.income) + '으로 <strong>15%</strong>가 적용됩니다. ' +
        (r.salary > S.RULES.rent.salaryLow ? '총급여 5,500만원 이하' : '종합소득금액 4,500만원 이하') +
        ' 요건을 함께 넘지 못해 17%는 적용되지 않습니다.';
    }
    if (r.spouse.enabled && r.spouse.otherRegion && !r.spouse.rate.eligible && r.missing === 0) {
      next += ' 배우자는 소득 요건을 넘어 추가 공제를 받지 못했습니다.';
    }
    el.rtNextTitle.textContent = nextTitle;
    el.rtNext.innerHTML = next;

    var ins;
    if (r.missing > 0) {
      ins = '월세 세액공제는 <strong>요건을 모두 갖춘 사람만</strong> 받습니다. 총급여 8,000만원·종합소득금액 7,000만원, 무주택 세대, 대상 주택, 주소 일치 네 가지를 한 번에 봐야 합니다.';
      setInsight(el.rtInsight, ins, 'is-warn');
    } else if (r.capped) {
      ins = '세액공제는 <strong>그해 산출세액을 넘을 수 없고</strong> 다음 해로 넘어가지 않습니다. 원천징수영수증의 산출세액과 이미 받은 세액공제를 먼저 확인하세요.';
      setInsight(el.rtInsight, ins, 'is-warn');
    } else if (r.rate === S.RULES.rent.rateLow) {
      ins = '17%는 <strong>월세 × 0.17</strong>이 그대로 세금에서 빠지는 구조입니다. 월세 55만원이면 연 660만원 × 17% = 112만 2,000원, 지방소득세까지 123만 4,200원이 줄어듭니다.';
      setInsight(el.rtInsight, ins, 'is-ok');
    } else {
      ins = '15% 구간은 월세 55만원 기준 연 99만원(지방세 포함)입니다. 17% 구간과 2%포인트 차이라, 총급여 5,500만원 근처라면 연말정산 미리보기로 어느 쪽인지 확인해 두세요.';
      setInsight(el.rtInsight, ins, '');
    }

    /* 월세액별 비교 */
    var tbody = '';
    S.rentScale(rentInput()).forEach(function (s) {
      var now = s.monthly === r.monthlyRent;
      tbody += '<tr' + (now ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + wonShort(s.monthly) + '</th>' +
        '<td>' + wonShort(s.base) + '</td>' +
        '<td><strong>' + wonShort(s.credit) + '</strong></td>' +
        '<td>' + wonShort(s.total) + '</td></tr>';
    });
    $('tbody', el.rtScaleTable).innerHTML = tbody;
  }

  function rentShareText() {
    var r = S.rentCredit(rentInput());
    return '[월세 세액공제 2026]\n' +
      '월세 ' + wonShort(r.annualRent) + ' (' + r.months + '개월) · 총급여 ' + wonShort(r.salary) +
      ' · 종합소득금액 ' + wonShort(r.income) + '\n' +
      '공제율 ' + r.rateLabel + ' · 공제 대상 ' + won(r.base + (r.spouse.enabled ? r.spouse.base : 0)) + '원\n' +
      '세액공제 ' + won(r.totalCredit) + '원 + 지방소득세 ' + won(r.local) + '원 = ' + won(r.total) + '원\n' +
      (r.capped ? '산출세액 한도로 ' + won(r.lost) + '원 소멸(이월 없음)\n' : '') +
      (r.spouse.enabled ? '배우자 추가 공제 ' + won(r.spouse.credit) + '원 포함(부부 합산 1,000만원)\n' : '') +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/monthly-rent-tax/');
  }

  /* ── 탭 2: 전세대출 소득공제 ──────────────────────────── */
  function loanInput() {
    return {
      salary: state.loan.salary,
      repay: state.loan.repay,
      savings: state.loan.savings,
      area: state.loan.area,
      wideArea: state.loan.region === 1,
      head: state.loan.head,
      loanType: state.loan.lender,
      dependents: state.loan.dependents
    };
  }

  function syncLoanForm() {
    el.lnSalary.value = state.loan.salary;
    el.lnRepay.value = state.loan.repay;
    el.lnSavings.value = state.loan.savings;
    el.lnArea.value = state.loan.area;
    el.lnDependents.value = state.loan.dependents;
    el.lnSalaryBadge.textContent = wonShort(state.loan.salary);
    el.lnRepayBadge.textContent = wonShort(state.loan.repay);
    el.lnSavingsBadge.textContent = wonShort(state.loan.savings);
    el.lnAreaBadge.textContent = Math.round(state.loan.area) + '㎡';
    el.lnDependentsBadge.textContent = state.loan.dependents + '명';
    syncGroup(el.lnRegionGroup, 'ln-region', state.loan.region);
    syncGroup(el.lnLenderGroup, 'ln-lender', state.loan.lender);
    syncChips('ln-salary', state.loan.salary);
    syncChips('ln-repay', state.loan.repay);
  }

  function renderLoan() {
    var l = S.loanDeduction(loanInput());

    el.lnTotal.textContent = won(l.totalDed);
    el.lnSub.textContent = '상환 ' + wonShort(l.repay) + ' × 40% · 한계세율 ' + pct(l.marginal, 0) +
      ' · 400만원 한도 ' + Math.round(l.capUsedRate * 100) + '%';

    if (l.missing > 0) setBadge(el.lnVerdict, '요건 미달', 3);
    else if (l.totalDed <= 0) setBadge(el.lnVerdict, '금액 없음', 3);
    else if (l.totalDed >= S.RULES.loan.cap) setBadge(el.lnVerdict, '한도 도달', 2);
    else setBadge(el.lnVerdict, '공제 적용', 1);

    el.lnRefund.textContent = '+' + won(l.saving.total) + '원';

    var html = '';
    html += row('연간 원리금 상환액', won(l.repay) + '원', '이자 + 원금', 'is-dim');
    html += row('전세대출 공제 (40%)', won(l.loanCapOnly) + '원', '연 400만원 한도');
    if (l.savings > 0) {
      html += row('청약저축 공제 (40%)', won(l.savingsCapOnly) + '원',
        l.savingsEligible ? '납입 ' + wonShort(l.savings) + ' · 300만원 한도' : '총급여 7,000만원 초과로 제외');
    }
    if (l.savings > 0 && l.loanCapOnly + l.savingsCapOnly > S.RULES.loan.cap) {
      html += row('합산 한도 적용', '−' + won(l.loanCapOnly + l.savingsCapOnly - l.totalDed) + '원',
        '청약저축과 합쳐 400만원', 'is-dim');
    }
    html += row('소득공제액', won(l.totalDed) + '원',
      '전세대출 ' + won(l.loanPart) + ' + 청약 ' + won(l.savingsPart));
    html += row('과세표준', won(l.saving.taxableBefore) + ' → ' + won(l.saving.taxableAfter) + '원',
      l.bracket + ' 구간', 'is-dim');
    html += row('소득세 절감', won(l.saving.incomeTax) + '원', '공제액 × 한계세율 ' + pct(l.marginal, 0));
    html += row('지방소득세', won(l.saving.local) + '원', '소득세의 10%');
    html += row('실제로 줄어드는 세금', '+' + won(l.saving.total) + '원', '상환액의 ' + pct(l.effective, 1), 'total');
    el.lnRows.innerHTML = html;

    el.lnStatRate.textContent = pct(l.marginal, 0);
    el.lnStatDed.textContent = won(l.totalDed) + '원';
    el.lnStatSaving.textContent = won(l.saving.total) + '원';
    el.lnStatEff.textContent = pct(l.effective, 1);

    el.lnMeterFill.style.width = (l.capUsedRate * 100).toFixed(2) + '%';
    el.lnMeterFill.setAttribute('data-tone', l.capUsedRate > 0.999 ? 'warn' : '');
    el.lnMeterLeft.textContent = '합산 한도 400만원 중 ' + Math.round(l.capUsedRate * 100) + '%';
    el.lnMeterRight.textContent = '한도 400만원';

    renderElig(el.lnElig, l.reasons);

    var nextTitle = '다음에 할 일';
    var next = '';
    if (l.missing > 0) {
      nextTitle = '요건을 확인하세요';
      next = l.reasons.filter(function (x) { return !x.ok; }).map(function (x) { return '<strong>' + x.label + '</strong>'; }).join(', ') +
        ' — 이 경우 전세대출 공제는 적용되지 않습니다.';
    } else if (l.repay <= 0) {
      nextTitle = '상환액을 넣어 주세요';
      next = '금융기관 전세자금대출의 1년간 원리금 상환액을 넣으면 공제액과 실제 절세액을 계산합니다.';
    } else if (l.loanPart < l.loanCapOnly) {
      nextTitle = '청약저축과 한도를 나눠 씁니다';
      next = '전세대출 공제 <strong>' + won(l.loanCapOnly) + '원</strong> 중 <strong>' + won(l.loanPart) +
        '원</strong>만 반영됐습니다. 청약저축 공제 ' + won(l.savingsPart) + '원과 합쳐 400만원이 한도이기 때문입니다. 둘을 합친 절세액은 ' +
        won(l.saving.total) + '원입니다.';
    } else if (l.repay >= l.repayForFullCap) {
      nextTitle = '한도를 다 채웠습니다';
      next = '원리금 <strong>' + won(l.repayForFullCap) + '원</strong>을 갚으면 공제 400만원이 꽉 찹니다. 지금은 ' +
        won(l.repay) + '원을 갚아 한도에 도달했습니다. 더 갚아도 공제는 늘지 않습니다.';
    } else {
      nextTitle = '한도가 남아 있습니다';
      next = '400만원 한도까지 <strong>' + won(l.capLeft) + '원</strong>이 남았습니다. 원리금을 ' +
        won(l.repayForFullCap) + '원까지 갚으면 공제가 최대가 됩니다.';
    }
    el.lnNextTitle.textContent = nextTitle;
    el.lnNext.innerHTML = next;

    var ins;
    if (l.missing > 0) {
      ins = '전세대출 공제는 <strong>국민주택규모(85㎡, 읍·면 100㎡) 이하</strong> 주택만 대상입니다. 월세 공제와 달리 기준시가 4억원 요건은 없지만, 면적 요건은 더 엄격합니다.';
      setInsight(el.lnInsight, ins, 'is-warn');
    } else if (l.totalDed > 0) {
      ins = '소득공제는 <strong>과세표준을 줄이는 방식</strong>이라 절세액이 한계세율(' + pct(l.marginal, 0) +
        ')에 따라 달라집니다. 같은 400만원이라도 세율 6%면 26만 4,000원, 24%면 105만 6,000원입니다.';
      setInsight(el.lnInsight, ins, 'is-ok');
    } else {
      ins = '전세대출을 갚고 있다면 원리금 상환액의 40%가 소득공제됩니다. 청약저축과 합쳐 400만원이 한도이고, 증명서는 금융회사에서 발급받아 회사에 내면 됩니다.';
      setInsight(el.lnInsight, ins, '');
    }

    /* 한계세율별 표 */
    var mrows = '';
    S.marginalTable(l.totalDed).forEach(function (m) {
      var now = Math.abs(m.rate - l.marginal) < 1e-6;
      mrows += '<tr' + (now ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + pct(m.rate, 0) + '</th>' +
        '<td>' + wonShort(m.deduction) + '</td>' +
        '<td>' + wonShort(m.incomeTax) + '</td>' +
        '<td><strong>' + wonShort(m.total) + '</strong></td></tr>';
    });
    $('tbody', el.lnMarginTable).innerHTML = mrows;

    /* 월세·현금영수증과 비교 */
    var rentMax = Math.floor(S.RULES.rent.cap * (l.salary <= S.RULES.rent.salaryLow ? S.RULES.rent.rateLow : S.RULES.rent.rateHigh));
    var rentRateValue = l.salary <= S.RULES.rent.salaryLow ? S.RULES.rent.rateLow : S.RULES.rent.rateHigh;
    var rentEligible = l.salary <= S.RULES.rent.salaryCap;
    var crows = '';
    crows += '<tr class="is-now"><th scope="row">전세대출 40% 소득공제</th><td>' + wonShort(l.totalDed) + '</td>' +
      '<td><strong>' + wonShort(l.saving.total) + '</strong></td><td>한계세율 ' + pct(l.marginal, 0) + ' 반영</td></tr>';
    crows += '<tr><th scope="row">월세 세액공제 ' + pct(rentRateValue, 0) + '</th><td>' +
      (rentEligible ? wonShort(rentMax) : '대상 아님') + '</td><td>' +
      (rentEligible ? wonShort(rentMax + Math.floor(rentMax * S.RULES.localTaxRate)) : '—') + '</td><td>세율과 무관하게 그대로</td></tr>';
    crows += '<tr><th scope="row">월세 현금영수증 30%</th><td>사용액의 30%</td><td>' +
      pct(S.RULES.card.cashRate * l.marginal * 1.1, 2) +
      '</td><td>실효 절세율(한계세율 ' + pct(l.marginal, 0) + ')</td></tr>';
    $('tbody', el.lnCompareTable).innerHTML = crows;
  }

  function loanShareText() {
    var l = S.loanDeduction(loanInput());
    return '[전세대출 원리금 소득공제 2026]\n' +
      '상환 ' + wonShort(l.repay) + ' × 40% = 공제 ' + won(l.totalDed) + '원' +
      (l.savingsPart > 0 ? ' (청약저축 ' + won(l.savingsPart) + ' 포함)' : '') + '\n' +
      '한계세율 ' + pct(l.marginal, 0) + ' → 소득세 ' + won(l.saving.incomeTax) + '원 + 지방세 ' +
      won(l.saving.local) + '원 = ' + won(l.saving.total) + '원 절세\n' +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/monthly-rent-tax/');
  }

  /* ── 탭 3: 현금영수증 비교 ───────────────────────────── */
  function compareInput() {
    return {
      salary: state.compare.salary,
      monthlyRent: state.compare.monthly,
      months: state.compare.months,
      credit: state.compare.credit,
      cash: state.compare.cash,
      area: state.compare.area,
      price: state.compare.price,
      head: state.compare.head,
      addressOk: true,
      incomeTax: state.compare.tax,
      standardOnly: state.compare.standard === 1
    };
  }

  function syncCompareForm() {
    el.cpSalary.value = state.compare.salary;
    el.cpTax.value = state.compare.tax;
    el.cpMonthly.value = state.compare.monthly;
    el.cpMonths.value = state.compare.months;
    el.cpCredit.value = state.compare.credit;
    el.cpCash.value = state.compare.cash;
    el.cpArea.value = state.compare.area;
    el.cpPrice.value = state.compare.price;
    el.cpSalaryBadge.textContent = wonShort(state.compare.salary);
    el.cpTaxBadge.textContent = wonShort(state.compare.tax);
    el.cpMonthlyBadge.textContent = wonShort(state.compare.monthly);
    el.cpMonthsBadge.textContent = state.compare.months + '개월';
    el.cpCreditBadge.textContent = wonShort(state.compare.credit);
    el.cpCashBadge.textContent = wonShort(state.compare.cash);
    el.cpAreaBadge.textContent = Math.round(state.compare.area) + '㎡';
    el.cpPriceBadge.textContent = state.compare.price > 0 ? wonShort(state.compare.price) : '모름';
    syncGroup(el.cpStandardGroup, 'cp-standard', state.compare.standard);
  }

  function renderCompare() {
    var c = S.compareCard(compareInput());
    var rentOk = c.rent.eligible;

    el.cpDiff.textContent = won(Math.abs(c.diff));
    el.cpSub.textContent = 'A ' + won(c.a.total) + '원 vs B ' + won(c.b.total) + '원' +
      (c.a.standardLoss > 0 ? ' · 표준세액공제 ' + won(c.a.standardLoss) + '원 반영' : '');

    if (c.annualRent <= 0) setBadge(el.cpVerdict, '월세 없음', 3);
    else if (c.verdict === 'rent') setBadge(el.cpVerdict, 'A 세액공제 유리', 1);
    else if (c.verdict === 'cash') setBadge(el.cpVerdict, 'B 현금영수증 유리', 2);
    else setBadge(el.cpVerdict, '차이 없음', 3);

    el.cpATotal.textContent = won(c.a.total) + '원';
    el.cpANote.innerHTML = '세액공제 ' + won(c.a.rentTotal) + '원 + 카드공제 ' + won(c.a.cardSaving) + '원' +
      (c.a.standardLoss > 0 ? ' − 표준세액공제 ' + won(c.a.standardLoss) + '원' : '') +
      (rentOk ? '' : ' · <strong>세액공제 대상 아님</strong>');
    el.cpBTotal.textContent = won(c.b.total) + '원';
    el.cpBNote.innerHTML = '카드공제 ' + won(c.b.cardSaving) + '원(월세로 늘어난 공제 ' + won(c.b.rentExtraDeduction) + '원)' +
      (c.b.standardCredit > 0 ? ' + 표준세액공제 ' + won(c.b.standardCredit) + '원' : '');

    var html = '';
    html += row('연간 월세', won(c.annualRent) + '원', c.months + '개월', 'is-dim');
    html += row('A · 월세 세액공제', won(c.a.rentTotal) + '원',
      rentOk ? '공제율 ' + c.rent.rateLabel + ' (산출세액 한도 반영)' : '대상 아님');
    html += row('A · 카드 소득공제', won(c.a.cardSaving) + '원', '월세는 카드 사용액에서 제외');
    if (c.a.standardLoss > 0) html += row('A · 표준세액공제 상실', '−' + won(c.a.standardLoss) + '원', '월세 공제 신청 시 배제', 'is-dim');
    html += row('A 합계', won(c.a.total) + '원', '세액공제 + 카드공제');
    html += row('B · 카드 소득공제', won(c.b.cardSaving) + '원', '월세를 현금영수증으로 포함');
    html += row('　└ 월세로 늘어난 공제', won(c.b.rentExtraDeduction) + '원',
      '문턱·한도 적용 후 실효 ' + pct(c.annualRent > 0 ? c.b.rentExtraDeduction / c.annualRent : 0, 1));
    if (c.b.standardCredit > 0) html += row('B · 표준세액공제', '+' + won(c.b.standardCredit) + '원', '유지됨');
    html += row('B 합계', won(c.b.total) + '원', '소득공제는 한계세율만큼만 절세');
    html += row(c.diff >= 0 ? 'A가 유리한 금액' : 'B가 유리한 금액', '+' + won(Math.abs(c.diff)) + '원',
      '연간 기준', 'total');
    el.cpRows.innerHTML = html;

    var nextTitle = '결론';
    var next = '';
    if (c.annualRent <= 0) {
      nextTitle = '월세를 넣어 주세요';
      next = '월세액과 개월 수를 넣으면 세액공제와 현금영수증 전환을 같은 조건에서 비교합니다.';
    } else if (c.verdict === 'rent') {
      nextTitle = '월세 세액공제가 유리합니다';
      next = '연 <strong>' + won(Math.abs(c.diff)) + '원</strong> 더 돌려받습니다. 총급여 8,000만원 이하이고 월세가 1,000만원을 넘지 않는다면 세액공제를 신청하세요. ' +
        '한도 초과분만 현금영수증으로 돌리는 혼합도 가능합니다.';
    } else if (c.verdict === 'cash') {
      nextTitle = '현금영수증이 유리합니다';
      next = '연 <strong>' + won(Math.abs(c.diff)) + '원</strong> 차이입니다. 총급여 8,000만원을 넘어 세액공제 대상이 아니거나, 월세가 1,000만원 한도를 크게 넘는 경우입니다. ' +
        '홈택스에서 임대인 동의 없이 주택임대료 현금영수증을 신고할 수 있습니다.';
    } else {
      nextTitle = '거의 비슷합니다';
      next = '두 방법의 차이가 1,000원 미만입니다. 신청이 간단한 <strong>월세 세액공제</strong>를 먼저 검토하세요.';
    }
    if (!rentOk && c.annualRent > 0) {
      next += ' 총급여 ' + wonShort(c.salary) + '로 월세 세액공제 대상이 아니므로 A안의 세액공제는 0원입니다.';
    }
    el.cpNextTitle.textContent = nextTitle;
    el.cpNext.innerHTML = next;

    var ins;
    if (!rentOk) {
      ins = '총급여 8,000만원을 넘으면 월세 세액공제는 <strong>아예 없습니다</strong>. 이때는 월세를 현금영수증으로 신고해 30% 소득공제를 받는 것이 유일한 절세 방법입니다(총급여 25% 문턱과 카드 한도 안에서).';
      setInsight(el.cpInsight, ins, 'is-warn');
    } else if (c.a.standardLoss > 0) {
      ins = '표준세액공제 13만원만 받던 분이라면 월세 공제로 <strong>13만원(지방세 포함 14만 3,000원)을 잃습니다</strong>. 월세 공제가 그보다 커야 이득입니다. 건강보험료 공제를 받고 있다면 이미 표준세액공제 대상이 아니라 손해가 없습니다.';
      setInsight(el.cpInsight, ins, 'is-warn');
    } else if (c.a.card.capped) {
      ins = '카드 공제가 이미 한도(' + wonShort(c.a.card.limit) + '원)에 걸려 있어, 월세를 현금영수증으로 돌려도 <strong>공제가 늘지 않습니다</strong>. 이럴 때는 월세 세액공제가 확실히 유리합니다.';
      setInsight(el.cpInsight, ins, 'is-ok');
    } else {
      ins = '현금영수증 30%는 소득공제라 <strong>한계세율만큼만</strong> 돌아옵니다(한계세율 15%면 실효 4.95%). 월세 세액공제 17%가 대부분의 구간에서 앞서는 이유입니다.';
      setInsight(el.cpInsight, ins, '');
    }

    var trows = '';
    S.rateCompareTable(rentOk ? c.rent.rate : S.RULES.rent.rateHigh).forEach(function (r) {
      var now = Math.abs(r.rate - S.marginalRate(c.a.card.taxable)) < 1e-6;
      trows += '<tr' + (now ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + pct(r.rate, 0) + '</th>' +
        '<td>' + pct(r.rentEffective, 2) + '</td>' +
        '<td>' + pct(r.cashEffective, 2) + '</td>' +
        '<td><strong>' + (r.better === 'rent' ? 'A' : 'B') + '</strong></td></tr>';
    });
    $('tbody', el.cpRateTable).innerHTML = trows;
  }

  function compareShareText() {
    var c = S.compareCard(compareInput());
    return '[월세 세액공제 vs 현금영수증 2026]\n' +
      '연간 월세 ' + wonShort(c.annualRent) + ' · 총급여 ' + wonShort(c.salary) + '\n' +
      'A. 월세 세액공제 ' + won(c.a.total) + '원 (세액공제 ' + won(c.a.rentTotal) + ' + 카드 ' + won(c.a.cardSaving) + ')\n' +
      'B. 현금영수증 소득공제 ' + won(c.b.total) + '원 (월세로 늘어난 공제 ' + won(c.b.rentExtraDeduction) + ')\n' +
      (c.diff >= 0 ? 'A가 ' : 'B가 ') + won(Math.abs(c.diff)) + '원 유리\n' +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/monthly-rent-tax/');
  }

  /* ── 체크리스트 ───────────────────────────────────────── */
  /* 계산에 영향을 주는 체크박스는 상태 객체와, 나머지는 state.checks 와 연결합니다. */
  var CHECK_MAP = {
    r_head: ['rent', 'head'],
    r_address: ['rent', 'address'],
    r_multi: ['rent', 'multi'],
    l_head: ['loan', 'head'],
    c_head: ['compare', 'head']
  };

  function checkValue(key) {
    var m = CHECK_MAP[key];
    return m ? !!state[m[0]][m[1]] : !!state.checks[key];
  }

  function setCheckValue(key, value) {
    var m = CHECK_MAP[key];
    if (m) state[m[0]][m[1]] = !!value;
    else if (value) state.checks[key] = true;
    else delete state.checks[key];
  }

  function syncCheckBoxes() {
    $$('input[type="checkbox"][data-check]').forEach(function (box) {
      var key = box.getAttribute('data-check');
      if (key) box.checked = checkValue(key);
    });
  }

  function bindCheckGroup(listSelector, barEl, countEl, resetEl, onEmpty) {
    var list = $(listSelector);
    if (!list) return;
    var boxes = $$('input[type="checkbox"]', list);

    function sync() {
      var done = boxes.filter(function (b) { return b.checked; }).length;
      if (barEl) barEl.style.width = (boxes.length ? done / boxes.length * 100 : 0) + '%';
      if (countEl) countEl.textContent = done + ' / ' + boxes.length;
    }

    boxes.forEach(function (box) {
      var key = box.getAttribute('data-check');
      box.checked = checkValue(key);
      box.addEventListener('change', function () {
        setCheckValue(key, box.checked);
        sync();
        persist();
        if (key === 'r_head' || key === 'r_address' || key === 'r_multi') renderRent();
        if (key === 'l_head') renderLoan();
        if (key === 'c_head') renderCompare();
      });
    });
    if (resetEl) {
      resetEl.addEventListener('click', function () {
        boxes.forEach(function (b) {
          b.checked = false;
          setCheckValue(b.getAttribute('data-check'), false);
        });
        sync();
        persist();
        if (onEmpty) onEmpty();
      });
    }
    sync();
    return sync;
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
    el.promoHeading.textContent = coupang.heading || '이사·전월세 계약 전에 챙길 것';
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
  function bindRentEvents() {
    el.rtSalary.addEventListener('input', function () {
      state.rent.salary = readNum(el.rtSalary, state.rent.salary, L.salary.min, L.salary.max);
      if (state.rent.incomeAuto) state.rent.income = Math.round(S.earnedIncome(state.rent.salary));
      el.rtSalaryBadge.textContent = wonShort(state.rent.salary);
      el.rtIncomeBadge.textContent = wonShort(state.rent.income);
      el.rtIncome.value = state.rent.income;
      syncChips('rt-salary', state.rent.salary);
      renderRent();
      saveState();
    });
    el.rtIncome.addEventListener('input', function () {
      state.rent.income = readNum(el.rtIncome, state.rent.income, L.income.min, L.income.max);
      state.rent.incomeAuto = Math.abs(state.rent.income - Math.round(S.earnedIncome(state.rent.salary))) < 1000;
      el.rtIncomeBadge.textContent = wonShort(state.rent.income);
      renderRent();
      saveState();
    });
    el.rtMonthly.addEventListener('input', function () {
      state.rent.monthly = readNum(el.rtMonthly, state.rent.monthly, L.monthlyRent.min, L.monthlyRent.max);
      el.rtMonthlyBadge.textContent = wonShort(state.rent.monthly);
      syncChips('rt-monthly', state.rent.monthly);
      renderRent();
      saveState();
    });
    el.rtMonths.addEventListener('input', function () {
      state.rent.months = Math.round(readNum(el.rtMonths, state.rent.months, L.months.min, L.months.max));
      el.rtMonthsBadge.textContent = state.rent.months + '개월';
      renderRent();
      saveState();
    });
    el.rtTax.addEventListener('input', function () {
      state.rent.tax = readNum(el.rtTax, state.rent.tax, L.tax.min, L.tax.max);
      el.rtTaxBadge.textContent = wonShort(state.rent.tax);
      syncChips('rt-tax', state.rent.tax);
      renderRent();
      saveState();
    });
    el.rtArea.addEventListener('input', function () {
      state.rent.area = Math.round(readNum(el.rtArea, state.rent.area, L.area.min, L.area.max));
      el.rtAreaBadge.textContent = state.rent.area + '㎡';
      renderRent();
      saveState();
    });
    el.rtPrice.addEventListener('input', function () {
      state.rent.price = readNum(el.rtPrice, state.rent.price, L.price.min, L.price.max);
      el.rtPriceBadge.textContent = state.rent.price > 0 ? wonShort(state.rent.price) : '모름';
      renderRent();
      saveState();
    });
    el.rtSpouseSalary.addEventListener('input', function () {
      state.rent.spouseSalary = readNum(el.rtSpouseSalary, state.rent.spouseSalary, L.salary.min, L.salary.max);
      el.rtSpouseSalaryBadge.textContent = wonShort(state.rent.spouseSalary);
      renderRent();
      saveState();
    });
    el.rtSpouseMonthly.addEventListener('input', function () {
      state.rent.spouseMonthly = readNum(el.rtSpouseMonthly, state.rent.spouseMonthly, L.monthlyRent.min, L.monthlyRent.max);
      el.rtSpouseMonthlyBadge.textContent = wonShort(state.rent.spouseMonthly);
      renderRent();
      saveState();
    });
    bindGroup(el.rtRegionGroup, 'rt-region', function (v) {
      state.rent.region = Number(v);
      syncRentForm();
      renderRent();
      saveState();
    });
    bindGroup(el.rtSpouseGroup, 'rt-spouse', function (v) {
      state.rent.spouse = v === '1';
      syncRentForm();
      renderRent();
      saveState();
    });
    bindGroup(el.rtSpouseRegionGroup, 'rt-spouse-region', function (v) {
      state.rent.spouseRegion = Number(v);
      syncRentForm();
      renderRent();
      saveState();
    });
    $$('.chips [data-rt-salary]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rent.salary = Number(b.getAttribute('data-rt-salary'));
        if (state.rent.incomeAuto) state.rent.income = Math.round(S.earnedIncome(state.rent.salary));
        syncRentForm();
        renderRent();
        saveState();
      });
    });
    $$('.chips [data-rt-monthly]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rent.monthly = Number(b.getAttribute('data-rt-monthly'));
        syncRentForm();
        renderRent();
        saveState();
      });
    });
    $$('.chips [data-rt-tax]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rent.tax = Number(b.getAttribute('data-rt-tax'));
        syncRentForm();
        renderRent();
        saveState();
      });
    });
    el.shareRent.addEventListener('click', function () { doShare(rentShareText()); });
  }

  function bindLoanEvents() {
    el.lnSalary.addEventListener('input', function () {
      state.loan.salary = readNum(el.lnSalary, state.loan.salary, L.salary.min, L.salary.max);
      el.lnSalaryBadge.textContent = wonShort(state.loan.salary);
      syncChips('ln-salary', state.loan.salary);
      renderLoan();
      saveState();
    });
    el.lnRepay.addEventListener('input', function () {
      state.loan.repay = readNum(el.lnRepay, state.loan.repay, L.amount.min, L.amount.max);
      el.lnRepayBadge.textContent = wonShort(state.loan.repay);
      syncChips('ln-repay', state.loan.repay);
      renderLoan();
      saveState();
    });
    el.lnSavings.addEventListener('input', function () {
      state.loan.savings = readNum(el.lnSavings, state.loan.savings, L.amount.min, L.amount.max);
      el.lnSavingsBadge.textContent = wonShort(state.loan.savings);
      renderLoan();
      saveState();
    });
    el.lnArea.addEventListener('input', function () {
      state.loan.area = Math.round(readNum(el.lnArea, state.loan.area, L.area.min, L.area.max));
      el.lnAreaBadge.textContent = state.loan.area + '㎡';
      renderLoan();
      saveState();
    });
    el.lnDependents.addEventListener('input', function () {
      state.loan.dependents = Math.round(readNum(el.lnDependents, state.loan.dependents, 1, 10));
      el.lnDependentsBadge.textContent = state.loan.dependents + '명';
      renderLoan();
      saveState();
    });
    bindGroup(el.lnRegionGroup, 'ln-region', function (v) {
      state.loan.region = Number(v);
      syncLoanForm();
      renderLoan();
      saveState();
    });
    bindGroup(el.lnLenderGroup, 'ln-lender', function (v) {
      state.loan.lender = v === 'private' ? 'private' : 'bank';
      syncLoanForm();
      renderLoan();
      saveState();
    });
    $$('.chips [data-ln-salary]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.loan.salary = Number(b.getAttribute('data-ln-salary'));
        syncLoanForm();
        renderLoan();
        saveState();
      });
    });
    $$('.chips [data-ln-repay]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.loan.repay = Number(b.getAttribute('data-ln-repay'));
        syncLoanForm();
        renderLoan();
        saveState();
      });
    });
    el.shareLoan.addEventListener('click', function () { doShare(loanShareText()); });
  }

  function bindCompareEvents() {
    el.cpSalary.addEventListener('input', function () {
      state.compare.salary = readNum(el.cpSalary, state.compare.salary, L.salary.min, L.salary.max);
      el.cpSalaryBadge.textContent = wonShort(state.compare.salary);
      renderCompare();
      saveState();
    });
    el.cpTax.addEventListener('input', function () {
      state.compare.tax = readNum(el.cpTax, state.compare.tax, L.tax.min, L.tax.max);
      el.cpTaxBadge.textContent = wonShort(state.compare.tax);
      renderCompare();
      saveState();
    });
    el.cpMonthly.addEventListener('input', function () {
      state.compare.monthly = readNum(el.cpMonthly, state.compare.monthly, L.monthlyRent.min, L.monthlyRent.max);
      el.cpMonthlyBadge.textContent = wonShort(state.compare.monthly);
      renderCompare();
      saveState();
    });
    el.cpMonths.addEventListener('input', function () {
      state.compare.months = Math.round(readNum(el.cpMonths, state.compare.months, L.months.min, L.months.max));
      el.cpMonthsBadge.textContent = state.compare.months + '개월';
      renderCompare();
      saveState();
    });
    el.cpCredit.addEventListener('input', function () {
      state.compare.credit = readNum(el.cpCredit, state.compare.credit, L.amount.min, L.amount.max);
      el.cpCreditBadge.textContent = wonShort(state.compare.credit);
      renderCompare();
      saveState();
    });
    el.cpCash.addEventListener('input', function () {
      state.compare.cash = readNum(el.cpCash, state.compare.cash, L.amount.min, L.amount.max);
      el.cpCashBadge.textContent = wonShort(state.compare.cash);
      renderCompare();
      saveState();
    });
    el.cpArea.addEventListener('input', function () {
      state.compare.area = Math.round(readNum(el.cpArea, state.compare.area, L.area.min, L.area.max));
      el.cpAreaBadge.textContent = state.compare.area + '㎡';
      renderCompare();
      saveState();
    });
    el.cpPrice.addEventListener('input', function () {
      state.compare.price = readNum(el.cpPrice, state.compare.price, L.price.min, L.price.max);
      el.cpPriceBadge.textContent = state.compare.price > 0 ? wonShort(state.compare.price) : '모름';
      renderCompare();
      saveState();
    });
    bindGroup(el.cpStandardGroup, 'cp-standard', function (v) {
      state.compare.standard = Number(v);
      syncCompareForm();
      renderCompare();
      saveState();
    });
    el.shareCompare.addEventListener('click', function () { doShare(compareShareText()); });
  }

  function refresh() {
    syncRentForm();
    syncLoanForm();
    syncCompareForm();
    syncCheckBoxes();
    renderRent();
    renderLoan();
    renderCompare();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    if (el.dataDate && S.RULES.verifiedAt) el.dataDate.textContent = S.RULES.verifiedAt;
    if (el.appVersion && CFG.version) el.appVersion.textContent = CFG.version;
    initTabs();
    refresh();
    bindRentEvents();
    bindLoanEvents();
    bindCompareEvents();
    bindCheckGroup('#rtChecks', null, null, null, null);
    bindCheckGroup('#lnChecks', null, null, null, null);
    bindCheckGroup('#cpChecks', null, null, null, null);
    bindCheckGroup('#gdList', el.gdBar, el.gdCount, el.gdReset, function () { toast('체크를 모두 지웠습니다.'); });
    initTheme();
    initAds();
    initPromo();
    initInstall();
    initSW();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
