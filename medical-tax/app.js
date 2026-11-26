/*!
 * app.js — 2026 의료비 세액공제 & 실손보험 차감 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.MTCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'mtc.state.v1';
  var THEME_KEY = 'ctx.theme';
  var TABS = ['basic', 'insurance', 'couple', 'guide'];

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

  function readInt(input, fallback, min, max) {
    var v = parseInt(input.value, 10);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'basic',
    salary: 50000000,
    family: 1,
    basic: {
      general: 2000000, self: 600000, special: 0, premature: 0, infertility: 0,
      glasses: 0, glassesPeople: 1, postpartum: 0, births: 1,
      insurance: 0, insuranceTarget: 'general'
    },
    insurance: {
      benefit: 500000, nonBenefit: 300000, visit: 'outpatient', hospital: 'clinic',
      generation: 4, severe: false, premium: 7500, prior: 0, threshold: true
    },
    couple: {
      salaryA: 60000000, salaryB: 35000000,
      selfA: 400000, selfB: 300000, shared: 3000000, claim: 'a'
    },
    checks: {}
  };

  var L = S.LIMITS;

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    var s = parseFloat(raw.salary);
    if (isFinite(s) && s >= 0) state.salary = clamp(s, L.salary.min, L.salary.max);
    var f = parseInt(raw.family, 10);
    if (isFinite(f) && f >= 1) state.family = clamp(f, 1, 4);

    var b = raw.basic;
    if (b && typeof b === 'object') {
      ['general', 'self', 'special', 'premature', 'infertility', 'glasses', 'postpartum', 'insurance'].forEach(function (key) {
        var v = parseFloat(b[key]);
        if (isFinite(v) && v >= 0) state.basic[key] = clamp(v, L.money.min, L.money.max);
      });
      var gp = parseFloat(b.glassesPeople);
      if (isFinite(gp) && gp >= 1) state.basic.glassesPeople = clamp(Math.round(gp), L.people.min, 4);
      var bt = parseFloat(b.births);
      if (isFinite(bt) && bt >= 1) state.basic.births = clamp(Math.round(bt), L.births.min, 3);
      if (b.insuranceTarget && S.catMeta(b.insuranceTarget)) state.basic.insuranceTarget = b.insuranceTarget;
    }

    var n = raw.insurance;
    if (n && typeof n === 'object') {
      var bn = parseFloat(n.benefit);
      if (isFinite(bn) && bn >= 0) state.insurance.benefit = clamp(bn, 0, L.money.max);
      var nb = parseFloat(n.nonBenefit);
      if (isFinite(nb) && nb >= 0) state.insurance.nonBenefit = clamp(nb, 0, L.money.max);
      if (n.visit === 'inpatient' || n.visit === 'outpatient') state.insurance.visit = n.visit;
      if (n.hospital === 'general' || n.hospital === 'clinic') state.insurance.hospital = n.hospital;
      var gen = parseInt(n.generation, 10);
      if (gen === 0 || gen === 4 || gen === 5) state.insurance.generation = gen;
      state.insurance.severe = !!n.severe;
      var pm = parseFloat(n.premium);
      if (isFinite(pm) && pm >= 0) state.insurance.premium = clamp(pm, 0, L.premium.max);
      var pr = parseFloat(n.prior);
      if (isFinite(pr) && pr >= 0) state.insurance.prior = clamp(pr, 0, L.money.max);
      state.insurance.threshold = n.threshold !== false;
    }

    var c = raw.couple;
    if (c && typeof c === 'object') {
      [['salaryA', L.salary], ['salaryB', L.salary], ['selfA', L.money], ['selfB', L.money], ['shared', L.money]]
        .forEach(function (pair) {
          var v = parseFloat(c[pair[0]]);
          if (isFinite(v) && v >= 0) state.couple[pair[0]] = clamp(v, pair[1].min, pair[1].max);
        });
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
    el.tabInsurance = $('#tabInsurance');
    el.tabCouple = $('#tabCouple');
    el.tabGuide = $('#tabGuide');
    el.panelBasic = $('#panelBasic');
    el.panelInsurance = $('#panelInsurance');
    el.panelCouple = $('#panelCouple');
    el.panelGuide = $('#panelGuide');

    /* 탭 1 */
    el.bsSalary = $('#bsSalary');
    el.bsSalaryBadge = $('#bsSalaryBadge');
    el.bsFamilyGroup = $('#bsFamilyGroup');
    el.bsThresholdHelp = $('#bsThresholdHelp');
    el.bsGeneral = $('#bsGeneral');
    el.bsGeneralBadge = $('#bsGeneralBadge');
    el.bsSelf = $('#bsSelf');
    el.bsSelfBadge = $('#bsSelfBadge');
    el.bsSpecial = $('#bsSpecial');
    el.bsSpecialBadge = $('#bsSpecialBadge');
    el.bsPremature = $('#bsPremature');
    el.bsPrematureBadge = $('#bsPrematureBadge');
    el.bsInfertility = $('#bsInfertility');
    el.bsInfertilityBadge = $('#bsInfertilityBadge');
    el.bsGlasses = $('#bsGlasses');
    el.bsGlassesBadge = $('#bsGlassesBadge');
    el.bsGlassesGroup = $('#bsGlassesGroup');
    el.bsGlassesPeopleBadge = $('#bsGlassesPeopleBadge');
    el.bsPostpartum = $('#bsPostpartum');
    el.bsPostpartumBadge = $('#bsPostpartumBadge');
    el.bsBirthsGroup = $('#bsBirthsGroup');
    el.bsBirthsBadge = $('#bsBirthsBadge');
    el.bsInsurance = $('#bsInsurance');
    el.bsInsuranceBadge = $('#bsInsuranceBadge');
    el.bsInsuranceTarget = $('#bsInsuranceTarget');
    el.bsCredit = $('#bsCredit');
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
    el.bsBreakTable = $('#bsBreakTable');
    el.bsRuleTable = $('#bsRuleTable');
    el.shareBasic = $('#shareBasic');

    /* 탭 2 */
    el.inBenefit = $('#inBenefit');
    el.inBenefitBadge = $('#inBenefitBadge');
    el.inNonBenefit = $('#inNonBenefit');
    el.inNonBenefitBadge = $('#inNonBenefitBadge');
    el.inVisitGroup = $('#inVisitGroup');
    el.inHospitalGroup = $('#inHospitalGroup');
    el.inGenGroup = $('#inGenGroup');
    el.inSevereRow = $('#inSevereRow');
    el.inSevere = $('#inSevere');
    el.inPremium = $('#inPremium');
    el.inPremiumBadge = $('#inPremiumBadge');
    el.inPrior = $('#inPrior');
    el.inPriorBadge = $('#inPriorBadge');
    el.inThreshold = $('#inThreshold');
    el.inPaid = $('#inPaid');
    el.inSub = $('#inSub');
    el.inVerdict = $('#inVerdict');
    el.inRows = $('#inRows');
    el.inStatSpend = $('#inStatSpend');
    el.inStatPaid = $('#inStatPaid');
    el.inStatLoss = $('#inStatLoss');
    el.inStatNet = $('#inStatNet');
    el.inNextTitle = $('#inNextTitle');
    el.inNext = $('#inNext');
    el.inInsight = $('#inInsight');
    el.inTierTable = $('#inTierTable');
    el.shareInsurance = $('#shareInsurance');

    /* 탭 3 */
    el.cpSalaryA = $('#cpSalaryA');
    el.cpSalaryABadge = $('#cpSalaryABadge');
    el.cpSalaryB = $('#cpSalaryB');
    el.cpSalaryBBadge = $('#cpSalaryBBadge');
    el.cpSelfA = $('#cpSelfA');
    el.cpSelfABadge = $('#cpSelfABadge');
    el.cpSelfB = $('#cpSelfB');
    el.cpSelfBBadge = $('#cpSelfBBadge');
    el.cpShared = $('#cpShared');
    el.cpSharedBadge = $('#cpSharedBadge');
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
      insurance: [el.tabInsurance, el.panelInsurance],
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
    el.tabInsurance.addEventListener('click', function () { setTab('insurance'); });
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
      b.classList.toggle('is-active', Number(b.getAttribute(dataKey(attr))) === Number(value));
    });
    function dataKey(a) { return 'data-' + a; }
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

  /* ── 탭 1: 의료비 세액공제 ───────────────────────────── */
  function basicInput() {
    return {
      salary: state.salary,
      general: state.basic.general,
      self: state.basic.self,
      familySpecial: state.basic.special,
      premature: state.basic.premature,
      infertility: state.basic.infertility,
      glasses: state.basic.glasses,
      glassesPeople: state.basic.glassesPeople,
      postpartum: state.basic.postpartum,
      births: state.basic.births,
      insurance: state.basic.insurance,
      insuranceTarget: state.basic.insuranceTarget
    };
  }

  function syncBasicForm() {
    el.bsSalary.value = state.salary;
    el.bsSalaryBadge.textContent = wonShort(state.salary);
    el.bsGeneral.value = state.basic.general;
    el.bsSelf.value = state.basic.self;
    el.bsSpecial.value = state.basic.special;
    el.bsPremature.value = state.basic.premature;
    el.bsInfertility.value = state.basic.infertility;
    el.bsGlasses.value = state.basic.glasses;
    el.bsPostpartum.value = state.basic.postpartum;
    el.bsInsurance.value = state.basic.insurance;
    el.bsGeneralBadge.textContent = wonShort(state.basic.general);
    el.bsSelfBadge.textContent = wonShort(state.basic.self);
    el.bsSpecialBadge.textContent = wonShort(state.basic.special);
    el.bsPrematureBadge.textContent = wonShort(state.basic.premature);
    el.bsInfertilityBadge.textContent = wonShort(state.basic.infertility);
    el.bsGlassesBadge.textContent = wonShort(state.basic.glasses);
    el.bsPostpartumBadge.textContent = wonShort(state.basic.postpartum);
    el.bsInsuranceBadge.textContent = wonShort(state.basic.insurance);
    el.bsGlassesPeopleBadge.textContent = state.basic.glassesPeople + '명';
    el.bsBirthsBadge.textContent = state.basic.births + '회';
    el.bsInsuranceTarget.value = state.basic.insuranceTarget;
    syncGroup(el.bsFamilyGroup, 'bs-family', state.family);
    syncGroup(el.bsGlassesGroup, 'bs-glasses-people', state.basic.glassesPeople >= 4 ? 4 : state.basic.glassesPeople);
    syncGroup(el.bsBirthsGroup, 'bs-births', state.basic.births);
    ['general', 'self', 'infertility', 'glasses', 'postpartum', 'insurance'].forEach(function (k) {
      syncChips('bs-' + k, state.basic[k]);
    });
    syncChips('bs-salary', state.salary);
  }

  function renderBasic() {
    var input = basicInput();
    var m = S.medicalCredit(input);
    var b = S.creditBenefit(input.salary, state.family, m.credit);

    el.bsThresholdHelp.innerHTML = '총급여의 3%인 <strong>' + won(m.threshold) + '원</strong>을 넘겨 쓴 금액부터 공제가 시작됩니다.';

    el.bsCredit.textContent = won(m.credit);
    el.bsSub.textContent = wonShort(input.salary) + ' · 문턱 ' + wonShort(m.threshold) +
      (m.passed ? ' · 초과 ' + wonShort(m.over) : ' · 미달 ' + wonShort(m.gap)) +
      (m.insuranceUsed > 0 ? ' · 실손 ' + wonShort(m.insuranceUsed) + ' 차감' : '');
    el.bsRefund.textContent = won(b.total) + '원';

    if (!m.passed) {
      setBadge(el.bsVerdict, '문턱 미달', 3);
    } else if (b.capped) {
      setBadge(el.bsVerdict, '산출세액 한도', 3);
    } else if (m.generalForfeit > 0) {
      setBadge(el.bsVerdict, '700만 한도 도달', 1);
    } else {
      setBadge(el.bsVerdict, '문턱 통과', 2);
    }

    var usedTotal = m.used.general + m.used.special + m.used.premature + m.used.infertility;
    var html = '';
    html += row('올해 낸 병원비', won(m.spendTotal) + '원', '실손 받기 전', 'is-dim');
    if (m.insuranceUsed > 0) {
      html += row('실손보험금 차감', '-' + won(m.insuranceUsed) + '원',
        m.insuranceUnused > 0 ? '병원비보다 커서 ' + won(m.insuranceUnused) + '원 미반영' : '보전받은 금액');
    }
    html += row('3% 문턱 차감', '-' + won(usedTotal) + '원',
      m.thresholdShort > 0 ? '문턱에 ' + won(m.thresholdShort) + '원 부족' : '총급여의 3%');
    if (m.generalForfeit > 0) {
      html += row('일반 700만원 초과', '-' + won(m.generalForfeit) + '원', '한도 밖', 'is-dim');
    }
    html += row('공제 대상금액', won(m.deductible) + '원', '구분별 공제율 적용 전');
    html += row('세액공제', won(m.credit) + '원', '15%·20%·30%', 'total');
    el.bsRows.innerHTML = html;

    el.bsStatSpend.textContent = won(m.spendTotal) + '원';
    el.bsStatThreshold.textContent = won(m.threshold) + '원';
    el.bsStatGap.textContent = m.passed ? '통과 +' + wonShort(m.over) : won(m.gap) + '원';
    el.bsStatRoom.textContent = won(m.generalRoom) + '원';

    var ratio = m.threshold > 0 ? Math.min(1, m.afterInsurance / m.threshold) : 1;
    el.bsMeterFill.style.width = (ratio * 100).toFixed(1) + '%';
    el.bsMeterFill.setAttribute('data-tone', !m.passed ? 'warn' : (m.passed ? 'full' : ''));
    el.bsMeterLeft.textContent = '문턱 ' + Math.round(ratio * 100) + '%';
    el.bsMeterRight.textContent = '문턱 ' + wonShort(m.threshold);

    /* 다음에 할 일 */
    var nextTitle = '다음에 할 일';
    var next = '';
    if (!m.passed) {
      nextTitle = '아직 문턱 전';
      next = '문턱까지 <strong>' + won(m.gap) + '원</strong>이 남았습니다. 남은 기간에 예정된 진료·검진·안경·치과 치료가 있다면 12월 31일 전에 받는 편이 낫습니다. ' +
        '문턱을 못 넘으면 어떤 의료비를 넣어도 공제는 0원입니다.';
    } else if (b.capped) {
      nextTitle = '산출세액이 먼저입니다';
      next = '계산된 세액공제 <strong>' + won(m.credit) + '원</strong>이 추정 산출세액 ' + won(b.incomeTax) +
        '원을 넘어, 실제로는 <strong>' + won(b.applied) + '원</strong>까지만 반영됩니다. 다른 소득·공제에 따라 달라지니 원천징수영수증으로 확인하세요.';
    } else if (m.generalForfeit > 0) {
      nextTitle = '일반 의료비는 한도를 채웠습니다';
      next = '일반 부양가족 의료비는 700만원까지만 공제됩니다. 넘은 <strong>' + won(m.generalForfeit) +
        '원</strong>은 버려지지만, <strong>본인·6세 이하·65세 이상·장애인·난임시술비</strong>는 한도가 없으니 따로 입력하면 그대로 더 붙습니다.';
    } else if (m.generalRoom > 0) {
      nextTitle = '일반 의료비 한도가 남았습니다';
      next = '일반 의료비 공제 대상금액이 <strong>' + won(m.generalRoom) + '원</strong> 남았습니다. 12월에 안경·치과·검진을 예정하고 있다면 올해 안에 쓰면 ' +
        pct(S.RULES.rates.general, 0) + '만큼 더 돌려받습니다.';
    } else {
      nextTitle = '한도를 모두 채웠습니다';
      next = '올해 의료비 공제는 최대치입니다. 더 써도 공제는 늘지 않으니, 남은 진료는 내년으로 미루고 카드·실손 혜택으로 판단하세요.';
    }
    el.bsNextTitle.textContent = nextTitle;
    el.bsNext.innerHTML = next;

    /* 인사이트 */
    var ins;
    if (m.insuranceUsed > 0 && !m.passed) {
      ins = '실손보험금 ' + won(m.insuranceUsed) + '원을 받아 문턱 아래로 내려갔습니다. 보험금을 받지 않았다면 공제가 붙었겠지만, ' +
        '받은 보험금이 줄어든 세액보다 훨씬 큽니다. 공제 손실은 보험금의 약 16.5%뿐입니다.';
      setInsight(el.bsInsight, ins, 'is-warn');
    } else if (!m.passed) {
      ins = '지금 병원비로는 문턱을 넘지 못해 공제가 0원입니다. 문턱 ' + won(m.gap) + '원을 채우면 그때부터 15~30%가 붙습니다.';
      setInsight(el.bsInsight, ins, 'is-warn');
    } else {
      var parts = [];
      if (m.used.general > 0) {
        parts.push('일반 의료비에서 ' + won(m.used.general) + '원이 문턱에 깎였습니다(공제율이 가장 낮은 항목부터). ');
      }
      if (m.used.infertility === 0 && m.spent.infertility > 0) {
        parts.push('난임시술비는 30%가 그대로 살아남았습니다. ');
      }
      if (m.insuranceUsed > 0) {
        parts.push('실손보험금 ' + won(m.insuranceUsed) + '원만큼 의료비가 줄어 공제가 ' + won(m.insuranceUsed * 0.15) + '원 줄었습니다. ');
      }
      if (m.glassesOver > 0) {
        parts.push('안경은 1명당 50만원까지만 인정되어 ' + won(m.glassesOver) + '원이 빠졌습니다. ');
      }
      if (m.postpartumOver > 0) {
        parts.push('산후조리원은 출산 1회당 200만원까지만 인정되어 ' + won(m.postpartumOver) + '원이 빠졌습니다. ');
      }
      parts.push('세액공제라서 공제액만큼 세금이 바로 줄고, 지방소득세 10%를 더하면 약 ' + won(b.total) + '원입니다.');
      setInsight(el.bsInsight, parts.join(''), 'is-ok');
    }

    /* 구분별 내역 표 */
    var tbody = '';
    var spendOf = {
      general: m.spent.general + m.glassesAllowed + m.postpartumAllowed,
      special: m.spent.self + m.spent.familySpecial,
      premature: m.spent.premature,
      infertility: m.spent.infertility
    };
    S.CATS.forEach(function (cat) {
      tbody += '<tr' +
        (m.creditBase[cat.key] > 0 ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + cat.short + '</th>' +
        '<td>' + wonShort(spendOf[cat.key]) + '</td>' +
        '<td>' + (m.insUsed[cat.key] > 0 ? '-' + wonShort(m.insUsed[cat.key]) : '—') + '</td>' +
        '<td>' + (m.used[cat.key] > 0 ? '-' + wonShort(m.used[cat.key]) : '—') + '</td>' +
        '<td>' + wonShort(m.creditBase[cat.key]) + '</td>' +
        '<td><strong>' + wonShort(m.byCat[cat.key]) + '</strong></td></tr>';
    });
    tbody += '<tr><th scope="row">합계</th><td>' + wonShort(m.spendTotal) + '</td><td>' +
      (m.insuranceUsed > 0 ? '-' + wonShort(m.insuranceUsed) : '—') + '</td><td>' +
      (usedTotal > 0 ? '-' + wonShort(usedTotal) : '—') + '</td><td>' + wonShort(m.deductible) +
      '</td><td><strong>' + wonShort(m.credit) + '</strong></td></tr>';
    $('tbody', el.bsBreakTable).innerHTML = tbody;

    /* 공제율·한도 표 */
    var ruleRows = '';
    S.CATS.forEach(function (cat) {
      ruleRows += '<tr' + (m.creditBase[cat.key] > 0 ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + cat.short + '</th>' +
        '<td>' + pct(cat.rate, 0) + '</td>' +
        '<td>' + (cat.limit ? won(cat.limit) + '원' : '한도 없음') + '</td>' +
        '<td>' + won(m.byCat[cat.key]) + '</td></tr>';
    });
    ruleRows += '<tr><th scope="row">안경·콘택트렌즈</th><td>15%</td><td>1명당 ' +
      won(S.RULES.glassesLimit) + '원</td><td>일반에 포함</td></tr>';
    ruleRows += '<tr><th scope="row">산후조리원</th><td>15%</td><td>출산 1회당 ' +
      won(S.RULES.postpartumLimit) + '원</td><td>일반에 포함</td></tr>';
    $('tbody', el.bsRuleTable).innerHTML = ruleRows;
  }

  function basicShareText() {
    var input = basicInput();
    var m = S.medicalCredit(input);
    var b = S.creditBenefit(input.salary, state.family, m.credit);
    return '[의료비 세액공제 2026]\n' +
      '총급여 ' + wonShort(input.salary) + ' · 3% 문턱 ' + wonShort(m.threshold) + '\n' +
      '병원비 ' + wonShort(m.spendTotal) + (m.insuranceUsed > 0 ? ' (실손 ' + wonShort(m.insuranceUsed) + ' 차감)' : '') + '\n' +
      '공제 대상 ' + won(m.deductible) + '원 · 세액공제 ' + won(m.credit) + '원\n' +
      '예상 절세 ' + won(b.total) + '원 (지방소득세 포함)\n' +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/medical-tax/');
  }

  /* ── 탭 2: 실손 vs 공제 ──────────────────────────────── */
  function insuranceInput() {
    return {
      benefit: state.insurance.benefit,
      nonBenefit: state.insurance.nonBenefit,
      visit: state.insurance.visit,
      hospital: state.insurance.hospital,
      generation: state.insurance.generation,
      severe: state.insurance.severe,
      monthlyPremium: state.insurance.premium,
      priorNonBenefit: state.insurance.prior,
      thresholdPassed: state.insurance.threshold
    };
  }

  function syncInsuranceForm() {
    el.inBenefit.value = state.insurance.benefit;
    el.inNonBenefit.value = state.insurance.nonBenefit;
    el.inPremium.value = state.insurance.premium;
    el.inPrior.value = state.insurance.prior;
    el.inBenefitBadge.textContent = wonShort(state.insurance.benefit);
    el.inNonBenefitBadge.textContent = wonShort(state.insurance.nonBenefit);
    el.inPremiumBadge.textContent = wonShort(state.insurance.premium);
    el.inPriorBadge.textContent = wonShort(state.insurance.prior);
    el.inThreshold.checked = !!state.insurance.threshold;
    el.inSevere.checked = !!state.insurance.severe;
    el.inSevereRow.hidden = state.insurance.generation !== 5;
    syncGroup(el.inVisitGroup, 'in-visit', state.insurance.visit);
    syncGroup(el.inHospitalGroup, 'in-hospital', state.insurance.hospital);
    syncGroup(el.inGenGroup, 'in-gen', state.insurance.generation);
    syncChips('in-non', state.insurance.nonBenefit);
  }

  function renderInsurance() {
    var p = S.insurancePlan(insuranceInput());
    el.inPaid.textContent = won(p.paid);
    el.inSub.textContent = '급여 ' + wonShort(p.benefit) + ' · 비급여 ' + wonShort(p.nonBenefit) +
      ' · 내 부담 ' + wonShort(p.selfPay);

    if (p.claimAdvice === 'claim') setBadge(el.inVerdict, '청구 유리', 1);
    else if (p.claimAdvice === 'even') setBadge(el.inVerdict, '차이 없음', 2);
    else setBadge(el.inVerdict, '청구 신중', 3);

    var html = '';
    html += row('급여 보험금', won(p.benefitPaid) + '원', '자기부담 20% · 통원 최소공제');
    html += row('비급여 보험금', won(p.nonBenefitPaid) + '원', '자기부담 ' + pct(p.selfPayRate, 0));
    html += row('내가 부담하는 금액', won(p.selfPay) + '원', '공제 대상으로 남음', 'is-dim');
    html += row('세액공제 손실', '-' + won(p.creditLoss) + '원',
      p.creditLoss > 0 ? '보험금의 16.5%(지방세 포함)' : '문턱 미달 → 손실 없음');
    if (p.premiumCost > 0) {
      html += row('보험료 할증', '-' + won(p.premiumCost) + '원', p.tier.label + ' · 연간', 'is-dim');
    }
    html += row('청구 순이익', (p.net >= 0 ? '+' : '') + won(p.net) + '원', '보험금 − 공제 손실 − 할증', 'total');
    el.inRows.innerHTML = html;

    el.inStatSpend.textContent = won(p.benefit + p.nonBenefit) + '원';
    el.inStatPaid.textContent = won(p.paid) + '원';
    el.inStatLoss.textContent = won(p.creditLoss) + '원';
    el.inStatNet.textContent = (p.net >= 0 ? '+' : '') + won(p.net) + '원';

    var nextTitle = '이번 청구 판단';
    var next = '';
    if (p.paid === 0) {
      nextTitle = '받을 보험금이 없습니다';
      next = '통원 최소공제금액(의원 1만원·상급종합 2만원, 비급여 3만원)에 걸려 지급액이 0원입니다. 이럴 때는 청구하지 않아도 결과가 같습니다.';
    } else if (p.claimAdvice === 'claim') {
      nextTitle = '청구하세요';
      next = '보험금 <strong>' + won(p.paid) + '원</strong>을 받고 세액공제는 <strong>' + won(p.creditLoss) +
        '원</strong> 줄어, 순이익은 <strong>' + won(p.net) + '원</strong>입니다.' +
        (p.tier.step >= 3 ? ' 다만 비급여 누적이 ' + won(p.cumulativeNonBenefit) + '원이 되어 다음 갱신 때 특약보험료가 ' + p.tier.label + '됩니다. 연간 ' + won(p.premiumCost) + '원을 감안해도 청구가 유리합니다.' : '');
    } else {
      nextTitle = '청구를 미루거나 나눠 보세요';
      next = '보험금 <strong>' + won(p.paid) + '원</strong>보다 할증·공제 손실 <strong>' + won(p.creditLoss + p.premiumCost) +
        '원</strong>이 큽니다. 비급여 누적을 100만원 미만으로 유지하면 할증을 피할 수 있으니, 청구 시점을 나눠 보세요.';
    }
    el.inNextTitle.textContent = nextTitle;
    el.inNext.innerHTML = next;

    var ins;
    if (!state.insurance.threshold) {
      ins = '올해 의료비가 3% 문턱을 못 넘었다면 보험금을 받아도 세액공제 손실이 없습니다. 이 경우 청구하지 않을 이유가 거의 없습니다.';
      setInsight(el.inInsight, ins, 'is-ok');
    } else if (p.tier.step >= 3) {
      ins = '비급여 보험금이 ' + won(p.cumulativeNonBenefit) + '원 누적되어 ' + p.tier.label +
        ' 구간입니다. 할증은 <strong>비급여 특약 보험료에만</strong> 붙고 급여 주계약은 그대로입니다. 등급은 1년마다 초기화되니, 다음 해 비급여를 쓰지 않으면 다시 할인 구간으로 돌아옵니다.';
      setInsight(el.inInsight, ins, 'is-warn');
    } else if (p.tier.step === 2) {
      ins = '비급여 누적 ' + won(p.cumulativeNonBenefit) + '원으로 2단계(유지)입니다. 100만원 미만이면 할증이 없고, 0원이면 다음 갱신 때 특약보험료 할인을 받습니다. ' +
        '청구로 잃는 할인은 연 ' + won(p.premiumCost) + '원 수준입니다.';
      setInsight(el.inInsight, ins, '');
    } else {
      ins = '실손보험금은 소득이 아니어서 세금이 붙지 않습니다. 줄어드는 것은 의료비 세액공제뿐이고, 그 크기는 보험금의 16.5%입니다.';
      setInsight(el.inInsight, ins, 'is-ok');
    }

    /* 차등제 표 */
    var tiers = S.RULES.insurance.tiers;
    var tbody = '';
    tiers.forEach(function (t, i) {
      var range = t.step === 1 ? '0원' :
        (t.upTo === 1000000 ? '0원 초과 ~ 100만원 미만' :
          (t.upTo === 1500000 ? '100만 ~ 150만원' :
            (t.upTo === 3000000 ? '150만 ~ 300만원' : '300만원 이상')));
      var factor = t.discount ? -S.RULES.insurance.discountRate : t.surcharge;
      var money = p.monthlyPremium * 12 * factor;
      tbody += '<tr' + (t.step === p.tier.step && state.insurance.prior >= 0 ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + t.step + '단계</th><td>' + range + '</td>' +
        '<td>' + (t.discount ? '약 5% 할인' : (t.surcharge ? '+' + pct(t.surcharge, 0) + ' 할증' : '그대로')) + '</td>' +
        '<td>' + (money === 0 ? '—' : (money > 0 ? '+' : '') + won(money) + '원') + '</td></tr>';
    });
    $('tbody', el.inTierTable).innerHTML = tbody;
  }

  function insuranceShareText() {
    var p = S.insurancePlan(insuranceInput());
    return '[실손 청구 vs 의료비 공제]\n' +
      '병원비 ' + wonShort(p.benefit + p.nonBenefit) + ' (급여 ' + wonShort(p.benefit) + ' · 비급여 ' + wonShort(p.nonBenefit) + ')\n' +
      '실손보험금 ' + won(p.paid) + '원 · 세액공제 손실 ' + won(p.creditLoss) + '원\n' +
      '보험료 할증 ' + won(p.premiumCost) + '원 · 청구 순이익 ' + won(p.net) + '원\n' +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/medical-tax/');
  }

  /* ── 탭 3: 부부 몰아주기 ─────────────────────────────── */
  function coupleInput() {
    return {
      aSalary: state.couple.salaryA,
      bSalary: state.couple.salaryB,
      aSelf: state.couple.selfA,
      bSelf: state.couple.selfB,
      shared: state.couple.shared,
      claim: state.couple.claim
    };
  }

  function syncCoupleForm() {
    el.cpSalaryA.value = state.couple.salaryA;
    el.cpSalaryB.value = state.couple.salaryB;
    el.cpSelfA.value = state.couple.selfA;
    el.cpSelfB.value = state.couple.selfB;
    el.cpShared.value = state.couple.shared;
    el.cpSalaryABadge.textContent = wonShort(state.couple.salaryA);
    el.cpSalaryBBadge.textContent = wonShort(state.couple.salaryB);
    el.cpSelfABadge.textContent = wonShort(state.couple.selfA);
    el.cpSelfBBadge.textContent = wonShort(state.couple.selfB);
    el.cpSharedBadge.textContent = wonShort(state.couple.shared);
    syncGroup(el.cpClaimGroup, 'cp-claim', state.couple.claim);
    syncChips('cp-shared', state.couple.shared);
  }

  function renderCouple() {
    var input = coupleInput();
    var plan = S.couplePlan(input);
    var chosen = plan.chosen;
    var best = plan.best;
    var gain = Math.max(0, best.saving - chosen.saving);

    el.cpGain.textContent = won(gain);
    el.cpBestLabel.textContent = gain > 0 ? '지금보다 더 돌려받는 세금' : '지금 배분이 이미 최적';
    el.cpSub.textContent = 'A ' + wonShort(plan.aSalary) + ' · B ' + wonShort(plan.bSalary) +
      ' · 자녀·부모 의료비 ' + wonShort(plan.shared) + ' · 절세 합계 ' + won(best.saving) + '원';

    if (gain <= 0) {
      setBadge(el.cpVerdict, '차이 없음', 2);
    } else {
      setBadge(el.cpVerdict, (plan.bestSide === 'a' ? 'A' : 'B') + ' 유리', 1);
    }

    el.cpBestTitle.textContent = '추천';
    var bt;
    if (plan.shared === 0) {
      bt = '자녀·부모님 의료비를 입력하면 <strong>누구에게 몰아줄 때 유리한지</strong> 계산합니다.';
    } else if (gain <= 0) {
      bt = '지금처럼 <strong>' + (state.couple.claim === 'a' ? 'A' : 'B') + '가 지출·기본공제</strong>하는 배분이 가장 유리합니다. ' +
        '예상 절세 합계 ' + won(best.saving) + '원.';
    } else {
      bt = '<strong>' + (plan.bestSide === 'a' ? 'A' : 'B') + '에게 몰아주세요.</strong> ' +
        '자녀·부모님 의료비 ' + won(plan.shared) + '원을 기본공제를 받는 쪽이 직접 지출하면, ' +
        '지금보다 <strong>' + won(gain) + '원</strong>을 더 돌려받습니다(절세 합계 ' + won(best.saving) + '원).';
    }
    el.cpBestText.innerHTML = bt;

    var maxSaving = Math.max(plan.byA.saving, plan.byB.saving, 1);
    var rows = '';
    plan.scenarios.forEach(function (s) {
      var cls = [];
      if (s.key === plan.best.key) cls.push('is-best');
      if (s.key === 'mismatch') cls.push('is-min');
      var width = Math.max(2, s.saving / maxSaving * 100);
      rows += '<div class="compare-row' + (cls.length ? ' ' + cls.join(' ') : '') + '">' +
        '<div class="compare-top"><span class="compare-name">' + s.name + '</span>' +
        '<strong>' + won(s.saving) + '원</strong></div>' +
        '<div class="compare-bar"><i style="width:' + width.toFixed(1) + '%"></i></div>' +
        '<p class="compare-note">A 공제 ' + won(s.a.credit) + '원 · B 공제 ' + won(s.b.credit) + '원 · ' + s.note + '</p></div>';
    });
    el.cpRows.innerHTML = rows;

    el.cpStatA.textContent = won(chosen.a.saving) + '원';
    el.cpStatB.textContent = won(chosen.b.saving) + '원';
    el.cpStatGapA.textContent = chosen.a.passed ? '통과' : won(chosen.a.gap) + '원';
    el.cpStatGapB.textContent = chosen.b.passed ? '통과' : won(chosen.b.gap) + '원';

    var ins;
    if (gain > 0) {
      ins = '세액공제율은 두 사람 모두 15%로 같습니다. 차이는 <strong>3% 문턱</strong>에서 나옵니다. 총급여 ' +
        wonShort(plan.bestSide === 'a' ? plan.aSalary : plan.bSalary) + '인 쪽의 문턱은 ' +
        won(plan.thresholds[plan.bestSide]) + '원으로 ' +
        wonShort(plan.bestSide === 'a' ? plan.bSalary : plan.aSalary) + '인 쪽(' +
        won(plan.thresholds[plan.bestSide === 'a' ? 'b' : 'a']) + '원)보다 낮아 같은 지출로도 공제가 더 붙습니다.';
      setInsight(el.cpInsight, ins, 'is-ok');
    } else if (plan.shared === 0) {
      setInsight(el.cpInsight, '자녀·부모님 의료비를 넣으면 몰아주기 효과를 계산합니다.', '');
    } else {
      ins = '두 사람의 총급여가 비슷하거나 지금 배분이 이미 문턱·한도를 잘 쓰고 있어 바꿔도 차이가 없습니다. ' +
        '자녀 기본공제를 누가 받는지는 다른 공제(자녀세액공제·교육비)까지 함께 보고 정하세요.';
      setInsight(el.cpInsight, ins, '');
    }

    var tbody = '';
    [
      { key: 'byA', s: plan.byA },
      { key: 'byB', s: plan.byB },
      { key: 'mismatch', s: plan.mismatch }
    ].forEach(function (item) {
      var s = item.s;
      var label = item.key === 'byA' ? 'A에게 몰아주기' : (item.key === 'byB' ? 'B에게 몰아주기' : '지출자≠기본공제자');
      tbody += '<tr' + (item.key === plan.best.key ? ' class="is-now"' : '') + '>' +
        '<th scope="row">' + label + '</th>' +
        '<td>' + won(s.a.credit) + '</td>' +
        '<td>' + won(s.b.credit) + '</td>' +
        '<td><strong>' + won(s.saving) + '</strong></td></tr>';
    });
    $('tbody', el.cpTable).innerHTML = tbody;
  }

  function coupleShareText() {
    var plan = S.couplePlan(coupleInput());
    return '[부부 의료비 몰아주기]\n' +
      'A ' + wonShort(plan.aSalary) + ' · B ' + wonShort(plan.bSalary) + ' · 자녀·부모 의료비 ' + wonShort(plan.shared) + '\n' +
      '추천: ' + (plan.bestSide === 'a' ? 'A' : 'B') + '에게 몰아주기 → 절세 ' + won(plan.best.saving) + '원\n' +
      '지금 배분 대비 +' + won(Math.max(0, plan.best.saving - plan.chosen.saving)) + '원\n' +
      '계산: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/medical-tax/');
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
    el.promoHeading.textContent = coupang.heading || '환급금으로 채우는 겨울';
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
      renderBasic();
      saveState();
    });
    bindGroup(el.bsFamilyGroup, 'bs-family', function (v) {
      state.family = parseInt(v, 10) || 1;
      syncBasicForm();
      renderBasic();
      saveState();
    });
    bindGroup(el.bsGlassesGroup, 'bs-glasses-people', function (v) {
      state.basic.glassesPeople = parseInt(v, 10) || 1;
      syncBasicForm();
      renderBasic();
      saveState();
    });
    bindGroup(el.bsBirthsGroup, 'bs-births', function (v) {
      state.basic.births = parseInt(v, 10) || 1;
      syncBasicForm();
      renderBasic();
      saveState();
    });

    var map = {
      general: el.bsGeneral, self: el.bsSelf, special: el.bsSpecial,
      premature: el.bsPremature, infertility: el.bsInfertility,
      glasses: el.bsGlasses, postpartum: el.bsPostpartum, insurance: el.bsInsurance
    };
    Object.keys(map).forEach(function (key) {
      var input = map[key];
      input.addEventListener('input', function () {
        state.basic[key] = readNum(input, state.basic[key], L.money.min, L.money.max);
        el['bs' + key.charAt(0).toUpperCase() + key.slice(1) + 'Badge'].textContent = wonShort(state.basic[key]);
        renderBasic();
        saveState();
      });
    });
    el.bsInsuranceTarget.addEventListener('change', function () {
      state.basic.insuranceTarget = el.bsInsuranceTarget.value;
      renderBasic();
      saveState();
    });

    $$('.chips [data-bs-salary]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.salary = Number(b.getAttribute('data-bs-salary'));
        syncBasicForm();
        renderBasic();
        saveState();
      });
    });
    ['general', 'self', 'infertility', 'glasses', 'postpartum', 'insurance'].forEach(function (key) {
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

  function bindInsuranceEvents() {
    el.inBenefit.addEventListener('input', function () {
      state.insurance.benefit = readNum(el.inBenefit, state.insurance.benefit, 0, L.money.max);
      el.inBenefitBadge.textContent = wonShort(state.insurance.benefit);
      renderInsurance();
      saveState();
    });
    el.inNonBenefit.addEventListener('input', function () {
      state.insurance.nonBenefit = readNum(el.inNonBenefit, state.insurance.nonBenefit, 0, L.money.max);
      el.inNonBenefitBadge.textContent = wonShort(state.insurance.nonBenefit);
      renderInsurance();
      saveState();
    });
    el.inPremium.addEventListener('input', function () {
      state.insurance.premium = readNum(el.inPremium, state.insurance.premium, 0, L.premium.max);
      el.inPremiumBadge.textContent = wonShort(state.insurance.premium);
      renderInsurance();
      saveState();
    });
    el.inPrior.addEventListener('input', function () {
      state.insurance.prior = readNum(el.inPrior, state.insurance.prior, 0, L.money.max);
      el.inPriorBadge.textContent = wonShort(state.insurance.prior);
      renderInsurance();
      saveState();
    });
    el.inThreshold.addEventListener('change', function () {
      state.insurance.threshold = el.inThreshold.checked;
      renderInsurance();
      saveState();
    });
    el.inSevere.addEventListener('change', function () {
      state.insurance.severe = el.inSevere.checked;
      renderInsurance();
      saveState();
    });
    bindGroup(el.inVisitGroup, 'in-visit', function (v) {
      state.insurance.visit = v === 'inpatient' ? 'inpatient' : 'outpatient';
      syncInsuranceForm();
      renderInsurance();
      saveState();
    });
    bindGroup(el.inHospitalGroup, 'in-hospital', function (v) {
      state.insurance.hospital = v === 'general' ? 'general' : 'clinic';
      syncInsuranceForm();
      renderInsurance();
      saveState();
    });
    bindGroup(el.inGenGroup, 'in-gen', function (v) {
      state.insurance.generation = parseInt(v, 10);
      syncInsuranceForm();
      renderInsurance();
      saveState();
    });
    $$('.chips [data-in-non]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.insurance.nonBenefit = Number(b.getAttribute('data-in-non'));
        syncInsuranceForm();
        renderInsurance();
        saveState();
      });
    });
    el.shareInsurance.addEventListener('click', function () { doShare(insuranceShareText()); });
  }

  function bindCoupleEvents() {
    [['salaryA', el.cpSalaryA], ['salaryB', el.cpSalaryB],
      ['selfA', el.cpSelfA], ['selfB', el.cpSelfB], ['shared', el.cpShared]]
      .forEach(function (pair) {
        var key = pair[0];
        var input = pair[1];
        input.addEventListener('input', function () {
          var limit = (key === 'salaryA' || key === 'salaryB') ? L.salary : L.money;
          state.couple[key] = readNum(input, state.couple[key], limit.min, limit.max);
          el['cp' + key.charAt(0).toUpperCase() + key.slice(1) + 'Badge'].textContent = wonShort(state.couple[key]);
          renderCouple();
          saveState();
        });
      });
    bindGroup(el.cpClaimGroup, 'cp-claim', function (v) {
      state.couple.claim = v === 'b' ? 'b' : 'a';
      syncCoupleForm();
      renderCouple();
      saveState();
    });
    $$('.chips [data-cp-shared]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.couple.shared = Number(b.getAttribute('data-cp-shared'));
        syncCoupleForm();
        renderCouple();
        saveState();
      });
    });
    el.shareCouple.addEventListener('click', function () { doShare(coupleShareText()); });
  }

  function refresh() {
    syncBasicForm();
    syncInsuranceForm();
    syncCoupleForm();
    renderBasic();
    renderInsurance();
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
    bindInsuranceEvents();
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
