/*!
 * app.js — 2026 고향사랑기부제 & 기부금 세액공제 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.DTCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'dtc.state.v1';
  var THEME_KEY = 'ctx.theme';
  var TABS = ['hometown', 'all', 'zero', 'guide'];

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
    tab: 'hometown',
    hometown: { amount: 100000, prior: 0, incomeTax: 1500000, disaster: false },
    all: { salary: 50000000, political: 0, hometown: 0, special: 0, general: 3000000, religion: 0, disaster: false },
    zero: { incomeTax: 1500000, other: 800000, hometown: 100000, political: 0, general: 0 },
    checks: {}
  };

  var L = S.LIMITS;

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    var h = raw.hometown;
    if (h && typeof h === 'object') {
      [['amount', L.amount], ['prior', L.amount], ['incomeTax', L.tax]].forEach(function (pair) {
        var v = parseFloat(h[pair[0]]);
        if (isFinite(v) && v >= 0) state.hometown[pair[0]] = clamp(v, pair[1].min, pair[1].max);
      });
      state.hometown.disaster = !!h.disaster;
    }

    var a = raw.all;
    if (a && typeof a === 'object') {
      [['salary', L.salary], ['political', L.money], ['hometown', L.amount],
        ['special', L.money], ['general', L.money], ['religion', L.money]].forEach(function (pair) {
        var v = parseFloat(a[pair[0]]);
        if (isFinite(v) && v >= 0) state.all[pair[0]] = clamp(v, pair[1].min, pair[1].max);
      });
      state.all.disaster = !!a.disaster;
    }

    var z = raw.zero;
    if (z && typeof z === 'object') {
      [['incomeTax', L.tax], ['other', L.tax], ['hometown', L.amount], ['political', L.money], ['general', L.money]]
        .forEach(function (pair) {
          var v = parseFloat(z[pair[0]]);
          if (isFinite(v) && v >= 0) state.zero[pair[0]] = clamp(v, pair[1].min, pair[1].max);
        });
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
    el.tabHometown = $('#tabHometown');
    el.tabAll = $('#tabAll');
    el.tabZero = $('#tabZero');
    el.tabGuide = $('#tabGuide');
    el.panelHometown = $('#panelHometown');
    el.panelAll = $('#panelAll');
    el.panelZero = $('#panelZero');
    el.panelGuide = $('#panelGuide');

    /* 탭 1 */
    el.hsAmount = $('#hsAmount');
    el.hsAmountBadge = $('#hsAmountBadge');
    el.hsPrior = $('#hsPrior');
    el.hsPriorBadge = $('#hsPriorBadge');
    el.hsIncomeTax = $('#hsIncomeTax');
    el.hsIncomeTaxBadge = $('#hsIncomeTaxBadge');
    el.hsDisasterGroup = $('#hsDisasterGroup');
    el.hsTotal = $('#hsTotal');
    el.hsSub = $('#hsSub');
    el.hsVerdict = $('#hsVerdict');
    el.hsRefund = $('#hsRefund');
    el.hsRows = $('#hsRows');
    el.hsStatDonate = $('#hsStatDonate');
    el.hsStatCredit = $('#hsStatCredit');
    el.hsStatGift = $('#hsStatGift');
    el.hsStatNet = $('#hsStatNet');
    el.hsMeterFill = $('#hsMeterFill');
    el.hsMeterLeft = $('#hsMeterLeft');
    el.hsMeterRight = $('#hsMeterRight');
    el.hsNextTitle = $('#hsNextTitle');
    el.hsNext = $('#hsNext');
    el.hsInsight = $('#hsInsight');
    el.hsBandTable = $('#hsBandTable');
    el.hsScaleTable = $('#hsScaleTable');
    el.shareHometown = $('#shareHometown');

    /* 탭 2 */
    el.alSalary = $('#alSalary');
    el.alSalaryBadge = $('#alSalaryBadge');
    el.alIncomeHelp = $('#alIncomeHelp');
    el.alPolitical = $('#alPolitical');
    el.alPoliticalBadge = $('#alPoliticalBadge');
    el.alHometown = $('#alHometown');
    el.alHometownBadge = $('#alHometownBadge');
    el.alSpecial = $('#alSpecial');
    el.alSpecialBadge = $('#alSpecialBadge');
    el.alGeneral = $('#alGeneral');
    el.alGeneralBadge = $('#alGeneralBadge');
    el.alReligion = $('#alReligion');
    el.alReligionBadge = $('#alReligionBadge');
    el.alDisasterGroup = $('#alDisasterGroup');
    el.alCredit = $('#alCredit');
    el.alSub = $('#alSub');
    el.alVerdict = $('#alVerdict');
    el.alRefund = $('#alRefund');
    el.alRows = $('#alRows');
    el.alStatIncome = $('#alStatIncome');
    el.alStatAllowed = $('#alStatAllowed');
    el.alStatOver = $('#alStatOver');
    el.alStatRate = $('#alStatRate');
    el.alNextTitle = $('#alNextTitle');
    el.alNext = $('#alNext');
    el.alInsight = $('#alInsight');
    el.alTypeTable = $('#alTypeTable');
    el.alRuleTable = $('#alRuleTable');
    el.shareAll = $('#shareAll');

    /* 탭 3 */
    el.ztIncomeTax = $('#ztIncomeTax');
    el.ztIncomeTaxBadge = $('#ztIncomeTaxBadge');
    el.ztOther = $('#ztOther');
    el.ztOtherBadge = $('#ztOtherBadge');
    el.ztHometown = $('#ztHometown');
    el.ztHometownBadge = $('#ztHometownBadge');
    el.ztPolitical = $('#ztPolitical');
    el.ztPoliticalBadge = $('#ztPoliticalBadge');
    el.ztGeneral = $('#ztGeneral');
    el.ztGeneralBadge = $('#ztGeneralBadge');
    el.ztApplied = $('#ztApplied');
    el.ztSub = $('#ztSub');
    el.ztVerdict = $('#ztVerdict');
    el.ztRefund = $('#ztRefund');
    el.ztRows = $('#ztRows');
    el.ztStatCapacity = $('#ztStatCapacity');
    el.ztStatWanted = $('#ztStatWanted');
    el.ztStatLost = $('#ztStatLost');
    el.ztStatGift = $('#ztStatGift');
    el.ztNextTitle = $('#ztNextTitle');
    el.ztNext = $('#ztNext');
    el.ztInsight = $('#ztInsight');
    el.ztTypeTable = $('#ztTypeTable');
    el.ztCapTable = $('#ztCapTable');
    el.shareZero = $('#shareZero');

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
    el.welloSection = $('#welloSection');
    el.welloHeading = $('#welloHeading');
    el.welloSub = $('#welloSub');
    el.welloList = $('#welloList');
    el.welloDisclosure = $('#welloDisclosure');
    el.footerDisclosure = $('#footerDisclosure');
    el.dataDate = $('#dataDate');
    el.appVersion = $('#appVersion');
  }

  /* ── 탭 ───────────────────────────────────────────────── */
  function setTab(name, focus) {
    if (TABS.indexOf(name) < 0) name = 'hometown';
    state.tab = name;
    var map = {
      hometown: [el.tabHometown, el.panelHometown],
      all: [el.tabAll, el.panelAll],
      zero: [el.tabZero, el.panelZero],
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
    el.tabHometown.addEventListener('click', function () { setTab('hometown'); });
    el.tabAll.addEventListener('click', function () { setTab('all'); });
    el.tabZero.addEventListener('click', function () { setTab('zero'); });
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
    setTab(TABS.indexOf(hash) >= 0 ? hash : (state.tab || 'hometown'));
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

  /* ── 탭 1: 고향사랑기부제 실익 ───────────────────────── */
  function hometownInput() {
    return {
      amount: state.hometown.amount,
      prior: state.hometown.prior,
      incomeTax: state.hometown.incomeTax,
      disaster: state.hometown.disaster
    };
  }

  function syncHometownForm() {
    el.hsAmount.value = state.hometown.amount;
    el.hsPrior.value = state.hometown.prior;
    el.hsIncomeTax.value = state.hometown.incomeTax;
    el.hsAmountBadge.textContent = wonShort(state.hometown.amount);
    el.hsPriorBadge.textContent = wonShort(state.hometown.prior);
    el.hsIncomeTaxBadge.textContent = wonShort(state.hometown.incomeTax);
    syncGroup(el.hsDisasterGroup, 'hs-disaster', state.hometown.disaster ? 1 : 0);
    syncChips('hs-amount', state.hometown.amount);
    syncChips('hs-tax', state.hometown.incomeTax);
  }

  function renderHometown() {
    var m = S.hometownPlan(hometownInput());
    var capped = m.capped;

    el.hsTotal.textContent = won(m.applied);
    el.hsSub.textContent = '기부 ' + wonShort(m.amount) + ' · 계산상 공제 ' + wonShort(m.total) +
      (capped ? ' · 산출세액 한도로 ' + wonShort(m.lost) + ' 소멸' : ' · 전액 반영') +
      ' · 연 누적 ' + wonShort(m.cumulative);

    if (m.overCap > 0) setBadge(el.hsVerdict, '연 한도 초과', 3);
    else if (capped) setBadge(el.hsVerdict, '산출세액 초과', 3);
    else if (m.cumulative <= S.RULES.hometown.mid && m.cumulative > S.RULES.hometown.first) setBadge(el.hsVerdict, '44% 구간', 1);
    else if (m.cumulative <= S.RULES.hometown.first) setBadge(el.hsVerdict, '기부금 전액 공제', 1);
    else setBadge(el.hsVerdict, '16.5% 구간', 2);

    el.hsRefund.textContent = (m.net >= 0 ? '+' : '−') + won(Math.abs(m.net)) + '원';

    var html = '';
    html += row('이번 기부금', won(m.amount) + '원', m.prior > 0 ? '올해 누적 ' + wonShort(m.cumulative) : '연 2,000만원 한도', 'is-dim');
    html += row('소득세 세액공제', won(m.credit) + '원', '구간별 100/110 · 40% · ' + (m.disaster ? '30%' : '15%'));
    html += row('지방소득세 공제', won(m.local) + '원', '소득세 공제의 10%');
    if (capped) {
      html += row('산출세액 한도 초과', '−' + won(m.lost) + '원', '이월되지 않음', 'is-dim');
    }
    html += row('답례품(기부 포인트)', '+' + won(m.gift) + '원', '기부액의 30% 한도');
    html += row(m.net >= 0 ? '순이익' : '실제 부담', (m.net >= 0 ? '+' : '−') + won(Math.abs(m.net)) + '원',
      '세액공제 + 답례품 − 기부금', 'total');
    el.hsRows.innerHTML = html;

    el.hsStatDonate.textContent = won(m.cumulative) + '원';
    el.hsStatCredit.textContent = won(m.credit) + '원';
    el.hsStatGift.textContent = won(m.gift) + '원';
    el.hsStatNet.textContent = won(Math.max(0, m.amount - m.applied - m.gift)) + '원';

    el.hsMeterFill.style.width = (m.capUsedRate * 100).toFixed(2) + '%';
    el.hsMeterFill.setAttribute('data-tone', m.capUsedRate > 0.99 ? 'warn' : '');
    el.hsMeterLeft.textContent = '연 한도 ' + (m.capUsedRate * 100).toFixed(m.capUsedRate < 0.1 ? 1 : 0) + '%';
    el.hsMeterRight.textContent = '연 한도 2,000만원';

    /* 다음에 할 일 */
    var nextTitle = '다음에 할 일';
    var next = '';
    if (m.overCap > 0) {
      nextTitle = '연 한도를 넘었습니다';
      next = '올해 기부 합계가 2,000만원을 넘어 <strong>' + won(m.overCap) + '원</strong>은 기부할 수 없습니다. 넘는 금액은 공제도 되지 않으니 내년으로 미루세요.';
    } else if (capped) {
      nextTitle = '산출세액이 모자랍니다';
      next = '계산상 공제 <strong>' + won(m.total) + '원</strong> 중 <strong>' + won(m.applied) + '원</strong>만 반영되고 ' +
        won(m.lost) + '원은 사라집니다(이월 없음). 기부 금액을 줄이거나, 세금이 남은 가족 명의로 나눠 기부하는 편이 낫습니다.';
    } else if (m.cumulative <= S.RULES.hometown.mid) {
      nextTitle = '20만원까지가 가장 이득';
      next = '20만원까지는 지방세 포함 <strong>44%</strong>가 돌아오고 답례품 30%까지 붙습니다. 지금 기부는 <strong>' +
        won(m.net) + '원</strong> 이익입니다. 20만원을 넘기면 초과분은 16.5%로 떨어집니다.';
    } else if (m.amount <= 200000) {
      nextTitle = '20만원 구간을 채우세요';
      next = '올해 누적이 ' + wonShort(m.cumulative) + '입니다. 20만원까지 <strong>' + wonShort(Math.max(0, S.RULES.hometown.mid - m.cumulative)) +
        '</strong>을 더 넣으면 그 금액의 44%(지방세 포함)가 돌아옵니다.';
    } else {
      nextTitle = '20만원 초과분은 16.5%';
      next = '20만원을 넘는 금액은 16.5%(특별재난지역 33%)만 돌아옵니다. 세금 혜택보다 <strong>기부 자체의 뜻</strong>으로 판단하는 구간입니다.' +
        (m.disasterGain > 0 ? ' 특별재난지역 요건을 충족하면 ' + won(m.disasterGain) + '원을 더 돌려받습니다.' : '');
    }
    el.hsNextTitle.textContent = nextTitle;
    el.hsNext.innerHTML = next;

    /* 인사이트 */
    var ins;
    if (m.amount === 0) {
      ins = '기부 금액을 넣으면 구간별 공제액과 답례품까지 계산합니다.';
      setInsight(el.hsInsight, ins, '');
    } else if (capped) {
      ins = '고향사랑기부금 공제는 <strong>그해 산출세액을 한도</strong>로 하고, 넘는 금액은 다음 해로 넘어가지 않습니다(조세특례제한법 제58조 제2항). ' +
        '연말정산 미리보기에서 남은 세금을 먼저 확인하세요.';
      setInsight(el.hsInsight, ins, 'is-warn');
    } else if (m.disaster) {
      ins = '특별재난지역 기부는 20만원 초과분이 30%(지방세 포함 33%)입니다. 같은 금액이라도 일반 지역보다 <strong>' +
        won(m.disasterGain) + '원</strong> 더 돌려받습니다. 선포일부터 3개월 이내 기부분만 해당합니다.';
      setInsight(el.hsInsight, ins, 'is-ok');
    } else {
      ins = '10만원 이하는 <strong>110분의 100</strong>이라 지방소득세까지 합치면 기부액과 거의 같아집니다(원 단위 절사로 1원 차이). ' +
        '10만~20만원은 40%가 새로 생겨, 20만원 기부 시 세금 14만 4,000원 + 답례품 6만원이 됩니다. ' +
        '답례품은 세액공제를 줄이지 않습니다.';
      setInsight(el.hsInsight, ins, 'is-ok');
    }

    /* 구간별 표 */
    var tbody = '';
    m.after.bands.forEach(function (b) {
      tbody += '<tr' + (b.base > 0 ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + b.label + '</th>' +
        '<td>' + won(b.base) + '</td>' +
        '<td>' + b.text + '</td>' +
        '<td><strong>' + won(b.credit) + '</strong></td></tr>';
    });
    tbody += '<tr><th scope="row">합계</th><td>' + won(m.after.paid) + '</td><td>—</td>' +
      '<td><strong>' + won(m.after.credit) + '</strong></td></tr>';
    $('tbody', el.hsBandTable).innerHTML = tbody;

    /* 금액별 비교 */
    var st = '';
    m.scale.forEach(function (amt) {
      var p = S.hometownPlan({ amount: amt, prior: m.prior, disaster: m.disaster, incomeTax: m.incomeTax });
      st += '<tr' + (amt === m.amount ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + wonShort(m.prior + amt) + '</th>' +
        '<td>' + wonShort(p.total) + '</td>' +
        '<td>' + wonShort(p.gift) + '</td>' +
        '<td><strong>' + (p.net >= 0 ? '+' : '−') + wonShort(Math.abs(p.net)) + '</strong></td></tr>';
    });
    $('tbody', el.hsScaleTable).innerHTML = st;
  }

  function hometownShareText() {
    var m = S.hometownPlan(hometownInput());
    return '[고향사랑기부제 2026]\n' +
      '기부 ' + wonShort(m.amount) + (m.prior > 0 ? ' (올해 누적 ' + wonShort(m.cumulative) + ')' : '') + '\n' +
      '세액공제 ' + won(m.credit) + '원 + 지방소득세 ' + won(m.local) + '원 = ' + won(m.total) + '원\n' +
      '답례품(30%) ' + won(m.gift) + '원 · ' + (m.net >= 0 ? '순이익 +' : '실제 부담 ') + won(Math.abs(m.net)) + '원\n' +
      (m.capped ? '산출세액 한도로 ' + won(m.lost) + '원은 소멸(이월 없음)\n' : '') +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/donation-tax/');
  }

  /* ── 탭 2: 전체 기부금 세액공제 ─────────────────────── */
  function allInput() {
    return {
      salary: state.all.salary,
      political: state.all.political,
      hometown: state.all.hometown,
      special: state.all.special,
      general: state.all.general,
      religion: state.all.religion,
      disaster: state.all.disaster
    };
  }

  function syncAllForm() {
    el.alSalary.value = state.all.salary;
    el.alPolitical.value = state.all.political;
    el.alHometown.value = state.all.hometown;
    el.alSpecial.value = state.all.special;
    el.alGeneral.value = state.all.general;
    el.alReligion.value = state.all.religion;
    el.alSalaryBadge.textContent = wonShort(state.all.salary);
    el.alPoliticalBadge.textContent = wonShort(state.all.political);
    el.alHometownBadge.textContent = wonShort(state.all.hometown);
    el.alSpecialBadge.textContent = wonShort(state.all.special);
    el.alGeneralBadge.textContent = wonShort(state.all.general);
    el.alReligionBadge.textContent = wonShort(state.all.religion);
    syncGroup(el.alDisasterGroup, 'al-disaster', state.all.disaster ? 1 : 0);
    syncChips('al-salary', state.all.salary);
  }

  function renderAll() {
    var a = S.allDonations(allInput());

    el.alIncomeHelp.innerHTML = '근로소득금액은 <strong>' + won(S.earnedIncome(a.salary)) + '원</strong>으로 계산됩니다' +
      '(근로소득공제 ' + wonShort(S.earnedDeduction(a.salary)) + ').';

    el.alCredit.textContent = won(a.totalCredit);
    el.alSub.textContent = '기부 ' + wonShort(a.totalAmount) + ' · 인정 ' + wonShort(a.allowedTotal) +
      ' · 절세율 ' + pct(a.effective, 1);

    if (a.totalAmount === 0) setBadge(el.alVerdict, '기부 없음', 2);
    else if (a.overTotal > 0) setBadge(el.alVerdict, '한도 초과 포함', 3);
    else setBadge(el.alVerdict, '공제 적용', 1);

    el.alRefund.textContent = won(a.total) + '원';

    var html = '';
    a.types.forEach(function (t) {
      if (t.amount <= 0) return;
      html += row(S.typeMeta(t.key).short + ' 기부금', won(t.amount) + '원',
        '인정 ' + wonShort(t.allowed) + (t.over > 0 ? ' · 초과 ' + wonShort(t.over) : ''));
      html += row('　└ 세액공제', won(t.credit) + '원',
        t.key === 'general' || t.key === 'religion' ? '15%·30% 합산 풀' : S.typeMeta(t.key).rateLabel);
    });
    if (a.totalAmount === 0) html += row('기부 내역', '0원', '금액을 넣어 주세요', 'is-dim');
    html += row('세액공제 합계', won(a.totalCredit) + '원', '소득세');
    html += row('지방소득세 포함', won(a.total) + '원', '소득세 공제의 10%', 'total');
    el.alRows.innerHTML = html;

    el.alStatIncome.textContent = won(a.income) + '원';
    el.alStatAllowed.textContent = won(a.allowedTotal) + '원';
    el.alStatOver.textContent = won(a.overTotal) + '원';
    el.alStatRate.textContent = pct(a.effective, 1);

    var nextTitle = '어디에 더 넣을까';
    var next = '';
    if (a.totalAmount === 0) {
      nextTitle = '기부 내역을 넣어 주세요';
      next = '종류별 금액을 넣으면 한도와 공제 순서를 반영해 계산합니다.';
    } else if (a.overTotal > 0) {
      nextTitle = '한도를 넘은 금액이 있습니다';
      next = '한도 밖 <strong>' + won(a.overTotal) + '원</strong>은 공제되지 않습니다. 특례·일반기부금은 10년 이월되지만, ' +
        (a.lostTotal > 0 ? '정치자금·고향사랑 ' + won(a.lostTotal) + '원은 이월되지 않습니다. ' : '') +
        '내년으로 미루거나 다른 종류로 나눠 보세요.';
    } else if (a.generalBase > 0 && a.types[3].allowed < a.types[3].amount + a.types[4].amount) {
      nextTitle = '일반기부금 한도가 남았습니다';
      next = '한도 <strong>' + won(a.generalLimit) + '원</strong> 중 ' + won(a.types[3].allowed + a.types[4].allowed) +
        '원을 썼습니다. 남은 한도 안에서 기부하면 15%(1,000만원 초과분 30%)가 그대로 붙습니다.';
    } else {
      nextTitle = '공제가 잘 적용됐습니다';
      next = '정치자금 → 고향사랑 → 특례 → 일반 순서로 한도를 채웠습니다. 특례·일반은 1,000만원까지 15%, 초과분은 30%입니다.';
    }
    el.alNextTitle.textContent = nextTitle;
    el.alNext.innerHTML = next;

    var ins;
    if (a.types[4].amount > 0) {
      ins = '종교단체 기부가 있어 일반기부금 한도가 <strong>소득금액의 10% + min(20%, 종교단체 외 기부)</strong>로 계산됐습니다. ' +
        '종교단체에만 냈다면 사실상 소득금액의 10%가 한도입니다.';
      setInsight(el.alInsight, ins, 'is-warn');
    } else if (a.pool.pool > S.RULES.general.threshold) {
      ins = '특례·일반기부금이 합쳐 1,000만원을 넘어 초과분에 30%가 적용됐습니다. 1,000만원 이하 ' +
        won(a.pool.low) + '원은 15%, 초과 ' + won(a.pool.high) + '원은 30%입니다.';
      setInsight(el.alInsight, ins, 'is-ok');
    } else {
      ins = '특례·일반기부금은 합산 1,000만원까지 15%, 넘는 부분만 30%입니다. 낸 금액 대비 공제율이 ' +
        pct(a.effective, 1) + '인 이유는 한도와 산출세액 한도 때문입니다.';
      setInsight(el.alInsight, ins, '');
    }

    /* 종류별 표 */
    var tbody = '';
    a.types.forEach(function (t) {
      var meta = S.typeMeta(t.key);
      tbody += '<tr' + (t.amount > 0 ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + meta.short + '</th>' +
        '<td>' + won(t.amount) + '</td>' +
        '<td>' + won(t.limit) + '</td>' +
        '<td>' + won(t.allowed) + '</td>' +
        '<td><strong>' + won(t.credit) + '</strong></td>' +
        '<td>' + (t.over > 0 ? won(t.over) : '—') + '</td></tr>';
    });
    tbody += '<tr><th scope="row">합계</th><td>' + won(a.totalAmount) + '</td><td>—</td><td>' +
      won(a.allowedTotal) + '</td><td><strong>' + won(a.totalCredit) + '</strong></td><td>' +
      (a.overTotal > 0 ? won(a.overTotal) : '—') + '</td></tr>';
    $('tbody', el.alTypeTable).innerHTML = tbody;

    /* 공제율 표 */
    var rules = '';
    S.TYPES.forEach(function (t) {
      rules += '<tr><th scope="row">' + t.short + '</th>' +
        '<td>' + t.rateLabel + '</td>' +
        '<td>' + t.limitLabel + '</td>' +
        '<td>' + (t.carry ? '10년' : '없음') + '</td></tr>';
    });
    $('tbody', el.alRuleTable).innerHTML = rules;
  }

  function allShareText() {
    var a = S.allDonations(allInput());
    return '[2026 기부금 세액공제]\n' +
      '총급여 ' + wonShort(a.salary) + ' · 근로소득금액 ' + wonShort(a.income) + '\n' +
      '기부 ' + wonShort(a.totalAmount) + ' → 인정 ' + wonShort(a.allowedTotal) + '\n' +
      '세액공제 ' + won(a.totalCredit) + '원 · 지방세 포함 ' + won(a.total) + '원\n' +
      (a.overTotal > 0 ? '한도 초과 ' + won(a.overTotal) + '원(특례·일반은 10년 이월)\n' : '') +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/donation-tax/');
  }

  /* ── 탭 3: 결정세액 0원 ─────────────────────────────── */
  function zeroInput() {
    return {
      incomeTax: state.zero.incomeTax,
      otherCredit: state.zero.other,
      hometown: state.zero.hometown,
      political: state.zero.political,
      general: state.zero.general
    };
  }

  function syncZeroForm() {
    el.ztIncomeTax.value = state.zero.incomeTax;
    el.ztOther.value = state.zero.other;
    el.ztHometown.value = state.zero.hometown;
    el.ztPolitical.value = state.zero.political;
    el.ztGeneral.value = state.zero.general;
    el.ztIncomeTaxBadge.textContent = wonShort(state.zero.incomeTax);
    el.ztOtherBadge.textContent = wonShort(state.zero.other);
    el.ztHometownBadge.textContent = wonShort(state.zero.hometown);
    el.ztPoliticalBadge.textContent = wonShort(state.zero.political);
    el.ztGeneralBadge.textContent = wonShort(state.zero.general);
    syncChips('zt-income-tax', state.zero.incomeTax);
  }

  function renderZero() {
    var z = S.zeroPoint(zeroInput());

    el.ztApplied.textContent = won(z.applied);
    el.ztSub.textContent = '산출세액 ' + wonShort(z.incomeTax) + ' · 다른 공제 ' + wonShort(z.otherCredit) +
      ' · 공제 여력 ' + wonShort(z.capacity);

    if (z.verdict === 'no-tax') setBadge(el.ztVerdict, '낼 세금 없음', 3);
    else if (z.verdict === 'zero') setBadge(el.ztVerdict, '공제 여력 0원', 3);
    else if (z.verdict === 'partial') setBadge(el.ztVerdict, '일부만 반영', 1);
    else setBadge(el.ztVerdict, '전액 반영', 2);

    el.ztRefund.textContent = (z.net >= 0 ? '+' : '−') + won(Math.abs(z.net)) + '원';

    var html = '';
    html += row('산출세액', won(z.incomeTax) + '원', '결정세액 계산 전', 'is-dim');
    html += row('이미 받는 세액공제', '−' + won(z.otherCredit) + '원', '근로·자녀·연금·특별');
    html += row('기부금 공제 여력', won(z.capacity) + '원', z.capacity > 0 ? '여기까지만 환급' : '남은 세금 없음');
    html += row('계산상 기부금 공제', won(z.wanted) + '원', '소득세 기준');
    html += row('실제 반영', won(z.appliedCredit) + '원', '지방소득세 포함 ' + won(z.applied) + '원');
    if (z.lost > 0) {
      html += row('사라지는 공제', '−' + won(z.lost) + '원',
        z.lostGone > 0 ? '정치·고향사랑 ' + won(z.lostGone) + '은 이월 없음' : '10년 이월 가능', 'is-dim');
    }
    html += row('답례품', '+' + won(z.gift) + '원', '기부액의 30%');
    html += row(z.net >= 0 ? '실익' : '실제 부담', (z.net >= 0 ? '+' : '−') + won(Math.abs(z.net)) + '원', '환급 + 답례품', 'total');
    el.ztRows.innerHTML = html;

    el.ztStatCapacity.textContent = won(z.capacity) + '원';
    el.ztStatWanted.textContent = won(z.wanted) + '원';
    el.ztStatLost.textContent = won(z.lost) + '원';
    el.ztStatGift.textContent = won(z.gift) + '원';

    var nextTitle = '기부 판단';
    var next = '';
    if (z.verdict === 'no-tax') {
      nextTitle = '낼 세금이 없습니다';
      next = '산출세액이 0원이라 기부금 공제로 줄일 세금이 없습니다. <strong>환급은 0원</strong>이고, 답례품 ' +
        won(z.gift) + '원만 남습니다. 세금이 남은 배우자·부모 명의로 기부하는 방법을 검토하세요.';
    } else if (z.verdict === 'zero') {
      nextTitle = '이미 결정세액이 0원';
      next = '다른 세액공제로 세금이 모두 줄어 공제 여력이 0원입니다. 기부해도 <strong>돌려받을 세금은 없습니다</strong>. ' +
        '그래도 답례품은 받을 수 있으니, 기부 목적이 세금이라면 다시 생각해 보세요.';
    } else if (z.verdict === 'partial') {
      nextTitle = '일부만 돌려받습니다';
      next = '계산상 공제 <strong>' + won(z.wanted) + '원</strong> 중 <strong>' + won(z.appliedCredit) +
        '원</strong>만 반영되고 ' + won(z.lost) + '원은 사라집니다. ' +
        (z.lostCarryable > 0 ? '특례·일반기부금 ' + won(z.lostCarryable) + '원은 10년 이월되지만, ' : '') +
        (z.lostGone > 0 ? '고향사랑·정치자금 ' + won(z.lostGone) + '원은 이월되지 않습니다.' : '');
    } else {
      nextTitle = '전액 돌려받습니다';
      next = '공제 여력이 충분해 계산상 공제 <strong>' + won(z.wanted) + '원</strong>이 모두 반영됩니다. ' +
        '답례품까지 합치면 ' + won(z.net) + '원의 실익입니다.';
    }
    el.ztNextTitle.textContent = nextTitle;
    el.ztNext.innerHTML = next;

    var ins;
    if (z.capacity <= 0) {
      ins = '세액공제는 <strong>산출세액을 넘을 수 없고</strong>(소득세법 제61조 제2항), 고향사랑·정치자금은 이월도 되지 않습니다. ' +
        '결정세액이 0원이면 "10만원 기부해서 13만원"은 세금에서는 나오지 않습니다.';
      setInsight(el.ztInsight, ins, 'is-warn');
    } else if (z.lost > 0) {
      ins = '남은 세금 ' + won(z.capacity) + '원까지만 공제됩니다. ' +
        (z.lostCarryable > 0 ? '특례·일반기부금에서 못 받은 ' + won(z.lostCarryable) + '원은 다음 해부터 10년간 이월되지만, ' : '') +
        (z.lostGone > 0 ? '고향사랑·정치자금 ' + won(z.lostGone) + '원은 그대로 사라집니다. ' : '') +
        '기부 금액을 여력에 맞추는 편이 낫습니다.';
      setInsight(el.ztInsight, ins, 'is-warn');
    } else {
      ins = '공제 여력 안에서 기부해 전액 반영됩니다. 연말정산 미리보기로 실제 결정세액을 확인한 뒤 금액을 정하세요.';
      setInsight(el.ztInsight, ins, 'is-ok');
    }

    var tbody = '';
    z.types.forEach(function (t) {
      if (t.wanted <= 0 && t.applied <= 0) return;
      tbody += '<tr' + (t.applied > 0 ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + t.name + '</th>' +
        '<td>' + won(t.wanted) + '</td>' +
        '<td><strong>' + won(t.applied) + '</strong></td>' +
        '<td>' + (t.lost > 0 ? '−' + won(t.lost) : '—') + '</td>' +
        '<td>' + (t.carry ? '10년' : '없음') + '</td></tr>';
    });
    if (!tbody) tbody = '<tr><th scope="row">기부 내역</th><td>0</td><td>0</td><td>—</td><td>—</td></tr>';
    $('tbody', el.ztTypeTable).innerHTML = tbody;

    var capRows = '';
    S.capacityTable({ hometown: state.zero.hometown, political: state.zero.political, general: state.zero.general }).forEach(function (c) {
      capRows += '<tr' + (c.capacity === z.capacity ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + wonShort(c.capacity) + '</th>' +
        '<td>' + wonShort(c.applied) + '</td>' +
        '<td>' + wonShort(c.gift) + '</td>' +
        '<td><strong>' + wonShort(c.total) + '</strong></td></tr>';
    });
    $('tbody', el.ztCapTable).innerHTML = capRows;
  }

  function zeroShareText() {
    var z = S.zeroPoint(zeroInput());
    return '[결정세액 0원 시뮬레이터]\n' +
      '산출세액 ' + wonShort(z.incomeTax) + ' · 다른 공제 ' + wonShort(z.otherCredit) + ' · 여력 ' + wonShort(z.capacity) + '\n' +
      '계산상 공제 ' + won(z.wanted) + '원 → 실제 반영 ' + won(z.applied) + '원\n' +
      (z.lost > 0 ? '사라지는 공제 ' + won(z.lost) + '원(고향사랑·정치자금 ' + won(z.lostGone) + '원은 이월 없음)\n' : '') +
      '답례품 ' + won(z.gift) + '원\n' +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/donation-tax/');
  }

  /* ── 체크리스트 ───────────────────────────────────────── */
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
      box.checked = !!state.checks[key];
      box.addEventListener('change', function () {
        if (box.checked) state.checks[key] = true;
        else delete state.checks[key];
        sync();
        persist();
      });
    });
    if (resetEl) {
      resetEl.addEventListener('click', function () {
        boxes.forEach(function (b) {
          b.checked = false;
          delete state.checks[b.getAttribute('data-check')];
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
    el.promoHeading.textContent = coupang.heading || '기부하고 받은 답례품, 명절 선물로';
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

  /* ── 웰로 파트너스 카드 ───────────────────────────────── */
  function initWello() {
    var wello = CFG.wello || {};
    var it = wello.item || {};
    if (!it.url) {
      el.welloSection.hidden = true;
      return;
    }
    el.welloSection.hidden = false;
    el.welloHeading.textContent = wello.heading || '답례품부터 보고 기부하기';
    el.welloSub.textContent = wello.subheading || '';
    el.welloDisclosure.textContent = wello.disclosure || '';
    el.welloList.innerHTML = '<div class="promo-item">' +
      '<span class="promo-thumb" aria-hidden="true">' + (it.emoji || '🎁') + '</span>' +
      '<div class="promo-body">' +
      '<p class="promo-name">' + it.name + '</p>' +
      '<p class="promo-meta">' + (it.tag || '') + '</p>' +
      '</div>' +
      '<a class="promo-cta" href="' + it.url + '" target="_blank" rel="sponsored nofollow noopener">' +
      (it.cta || '웰로에서 보기') + '</a></div>';
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
  function bindHometownEvents() {
    el.hsAmount.addEventListener('input', function () {
      state.hometown.amount = readNum(el.hsAmount, state.hometown.amount, L.amount.min, L.amount.max);
      el.hsAmountBadge.textContent = wonShort(state.hometown.amount);
      renderHometown();
      saveState();
    });
    el.hsPrior.addEventListener('input', function () {
      state.hometown.prior = readNum(el.hsPrior, state.hometown.prior, L.amount.min, L.amount.max);
      el.hsPriorBadge.textContent = wonShort(state.hometown.prior);
      renderHometown();
      saveState();
    });
    el.hsIncomeTax.addEventListener('input', function () {
      state.hometown.incomeTax = readNum(el.hsIncomeTax, state.hometown.incomeTax, L.tax.min, L.tax.max);
      el.hsIncomeTaxBadge.textContent = wonShort(state.hometown.incomeTax);
      renderHometown();
      saveState();
    });
    bindGroup(el.hsDisasterGroup, 'hs-disaster', function (v) {
      state.hometown.disaster = v === '1';
      syncHometownForm();
      renderHometown();
      saveState();
    });
    $$('.chips [data-hs-amount]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.hometown.amount = Number(b.getAttribute('data-hs-amount'));
        syncHometownForm();
        renderHometown();
        saveState();
      });
    });
    $$('.chips [data-hs-tax]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.hometown.incomeTax = Number(b.getAttribute('data-hs-tax'));
        syncHometownForm();
        renderHometown();
        saveState();
      });
    });
    el.shareHometown.addEventListener('click', function () { doShare(hometownShareText()); });
  }

  function bindAllEvents() {
    el.alSalary.addEventListener('input', function () {
      state.all.salary = readNum(el.alSalary, state.all.salary, L.salary.min, L.salary.max);
      el.alSalaryBadge.textContent = wonShort(state.all.salary);
      renderAll();
      saveState();
    });
    [['political', el.alPolitical], ['hometown', el.alHometown], ['special', el.alSpecial],
      ['general', el.alGeneral], ['religion', el.alReligion]].forEach(function (pair) {
      var key = pair[0];
      var input = pair[1];
      input.addEventListener('input', function () {
        var lim = key === 'hometown' ? L.amount : L.money;
        state.all[key] = readNum(input, state.all[key], lim.min, lim.max);
        el['al' + key.charAt(0).toUpperCase() + key.slice(1) + 'Badge'].textContent = wonShort(state.all[key]);
        renderAll();
        saveState();
      });
    });
    bindGroup(el.alDisasterGroup, 'al-disaster', function (v) {
      state.all.disaster = v === '1';
      syncAllForm();
      renderAll();
      saveState();
    });
    $$('.chips [data-al-salary]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.all.salary = Number(b.getAttribute('data-al-salary'));
        syncAllForm();
        renderAll();
        saveState();
      });
    });
    el.shareAll.addEventListener('click', function () { doShare(allShareText()); });
  }

  function bindZeroEvents() {
    el.ztIncomeTax.addEventListener('input', function () {
      state.zero.incomeTax = readNum(el.ztIncomeTax, state.zero.incomeTax, L.tax.min, L.tax.max);
      el.ztIncomeTaxBadge.textContent = wonShort(state.zero.incomeTax);
      renderZero();
      saveState();
    });
    [['other', el.ztOther], ['hometown', el.ztHometown], ['political', el.ztPolitical], ['general', el.ztGeneral]]
      .forEach(function (pair) {
        var key = pair[0];
        var input = pair[1];
        input.addEventListener('input', function () {
          var lim = key === 'hometown' ? L.amount : (key === 'other' ? L.tax : L.money);
          state.zero[key] = readNum(input, state.zero[key], lim.min, lim.max);
          el['zt' + key.charAt(0).toUpperCase() + key.slice(1) + 'Badge'].textContent = wonShort(state.zero[key]);
          renderZero();
          saveState();
        });
      });
    $$('.chips [data-zt-income-tax]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.zero.incomeTax = Number(b.getAttribute('data-zt-income-tax'));
        syncZeroForm();
        renderZero();
        saveState();
      });
    });
    el.shareZero.addEventListener('click', function () { doShare(zeroShareText()); });
  }

  function refresh() {
    syncHometownForm();
    syncAllForm();
    syncZeroForm();
    renderHometown();
    renderAll();
    renderZero();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    if (el.dataDate && S.RULES.verifiedAt) el.dataDate.textContent = S.RULES.verifiedAt;
    if (el.appVersion && CFG.version) el.appVersion.textContent = CFG.version;
    initTabs();
    refresh();
    bindHometownEvents();
    bindAllEvents();
    bindZeroEvents();
    bindCheckGroup('#gdList', el.gdBar, el.gdCount, el.gdReset, function () { toast('체크를 모두 지웠습니다.'); });
    bindCheckGroup('#ztList', null, null, null, null);
    initTheme();
    initAds();
    initPromo();
    initWello();
    initInstall();
    initSW();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
