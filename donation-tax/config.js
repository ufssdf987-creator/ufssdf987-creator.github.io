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
  version: '1.0.2',
  siteName: '2026 고향사랑기부제·기부금 세액공제 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/donation-tax/',

  adsense: {
    client: 'ca-pub-4355917079579050',
    slots: {
      top: '',    // 상단 가로 배너 (data-ad-slot 값, 10자리)
      mid: '',    // 고향사랑 실익 결과 아래
      mid2: '',   // 전체 기부금 결과 아래
      bottom: ''  // 0원 함정 결과 아래
    },
    showPlaceholders: false
  },

  coupang: {
    // 공정위 문구는 카드·푸터에 그대로 노출됩니다.
    disclosure: '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    heading: '기부하고 받은 답례품, 명절 선물로',
    subheading: '연말정산 환급금이 들어오는 2월, 겨울 끝자락에 쓰기 좋은 차렵이불입니다. 기부 혜택을 먼저 계산해 보세요.',
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
    gohyang: 'https://www.ilovegohyang.go.kr/',
    hometax: 'https://www.hometax.go.kr/',
    nts: 'https://www.nts.go.kr/',
    law: 'https://www.law.go.kr/'
  },

  share: {
    hashtag: '#고향사랑기부제 #고향사랑기부금 #10만원기부 #답례품30% #세액공제 #연말정산 #기부금세액공제 #정치자금기부금 #종교단체기부금 #13월의월급'
  }
};
