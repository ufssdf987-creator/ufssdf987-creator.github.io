/*!
 * app.js — 2026 연봉·월급 실수령액 계산기 화면 제어
 * 계산은 calc.js(SNCalc)가 담당합니다. 이 파일은 입력·표시만 다룹니다.
 */
(function () {
  'use strict';

  var C = window.SNCalc;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var nf = new Intl.NumberFormat('ko-KR');

  function won(n) {
    var v = Math.round(Math.abs(n));
    return nf.format(v) + '원';
  }
  function man(n) {
    var v = Math.round(n / 10000);
    return nf.format(v) + '만원';
  }
  function pct(rate) {
    return (rate * 100).toFixed(1) + '%';
  }
  function floorTo(n, unit) {
    return Math.floor(n / unit + 1e-6) * unit;
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var STORE = 'sn.state.v1';
  var state = {
    salary: 5000,          // 만원
    target: 300,           // 만원
    dependents: 0,
    children: 0,
    mealOn: true,
    car: 0,                // 만원 (월, 최대 20)
    childcare: 0,          // 만원 (월, 최대 10)
    tab: 'salary'
  };

  var el = {};

  function cacheEls() {
    el.salary = $('#salary-input');
    el.salaryWon = $('#salary-won');
    el.target = $('#target-input');
    el.targetWon = $('#target-won');
    el.mealOn = $('#meal-on');
    el.car = $('#car-input');
    el.childcare = $('#childcare-input');
    el.netTitle = $('#net-title');
    el.netSub = $('#net-sub');
    el.statAnnualNet = $('#stat-annual-net');
    el.statSocial = $('#stat-social');
    el.statTax = $('#stat-tax');
    el.statRate = $('#stat-rate');
    el.statRateNote = $('#stat-rate-note');
    el.payslipBody = $('#payslip-body');
    el.payslipTotal = $('#payslip-total');
    el.raiseBody = $('#raise-body');
    el.raiseNote = $('#raise-note');
    el.breakdownBody = $('#breakdown-body');
    el.reverseTitle = $('#reverse-title');
    el.reverseSub = $('#reverse-sub');
    el.revAnnual = $('#rev-annual');
    el.revGross = $('#rev-monthly-gross');
    el.revDeduction = $('#rev-deduction');
    el.revNet = $('#rev-net');
    el.revNetNote = $('#rev-net-note');
    el.reverseFoot = $('#reverse-foot');
    el.toast = $('#toast');
    el.themeBtn = $('#themeBtn');
    el.themeIcon = $('#themeIcon');
    el.installCard = $('#install-card');
    el.installBtn = $('#install-btn');
    el.appVersion = $('#appVersion');
    el.tabs = [$('#tabSalary'), $('#tabReverse')];
    el.panels = [$('#panelSalary'), $('#panelReverse')];
  }

  /* ── 입력 도우미 ───────────────────────────────────────── */
  function readMan(input) {
    var raw = (input.value || '').replace(/[^0-9.]/g, '');
    var n = parseFloat(raw);
    return isFinite(n) ? n : 0;
  }
  function paintMan(input, v) {
    input.value = v > 0 ? nf.format(v) : '';
  }

  /* ── 조건 묶음 ─────────────────────────────────────────── */
  function options() {
    return {
      dependents: state.dependents,
      children: state.children,
      meal: state.mealOn ? 200000 : 0,
      car: Math.min(state.car, 20) * 10000,
      childcare: Math.min(state.childcare, 10) * 10000
    };
  }

  /* ── 결과 렌더 ─────────────────────────────────────────── */
  function render() {
    var opt = options();
    var r = C.calc({
      annualSalary: Math.max(0, state.salary) * 10000,
      dependents: opt.dependents,
      children: opt.children,
      meal: opt.meal,
      car: opt.car,
      childcare: opt.childcare
    });

    el.salaryWon.textContent = '= ' + won(r.input.annualSalary) + ' · 월 ' + won(r.monthlyGross) + ' (세전)';

    /* 핵심 숫자 */
    el.netTitle.textContent = '월 ' + won(r.net.monthly);
    el.netSub.textContent = '연봉 ' + man(r.input.annualSalary) + ' · 공제 합계 월 ' +
      won(r.net.monthlyDeduction) + ' (4대보험 ' + won(r.social.monthly.total) + ' + 세금 ' + won(r.income.taxMonthly) + ')';
    el.statAnnualNet.textContent = won(r.net.annual);
    el.statSocial.textContent = won(r.social.monthly.total);
    el.statTax.textContent = won(r.income.taxMonthly);
    el.statRate.textContent = pct(r.net.deductionRate);
    el.statRateNote.textContent = '실효세율 ' + pct(r.net.effectiveTaxRate) + ' · 4대보험 ' + pct(r.net.socialRate);

    /* 급여명세서 */
    var incomeTaxMonthly = floorTo(r.income.determinedTax / 12, 10);
    var localMonthly = Math.max(0, r.income.taxMonthly - incomeTaxMonthly);
    var rows = [
      ['세전 월급여', r.monthlyGross, ''],
      ['－ 국민연금 (4.75%)', -r.social.monthly.nps, '기준소득월액 ' + man(r.social.monthly.npsBase)],
      ['－ 건강보험 (3.595%)', -r.social.monthly.health, ''],
      ['－ 장기요양 (0.4724%)', -r.social.monthly.ltc, '건강보험료의 13.14%'],
      ['－ 고용보험 (0.9%)', -r.social.monthly.employment, '실업급여·고용안정'],
      ['－ 소득세', -incomeTaxMonthly, '결정세액의 1/12'],
      ['－ 지방소득세', -localMonthly, '소득세의 10%']
    ];
    el.payslipBody.innerHTML = rows.map(function (row, i) {
      var cls = i === 0 ? ' class="row-gross"' : '';
      var amt = row[1] < 0 ? '−' + won(-row[1]) : won(row[1]);
      return '<tr' + cls + '><th scope="row">' + row[0] + '</th><td>' + amt + '</td><td class="memo">' + row[2] + '</td></tr>';
    }).join('') +
      '<tr class="row-net"><th scope="row">= 월 실수령액</th><td>' + won(r.net.monthly) + '</td><td class="memo">연 ' + won(r.net.annual) + '</td></tr>';
    el.payslipTotal.textContent = '실수령 ' + won(r.net.monthly);

    /* 연봉 인상 시뮬 */
    var raises = C.raiseTable({
      annualSalary: Math.max(0, state.salary) * 10000,
      dependents: opt.dependents,
      children: opt.children,
      meal: opt.meal,
      car: opt.car,
      childcare: opt.childcare
    });
    var baseNet = r.net.monthly;
    el.raiseBody.innerHTML = raises.map(function (row) {
      return '<tr><td>' + man(row.annualSalary) + '<span class="muted"> (+' + man(row.step) + ')</span></td>' +
        '<td>' + won(row.netMonthly) + '</td>' +
        '<td class="up">+' + won(row.netMonthly - baseNet) + '</td></tr>';
    }).join('');
    el.raiseNote.textContent = '지금 연봉 ' + man(r.input.annualSalary) + ' 기준입니다. 인상분의 ' +
      (r.input.annualSalary > 0 ? Math.round((raises[0].raiseMonthly * 12 / raises[0].step) * 100) : 0) +
      '% 정도가 월 실수령으로 남습니다.';

    /* 계산 과정 */
    var bd = [
      ['총급여 (세전 연봉)', won(r.input.annualSalary)],
      ['－ 비과세 급여 (월 ' + man(r.input.nonTaxable.total) + ' × 12)', '−' + won(r.nonTaxableAnnual)],
      ['= 과세 대상 급여', won(r.taxableAnnual)],
      ['－ 근로소득공제', '−' + won(r.deduction.earned)],
      ['－ 기본공제 (본인 + ' + r.input.dependents + '명)', '−' + won(r.deduction.basic)],
      ['－ 보험료공제 (4대보험 근로자 부담)', '−' + won(r.deduction.insurance)],
      ['= 과세표준', won(r.income.taxBase)],
      ['적용 세율 (' + r.income.bracketLabel + ')', r.income.ratePercent + '%'],
      ['산출세액', won(r.income.calculatedTax)],
      ['－ 근로소득세액공제', '−' + won(r.income.laborCredit)],
      ['－ 자녀세액공제', '−' + won(r.income.childCredit)],
      ['= 결정세액 (국세)', won(r.income.determinedTax)],
      ['＋ 지방소득세 (10%)', won(r.income.localTax)],
      ['= 연간 총 세금', won(r.income.taxAnnual)]
    ];
    el.breakdownBody.innerHTML = bd.map(function (row) {
      return '<tr><th scope="row">' + row[0] + '</th><td>' + row[1] + '</td></tr>';
    }).join('');

    /* 역산 탭 */
    renderReverse();
    save();
  }

  function renderReverse() {
    var opt = options();
    var target = Math.max(0, state.target) * 10000;
    el.targetWon.textContent = '= ' + won(target) + ' 목표';
    var rev = C.salaryForMonthlyNet(target, opt);
    var r = rev.result;
    if (target <= 0) {
      el.reverseTitle.textContent = '목표 금액을 입력해 주세요';
      el.reverseSub.textContent = '월 실수령액을 넣으면 필요한 연봉이 나옵니다.';
      el.revAnnual.textContent = '—';
      el.revGross.textContent = '—';
      el.revDeduction.textContent = '—';
      el.revNet.textContent = '—';
      el.revNetNote.textContent = '목표 금액';
      el.reverseFoot.textContent = '';
      return;
    }
    el.reverseTitle.textContent = '연봉 ' + man(rev.annualSalary);
    el.reverseSub.textContent = '세전 월급 ' + won(r.monthlyGross) + ' · 월 공제 ' + won(r.net.monthlyDeduction);
    el.revAnnual.textContent = won(rev.annualSalary);
    el.revGross.textContent = won(r.monthlyGross);
    el.revDeduction.textContent = won(r.net.monthlyDeduction);
    el.revNet.textContent = won(r.net.monthly);
    el.revNetNote.textContent = '목표 ' + won(target) + ' 대비 +' + won(r.net.monthly - target);
    el.reverseFoot.textContent = '목표보다 ' + won(r.net.monthly - target) + ' 더 받도록 1만원 단위로 올려 잡았습니다. 실제 연봉은 회사 규정·상여 구조에 따라 달라집니다.';
  }

  /* ── 저장·복원 ─────────────────────────────────────────── */
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* 저장 불가 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (typeof s !== 'object' || !s) return;
      ['salary', 'target', 'dependents', 'children', 'car', 'childcare'].forEach(function (k) {
        if (typeof s[k] === 'number' && isFinite(s[k])) state[k] = s[k];
      });
      if (typeof s.mealOn === 'boolean') state.mealOn = s.mealOn;
      if (s.tab === 'reverse') state.tab = 'reverse';
    } catch (e) { /* 무시 */ }
  }

  function paintInputs() {
    paintMan(el.salary, state.salary);
    paintMan(el.target, state.target);
    paintMan(el.car, state.car);
    paintMan(el.childcare, state.childcare);
    el.mealOn.checked = state.mealOn;
    setStepper('dependents', state.dependents);
    setStepper('children', state.children);
  }

  /* ── 단계 입력 ─────────────────────────────────────────── */
  function setStepper(name, value) {
    var out = document.querySelector('[data-out="' + name + '"]');
    if (out) out.textContent = value + '명';
    var box = document.querySelector('.stepper[data-target="' + name + '"]');
    if (box) {
      $$('.step-btn', box).forEach(function (btn) {
        var dir = Number(btn.getAttribute('data-dir'));
        btn.disabled = (dir < 0 && value <= 0) || (dir > 0 && value >= 10);
      });
    }
  }

  /* ── 이벤트 ───────────────────────────────────────────── */
  function bind() {
    el.salary.addEventListener('input', function () {
      state.salary = Math.max(0, Math.min(readMan(el.salary), 100000));
      el.salaryWon.textContent = '= ' + won(state.salary * 10000) + ' · 월 ' + won(state.salary * 10000 / 12) + ' (세전)';
      render();
    });
    el.salary.addEventListener('blur', function () { paintMan(el.salary, state.salary); });

    el.target.addEventListener('input', function () {
      state.target = Math.max(0, Math.min(readMan(el.target), 5000));
      renderReverse();
      save();
    });
    el.target.addEventListener('blur', function () { paintMan(el.target, state.target); });

    [['car', el.car, 20], ['childcare', el.childcare, 10]].forEach(function (spec) {
      var key = spec[0], node = spec[1], cap = spec[2];
      node.addEventListener('input', function () {
        state[key] = Math.max(0, Math.min(readMan(node), cap));
        render();
      });
      node.addEventListener('blur', function () { paintMan(node, state[key]); });
    });

    el.mealOn.addEventListener('change', function () {
      state.mealOn = el.mealOn.checked;
      render();
    });

    $$('.stepper').forEach(function (box) {
      var name = box.getAttribute('data-target');
      $$('.step-btn', box).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var dir = Number(btn.getAttribute('data-dir'));
          state[name] = Math.max(0, Math.min(10, state[name] + dir));
          setStepper(name, state[name]);
          render();
        });
      });
    });

    $$('#salary-chips button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.salary = Number(btn.getAttribute('data-value'));
        paintMan(el.salary, state.salary);
        render();
      });
    });
    $$('#target-chips button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.target = Number(btn.getAttribute('data-value'));
        paintMan(el.target, state.target);
        renderReverse();
        save();
      });
    });

    el.tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { selectTab(i); });
      tab.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var next = (i + (e.key === 'ArrowRight' ? 1 : el.tabs.length - 1)) % el.tabs.length;
        selectTab(next);
        el.tabs[next].focus();
      });
    });

    el.themeBtn.addEventListener('click', toggleTheme);
  }

  function selectTab(index) {
    el.tabs.forEach(function (tab, i) {
      var on = i === index;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      el.panels[i].classList.toggle('is-active', on);
      el.panels[i].hidden = !on;
    });
    state.tab = index === 1 ? 'reverse' : 'salary';
    save();
  }

  /* ── 테마 ─────────────────────────────────────────────── */
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem('sn.theme', theme); } catch (e) { /* 무시 */ }
  }
  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  /* ── 토스트 ───────────────────────────────────────────── */
  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('is-on'); }, 2400);
  }

  /* ── PWA ──────────────────────────────────────────────── */
  function initPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* 등록 실패 무시 */ });
      });
    }
    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      if (el.installCard) el.installCard.hidden = false;
    });
    if (el.installBtn) {
      el.installBtn.addEventListener('click', function () {
        if (!deferred) return;
        deferred.prompt();
        deferred.userChoice.then(function () { deferred = null; el.installCard.hidden = true; });
      });
    }
    window.addEventListener('appinstalled', function () {
      if (el.installCard) el.installCard.hidden = true;
      toast('홈 화면에 추가했어요');
    });
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    load();
    paintInputs();
    bind();
    applyTheme(currentTheme());
    if (state.tab === 'reverse') selectTab(1); else selectTab(0);
    render();
    if (el.appVersion) el.appVersion.textContent = '1.0.0';
    initPWA();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
