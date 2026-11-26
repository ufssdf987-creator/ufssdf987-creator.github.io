/*!
 * app.js — 2026 연금저축·IRP 세액공제 & 노후 수령액 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.PensionCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'pnx.state.v1';
  var THEME_KEY = 'pnx.theme';
  var TABS = ['credit', 'combo', 'pension', 'check'];
  var DEADLINE = new Date(2026, 11, 31, 23, 59, 59);

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
      if (man >= 10000) return sign + eok + '억 ' + nf.format(Math.floor(man / 10000)) + '억 ' + nf.format(man % 10000) + '만원';
      return sign + eok + '억 ' + nf.format(man) + '만원';
    }
    if (n >= 10000) return sign + nf.format(Math.round(n / 10000)) + '만원';
    return sign + nf.format(n) + '원';
  }

  function percent(v, digits) {
    var d = digits === undefined ? 1 : digits;
    var n = Number(v) || 0;
    var s = n.toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s + '%';
  }

  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'credit',
    incomeType: 'salary',
    income: 48000000,
    pension: 6000000,
    irp: 3000000,
    isa: 0,
    taxBefore: 0,
    budget: 9000000,
    feePension: 0.25,
    feeIrp: 0.35,
    years: 10,
    balance: 100000000,
    year: 1,
    age: 62,
    withdraw: 12000000,
    nonTaxable: 0,
    other: 0,
    lifetime: false,
    checks: {}
  };

  var MAX_MONEY = S.LIMITS.money.max;
  var MAX_INCOME = S.LIMITS.income.max;

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    if (raw.incomeType === 'income' || raw.incomeType === 'salary') state.incomeType = raw.incomeType;

    [
      ['income', 'income', MAX_INCOME],
      ['pension', 'pension', MAX_MONEY],
      ['irp', 'irp', MAX_MONEY],
      ['isa', 'isa', MAX_MONEY],
      ['taxBefore', 'taxBefore', S.LIMITS.taxBefore.max],
      ['budget', 'budget', MAX_MONEY],
      ['balance', 'balance', S.LIMITS.balance.max],
      ['withdraw', 'withdraw', MAX_MONEY],
      ['nonTaxable', 'nonTaxable', MAX_MONEY],
      ['other', 'other', MAX_MONEY]
    ].forEach(function (k) {
      var v = parseFloat(raw[k[0]]);
      if (isFinite(v) && v >= 0) state[k[1]] = clamp(v, 0, k[2]);
    });

    ['feePension', 'feeIrp'].forEach(function (k) {
      var v = parseFloat(raw[k]);
      if (isFinite(v) && v >= 0) state[k] = clamp(v, 0, 3);
    });

    if (isFinite(parseFloat(raw.years))) state.years = clamp(Math.round(parseFloat(raw.years)), 1, 40);
    if (isFinite(parseFloat(raw.year))) state.year = clamp(Math.round(parseFloat(raw.year)), 1, 60);
    if (isFinite(parseFloat(raw.age))) state.age = clamp(Math.round(parseFloat(raw.age)), 55, 120);
    if (typeof raw.lifetime === 'boolean') state.lifetime = raw.lifetime;
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
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
    }, 180);
  }

  /* ── 엘리먼트 ─────────────────────────────────────────── */
  var el = {};
  function cacheEls() {
    el.tabCredit = $('#tabCredit');
    el.tabCombo = $('#tabCombo');
    el.tabPension = $('#tabPension');
    el.tabCheck = $('#tabCheck');
    el.panelCredit = $('#panelCredit');
    el.panelCombo = $('#panelCombo');
    el.panelPension = $('#panelPension');
    el.panelCheck = $('#panelCheck');

    el.incTypeGroup = $('#incTypeGroup');
    el.incTypeSalary = $('#incTypeSalary');
    el.incTypeIncome = $('#incTypeIncome');
    el.crIncome = $('#crIncome');
    el.crIncomeLabel = $('#crIncomeLabel');
    el.crIncomeBadge = $('#crIncomeBadge');
    el.crPension = $('#crPension');
    el.crPensionBadge = $('#crPensionBadge');
    el.crIrp = $('#crIrp');
    el.crIrpBadge = $('#crIrpBadge');
    el.crIsa = $('#crIsa');
    el.crIsaBadge = $('#crIsaBadge');
    el.crTaxBefore = $('#crTaxBefore');
    el.crTaxBeforeBadge = $('#crTaxBeforeBadge');
    el.crTotal = $('#crTotal');
    el.crSub = $('#crSub');
    el.crVerdict = $('#crVerdict');
    el.crRows = $('#crRows');
    el.crTarget = $('#crTarget');
    el.crCredit = $('#crCredit');
    el.crRoom = $('#crRoom');
    el.crPaid = $('#crPaid');
    el.crNext = $('#crNext');
    el.crNextBox = $('#crNextBox');
    el.crInsight = $('#crInsight');
    el.crTable = $('#crTable');
    el.shareCredit = $('#shareCredit');

    el.cbIncomeReadout = $('#cbIncomeReadout');
    el.cbIncomeText = $('#cbIncomeText');
    el.cbRateText = $('#cbRateText');
    el.cbBudget = $('#cbBudget');
    el.cbBudgetBadge = $('#cbBudgetBadge');
    el.cbFeePension = $('#cbFeePension');
    el.cbFeeIrp = $('#cbFeeIrp');
    el.cbYears = $('#cbYears');
    el.cbYearsBadge = $('#cbYearsBadge');
    el.cbTotal = $('#cbTotal');
    el.cbSub = $('#cbSub');
    el.cbVerdict = $('#cbVerdict');
    el.cbRows = $('#cbRows');
    el.cbPension = $('#cbPension');
    el.cbIrp = $('#cbIrp');
    el.cbOverflow = $('#cbOverflow');
    el.cbFeeDiff = $('#cbFeeDiff');
    el.cbCompare = $('#cbCompare');
    el.cbInsight = $('#cbInsight');
    el.shareCombo = $('#shareCombo');

    el.pnBalance = $('#pnBalance');
    el.pnBalanceBadge = $('#pnBalanceBadge');
    el.pnYear = $('#pnYear');
    el.pnYearBadge = $('#pnYearBadge');
    el.pnAge = $('#pnAge');
    el.pnAgeBadge = $('#pnAgeBadge');
    el.pnWithdraw = $('#pnWithdraw');
    el.pnWithdrawBadge = $('#pnWithdrawBadge');
    el.pnNonTaxable = $('#pnNonTaxable');
    el.pnNonTaxableBadge = $('#pnNonTaxableBadge');
    el.pnOther = $('#pnOther');
    el.pnOtherBadge = $('#pnOtherBadge');
    el.pnLifetime = $('#pnLifetime');
    el.pnTotal = $('#pnTotal');
    el.pnSub = $('#pnSub');
    el.pnVerdict = $('#pnVerdict');
    el.pnRows = $('#pnRows');
    el.pnLimit = $('#pnLimit');
    el.pnTaxable = $('#pnTaxable');
    el.pnTaxWithin = $('#pnTaxWithin');
    el.pnEarlyDiff = $('#pnEarlyDiff');
    el.pnEarlyText = $('#pnEarlyText');
    el.pnEarlyBox = $('#pnEarlyBox');
    el.pnCompareBox = $('#pnCompareBox');
    el.pnCompareText = $('#pnCompareText');
    el.pnCompareRows = $('#pnCompareRows');
    el.pnInsight = $('#pnInsight');
    el.pnTable = $('#pnTable');
    el.sharePension = $('#sharePension');

    el.ddayValue = $('#ddayValue');
    el.ddayNote = $('#ddayNote');
    el.checkBar = $('#checkBar');
    el.checkCount = $('#checkCount');
    el.checkList = $('#checkList');

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
    if (TABS.indexOf(name) < 0) name = 'credit';
    state.tab = name;
    var map = {
      credit: [el.tabCredit, el.panelCredit],
      combo: [el.tabCombo, el.panelCombo],
      pension: [el.tabPension, el.panelPension],
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
    el.tabCredit.addEventListener('click', function () { setTab('credit'); });
    el.tabCombo.addEventListener('click', function () { setTab('combo'); });
    el.tabPension.addEventListener('click', function () { setTab('pension'); });
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
    $$('[data-goto]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        setTab(link.getAttribute('data-goto'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    var hash = (location.hash || '').replace('#', '');
    setTab(TABS.indexOf(hash) >= 0 ? hash : (state.tab || 'credit'));
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

  function setBadgeTier(node, tier) {
    node.setAttribute('data-tier', String(tier));
  }

  /* ── 탭 1: 세액공제 ─────────────────────────────────── */
  function creditInput() {
    return {
      incomeType: state.incomeType,
      income: state.income,
      pension: state.pension,
      irp: state.irp,
      isa: state.isa,
      taxBefore: state.taxBefore
    };
  }

  function syncCreditForm() {
    if (document.activeElement !== el.crIncome) el.crIncome.value = String(Math.round(state.income));
    if (document.activeElement !== el.crPension) el.crPension.value = String(Math.round(state.pension));
    if (document.activeElement !== el.crIrp) el.crIrp.value = String(Math.round(state.irp));
    if (document.activeElement !== el.crIsa) el.crIsa.value = String(Math.round(state.isa));
    if (document.activeElement !== el.crTaxBefore) el.crTaxBefore.value = String(Math.round(state.taxBefore));

    var isIncome = state.incomeType === 'income';
    el.crIncomeLabel.textContent = isIncome ? '종합소득금액' : '총급여';
    el.crIncomeBadge.textContent = state.income > 0 ? wonShort(state.income) : '없음';
    el.crPensionBadge.textContent = state.pension > 0 ? wonShort(state.pension) : '없음';
    el.crIrpBadge.textContent = state.irp > 0 ? wonShort(state.irp) : '없음';
    el.crIsaBadge.textContent = state.isa > 0 ? wonShort(state.isa) : '없음';
    el.crTaxBeforeBadge.textContent = state.taxBefore > 0 ? wonShort(state.taxBefore) : '모름';

    [el.incTypeSalary, el.incTypeIncome].forEach(function (btn) {
      var on = btn.getAttribute('data-inc-type') === state.incomeType;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.setAttribute('tabindex', on ? '0' : '-1');
    });

    syncChips('cr-income', state.income);
    syncChips('cr-pension', state.pension);
    syncChips('cr-irp', state.irp);
    syncChips('cr-isa', state.isa);
  }

  function renderCredit() {
    var r = S.credit(creditInput());
    var incomeLabel = r.incomeType === 'income' ? '종합소득금액' : '총급여';

    el.crTotal.textContent = won(r.applied);
    el.crSub.textContent = incomeLabel + ' ' + wonShort(r.income) + ' · 공제율 ' + percent(r.ratePct, 1) +
      ' · 공제대상 ' + wonShort(r.target) + ' · 총 납입 ' + wonShort(r.paidTotal);

    if (!r.valid) {
      el.crVerdict.textContent = '소득 입력';
      setBadgeTier(el.crVerdict, 2);
    } else if (r.capped) {
      el.crVerdict.textContent = '결정세액 한도';
      setBadgeTier(el.crVerdict, 3);
    } else if (r.target >= 12000000) {
      el.crVerdict.textContent = '한도 100%';
      setBadgeTier(el.crVerdict, 1);
    } else if (r.high) {
      el.crVerdict.textContent = '16.5% 구간';
      setBadgeTier(el.crVerdict, 1);
    } else {
      el.crVerdict.textContent = '13.2% 구간';
      setBadgeTier(el.crVerdict, 2);
    }

    var rows = '';
    rows += row(incomeLabel, won(r.income) + '원', r.thresholdLabel + ' 기준');
    rows += row('적용 공제율', percent(r.ratePct, 1), r.high ? '기준 이하 · 지방세 포함' : '기준 초과 · 지방세 포함');
    rows += row('연금저축 인정', won(r.pensionUsed) + '원', '납입 ' + won(r.pension) + '원 · 600만원 한도');
    rows += row('IRP·DC 인정', won(r.irpUsed) + '원', '납입 ' + won(r.irp) + '원');
    if (r.isaUsed > 0) rows += row('ISA 전환(기본 한도)', won(r.isaUsed) + '원', '전환 ' + won(r.isa) + '원');
    rows += row('기본 공제대상', won(r.baseTotal) + '원', '900만원 한도');
    if (r.isaExtra > 0) rows += row('ISA 추가 한도', won(r.isaExtra) + '원', '전환금액의 10% · 최대 300만원');
    rows += row('공제대상 합계', won(r.target) + '원', '소득세 ' + percent(r.incomeRate * 100, 0) + ' + 지방소득세 10%', 'total');
    rows += row('소득세 감소', '-' + won(r.incomeTax) + '원', '공제대상 × ' + percent(r.incomeRate * 100, 0));
    rows += row('지방소득세 감소', '-' + won(r.localTax) + '원', '소득세의 10%');
    rows += row('세액공제 합계', won(r.credit) + '원', '지방소득세 포함', 'total');
    if (r.capped) {
      rows += row('적용 가능액', won(r.applied) + '원', '공제 전 결정세액 ' + won(r.taxBefore) + '원 한도', 'total');
    }
    el.crRows.innerHTML = rows;

    el.crTarget.textContent = won(r.target) + '원';
    el.crCredit.textContent = won(r.credit) + '원';
    el.crRoom.textContent = r.combinedRoom > 0 ? won(r.combinedRoom) + '원' : '한도 충족';
    el.crPaid.textContent = won(r.paidTotal) + '원';

    if (r.combinedRoom > 0) {
      el.crNextBox.hidden = false;
      el.crNext.innerHTML = 'IRP에 <strong>' + won(r.combinedRoom) + '원</strong>을 더 넣으면 세액공제가 <strong>' +
        won(r.extraCreditIfFilled) + '원</strong> 늘어납니다. 연금저축은 이미 ' +
        (r.pensionRoom > 0 ? won(r.pensionRoom) + '원 남았지만 IRP로 채우는 편이 한도가 큽니다.' : '600만원 한도를 채웠습니다.');
    } else if (r.isaRoom > 0 && r.isa > 0) {
      el.crNextBox.hidden = false;
      el.crNext.innerHTML = 'ISA를 <strong>3,000만원</strong>까지 더 옮기면 추가 한도가 <strong>' + won(r.isaRoom) +
        '원</strong> 남아 있습니다. 만기 후 60일이 지나면 추가 한도는 사라집니다.';
    } else if (r.capped) {
      el.crNextBox.hidden = false;
      el.crNext.innerHTML = '공제 전 결정세액이 <strong>' + won(r.taxBefore) + '원</strong>이라 세액공제가 그만큼만 적용됩니다. 공제받지 못한 납입액은 금융기관에 납입연도 전환을 신청해 다음 해로 돌릴 수 있습니다.';
    } else {
      el.crNextBox.hidden = false;
      el.crNext.innerHTML = '올해 공제 한도를 모두 채웠습니다. 900만원을 넘겨 더 넣어도 세액공제는 늘지 않지만, 과세이연 효과는 그대로 남습니다.';
    }

    var lines = [];
    if (r.valid) {
      if (Math.abs(r.target - r.paidTotal) < 1) {
        lines.push('납입한 <strong>' + won(r.paidTotal) + '원</strong> 전액이 공제 대상이 되어 세금 <strong>' + won(r.credit) + '원</strong>이 줄어듭니다.');
      } else {
        lines.push('납입·전환 <strong>' + won(r.paidTotal) + '원</strong> 중 <strong>' + won(r.target) +
          '원</strong>이 공제 대상이 되어 세금 <strong>' + won(r.credit) + '원</strong>이 줄어듭니다.');
      }
      if (r.applied < r.credit) {
        lines.push('다만 결정세액 한도 때문에 실제 적용은 ' + won(r.applied) + '원입니다.');
      }
      lines.push('이 금액은 연말정산에서 ' + (r.high ? '16.5%' : '13.2%') + '로 돌려받는 최대치이고, 실제 환급액은 기납부세액에 따라 달라집니다.');
      if (r.combinedRoom > 0) {
        lines.push('12월 31일 전에 IRP로 ' + won(r.combinedRoom) + '원을 채우면 ' + won(r.extraCreditIfFilled) + '원을 더 받습니다.');
      }
    } else {
      lines.push('소득을 입력하면 예상 세액공제가 계산됩니다. 소득이 없어도 납입은 가능하지만, 그해 공제 효과는 없습니다.');
    }
    r.notes.forEach(function (n) { lines.push(n); });
    setInsight(el.crInsight, lines.join(' '), r.capped ? 'is-warn' : (r.target > 0 ? 'is-ok' : ''));

    var steps = S.creditSteps({ incomeType: r.incomeType, income: r.income });
    el.crTable.tBodies[0].innerHTML = steps.map(function (t) {
      var now = Math.abs(t.target - r.target) < 1;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + t.label + '</th>' +
        '<td>' + won(t.target) + '</td>' +
        '<td>' + won(t.credit) + '</td></tr>';
    }).join('');
  }

  function creditShareText() {
    var r = S.credit(creditInput());
    var lines = [
      '2026 연금저축·IRP 세액공제 모의 계산',
      '· ' + (r.incomeType === 'income' ? '종합소득금액' : '총급여') + ' ' + won(r.income) + '원 (공제율 ' + percent(r.ratePct, 1) + ')',
      '· 연금저축 ' + won(r.pension) + '원 + IRP ' + won(r.irp) + '원' + (r.isa > 0 ? ' + ISA 전환 ' + won(r.isa) + '원' : ''),
      '· 공제대상 ' + won(r.target) + '원 → 세액공제 ' + won(r.credit) + '원',
      '· 실제 적용 ' + won(r.applied) + '원' + (r.combinedRoom > 0 ? ' (한도 ' + won(r.combinedRoom) + '원 남음)' : '')
    ];
    var url = shareUrl();
    if (url) lines.push('', '연금저축·IRP 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 2: 연금저축 vs IRP ─────────────────────────── */
  function comboInput() {
    return {
      incomeType: state.incomeType,
      income: state.income,
      budget: state.budget,
      feePension: state.feePension,
      feeIrp: state.feeIrp,
      years: state.years
    };
  }

  function syncComboForm() {
    if (document.activeElement !== el.cbBudget) el.cbBudget.value = String(Math.round(state.budget));
    if (document.activeElement !== el.cbFeePension) el.cbFeePension.value = String(state.feePension);
    if (document.activeElement !== el.cbFeeIrp) el.cbFeeIrp.value = String(state.feeIrp);
    if (document.activeElement !== el.cbYears) el.cbYears.value = String(state.years);
    el.cbBudgetBadge.textContent = state.budget > 0 ? wonShort(state.budget) : '없음';
    el.cbYearsBadge.textContent = state.years + '년';
    el.cbIncomeText.textContent = (state.incomeType === 'income' ? '종합소득금액 ' : '총급여 ') + wonShort(state.income);
    el.cbRateText.textContent = '공제율 ' + percent(S.rateFor(comboInput()).rate * 100, 1);
    syncChips('cb-budget', state.budget);
  }

  function renderCombo() {
    var r = S.combo(comboInput());

    el.cbTotal.textContent = won(r.credit);
    el.cbSub.textContent = '연금저축 ' + wonShort(r.pension) + ' + IRP ' + wonShort(r.irp) +
      ' · 공제대상 ' + wonShort(r.target) + ' · 공제 밖 ' + wonShort(r.overflow);

    if (!r.valid) {
      el.cbVerdict.textContent = '소득 입력';
      setBadgeTier(el.cbVerdict, 2);
    } else if (r.overflow > 0) {
      el.cbVerdict.textContent = '900만 초과';
      setBadgeTier(el.cbVerdict, 2);
    } else if (r.budget >= 9000000) {
      el.cbVerdict.textContent = '한도 100%';
      setBadgeTier(el.cbVerdict, 1);
    } else if (r.budget <= 6000000) {
      el.cbVerdict.textContent = '연금저축 우선';
      setBadgeTier(el.cbVerdict, 1);
    } else {
      el.cbVerdict.textContent = '균형 배분';
      setBadgeTier(el.cbVerdict, 1);
    }

    var rows = '';
    rows += row('소득 구간', (r.incomeType === 'income' ? '종합소득 ' : '총급여 ') + wonShort(r.income),
      '공제율 ' + percent(r.ratePct, 1));
    rows += row('연금저축 배분', won(r.pension) + '원', '전체의 ' + percent(r.pensionShare, 0) + ' · 600만원 한도');
    rows += row('IRP 배분', won(r.irp) + '원', '전체의 ' + percent(r.irpShare, 0) + ' · 900만원까지');
    rows += row('공제대상', won(r.target) + '원', '한도 900만원');
    rows += row('세액공제', won(r.credit) + '원', '지방소득세 포함', 'total');
    if (r.overflow > 0) rows += row('공제 밖 납입', won(r.overflow) + '원', '세액공제 없음 · 과세이연만');
    rows += row('연 수수료율', percent(r.feePension, 2) + ' / ' + percent(r.feeIrp, 2), '연금저축 / IRP');
    rows += row(r.years + '년 수수료', won(r.feeP) + '원 / ' + won(r.feeI) + '원', '납입액 × 수수료율 × 기간');
    rows += row(r.years + '년 뒤 공제−수수료', won(r.creditAfterFee) + '원', '세액공제 − 수수료 합계', 'total');
    el.cbRows.innerHTML = rows;

    el.cbPension.textContent = won(r.pension) + '원';
    el.cbIrp.textContent = won(r.irp) + '원';
    el.cbOverflow.textContent = r.overflow > 0 ? won(r.overflow) + '원' : '없음';
    el.cbFeeDiff.textContent = r.feeDiff === 0 ? '동일' : (r.feeDiff > 0 ? 'IRP +' + won(r.feeDiff) : 'IRP -' + won(-r.feeDiff));

    var best = r.scenarios.reduce(function (a, b) { return b.credit > a.credit ? b : a; }, r.scenarios[0]);
    el.cbCompare.innerHTML = r.scenarios.map(function (s) {
      var isBest = s.credit === best.credit && s.key === 'mix';
      return '<div class="compare-card' + (isBest ? ' is-best' : '') + '">' +
        '<h3>' + s.label + '</h3>' +
        '<p>' + won(s.credit) + '원</p>' +
        '<small>' + (s.pension > 0 ? '연금저축 ' + wonShort(s.pension) : '') +
        (s.pension > 0 && s.irp > 0 ? ' + ' : '') +
        (s.irp > 0 ? 'IRP ' + wonShort(s.irp) : '') + ' · ' + s.note + '</small>' +
        (isBest ? '<span class="pick">권장</span>' : '') + '</div>';
    }).join('');

    var lines = [];
    lines.push('예산 <strong>' + won(r.budget) + '원</strong>이면 연금저축 <strong>' + won(r.pension) +
      '원</strong>, IRP <strong>' + won(r.irp) + '원</strong>이 무난합니다.');
    lines.push('세액공제는 <strong>' + won(r.credit) + '원</strong>' +
      (r.missCredit > 0 ? '으로, 900만원을 다 채우면 ' + won(r.missCredit) + '원 더 받을 수 있습니다.' : '으로 한도를 다 썼습니다.'));
    if (r.overflow > 0) {
      lines.push('900만원을 넘는 ' + won(r.overflow) + '원은 공제가 없지만, 세금이 미뤄지는 과세이연 효과는 있습니다.');
    }
    if (r.years >= 5) {
      lines.push(r.years + '년 수수료 차이는 ' + won(Math.abs(r.feeDiff)) + '원입니다(내가 넣은 수수료율 기준).');
    }
    r.notes.forEach(function (n) { lines.push(n); });
    setInsight(el.cbInsight, lines.join(' '), r.missCredit > 0 ? 'is-warn' : 'is-ok');
  }

  function comboShareText() {
    var r = S.combo(comboInput());
    var lines = [
      '2026 연금저축 vs IRP 배분 모의 계산',
      '· 총급여 ' + won(r.income) + '원 · 연 납입 가능액 ' + won(r.budget) + '원',
      '· 권장: 연금저축 ' + won(r.pension) + '원 + IRP ' + won(r.irp) + '원',
      '· 예상 세액공제 ' + won(r.credit) + '원' + (r.missCredit > 0 ? ' (한도까지 ' + won(r.missCredit) + '원 남음)' : ''),
      '· ' + r.years + '년 수수료 ' + won(r.feeTotal) + '원 (연금저축 ' + percent(r.feePension, 2) + ' / IRP ' + percent(r.feeIrp, 2) + ')'
    ];
    var url = shareUrl();
    if (url) lines.push('', '연금저축·IRP 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 3: 연금 수령 ───────────────────────────────── */
  function pensionInput() {
    return {
      balance: state.balance,
      year: state.year,
      age: state.age,
      withdraw: state.withdraw,
      otherPrivate: state.other,
      nonTaxable: state.nonTaxable,
      lifetime: state.lifetime,
      otherIncome: 0
    };
  }

  function syncPensionForm() {
    if (document.activeElement !== el.pnBalance) el.pnBalance.value = String(Math.round(state.balance));
    if (document.activeElement !== el.pnYear) el.pnYear.value = String(state.year);
    if (document.activeElement !== el.pnAge) el.pnAge.value = String(state.age);
    if (document.activeElement !== el.pnWithdraw) el.pnWithdraw.value = String(Math.round(state.withdraw));
    if (document.activeElement !== el.pnNonTaxable) el.pnNonTaxable.value = String(Math.round(state.nonTaxable));
    if (document.activeElement !== el.pnOther) el.pnOther.value = String(Math.round(state.other));
    el.pnLifetime.checked = state.lifetime;

    el.pnBalanceBadge.textContent = state.balance > 0 ? wonShort(state.balance) : '없음';
    el.pnYearBadge.textContent = state.year + '년차';
    el.pnAgeBadge.textContent = state.age + '세' + (state.lifetime ? ' · 종신' : '');
    el.pnWithdrawBadge.textContent = state.withdraw > 0 ? wonShort(state.withdraw) : '없음';
    el.pnNonTaxableBadge.textContent = state.nonTaxable > 0 ? wonShort(state.nonTaxable) : '없음';
    el.pnOtherBadge.textContent = state.other > 0 ? wonShort(state.other) : '없음';

    syncChips('pn-balance', state.balance);
    syncChips('pn-year', state.year);
    syncChips('pn-age', state.age);
    syncChips('pn-withdraw', state.withdraw);
  }

  function renderPension() {
    var r = S.pension(pensionInput());
    el.pnTotal.textContent = won(r.taxTotal);
    el.pnSub.textContent = '한도 ' + wonShort(r.limit) + ' · ' + percent(r.ageRatePct, 1) +
      ' · 과세대상 ' + wonShort(r.taxableTotal) + ' · 인출 ' + wonShort(r.withdraw);

    if (r.over > 0) {
      el.pnVerdict.textContent = '한도 초과';
      setBadgeTier(el.pnVerdict, 3);
    } else if (r.taxTotal === 0) {
      el.pnVerdict.textContent = '세금 없음';
      setBadgeTier(el.pnVerdict, 1);
    } else if (r.overThreshold) {
      el.pnVerdict.textContent = '1,500만 초과';
      setBadgeTier(el.pnVerdict, 2);
    } else if (r.unlimited) {
      el.pnVerdict.textContent = '한도 없음';
      setBadgeTier(el.pnVerdict, 1);
    } else {
      el.pnVerdict.textContent = '한도 내';
      setBadgeTier(el.pnVerdict, 1);
    }

    var rows = '';
    rows += row('연초 평가액', won(r.balance) + '원', '1월 1일 기준');
    rows += row('연금수령한도', won(r.limit) + '원', r.unlimited ? '11년차부터 한도 없음' : (r.year + '년차 · 평가액의 ' + percent(r.limitRatio * 100, 1)));
    rows += row('한도 내 인출', won(r.within) + '원', '연금수령으로 인정');
    if (r.over > 0) rows += row('한도 초과', won(r.over) + '원', '연금외수령 · 16.5%');
    if (r.nonTaxableUsed > 0) rows += row('공제받지 않은 원금', '-' + won(r.nonTaxableUsed) + '원', '먼저 인출 · 세금 없음');
    rows += row('과세대상', won(r.taxableWithin) + '원', '세액공제분 + 운용수익');
    rows += row('적용 세율', percent(r.ageRatePct, 1), r.ageLabel);
    rows += row('연금소득세', won(r.taxWithin) + '원', '과세대상 × ' + percent(r.ageRatePct, 1));
    if (r.taxOver > 0) rows += row('초과분 기타소득세', won(r.taxOver) + '원', '한도 초과 × 16.5%');
    rows += row('세금 합계', won(r.taxTotal) + '원', '실효 ' + percent(r.effectiveRate, 2), 'total');
    el.pnRows.innerHTML = rows;

    el.pnLimit.textContent = won(r.limit) + '원';
    el.pnTaxable.textContent = won(r.taxableTotal) + '원';
    el.pnTaxWithin.textContent = won(r.taxWithin) + '원';
    el.pnEarlyDiff.textContent = r.withdraw > 0 ? (r.earlyDiff >= 0 ? '+' : '') + won(r.earlyDiff) + '원' : '—';

    if (r.withdraw > 0) {
      el.pnEarlyBox.hidden = false;
      el.pnEarlyText.innerHTML = '같은 <strong>' + won(r.withdraw) + '원</strong>을 중도해지(연금외수령)하면 기타소득세 16.5%인 <strong>' +
        won(r.earlyTax) + '원</strong>입니다. 지금 계획대로면 ' + won(r.taxTotal) + '원이라 <strong>' +
        won(Math.abs(r.earlyDiff)) + '원</strong> ' + (r.earlyDiff >= 0 ? '덜 냅니다' : '더 냅니다') + '.';
    } else {
      el.pnEarlyBox.hidden = true;
    }

    if (r.overThreshold && r.comparison) {
      var c = r.comparison;
      el.pnCompareBox.hidden = false;
      el.pnCompareText.innerHTML = '올해 사적연금 <strong>' + won(c.privateTotal) + '원</strong>으로 1,500만원을 넘었습니다. ' +
        '연금 전액에 대해 16.5% 분리과세와 종합과세 중 고를 수 있습니다.';
      el.pnCompareRows.innerHTML =
        '<div class="compare-pair">' +
        '<div class="compare-card' + (c.better === 'separate' ? ' is-best' : '') + '">' +
        '<h3>16.5% 분리과세</h3><p>' + won(c.separateTax) + '원</p>' +
        '<small>연금 전액 × 16.5% · 추가 납부 ' + won(c.separateExtra) + '원</small>' +
        (c.better === 'separate' ? '<span class="pick">유리</span>' : '') + '</div>' +
        '<div class="compare-card' + (c.better === 'comprehensive' ? ' is-best' : '') + '">' +
        '<h3>종합과세</h3><p>' + won(c.comprehensiveTax) + '원</p>' +
        '<small>연금소득공제 ' + wonShort(c.pensionDeduction) + ' 적용 · 추가 납부 ' + won(c.comprehensiveExtra) + '원</small>' +
        (c.better === 'comprehensive' ? '<span class="pick">유리</span>' : '') + '</div>' +
        '</div>' +
        '<p class="field-help">이미 원천징수된 연금소득세 ' + won(c.withheld) + '원은 빼고 계산했습니다. ' +
        (c.better === 'separate'
          ? '연금 외 소득이 많아 16.5% 분리과세가 ' + won(c.diff) + '원 유리합니다.'
          : '연금 외 소득이 적어 종합과세가 ' + won(c.diff) + '원 유리합니다.') + '</p>';
    } else {
      el.pnCompareBox.hidden = true;
      el.pnCompareRows.innerHTML = '';
    }

    var lines = [];
    if (r.withdraw > 0) {
      lines.push(r.unlimited
        ? '연금수령연차 11년차라 한도 없이 받을 수 있습니다.'
        : '연초 평가액의 ' + percent(r.limitRatio * 100, 1) + '인 <strong>' + won(r.limit) + '원</strong>까지 연금으로 인정됩니다.');
      lines.push('세율은 받는 시점 나이로 정해져 <strong>' + percent(r.ageRatePct, 1) + '</strong>이고, 이번 인출의 세금은 <strong>' +
        won(r.taxTotal) + '원</strong>입니다.');
      if (r.over > 0) lines.push('한도를 넘긴 ' + won(r.over) + '원에는 16.5%가 붙어 세금이 ' + won(r.taxOver) + '원 늘었습니다.');
      if (r.overThreshold) lines.push('1,500만원을 넘어 다음 해 5월에 과세 방식을 골라야 합니다.');
    } else {
      lines.push('인출액을 입력하면 올해 받을 연금의 세금이 계산됩니다.');
    }
    r.notes.forEach(function (n) { lines.push(n); });
    setInsight(el.pnInsight, lines.join(' '), r.over > 0 ? 'is-warn' : 'is-ok');

    var table = S.pensionLimitTable(r.balance);
    el.pnTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = t.year === r.year;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + t.year + '년차' +
        (t.unlimited ? ' 이상' : '') + '</th>' +
        '<td>' + (t.unlimited ? '한도 없음' : percent(t.ratio * 100, 1)) + '</td>' +
        '<td>' + won(t.limit) + '</td></tr>';
    }).join('');
  }

  function pensionShareText() {
    var r = S.pension(pensionInput());
    var lines = [
      '2026 연금수령 세금 모의 계산',
      '· 연초 평가액 ' + won(r.balance) + '원 · ' + r.year + '년차 · ' + r.age + '세' + (r.lifetime ? ' · 종신형' : ''),
      '· 연금수령한도 ' + won(r.limit) + '원 · 인출 ' + won(r.withdraw) + '원',
      '· 연금소득세 ' + won(r.taxWithin) + '원' + (r.taxOver > 0 ? ' + 한도 초과세 ' + won(r.taxOver) + '원' : ''),
      '· 세금 합계 ' + won(r.taxTotal) + '원 (실효 ' + percent(r.effectiveRate, 2) + ')'
    ];
    if (r.comparison) {
      lines.push('· 1,500만원 초과: 16.5% ' + won(r.comparison.separateTax) + ' vs 종합과세 ' + won(r.comparison.comprehensiveTax));
    }
    var url = shareUrl();
    if (url) lines.push('', '연금저축·IRP 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 4: 체크리스트 ─────────────────────────────── */
  function checkItems() { return $$('#checkList input[type="checkbox"]'); }

  function syncChecks() {
    var items = checkItems();
    items.forEach(function (input) {
      var key = input.getAttribute('data-check');
      input.checked = !!state.checks[key];
    });
    var done = items.filter(function (i) { return i.checked; }).length;
    var total = items.length || 1;
    el.checkBar.style.width = Math.round((done / total) * 100) + '%';
    el.checkCount.textContent = done + ' / ' + items.length + ' 완료';
  }

  function renderDday() {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var end = new Date(2026, 11, 31);
    var days = Math.round((end - today) / 86400000);
    if (days > 0) {
      el.ddayValue.textContent = 'D-' + days;
      el.ddayValue.classList.remove('is-closed');
      el.ddayNote.textContent = '연금저축·IRP 납입과 ISA 전환을 모두 이 날 안에 마쳐야 2026년 공제 대상입니다.';
    } else if (days === 0) {
      el.ddayValue.textContent = '오늘 마감';
      el.ddayValue.classList.add('is-closed');
      el.ddayNote.textContent = '오늘이 2026년 납입 마지막 날입니다. 이체 마감시간을 꼭 확인하세요.';
    } else {
      el.ddayValue.textContent = '마감 지남';
      el.ddayValue.classList.add('is-closed');
      el.ddayNote.textContent = '2026년 공제는 끝났습니다. 지금 넣는 금액은 2027년 귀속 공제 대상입니다.';
    }
  }

  /* ── 공유 ─────────────────────────────────────────────── */
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
    el.promoHeading.textContent = coupang.heading || '12월 31일 밤, 앱 켜두고 계산할 때';
    el.promoSub.textContent = coupang.subheading || '';
    var disclosure = coupang.disclosure || '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
    el.promoDisclosure.textContent = disclosure;
    el.footerDisclosure.textContent = disclosure;
    el.footerDisclosure.hidden = false;
    el.promoList.innerHTML = items.map(function (it) {
      return '<div class="promo-item">' +
        '<span class="promo-thumb" aria-hidden="true">' + (it.emoji || '💰') + '</span>' +
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
  function bindIncomeType() {
    [el.incTypeSalary, el.incTypeIncome].forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.incomeType = btn.getAttribute('data-inc-type') === 'income' ? 'income' : 'salary';
        refresh();
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        state.incomeType = state.incomeType === 'salary' ? 'income' : 'salary';
        refresh();
        (state.incomeType === 'income' ? el.incTypeIncome : el.incTypeSalary).focus();
      });
    });
  }

  function bindCreditEvents() {
    [['crIncome', 'income', 0, MAX_INCOME, 'cr-income'],
     ['crPension', 'pension', 0, MAX_MONEY, 'cr-pension'],
     ['crIrp', 'irp', 0, MAX_MONEY, 'cr-irp'],
     ['crIsa', 'isa', 0, MAX_MONEY, 'cr-isa'],
     ['crTaxBefore', 'taxBefore', 0, S.LIMITS.taxBefore.max, '']].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        state[cfg[1]] = readNum(el[cfg[0]], 0, cfg[2], cfg[3]);
        if (cfg[4]) syncChips(cfg[4], state[cfg[1]]);
        refresh();
      });
    });
    [['cr-income', 'income', 'crIncome', function (v) { return v; }],
     ['cr-pension', 'pension', 'crPension', function (v) { return v; }],
     ['cr-irp', 'irp', 'crIrp', function (v) { return v; }],
     ['cr-isa', 'isa', 'crIsa', function (v) { return v; }]].forEach(function (cfg) {
      $$('.chips [data-' + cfg[0] + ']').forEach(function (b) {
        b.addEventListener('click', function () {
          state[cfg[1]] = Number(b.getAttribute('data-' + cfg[0]));
          el[cfg[2]].value = String(state[cfg[1]]);
          syncChips(cfg[0], state[cfg[1]]);
          refresh();
        });
      });
    });
    el.shareCredit.addEventListener('click', function () { doShare(creditShareText()); });
  }

  function bindComboEvents() {
    [['cbBudget', 'budget', 0, MAX_MONEY, 'cb-budget'],
     ['cbFeePension', 'feePension', 0, 3, ''],
     ['cbFeeIrp', 'feeIrp', 0, 3, ''],
     ['cbYears', 'years', 1, 40, '']].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        var v = readNum(el[cfg[0]], cfg[0] === 'cbYears' ? 10 : 0, cfg[2], cfg[3]);
        if (cfg[0] === 'cbYears') v = Math.round(v);
        state[cfg[1]] = v;
        if (cfg[4]) syncChips(cfg[4], state[cfg[1]]);
        refresh();
      });
    });
    $$('.chips [data-cb-budget]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.budget = Number(b.getAttribute('data-cb-budget'));
        el.cbBudget.value = String(state.budget);
        syncChips('cb-budget', state.budget);
        refresh();
      });
    });
    el.shareCombo.addEventListener('click', function () { doShare(comboShareText()); });
  }

  function bindPensionEvents() {
    [['pnBalance', 'balance', 0, S.LIMITS.balance.max, 'pn-balance'],
     ['pnYear', 'year', 1, 60, 'pn-year'],
     ['pnAge', 'age', 55, 120, 'pn-age'],
     ['pnWithdraw', 'withdraw', 0, MAX_MONEY, 'pn-withdraw'],
     ['pnNonTaxable', 'nonTaxable', 0, MAX_MONEY, ''],
     ['pnOther', 'other', 0, MAX_MONEY, '']].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        var v = readNum(el[cfg[0]], cfg[0] === 'pnYear' || cfg[0] === 'pnAge' ? 1 : 0, cfg[2], cfg[3]);
        if (cfg[0] === 'pnYear' || cfg[0] === 'pnAge') v = Math.round(v);
        state[cfg[1]] = v;
        if (cfg[4]) syncChips(cfg[4], state[cfg[1]]);
        refresh();
      });
    });
    [['pn-balance', 'balance', 'pnBalance'],
     ['pn-year', 'year', 'pnYear'],
     ['pn-age', 'age', 'pnAge'],
     ['pn-withdraw', 'withdraw', 'pnWithdraw']].forEach(function (cfg) {
      $$('.chips [data-' + cfg[0] + ']').forEach(function (b) {
        b.addEventListener('click', function () {
          state[cfg[1]] = Number(b.getAttribute('data-' + cfg[0]));
          el[cfg[2]].value = String(state[cfg[1]]);
          syncChips(cfg[0], state[cfg[1]]);
          refresh();
        });
      });
    });
    el.pnLifetime.addEventListener('change', function () {
      state.lifetime = el.pnLifetime.checked;
      refresh();
    });
    el.sharePension.addEventListener('click', function () { doShare(pensionShareText()); });
  }

  function bindCheckEvents() {
    checkItems().forEach(function (input) {
      input.addEventListener('change', function () {
        var key = input.getAttribute('data-check');
        if (input.checked) state.checks[key] = true;
        else delete state.checks[key];
        syncChecks();
        persist();
      });
    });
  }

  function refresh() {
    syncCreditForm();
    syncComboForm();
    syncPensionForm();
    renderCredit();
    renderCombo();
    renderPension();
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

    bindIncomeType();
    bindCreditEvents();
    bindComboEvents();
    bindPensionEvents();
    bindCheckEvents();
    initTabs();
    initTheme();
    initAds();
    initPromo();
    initInstall();
    initSW();
    renderDday();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
