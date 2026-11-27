/*!
 * config.js — 수익화·링크 설정 (이 파일만 고치면 됩니다)
 * ------------------------------------------------------------------
 * 1) AdSense: 광고 단위(슬롯) ID를 slots 에 넣으면 광고가 자동으로 붙습니다.
 *    승인 전에는 showPlaceholders: true 로 두면 광고 자리(회색 박스)가 보입니다.
 * 2) 쿠팡 파트너스: items 배열의 url 에 파트너스 링크를 넣으면 카드가 나타납니다.
 *    url 이 비어 있는 항목은 화면에 나오지 않고, 항목이 하나도 없으면 섹션 자체가 숨겨집니다.
 * 3) siteUrl 은 공유 문구에 쓰는 실제 배포 주소로 바꿔 주세요.
 */
window.APP_CONFIG = {
  version: '1.0.19',
  siteName: '청약 가점·신생아 특례대출 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/housing-loan/',

  adsense: {
    client: 'ca-pub-4355917079579050',
    slots: {
      top: '',    // 상단 가로 배너 (data-ad-slot 값, 10자리)
      mid: '',    // 가점 결과 아래
      mid2: '',   // 대출 결과 아래
      bottom: ''  // 하단
    },
    showPlaceholders: false   // 광고 자리를 미리 보려면 true
  },

  coupang: {
    // 공정위 문구는 카드·푸터에 그대로 노출됩니다.
    disclosure: '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다. 이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를 제공받습니다.',
    heading: '입주 전에 챙기는 것',
    subheading: '새집 결로와 건조함은 입주 첫 겨울에 잡는 게 가장 쉬워요.',
    items: [
      { name: '위닉스 뽀송 인버터 제습기 22L', tag: '22L · 340W · 1등급', emoji: '🌫️', url: 'https://naver.me/FTduLTjB', cta: '네이버에서 보기' },
      { name: '듀플렉스 3.5L 통세척 가습기', tag: '3.5L · 통세척 · 상품평 2만 건 이상', emoji: '💧', url: 'https://naver.me/xONoH7O5', cta: '네이버에서 보기' },
      { name: '코멧 홈 양면 극세사 차렵이불', tag: 'SS 150×200cm · 사계절 겸용', emoji: '🛏️', url: 'https://link.coupang.com/a/iUOXTBaGe4', cta: '쿠팡에서 보기' }
    ]
  },

  links: {
    blog: 'https://blog.naver.com/ufssdf987',
    applyhome: 'https://www.applyhome.co.kr/ap/apg/selectAddpntCalculatorView.do',
    nhuf: 'https://nhuf.molit.go.kr/'
  },

  share: {
    hashtag: '#청약가점 #신생아특례대출'
  }
};
