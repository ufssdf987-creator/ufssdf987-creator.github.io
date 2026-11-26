/*!
 * app.js — 2026 신용·체크카드 황금비율 & 소득공제 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.CTCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'ctx.state.v1';
  var THEME_KEY = 'ctx.theme';
  var TABS = ['basic', 'golden', 'couple', 'guide'];

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
    var n = Number(v) || 0;
    var s = (n * 100).toFixed(d).replace(/\.0+$/, '');
    return s + '%';
  }

  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  function meta(key) {
    for (var i = 0; i < S.CATS.length; i++) {
      if (S.CATS[i].key === key) return S.CATS[i];
    }
    return null;
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'basic',
    salary: 50000000,
    children: 0,
    rate: 0,
    basic: { credit: 12000000, check: 3500000, market: 800000, transit: 1200000, culture: 400000 },
    golden: { credit: 12000000, check: 3000000, market: 700000, transit: 1100000, culture: 350000, budget: 2000000 },
    couple: { salaryA: 60000000, salaryB: 35000000, spend: 24000000, creditShare: 60, children: 0, claim: 'a' },
    checks: {}
  };

  var L = S.LIMITS;

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    var s = parseFloat(raw.salary);
    if (isFinite(s) && s >= 0) state.salary = clamp(s, L.salary.min, L.salary.max);
    var k = parseFloat(raw.children);
    if (isFinite(k) && k >= 0) state.children = clamp(Math.floor(k), 0, 5);
    var rt = parseFloat(raw.rate);
    if (isFinite(rt) && rt >= 0) state.rate = rt;

    ['basic', 'golden'].forEach(function (group) {
      var src = raw[group];
      if (!src || typeof src !== 'object') return;
      S.KEYS.forEach(function (key) {
        var v = parseFloat(src[key]);
        if (isFinite(v) && v >= 0) state[group][key] = clamp(v, L.money.min, L.money.max);
      });
    });
    var b = parseFloat(raw.golden && raw.golden.budget);
    if (isFinite(b) && b >= 0) state.golden.budget = clamp(b, 0, L.money.max);

    var c = raw.couple;
    if (c && typeof c === 'object') {
      [['salaryA', L.salary], ['salaryB', L.salary], ['spend', L.money]].forEach(function (pair) {
        var v = parseFloat(c[pair[0]]);
        if (isFinite(v) && v >= 0) state.couple[pair[0]] = clamp(v, pair[1].min, pair[1].max);
      });
      var sh = parseFloat(c.creditShare);
      if (isFinite(sh) && sh >= 0) state.couple.creditShare = clamp(sh, 0, 100);
      var ck = parseFloat(c.children);
      if (isFinite(ck) && ck >= 0) state.couple.children = clamp(Math.floor(ck), 0, 5);
      if (c.claim === 'a' || c.claim === 'b') state.couple.claim = c.claim;
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
    el.tabBasic = $('#tabBasic');
    el.tabGolden = $('#tabGolden');
    el.tabCouple = $('#tabCouple');
    el.tabGuide = $('#tabGuide');
    el.panelBasic = $('#panelBasic');
    el.panelGolden = $('#panelGolden');
    el.panelCouple = $('#panelCouple');
    el.panelGuide = $('#panelGuide');

    /* 탭 1 */
    el.bsSalary = $('#bsSalary');
    el.bsSalaryBadge = $('#bsSalaryBadge');
    el.bsKidsGroup = $('#bsKidsGroup');
    el.bsRateSel = $('#bsRateSel');
    el.bsRateHelp = $('#bsRateHelp');
    el.bsThresholdHelp = $('#bsThresholdHelp');
    el.bsCredit = $('#bsCredit');
    el.bsCreditBadge = $('#bsCreditBadge');
    el.bsCheck = $('#bsCheck');
    el.bsCheckBadge = $('#bsCheckBadge');
    el.bsMarket = $('#bsMarket');
    el.bsMarketBadge = $('#bsMarketBadge');
    el.bsTransit = $('#bsTransit');
    el.bsTransitBadge = $('#bsTransitBadge');
    el.bsCulture = $('#bsCulture');
    el.bsCultureBadge = $('#bsCultureBadge');
    el.bsCultureHelp = $('#bsCultureHelp');
    el.bsDeduction = $('#bsDeduction');
    el.bsSub = $('#bsSub');
    el.bsVerdict = $('#bsVerdict');
    el.bsRefund = $('#bsRefund');
    el.bsRows = $('#bsRows');
    el.bsStatSpend = $('#bsStatSpend');
    el.bsStatThreshold = $('#bsStatThreshold');
    el.bsStatGap = $('#bsStatGap');
    el.bsStatRoom = $('#bsStatRoom');
    el.bsMeterFill = $('#bsMeterFill');
    el.bsMeterLeft = $('#bsMeterLeft');
    el.bsMeterRight = $('#bsMeterRight');
    el.bsNextTitle = $('#bsNextTitle');
    el.bsNext = $('#bsNext');
    el.bsInsight = $('#bsInsight');
    el.bsRateTable = $('#bsRateTable');
    el.bsLimitTable = $('#bsLimitTable');
    el.shareBasic = $('#shareBasic');

    /* 탭 2 */
    el.gdSalary = $('#gdSalary');
    el.gdSalaryBadge = $('#gdSalaryBadge');
    el.gdKidsGroup = $('#gdKidsGroup');
    el.gdCredit = $('#gdCredit');
    el.gdCreditBadge = $('#gdCreditBadge');
    el.gdCheck = $('#gdCheck');
    el.gdCheckBadge = $('#gdCheckBadge');
    el.gdMarket = $('#gdMarket');
    el.gdMarketBadge = $('#gdMarketBadge');
    el.gdTransit = $('#gdTransit');
    el.gdTransitBadge = $('#gdTransitBadge');
    el.gdCulture = $('#gdCulture');
    el.gdCultureBadge = $('#gdCultureBadge');
    el.gdBudget = $('#gdBudget');
    el.gdBudgetBadge = $('#gdBudgetBadge');
    el.gdHeadline = $('#gdHeadline');
    el.gdSub = $('#gdSub');
    el.gdVerdict = $('#gdVerdict');
    el.gdRows = $('#gdRows');
    el.gdStatBefore = $('#gdStatBefore');
    el.gdStatGap = $('#gdStatGap');
    el.gdStatRoom = $('#gdStatRoom');
    el.gdStatMax = $('#gdStatMax');
    el.gdSteps = $('#gdSteps');
    el.gdNextTitle = $('#gdNextTitle');
    el.gdInsight = $('#gdInsight');
    el.gdAllocTable = $('#gdAllocTable');
    el.shareGolden = $('#shareGolden');

    /* 탭 3 */
    el.cpSalaryA = $('#cpSalaryA');
    el.cpSalaryABadge = $('#cpSalaryABadge');
    el.cpSalaryB = $('#cpSalaryB');
    el.cpSalaryBBadge = $('#cpSalaryBBadge');
    el.cpSpend = $('#cpSpend');
    el.cpSpendBadge = $('#cpSpendBadge');
    el.cpCreditShare = $('#cpCreditShare');
    el.cpCreditShareBadge = $('#cpCreditShareBadge');
    el.cpKidsGroup = $('#cpKidsGroup');
    el.cpClaimGroup = $('#cpClaimGroup');
    el.cpGain = $('#cpGain');
    el.cpBestLabel = $('#cpBestLabel');
    el.cpSub = $('#cpSub');
    el.cpVerdict = $('#cpVerdict');
    el.cpBestTitle = $('#cpBestTitle');
    el.cpBestText = $('#cpBestText');
    el.cpRows = $('#cpRows');
    el.cpStatA = $('#cpStatA');
    el.cpStatB = $('#cpStatB');
    el.cpStatGapA = $('#cpStatGapA');
    el.cpStatGapB = $('#cpStatGapB');
    el.cpInsight = $('#cpInsight');
    el.cpTable = $('#cpTable');
    el.shareCouple = $('#shareCouple');
    el.cpCheckReset = $('#cpCheckReset');

    /* 탭 4 */
    el.exBar = $('#exBar');
    el.exCount = $('#exCount');
    el.exReset = $('#exReset');

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
    if (TABS.indexOf(name) < 0) name = 'basic';
    state.tab = name;
    var map = {
      basic: [el.tabBasic, el.panelBasic],
      golden: [el.tabGolden, el.panelGolden],
      couple: [el.tabCouple, el.panelCouple],
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
    el.tabBasic.addEventListener('click', function () { setTab('basic'); });
    el.tabGolden.addEventListener('click', function () { setTab('golden'); });
    el.tabCouple.addEventListener('click', function () { setTab('couple'); });
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
    setTab(TABS.indexOf(hash) >= 0 ? hash : (state.tab || 'basic'));
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

  function dependentsFor(kids) {
    return 1 + Math.max(0, kids || 0);
  }

  function rateText(rate) {
    return pct(rate) + ' (지방세 포함 ' + pct(rate * 1.1) + ')';
  }

  /* ── 탭 1: 문턱·공제액 ───────────────────────────────── */
  function basicInput() {
    return {
      salary: state.salary,
      children: state.children,
      credit: state.basic.credit,
      check: state.basic.check,
      market: state.basic.market,
      transit: state.basic.transit,
      culture: state.basic.culture,
      dependents: dependentsFor(state.children),
      rate: state.rate
    };
  }

  function syncBasicForm() {
    el.bsSalary.value = state.salary;
    el.bsSalaryBadge.textContent = wonShort(state.salary);
    el.bsCredit.value = state.basic.credit;
    el.bsCheck.value = state.basic.check;
    el.bsMarket.value = state.basic.market;
    el.bsTransit.value = state.basic.transit;
    el.bsCulture.value = state.basic.culture;
    el.bsCreditBadge.textContent = wonShort(state.basic.credit);
    el.bsCheckBadge.textContent = wonShort(state.basic.check);
    el.bsMarketBadge.textContent = wonShort(state.basic.market);
    el.bsTransitBadge.textContent = wonShort(state.basic.transit);
    el.bsCultureBadge.textContent = wonShort(state.basic.culture);
    el.bsRateSel.value = String(state.rate);
    syncGroup(el.bsKidsGroup, 'bs-kids', state.children >= 2 ? 2 : state.children);
    ['credit', 'check', 'market', 'transit'].forEach(function (k) {
      syncChips('bs-' + k, state.basic[k]);
    });
    syncChips('bs-salary', state.salary);
  }

  function renderBasic() {
    var input = basicInput();
    var d = S.cardDeduction(input);
    var b = S.benefit(input.salary, input.dependents, d.final, state.rate);
    var limits = d.limits;

    el.bsThresholdHelp.innerHTML = '총급여의 25%인 <strong>' + won(limits.threshold) + '원</strong>을 넘겨 쓴 금액부터 공제가 시작됩니다.';

    if (state.rate) {
      el.bsRateHelp.textContent = '선택한 한계세율 ' + rateText(b.rate) + '을 적용했습니다. 공제 100만원이면 세금이 약 ' +
        won(1000000 * b.rate * 1.1) + '원 줄어듭니다.';
    } else {
      el.bsRateHelp.textContent = '자동 추정: 과세표준 약 ' + won(b.taxable) + '원 → 한계세율 ' + rateText(b.rate) +
        '. 근로소득공제·국민연금(4.75%)·기본공제(본인과 자녀 1인 150만원)만 반영한 값입니다.';
    }

    if (limits.over70 && input.culture > 0) {
      el.bsCultureHelp.innerHTML = '총급여가 7천만원을 넘어 문화체육 30%가 적용되지 않습니다. 입력한 ' +
        won(input.culture) + '원은 <strong>신용카드 15%</strong>로 계산했습니다.';
      el.bsCultureHelp.classList.add('is-warn-text');
    } else {
      el.bsCultureHelp.innerHTML = '도서·신문 구독·공연·영화·박물관·미술관·수영장·체력단련장 <strong>시설이용료</strong>는 30%입니다. 강습비·회원권은 빠집니다.';
      el.bsCultureHelp.classList.remove('is-warn-text');
    }

    el.bsDeduction.textContent = won(d.final);
    el.bsSub.textContent = wonShort(input.salary) + ' · 문턱 ' + wonShort(limits.threshold) +
      (d.passed ? ' · 초과 ' + wonShort(d.overThreshold) : ' · 미달 ' + wonShort(d.gap));
    el.bsRefund.textContent = won(b.total) + '원';

    if (!d.passed) {
      setBadge(el.bsVerdict, '문턱 미달', 3);
    } else if (d.reachedAdd) {
      setBadge(el.bsVerdict, '한도 도달', 1);
    } else if (d.reachedBase) {
      setBadge(el.bsVerdict, '추가한도 남음', 1);
    } else {
      setBadge(el.bsVerdict, '문턱 통과', 2);
    }

    var html = '';
    S.CATS.forEach(function (cat) {
      var key = cat.key;
      var used = d.used[key] || 0;
      var ded = d.ded[key] || 0;
      var spent = key === 'culture' ? d.spend.culture : d.spend[key];
      var small = used > 0
        ? '문턱 차감 ' + won(used) + '원'
        : (spent > 0 ? pct(cat.rate) + ' 적용' : '사용액 없음');
      html += row(cat.short, won(ded) + '원', small, ded === 0 ? 'is-dim' : '');
    });
    html += row('소득공제 합계', won(d.raw) + '원', '한도 적용 전', d.raw > 0 ? '' : 'is-dim');
    html += row('기본한도 적용', won(d.base) + '원', '한도 ' + won(limits.baseLimit) + '원', 'is-dim');
    html += row('추가한도 적용', '+' + won(d.additional) + '원', '한도 ' + won(limits.addLimit) + '원', 'is-dim');
    html += row('최종 소득공제', won(d.final) + '원', '한계세율 ' + pct(b.rate), 'total');
    el.bsRows.innerHTML = html;

    el.bsStatSpend.textContent = won(d.spend.total) + '원';
    el.bsStatThreshold.textContent = won(limits.threshold) + '원';
    el.bsStatGap.textContent = d.passed ? '통과 +' + wonShort(d.overThreshold) : won(d.gap) + '원';
    el.bsStatRoom.textContent = won(Math.max(0, d.maxDeduction - d.final)) + '원';

    var ratio = d.maxDeduction > 0 ? Math.min(1, d.final / d.maxDeduction) : 0;
    el.bsMeterFill.style.width = (ratio * 100).toFixed(1) + '%';
    el.bsMeterFill.setAttribute('data-tone', d.reachedAdd ? 'full' : (!d.passed ? 'warn' : ''));
    el.bsMeterLeft.textContent = '한도 ' + Math.round(ratio * 100) + '%';
    el.bsMeterRight.textContent = '최대 ' + wonShort(d.maxDeduction);

    /* 다음에 할 일 */
    var nextTitle = '다음에 할 일';
    var next = '';
    if (!d.passed) {
      nextTitle = '아직 문턱 전';
      next = '12월 31일까지 <strong>' + won(d.gap) + '원</strong>을 더 써야 문턱을 넘습니다. 넘지 못하면 어떤 카드를 써도 공제는 0원이니, ' +
        '공제 대신 카드 혜택(실적·포인트·할인)이 큰 쪽을 고르세요.';
    } else if (d.baseRoom > 0) {
      nextTitle = '기본한도가 남았습니다';
      next = '기본한도 <strong>' + won(d.baseRoom) + '원</strong>이 남았습니다. 체크·현금영수증으로 <strong>' +
        won(S.spendToFill(d.baseRoom, S.RULES.checkRate)) + '원</strong>을 더 쓰면 채워집니다. 같은 금액을 신용카드로 쓰면 ' +
        won(S.spendToFill(d.baseRoom, S.RULES.creditRate)) + '원이 필요합니다.';
    } else if (d.addRoom > 0) {
      nextTitle = '추가한도가 남았습니다';
      next = '기본한도가 찼습니다. 이제는 <strong>전통시장·대중교통</strong>이 유리합니다. ' +
        won(S.spendToFill(d.addRoom, S.RULES.marketRate)) + '원을 더 쓰면 추가한도 <strong>' + won(d.addRoom) +
        '원</strong>이 붙고, 세금은 약 ' + won(d.addRoom * b.rate * 1.1) + '원 더 줄어듭니다.';
    } else {
      nextTitle = '한도를 모두 채웠습니다';
      next = '올해 카드 공제는 최대치입니다. 12월에 더 써도 공제는 늘지 않으니, 남은 지출은 카드 실적·포인트 혜택으로 고르세요.';
    }
    el.bsNextTitle.textContent = nextTitle;
    el.bsNext.innerHTML = next;

    /* 인사이트 */
    var ins;
    if (!d.passed) {
      var need = S.spendToFill(d.gap, 1);
      ins = '문턱 ' + won(d.gap) + '원이 남았습니다. 여기에 ' + won(need) + '원을 더 써도 공제는 0원입니다. 문턱을 넘길 계획이 없다면 체크카드로 바꿀 이유도 없습니다.';
      setInsight(el.bsInsight, ins, 'is-warn');
    } else {
      var parts = [];
      if (d.used.check > 0 || d.used.culture > 0) {
        parts.push('신용카드 사용액이 문턱을 다 채우지 못해 체크·현금과 문화체육에서 ' +
          won(d.used.check + d.used.culture) + '원이 문턱에 깎였습니다.');
      } else if (d.spend.credit >= d.threshold) {
        parts.push('신용카드로 문턱을 모두 채워, 체크·현금 사용분이 전액 30%로 인정됩니다.');
      }
      if (d.reachedBase) {
        parts.push('기본한도는 찼습니다' + (d.addRoom > 0 ? '. 남은 지출은 전통시장·대중교통으로 옮기면 40%가 붙습니다.' : '. 더 써도 공제는 늘지 않습니다.'));
      } else {
        parts.push('기본한도가 ' + won(d.baseRoom) + '원 남아 체크·현금 지출이 그대로 공제로 쌓입니다.');
      }
      if (b.capped) {
        parts.push('과세표준(' + won(b.taxable) + '원)보다 공제가 커서 실제 절세는 ' + won(b.applied) + '원분까지만 반영됩니다.');
      }
      setInsight(el.bsInsight, parts.join(' '), 'is-ok');
    }

    /* 공제 내역 표 */
    var tbody = '';
    S.CATS.forEach(function (cat) {
      var spentKey = cat.key;
      tbody += '<tr>' +
        '<th scope="row">' + cat.short + '</th>' +
        '<td>' + won(d.spend[spentKey]) + '</td>' +
        '<td>' + pct(cat.rate, 0) + '</td>' +
        '<td>' + won(d.ded[cat.key]) + '</td></tr>';
    });
    if (d.cultureTreatedAsCredit > 0) {
      tbody += '<tr><th scope="row">문화체육</th><td>' + won(d.cultureTreatedAsCredit) + '</td><td>15%</td><td>' +
        won(d.cultureTreatedAsCredit * S.RULES.creditRate) + '</td></tr>';
    }
    tbody += '<tr><th scope="row">합계</th><td>' + won(d.spend.total) + '</td><td>—</td><td><strong>' + won(d.final) + '</strong></td></tr>';
    $('tbody', el.bsRateTable).innerHTML = tbody;

    /* 한도 표 */
    var limitRows = '';
    [
      { label: '7천만원 이하', under: true, add: S.RULES.addLimit.under },
      { label: '7천만원 초과', under: false, add: S.RULES.addLimit.over }
    ].forEach(function (r) {
      var set = r.under ? S.RULES.baseLimit.under : S.RULES.baseLimit.over;
      var now = r.under === !limits.over70;
      limitRows += '<tr' + (now ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + r.label + '</th>' +
        '<td>' + won(set.none) + '</td><td>' + won(set.one) + '</td><td>' + won(set.many) + '</td>' +
        '<td>+' + won(r.add) + '</td></tr>';
    });
    $('tbody', el.bsLimitTable).innerHTML = limitRows;
  }

  function basicShareText() {
    var input = basicInput();
    var d = S.cardDeduction(input);
    var b = S.benefit(input.salary, input.dependents, d.final, state.rate);
    return '[카드 소득공제 2026]\n' +
      '총급여 ' + wonShort(input.salary) + ' · 문턱 ' + wonShort(d.threshold) + '\n' +
      '카드·현금 사용 ' + wonShort(d.spend.total) + ' (' + (d.passed ? '문턱 통과' : '문턱 미달') + ')\n' +
      '소득공제 ' + won(d.final) + '원 · 예상 절세 ' + won(b.total) + '원 (한계세율 ' + pct(b.rate) + ', 지방세 포함)\n' +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/card-tax/');
  }

  /* ── 탭 2: 12월 황금비율 ─────────────────────────────── */
  function goldenInput() {
    return {
      salary: state.salary,
      children: state.children,
      credit: state.golden.credit,
      check: state.golden.check,
      market: state.golden.market,
      transit: state.golden.transit,
      culture: state.golden.culture,
      dependents: dependentsFor(state.children),
      rate: state.rate
    };
  }

  function syncGoldenForm() {
    el.gdSalary.value = state.salary;
    el.gdSalaryBadge.textContent = wonShort(state.salary);
    el.gdCredit.value = state.golden.credit;
    el.gdCheck.value = state.golden.check;
    el.gdMarket.value = state.golden.market;
    el.gdTransit.value = state.golden.transit;
    el.gdCulture.value = state.golden.culture;
    el.gdBudget.value = state.golden.budget;
    el.gdCreditBadge.textContent = wonShort(state.golden.credit);
    el.gdCheckBadge.textContent = wonShort(state.golden.check);
    el.gdMarketBadge.textContent = wonShort(state.golden.market);
    el.gdTransitBadge.textContent = wonShort(state.golden.transit);
    el.gdCultureBadge.textContent = wonShort(state.golden.culture);
    el.gdBudgetBadge.textContent = wonShort(state.golden.budget);
    syncGroup(el.gdKidsGroup, 'gd-kids', state.children >= 2 ? 2 : state.children);
    syncChips('gd-budget', state.golden.budget);
    syncChips('gd-salary', state.salary);
  }

  function renderGolden() {
    var input = goldenInput();
    var plan = S.goldenPlan(input, state.golden.budget);
    var before = plan.before;
    var credit = plan.credit;
    var golden = plan.golden;
    var best = plan.best;
    var delta = golden.refund - credit.refund;
    var deltaDed = golden.deduction - credit.deduction;

    el.gdHeadline.textContent = won(Math.max(0, delta));
    el.gdSub.textContent = '12월 ' + wonShort(plan.budget) + ' · 전액 신용카드 대비 · 공제 ' +
      (deltaDed >= 0 ? '+' : '') + won(deltaDed) + '원';

    if (before.gap >= plan.budget) {
      setBadge(el.gdVerdict, '문턱 미달', 3);
    } else if (delta <= 0) {
      setBadge(el.gdVerdict, '차이 없음', 2);
    } else {
      setBadge(el.gdVerdict, '체크 유리', 1);
    }

    var maxDed = Math.max.apply(null, plan.scenarios.map(function (s) { return s.deduction; })) || 1;
    var rows = '';
    plan.scenarios.forEach(function (s) {
      var width = Math.max(2, s.deduction / maxDed * 100);
      var cls = [];
      if (s.key === 'golden') cls.push('is-best');
      if (s.key === 'credit') cls.push('is-min');
      var note = '추가 공제 +' + won(s.added) + '원 · 누적 절세 ' + won(s.refund) + '원';
      rows += '<div class="compare-row' + (cls.length ? ' ' + cls.join(' ') : '') + '" data-who="' + s.key + '">' +
        '<div class="compare-top"><span class="compare-name">' + s.name + '</span>' +
        '<strong>' + (s.refund >= credit.refund ? '+' : '') + won(s.refund - credit.refund) + '원</strong></div>' +
        '<div class="compare-bar"><i style="width:' + width.toFixed(1) + '%"></i></div>' +
        '<p class="compare-note">' + note + ' · ' + s.note + '</p></div>';
    });
    el.gdRows.innerHTML = rows;

    el.gdStatBefore.textContent = won(before.final) + '원';
    el.gdStatGap.textContent = before.passed ? '통과' : won(before.gap) + '원';
    el.gdStatRoom.textContent = won(Math.max(0, before.maxDeduction - before.final)) + '원';
    el.gdStatMax.textContent = won(before.maxDeduction) + '원';

    /* 사용 순서 */
    var steps = [];
    var gap = before.gap;
    if (gap > 0) {
      steps.push({
        title: '① 문턱까지는 신용카드 ' + won(Math.min(gap, plan.budget)) + '원',
        body: gap > plan.budget
          ? '12월 지출 ' + wonShort(plan.budget) + '원을 모두 써도 문턱까지 ' + won(gap - plan.budget) + '원이 남습니다. 공제는 0원이니 카드 혜택으로 고르세요.'
          : '문턱을 넘기 전까지는 공제가 0원입니다. 실적·포인트가 큰 신용카드를 쓰세요.'
      });
    } else {
      steps.push({
        title: '① 문턱은 이미 넘었습니다',
        body: '이제부터 쓴 돈에는 바로 공제율이 붙습니다.'
      });
    }
    if (before.baseRoom > 0) {
      var checkNeed = S.spendToFill(before.baseRoom, S.RULES.checkRate);
      steps.push({
        title: '② 그다음은 체크카드·현금영수증',
        body: '기본한도 ' + won(before.baseRoom) + '원을 채우는 데 ' + won(checkNeed) + '원이 필요합니다. 같은 금액을 신용카드로 쓰면 ' +
          won(S.spendToFill(before.baseRoom, S.RULES.creditRate)) + '원이 듭니다.'
      });
    } else {
      steps.push({
        title: '② 기본한도는 이미 찼습니다',
        body: '일반 사용분은 더 써도 공제가 늘지 않습니다.'
      });
    }
    if (before.addRoom > 0) {
      steps.push({
        title: '③ 남은 지출은 전통시장·대중교통으로',
        body: '추가한도 ' + won(before.addRoom) + '원이 남았습니다. 40% 공제에 추가한도까지 붙어 마지막 100만원의 효율이 가장 좋습니다.'
      });
    } else {
      steps.push({
        title: '③ 추가한도까지 찼습니다',
        body: '올해 카드 공제는 최대치입니다. 남은 지출은 카드 혜택으로 판단하세요.'
      });
    }
    el.gdSteps.innerHTML = steps.map(function (s) {
      return '<li><strong>' + s.title + '</strong><span>' + s.body + '</span></li>';
    }).join('');

    /* 인사이트 */
    var perWon = plan.budget > 0 ? (Math.max(0, delta) / plan.budget * 100) : 0;
    if (before.gap >= plan.budget && plan.budget > 0) {
      setInsight(el.gdInsight, '12월 지출 ' + wonShort(plan.budget) + '원을 모두 써도 문턱까지 ' + won(before.gap - plan.budget) +
        '원이 남습니다. 이 구간에서는 결제수단을 바꿔도 공제가 0원이니 카드 혜택만 비교하세요.', 'is-warn');
    } else if (delta <= 0) {
      setInsight(el.gdInsight, '지금 조건에서는 12월 결제수단을 바꿔도 세금 차이가 없습니다. 이미 기본한도를 채웠거나, 쓸 금액이 모두 문턱 안쪽이기 때문입니다.', '');
    } else {
      setInsight(el.gdInsight, '12월 ' + wonShort(plan.budget) + '원을 전액 신용카드 대신 황금비율로 쓰면 공제가 ' + won(deltaDed) +
        '원 늘고, 세금은 약 ' + won(delta) + '원 줄어듭니다. 결제금액의 ' + perWon.toFixed(2) + '%입니다.' +
        (best.deduction > golden.deduction ? ' 전통시장·대중교통까지 쓸 수 있다면 최대 ' + won(best.deduction - before.final) + '원까지 공제가 늘어납니다.' : ''),
        'is-ok');
    }

    /* 배분 표 */
    var tbody = '';
    plan.scenarios.forEach(function (s) {
      var a = s.alloc || {};
      tbody += '<tr' + (s.key === 'golden' ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + s.name.replace('황금비율 (문턱 신용 → 체크)', '황금비율').replace('전액 체크·현금영수증', '전액 체크·현금') + '</th>' +
        '<td>' + wonShort(a.credit || 0) + '</td>' +
        '<td>' + wonShort(a.check || 0) + '</td>' +
        '<td>' + wonShort((a.market || 0) + (a.transit || 0) + (a.culture || 0)) + '</td>' +
        '<td><strong>' + wonShort(s.added) + '</strong></td></tr>';
    });
    $('tbody', el.gdAllocTable).innerHTML = tbody;
  }

  function goldenShareText() {
    var input = goldenInput();
    var plan = S.goldenPlan(input, state.golden.budget);
    var delta = Math.max(0, plan.golden.refund - plan.credit.refund);
    return '[12월 카드 황금비율]\n' +
      '12월 지출 ' + wonShort(plan.budget) + ' · 지금까지 사용 ' + wonShort(plan.before.spend.total) + '\n' +
      (plan.before.passed ? '문턱 통과 · ' : '문턱까지 ' + wonShort(plan.before.gap) + ' · ') +
      '현재 공제 ' + won(plan.before.final) + '원\n' +
      '황금비율(문턱 신용 → 체크)로 쓰면 +' + won(delta) + '원 더 환급\n' +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/card-tax/');
  }

  /* ── 탭 3: 부부 몰아주기 ─────────────────────────────── */
  function coupleInput() {
    return {
      aSalary: state.couple.salaryA,
      bSalary: state.couple.salaryB,
      spend: state.couple.spend,
      creditShare: state.couple.creditShare,
      children: state.couple.children,
      claim: state.couple.claim,
      dependents: dependentsFor(state.couple.children)
    };
  }

  function syncCoupleForm() {
    el.cpSalaryA.value = state.couple.salaryA;
    el.cpSalaryB.value = state.couple.salaryB;
    el.cpSpend.value = state.couple.spend;
    el.cpCreditShare.value = state.couple.creditShare;
    el.cpSalaryABadge.textContent = wonShort(state.couple.salaryA);
    el.cpSalaryBBadge.textContent = wonShort(state.couple.salaryB);
    el.cpSpendBadge.textContent = wonShort(state.couple.spend);
    el.cpCreditShareBadge.textContent = state.couple.creditShare + '%';
    syncGroup(el.cpKidsGroup, 'cp-kids', state.couple.children >= 2 ? 2 : state.couple.children);
    syncGroup(el.cpClaimGroup, 'cp-claim', state.couple.claim);
    syncChips('cp-spend', state.couple.spend);
    syncChips('cp-share', state.couple.creditShare);
  }

  function renderCouple() {
    var input = coupleInput();
    var plan = S.couplePlan(input);
    var best = plan.best;
    var allA = plan.allA;
    var gain = plan.gain;

    var adv = 'A';
    if (best.amountB > best.amountA) adv = 'B';
    else if (best.amountA === best.amountB) adv = '';

    el.cpGain.textContent = won(Math.max(0, gain));
    el.cpBestLabel.textContent = gain > 0
      ? 'A에게 몰아줄 때보다 더 돌려받는 세금'
      : 'A에게 몰아주는 것이 이미 최적';
    el.cpSub.textContent = 'A ' + wonShort(best.amountA) + ' · B ' + wonShort(best.amountB) +
      ' 배분 · 절세 합계 ' + won(best.refund) + '원';

    if (gain <= 0) {
      setBadge(el.cpVerdict, 'A 유리', 2);
    } else if (adv) {
      setBadge(el.cpVerdict, adv + ' 유리', 1);
    } else {
      setBadge(el.cpVerdict, '차이 없음', 2);
    }

    el.cpBestTitle.textContent = '추천 배분';
    var bestText;
    if (best.amountA === 0) {
      bestText = 'B 카드로 <strong>' + won(best.amountB) + '원</strong>을 몰아주세요. B의 25% 문턱이 낮아 공제가 더 붙습니다. ' +
        '예상 절세 ' + won(best.refund) + '원.';
    } else if (best.amountB === 0) {
      bestText = 'A 카드로 <strong>' + won(best.amountA) + '원</strong>을 쓰는 것이 가장 유리합니다. 예상 절세 ' + won(best.refund) + '원.';
    } else {
      bestText = 'A <strong>' + won(best.amountA) + '원</strong> · B <strong>' + won(best.amountB) + '원</strong>으로 나눠 쓰세요. ' +
        '예상 절세 ' + won(best.refund) + '원.';
    }
    el.cpBestText.innerHTML = bestText;

    var maxRefund = Math.max(allA.refund, plan.allB.refund, plan.half.refund, best.refund) || 1;
    var rows = '';
    plan.scenarios.forEach(function (s) {
      var cls = [];
      if (s.key === 'best') cls.push('is-best');
      if (s.key === 'a') cls.push('is-min');
      var width = Math.max(2, s.data.refund / maxRefund * 100);
      rows += '<div class="compare-row' + (cls.length ? ' ' + cls.join(' ') : '') + '" data-who="' + (s.key === 'a' ? 'credit' : (s.key === 'b' ? 'market' : (s.key === 'best' ? 'best' : 'golden'))) + '">' +
        '<div class="compare-top"><span class="compare-name">' + s.name + '</span>' +
        '<strong>' + won(s.data.refund) + '원</strong></div>' +
        '<div class="compare-bar"><i style="width:' + width.toFixed(1) + '%"></i></div>' +
        '<p class="compare-note">A ' + wonShort(s.data.amountA) + ' / B ' + wonShort(s.data.amountB) +
        ' · 공제 ' + won(s.data.deduction) + '원 · ' + (s.delta >= 0 ? '+' : '') + won(s.delta) + '원</p></div>';
    });
    el.cpRows.innerHTML = rows;

    el.cpStatA.textContent = won(best.refundA) + '원';
    el.cpStatB.textContent = won(best.refundB) + '원';
    el.cpStatGapA.textContent = best.passedA ? '통과' : won(best.gapA) + '원';
    el.cpStatGapB.textContent = best.passedB ? '통과' : won(best.gapB) + '원';

    /* 인사이트 */
    var thrA = S.cardLimits(input.aSalary, input.claim === 'a' ? input.children : 0).threshold;
    var thrB = S.cardLimits(input.bSalary, input.claim === 'b' ? input.children : 0).threshold;
    var ins;
    if (gain <= 0) {
      ins = 'A에게 몰아주는 것이 가장 유리합니다. A의 한계세율이 높고, 나눠 쓰면 두 사람 모두 문턱을 넘지 못하는 구간이 생기기 때문입니다.';
    } else if (adv === 'B') {
      ins = 'B에게 ' + wonShort(best.amountB) + '원을 몰아주면 A에게 몰아줄 때보다 세금을 ' + won(gain) +
        '원 더 돌려받습니다. B의 25% 문턱은 ' + won(thrB) + '원으로 A(' + won(thrA) + '원)보다 낮아, 같은 지출로도 공제가 더 붙습니다.';
    } else if (adv === 'A') {
      ins = 'A에게 ' + wonShort(best.amountA) + '원, B에게 ' + wonShort(best.amountB) + '원을 나눠 쓰면 세금을 ' + won(gain) +
        '원 더 돌려받습니다. 한쪽에 몰면 그 사람의 한도에서 잘리고, 다른 쪽은 문턱을 못 넘기기 때문입니다.';
    } else {
      ins = '두 사람의 총급여가 비슷해 어느 쪽에 몰아줘도 차이가 없습니다. 한계세율이 같다면 카드 혜택으로 고르세요.';
    }
    setInsight(el.cpInsight, ins, gain > 0 ? 'is-ok' : '');

    /* 배분 곡선 표 */
    var tbody = '';
    plan.curve.forEach(function (c) {
      var share = plan.spend > 0 ? Math.round(c.amountA / plan.spend * 100) : 0;
      tbody += '<tr><th scope="row">' + share + ' : ' + (100 - share) + '</th>' +
        '<td>' + won(c.dedA) + '</td><td>' + won(c.dedB) + '</td>' +
        '<td><strong>' + won(c.refund) + '</strong></td></tr>';
    });
    $('tbody', el.cpTable).innerHTML = tbody;
  }

  function coupleShareText() {
    var plan = S.couplePlan(coupleInput());
    return '[부부 카드 몰아주기]\n' +
      'A ' + wonShort(state.couple.salaryA) + ' · B ' + wonShort(state.couple.salaryB) + ' · 카드 ' + wonShort(plan.spend) + '\n' +
      '추천: A ' + wonShort(plan.best.amountA) + ' / B ' + wonShort(plan.best.amountB) +
      ' → 절세 ' + won(plan.best.refund) + '원 (A 몰아주기 대비 +' + won(Math.max(0, plan.gain)) + '원)\n' +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/card-tax/');
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
    el.promoHeading.textContent = coupang.heading || '13월의 월급으로 채우는 겨울';
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
  function bindBasicEvents() {
    el.bsSalary.addEventListener('input', function () {
      state.salary = readNum(el.bsSalary, state.salary, L.salary.min, L.salary.max);
      syncGoldenForm();
      renderBasic();
      renderGolden();
      saveState();
    });
    el.bsRateSel.addEventListener('change', function () {
      state.rate = parseFloat(el.bsRateSel.value) || 0;
      renderBasic();
      renderGolden();
      saveState();
    });
    bindGroup(el.bsKidsGroup, 'bs-kids', function (v) {
      state.children = parseInt(v, 10) || 0;
      syncBasicForm();
      syncGoldenForm();
      renderBasic();
      renderGolden();
      saveState();
    });

    var map = { credit: el.bsCredit, check: el.bsCheck, market: el.bsMarket, transit: el.bsTransit, culture: el.bsCulture };
    S.KEYS.forEach(function (key) {
      var input = map[key];
      if (!input) return;
      input.addEventListener('input', function () {
        state.basic[key] = readNum(input, state.basic[key], L.money.min, L.money.max);
        el['bs' + key.charAt(0).toUpperCase() + key.slice(1) + 'Badge'].textContent = wonShort(state.basic[key]);
        renderBasic();
        saveState();
      });
    });

    $$('.chips [data-bs-salary]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.salary = Number(b.getAttribute('data-bs-salary'));
        syncBasicForm();
        syncGoldenForm();
        renderBasic();
        renderGolden();
        saveState();
      });
    });
    S.KEYS.forEach(function (key) {
      $$('.chips [data-bs-' + key + ']').forEach(function (b) {
        b.addEventListener('click', function () {
          state.basic[key] = Number(b.getAttribute('data-bs-' + key));
          syncBasicForm();
          renderBasic();
          saveState();
        });
      });
    });

    el.shareBasic.addEventListener('click', function () { doShare(basicShareText()); });
  }

  function bindGoldenEvents() {
    el.gdSalary.addEventListener('input', function () {
      state.salary = readNum(el.gdSalary, state.salary, L.salary.min, L.salary.max);
      syncBasicForm();
      renderBasic();
      renderGolden();
      saveState();
    });
    var map = {
      credit: el.gdCredit, check: el.gdCheck, market: el.gdMarket,
      transit: el.gdTransit, culture: el.gdCulture
    };
    S.KEYS.forEach(function (key) {
      var input = map[key];
      if (!input) return;
      input.addEventListener('input', function () {
        state.golden[key] = readNum(input, state.golden[key], L.money.min, L.money.max);
        el['gd' + key.charAt(0).toUpperCase() + key.slice(1) + 'Badge'].textContent = wonShort(state.golden[key]);
        renderGolden();
        saveState();
      });
    });
    el.gdBudget.addEventListener('input', function () {
      state.golden.budget = readNum(el.gdBudget, state.golden.budget, 0, L.money.max);
      el.gdBudgetBadge.textContent = wonShort(state.golden.budget);
      renderGolden();
      saveState();
    });
    bindGroup(el.gdKidsGroup, 'gd-kids', function (v) {
      state.children = parseInt(v, 10) || 0;
      syncBasicForm();
      syncGoldenForm();
      renderBasic();
      renderGolden();
      saveState();
    });
    $$('.chips [data-gd-budget]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.golden.budget = Number(b.getAttribute('data-gd-budget'));
        syncGoldenForm();
        renderGolden();
        saveState();
      });
    });
    el.shareGolden.addEventListener('click', function () { doShare(goldenShareText()); });
  }

  function bindCoupleEvents() {
    [
      ['salaryA', el.cpSalaryA], ['salaryB', el.cpSalaryB], ['spend', el.cpSpend]
    ].forEach(function (pair) {
      var key = pair[0];
      var input = pair[1];
      input.addEventListener('input', function () {
        var limit = key === 'spend' ? L.money : L.salary;
        state.couple[key] = readNum(input, state.couple[key], limit.min, limit.max);
        el['cp' + key.charAt(0).toUpperCase() + key.slice(1) + 'Badge'].textContent = wonShort(state.couple[key]);
        renderCouple();
        saveState();
      });
    });
    el.cpCreditShare.addEventListener('input', function () {
      state.couple.creditShare = readNum(el.cpCreditShare, state.couple.creditShare, 0, 100);
      el.cpCreditShareBadge.textContent = state.couple.creditShare + '%';
      renderCouple();
      saveState();
    });
    bindGroup(el.cpKidsGroup, 'cp-kids', function (v) {
      state.couple.children = parseInt(v, 10) || 0;
      syncCoupleForm();
      renderCouple();
      saveState();
    });
    bindGroup(el.cpClaimGroup, 'cp-claim', function (v) {
      state.couple.claim = v;
      syncCoupleForm();
      renderCouple();
      saveState();
    });
    $$('.chips [data-cp-spend]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.couple.spend = Number(b.getAttribute('data-cp-spend'));
        syncCoupleForm();
        renderCouple();
        saveState();
      });
    });
    $$('.chips [data-cp-share]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.couple.creditShare = Number(b.getAttribute('data-cp-share'));
        syncCoupleForm();
        renderCouple();
        saveState();
      });
    });
    el.shareCouple.addEventListener('click', function () { doShare(coupleShareText()); });
  }

  function refresh() {
    syncBasicForm();
    syncGoldenForm();
    syncCoupleForm();
    renderBasic();
    renderGolden();
    renderCouple();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    if (el.dataDate && S.RULES.verifiedAt) el.dataDate.textContent = S.RULES.verifiedAt;
    if (el.appVersion && CFG.version) el.appVersion.textContent = CFG.version;
    initTabs();
    refresh();
    bindBasicEvents();
    bindGoldenEvents();
    bindCoupleEvents();
    bindCheckGroup('#exList', el.exBar, el.exCount, el.exReset, function () { toast('체크를 모두 지웠습니다.'); });
    bindCheckGroup('.check-list', null, null, el.cpCheckReset, function () { toast('체크를 모두 지웠습니다.'); });
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
