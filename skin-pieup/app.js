/*!
 * app.js — 룰루뷰 루틴 빌더 · 파이업 시뮬레이터 · 체크리스트
 * 데이터 기준일: 2026-11-27 (파이업 공식몰 판매 페이지, 운영 원칙·크리에이터 안내)
 */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var PIE = CFG.pieup || {};
  var REF = PIE.ref || 'BTETPK9Z';
  var PRODUCT_BASE = PIE.productBase || 'https://pie-up.com/p/';
  var SIGNUP = PIE.signupUrl || 'https://pie-up.com/signup?ref=BTETPK9Z';

  function link(slug) {
    return PRODUCT_BASE + slug + '?ref=' + REF;
  }
  function won(n) {
    return Math.round(n).toLocaleString('ko-KR') + '원';
  }

  /* GA4 이벤트 — 배포 빌드(deploy/build_site.py)가 넣는 gtag 설정을 그대로 쓰고,
     여기서는 이벤트만 보냅니다. gtag 가 없으면(로컬 미리보기·차단) 조용히 건너뜁니다. */
  function track(name, params) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
    } catch (e) { /* 측정 실패는 화면 동작에 영향 없음 */ }
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ── 제품 데이터 (2026-11-27 확인) ───────────────────────────────── */
  var PRODUCTS = [
    {
      key: 'cleanser', slug: 'deep-cleanser', name: '엔케이 액티브 딥 클렌저', size: '',
      price: 52000, list: 104000, step: '세안',
      line: '개운하게 씻고도 당기지 않는 마무리',
      feats: ['세안·노폐물 세정', '딥 클렌저'], caution: ''
    },
    {
      key: 'toner', slug: 'infugen-bangah-toner', name: '인퓨젠 방아 티 퀵 카밍 토너', size: '150ml',
      price: 32000, list: 64000, step: '토너',
      line: '방아잎 추출물, 쫀쫀한 제형에 쿨링감',
      feats: ['방아풀잎·줄기 추출물', '끈적임 적음', '은은한 풀향'], caution: '향에 예민하면 소량부터'
    },
    {
      key: 'booster', slug: 'nkcell-booster', name: '엔케이셀 엑티브 부스터', size: '100ml',
      price: 52000, list: 104000, step: '부스터',
      line: '세안 직후 수분을 먼저 채우는 1단계',
      feats: ['수분 부스터', '산뜻한 흡수', '구매평 4.58'], caution: ''
    },
    {
      key: 'serum', slug: 'nkcell-serum', name: '엔케이셀 스킨 트렌스포밍 세럼', size: '50ml',
      price: 68000, list: 136000, step: '세럼',
      line: '부드럽게 밀착되는 탄력 세럼',
      feats: ['끈적임 적은 발림', '보습·탄력 라인', '구매평 4.77'], caution: ''
    },
    {
      key: 'cream', slug: 'nkcell-reborn-cream', name: '엔케이셀 리본 크림', size: '50ml',
      price: 100000, list: 200000, step: '크림',
      line: '시어버터·식물성 오일의 고영양 크림',
      feats: ['미백·주름개선 2중 기능성', '구매평 214개·4.83', '효능 표시는 제품 고시 기준'], caution: '지성은 소량'
    },
    {
      key: 'melaAmpoule', slug: 'mela-ampoule', name: '엔케이셀 멜라클리닉 앰플', size: '15ml',
      price: 58000, list: 116000, step: '앰플',
      line: '잡티 고민 부위에 얹는 미백 기능성 앰플',
      feats: ['미백 기능성', '트라넥사믹애씨드·글루타티온·비사보롤'], caution: '고민 부위에만 소량'
    },
    {
      key: 'melaCream', slug: 'mela-cream', name: '엔케이셀 멜라클리닉 크림', size: '',
      price: 53000, list: 106000, step: '크림',
      line: '촉촉하게 마무리하는 미백 보습 크림',
      feats: ['미백 기능성', '보습 마무리'], caution: ''
    },
    {
      key: 'mist', slug: 'triple-active-mist', name: '엔케이셀 트리플 액티브 미스트', size: '',
      price: 50000, list: 100000, step: '미스트',
      line: '콜라겐 오일이 보습막을 만드는 미스트',
      feats: ['보습막', '오후 덧뿌리기', '구매평 4.9'], caution: ''
    },
    {
      key: 'bubble', slug: 'bubble-shot-ampoule', name: '룰루뷰 딥포어 버블샷 스피큘 앰플', size: '',
      price: 42000, list: 84000, step: '모공 앰플',
      line: '미세 버블이 올라오는 스피큘 앰플',
      feats: ['스피큘·미세 버블', '아줄렌·판테놀 등 진정 성분 병행'], caution: '처음엔 따끔할 수 있어 주 2회부터'
    },
    {
      key: 'sun', slug: 'uv-tone-up-sun', name: '엔케이 유브이 엑티브 톤업 선크림', size: '',
      price: 52000, list: 104000, step: '선케어',
      line: '미백·주름개선·자외선차단 3중 기능성',
      feats: ['가벼운 로션 타입', '톤업', '백탁 적다는 후기 다수'], caution: ''
    },
    {
      key: 'peeling', slug: 'peeling-gel', name: '엔케이셀 엑티브 케어 필링젤', size: '120ml',
      price: 48000, list: 96000, step: '각질',
      line: '고마쥬 타입 필링 젤',
      feats: ['120ml', '출시 예정 표시'], caution: '판매 페이지에서 재확인', soon: true
    },
    {
      key: 'mask', slug: 'bio-3step-mask-pack', name: '룰루뷰 바이오 3스텝 마스크팩', size: '8매입',
      price: 30000, list: 0, step: '마스크팩',
      line: '클렌징·마스크팩·앰플 3단계를 한 장에',
      feats: ['8매입', 'STEP 1·2·3 구성', '출시 예정 표시'], caution: '판매 페이지에서 재확인', soon: true
    },
    {
      key: 'kit', slug: 'nkcell-kit', name: '룰루뷰 엑티브 엔케이셀 키트', size: '부스터+세럼+리본 크림',
      price: 220000, list: 440000, step: '세트',
      line: '부스터·세럼·리본 크림 3종 구성',
      feats: ['3종 세트', '구매평 63개·4.92', '낱개 합계와 같은 가격'], caution: ''
    },
    {
      key: 'cooldown', slug: 'infugen-cooldown-5', name: '인퓨젠 쿨다운 케어 5종', size: '5종 6점',
      price: 184000, list: 214000, step: '세트',
      line: '필링젤·마스크팩·토너·크림·바디 미스트 구성',
      feats: ['출시기념 마스크팩 1세트 추가', '100세트 한정', '11/27 일괄 발송'], caution: ''
    }
  ];

  var BY_KEY = {};
  PRODUCTS.forEach(function (p) { BY_KEY[p.key] = p; });

  var TYPE_LABEL = { dry: '건성', combo: '수부지', oily: '지성', normal: '중성·모름' };
  var CONCERN_LABEL = {
    dry: '속당김·건조', sensitive: '민감·장벽', pore: '피지·모공',
    tone: '칙칙함·잡티', firm: '탄력·주름', texture: '각질·결'
  };
  var DEPTH_LABEL = { mini: '미니멀 3단계', basic: '기본 4~5단계', focus: '집중 5~6단계' };

  var state = {
    type: 'dry',
    concerns: { dry: true },
    depth: 'mini'
  };

  /* ── 루틴 계산 ──────────────────────────────────────────────────── */
  function buildRoutine() {
    var t = state.type, c = state.concerns, d = state.depth;
    var oily = t === 'oily', combo = t === 'combo';
    var dry = !!c.dry, sens = !!c.sensitive, pore = !!c.pore;
    var tone = !!c.tone, firm = !!c.firm, tex = !!c.texture;
    var items = [];

    function add(key, why) {
      if (!items.some(function (i) { return i.key === key; })) items.push({ key: key, why: why });
    }

    add('cleanser', oily
      ? '피지가 많은 날은 세안을 짧게, 미지근한 물로. 두 번 씻기보다 한 번을 꼼꼼히.'
      : sens
        ? '미지근한 물로 30초 안에, 문지르지 않고 눌러 씻습니다.'
        : '세안 후 3분 안에 다음 단계로 넘어가는 것이 이 루틴의 핵심입니다.');

    if (d !== 'mini' || sens || pore) {
      add('toner', sens
        ? '열감이 올라온 날은 냉장 보관 후 화장솜에 적셔 얇게 얹습니다.'
        : pore
          ? '모공 고민이면 첫 단계에서 쿨링으로 온도를 낮추는 편이 좋습니다.'
          : '결을 정돈해 다음 단계 흡수를 돕습니다.');
    }

    add('booster', '세안 직후 수분을 먼저 채우는 단계. 손바닥으로 눌러 흡수시킵니다.');

    if (tone) {
      add('melaAmpoule', '잡티·칙칙함이 고민이면 고민 부위에 소량만. 얼굴 전체에는 세럼을 먼저 봅니다.');
      if (d !== 'mini' && (firm || dry || !pore)) {
        add('serum', '앰플 위에 세럼을 얇게 한 겹 더해 보습을 잠급니다.');
      }
    } else if (pore && d === 'focus') {
      add('bubble', '모공·결 고민에는 주 2회부터. 처음 며칠은 따끔할 수 있어 짧게 바릅니다.');
      add('serum', '스피큘을 쓴 다음 날은 세럼과 크림만 얹어 쉽니다.');
    } else {
      add('serum', firm
        ? '탄력 고민이면 세럼 단계를 가장 정성껏. 두 번에 나눠 바릅니다.'
        : '부드럽게 밀착되는 단계. 두 번 발라도 부담이 적습니다.');
    }

    if (tone && (oily || combo)) {
      add('melaCream', '톤 케어를 크림까지 이어 가는 조합. 지성·수부지는 소량만.');
    } else if (oily && !dry && !sens) {
      add('mist', '지성은 크림이 부담스러울 수 있어 미스트로 가볍게 마무리합니다.');
    } else {
      add('cream', dry
        ? '속당김이 심하면 크림을 가장 두껍게. 이 단계가 루틴의 중심입니다.'
        : sens
          ? '장벽이 고민이면 크림 단계를 거르지 마세요.'
          : '유수분 밸런스를 잠그는 마무리.');
    }

    add('sun', '아침 마지막 단계. 외출 15분 전, 손가락 두 마디 정도.');

    var plus = [];
    function addPlus(key, why) {
      if (items.some(function (i) { return i.key === key; })) return;
      if (plus.some(function (i) { return i.key === key; })) return;
      plus.push({ key: key, why: why });
    }
    if (pore) addPlus('bubble', '주 2회, 저녁에만. 다음 날은 세럼·크림으로 쉽니다.');
    if (tex) addPlus('peeling', '주 1회, 물기 없는 얼굴에 고마쥬 타입으로.');
    if (dry || sens) addPlus('mask', '주 1~2회, 건조한 날 집중 케어로.');
    if (d === 'focus') addPlus('mist', '오후에 건조해지면 덧뿌리기.');
    if (!plus.length) addPlus('mask', '주 1회 정도, 여유 있는 날.');

    return { items: items, plus: plus };
  }

  function sumPrice(list) {
    return list.reduce(function (s, i) { return s + (BY_KEY[i.key] ? BY_KEY[i.key].price : 0); }, 0);
  }
  function sumList(list) {
    return list.reduce(function (s, i) { return s + (BY_KEY[i.key] ? (BY_KEY[i.key].list || BY_KEY[i.key].price) : 0); }, 0);
  }

  function productCard(p, why, place) {
    var save = p.list ? p.list - p.price : 0;
    var badge = p.soon ? '<span class="badge badge--soon">출시 예정</span>' : '';
    return '' +
      '<li class="pcard">' +
        '<div class="pcard__top">' +
          '<span class="pcard__step">' + p.step + '</span>' +
          '<span class="pcard__name">' + p.name + (p.size ? ' <em>' + p.size + '</em>' : '') + '</span>' +
          badge +
        '</div>' +
        (why ? '<p class="pcard__why">' + why + '</p>' : '') +
        '<p class="pcard__line">' + p.line + '</p>' +
        '<div class="pcard__foot">' +
          '<span class="pcard__price"><b>' + won(p.price) + '</b>' +
            (p.list ? '<s>' + won(p.list) + '</s>' : '') +
            (save ? '<i>' + Math.round(save / p.list * 100) + '% 할인</i>' : '') +
          '</span>' +
          '<a class="pcard__link" href="' + link(p.slug) + '" target="_blank" rel="sponsored noopener noreferrer" data-ga-cta data-ga-kind="product" data-ga-pos="' + (place || 'catalog') + '" data-ga-name="' + p.key + '">제품 보기<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="13" height="13"><path d="M7 17 17 7M9 7h8v8"/></svg></a>' +
        '</div>' +
      '</li>';
  }

  function renderRoutine() {
    var r = buildRoutine();
    var mainTotal = sumPrice(r.items);
    var mainList = sumList(r.items);
    var save = Math.max(0, mainList - mainTotal);

    var labels = [TYPE_LABEL[state.type]];
    var picked = Object.keys(state.concerns).filter(function (k) { return state.concerns[k]; });
    picked.forEach(function (k) { if (k !== 'dry' || state.type !== 'dry') labels.push(CONCERN_LABEL[k]); });
    $('#resultTitle').textContent = labels.join(' · ') + ' 기준';
    $('#mainTotal').textContent = won(mainTotal);
    $('#mainSave').textContent = save
      ? '정가 ' + won(mainList) + ' · ' + won(save) + ' 절약'
      : '정가 기준';

    var html = '';
    r.items.forEach(function (it, idx) {
      var p = BY_KEY[it.key];
      if (!p) return;
      html += '<li class="step-item">' +
        '<span class="step-item__no">' + (idx + 1) + '</span>' +
        '<div class="step-item__body">' + productCard(p, it.why, 'routine') + '</div>' +
      '</li>';
    });
    $('#routineList').innerHTML = html;

    // 세트 비교
    var hasBase = r.items.some(function (i) { return i.key === 'booster'; }) &&
      r.items.some(function (i) { return i.key === 'serum'; }) &&
      r.items.some(function (i) { return i.key === 'cream'; });
    var baseSum = hasBase ? BY_KEY.booster.price + BY_KEY.serum.price + BY_KEY.cream.price : 0;
    var kitPrice = BY_KEY.kit.price;
    var kitLine;
    if (hasBase) {
      if (baseSum === kitPrice) {
        kitLine = '부스터·세럼·리본 크림 낱개 합계 <b>' + won(baseSum) + '</b> = 키트 <b>' + won(kitPrice) + '</b>. <b>가격은 같습니다.</b> 선물 포장이 필요할 때만 키트를 고르세요.';
      } else if (baseSum > kitPrice) {
        kitLine = '같은 3종을 낱개로 담으면 <b>' + won(baseSum) + '</b>, 키트는 <b>' + won(kitPrice) + '</b>. 키트가 <b>' + won(baseSum - kitPrice) + ' 저렴</b>합니다.';
      } else {
        kitLine = '같은 3종 낱개 합계 <b>' + won(baseSum) + '</b>, 키트 <b>' + won(kitPrice) + '</b>. 이 조합은 <b>낱개가 ' + won(kitPrice - baseSum) + ' 저렴</b>합니다.';
      }
    } else {
      kitLine = '이 조합에는 3종이 다 들어 있지 않습니다. 부스터·세럼·리본 크림을 모두 쓸 계획이면 키트(' + won(kitPrice) + ')와 낱개 합계를 비교해 보세요.';
    }
    $('#compareBox').innerHTML =
      '<div class="compare__card">' +
        '<h3>세트 vs 낱개</h3><p>' + kitLine + '</p>' +
      '</div>' +
      '<div class="compare__card">' +
        '<h3>배송·결제</h3><p>낱개로 담아도 합계가 5만 원을 넘으면 <b>배송비 무료</b>입니다(미만이면 3,500원). 한 번에 담는 편이 낫습니다.</p>' +
      '</div>';

    // 플러스 케어
    var plusTotal = sumPrice(r.plus);
    $('#plusBox').hidden = r.plus.length === 0;
    if (r.plus.length) {
      var ph = '';
      r.plus.forEach(function (it) {
        var p = BY_KEY[it.key];
        if (!p) return;
        ph += productCard(p, it.why, 'plus');
      });
      $('#plusList').innerHTML = ph + '<li class="plus__total">플러스 케어 합계 <b>' + won(plusTotal) + '</b></li>';
    }
  }

  /* ── 카탈로그 ───────────────────────────────────────────────────── */
  function renderCatalog() {
    var html = '';
    PRODUCTS.forEach(function (p) {
      html += productCard(p, '', 'catalog');
    });
    $('#catalogGrid').innerHTML = html;
  }

  /* ── 등급표 ─────────────────────────────────────────────────────── */
  var GRADES = [
    { name: '베이직 장려금', need: 0, pools: 1 },
    { name: '스타터 보너스', need: 3, pools: 2 },
    { name: '아마추어 보너스', need: 10, pools: 3 },
    { name: '라이징 보너스', need: 30, pools: 4 },
    { name: '세미 프로 보너스', need: 50, pools: 5 },
    { name: '프로 보너스', need: 100, pools: 6 },
    { name: '세미마스터즈 보너스', need: 250, pools: 7 },
    { name: '마스터즈 보너스', need: 500, pools: 8 },
    { name: '프로마스터즈 보너스', need: 1000, pools: 9 },
    { name: '프레지덴셜 보너스', need: 5000, pools: 10 },
    { name: '퀸 보너스', need: 10000, pools: 11 }
  ];

  function renderGrades() {
    $('#gradeBody').innerHTML = GRADES.map(function (g) {
      return '<tr><th scope="row">' + g.name + '</th><td data-label="필요 소개">' +
        (g.need === 0 ? '신청 즉시' : g.need.toLocaleString('ko-KR') + '세트') +
        '</td><td data-label="받는 풀">' + g.pools + '개 등급 풀</td></tr>';
    }).join('');
  }

  function gradeFor(sets) {
    var g = GRADES[0];
    GRADES.forEach(function (x) { if (sets >= x.need) g = x; });
    return g;
  }
  function nextGrade(sets) {
    for (var i = 0; i < GRADES.length; i++) {
      if (GRADES[i].need > sets) return GRADES[i];
    }
    return null;
  }

  /* ── 시뮬레이터 ─────────────────────────────────────────────────── */
  function readNum(id) {
    var el = $('#' + id);
    var v = el ? parseFloat(el.value) : 0;
    if (isNaN(v) || v < 0) v = 0;
    return v;
  }

  function renderSim() {
    var sets = readNum('simSets');
    var sales = readNum('simSales');
    var setCount = readNum('simSetCount');
    var reBuy = readNum('simReBuy');
    var bonus = readNum('simBonus');

    var linkEarn = sales * 0.06;
    var setEarn = setCount * 30000;
    var cash = linkEarn + setEarn;
    var tax = cash * 0.033;
    var net = cash - tax;

    var addedSets = Math.floor(reBuy / 365000) + setCount;
    var after = sets + addedSets;

    var g = gradeFor(sets);
    var ng = nextGrade(after);
    var nextNeed = ng ? ng.need : null;

    $('#simGradeName').textContent = g.name;
    var barPct = 100;
    if (ng) {
      var from = g.need;
      var span = ng.need - from;
      barPct = span > 0 ? Math.max(0, Math.min(100, ((after - from) / span) * 100)) : 100;
      $('#simNext').textContent = ng.name + '까지 ' + Math.max(0, ng.need - after).toFixed(1) + '세트 남음';
    } else {
      barPct = 100;
      $('#simNext').textContent = '최고 등급입니다';
    }
    $('#simBar').style.width = barPct.toFixed(1) + '%';

    var rows = [
      ['내 링크 제품 판매의 6%', linkEarn, '판매액 ' + won(sales) + ' 기준'],
      ['크리에이터 세트 소개 ' + setCount + '건', setEarn, '건당 30,000원'],
      ['원천징수 3.3%', -tax, '소득세 3% + 지방세 0.3%'],
      ['실수령 예상', net, '다음 주 금요일 입금 기준']
    ];
    $('#simRows').innerHTML = rows.map(function (r) {
      return '<div class="sim-row"><dt>' + r[0] + '<small>' + r[2] + '</small></dt>' +
        '<dd class="' + (r[1] < 0 ? 'is-minus' : '') + '">' + (r[1] < 0 ? '−' : '') + won(Math.abs(r[1])) + '</dd></div>';
    }).join('') +
      '<div class="sim-row sim-row--sets"><dt>이번 달 새로 쌓이는 세트<small>제품 구매 365,000원당 1세트 + 세트 소개 ' + setCount + '건</small></dt>' +
      '<dd>+' + addedSets.toFixed(1) + '세트</dd></div>';

    $('#simTotal').textContent = won(cash);
    $('#simNet').textContent = '3.3% 원천징수 후 ' + won(net);
    $('#simBonusNote').textContent = bonus > 0
      ? ' 지난달 장려금 ' + won(bonus) + '은 변동 항목이라 합계에 넣지 않았습니다.'
      : '';
  }

  /* ── 체크리스트 ─────────────────────────────────────────────────── */
  var CHECKS = [
    '이메일 계정 하나를 새로 쓸 수 있다 (전화번호·일반 아이디 가입 불가)',
    '크리에이터 세트 365,000원을 1회 결제할 수 있다',
    '제품 후기를 올릴 채널이 하나 있다 (블로그·인스타·스레드 등)',
    '하루 20~30분씩 쓸 수 있다 (7일 사이클 확인 포함)',
    '출금받을 본인 명의 계좌가 있다',
    '수익 보장·투자·라인 같은 표현을 쓰지 않기로 했다',
    '개봉하면 단순 변심 환불이 제한된다는 점을 확인했다',
    '다음 해 5월 종합소득세 신고 일정을 캘린더에 넣었다'
  ];
  var CHECK_KEY = 'skin.checks';

  function loadChecks() {
    try {
      var raw = localStorage.getItem(CHECK_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveChecks(arr) {
    try { localStorage.setItem(CHECK_KEY, JSON.stringify(arr)); } catch (e) { /* 저장 불가 시 무시 */ }
  }

  function renderChecks() {
    var saved = loadChecks();
    $('#checkList').innerHTML = CHECKS.map(function (text, i) {
      var on = !!saved[i];
      return '<label class="check__item' + (on ? ' is-on' : '') + '">' +
        '<input type="checkbox" data-idx="' + i + '"' + (on ? ' checked' : '') + '>' +
        '<span class="check__box" aria-hidden="true"></span>' +
        '<span class="check__text">' + text + '</span>' +
      '</label>';
    }).join('');
    updateCheckCount();
  }

  function updateCheckCount() {
    var n = $$('#checkList input:checked').length;
    $('#checkCount').textContent = n;
    $$('#checkList .check__item').forEach(function (el) {
      var input = $('input', el);
      el.classList.toggle('is-on', !!(input && input.checked));
    });
  }

  /* ── FAQ ────────────────────────────────────────────────────────── */
  var FAQ = [
    ['크리에이터 세트 365,000원은 가입비인가요?',
      '아닙니다. 화장품과 AI 프로그램 2종(영상 촬영 가이드·홍보글 자동 작성)을 함께 구성한 상품이고 1인 1회만 구매할 수 있습니다. 크리에이터 신청은 선택이라, 신청하지 않아도 제품과 AI 프로그램은 그대로 쓸 수 있습니다. 회원가입·단품 구매·크리에이터 활동에 따로 내는 가입비·교육비·유지비는 없습니다.'],
    ['파이업은 다단계인가요?',
      '보상이 계산되는 방식이 다릅니다. 직접 소개한 분까지만 계산하며, 내가 소개한 분이 다시 다른 분을 소개해도 그 실적은 나에게 반영되지 않습니다(전산에 집계 기능 자체가 없습니다). 내가 소개한 분의 구매는 첫 결제 후 180일 안의 금액만 등급 세트로 환산됩니다. 크리에이터 사이에 상하 관계나 소속은 없고, 교육과 안내는 회사가 직접 합니다.'],
    ['돈을 넣으면 돌려받는 구조인가요?',
      '아닙니다. 성과 보상 구조이고, 베이직 장려금은 1인당 누적 35만 원 한도가 있어 한도에 이르면 자동으로 지급이 멈춥니다. 이 한도는 상한일 뿐 보장 금액이 아니고, 장려금은 매일 플랫폼 전체 매출과 인원에 따라 달라지며, 그날 회사 전체 매출이 없으면 지급되지 않습니다. 파이업의 어떤 상품도 투자·금융상품이 아닙니다.'],
    ['계속 사야 등급이 유지되나요?',
      '아닙니다. 등급 유지 조건이나 의무 구매가 없고, 한 번 오른 등급은 내려가지 않습니다. 다만 재구매로 등급 실적을 올리려면 산 제품을 모두 콘텐츠로 만들어 회사의 인증을 받아야 합니다. 제품을 사기만 해서는 실적이 오르지 않습니다.'],
    ['적립은 언제 확정되나요?',
      '매출이 생긴 날부터 7일 뒤인 8일차 0시에 확정됩니다. 화요일 매출이면 다음 주 화요일에 확정되고, 확정된 금액은 바뀌지 않으며 그때부터 출금할 수 있습니다.'],
    ['출금은 언제, 얼마씩 되나요?',
      '확정된 적립금을 10,000원 단위로 신청합니다. 월요일부터 일요일까지 신청한 금액은 다음 주 금요일에 세금 3.3%를 떼고 입금됩니다. 40,000원을 신청하면 1,320원이 빠져 38,680원이 들어옵니다.'],
    ['세금은 어떻게 처리되나요?',
      '출금할 때 3.3%(소득세 3% + 지방세 0.3%)가 원천징수됩니다. 이것은 미리 낸 세금이고, 다음 해 5월 종합소득세 신고에서 필요경비와 공제를 반영해 다시 계산합니다. 다른 부업 소득과 합산되므로 건강보험료 피부양자 자격도 함께 확인하세요.'],
    ['환불은 되나요?',
      '전자상거래법에 따른 청약철회가 그대로 보장됩니다. 단순 변심은 받은 날부터 7일 안에 가능하고, 표시·광고와 다른 경우는 받은 날부터 3개월 안에 가능합니다. 다만 제품 봉인(씰)을 뜯거나 사용한 경우에는 단순 변심 청약철회가 제한됩니다. 택배 상자만 연 경우는 가능합니다.'],
    ['크리에이터가 과장 광고를 하면 어떻게 되나요?',
      '수익 보장, 구매 금액 회수, 투자처럼 들리는 표현과 제품 효능 과장은 쓸 수 없습니다. 위반이 확인되면 회사가 시정을 요청하고, 소개 링크 정지와 적립 보류 등으로 조치합니다.'],
    ['본인 재구매도 실적이 되나요?',
      '네, 내가 직접 구매한 것도 365,000원마다 1세트로 인정됩니다. 다만 산 제품에 대한 홍보 콘텐츠를 만들어 제출하고 회사의 승인을 받아야 하며, 같은 제품을 5개 넘게 사거나 한 번에 100만 원 이상 구매하면 사용 목적(본인 사용·선물 등)을 소명해야 합니다.']
  ];

  function renderFaq() {
    $('#faqList').innerHTML = FAQ.map(function (q, i) {
      return '<details class="faq__item"' + (i === 0 ? ' open' : '') + '>' +
        '<summary>' + q[0] + '</summary>' +
        '<div class="faq__a"><p>' + q[1] + '</p></div>' +
      '</details>';
    }).join('');
  }

  /* ── 탭 ─────────────────────────────────────────────────────────── */
  var TAB_IDS = ['routine', 'system', 'start'];

  function setTab(name, updateHash) {
    if (TAB_IDS.indexOf(name) < 0) name = 'routine';
    TAB_IDS.forEach(function (t) {
      var tab = $('#tab-' + t);
      var panel = $('#panel-' + t);
      var on = t === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
      panel.classList.toggle('is-active', on);
    });
    if (updateHash) {
      try { history.replaceState(null, '', '#' + name); } catch (e) { /* 무시 */ }
    }
  }

  /* ── 토스트 ─────────────────────────────────────────────────────── */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2200);
  }

  /* ── 복사 ───────────────────────────────────────────────────────── */
  function buildSummary() {
    var r = buildRoutine();
    var lines = [];
    var labels = [TYPE_LABEL[state.type]];
    Object.keys(state.concerns).forEach(function (k) {
      if (state.concerns[k] && !(k === 'dry' && state.type === 'dry')) labels.push(CONCERN_LABEL[k]);
    });
    lines.push('룰루뷰 루틴 (' + labels.join('·') + ', ' + DEPTH_LABEL[state.depth] + ')');
    r.items.forEach(function (it, i) {
      var p = BY_KEY[it.key];
      if (!p) return;
      lines.push((i + 1) + '. ' + p.name + (p.size ? ' ' + p.size : '') + ' — ' + won(p.price));
    });
    lines.push('낱개 합계 ' + won(sumPrice(r.items)) + ' (정가 ' + won(sumList(r.items)) + ')');
    if (r.plus.length) {
      lines.push('플러스: ' + r.plus.map(function (it) { return BY_KEY[it.key].name; }).join(', '));
    }
    lines.push('가격 2026-11-27 기준 · 루틴 다시 보기: ' + (CFG.siteUrl || 'https://ufssdf987-creator.github.io/skin-pieup/'));
    return lines.join('\n');
  }

  function copySummary() {
    var text = buildSummary();
    function done() { toast('루틴 요약을 복사했습니다'); }
    function fail() { toast('복사가 막혔습니다. 길게 눌러 선택해 주세요'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? done() : fail(); } catch (e) { fail(); }
      document.body.removeChild(ta);
    }
  }

  /* ── 테마 ───────────────────────────────────────────────────────── */
  function initTheme() {
    var btn = $('#themeBtn');
    function sync() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.setAttribute('aria-label', dark ? '라이트 모드 전환' : '다크 모드 전환');
      btn.title = btn.getAttribute('aria-label');
    }
    btn.addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('skin.theme', next); } catch (e) { /* 무시 */ }
      sync();
    });
    sync();
  }

  /* ── GA4 이벤트 (사용자가 실제로 조작했을 때만) ───────────────── */
  var builderTimer = null;
  function trackBuilder() {
    clearTimeout(builderTimer);
    builderTimer = setTimeout(function () {
      var r = buildRoutine();
      var picked = Object.keys(state.concerns).filter(function (k) { return state.concerns[k]; });
      track('builder_result', {
        skin_type: state.type,
        concerns: picked.join(','),
        concern_count: picked.length,
        depth: state.depth,
        steps: r.items.length,
        total_krw: sumPrice(r.items)
      });
    }, 700);
  }

  var simTimer = null;
  function trackSimulator() {
    clearTimeout(simTimer);
    simTimer = setTimeout(function () {
      track('simulator_use', {
        sets: readNum('simSets'),
        monthly_sales_krw: readNum('simSales'),
        set_referrals: readNum('simSetCount'),
        re_buy_krw: readNum('simReBuy')
      });
    }, 900);
  }

  /* ── 하단 고정 가입 바 ─────────────────────────────────────────── */
  function initStickyCta() {
    var bar = $('#stickyCta');
    if (!bar) return;
    var shown = false;
    var footVisible = false;
    var foot = $('.footcta');

    function sync() {
      var doc = document.documentElement;
      var y = window.pageYOffset || doc.scrollTop || 0;
      var max = (doc.scrollHeight || 0) - window.innerHeight;
      var ratio = max > 0 ? y / max : 0;
      var want = ratio >= 0.45 && !footVisible;
      if (want === shown) return;
      shown = want;
      if (shown) bar.hidden = false;
      bar.classList.toggle('is-on', shown);
      document.body.classList.toggle('has-sticky', shown);
      if (!shown) {
        window.setTimeout(function () { if (!shown) bar.hidden = true; }, 260);
      }
    }

    if (foot && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        footVisible = !!(entries[0] && entries[0].isIntersecting);
        sync();
      }).observe(foot);
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { ticking = false; sync(); });
    }, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }

  /* ── 이벤트 ─────────────────────────────────────────────────────── */
  function initEvents() {
    $('#typeChips').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      $$('#typeChips .chip').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      state.type = btn.getAttribute('data-type');
      renderRoutine();
      trackBuilder();
    });

    $('#concernChips').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      var key = btn.getAttribute('data-concern');
      var on = !state.concerns[key];
      // 최소 한 개는 남깁니다.
      var count = Object.keys(state.concerns).filter(function (k) { return state.concerns[k]; }).length;
      if (!on && count === 1) {
        toast('고민은 하나 이상 골라 주세요');
        return;
      }
      state.concerns[key] = on;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      renderRoutine();
      trackBuilder();
    });

    $('#depthSeg').addEventListener('click', function (e) {
      var btn = e.target.closest('.seg');
      if (!btn) return;
      $$('#depthSeg .seg').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      state.depth = btn.getAttribute('data-depth');
      renderRoutine();
      trackBuilder();
    });

    $('#copyBtn').addEventListener('click', copySummary);
    $('#resetBtn').addEventListener('click', function () {
      state = { type: 'dry', concerns: { dry: true }, depth: 'mini' };
      $$('#typeChips .chip').forEach(function (b) {
        var on = b.getAttribute('data-type') === 'dry';
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      $$('#concernChips .chip').forEach(function (b) {
        var on = b.getAttribute('data-concern') === 'dry';
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $$('#depthSeg .seg').forEach(function (b) {
        var on = b.getAttribute('data-depth') === 'mini';
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      renderRoutine();
      toast('처음 상태로 돌렸습니다');
    });

    ['simSets', 'simSales', 'simSetCount', 'simReBuy', 'simBonus'].forEach(function (id) {
      var el = $('#' + id);
      if (el) el.addEventListener('input', function () { renderSim(); trackSimulator(); });
    });

    /* 모든 가입·제품 CTA 클릭을 위치(position)와 함께 기록 */
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-ga-cta]') : null;
      if (!el) return;
      track('cta_click', {
        position: el.getAttribute('data-ga-pos') || 'unknown',
        kind: el.getAttribute('data-ga-kind') || 'signup',
        item: el.getAttribute('data-ga-name') || '',
        link_url: el.href || ''
      });
    });

    $('#checkList').addEventListener('change', function () {
      var arr = $$('#checkList input').map(function (i) { return i.checked; });
      saveChecks(arr);
      updateCheckCount();
    });

    $$('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var from = document.querySelector('.tab.is-active');
        setTab(tab.getAttribute('data-tab'), true);
        track('tab_switch', {
          tab: tab.getAttribute('data-tab'),
          from_tab: from ? from.getAttribute('data-tab') : ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      tab.addEventListener('keydown', function (e) {
        var i = TAB_IDS.indexOf(tab.getAttribute('data-tab'));
        var next = null;
        if (e.key === 'ArrowRight') next = TAB_IDS[(i + 1) % TAB_IDS.length];
        if (e.key === 'ArrowLeft') next = TAB_IDS[(i - 1 + TAB_IDS.length) % TAB_IDS.length];
        if (next) {
          e.preventDefault();
          setTab(next, true);
          $('#tab-' + next).focus();
        }
      });
    });
  }

  /* ── 시작 ───────────────────────────────────────────────────────── */
  function init() {
    renderRoutine();
    renderCatalog();
    renderGrades();
    renderSim();
    renderChecks();
    renderFaq();
    initTheme();
    initEvents();
    initStickyCta();
    var hash = (location.hash || '').replace('#', '');
    setTab(TAB_IDS.indexOf(hash) >= 0 ? hash : 'routine', false);
    var v = $('#appVersion');
    if (v && CFG.version) v.textContent = CFG.version;
    var d = $('#dataDate');
    if (d) d.textContent = '2026-11-27';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 서비스 워커 (오프라인 앱 셸)
  // · 새 배포가 올라오면 바로 새 서비스 워커로 교체하고, 한 번만 새로고침한다.
  // · 그래도 옛 CSS 가 남는 경우를 막으려고 index.html 은 styles.css?v= 로 불러온다.
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }  // 첫 설치: 새로고침 불필요
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        // 대기 중인 새 워커가 있으면 바로 활성화
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
        // 다음 방문을 기다리지 않고 배포 여부를 확인
        reg.update().catch(function () { /* 확인 실패는 무시 */ });
      }).catch(function () { /* 등록 실패는 무시 */ });
    });
  }
})();
