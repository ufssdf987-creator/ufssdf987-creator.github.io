/*!
 * app.js — 2026 재산세·종합부동산세(보유세) 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.HTCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'ht.state.v1';
  var THEME_KEY = 'ctx.theme';
  var TABS = ['prop', 'hold', 'joint', 'guide'];
  var L = S.LIMITS;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function won(n) { return nf.format(Math.round(n || 0)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /** 2억 6,400만원처럼 읽기 쉽게 */
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
    tab: 'prop',
    prop: { price: 600000000, single: true, city: true, prev: 0, legacy: false, lastTax: 0 },
    hold: { houses: 1, price: 2000000000, age: 65, years: 10, prev: 0 },
    joint: { price: 2000000000, share: 50, ageA: 62, yearsA: 6, ageB: 62, yearsB: 6 },
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

    take(state.prop, raw.prop, [
      ['price', L.price], ['prev', L.price], ['lastTax', L.tax]
    ]);
    if (raw.prop && typeof raw.prop === 'object') {
      state.prop.single = raw.prop.single !== false;
      state.prop.city = raw.prop.city !== false;
      state.prop.legacy = !!raw.prop.legacy;
    }

    take(state.hold, raw.hold, [
      ['price', L.price], ['age', L.age], ['years', L.years], ['prev', L.tax]
    ]);
    if (raw.hold && typeof raw.hold === 'object') {
      var h = Math.round(parseFloat(raw.hold.houses));
      state.hold.houses = [1, 2, 3].indexOf(h) >= 0 ? h : 1;
    }

    take(state.joint, raw.joint, [
      ['price', L.price], ['share', L.share],
      ['ageA', L.age], ['yearsA', L.years], ['ageB', L.age], ['yearsB', L.years]
    ]);

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
    el.tabProp = $('#tabProp');
    el.tabHold = $('#tabHold');
    el.tabJoint = $('#tabJoint');
    el.tabGuide = $('#tabGuide');
    el.panelProp = $('#panelProp');
    el.panelHold = $('#panelHold');
    el.panelJoint = $('#panelJoint');
    el.panelGuide = $('#panelGuide');

    /* 재산세 */
    el.ptPrice = $('#ptPrice');
    el.ptPriceBadge = $('#ptPriceBadge');
    el.ptSingleGroup = $('#ptSingleGroup');
    el.ptCityGroup = $('#ptCityGroup');
    el.ptPrev = $('#ptPrev');
    el.ptPrevBadge = $('#ptPrevBadge');
    el.ptLegacy = $('#ptLegacy');
    el.ptLastTax = $('#ptLastTax');
    el.ptTotal = $('#ptTotal');
    el.ptSub = $('#ptSub');
    el.ptVerdict = $('#ptVerdict');
    el.ptRows = $('#ptRows');
    el.ptStatGross = $('#ptStatGross');
    el.ptStatCity = $('#ptStatCity');
    el.ptStatEdu = $('#ptStatEdu');
    el.ptStatRate = $('#ptStatRate');
    el.ptElig = $('#ptElig');
    el.ptNext = $('#ptNext');
    el.ptInsight = $('#ptInsight');
    el.ptScaleHint = $('#ptScaleHint');
    el.ptScaleBody = $('#ptScaleTable tbody');
    el.ptShare = $('#ptShare');

    /* 종부세 */
    el.hdHouseGroup = $('#hdHouseGroup');
    el.hdPrice = $('#hdPrice');
    el.hdPriceBadge = $('#hdPriceBadge');
    el.hdAge = $('#hdAge');
    el.hdAgeBadge = $('#hdAgeBadge');
    el.hdYears = $('#hdYears');
    el.hdYearsBadge = $('#hdYearsBadge');
    el.hdPrev = $('#hdPrev');
    el.hdPrevBadge = $('#hdPrevBadge');
    el.hdTotal = $('#hdTotal');
    el.hdSub = $('#hdSub');
    el.hdVerdict = $('#hdVerdict');
    el.hdRows = $('#hdRows');
    el.hdStatTaxable = $('#hdStatTaxable');
    el.hdStatGross = $('#hdStatGross');
    el.hdStatCredit = $('#hdStatCredit');
    el.hdStatFarm = $('#hdStatFarm');
    el.hdElig = $('#hdElig');
    el.hdNext = $('#hdNext');
    el.hdInsight = $('#hdInsight');
    el.hdScaleHint = $('#hdScaleHint');
    el.hdScaleBody = $('#hdScaleTable tbody');
    el.hdShare = $('#hdShare');

    /* 공동명의 */
    el.jtPrice = $('#jtPrice');
    el.jtPriceBadge = $('#jtPriceBadge');
    el.jtShare = $('#jtShare');
    el.jtShareBtn = $('#jtShareBtn');
    el.jtShareBadge = $('#jtShareBadge');
    el.jtAgeA = $('#jtAgeA');
    el.jtAgeABadge = $('#jtAgeABadge');
    el.jtYearsA = $('#jtYearsA');
    el.jtYearsABadge = $('#jtYearsABadge');
    el.jtAgeB = $('#jtAgeB');
    el.jtAgeBBadge = $('#jtAgeBBadge');
    el.jtYearsB = $('#jtYearsB');
    el.jtYearsBBadge = $('#jtYearsBBadge');
    el.jtBest = $('#jtBest');
    el.jtSub = $('#jtSub');
    el.jtVerdict = $('#jtVerdict');
    el.jtBody = $('#jtBody');
    el.jtStatSaving = $('#jtStatSaving');
    el.jtStatSingle = $('#jtStatSingle');
    el.jtStatGeneral = $('#jtStatGeneral');
    el.jtStatSpecial = $('#jtStatSpecial');
    el.jtRows = $('#jtRows');
    el.jtElig = $('#jtElig');
    el.jtInsight = $('#jtInsight');

    /* 가이드 */
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
      prop: [el.tabProp, el.panelProp],
      hold: [el.tabHold, el.panelHold],
      joint: [el.tabJoint, el.panelJoint],
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

  /* ══════════════ 탭 1: 재산세 ══════════════ */
  function calcProp() {
    var p = state.prop;
    return S.propertyTax({
      price: p.price,
      single: p.single,
      city: p.city,
      prevPrice: p.prev,
      legacy: p.legacy,
      lastTax: p.lastTax
    });
  }

  function renderProp() {
    var p = state.prop;
    var r = calcProp();

    el.ptPriceBadge.textContent = wonShort(p.price);
    el.ptPrevBadge.textContent = p.prev > 0 ? wonShort(p.prev) : '미적용';
    el.ptLastTax.disabled = !p.legacy;
    el.ptLastTax.closest('.input-wrap').classList.toggle('is-disabled', !p.legacy);
    syncGroup(el.ptSingleGroup, 'single', p.single ? 'yes' : 'no');
    syncGroup(el.ptCityGroup, 'city', p.city ? 'yes' : 'no');

    el.ptTotal.textContent = won(r.total);
    el.ptSub.textContent = '공시 ' + wonShort(r.price) + ' · 과세표준 ' + wonShort(r.taxable) +
      '(' + pct(r.ratio, 0) + ') · ' + (r.special ? '1주택 특례세율' : '일반세율') +
      (r.capApplied ? ' · 과세표준상한 적용' : '');

    var rows = [];
    rows.push(row('공시가격', won(r.price) + '원', '시가표준액(주택 공시가격)'));
    rows.push(row('공정시장가액비율', pct(r.ratio, 0),
      p.single ? '1세대 1주택 3억 이하 43%·6억 이하 44%·6억 초과 45%' : '다주택·법인 60%'));
    rows.push(row('과세표준', won(r.taxable) + '원',
      r.capApplied ? '상한 ' + wonShort(r.capBase) + ' 적용 (산정액 ' + wonShort(r.taxableBeforeCap) + ')' : '공시가격 × 비율'));
    rows.push(row('적용 세율', pct(r.rate, 2),
      r.special ? '공시 9억 이하 1세대 1주택 특례' : '표준세율 누진 0.1~0.4%'));
    rows.push(row('재산세 본세', won(r.grossTax) + '원',
      r.legacyApplied ? '경과조치 세부담상한 ' + pct(r.legacyRate, 0) + ' 적용' : '과세표준 × 세율'));
    rows.push(row('도시지역분', won(r.cityTax) + '원', p.city ? '과세표준 × 0.14%' : '미부과 지역'));
    rows.push(row('지방교육세', won(r.eduTax) + '원', '재산세 본세 × 20%'));
    rows.push(row('합계', won(r.total) + '원', '7월·9월 각 ' + won(r.half) + '원', 'total'));
    el.ptRows.innerHTML = rows.join('');

    el.ptStatGross.textContent = won(r.grossTax) + '원';
    el.ptStatCity.textContent = won(r.cityTax) + '원';
    el.ptStatEdu.textContent = won(r.eduTax) + '원';
    el.ptStatRate.textContent = pct(r.effectiveRate, 2);

    var elig = [];
    elig.push({
      ok: r.special,
      label: r.special
        ? '공시 9억 이하 1세대 1주택 — 특례세율 ' + pct(r.rate, 2) + ' 적용'
        : (p.single ? '공시 9억 초과 1주택 — 비율 특례(45%)만 적용' : '다주택·법인 — 비율 60%·일반세율'),
      note: r.special
        ? '특례세율은 2026년 12월 28일까지 성립한 납세의무(2026년분)에 적용됩니다.'
        : (p.single
          ? '세율 특례는 공시 9억 이하만 받습니다. 9억을 넘으면 0.4% 구간까지 올라갑니다.'
          : '1세대 1주택이면 같은 공시가격에도 비율 43~45%와 0.05%p 낮은 세율을 받습니다.')
    });
    if (r.capApplied) {
      elig.push({
        ok: false,
        label: '과세표준상한 5% 적용',
        note: '올해 과세표준이 상한액 ' + wonShort(r.capBase) + '으로 제한됐습니다(직전연도 ' + wonShort(p.prev) + ' 기준).'
      });
    }
    if (p.legacy && p.lastTax > 0) {
      elig.push({
        ok: r.legacyApplied,
        label: r.legacyApplied
          ? '경과조치 세부담상한 ' + pct(r.legacyRate, 0) + ' 적용'
          : '경과조치 상한 미적용 — 산출세액이 상한 이하',
        note: '2024년 1월 1일 전 과세 주택은 2028년 12월 31일까지 종전 105·110·130% 상한이 본세와 도시지역분에 각각 적용됩니다.'
      });
    }
    elig.push({
      ok: true,
      label: p.city ? '도시지역분 0.14% 포함' : '도시지역분 미부과',
      note: p.city ? '과세표준의 0.14%가 본세와 별도로 붙습니다(조례로 0.23%까지 가능).' : '읍·면 등 도시지역 밖 주택이면 도시지역분이 붙지 않습니다.'
    });
    renderElig(el.ptElig, elig);

    el.ptNext.textContent = r.total <= 200000
      ? '합계 ' + won(r.total) + '원으로 20만원 이하입니다. 조례에 따라 7월에 한 번에 고지될 수 있습니다.'
      : '7월 16~31일 ' + won(r.half) + '원, 9월 16~30일 ' + won(r.half) + '원 — 절반씩 냅니다. 20만원 이하는 7월 일괄 고지될 수 있습니다.';

    var multi = S.propertyTax({ price: p.price, single: false, city: p.city });
    var diff = multi.total - r.total;
    if (p.single && diff > 0) {
      setInsight(el.ptInsight,
        '같은 공시가격을 다주택으로 보면 재산세가 <strong>' + won(multi.total) + '원</strong>으로 ' +
        won(diff) + '원(' + (r.total > 0 ? (multi.total / r.total).toFixed(1) : '-') + '배) 더 나옵니다. ' +
        '1세대 1주택 특례가 비율과 세율을 동시에 낮춰 주기 때문입니다.');
    } else if (!p.single) {
      var one = S.propertyTax({ price: p.price, single: true, city: p.city });
      setInsight(el.ptInsight,
        '같은 집을 1세대 1주택으로 보면 <strong>' + won(one.total) + '원</strong>으로 ' +
        won(Math.max(0, r.total - one.total)) + '원 줄어듭니다. 세대 분리·공동명의로 주택 수가 달라지면 고지서를 다시 확인하세요.');
    } else {
      setInsight(el.ptInsight, '공시가격이 9억을 넘으면 특례세율이 빠지고, 다음 구간부터는 세율이 0.4%로 완만해집니다.');
    }

    el.ptScaleHint.textContent = p.single ? '1세대 1주택 기준' : '다주택 기준';
    var tbody = el.ptScaleBody;
    tbody.innerHTML = '';
    S.propertyScale({ single: p.single, city: p.city }).forEach(function (s) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<th scope="row">' + wonShort(s.price) + '</th><td>' + wonShort(s.taxable) +
        '</td><td>' + won(s.grossTax) + '원</td><td>' + won(s.total) + '원</td>';
      tbody.appendChild(tr);
    });

    setBadge(el.ptVerdict,
      r.special ? '1주택 특례' : (p.single ? '9억 초과' : '다주택'),
      r.special ? 1 : (p.single ? 2 : 3));
  }

  /* ══════════════ 탭 2: 종부세 ══════════════ */
  function calcHold() {
    var h = state.hold;
    return S.holdingTax({
      price: h.price,
      fullPrice: h.price,
      houses: h.houses,
      single: h.houses === 1,
      age: h.age,
      years: h.years,
      propertySingle: h.houses === 1,
      prevTotal: h.prev
    });
  }

  function renderHold() {
    var h = state.hold;
    var r = calcHold();

    syncGroup(el.hdHouseGroup, 'house', h.houses);
    el.hdPriceBadge.textContent = wonShort(h.price);
    el.hdAgeBadge.textContent = h.age + '세';
    el.hdYearsBadge.textContent = h.years + '년';
    el.hdPrevBadge.textContent = h.prev > 0 ? wonShort(h.prev) : '미적용';
    var noCredit = h.houses > 1;
    el.hdAge.disabled = noCredit;
    el.hdYears.disabled = noCredit;
    el.hdAge.closest('.input-wrap').classList.toggle('is-disabled', noCredit);
    el.hdYears.closest('.input-wrap').classList.toggle('is-disabled', noCredit);

    el.hdTotal.textContent = won(r.total);
    el.hdSub.textContent = h.houses === 1
      ? '1세대 1주택 · 기본공제 12억 · 세액공제 ' + pct(r.creditRate, 0)
      : (h.houses === 2 ? '2주택 · 기본공제 9억 · 세액공제 없음' : '3주택 이상 · 기본공제 9억 · 12억 초과 중과');

    var rows = [];
    rows.push(row('공시가격 합계', won(r.price) + '원', '전국 주택 인별 합산'));
    rows.push(row('기본공제', won(r.baseDeduction) + '원', h.houses === 1 ? '1세대 1주택자 12억' : '2주택 이상 개인 9억'));
    rows.push(row('과세표준', won(r.taxable) + '원', '(' + wonShort(r.price) + ' − ' + wonShort(r.baseDeduction) + ') × 60%'));
    rows.push(row('적용 세율', pct(r.rate, 1), r.heavy ? '3주택 이상 중과 구간' : '2주택 이하 누진세율'));
    rows.push(row('산출세액', won(r.grossTax) + '원', '과세표준 × 세율 − 누진공제'));
    rows.push(row('공제할 재산세', '−' + won(r.propertyCredit) + '원',
      '종부세 과표에 해당하는 재산세 본세만 공제'));
    if (r.creditRate > 0) {
      rows.push(row('1주택 세액공제', '−' + won(r.ageCredit) + '원',
        '고령 ' + pct(r.seniorRate, 0) + ' + 보유 ' + pct(r.holdRate, 0) + ' = ' + pct(r.creditRate, 0)));
    }
    if (r.capApplied) {
      rows.push(row('세부담상한 초과', '−' + won(r.capExcess) + '원', '직전연도 총세액의 150% 초과분'));
    }
    rows.push(row('결정세액', won(r.decided) + '원', '종부세 본세'));
    rows.push(row('농어촌특별세', won(r.farmTax) + '원', '결정세액 × 20%'));
    rows.push(row('합계', won(r.total) + '원', '12월 1~15일 납부', 'total'));
    el.hdRows.innerHTML = rows.join('');

    el.hdStatTaxable.textContent = wonShort(r.taxable);
    el.hdStatGross.textContent = wonShort(r.grossTax);
    el.hdStatCredit.textContent = pct(r.creditRate, 0);
    el.hdStatFarm.textContent = won(r.farmTax) + '원';

    var elig = [];
    elig.push({
      ok: r.taxable > 0,
      label: r.taxable > 0
        ? '종부세 과세대상 — 기본공제 ' + wonShort(r.baseDeduction) + ' 초과'
        : '종부세 과세대상 아님 — 공시가격이 기본공제 ' + wonShort(r.baseDeduction) + ' 이하',
      note: r.taxable > 0
        ? '초과분 ' + wonShort(r.excess) + ' × 60% = 과세표준 ' + wonShort(r.taxable)
        : '공시가격이 공제액을 넘지 않으면 종부세가 0원입니다.'
    });
    if (h.houses >= 3) {
      elig.push({
        ok: false,
        label: '3주택 이상 중과 — 과세표준 12억 초과 구간부터 2.0~5.0%',
        note: '3주택 이상은 고령자·장기보유 세액공제를 받을 수 없습니다.'
      });
    }
    if (h.houses === 1) {
      elig.push({
        ok: r.creditRate > 0,
        label: r.creditRate > 0
          ? '1세대 1주택 세액공제 ' + pct(r.creditRate, 0) + ' 적용'
          : '1세대 1주택 세액공제 없음 — 만 60세 미만·보유 5년 미만',
        note: '고령자 60·65·70세 20·30·40%, 보유 5·10·15년 20·40·50%, 합산 최대 80%입니다.'
      });
      if (r.seniorRate + r.holdRate > 0.8) {
        elig.push({
          ok: false,
          label: '세액공제 80% 한도 적용',
          note: '고령 ' + pct(r.seniorRate, 0) + ' + 보유 ' + pct(r.holdRate, 0) + ' = ' +
            pct(r.seniorRate + r.holdRate, 0) + '이지만 한도 80%까지만 공제됩니다.'
        });
      }
    } else {
      elig.push({
        ok: true,
        label: '2주택 이상 — 기본공제 9억, 세액공제 없음',
        note: '배우자와 공동명의 1주택이라면 공동명의 탭에서 12억 특례와 비교해 보세요.'
      });
    }
    elig.push({
      ok: true,
      label: '공제할 재산세 ' + won(r.propertyCredit) + '원 반영',
      note: '이미 낸 재산세 본세 중 종부세 과세표준에 해당하는 몫만 뺍니다. 도시지역분·지방교육세는 공제하지 않습니다.'
    });
    renderElig(el.hdElig, elig);

    if (r.decided <= 0) {
      el.hdNext.textContent = '납부할 종부세가 없습니다. 12월 고지서가 오지 않으면 그대로 두면 됩니다.';
    } else if (r.split.eligible) {
      el.hdNext.textContent = '12월 1~15일 ' + won(r.split.first) + '원, 나머지 ' + won(r.split.deferred) +
        '원은 6개월 이내 분납할 수 있습니다(농특세 ' + won(r.split.deferredFarm) + '원 포함).';
    } else {
      el.hdNext.textContent = '12월 1~15일 ' + won(r.total) + '원을 한 번에 냅니다. 250만원을 넘으면 6개월 이내 분납이 가능합니다.';
    }

    var m = S.marginal({ price: h.price, houses: h.houses, age: h.age, years: h.years });
    setInsight(el.hdInsight,
      '공시가격이 1억원 오르면 종부세+농특세가 <strong>' + won(m.increase) + '원</strong> 늘어납니다' +
      (r.taxable > 0 ? ' (증가분의 ' + pct(m.rate, 2) + ').' : '.') +
      ' 재산세 중복분 공제와 세액공제가 함께 움직이기 때문에 단순 세율로만 계산하면 실제와 달라집니다.');

    el.hdScaleHint.textContent = h.houses === 1 ? '1주택 기준' : (h.houses === 2 ? '2주택 기준' : '3주택 이상 기준');
    var tbody = el.hdScaleBody;
    tbody.innerHTML = '';
    S.holdingScale({ houses: h.houses, age: h.age, years: h.years }).forEach(function (s) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<th scope="row">' + wonShort(s.price) + '</th><td>' + wonShort(s.taxable) +
        '</td><td>' + won(s.grossTax) + '원</td><td>' + won(s.total) + '원</td>';
      tbody.appendChild(tr);
    });

    setBadge(el.hdVerdict,
      r.total === 0 ? '납부 없음' : (h.houses >= 3 ? '3주택 중과' : (h.houses === 1 ? '1주택 12억' : '2주택 이하')),
      r.total === 0 ? 3 : (h.houses >= 3 ? 3 : (h.houses === 1 ? 1 : 2)));
  }

  /* ══════════════ 탭 3: 공동명의 ══════════════ */
  function calcJoint() {
    var j = state.joint;
    return S.compareOwnership({
      price: j.price, shareA: j.share,
      ageA: j.ageA, yearsA: j.yearsA, ageB: j.ageB, yearsB: j.yearsB
    });
  }

  function renderJoint() {
    var j = state.joint;
    var r = calcJoint();

    el.jtPriceBadge.textContent = wonShort(j.price);
    el.jtShareBadge.textContent = '본인 ' + j.share + ' : 배우자 ' + (100 - j.share);
    el.jtAgeABadge.textContent = j.ageA + '세';
    el.jtYearsABadge.textContent = j.yearsA + '년';
    el.jtAgeBBadge.textContent = j.ageB + '세';
    el.jtYearsBBadge.textContent = j.yearsB + '년';

    el.jtBest.textContent = r.best.label;
    el.jtSub.textContent = r.maxSaving > 0
      ? '가장 비싼 방식보다 ' + won(r.maxSaving) + '원 적습니다 · 공시 ' + wonShort(r.price) + ' · 본인 지분 ' + j.share + '%'
      : '세 방식의 종부세가 같습니다 · 공시 ' + wonShort(r.price);

    var tbody = el.jtBody;
    tbody.innerHTML = '';
    r.rows.forEach(function (rowData) {
      var tr = document.createElement('tr');
      if (rowData.isBest) tr.className = 'is-best';
      tr.innerHTML = '<th scope="row">' + rowData.label + (rowData.isBest ? ' <span class="best-mark">유리</span>' : '') +
        '<small>' + rowData.note + '</small></th>' +
        '<td>' + won(rowData.decided) + '원</td>' +
        '<td><strong>' + won(rowData.total) + '원</strong></td>';
      tbody.appendChild(tr);
    });

    el.jtStatSaving.textContent = won(r.maxSaving) + '원';
    el.jtStatSingle.textContent = won(r.rows[0].total) + '원';
    el.jtStatGeneral.textContent = won(r.rows[1].total) + '원';
    el.jtStatSpecial.textContent = won(r.rows[2].total) + '원';

    var d = r.best.key === 'special' ? r.best.detail.result : r.best.detail;
    var rows = [];
    rows.push(row(r.best.label + (r.best.key === 'special' && r.best.detail.chosen === 'B' ? ' · 배우자 납세자' : '') + ' 기준', won(r.best.total) + '원', '종부세+농특세', 'total'));
    rows.push(row('기본공제', wonShort(r.best.key === 'general' ? 1800000000 : 1200000000),
      r.best.key === 'general' ? '부부 각자 9억 합산' : '1세대 1주택 12억'));
    if (r.best.key === 'general') {
      rows.push(row('본인 몫', won(d.a.decided) + '원', '과세표준 ' + wonShort(d.a.taxable)));
      rows.push(row('배우자 몫', won(d.b.decided) + '원', '과세표준 ' + wonShort(d.b.taxable)));
    } else {
      rows.push(row('과세표준', wonShort(d.taxable), '(' + wonShort(d.price) + ' − 12억) × 60%'));
      rows.push(row('산출세액', won(d.grossTax) + '원', '공제할 재산세 ' + won(d.propertyCredit) + '원 차감 전'));
      rows.push(row('세액공제', '−' + won(d.ageCredit) + '원', pct(d.creditRate, 0) + ' (고령 ' + pct(d.seniorRate, 0) + ' + 보유 ' + pct(d.holdRate, 0) + ')'));
    }
    rows.push(row('농어촌특별세', won(r.best.farmTax) + '원', '결정세액 × 20%'));
    el.jtRows.innerHTML = rows.join('');

    var elig = [];
    elig.push({
      ok: r.best.key !== 'general',
      label: r.best.key === 'general' ? '지분이 반반이면 각자 9억 공제가 유리' : r.best.key === 'single' ? '단독명의가 가장 유리' : '공동명의 12억 특례가 가장 유리',
      note: '공시가격·지분율·두 사람의 나이와 보유기간에 따라 유리한 쪽이 바뀝니다. 특례가 항상 유리한 것은 아닙니다.'
    });
    elig.push({
      ok: true,
      label: '공동명의 특례 신청 9월 16~30일',
      note: '2026년부터 지분율과 관계없이 부부 합의로 납세의무자를 선택합니다. 한 번 신청하면 변동이 없으면 계속 적용됩니다.'
    });
    elig.push({
      ok: true,
      label: '특례 요건 — 부부가 1주택만 공동 소유, 다른 세대원 주택 없음',
      note: '부모·자녀 공동명의는 이 특례 대상이 아닙니다. 부부 모두 국내 거주자여야 합니다.'
    });
    elig.push({
      ok: true,
      label: '재산세는 명의와 관계없이 같습니다',
      note: '이 계산기의 비교는 종부세+농특세만입니다. 재산세 ' + won(r.propertyTax.total) + '원은 어느 방식이든 동일합니다.'
    });
    renderElig(el.jtElig, elig);

    setInsight(el.jtInsight,
      '공시 ' + wonShort(r.price) + ', 본인 지분 ' + j.share + '%(본인 ' + j.ageA + '세·' + j.yearsA +
      '년, 배우자 ' + j.ageB + '세·' + j.yearsB + '년) 기준으로 <strong>' + r.best.label + '</strong>이 ' +
      won(r.maxSaving) + '원 가장 적습니다. ' +
      (r.best.key === 'general'
        ? '지분이 반반이면 합산 18억이 공제돼 12억 특례보다 공제 폭이 큽니다.'
        : '지분이 한쪽에 몰리거나 세액공제율이 높으면 12억 특례가 유리해집니다.') +
      ' 실제 신청 전에는 홈택스 종부세 모의계산으로 고지서 기준 금액을 확인하세요.');

    setBadge(el.jtVerdict, r.best.label, r.best.key === 'single' ? 1 : 2);
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
    el.tabProp.addEventListener('click', function () { setTab('prop'); });
    el.tabHold.addEventListener('click', function () { setTab('hold'); });
    el.tabJoint.addEventListener('click', function () { setTab('joint'); });
    el.tabGuide.addEventListener('click', function () { setTab('guide'); });

    /* 재산세 */
    el.ptPrice.addEventListener('input', function () {
      state.prop.price = readNum(el.ptPrice, 600000000, L.price.min, L.price.max);
      renderProp();
      saveState();
    });
    el.ptPrev.addEventListener('input', function () {
      state.prop.prev = readNum(el.ptPrev, 0, L.price.min, L.price.max);
      renderProp();
      saveState();
    });
    el.ptLegacy.addEventListener('change', function () {
      state.prop.legacy = el.ptLegacy.checked;
      renderProp();
      saveState();
    });
    el.ptLastTax.addEventListener('input', function () {
      state.prop.lastTax = readNum(el.ptLastTax, 0, L.tax.min, L.tax.max);
      renderProp();
      saveState();
    });
    bindGroup(el.ptSingleGroup, 'single', function (v) {
      state.prop.single = v === 'yes';
      renderProp();
      saveState();
    });
    bindGroup(el.ptCityGroup, 'city', function (v) {
      state.prop.city = v === 'yes';
      renderProp();
      saveState();
    });

    /* 종부세 */
    bindGroup(el.hdHouseGroup, 'house', function (v) {
      state.hold.houses = parseInt(v, 10) || 1;
      renderHold();
      saveState();
    });
    el.hdPrice.addEventListener('input', function () {
      state.hold.price = readNum(el.hdPrice, 2000000000, L.price.min, L.price.max);
      renderHold();
      saveState();
    });
    el.hdAge.addEventListener('input', function () {
      state.hold.age = readNum(el.hdAge, 65, L.age.min, L.age.max);
      renderHold();
      saveState();
    });
    el.hdYears.addEventListener('input', function () {
      state.hold.years = readNum(el.hdYears, 10, L.years.min, L.years.max);
      renderHold();
      saveState();
    });
    el.hdPrev.addEventListener('input', function () {
      state.hold.prev = readNum(el.hdPrev, 0, L.tax.min, L.tax.max);
      renderHold();
      saveState();
    });

    /* 공동명의 */
    el.jtPrice.addEventListener('input', function () {
      state.joint.price = readNum(el.jtPrice, 2000000000, L.price.min, L.price.max);
      renderJoint();
      saveState();
    });
    el.jtShare.addEventListener('input', function () {
      state.joint.share = clamp(readNum(el.jtShare, 50, 10, 90), 10, 90);
      renderJoint();
      saveState();
    });
    ['jtAgeA', 'jtYearsA', 'jtAgeB', 'jtYearsB'].forEach(function (id) {
      var key = id.replace('jt', '');
      key = key.charAt(0).toLowerCase() + key.slice(1);
      el[id].addEventListener('input', function () {
        var spec = id.indexOf('Age') >= 0 ? L.age : L.years;
        state.joint[key] = readNum(el[id], id.indexOf('Age') >= 0 ? 60 : 5, spec.min, spec.max);
        renderJoint();
        saveState();
      });
    });

    /* 가이드 */
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

    /* 결과 복사 */
    el.ptShare.addEventListener('click', function () {
      var r = calcProp();
      var text = '[2026 재산세] ' + wonShort(r.price) + (r.special ? ' · 1세대 1주택' : ' · 다주택') +
        '\n과세표준 ' + wonShort(r.taxable) + '(' + pct(r.ratio, 0) + ') · ' + pct(r.rate, 2) +
        '\n본세 ' + won(r.grossTax) + '원 + 도시지역분 ' + won(r.cityTax) + '원 + 교육세 ' + won(r.eduTax) +
        '원 = ' + won(r.total) + '원' +
        '\n7월·9월 각 ' + won(r.half) + '원\n→ 보유세 계산기 ' + CFG.siteUrl;
      copyText(text);
    });
    el.hdShare.addEventListener('click', function () {
      var r = calcHold();
      var text = '[2026 종부세] ' + wonShort(r.price) + ' · ' + (r.houses === 1 ? '1세대 1주택' : r.houses + '주택') +
        '\n공제 ' + wonShort(r.baseDeduction) + ' · 과세표준 ' + wonShort(r.taxable) +
        '\n산출세액 ' + won(r.grossTax) + ' − 재산세 ' + won(r.propertyCredit) +
        (r.creditRate ? ' − 세액공제 ' + won(r.ageCredit) : '') +
        '\n종부세 ' + won(r.decided) + ' + 농특세 ' + won(r.farmTax) + ' = ' + won(r.total) + '원' +
        '\n→ 보유세 계산기 ' + CFG.siteUrl;
      copyText(text);
    });
    el.jtShareBtn.addEventListener('click', function () {
      var r = calcJoint();
      var text = '[2026 공동명의 종부세 비교] 공시 ' + wonShort(r.price) + ' · 본인 지분 ' + r.shareA + '%' +
        '\n단독명의 ' + won(r.rows[0].total) + '원' +
        '\n공동명의 각자 ' + won(r.rows[1].total) + '원' +
        '\n공동명의 특례 ' + won(r.rows[2].total) + '원' +
        '\n가장 유리: ' + r.best.label + ' (최대 ' + won(r.maxSaving) + '원 절감)' +
        '\n→ 보유세 계산기 ' + CFG.siteUrl;
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
  function syncInputs() {
    el.ptPrice.value = state.prop.price;
    el.ptPrev.value = state.prop.prev;
    el.ptLegacy.checked = state.prop.legacy;
    el.ptLastTax.value = state.prop.lastTax;
    el.hdPrice.value = state.hold.price;
    el.hdAge.value = state.hold.age;
    el.hdYears.value = state.hold.years;
    el.hdPrev.value = state.hold.prev;
    el.jtPrice.value = state.joint.price;
    el.jtShare.value = state.joint.share;
    el.jtAgeA.value = state.joint.ageA;
    el.jtYearsA.value = state.joint.yearsA;
    el.jtAgeB.value = state.joint.ageB;
    el.jtYearsB.value = state.joint.yearsB;
  }

  function init() {
    cacheEls();
    loadState();

    if (CFG.version) el.appVersion.textContent = CFG.version;

    $$('input[type="checkbox"]', el.gdList).forEach(function (b) {
      b.checked = !!state.checks[b.getAttribute('data-check')];
    });

    syncInputs();
    setTab(state.tab);
    bindAll();
    bindTheme();
    bindInstall();
    renderPromo();
    renderProp();
    renderHold();
    renderJoint();
    renderGuide();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* 오프라인 미지원 환경 무시 */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
