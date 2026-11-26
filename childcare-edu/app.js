/*!
 * app.js — 2026 보육료·유아학비·초등 늘봄·교육비 세액공제 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.CCCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'cce.state.v1';
  var THEME_KEY = 'ctx.theme';
  var TABS = ['care', 'elem', 'edu', 'guide'];

  var FACILITY = {
    daycare: '어린이집',
    daycare_private: '민간·가정 어린이집',
    kinder_public: '국공립유치원',
    kinder_private: '사립유치원'
  };

  var DEFAULT_FEE = {
    daycare: { 0: 584000, 1: 515000, 2: 426000, 3: 330000, 4: 400000, 5: 400000 },
    daycare_private: { 0: 700000, 1: 500000, 2: 420000, 3: 408000, 4: 385000, 5: 385000 },
    kinder_public: { 0: 150000, 1: 150000, 2: 150000, 3: 200000, 4: 200000, 5: 200000 },
    kinder_private: { 0: 400000, 1: 400000, 2: 450000, 3: 480000, 4: 500000, 5: 520000 }
  };

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
    tab: 'care',
    care: {
      age: 4, facility: 'kinder_private', fee: 500000, extra: 50000, extHours: 0,
      after: false, night: false, low: false, disabled: false, autoFee: true
    },
    elem: { grade: 3, fee: 60000, months: 10, care: true, snack: 0 },
    edu: {
      tax: 1200000,
      types: ['preschool', 'school', 'none'],
      amts: [1500000, 1200000, 0],
      self: 0,
      disabled: 0
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
        var v = parseFloat(source[pair[0]]);
        if (isFinite(v)) target[pair[0]] = clamp(v, pair[1].min, pair[1].max);
      });
    }

    take(state.care, raw.care, [
      ['age', L.age], ['fee', L.fee], ['extra', L.extra], ['extHours', L.hours]
    ]);
    if (raw.care && typeof raw.care === 'object') {
      if (FACILITY[raw.care.facility]) state.care.facility = raw.care.facility;
      state.care.after = !!raw.care.after;
      state.care.night = !!raw.care.night;
      state.care.low = !!raw.care.low;
      state.care.disabled = !!raw.care.disabled;
      state.care.autoFee = raw.care.autoFee !== false;
    }

    take(state.elem, raw.elem, [['grade', L.grade], ['fee', L.fee], ['months', L.months]]);
    if (raw.elem && typeof raw.elem === 'object') {
      state.elem.care = raw.elem.care !== false;
      var snack = parseFloat(raw.elem.snack);
      if (isFinite(snack)) state.elem.snack = clamp(snack, 0, 300000);
    }

    take(state.edu, raw.edu, [['tax', L.tax], ['self', L.amount], ['disabled', L.amount]]);
    if (raw.edu && typeof raw.edu === 'object') {
      if (Array.isArray(raw.edu.types)) {
        raw.edu.types.slice(0, 3).forEach(function (t, i) {
          if (['none', 'preschool', 'school', 'college'].indexOf(t) >= 0) state.edu.types[i] = t;
        });
      }
      if (Array.isArray(raw.edu.amts)) {
        raw.edu.amts.slice(0, 3).forEach(function (a, i) {
          var v = parseFloat(a);
          if (isFinite(v)) state.edu.amts[i] = clamp(v, L.amount.min, L.amount.max);
        });
      }
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
    el.tabCare = $('#tabCare');
    el.tabElem = $('#tabElem');
    el.tabEdu = $('#tabEdu');
    el.tabGuide = $('#tabGuide');
    el.panelCare = $('#panelCare');
    el.panelElem = $('#panelElem');
    el.panelEdu = $('#panelEdu');
    el.panelGuide = $('#panelGuide');

    /* 탭 1 */
    el.careAgeChips = $('#careAgeChips');
    el.careFacilityGroup = $('#careFacilityGroup');
    el.careFee = $('#careFee');
    el.careFeeBadge = $('#careFeeBadge');
    el.careExtra = $('#careExtra');
    el.careExtraBadge = $('#careExtraBadge');
    el.careExtWrap = $('#careExtWrap');
    el.careExtHours = $('#careExtHours');
    el.careExtBadge = $('#careExtBadge');
    el.careExtChips = $('#careExtChips');
    el.careAfter = $('#careAfter');
    el.careNight = $('#careNight');
    el.careLow = $('#careLow');
    el.careDisabled = $('#careDisabled');
    el.careBirth = $('#careBirth');
    el.careTotal = $('#careTotal');
    el.careSub = $('#careSub');
    el.careVerdict = $('#careVerdict');
    el.careAnnual = $('#careAnnual');
    el.careRows = $('#careRows');
    el.careStatFee = $('#careStatFee');
    el.careStatBurden = $('#careStatBurden');
    el.careStatAnnual = $('#careStatAnnual');
    el.careStatRate = $('#careStatRate');
    el.careMeterFill = $('#careMeterFill');
    el.careMeterLeft = $('#careMeterLeft');
    el.careElig = $('#careElig');
    el.careNextTitle = $('#careNextTitle');
    el.careNext = $('#careNext');
    el.careInsight = $('#careInsight');
    el.careScaleBody = $('#careScaleTable tbody');
    el.careShare = $('#careShare');

    /* 탭 2 */
    el.elemGradeChips = $('#elemGradeChips');
    el.elemFee = $('#elemFee');
    el.elemFeeBadge = $('#elemFeeBadge');
    el.elemMonths = $('#elemMonths');
    el.elemMonthsBadge = $('#elemMonthsBadge');
    el.elemCare = $('#elemCare');
    el.elemSnack = $('#elemSnack');
    el.elemSnackBadge = $('#elemSnackBadge');
    el.elemTotal = $('#elemTotal');
    el.elemSub = $('#elemSub');
    el.elemVerdict = $('#elemVerdict');
    el.elemPaid = $('#elemPaid');
    el.elemRows = $('#elemRows');
    el.elemStatFee = $('#elemStatFee');
    el.elemStatMonth = $('#elemStatMonth');
    el.elemStatCredit = $('#elemStatCredit');
    el.elemStatTerm = $('#elemStatTerm');
    el.elemElig = $('#elemElig');
    el.elemNextTitle = $('#elemNextTitle');
    el.elemNext = $('#elemNext');
    el.elemInsight = $('#elemInsight');
    el.elemShare = $('#elemShare');

    /* 탭 3 */
    el.eduTax = $('#eduTax');
    el.eduTaxBadge = $('#eduTaxBadge');
    el.eduTypeGroups = [$('#eduTypeGroup1'), $('#eduTypeGroup2'), $('#eduTypeGroup3')];
    el.eduAmtWraps = [$('#eduAmtWrap1'), $('#eduAmtWrap2'), $('#eduAmtWrap3')];
    el.eduAmts = [$('#eduAmt1'), $('#eduAmt2'), $('#eduAmt3')];
    el.eduAmtBadges = [$('#eduAmtBadge1'), $('#eduAmtBadge2'), $('#eduAmtBadge3')];
    el.eduSelf = $('#eduSelf');
    el.eduSelfBadge = $('#eduSelfBadge');
    el.eduDisabled = $('#eduDisabled');
    el.eduDisabledBadge = $('#eduDisabledBadge');
    el.eduTotal = $('#eduTotal');
    el.eduRefund = $('#eduRefund');
    el.eduSub = $('#eduSub');
    el.eduVerdict = $('#eduVerdict');
    el.eduRows = $('#eduRows');
    el.eduStatBase = $('#eduStatBase');
    el.eduStatRate = $('#eduStatRate');
    el.eduStatLeft = $('#eduStatLeft');
    el.eduStatApplied = $('#eduStatApplied');
    el.eduElig = $('#eduElig');
    el.eduNextTitle = $('#eduNextTitle');
    el.eduNext = $('#eduNext');
    el.eduInsight = $('#eduInsight');
    el.eduScaleBody = $('#eduScaleTable tbody');
    el.eduShare = $('#eduShare');

    /* 탭 4 */
    el.gdList = $('#gdList');
    el.gdBar = $('#gdBar');
    el.gdCount = $('#gdCount');
    el.gdReset = $('#gdReset');

    /* 공통 */
    el.themeBtn = $('#themeBtn');
    el.themeIcon = $('#themeIcon');
    el.installBtn = $('#installBtn');
    el.promoSection = $('#promoSection');
    el.promoHeading = $('#promoHeading');
    el.promoSub = $('#promoSub');
    el.promoList = $('#promoList');
    el.promoDisclosure = $('#promoDisclosure');
    el.footerDisclosure = $('#footerDisclosure');
    el.toast = $('#toast');
    el.dataDate = $('#dataDate');
    el.appVersion = $('#appVersion');
  }

  /* ── 탭 ───────────────────────────────────────────────── */
  function setTab(name, focus) {
    if (TABS.indexOf(name) < 0) name = 'care';
    state.tab = name;
    var map = {
      care: [el.tabCare, el.panelCare],
      elem: [el.tabElem, el.panelElem],
      edu: [el.tabEdu, el.panelEdu],
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
    el.tabCare.addEventListener('click', function () { setTab('care'); });
    el.tabElem.addEventListener('click', function () { setTab('elem'); });
    el.tabEdu.addEventListener('click', function () { setTab('edu'); });
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
    setTab(TABS.indexOf(hash) >= 0 ? hash : (state.tab || 'care'));
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

  /* ── 탭 1: 보육료·유아학비 ─────────────────────────────── */
  function careInput() {
    return {
      age: state.care.age,
      facility: state.care.facility,
      fee: state.care.fee,
      extra: state.care.extra,
      useAfter: state.care.after,
      extHours: state.care.extHours,
      night: state.care.night,
      lowIncome: state.care.low,
      disabled: state.care.disabled
    };
  }

  function isKinder(facility) { return facility === 'kinder_public' || facility === 'kinder_private'; }

  function syncCareForm() {
    var c = state.care;
    el.careFee.value = c.fee;
    el.careExtra.value = c.extra;
    el.careExtHours.value = c.extHours;
    el.careFeeBadge.textContent = wonShort(c.fee);
    el.careExtraBadge.textContent = wonShort(c.extra);
    el.careExtBadge.textContent = c.extHours + '시간';
    el.careBirth.textContent = '2026학년도 ' + S.ageLabel(c.age) + '는 ' + S.birthYear(c.age) + ' 출생입니다.';
    el.careAfter.checked = c.after;
    el.careNight.checked = c.night;
    el.careLow.checked = c.low;
    el.careDisabled.checked = c.disabled;
    el.careExtWrap.hidden = isKinder(c.facility);
    el.careExtChips.hidden = isKinder(c.facility);
    var afterItem = el.careAfter.closest('.check-item');
    if (afterItem) afterItem.hidden = !isKinder(c.facility);
    var nightItem = el.careNight.closest('.check-item');
    if (nightItem) nightItem.hidden = isKinder(c.facility);
    var lowItem = el.careLow.closest('.check-item');
    if (lowItem) lowItem.hidden = c.facility !== 'kinder_private';
    syncGroup(el.careFacilityGroup, 'care-facility', c.facility);
    syncChips('care-age', c.age);
    syncChips('care-fee', c.fee);
    syncChips('care-ext', c.extHours);
  }

  function renderCare() {
    var r = S.careSupport(careInput());
    var facilityLabel = FACILITY[r.facility] || '';
    el.careTotal.textContent = won(r.support);
    el.careAnnual.textContent = wonShort(r.annualSupport);
    el.careSub.textContent = S.ageLabel(r.age) + ' · ' + facilityLabel +
      (r.isDaycare ? '' : (r.after ? ' · 방과후 과정 이용' : ' · 방과후 미이용')) +
      (r.extension ? ' · 연장보육 포함' : '');

    if (!r.support) {
      setBadge(el.careVerdict, '지원 없음', 0);
    } else if (r.supportRate >= 0.999) {
      setBadge(el.careVerdict, '원비 전액 지원', 1);
    } else if (r.supportRate >= 0.8) {
      setBadge(el.careVerdict, '대부분 지원', 2);
    } else {
      setBadge(el.careVerdict, '일부 지원', 3);
    }

    var html = '';
    r.rows.forEach(function (item) {
      html += row(item.label, won(item.value) + '원');
    });
    html += row('월 원비 합계', won(r.totalFee) + '원', '원비 + 기타 비용');
    html += row('월 학부모 부담', won(r.burden) + '원', '', r.burden > 0 ? 'is-deduct' : '');
    el.careRows.innerHTML = html;

    el.careStatFee.textContent = wonShort(r.totalFee);
    el.careStatBurden.textContent = wonShort(r.burden);
    el.careStatAnnual.textContent = wonShort(r.annualBurden);
    el.careStatRate.textContent = pct(Math.min(1, r.supportRate), 0);

    var width = clamp(r.supportRate * 100, 0, 100);
    el.careMeterFill.style.width = width + '%';
    el.careMeterFill.setAttribute('data-tone', width >= 99 ? 'good' : (width < 50 ? 'warn' : 'mid'));
    el.careMeterLeft.textContent = '원비 중 지원 ' + pct(width / 100, 0);

    var elig = [];
    elig.push({
      ok: true,
      label: '나이 · 출생연도',
      note: S.ageLabel(r.age) + ' · ' + r.birth
    });
    elig.push({
      ok: r.isDaycare ? r.age <= 5 : r.age >= 3,
      label: r.isDaycare ? '어린이집 보육료' : '유치원 유아학비',
      note: r.isDaycare
        ? '만 0~5세 어린이집 이용 아동'
        : (r.age >= 3 ? '만 3~5세 누리과정 대상' : '유치원 유아학비는 만 3~5세부터')
    });
    elig.push({
      ok: r.free > 0,
      label: '4~5세 무상교육·보육',
      note: r.free > 0
        ? '월 ' + won(r.free) + '원 차감'
        : (r.age >= 3 ? '2026년은 4~5세까지 · 3세는 2027년 계획' : '만 4~5세부터 적용')
    });
    if (!r.isDaycare) {
      elig.push({
        ok: !r.after || r.age >= 3,
        label: '방과후 과정비',
        note: r.after
          ? '하루 8시간 이상·월 15일 이상 출석해야 전액'
          : '방과후 과정을 이용해야 5만·7만원이 붙습니다'
      });
    } else {
      elig.push({
        ok: !r.night,
        label: '연장보육료',
        note: r.night ? '24시간 보육은 연장보육료 미지원' : (r.extension ? '월 지원 ' + won(r.extension) + '원 반영' : '17시 이후 이용시간 기준')
      });
    }
    elig.push({
      ok: r.age >= 3,
      label: '누리과정 3년',
      note: r.age >= 3 ? '유치원·어린이집 합쳐 3년을 넘을 수 없음' : '만 3세부터 시작'
    });
    renderElig(el.careElig, elig);

    if (r.burden > 0) {
      el.careNextTitle.textContent = '부담을 줄이려면';
      if (!r.isDaycare && r.after && r.age >= 4) {
        el.careNext.innerHTML = '이미 <strong>방과후 과정비와 무상교육 11만원</strong>이 반영된 금액입니다. 남은 <strong>' + won(r.burden) + '원</strong>은 특성화활동비·교재비·급식비처럼 지원 단가 밖 항목이니, 원비 고지서에서 지원금이 제대로 빠졌는지 확인하세요.';
      } else {
        el.careNext.innerHTML = '월 <strong>' + won(r.burden) + '원</strong>이 학부모 부담입니다. ' +
          (r.isDaycare
            ? '특별활동비·차량비는 지원 대상이 아니니 꼭 필요한 항목만 남기고, 4~5세라면 기타 필요경비 7만원이 차감됐는지 원비 고지서를 확인하세요.'
            : (r.age < 4
              ? '4세가 되면 무상교육(사립 11만원)이 붙습니다. 3세는 2027년 확대 계획이라 그 전까지는 원비가 그대로입니다.'
              : '방과후 과정을 이용하면 방과후 과정비(5만·7만원)가 붙고, 사립은 무상교육 11만원까지 차감됩니다. 지자체 추가 지원도 확인해 보세요.'));
      }
    } else {
      el.careNextTitle.textContent = '원비 전액이 지원됩니다';
      el.careNext.innerHTML = '지원 단가 안에서 원비가 모두 해결됩니다. 다만 <strong>특별활동비·교재비·차량비</strong>는 별도 부담이고, 출석일수가 11일 미만이면 지원금이 25~50%로 줄어듭니다.';
    }

    if (r.age >= 4 && r.free > 0) {
      setInsight(el.careInsight, '2026년 3월부터 <strong>4~5세 무상교육·보육</strong>이 시행됩니다. 사립유치원 11만원, 국공립유치원 방과후 2만원, 어린이집 기타 필요경비 7만원이 <strong>신청 없이</strong> 원비에서 빠집니다.', 'is-good');
    } else if (r.age === 3) {
      setInsight(el.careInsight, '만 3세는 2026년에 <strong>누리보육료 28만원 + 추가지원 5만원</strong>까지입니다. 무상교육 3세 확대는 2027년 계획으로, 2026년 11월 현재 국회 예산 심의가 남아 있습니다.');
    } else {
      setInsight(el.careInsight, r.isDaycare
        ? '만 0~2세는 <strong>보육료가 정부지원단가 안에서</strong> 해결됩니다. 원비가 단가보다 높으면 차액과 특별활동비는 학부모 부담입니다.'
        : '유치원 원비는 기관마다 차이가 큽니다. 고지서의 <strong>지원금 차감 전 금액</strong>을 넣어야 실제 부담이 맞습니다.');
    }

    renderCareScale();
  }

  var extTextCache = '';
  function renderCareScale() {
    var ages = [0, 1, 2, 3, 4, 5];
    var html = ages.map(function (age) {
      var d = S.careSupport({ age: age, facility: 'daycare', fee: 0, extra: 0 });
      var p = S.careSupport({ age: age, facility: 'kinder_public', fee: 0, extra: 0, useAfter: true });
      var q = S.careSupport({ age: age, facility: 'kinder_private', fee: 0, extra: 0, useAfter: true });
      return '<tr><th scope="row">' + S.ageLabel(age) + '</th><td>' + won(d.support) + '원</td><td>' +
        won(p.support) + '원</td><td>' + won(q.support) + '원</td></tr>';
    }).join('');
    el.careScaleBody.innerHTML = html;
  }

  function careShareText() {
    var r = S.careSupport(careInput());
    return '[2026 보육료·유아학비] ' + S.ageLabel(r.age) + ' · ' + (FACILITY[r.facility] || '') + '\n' +
      '월 정부지원 ' + won(r.support) + '원 / 월 부담 ' + won(r.burden) + '원\n' +
      '연간 지원 ' + won(r.annualSupport) + '원\n' +
      (CFG.siteUrl || 'https://ufssdf987-creator.github.io/childcare-edu/');
  }

  /* ── 탭 2: 초등 늘봄·방과후 ───────────────────────────── */
  function elemInput() {
    return {
      grade: state.elem.grade,
      fee: state.elem.fee,
      months: state.elem.months,
      care: state.elem.care
    };
  }

  function syncElemForm() {
    var e = state.elem;
    el.elemFee.value = e.fee;
    el.elemMonths.value = e.months;
    el.elemSnack.value = e.snack;
    el.elemFeeBadge.textContent = wonShort(e.fee);
    el.elemMonthsBadge.textContent = e.months + '개월';
    el.elemSnackBadge.textContent = wonShort(e.snack);
    el.elemCare.checked = e.care;
    syncChips('elem-grade', e.grade);
    syncChips('elem-fee', e.fee);
  }

  function renderElem() {
    var r = S.elemSupport(elemInput());
    var snackYear = state.elem.snack * r.months;
    var paid = r.paid + snackYear;
    el.elemTotal.textContent = won(r.support);
    el.elemPaid.textContent = wonShort(paid);
    el.elemSub.textContent = '초' + r.grade + ' · 방과후 월 ' + won(r.fee) + '원 × ' + r.months + '개월';

    if (r.freeProgram) setBadge(el.elemVerdict, '무상 프로그램', 1);
    else if (r.voucher) setBadge(el.elemVerdict, '이용권 대상', 2);
    else setBadge(el.elemVerdict, '지원 없음', 0);

    var html = '';
    r.rows.forEach(function (item) {
      html += row(item.label, item.value ? won(item.value) + '원' : '무상', item.note || '');
    });
    if (snackYear > 0) html += row('돌봄 급·간식비', won(snackYear) + '원', '연간');
    el.elemRows.innerHTML = html;

    el.elemStatFee.textContent = wonShort(r.annualFee);
    el.elemStatMonth.textContent = wonShort(r.months ? Math.round(paid / r.months) : 0);
    el.elemStatCredit.textContent = wonShort(r.credit);
    el.elemStatTerm.textContent = wonShort(r.firstTermSupport);

    var elig = [
      {
        ok: true,
        label: '학년',
        note: r.freeProgram ? '초1·2 매일 2시간 무상 맞춤형' : (r.voucher ? '2026년 이용권은 초3 대상' : '초4~6은 무상 프로그램·이용권 없음')
      },
      {
        ok: r.voucher,
        label: '방과후 프로그램 이용권',
        note: r.voucher ? '연 50만원 · 학기당 25만원' : '초3만 해당'
      },
      {
        ok: true,
        label: '선택형 돌봄(늘봄교실)',
        note: state.elem.care ? '무상 · 급·간식비 별도' : '이용하지 않음'
      },
      {
        ok: true,
        label: '교육비 세액공제',
        note: '본인 부담 수강료의 15%'
      }
    ];
    renderElig(el.elemElig, elig);

    el.elemNextTitle.textContent = r.voucher ? '이용권을 쓰는 순서' : (r.freeProgram ? '초3이 되면 달라집니다' : '초4부터는 본인 부담');
    el.elemNext.innerHTML = r.voucher
      ? '학교 방과후 수강 신청 후 <strong>이용권(바우처)</strong>을 신청하세요. 학기당 25만원, 연 50만원까지 수강료로 결제되고 학원비에는 쓸 수 없습니다. 초과분은 본인 부담입니다.'
      : (r.freeProgram
        ? '초1·2는 <strong>매일 2시간 무상 프로그램</strong>이 있어 사실상 3시 하교가 됩니다. 초3이 되면 방과후 이용권 50만원이 생기고, 초4부터는 지원이 없어 수강료를 모두 냅니다.'
        : '초4~6은 방과후 수강료를 모두 냅니다. 다만 <strong>교육비 세액공제 15%</strong>가 적용되고, 지자체 돌봄·자유수강권은 학교에 문의하세요.');

    if (r.freeProgram) {
      setInsight(el.elemInsight, '초1·2 무상 프로그램은 <strong>현금 지급이 아니라 수강료가 0원</strong>인 것입니다. 방과후학교를 따로 신청하면 그 수강료는 본인 부담이고, 연말정산에서 15%를 돌려받습니다.', 'is-good');
    } else if (r.voucher) {
      setInsight(el.elemInsight, '초3 이용권은 <strong>연 50만원</strong>이지만 학교·교육청 여건에 따라 금액과 사용 범위가 조금 다를 수 있습니다. 방과후 자유수강권(저소득)과는 중복해서 쓸 수 있는 경우가 많습니다.');
    } else {
      setInsight(el.elemInsight, '초4 이상 확대는 2026년 하반기 성과를 보고 검토합니다. 지금은 수강료 전액 본인 부담이지만 <strong>방과후 수강료도 교육비 공제 15%</strong> 대상입니다.');
    }
  }

  function elemShareText() {
    var r = S.elemSupport(elemInput());
    var snack = state.elem.snack * r.months;
    return '[2026 초등 늘봄·방과후] 초' + r.grade + '\n' +
      '연간 지원 ' + won(r.support) + '원 / 실제 부담 ' + won(r.paid + snack) + '원\n' +
      '교육비 공제 예상 ' + won(r.credit) + '원\n' +
      (CFG.siteUrl || 'https://ufssdf987-creator.github.io/childcare-edu/');
  }

  /* ── 탭 3: 교육비 세액공제 ─────────────────────────────── */
  function eduMembers() {
    var list = [];
    state.edu.types.forEach(function (type, i) {
      if (type === 'none') return;
      list.push({ type: type, amount: state.edu.amts[i], slot: i + 1 });
    });
    if (state.edu.self > 0) list.push({ type: 'self', amount: state.edu.self, slot: 0 });
    if (state.edu.disabled > 0) list.push({ type: 'disabled', amount: state.edu.disabled, slot: 0 });
    return list;
  }

  function syncEduForm() {
    el.eduTax.value = state.edu.tax;
    el.eduTaxBadge.textContent = wonShort(state.edu.tax);
    state.edu.types.forEach(function (type, i) {
      syncGroup(el.eduTypeGroups[i], 'edu-type' + (i + 1), type);
      el.eduAmts[i].value = state.edu.amts[i];
      el.eduAmtBadges[i].textContent = wonShort(state.edu.amts[i]);
      if (el.eduAmtWraps[i]) el.eduAmtWraps[i].hidden = type === 'none';
    });
    el.eduSelf.value = state.edu.self;
    el.eduDisabled.value = state.edu.disabled;
    el.eduSelfBadge.textContent = wonShort(state.edu.self);
    el.eduDisabledBadge.textContent = wonShort(state.edu.disabled);
    syncChips('edu-tax', state.edu.tax);
  }

  function renderEdu() {
    var members = eduMembers();
    var r = S.eduCredit({ tax: state.edu.tax, members: members });

    el.eduTotal.textContent = won(r.credit);
    el.eduRefund.textContent = won(r.saved);
    var kinds = [];
    state.edu.types.forEach(function (t, i) {
      if (t === 'preschool') kinds.push('취학 전');
      if (t === 'school') kinds.push('초중고');
      if (t === 'college') kinds.push('대학생');
    });
    if (state.edu.self > 0) kinds.push('본인');
    if (state.edu.disabled > 0) kinds.push('장애 특수교육');
    el.eduSub.textContent = kinds.length ? kinds.join(' · ') + ' · 공제율 15%' : '교육비를 넣으면 바로 계산됩니다';

    if (!r.credit) setBadge(el.eduVerdict, '공제 없음', 0);
    else if (r.lost > 0) setBadge(el.eduVerdict, '산출세액 한도', 3);
    else if (r.capped.length) setBadge(el.eduVerdict, '한도 도달', 2);
    else setBadge(el.eduVerdict, '전액 반영', 1);

    var html = '';
    r.rows.forEach(function (item) {
      html += row(item.label, won(item.credit) + '원', '공제 대상 ' + won(item.eligible) + '원', 'is-deduct');
      if (item.over > 0) {
        html += row(item.label + ' 한도 초과', '−' + won(item.over) + '원', '공제되지 않음', 'is-warn');
      }
    });
    if (!r.rows.length) html += row('교육비 없음', '0원');
    if (r.lost > 0) html += row('산출세액 초과로 소멸', '−' + won(r.lost) + '원', '이월되지 않음', 'is-warn');
    el.eduRows.innerHTML = html;

    el.eduStatBase.textContent = wonShort(r.totalEligible);
    el.eduStatRate.textContent = pct(r.rate, 0);
    el.eduStatLeft.textContent = wonShort(r.leftTotal);
    el.eduStatApplied.textContent = wonShort(r.applied);

    var elig = [
      {
        ok: true,
        label: '가족 소득요건',
        note: '2026년 귀속부터 폐지 · 소득과 무관하게 공제'
      },
      {
        ok: r.capped.length === 0,
        label: '1명당 한도',
        note: r.capped.length ? '한도를 넘은 금액 ' + won(r.capped.reduce(function (a, b) { return a + b.over; }, 0)) + '원은 공제되지 않습니다' : '취학 전·초중고 300만원 · 대학생 900만원'
      },
      {
        ok: r.lost === 0,
        label: '산출세액',
        note: r.lost > 0 ? '산출세액이 모자라 ' + won(r.lost) + '원이 사라집니다' : '공제액을 모두 반영할 수 있습니다'
      },
      {
        ok: true,
        label: '증빙',
        note: '학교·유치원·어린이집은 간소화, 학원·체육시설은 납입증명서'
      }
    ];
    renderElig(el.eduElig, elig);

    if (!r.rows.length) {
      el.eduNextTitle.textContent = '교육비를 넣어 보세요';
      el.eduNext.innerHTML = '유치원·어린이집 보육비용, 방과후 수업료, 급식비, 학원비(취학 전·초1·2 예능)를 합친 <strong>학부모 부담분</strong>을 아이별로 넣으면 공제액이 계산됩니다.';
    } else if (r.lost > 0) {
      el.eduNextTitle.textContent = '산출세액이 모자랍니다';
      el.eduNext.innerHTML = '공제액 <strong>' + won(r.credit) + '원</strong> 중 <strong>' + won(r.lost) + '원</strong>이 사라집니다. 세액공제가 큰 항목(연금저축·IRP 16.5%, 월세 15%·17%)과 순서를 비교하고, 소득이 낮은 배우자에게 교육비를 몰아줄 수 있는지 확인하세요.';
    } else if (r.leftTotal > 0) {
      el.eduNextTitle.textContent = '한도가 남아 있습니다';
      el.eduNext.innerHTML = '1명당 한도까지 <strong>' + won(r.leftTotal) + '원</strong>이 남았습니다. 12월 31일까지 낼 학원비·방과후 수업료가 있으면 미리 내는 것이 유리합니다. 해를 넘기면 다음 해 공제가 됩니다.';
    } else {
      el.eduNextTitle.textContent = '한도를 모두 채웠습니다';
      el.eduNext.innerHTML = '더 낸 교육비는 공제되지 않습니다. <strong>교복 50만원·현장체험학습 30만원</strong>이 빠지지 않았는지, 학원 납입증명서를 빠뜨리지 않았는지 확인하세요.';
    }

    if (r.credit > 0) {
      setInsight(el.eduInsight, '교육비 공제는 <strong>낸 금액의 15%</strong>입니다. 취학 전·초중고 한도 300만원을 채우면 45만원, 지방소득세까지 49만 5천원이 줄어듭니다.', 'is-good');
    } else {
      setInsight(el.eduInsight, '2026년 귀속분부터 자녀의 소득과 관계없이 공제되고, <strong>초등 9세 미만·2학년 이하</strong>의 예능학원·체육시설 수강료도 대상입니다. 다만 영어·수학 학원은 해당되지 않습니다.');
    }

    renderEduScale();
  }

  function renderEduScale() {
    var list = S.eduScale(state.edu.tax);
    el.eduScaleBody.innerHTML = list.map(function (item) {
      var eligible = Math.min(item.amount, 3000000);
      return '<tr><th scope="row">' + wonShort(item.amount) + '</th><td>' + won(eligible) + '원</td><td>' +
        won(item.credit) + '원</td><td>' + won(item.saved) + '원</td></tr>';
    }).join('');
  }

  function eduShareText() {
    var r = S.eduCredit({ tax: state.edu.tax, members: eduMembers() });
    return '[2026 교육비 세액공제]\n' +
      '공제 대상 ' + won(r.totalEligible) + '원 → 세액공제 ' + won(r.credit) + '원\n' +
      '지방소득세 포함 절세 ' + won(r.saved) + '원\n' +
      (CFG.siteUrl || 'https://ufssdf987-creator.github.io/childcare-edu/');
  }

  /* ── 체크박스 ─────────────────────────────────────────── */
  function bindChecks() {
    $$('#careChecks input[type="checkbox"]').forEach(function (box) {
      box.addEventListener('change', function () {
        var key = box.getAttribute('data-check');
        if (key === 'c_after') state.care.after = box.checked;
        if (key === 'c_night') state.care.night = box.checked;
        if (key === 'c_low') state.care.low = box.checked;
        if (key === 'c_dis') state.care.disabled = box.checked;
        renderCare();
        persist();
      });
    });
    el.elemCare.addEventListener('change', function () {
      state.elem.care = el.elemCare.checked;
      renderElem();
      persist();
    });

    var boxes = $$('input[type="checkbox"]', el.gdList);
    function syncGuide() {
      var done = boxes.filter(function (b) { return b.checked; }).length;
      el.gdBar.style.width = (boxes.length ? done / boxes.length * 100 : 0) + '%';
      el.gdCount.textContent = done + ' / ' + boxes.length;
    }
    boxes.forEach(function (box) {
      var key = box.getAttribute('data-check');
      box.checked = !!state.checks[key];
      box.addEventListener('change', function () {
        if (box.checked) state.checks[key] = true;
        else delete state.checks[key];
        syncGuide();
        persist();
      });
    });
    el.gdReset.addEventListener('click', function () {
      boxes.forEach(function (b) { b.checked = false; delete state.checks[b.getAttribute('data-check')]; });
      syncGuide();
      persist();
      toast('체크를 모두 지웠습니다.');
    });
    syncGuide();
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
    el.promoHeading.textContent = coupang.heading || '아이 낮잠·등원 준비에 챙길 것';
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
  function bindCareEvents() {
    bindGroup(el.careAgeChips, 'care-age', function (value) {
      state.care.age = clamp(parseInt(value, 10), 0, 5);
      if (state.care.autoFee) state.care.fee = DEFAULT_FEE[state.care.facility][state.care.age];
      syncCareForm();
      renderCare();
      saveState();
    });
    bindGroup(el.careFacilityGroup, 'care-facility', function (value) {
      if (!FACILITY[value]) return;
      state.care.facility = value;
      if (state.care.autoFee) state.care.fee = DEFAULT_FEE[value][state.care.age];
      if (isKinder(value)) state.care.night = false;
      else state.care.after = false;
      if (value !== 'kinder_private') state.care.low = false;
      syncCareForm();
      renderCare();
      saveState();
    });

    el.careFee.addEventListener('input', function () {
      state.care.fee = readNum(el.careFee, state.care.fee, L.fee.min, L.fee.max);
      state.care.autoFee = false;
      el.careFeeBadge.textContent = wonShort(state.care.fee);
      syncChips('care-fee', state.care.fee);
      renderCare();
      saveState();
    });
    el.careExtra.addEventListener('input', function () {
      state.care.extra = readNum(el.careExtra, state.care.extra, L.extra.min, L.extra.max);
      el.careExtraBadge.textContent = wonShort(state.care.extra);
      renderCare();
      saveState();
    });
    el.careExtHours.addEventListener('input', function () {
      state.care.extHours = readNum(el.careExtHours, state.care.extHours, L.hours.min, L.hours.max);
      el.careExtBadge.textContent = state.care.extHours + '시간';
      syncChips('care-ext', state.care.extHours);
      renderCare();
      saveState();
    });

    $$('.chips [data-care-fee]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.care.fee = clamp(parseFloat(btn.getAttribute('data-care-fee')), L.fee.min, L.fee.max);
        state.care.autoFee = false;
        syncCareForm();
        renderCare();
        saveState();
      });
    });
    $$('.chips [data-care-ext]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.care.extHours = clamp(parseFloat(btn.getAttribute('data-care-ext')), L.hours.min, L.hours.max);
        syncCareForm();
        renderCare();
        saveState();
      });
    });

    el.careShare.addEventListener('click', function () { doShare(careShareText()); });
  }

  function bindElemEvents() {
    bindGroup(el.elemGradeChips, 'elem-grade', function (value) {
      state.elem.grade = clamp(parseInt(value, 10), 1, 6);
      syncElemForm();
      renderElem();
      saveState();
    });
    el.elemFee.addEventListener('input', function () {
      state.elem.fee = readNum(el.elemFee, state.elem.fee, L.fee.min, L.fee.max);
      el.elemFeeBadge.textContent = wonShort(state.elem.fee);
      syncChips('elem-fee', state.elem.fee);
      renderElem();
      saveState();
    });
    el.elemMonths.addEventListener('input', function () {
      state.elem.months = readNum(el.elemMonths, state.elem.months, 0, 12);
      el.elemMonthsBadge.textContent = state.elem.months + '개월';
      renderElem();
      saveState();
    });
    el.elemSnack.addEventListener('input', function () {
      var v = parseFloat(el.elemSnack.value);
      state.elem.snack = isFinite(v) ? clamp(v, 0, 300000) : 0;
      el.elemSnackBadge.textContent = wonShort(state.elem.snack);
      renderElem();
      saveState();
    });
    $$('.chips [data-elem-fee]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.elem.fee = clamp(parseFloat(btn.getAttribute('data-elem-fee')), L.fee.min, L.fee.max);
        syncElemForm();
        renderElem();
        saveState();
      });
    });
    el.elemShare.addEventListener('click', function () { doShare(elemShareText()); });
  }

  function bindEduEvents() {
    el.eduTax.addEventListener('input', function () {
      state.edu.tax = readNum(el.eduTax, state.edu.tax, L.tax.min, L.tax.max);
      el.eduTaxBadge.textContent = wonShort(state.edu.tax);
      syncChips('edu-tax', state.edu.tax);
      renderEdu();
      saveState();
    });
    $$('.chips [data-edu-tax]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.edu.tax = clamp(parseFloat(btn.getAttribute('data-edu-tax')), L.tax.min, L.tax.max);
        syncEduForm();
        renderEdu();
        saveState();
      });
    });

    state.edu.types.forEach(function (_, i) {
      bindGroup(el.eduTypeGroups[i], 'edu-type' + (i + 1), function (value) {
        state.edu.types[i] = value;
        syncEduForm();
        renderEdu();
        saveState();
      });
      el.eduAmts[i].addEventListener('input', function () {
        state.edu.amts[i] = readNum(el.eduAmts[i], state.edu.amts[i], L.amount.min, L.amount.max);
        el.eduAmtBadges[i].textContent = wonShort(state.edu.amts[i]);
        renderEdu();
        saveState();
      });
    });
    $$('.chips [data-edu-amt1]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.edu.amts[0] = clamp(parseFloat(btn.getAttribute('data-edu-amt1')), L.amount.min, L.amount.max);
        syncEduForm();
        renderEdu();
        saveState();
      });
    });

    el.eduSelf.addEventListener('input', function () {
      state.edu.self = readNum(el.eduSelf, state.edu.self, L.amount.min, L.amount.max);
      el.eduSelfBadge.textContent = wonShort(state.edu.self);
      renderEdu();
      saveState();
    });
    el.eduDisabled.addEventListener('input', function () {
      state.edu.disabled = readNum(el.eduDisabled, state.edu.disabled, L.amount.min, L.amount.max);
      el.eduDisabledBadge.textContent = wonShort(state.edu.disabled);
      renderEdu();
      saveState();
    });
    el.eduShare.addEventListener('click', function () { doShare(eduShareText()); });
  }

  function refresh() {
    syncCareForm();
    syncElemForm();
    syncEduForm();
    renderCare();
    renderElem();
    renderEdu();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    if (el.dataDate && S.RULES.verifiedAt) el.dataDate.textContent = S.RULES.verifiedAt;
    if (el.appVersion && CFG.version) el.appVersion.textContent = CFG.version;
    initTabs();
    refresh();
    bindCareEvents();
    bindElemEvents();
    bindEduEvents();
    bindChecks();
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
