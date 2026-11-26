/*!
 * config.js — 수익화·링크 설정 (이 파일만 고치면 됩니다)
 * ------------------------------------------------------------------
 * 1) AdSense: 광고 단위(슬롯) ID를 slots 에 넣으면 광고가 자동으로 붙습니다.
 *    승인 전에는 showPlaceholders: true 로 두면 광고 자리(회색 박스)가 보입니다.
 * 2) 제휴 카드: items 배열의 url 에 검증된 파트너스 링크를 넣으면 카드가 나타납니다.
 *    url 이 비어 있는 항목은 화면에 나오지 않고, 항목이 하나도 없으면 섹션 자체가 숨겨집니다.
 * 3) siteUrl 은 공유 문구에 쓰는 실제 배포 주소입니다.
 */
window.APP_CONFIG = {
  version: '1.0.5',
  siteName: '복비·이사비용 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/brokerage-fee/',

  adsense: {
    client: 'ca-pub-4355917079579050',
    slots: {
      top: '',    // 상단 가로 배너 (data-ad-slot 값, 10자리)
      mid: '',    // 매매 결과 아래
      mid2: '',   // 전세·월세 결과 아래
      bottom: ''  // 이사 총비용 결과 아래
    },
    showPlaceholders: false
  },

  coupang: {
    // 공정위 문구는 카드·푸터에 그대로 노출됩니다.
    disclosure: '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    heading: '이사 첫날, 새집에서 잘 때',
    subheading: '짐을 다 풀고 첫날 밤. 계절 상관없이 쓰는 차렵이불 하나면 이불장을 비워 두지 않아도 됩니다.',
    items: [
      {
        name: '코멧 홈 양면 극세사 차렵이불',
        tag: 'SS 150×200cm · 사계절 겸용',
        emoji: '🛏️',
        url: 'https://link.coupang.com/a/iUOXTBaGe4',
        cta: '쿠팡에서 보기'
      }
    ]
  },

  links: {
    blog: 'https://blog.naver.com/ufssdf987',
    law: 'https://www.law.go.kr/',
    iros: 'https://www.iros.go.kr/',
    khug: 'https://www.khug.or.kr/',
    kar: 'https://www.kar.or.kr/'
  },

  share: {
    hashtag: '#복비계산기 #중개수수료 #부동산중개보수 #전세월세복비 #이사비용 #전세사기예방'
  }
};
