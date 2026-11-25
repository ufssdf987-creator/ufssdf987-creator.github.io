/*!
 * app.js — 청약 가점·신생아 특례대출 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var H = window.HousingCalc;
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

  function won(n) { return nf.format(Math.round(n)); }

  /** 3억 5,000만원 · 2,400만원 · 85만원처럼 읽기 쉽게 */
  function wonShort(v) {
    var n = Math.round(Math.abs(v));
    var sign = v < 0 ? '-' : '';
    if (n >= 100000000) {
      var eok = Math.floor(n / 100000000);
      var man = Math.round((n % 100000000) / 10000);
      if (man === 0) return sign + eok + '억원';
      return sign + eok + '억 ' + nf.format(man) + '만원';
    }
    if (n >= 10000) {
      var m = Math.round(n / 10000);
      if (m >= 10000) return wonShort(n);
      return sign + nf.format(m) + '만원';
    }
    return sign + nf.format(n) + '원';
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }
  function pctText(v, digits) {
    if (v === null || !isFinite(v)) return '—';
    return v.toFixed(digits === undefined ? 1 : digits) + '%';
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'score',
    score: {
      houseYears: 5,
      dependents: 2,
      accountYears: 8,
      spouseOn: false,
      spouseYears: 3,
      ownsHome: false
    },
    loan: {
      product: 'buy',
      newborn: true,
      noHome: true,
      income: 60000000,
      spouseIncome: 40000000,
      dual: false,
      netAssets: 250000000,
      price: 500000000,
      capital: true,
      firstHome: true,
      amount: 350000000,
      term: 30,
      method: 'equal',
      manualRate: false,
      manualRateValue: 2.65,
      extraCut: false
    }
  };

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;
    var s = raw.score || {};
    if (isFinite(parseFloat(s.houseYears))) state.score.houseYears = clamp(parseFloat(s.houseYears), 0, 40);
    if (isFinite(parseInt(s.dependents, 10))) state.score.dependents = clamp(parseInt(s.dependents, 10), 0, 6);
    if (isFinite(parseFloat(s.accountYears))) state.score.accountYears = clamp(parseFloat(s.accountYears), 0, 40);
    if (isFinite(parseFloat(s.spouseYears))) state.score.spouseYears = clamp(parseFloat(s.spouseYears), 0, 40);
    state.score.spouseOn = !!s.spouseOn;
    state.score.ownsHome = !!s.ownsHome;

    var l = raw.loan || {};
    if (l.product === 'rent' || l.product === 'buy') state.loan.product = l.product;
    ['newborn', 'noHome', 'dual', 'capital', 'firstHome', 'manualRate', 'extraCut'].forEach(function (k) {
      if (typeof l[k] === 'boolean') state.loan[k] = l[k];
    });
    ['income', 'spouseIncome', 'netAssets', 'price', 'amount', 'manualRateValue'].forEach(function (k) {
      var v = parseFloat(l[k]);
      if (isFinite(v) && v >= 0) state.loan[k] = v;
    });
    var t = parseInt(l.term, 10);
    if (isFinite(t)) state.loan.term = t;
    if (l.method === 'equal' || l.method === 'principal') state.loan.method = l.method;
    if (raw.tab === 'loan') state.tab = 'loan';
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
    el.tabScore = $('#tabScore');
    el.tabLoan = $('#tabLoan');
    el.panelScore = $('#panelScore');
    el.panelLoan = $('#panelLoan');

    el.houseYears = $('#houseYears');
    el.houseRange = $('#houseRange');
    el.ownsHome = $('#ownsHome');
    el.depMinus = $('#depMinus');
    el.depPlus = $('#depPlus');
    el.depCount = $('#depCount');
    el.accountYears = $('#accountYears');
    el.accountRange = $('#accountRange');
    el.spouseOn = $('#spouseOn');
    el.spouseYears = $('#spouseYears');
    el.spouseWrap = $('#spouseWrap');
    el.spouseBadge = $('#spouseBadge');

    el.scoreHouse = $('#scoreHouse');
    el.scoreFamily = $('#scoreFamily');
    el.scoreAccount = $('#scoreAccount');
    el.scoreTotal = $('#scoreTotal');
    el.scoreSub = $('#scoreSub');
    el.scoreBadge = $('#scoreBadge');
    el.segHouse = $('#segHouse');
    el.segFamily = $('#segFamily');
    el.segAccount = $('#segAccount');
    el.legHouse = $('#legHouse');
    el.legFamily = $('#legFamily');
    el.legAccount = $('#legAccount');
    el.scoreRows = $('#scoreRows');
    el.scoreInsight = $('#scoreInsight');
    el.shareScore = $('#shareScore');

    el.income = $('#income');
    el.incomeLabel = $('#incomeLabel');
    el.dualOn = $('#dualOn');
    el.spouseField = $('#spouseField');
    el.spouseIncome = $('#spouseIncome');
    el.netAssets = $('#netAssets');
    el.price = $('#price');
    el.priceLabel = $('#priceLabel');
    el.priceHelp = $('#priceHelp');
    el.firstHomeField = $('#firstHomeField');
    el.firstHome = $('#firstHome');
    el.loanAmount = $('#loanAmount');
    el.fillMax = $('#fillMax');
    el.loanHelp = $('#loanHelp');
    el.termSel = $('#termSel');
    el.termLabel = $('#termLabel');
    el.methodField = $('#methodField');
    el.manualRate = $('#manualRate');
    el.rateAuto = $('#rateAuto');
    el.rateValue = $('#rateValue');
    el.rateBand = $('#rateBand');
    el.rateInputWrap = $('#rateInputWrap');
    el.rateInput = $('#rateInput');
    el.extraCut = $('#extraCut');
    el.rateHelp = $('#rateHelp');
    el.newbornOn = $('#newbornOn');
    el.noHomeOn = $('#noHomeOn');

    el.payMonthly = $('#payMonthly');
    el.paySub = $('#paySub');
    el.loanBadge = $('#loanBadge');
    el.checkList = $('#checkList');
    el.capAmount = $('#capAmount');
    el.capRows = $('#capRows');
    el.capNote = $('#capNote');
    el.payInterest = $('#payInterest');
    el.payTotal = $('#payTotal');
    el.payDsr = $('#payDsr');
    el.payRange = $('#payRange');
    el.loanInsight = $('#loanInsight');
    el.afterBox = $('#afterBox');
    el.afterText = $('#afterText');
    el.scheduleTable = $('#scheduleTable');
    el.shareLoan = $('#shareLoan');

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
  function setTab(tab, focus) {
    state.tab = tab === 'loan' ? 'loan' : 'score';
    var isScore = state.tab === 'score';
    el.tabScore.classList.toggle('is-active', isScore);
    el.tabLoan.classList.toggle('is-active', !isScore);
    el.tabScore.setAttribute('aria-selected', String(isScore));
    el.tabLoan.setAttribute('aria-selected', String(!isScore));
    el.tabScore.tabIndex = isScore ? 0 : -1;
    el.tabLoan.tabIndex = isScore ? -1 : 0;
    el.panelScore.hidden = !isScore;
    el.panelLoan.hidden = isScore;
    el.panelScore.classList.toggle('is-active', isScore);
    el.panelLoan.classList.toggle('is-active', !isScore);
    if (focus) (isScore ? el.tabScore : el.tabLoan).focus();
    try {
      if (history.replaceState) history.replaceState(null, '', isScore ? '#score' : '#loan');
    } catch (e) { /* file:// 등 */ }
    saveState();
  }

  function initTabs() {
    el.tabScore.addEventListener('click', function () { setTab('score'); });
    el.tabLoan.addEventListener('click', function () { setTab('loan'); });
    $$('.tabs .tab').forEach(function (tab) {
      tab.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          setTab(state.tab === 'score' ? 'loan' : 'score', true);
        }
      });
    });
    if (location.hash === '#loan') setTab('loan');
    else setTab('score');
  }

  /* ── 청약 가점 ───────────────────────────────────────── */
  function scoreInput() {
    return {
      houseYears: state.score.houseYears,
      dependents: state.score.dependents,
      accountYears: state.score.accountYears,
      spouseYears: state.score.spouseOn ? state.score.spouseYears : 0,
      ownsHome: state.score.ownsHome
    };
  }

  function updateRangeFill(range) {
    if (!range) return;
    var min = Number(range.min || 0), max = Number(range.max || 100);
    var p = max > min ? ((Number(range.value) - min) / (max - min)) * 100 : 0;
    range.style.setProperty('--fill', p + '%');
  }

  function syncScoreForm() {
    el.houseYears.value = String(state.score.houseYears);
    el.houseRange.value = String(clamp(state.score.houseYears, 0, 20));
    el.accountYears.value = String(state.score.accountYears);
    el.accountRange.value = String(clamp(state.score.accountYears, 0, 20));
    el.ownsHome.checked = state.score.ownsHome;
    el.depCount.textContent = state.score.dependents + '명';
    el.depMinus.disabled = state.score.dependents <= 0;
    el.depPlus.disabled = state.score.dependents >= 6;
    el.spouseOn.checked = state.score.spouseOn;
    el.spouseWrap.hidden = !state.score.spouseOn;
    el.spouseYears.value = String(state.score.spouseYears);
    $$('.chips [data-house]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-house')) === state.score.houseYears);
    });
    $$('.chips [data-account]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-account')) === state.score.accountYears);
    });
    updateRangeFill(el.houseRange);
    updateRangeFill(el.accountRange);
  }

  function houseYearsText() {
    if (state.score.ownsHome) return '0점(유주택·30세 미만 미혼)';
    var y = state.score.houseYears;
    if (y < 1) return '1년 미만';
    if (y >= 15) return '15년 이상';
    return Math.floor(y) + '년 이상';
  }

  function renderScore() {
    var inp = scoreInput();
    var s = H.subscriptionScore(inp);
    var next = H.nextYearScore(inp);

    el.scoreHouse.textContent = s.house + '점 / 32점';
    el.scoreFamily.textContent = s.family + '점 / 35점';
    el.scoreAccount.textContent = s.account + '점 / 17점';
    el.spouseBadge.textContent = '+' + s.spouseBonus + '점';
    el.spouseBadge.classList.toggle('is-on', s.spouseBonus > 0);

    el.scoreTotal.textContent = String(s.total);
    var sub = [];
    sub.push(state.score.ownsHome ? '무주택기간 0점' : '무주택 ' + houseYearsText());
    sub.push('부양가족 ' + state.score.dependents + '명');
    sub.push('통장 ' + (inp.accountYears >= 15 ? '15년 이상' : inp.accountYears + '년') +
      (s.spouseBonus > 0 ? ' + 배우자 ' + s.spouseBonus + '점' : ''));
    el.scoreSub.textContent = sub.join(' · ');

    el.scoreBadge.textContent = s.percent + '%';
    el.scoreBadge.setAttribute('data-tier', s.total >= 60 ? '1' : (s.total >= 40 ? '2' : '3'));

    el.segHouse.style.width = (s.house / s.max.house * 100) + '%';
    el.segFamily.style.width = (s.family / s.max.family * 100) + '%';
    el.segAccount.style.width = (s.account / s.max.account * 100) + '%';
    el.legHouse.textContent = String(s.house);
    el.legFamily.textContent = String(s.family);
    el.legAccount.textContent = String(s.account);

    el.scoreRows.innerHTML =
      row('무주택기간', houseYearsText(), s.house, 32) +
      row('부양가족수', state.score.dependents + '명 (본인 제외)', s.family, 35) +
      row('청약통장 가입기간',
        (inp.accountYears >= 15 ? '15년 이상' : inp.accountYears + '년') +
        (s.spouseBonus > 0 ? ' · 배우자 +' + s.spouseBonus : ''),
        s.account, 17) +
      '<div class="bd-row total"><span class="bd-label">총점</span>' +
      '<span class="bd-value">' + s.total + '점 / 84점</span></div>';

    var html;
    if (state.score.ownsHome) {
      html = '<strong>무주택기간 0점</strong> 상태입니다. 유주택 세대이거나 만 30세 미만 미혼이면 무주택기간 점수를 받을 수 없습니다.';
    } else {
      html = '만점까지 <strong>' + (84 - s.total) + '점</strong> 남았습니다.';
    }
    if (next.total > s.total) {
      html += ' 1년 뒤에는 기간이 늘어 <strong>' + next.total + '점</strong>(+' + (next.total - s.total) + ')이 됩니다.';
    }
    if (state.score.dependents === 0) {
      html += ' 부양가족이 0명이면 5점에 머물러, 기간이 아무리 길어도 <strong>54점</strong>이 상한입니다.';
    }
    if (s.account >= 17) {
      html += ' 통장 가입기간은 이미 만점입니다.';
    }
    el.scoreInsight.innerHTML = html;
    el.scoreInsight.classList.toggle('is-warn', state.score.ownsHome);
  }

  function row(label, small, score, max) {
    var ratio = max > 0 ? Math.round(score / max * 100) : 0;
    return '<div class="bd-row">' +
      '<span class="bd-label">' + label + '<small>' + small + '</small></span>' +
      '<span class="bd-value">' + score + '점 <small style="color:var(--muted-2)">(' + ratio + '%)</small></span>' +
      '</div>';
  }

  /* ── 신생아 특례대출 ─────────────────────────────────── */
  function loanInput() {
    var l = state.loan;
    var combined = l.income + (l.dual ? l.spouseIncome : 0);
    return {
      product: l.product,
      newbornWithin2y: l.newborn,
      noHome: l.noHome,
      income: l.income,
      spouseIncome: l.spouseIncome,
      dual: l.dual,
      combinedIncome: combined,
      netAssets: l.netAssets,
      price: l.price,
      capitalArea: l.capital,
      firstHome: l.firstHome,
      amount: l.amount,
      term: l.term,
      method: l.product === 'rent' ? 'interest' : l.method,
      manualRate: l.manualRate,
      extraCut: l.extraCut
    };
  }

  function currentRate(inp) {
    var base = H.baseRate({
      product: inp.product,
      income: inp.combinedIncome,
      dual: inp.dual,
      term: inp.term,
      deposit: inp.price
    });
    var rate = base.rate;
    if (rate !== null && rate !== undefined) {
      rate = H.finalRate(inp.product, rate, {
        local: !inp.capitalArea,
        extraPp: inp.extraCut ? 0.2 : 0
      });
    }
    return {
      base: base,
      auto: rate,
      rate: inp.manualRate ? clamp(state.loan.manualRateValue, 0.5, 15) : (rate === null || rate === undefined ? 4.5 : rate)
    };
  }

  function termOptions(product) {
    return product === 'rent' ? H.LOAN.rentTerms : H.LOAN.terms;
  }

  function syncTermOptions() {
    var opts = termOptions(state.loan.product);
    if (opts.indexOf(state.loan.term) < 0) state.loan.term = state.loan.product === 'rent' ? 2 : 30;
    el.termSel.innerHTML = opts.map(function (t) {
      return '<option value="' + t + '"' + (t === state.loan.term ? ' selected' : '') + '>' + t + '년</option>';
    }).join('');
  }

  function syncLoanForm() {
    var l = state.loan;
    $$('.segmented[data-segment="product"] button').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-value') === l.product);
    });
    $$('.segmented[data-segment="region"] button').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-value') === (l.capital ? 'capital' : 'local'));
    });
    $$('.segmented[data-segment="method"] button').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-value') === l.method);
    });
    el.newbornOn.checked = l.newborn;
    el.noHomeOn.checked = l.noHome;
    el.income.value = String(Math.round(l.income));
    el.spouseIncome.value = String(Math.round(l.spouseIncome));
    el.dualOn.checked = l.dual;
    el.spouseField.hidden = !l.dual;
    el.incomeLabel.textContent = l.dual ? '본인 연소득' : '부부합산 연소득';
    el.netAssets.value = String(Math.round(l.netAssets));
    el.price.value = String(Math.round(l.price));
    el.firstHome.checked = l.firstHome;
    el.loanAmount.value = String(Math.round(l.amount));
    el.manualRate.checked = l.manualRate;
    el.extraCut.checked = l.extraCut;

    var isRent = l.product === 'rent';
    el.priceLabel.textContent = isRent ? '전세 보증금' : '집값(평가액)';
    el.priceHelp.textContent = isRent
      ? '보증금은 수도권 5억원, 그 외 4억원 이하가 대상입니다. 지방 주택은 금리 0.2%p 인하가 적용됩니다.'
      : '평가액 9억원·전용 85㎡ 이하가 대상입니다. 지방 주택은 금리 0.2%p 인하가 적용됩니다.';
    el.firstHomeField.hidden = isRent;
    el.methodField.hidden = isRent;
    el.termLabel.textContent = isRent ? '대출 기간(연장 포함)' : '대출 기간';
    el.rateInputWrap.hidden = !l.manualRate;
    el.rateAuto.hidden = l.manualRate;
    syncTermOptions();
    $$('.chips [data-income]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-income')) === l.income);
    });
  }

  function renderLoan() {
    var inp = loanInput();
    var rateInfo = currentRate(inp);
    var rate = rateInfo.rate;

    /* 금리 표시 */
    if (inp.manualRate) {
      el.rateValue.textContent = rate.toFixed(2) + '%';
      el.rateBand.textContent = '직접 입력한 금리';
    } else if (rateInfo.base.rate === null || rateInfo.base.rate === undefined) {
      el.rateValue.textContent = '—';
      el.rateBand.textContent = rateInfo.base.reason || '소득 기준 초과';
    } else {
      el.rateValue.textContent = rate.toFixed(2) + '%';
      var bandText = inp.product === 'rent'
        ? rateInfo.base.label + ' · 보증금 ' + rateInfo.base.depositLabel
        : rateInfo.base.label + ' · ' + inp.term + '년';
      if (!inp.capitalArea) bandText += ' · 지방 0.2%p 인하';
      if (inp.extraCut) bandText += ' · 우대 0.2%p';
      el.rateBand.textContent = bandText;
    }
    if (document.activeElement !== el.rateInput) el.rateInput.value = rate.toFixed(2);

    /* 자가진단 */
    var check = H.eligibility({
      product: inp.product,
      income: inp.income,
      spouseIncome: inp.spouseIncome,
      dual: inp.dual,
      netAssets: inp.netAssets,
      price: inp.price,
      capitalArea: inp.capitalArea,
      newbornWithin2y: inp.newbornWithin2y,
      noHome: inp.noHome
    });
    el.loanBadge.textContent = check.ok ? '대상 가능' : '요건 확인';
    el.loanBadge.setAttribute('data-tier', check.ok ? '1' : '3');
    el.checkList.innerHTML = check.checks.map(function (c) {
      return '<div class="elig-item ' + (c.pass ? 'is-pass' : 'is-fail') + '">' +
        '<span class="elig-mark" aria-hidden="true">' + (c.pass ? '✓' : '!') + '</span>' +
        '<span class="elig-body">' +
        '<span class="elig-name">' + c.label + ' · ' + c.value + '</span>' +
        '<span class="elig-note">' + c.note + '</span>' +
        '</span></div>';
    }).join('');

    /* 한도 */
    var cap = H.loanCap({
      product: inp.product,
      price: inp.price,
      capitalArea: inp.capitalArea,
      firstHome: inp.firstHome,
      income: inp.combinedIncome,
      rate: rate,
      years: inp.term,
      method: inp.method
    });
    el.capAmount.textContent = wonShort(cap.cap);
    el.capRows.innerHTML = cap.parts.map(function (p) {
      var isMin = Math.abs(p.amount - cap.cap) < 1;
      return '<div class="cap-row' + (isMin ? ' is-min' : '') + '">' +
        '<span>' + p.label + (isMin ? ' (적용)' : '') + '</span>' +
        '<b>' + wonShort(Math.min(p.amount, 999999999999)) + '</b></div>';
    }).join('');
    el.capNote.textContent = inp.product === 'rent'
      ? '상품 한도와 보증금의 80% 중 작은 금액입니다. 실제로는 보증금의 5% 이상을 낸 뒤 신청합니다.'
      : '상품 한도·LTV·DTI 60% 중 가장 작은 금액입니다. 생애최초 LTV 80%는 수도권·규제지역에서 70%로 적용됩니다.';

    /* 상환 */
    var principal = Math.min(inp.amount, cap.cap);
    var res = H.loanSummary({
      product: inp.product,
      principal: principal,
      rate: rate,
      years: inp.term,
      method: inp.method,
      income: inp.combinedIncome,
      specialYears: H.LOAN.specialYears[inp.product],
      hikePp: 1
    });
    var sum = res.summary;

    el.payMonthly.textContent = won(sum.monthlyFirst);
    var methodLabel = sum.methodLabel;
    el.paySub.textContent = wonShort(principal) + ' · ' + inp.term + '년 · ' + methodLabel + ' · ' + rate.toFixed(2) + '%';
    el.payInterest.textContent = won(sum.totalInterest) + '원';
    el.payTotal.textContent = won(sum.totalPayment) + '원';
    el.payDsr.textContent = pctText(sum.dsr);
    el.payDsr.style.color = (sum.dsr !== null && sum.dsr > 40) ? 'var(--hot)' : '';
    el.payRange.textContent = sum.method === 'interest'
      ? won(sum.monthlyFirst) + '원 (고정)'
      : wonShort(sum.monthlyFirst) + ' → ' + wonShort(sum.monthlyLast);

    var notes = [];
    if (principal < inp.amount - 1) {
      notes.push('<strong>희망 대출금이 한도를 넘어 ' + wonShort(cap.cap) + '으로 계산했습니다.</strong>');
    }
    if (!check.ok) {
      var failedLabels = check.checks.filter(function (c) { return !c.pass; }).map(function (c) { return c.label; });
      notes.push('<strong>' + failedLabels.join('·') + '</strong> 요건이 맞지 않습니다. 실제 심사에서는 대상이 아닐 수 있습니다.');
    }
    if (sum.dsr !== null && sum.dsr > 40) {
      notes.push('연소득 대비 원리금이 <strong>' + pctText(sum.dsr) + '</strong>로, 일반적으로 보는 DSR 40%를 넘습니다. 기간을 늘리거나 대출금을 줄여 보세요.');
    }
    if (cap.cap <= 0) {
      notes.push('소득과 ' + (inp.product === 'rent' ? '보증금' : '집값') + '을 입력하면 받을 수 있는 한도를 계산합니다.');
    }
    if (!notes.length) {
      notes.push('연소득 대비 원리금은 <strong>' + pctText(sum.dsr) + '</strong>입니다. DSR 40% 안쪽이면 상환 부담이 크지 않은 편입니다.');
    }
    el.loanInsight.innerHTML = notes.join(' ');
    el.loanInsight.classList.toggle('is-warn', !check.ok || (sum.dsr !== null && sum.dsr > 40));
    el.loanInsight.classList.toggle('is-ok', check.ok && sum.dsr !== null && sum.dsr <= 40);

    /* 특례 종료 후 */
    if (sum.months > sum.specialYears * 12) {
      el.afterBox.hidden = false;
      el.afterText.innerHTML = '특례금리 ' + sum.specialYears + '년이 끝난 뒤 잔액 <strong>' +
        wonShort(sum.balanceAtSpecialEnd) + '</strong>에 금리가 1%p 올라 <strong>' + sum.afterRate.toFixed(2) +
        '%</strong>가 되면, 남은 ' + Math.round((sum.months - sum.specialYears * 12) / 12) + '년 기준 ' +
        (sum.method === 'interest' ? '월 이자는 ' : '월 상환액은 ') +
        '<strong>' + won(sum.afterMonthly) + '원</strong>입니다. ' +
        (inp.product === 'buy'
          ? '특례 기간은 추가 출산 1명당 5년씩, 최장 15년까지 늘어납니다.'
          : '전세는 2년 단위로 연장해 최장 12년까지 이용합니다.');
    } else {
      el.afterBox.hidden = true;
    }

    /* 연차별 스케줄 */
    var rows = res.years.map(function (y) {
      return '<tr><th scope="row">' + y.year + '년</th><td>' + won(y.principal) +
        '</td><td>' + won(y.interest) + '</td><td>' + won(y.balance) + '</td></tr>';
    });
    el.scheduleTable.tBodies[0].innerHTML = rows.join('');
    el.loanHelp.textContent = principal < inp.amount - 1
      ? '한도 ' + wonShort(cap.cap) + '까지만 계산에 반영했습니다.'
      : '한도 안에서 계산했습니다. 실제 심사 금액은 은행이 정합니다.';
  }

  function refresh() {
    renderScore();
    renderLoan();
    saveState();
  }

  /* ── 공유 ─────────────────────────────────────────────── */
  function shareUrl() {
    var url = (CFG.siteUrl || '').trim();
    if (url && /^https?:\/\//.test(url)) return url.replace(/\/?$/, '/');
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return location.origin + location.pathname;
    }
    return '';
  }

  function scoreShareText() {
    var s = H.subscriptionScore(scoreInput());
    var lines = [
      '🏠 청약 가점 계산 (84점 만점)',
      '· 무주택기간 ' + (state.score.ownsHome ? '없음' : houseYearsText()) + ' → ' + s.house + '점',
      '· 부양가족 ' + state.score.dependents + '명 → ' + s.family + '점',
      '· 통장 ' + (state.score.accountYears >= 15 ? '15년 이상' : state.score.accountYears + '년') +
        (s.spouseBonus > 0 ? ' + 배우자 ' + s.spouseBonus + '점' : '') + ' → ' + s.account + '점',
      '· 합계 ' + s.total + '점 / 84점'
    ];
    var url = shareUrl();
    if (url) lines.push('', '청약 가점·특례대출 계산기 → ' + url);
    return lines.join('\n');
  }

  function loanShareText() {
    var inp = loanInput();
    var rate = currentRate(inp).rate;
    var cap = H.loanCap({
      product: inp.product, price: inp.price, capitalArea: inp.capitalArea,
      firstHome: inp.firstHome, income: inp.combinedIncome, rate: rate,
      years: inp.term, method: inp.method
    });
    var principal = Math.min(inp.amount, cap.cap);
    var sum = H.loanSummary({
      product: inp.product, principal: principal, rate: rate, years: inp.term,
      method: inp.method, income: inp.combinedIncome,
      specialYears: H.LOAN.specialYears[inp.product], hikePp: 1
    }).summary;
    var lines = [
      '🍼 신생아 특례대출 (' + (inp.product === 'rent' ? '전세' : '구입') + ')',
      '· 대출 ' + wonShort(principal) + ' · ' + inp.term + '년 · ' + sum.methodLabel + ' · ' + rate.toFixed(2) + '%',
      '· 월 상환액 ' + won(sum.monthlyFirst) + '원',
      '· 총 이자 ' + won(sum.totalInterest) + '원',
      '· 연소득 대비 원리금 ' + pctText(sum.dsr),
      '· 최대 한도 ' + wonShort(cap.cap)
    ];
    var url = shareUrl();
    if (url) lines.push('', '청약 가점·특례대출 계산기 → ' + url);
    return lines.join('\n');
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
    el.promoHeading.textContent = coupang.heading || '함께 보면 좋은 준비물';
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
  function bindScoreEvents() {
    el.houseYears.addEventListener('input', function () {
      var v = parseFloat(el.houseYears.value);
      state.score.houseYears = isFinite(v) ? clamp(v, 0, 40) : 0;
      el.houseRange.value = String(clamp(state.score.houseYears, 0, 20));
      updateRangeFill(el.houseRange);
      refresh();
    });
    el.houseRange.addEventListener('input', function () {
      state.score.houseYears = Number(el.houseRange.value);
      el.houseYears.value = String(state.score.houseYears);
      updateRangeFill(el.houseRange);
      refresh();
    });
    $$('.chips [data-house]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.score.houseYears = Number(b.getAttribute('data-house'));
        el.houseYears.value = String(state.score.houseYears);
        el.houseRange.value = String(Math.min(20, state.score.houseYears));
        updateRangeFill(el.houseRange);
        refresh();
      });
    });
    el.ownsHome.addEventListener('change', function () {
      state.score.ownsHome = el.ownsHome.checked;
      refresh();
    });
    el.depMinus.addEventListener('click', function () {
      state.score.dependents = clamp(state.score.dependents - 1, 0, 6);
      el.depCount.textContent = state.score.dependents + '명';
      el.depMinus.disabled = state.score.dependents <= 0;
      el.depPlus.disabled = state.score.dependents >= 6;
      refresh();
    });
    el.depPlus.addEventListener('click', function () {
      state.score.dependents = clamp(state.score.dependents + 1, 0, 6);
      el.depCount.textContent = state.score.dependents + '명';
      el.depMinus.disabled = state.score.dependents <= 0;
      el.depPlus.disabled = state.score.dependents >= 6;
      refresh();
    });
    el.accountYears.addEventListener('input', function () {
      var v = parseFloat(el.accountYears.value);
      state.score.accountYears = isFinite(v) ? clamp(v, 0, 40) : 0;
      el.accountRange.value = String(clamp(state.score.accountYears, 0, 20));
      updateRangeFill(el.accountRange);
      refresh();
    });
    el.accountRange.addEventListener('input', function () {
      state.score.accountYears = Number(el.accountRange.value);
      el.accountYears.value = String(state.score.accountYears);
      updateRangeFill(el.accountRange);
      refresh();
    });
    $$('.chips [data-account]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.score.accountYears = Number(b.getAttribute('data-account'));
        el.accountYears.value = String(state.score.accountYears);
        el.accountRange.value = String(Math.min(20, state.score.accountYears));
        updateRangeFill(el.accountRange);
        refresh();
      });
    });
    el.spouseOn.addEventListener('change', function () {
      state.score.spouseOn = el.spouseOn.checked;
      el.spouseWrap.hidden = !state.score.spouseOn;
      refresh();
    });
    el.spouseYears.addEventListener('input', function () {
      var v = parseFloat(el.spouseYears.value);
      state.score.spouseYears = isFinite(v) ? clamp(v, 0, 40) : 0;
      refresh();
    });
  }

  function bindLoanEvents() {
    $$('.segmented[data-segment="product"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.loan.product = b.getAttribute('data-value') === 'rent' ? 'rent' : 'buy';
        syncLoanForm();
        refresh();
      });
    });
    $$('.segmented[data-segment="region"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.loan.capital = b.getAttribute('data-value') !== 'local';
        syncLoanForm();
        refresh();
      });
    });
    $$('.segmented[data-segment="method"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.loan.method = b.getAttribute('data-value') === 'principal' ? 'principal' : 'equal';
        syncLoanForm();
        refresh();
      });
    });
    el.newbornOn.addEventListener('change', function () {
      state.loan.newborn = el.newbornOn.checked;
      refresh();
    });
    el.noHomeOn.addEventListener('change', function () {
      state.loan.noHome = el.noHomeOn.checked;
      refresh();
    });
    el.dualOn.addEventListener('change', function () {
      state.loan.dual = el.dualOn.checked;
      el.spouseField.hidden = !state.loan.dual;
      el.incomeLabel.textContent = state.loan.dual ? '본인 연소득' : '부부합산 연소득';
      refresh();
    });
    el.income.addEventListener('input', function () {
      var v = parseFloat(el.income.value);
      state.loan.income = isFinite(v) ? clamp(v, 0, 300000000) : 0;
      $$('.chips [data-income]').forEach(function (b) {
        b.classList.toggle('is-active', Number(b.getAttribute('data-income')) === state.loan.income);
      });
      refresh();
    });
    $$('.chips [data-income]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.loan.income = Number(b.getAttribute('data-income'));
        el.income.value = String(state.loan.income);
        refresh();
      });
    });
    el.spouseIncome.addEventListener('input', function () {
      var v = parseFloat(el.spouseIncome.value);
      state.loan.spouseIncome = isFinite(v) ? clamp(v, 0, 300000000) : 0;
      refresh();
    });
    el.netAssets.addEventListener('input', function () {
      var v = parseFloat(el.netAssets.value);
      state.loan.netAssets = isFinite(v) ? clamp(v, 0, 2000000000) : 0;
      refresh();
    });
    el.price.addEventListener('input', function () {
      var v = parseFloat(el.price.value);
      state.loan.price = isFinite(v) ? clamp(v, 0, 3000000000) : 0;
      refresh();
    });
    el.firstHome.addEventListener('change', function () {
      state.loan.firstHome = el.firstHome.checked;
      refresh();
    });
    el.loanAmount.addEventListener('input', function () {
      var v = parseFloat(el.loanAmount.value);
      state.loan.amount = isFinite(v) ? clamp(v, 0, 500000000) : 0;
      refresh();
    });
    el.fillMax.addEventListener('click', function () {
      var inp = loanInput();
      var cap = H.loanCap({
        product: inp.product, price: inp.price, capitalArea: inp.capitalArea,
        firstHome: inp.firstHome, income: inp.combinedIncome,
        rate: currentRate(inp).rate, years: inp.term, method: inp.method
      });
      state.loan.amount = Math.round(cap.cap);
      el.loanAmount.value = String(state.loan.amount);
      refresh();
      toast('한도 ' + wonShort(cap.cap) + '을 넣었어요.');
    });
    el.termSel.addEventListener('change', function () {
      state.loan.term = parseInt(el.termSel.value, 10) || 30;
      refresh();
    });
    el.manualRate.addEventListener('change', function () {
      state.loan.manualRate = el.manualRate.checked;
      el.rateInputWrap.hidden = !state.loan.manualRate;
      el.rateAuto.hidden = state.loan.manualRate;
      refresh();
    });
    el.rateInput.addEventListener('input', function () {
      var v = parseFloat(el.rateInput.value);
      state.loan.manualRateValue = isFinite(v) ? clamp(v, 0.5, 15) : 2.65;
      refresh();
    });
    el.extraCut.addEventListener('change', function () {
      state.loan.extraCut = el.extraCut.checked;
      refresh();
    });

    el.shareLoan.addEventListener('click', function () { doShare(loanShareText()); });
    el.shareScore.addEventListener('click', function () { doShare(scoreShareText()); });
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    el.appVersion.textContent = CFG.version || '1.0.0';
    el.dataDate.textContent = H.DATA_DATE;
    el.dataDate.setAttribute('datetime', H.DATA_DATE);

    syncScoreForm();
    syncLoanForm();
    initTabs();
    bindScoreEvents();
    bindLoanEvents();
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
