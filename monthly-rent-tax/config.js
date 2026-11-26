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
  version: '1.0.0',
  siteName: '2026 월세 세액공제·전세대출 공제 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/monthly-rent-tax/',

  adsense: {
    client: 'ca-pub-4355917079579050',
    slots: {
      top: '',    // 상단 가로 배너 (data-ad-slot 값, 10자리)
      mid: '',    // 월세 공제 결과 아래
      mid2: '',   // 전세대출 결과 아래
      bottom: ''  // 현금영수증 비교 결과 아래
    },
    showPlaceholders: false
  },

  coupang: {
    // 공정위 문구는 카드·푸터에 그대로 노출됩니다.
    disclosure: '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    heading: '이사·전월세 계약 전에 챙길 것',
    subheading: '이사할 때마다 계약서와 이체 내역을 다시 모으게 됩니다. 계약서·서류 보관용 파일과 이사 준비용품을 미리 챙겨 두세요.',
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
    hometax: 'https://www.hometax.go.kr/',
    nts: 'https://www.nts.go.kr/',
    myhome: 'https://www.myhome.go.kr/',
    law: 'https://www.law.go.kr/'
  },

  share: {
    hashtag: '#월세세액공제 #월세17% #월세1000만원 #전세대출소득공제 #주택임차차입금 #청약저축400만원 #주말부부월세 #배우자추가공제 #현금영수증30% #연말정산 #경정청구5년 #13월의월급'
  }
};
