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
  siteName: '2026 보육료·유아학비·교육비 세액공제 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/childcare-edu/',

  adsense: {
    client: 'ca-pub-4355917079579050',
    slots: {
      top: '',    // 상단 가로 배너 (data-ad-slot 값, 10자리)
      mid: '',    // 보육·학비 결과 아래
      mid2: '',   // 초등 늘봄 결과 아래
      bottom: ''  // 교육비 공제 결과 아래
    },
    showPlaceholders: false
  },

  coupang: {
    // 공정위 문구는 카드·푸터에 그대로 노출됩니다.
    disclosure: '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    heading: '아이 낮잠·등원 준비에 챙길 것',
    subheading: '어린이집 낮잠 이불과 유치원 준비물은 매년 다시 사게 됩니다. 세탁이 쉬운 차렵이불 하나를 여분으로 두면 원비 고지서를 확인하는 일이 조금 가벼워집니다.',
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
    bokjiro: 'https://www.bokjiro.go.kr/',
    moe: 'https://www.moe.go.kr/',
    childcare: 'https://central.childcare.go.kr/',
    nts: 'https://www.nts.go.kr/',
    hometax: 'https://www.hometax.go.kr/'
  },

  share: {
    hashtag: '#보육료 #유아학비 #누리과정 #무상교육 #무상보육 #사립유치원 #어린이집 #연장보육 #늘봄학교 #초3방과후이용권 #교육비세액공제 #교육비300만원 #취학전학원비 #연말정산교육비 #육아비용'
  }
};
