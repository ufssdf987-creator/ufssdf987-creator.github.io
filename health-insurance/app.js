/*!
 * app.js — 2026 건강보험료 · 피부양자 자격 · 임의계속가입 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var H = window.HealthCalc;
  var CFG = window.APP_CONFIG || {};
  if (!H) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'hln.state.v1';
  var THEME_KEY = 'hln.theme';

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
      return sign + eok + '억 ' +
        (man >= 10000 ? nf.format(Math.round(man / 10000)) + '억 ' + nf.format(man % 10000) + '만원'
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
    tab: 'cost',
    cost: {
      salary: 3500000,
      extra: 0,
      income: 42000000,
      type: 'earned',
      property: 300000000
    },
    dep: {
      relation: 'parent',
      income: 12000000,
      business: 0,
      registered: false,
      rental: false,
      siblingOk: true,
      property: 300000000,
      married: false
    },
    retire: {
      salary: 4000000,
      income: 48000000,
      type: 'earned',
      property: 300000000,
      history: true
    }
  };

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    var c = raw.cost;
    if (c && typeof c === 'object') {
      ['salary', 'extra', 'income', 'property'].forEach(function (k) {
        var v = parseFloat(c[k]);
        if (isFinite(v) && v >= 0) state.cost[k] = v;
      });
      if (c.type === 'earned' || c.type === 'business') state.cost.type = c.type;
    }

    var d = raw.dep;
    if (d && typeof d === 'object') {
      if (H.RELATION_LABEL[d.relation]) state.dep.relation = d.relation;
      ['income', 'business', 'property'].forEach(function (k) {
        var v = parseFloat(d[k]);
        if (isFinite(v) && v >= 0) state.dep[k] = v;
      });
      ['registered', 'rental', 'siblingOk', 'married'].forEach(function (k) {
        if (typeof d[k] === 'boolean') state.dep[k] = d[k];
      });
    }

    var r = raw.retire;
    if (r && typeof r === 'object') {
      ['salary', 'income', 'property'].forEach(function (k) {
        var v = parseFloat(r[k]);
        if (isFinite(v) && v >= 0) state.retire[k] = v;
      });
      if (r.type === 'earned' || r.type === 'business') state.retire.type = r.type;
      if (typeof r.history === 'boolean') state.retire.history = r.history;
    }

    if (raw.tab === 'cost' || raw.tab === 'dependent' || raw.tab === 'retire') state.tab = raw.tab;
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
    el.tabCost = $('#tabCost');
    el.tabDependent = $('#tabDependent');
    el.tabRetire = $('#tabRetire');
    el.panelCost = $('#panelCost');
    el.panelDependent = $('#panelDependent');
    el.panelRetire = $('#panelRetire');

    el.csSalary = $('#csSalary');
    el.csSalaryBadge = $('#csSalaryBadge');
    el.csExtra = $('#csExtra');
    el.csIncome = $('#csIncome');
    el.csIncomeBadge = $('#csIncomeBadge');
    el.csProperty = $('#csProperty');
    el.csPropertyBadge = $('#csPropertyBadge');
    el.csDiffLabel = $('#csDiffLabel');
    el.csDiff = $('#csDiff');
    el.csDiffUnit = $('#csDiffUnit');
    el.csSub = $('#csSub');
    el.csWinner = $('#csWinner');
    el.csRows = $('#csRows');
    el.csEmpTotal = $('#csEmpTotal');
    el.csEmpBoth = $('#csEmpBoth');
    el.csRegHealth = $('#csRegHealth');
    el.csRegLtc = $('#csRegLtc');
    el.csInsight = $('#csInsight');
    el.csTable = $('#csTable');
    el.shareCost = $('#shareCost');

    el.dpIncome = $('#dpIncome');
    el.dpIncomeBadge = $('#dpIncomeBadge');
    el.dpBusiness = $('#dpBusiness');
    el.dpRegistered = $('#dpRegistered');
    el.dpRental = $('#dpRental');
    el.dpSiblingField = $('#dpSiblingField');
    el.dpSiblingOk = $('#dpSiblingOk');
    el.dpProperty = $('#dpProperty');
    el.dpPropertyBadge = $('#dpPropertyBadge');
    el.dpMarried = $('#dpMarried');
    el.dpResultLabel = $('#dpResultLabel');
    el.dpVerdict = $('#dpVerdict');
    el.dpSub = $('#dpSub');
    el.dpBadge = $('#dpBadge');
    el.dpChecks = $('#dpChecks');
    el.dpRoom = $('#dpRoom');
    el.dpBand = $('#dpBand');
    el.dpAlt = $('#dpAlt');
    el.dpZero = $('#dpZero');
    el.dpInsight = $('#dpInsight');
    el.shareDependent = $('#shareDependent');

    el.rtSalary = $('#rtSalary');
    el.rtIncome = $('#rtIncome');
    el.rtIncomeBadge = $('#rtIncomeBadge');
    el.rtProperty = $('#rtProperty');
    el.rtPropertyBadge = $('#rtPropertyBadge');
    el.rtHistory = $('#rtHistory');
    el.rtDiffLabel = $('#rtDiffLabel');
    el.rtDiff = $('#rtDiff');
    el.rtDiffUnit = $('#rtDiffUnit');
    el.rtSub = $('#rtSub');
    el.rtWinner = $('#rtWinner');
    el.rtRows = $('#rtRows');
    el.rtCont = $('#rtCont');
    el.rtReg = $('#rtReg');
    el.rtSave36 = $('#rtSave36');
    el.rtMonths = $('#rtMonths');
    el.rtInsight = $('#rtInsight');
    el.shareRetire = $('#shareRetire');

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
  var TABS = ['cost', 'dependent', 'retire'];
  function setTab(tab, focus) {
    state.tab = TABS.indexOf(tab) >= 0 ? tab : 'cost';
    var map = {
      cost: [el.tabCost, el.panelCost],
      dependent: [el.tabDependent, el.panelDependent],
      retire: [el.tabRetire, el.panelRetire]
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
    el.tabCost.addEventListener('click', function () { setTab('cost'); });
    el.tabDependent.addEventListener('click', function () { setTab('dependent'); });
    el.tabRetire.addEventListener('click', function () { setTab('retire'); });
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
    setTab(TABS.indexOf(hash) >= 0 ? hash : 'cost');
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

  /* ── 탭 1: 보험료 비교 ───────────────────────────────── */
  function syncCostForm() {
    var c = state.cost;
    el.csSalary.value = String(Math.round(c.salary));
    el.csExtra.value = String(Math.round(c.extra));
    el.csIncome.value = String(Math.round(c.income));
    el.csProperty.value = String(Math.round(c.property));
    syncSegments('cstype', c.type);
    syncChips('cs-salary', c.salary);
    syncChips('cs-income', c.income);
    syncChips('cs-property', c.property);
  }

  function renderCost() {
    var c = state.cost;
    var r = H.compare({
      salary: c.salary,
      extraIncome: c.extra,
      annualIncome: c.income,
      incomeType: c.type,
      property: c.property
    });
    var emp = r.employee;
    var reg = r.regional;
    var diff = r.diff;

    /* 입력 배지 */
    el.csSalaryBadge.textContent = '직장 본인 ' + won(emp.health) + '원';
    el.csIncomeBadge.textContent = '소득월액 ' + wonShort(reg.incomeMonthly);
    el.csPropertyBadge.textContent = reg.propertyGrade
      ? reg.propertyGrade + '등급 · ' + nf.format(reg.propertyScore) + '점'
      : '재산분 없음';

    /* 결과 */
    if (r.cheaper === 'employee') {
      el.csDiffLabel.textContent = '직장가입자가 월 덜 내는 금액';
      el.csWinner.textContent = '직장 유리';
      el.csWinner.setAttribute('data-tier', '1');
    } else if (r.cheaper === 'regional') {
      el.csDiffLabel.textContent = '지역가입자가 월 덜 내는 금액';
      el.csWinner.textContent = '지역 유리';
      el.csWinner.setAttribute('data-tier', '2');
    } else {
      el.csDiffLabel.textContent = '두 쪽 부담 차이';
      el.csWinner.textContent = '비슷함';
      el.csWinner.setAttribute('data-tier', '2');
    }
    el.csDiff.textContent = won(Math.abs(diff));
    el.csDiffUnit.textContent = '원 / 월';
    el.csSub.textContent = '보수월액 ' + wonShort(c.salary) + ' · 지역 소득 ' + wonShort(c.income) +
      ' · 재산 ' + wonShort(c.property);

    /* 상세 */
    var rows = '';
    rows += row('직장 건강보험료', won(emp.health) + '원', '보수월액 × 7.19% × 50%');
    rows += row('직장 장기요양보험료', won(emp.ltc) + '원', '건강보험료 × 13.14%');
    if (emp.extraHealth > 0) {
      rows += row('보수 외 소득 보험료', won(emp.extraHealth + emp.extraLtc) + '원', '2,000만원 초과분 · 본인 전액');
    }
    rows += row('직장 본인부담 합계', won(emp.total) + '원', '월급에서 빠지는 금액', 'total');
    rows += row('지역 소득분', won(reg.incomePremium) + '원', '소득월액 ' + won(reg.incomeMonthly) + '원 × 7.19%');
    rows += row('지역 재산분', won(reg.propertyPremium) + '원',
      reg.propertyGrade ? reg.propertyGrade + '등급 ' + nf.format(reg.propertyScore) + '점 × 211.5원' : '공제 1억원 이하');
    rows += row('지역 장기요양보험료', won(reg.ltc) + '원', '건강보험료 × 13.14%');
    rows += row('지역 합계', won(reg.total) + '원', '전액 본인 부담', 'total');
    el.csRows.innerHTML = rows;

    el.csEmpTotal.textContent = won(emp.total) + '원';
    el.csEmpBoth.textContent = won(emp.both) + '원';
    el.csRegHealth.textContent = won(reg.health) + '원';
    el.csRegLtc.textContent = won(reg.ltc) + '원';

    /* 해설 */
    var lines = [];
    if (r.cheaper === 'employee') {
      lines.push('직장가입자는 회사가 절반을 내 <strong>' + won(emp.total) + '원</strong>, 지역가입자는 전액 본인이 내 <strong>' +
        won(reg.total) + '원</strong>입니다. 월 <strong>' + won(diff) + '원</strong>, 1년이면 <strong>' +
        won(Math.abs(r.annualDiff)) + '원</strong> 차이입니다.');
    } else if (r.cheaper === 'regional') {
      lines.push('이 조건에서는 지역가입자가 <strong>' + won(-diff) + '원</strong> 더 적습니다. 소득이 적고 재산분이 낮으면 지역가입자가 유리할 수 있습니다.');
    } else {
      lines.push('두 쪽 부담이 사실상 같습니다.');
    }
    if (emp.both && Math.abs(emp.both - reg.total) <= emp.both * 0.03) {
      lines.push('사업주 몫까지 합친 ' + won(emp.both) + '원과 지역 보험료가 비슷합니다. 지역가입자는 회사 몫까지 본인이 내는 셈입니다.');
    }
    if (reg.incomeFloored) {
      lines.push('지역 소득분은 소득월액 28만원 이하라 하한 보험료 20,160원으로 계산했습니다.');
    }
    if (reg.capped) {
      lines.push('지역 보험료는 월 상한 4,591,740원을 넘지 않습니다.');
    }
    el.csInsight.innerHTML = lines.join(' ');

    /* 재산 구간 표 */
    var table = H.propertyTable(c.income, c.type);
    el.csTable.tBodies[0].innerHTML = table.map(function (t, i) {
      var isNow = i > 0 && c.property >= t.property && (i === table.length - 1 || c.property < table[i + 1].property);
      return '<tr' + (isNow ? ' class="is-now"' : '') + '><th scope="row">' + (t.property === 0 ? '없음' : wonShort(t.property)) + '</th>' +
        '<td>' + (t.grade ? t.grade + '등급' : '—') + '</td>' +
        '<td>' + won(t.propertyPremium) + '원</td>' +
        '<td>' + won(t.total) + '원</td></tr>';
    }).join('');
  }

  function costShareText() {
    var c = state.cost;
    var r = H.compare({
      salary: c.salary, extraIncome: c.extra, annualIncome: c.income, incomeType: c.type, property: c.property
    });
    var lines = [
      '2026 건강보험료 비교 (모의 계산)',
      '· 보수월액 ' + wonShort(c.salary) + ' · 지역 소득 ' + wonShort(c.income) + ' · 재산 ' + wonShort(c.property),
      '· 직장 본인부담 ' + won(r.employee.total) + '원 (사업주 포함 ' + won(r.employee.both) + '원)',
      '· 지역가입자 ' + won(r.regional.total) + '원',
      '· 차이 ' + won(Math.abs(r.diff)) + '원 / 월 · 연 ' + won(Math.abs(r.annualDiff)) + '원'
    ];
    var url = shareUrl();
    if (url) lines.push('', '건강보험료·피부양자 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 2: 피부양자 판정 ─────────────────────────────── */
  function syncDepForm() {
    var d = state.dep;
    el.dpIncome.value = String(Math.round(d.income));
    el.dpBusiness.value = String(Math.round(d.business));
    el.dpProperty.value = String(Math.round(d.property));
    el.dpRegistered.checked = !!d.registered;
    el.dpRental.checked = !!d.rental;
    el.dpSiblingOk.checked = d.siblingOk !== false;
    el.dpMarried.checked = !!d.married;
    el.dpSiblingField.hidden = d.relation !== 'sibling';
    syncSegments('relation', d.relation);
    syncChips('dp-income', d.income);
    syncChips('dp-property', d.property);
  }

  function depInput() {
    var d = state.dep;
    return {
      relation: d.relation,
      income: d.income,
      businessIncome: d.business,
      registered: d.registered,
      rental: d.rental,
      siblingOk: d.siblingOk,
      property: d.property,
      married: d.married
    };
  }

  function mark(pass) {
    return pass ? '<span class="mark-ok">✓</span>' : '<span class="mark-no">✕</span>';
  }

  function renderDep() {
    var d = state.dep;
    var r = H.dependent(depInput());

    el.dpIncomeBadge.textContent = r.incomeRoom >= 0
      ? '한도까지 ' + wonShort(r.incomeRoom)
      : '한도 초과 ' + wonShort(-r.incomeRoom);
    el.dpPropertyBadge.textContent = r.propertyBand;

    el.dpVerdict.textContent = r.eligible ? '피부양자 가능' : '피부양자 불가';
    el.dpBadge.textContent = r.eligible ? '요건 충족' : r.failCount + '개 요건 미달';
    el.dpBadge.setAttribute('data-tier', r.eligible ? '1' : '3');
    el.dpSub.textContent = r.relationLabel + ' · 연 소득 ' + wonShort(r.income) + ' · 재산 ' + wonShort(r.property) +
      (r.businessIncome > 0 ? ' · 사업소득 ' + wonShort(r.businessIncome) : '');

    var rows = '';
    r.checks.forEach(function (c) {
      var value;
      if (c.id === 'sibling') {
        value = mark(c.pass) + ' ' + (c.pass ? '해당' : '미해당');
      } else if (c.id === 'business') {
        value = mark(c.pass) + ' ' + wonShort(c.value) + ' <small>/ ' + (c.limit === 0 ? '0원' : wonShort(c.limit)) + '</small>';
      } else {
        value = mark(c.pass) + ' ' + wonShort(c.value) + ' <small>/ ' + wonShort(c.limit) + '</small>';
      }
      rows += row(c.label, value, c.detail + ' · ' + c.note);
    });
    el.dpChecks.innerHTML = rows;

    el.dpRoom.textContent = r.incomeRoom >= 0 ? wonShort(r.incomeRoom) : '초과 ' + wonShort(-r.incomeRoom);
    el.dpBand.textContent = r.propertyBand;
    el.dpAlt.textContent = won(r.fallback.total) + '원';
    el.dpZero.textContent = '0원';

    var lines = [];
    if (r.eligible) {
      lines.push('<strong>' + r.relationLabel + '</strong>는 소득·재산 요건을 모두 충족합니다. 피부양자로 등록되면 건강보험료가 0원이 되고, 지금 낸다면 지역가입자로 월 <strong>' +
        won(r.fallback.total) + '원</strong> 수준입니다.');
      if (r.income > r.fallback.annualIncome * 0) {
        lines.push('소득이 늘어 한도를 넘으면 그때부터 지역가입자로 전환될 수 있으니, 연말 소득을 한 번씩 확인해 두세요.');
      }
    } else {
      var reasons = r.failed.map(function (c) {
        if (c.id === 'income') return '소득 합계가 연 2,000만원을 ' + wonShort(c.value - c.limit) + ' 넘었습니다';
        if (c.id === 'property') {
          if (c.value > H.RATE.dependentPropertyMax) return '재산세 과세표준이 9억원을 넘었습니다';
          if (r.relation === 'sibling') return '형제·자매는 재산세 과세표준 1.8억원을 넘으면 안 됩니다';
          return '재산 5.4억 초과 구간이라 연 소득 1,000만원 이하여야 합니다';
        }
        if (c.id === 'business') return c.note;
        if (c.id === 'sibling') return '형제·자매는 30세 미만·65세 이상·장애인 등에 해당해야 합니다';
        return c.label;
      });
      lines.push('<strong>' + reasons.join('. ') + '.</strong>');
      lines.push('대신 지역가입자가 되면 월 <strong>' + won(r.fallback.total) + '원</strong> 수준의 보험료가 나옵니다.');
    }
    if (r.married) {
      lines.push('기혼자는 부부 모두 요건을 충족해야 하므로 배우자 소득·재산도 함께 확인하세요.');
    }
    el.dpInsight.innerHTML = lines.join(' ');
  }

  function depShareText() {
    var r = H.dependent(depInput());
    var lines = [
      '2026 피부양자 자격 모의 판정',
      '· 관계 ' + r.relationLabel + ' · 연 소득 ' + wonShort(r.income) + ' · 재산세 과세표준 ' + wonShort(r.property),
      '· 결과 ' + (r.eligible ? '요건 충족(가능)' : '요건 미달(' + r.failCount + '개)'),
      '· 탈락 시 지역가입자 예상 ' + won(r.fallback.total) + '원 / 월'
    ];
    var url = shareUrl();
    if (url) lines.push('', '건강보험료·피부양자 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 3: 퇴직 후 비교 ──────────────────────────────── */
  function syncRetireForm() {
    var r = state.retire;
    el.rtSalary.value = String(Math.round(r.salary));
    el.rtIncome.value = String(Math.round(r.income));
    el.rtProperty.value = String(Math.round(r.property));
    el.rtHistory.checked = r.history !== false;
    syncSegments('rttype', r.type);
    syncChips('rt-salary', r.salary);
    syncChips('rt-income', r.income);
    syncChips('rt-property', r.property);
  }

  function retireInput() {
    var r = state.retire;
    return {
      salary: r.salary,
      annualIncome: r.income,
      incomeType: r.type,
      property: r.property,
      history: r.history
    };
  }

  function renderRetire() {
    var r = H.retire(retireInput());
    var cont = r.continuation;
    var reg = r.regional;

    el.rtIncomeBadge.textContent = '소득월액 ' + wonShort(reg.incomeMonthly);
    el.rtPropertyBadge.textContent = reg.propertyGrade
      ? reg.propertyGrade + '등급 · ' + nf.format(reg.propertyScore) + '점'
      : '재산분 없음';

    if (!r.eligible && r.reason === 'history') {
      el.rtDiffLabel.textContent = '임의계속가입 자격 요건 미충족';
      el.rtWinner.textContent = '지역가입자';
      el.rtWinner.setAttribute('data-tier', '3');
      el.rtDiff.textContent = won(reg.total);
      el.rtDiffUnit.textContent = '원 / 월';
    } else if (!r.eligible) {
      el.rtDiffLabel.textContent = '지역가입자 월 보험료';
      el.rtWinner.textContent = '급여 입력 필요';
      el.rtWinner.setAttribute('data-tier', '2');
      el.rtDiff.textContent = won(reg.total);
      el.rtDiffUnit.textContent = '원 / 월';
    } else if (r.cheapSide === 'continue') {
      el.rtDiffLabel.textContent = '임의계속가입이 월 덜 내는 금액';
      el.rtWinner.textContent = '임의계속 유리';
      el.rtWinner.setAttribute('data-tier', '1');
      el.rtDiff.textContent = won(r.diff);
      el.rtDiffUnit.textContent = '원 / 월';
    } else if (r.cheapSide === 'regional') {
      el.rtDiffLabel.textContent = '지역가입자가 월 덜 내는 금액';
      el.rtWinner.textContent = '지역 유리';
      el.rtWinner.setAttribute('data-tier', '2');
      el.rtDiff.textContent = won(-r.diff);
      el.rtDiffUnit.textContent = '원 / 월';
    } else {
      el.rtDiffLabel.textContent = '두 쪽 부담 차이';
      el.rtWinner.textContent = '비슷함';
      el.rtWinner.setAttribute('data-tier', '2');
      el.rtDiff.textContent = '0';
      el.rtDiffUnit.textContent = '원 / 월';
    }
    el.rtSub.textContent = '보수월액 ' + wonShort(state.retire.salary) + ' · 지역 소득 ' + wonShort(state.retire.income) +
      ' · 재산 ' + wonShort(state.retire.property);

    var rows = '';
    rows += row('임의계속 보수월액', won(cont.salary) + '원', '최근 12개월 평균');
    rows += row('건강보험료', won(cont.health) + '원', '7.19% × 50% 경감');
    rows += row('장기요양보험료', won(cont.ltc) + '원', '건강보험료 × 13.14%');
    rows += row('임의계속 합계', won(cont.total) + '원', '본인 전액 부담', 'total');
    rows += row('지역 소득분', won(reg.incomePremium) + '원', '소득월액 ' + won(reg.incomeMonthly) + '원 × 7.19%');
    rows += row('지역 재산분', won(reg.propertyPremium) + '원',
      reg.propertyGrade ? reg.propertyGrade + '등급 ' + nf.format(reg.propertyScore) + '점 × 211.5원' : '공제 1억원 이하');
    rows += row('지역 장기요양보험료', won(reg.ltc) + '원', '건강보험료 × 13.14%');
    rows += row('지역 합계', won(reg.total) + '원', '전액 본인 부담', 'total');
    el.rtRows.innerHTML = rows;

    el.rtCont.textContent = won(cont.total) + '원';
    el.rtReg.textContent = won(reg.total) + '원';
    el.rtSave36.textContent = won(Math.abs(r.diff) * r.months) + '원';
    el.rtMonths.textContent = r.eligible ? '최대 ' + r.months + '개월' : '신청 자격 없음';

    var lines = [];
    if (!r.eligible && r.reason === 'history') {
      lines.push('퇴직 전 18개월 중 직장가입자 기간이 통산 1년(365일) 이상이어야 임의계속가입을 신청할 수 있습니다. 이 경우 지역가입자로 월 <strong>' +
        won(reg.total) + '원</strong>을 냅니다.');
    } else if (!r.eligible) {
      lines.push('퇴직 전 보수월액을 넣으면 임의계속가입 보험료와 비교할 수 있습니다. 지금은 지역가입자로 월 <strong>' +
        won(reg.total) + '원</strong>으로 계산했습니다.');
    } else if (r.cheapSide === 'continue') {
      lines.push('임의계속가입이 월 <strong>' + won(r.diff) + '원</strong>, 36개월이면 <strong>' + won(r.total36.diff) +
        '원</strong> 적습니다. 퇴직 다음 날부터 최대 36개월 유지되고, 지역보험료 첫 납부기한부터 2개월 안에 신청해야 합니다.');
    } else if (r.cheapSide === 'regional') {
      lines.push('이 조건에서는 지역가입자가 월 <strong>' + won(-r.diff) + '원</strong> 적습니다. 임의계속가입은 의무가 아니므로 신청하지 않으면 됩니다.');
    } else {
      lines.push('두 쪽 부담이 사실상 같습니다. 임의계속가입은 신청해야 적용되므로, 신청 기한과 가족 피부양자 가능 여부를 함께 확인하세요.');
    }
    if (r.eligible && reg.incomeFloored && r.cheapSide === 'continue') {
      lines.push('퇴직 후 소득이 없어 지역 소득분이 하한(20,160원)으로 계산됐습니다. 실제로는 전년도 근로소득이 반영돼 더 높을 수 있습니다.');
    }
    el.rtInsight.innerHTML = lines.join(' ');
  }

  function retireShareText() {
    var r = H.retire(retireInput());
    var lines = [
      '2026 퇴직 후 건강보험료 비교 (모의 계산)',
      '· 퇴직 전 보수월액 ' + wonShort(state.retire.salary) + ' · 지역 소득 ' + wonShort(state.retire.income) +
        ' · 재산 ' + wonShort(state.retire.property),
      '· 임의계속가입 ' + won(r.continuation.total) + '원 / 월',
      '· 지역가입자 ' + won(r.regional.total) + '원 / 월',
      '· 36개월 차이 ' + won(Math.abs(r.diff) * r.months) + '원'
    ];
    var url = shareUrl();
    if (url) lines.push('', '건강보험료·피부양자 계산기 → ' + url);
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
    el.promoHeading.textContent = coupang.heading || '부모님 댁 겨울나기';
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
  function bindCostEvents() {
    el.csSalary.addEventListener('input', function () {
      state.cost.salary = readNum(el.csSalary, 0, 0, 100000000);
      syncChips('cs-salary', state.cost.salary);
      refresh();
    });
    $$('.chips [data-cs-salary]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cost.salary = Number(b.getAttribute('data-cs-salary'));
        el.csSalary.value = String(state.cost.salary);
        syncChips('cs-salary', state.cost.salary);
        refresh();
      });
    });
    el.csExtra.addEventListener('input', function () {
      state.cost.extra = readNum(el.csExtra, 0, 0, 1000000000);
      refresh();
    });
    el.csIncome.addEventListener('input', function () {
      state.cost.income = readNum(el.csIncome, 0, 0, 1000000000);
      syncChips('cs-income', state.cost.income);
      refresh();
    });
    $$('.chips [data-cs-income]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cost.income = Number(b.getAttribute('data-cs-income'));
        el.csIncome.value = String(state.cost.income);
        syncChips('cs-income', state.cost.income);
        refresh();
      });
    });
    el.csProperty.addEventListener('input', function () {
      state.cost.property = readNum(el.csProperty, 0, 0, 5000000000);
      syncChips('cs-property', state.cost.property);
      refresh();
    });
    $$('.chips [data-cs-property]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cost.property = Number(b.getAttribute('data-cs-property'));
        el.csProperty.value = String(state.cost.property);
        syncChips('cs-property', state.cost.property);
        refresh();
      });
    });
    $$('.segmented[data-segment="cstype"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cost.type = b.getAttribute('data-value') === 'business' ? 'business' : 'earned';
        syncSegments('cstype', state.cost.type);
        refresh();
      });
    });
    el.shareCost.addEventListener('click', function () { doShare(costShareText()); });
  }

  function bindDepEvents() {
    $$('.segmented[data-segment="relation"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-value');
        if (!H.RELATION_LABEL[v]) return;
        state.dep.relation = v;
        el.dpSiblingField.hidden = v !== 'sibling';
        syncSegments('relation', v);
        refresh();
      });
    });
    el.dpIncome.addEventListener('input', function () {
      state.dep.income = readNum(el.dpIncome, 0, 0, 500000000);
      syncChips('dp-income', state.dep.income);
      refresh();
    });
    $$('.chips [data-dp-income]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.dep.income = Number(b.getAttribute('data-dp-income'));
        el.dpIncome.value = String(state.dep.income);
        syncChips('dp-income', state.dep.income);
        refresh();
      });
    });
    el.dpBusiness.addEventListener('input', function () {
      state.dep.business = readNum(el.dpBusiness, 0, 0, 500000000);
      refresh();
    });
    el.dpProperty.addEventListener('input', function () {
      state.dep.property = readNum(el.dpProperty, 0, 0, 5000000000);
      syncChips('dp-property', state.dep.property);
      refresh();
    });
    $$('.chips [data-dp-property]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.dep.property = Number(b.getAttribute('data-dp-property'));
        el.dpProperty.value = String(state.dep.property);
        syncChips('dp-property', state.dep.property);
        refresh();
      });
    });
    el.dpRegistered.addEventListener('change', function () {
      state.dep.registered = el.dpRegistered.checked;
      refresh();
    });
    el.dpRental.addEventListener('change', function () {
      state.dep.rental = el.dpRental.checked;
      refresh();
    });
    el.dpSiblingOk.addEventListener('change', function () {
      state.dep.siblingOk = el.dpSiblingOk.checked;
      refresh();
    });
    el.dpMarried.addEventListener('change', function () {
      state.dep.married = el.dpMarried.checked;
      refresh();
    });
    el.shareDependent.addEventListener('click', function () { doShare(depShareText()); });
  }

  function bindRetireEvents() {
    el.rtSalary.addEventListener('input', function () {
      state.retire.salary = readNum(el.rtSalary, 0, 0, 100000000);
      syncChips('rt-salary', state.retire.salary);
      refresh();
    });
    $$('.chips [data-rt-salary]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.retire.salary = Number(b.getAttribute('data-rt-salary'));
        el.rtSalary.value = String(state.retire.salary);
        syncChips('rt-salary', state.retire.salary);
        refresh();
      });
    });
    el.rtIncome.addEventListener('input', function () {
      state.retire.income = readNum(el.rtIncome, 0, 0, 1000000000);
      syncChips('rt-income', state.retire.income);
      refresh();
    });
    $$('.chips [data-rt-income]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.retire.income = Number(b.getAttribute('data-rt-income'));
        el.rtIncome.value = String(state.retire.income);
        syncChips('rt-income', state.retire.income);
        refresh();
      });
    });
    el.rtProperty.addEventListener('input', function () {
      state.retire.property = readNum(el.rtProperty, 0, 0, 5000000000);
      syncChips('rt-property', state.retire.property);
      refresh();
    });
    $$('.chips [data-rt-property]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.retire.property = Number(b.getAttribute('data-rt-property'));
        el.rtProperty.value = String(state.retire.property);
        syncChips('rt-property', state.retire.property);
        refresh();
      });
    });
    $$('.segmented[data-segment="rttype"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.retire.type = b.getAttribute('data-value') === 'business' ? 'business' : 'earned';
        syncSegments('rttype', state.retire.type);
        refresh();
      });
    });
    el.rtHistory.addEventListener('change', function () {
      state.retire.history = el.rtHistory.checked;
      refresh();
    });
    el.shareRetire.addEventListener('click', function () { doShare(retireShareText()); });
  }

  function refresh() {
    renderCost();
    renderDep();
    renderRetire();
    saveState();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    el.appVersion.textContent = CFG.version || '1.0.0';
    el.dataDate.textContent = H.DATA_DATE;
    el.dataDate.setAttribute('datetime', H.DATA_DATE);

    syncCostForm();
    syncDepForm();
    syncRetireForm();
    bindCostEvents();
    bindDepEvents();
    bindRetireEvents();
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
