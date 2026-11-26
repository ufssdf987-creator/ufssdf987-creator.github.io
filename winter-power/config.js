/*!
 * config.js — 수익화·링크 설정 (이 파일만 고치면 됩니다)
 * ------------------------------------------------------------------
 * 1) AdSense 승인 후: adsense.client / slots 를 채우면 광고가 자동으로 붙습니다.
 *    승인 전에는 showPlaceholders: true 로 두면 광고 자리(회색 박스)가 보입니다.
 * 2) 쿠팡 파트너스: items 배열의 url 에 파트너스 단축 링크를 넣으면 카드가 나타납니다.
 *    url 이 비어 있는 항목은 화면에 나오지 않습니다.
 * 3) siteUrl 은 공유 문구와 sitemap 에 쓰는 실제 배포 주소로 바꿔 주세요.
 */
window.APP_CONFIG = {
  version: '1.0.5',
  siteName: '겨울 전기요금 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/winter-power/',

  adsense: {
    // 예: client: 'ca-pub-4355917079579050'
    client: '',
    slots: {
      top: '',    // 상단 가로 배너 (data-ad-slot 값)
      mid: '',    // 결과 아래
      bottom: ''  // 하단
    },
    showPlaceholders: false   // 광고 자리를 미리 보려면 true
  },

  coupang: {
    // 공정위 문구는 화면 하단에 그대로 노출됩니다.
    disclosure: '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    heading: '전기 덜 먹는 겨울 가전',
    subheading: '같은 난방이라도 소비전력에 따라 요금 차이가 커요.',
    items: [
      {
        name: '한일의료기 탄소열선 고급 전기요 HL-D205',
        watt: 150,
        tag: '150W · 탄소열선 전기요',
        note: '온수매트(250W)의 60% 수준',
        url: 'https://link.coupang.com/a/iUKxRtUptk',
        cta: '쿠팡에서 보기'
      },
      {
        name: '홈플래닛 접이식 파티션 히터 D2401',
        watt: 195,
        tag: '195W · 접이식 파티션',
        url: 'https://link.coupang.com/a/iW05pEKhWK',
        cta: '쿠팡에서 보기'
      },
      {
        name: '일월 숲속애 온수매트',
        watt: 480,
        tag: '480W · 온수매트(더블 기준)',
        url: 'https://link.coupang.com/a/iV0FQzRrHg',
        cta: '쿠팡에서 보기'
      }
      // ▼ 아래처럼 항목을 추가하면 카드가 자동으로 늘어납니다.
      // { name: '파티션 히터 195W', watt: 195, tag: '195W', note: '', url: 'https://link.coupang.com/a/...', cta: '쿠팡에서 보기' }
    ]
  },

  links: {
    blog: 'https://blog.naver.com/ufssdf987',
    kepco: 'https://cyber.kepco.co.kr/ckepco/front/jsp/CY/E/E/CYEEHP00101.jsp',
    kepcoWelfare: 'https://cyber.kepco.co.kr/ckepco/front/jsp/CY/H/C/CYHCHP00208.jsp'
  },

  share: {
    hashtag: '#겨울전기요금 #누진세계산기'
  }
};
