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
  version: '1.0.11',
  siteName: '부가가치세·노란우산 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/vat-biz/',

  adsense: {
    client: 'ca-pub-4355917079579050',
    slots: {
      top: '',    // 상단 가로 배너 (data-ad-slot 값, 10자리)
      mid: '',    // 일반과세 결과 아래
      mid2: '',   // 간이과세 결과 아래
      bottom: ''  // 노란우산 결과 아래
    },
    showPlaceholders: false
  },

  coupang: {
    // 공정위 문구는 카드·푸터에 그대로 노출됩니다.
    disclosure: '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    heading: '부가세 신고 끝나면, 매장·작업실 난방비부터',
    subheading: '손님 없는 시간의 난방은 소비전력이 낮은 기기로 바꾸는 게 먼저예요.',
    items: [
      { name: '홈플래닛 접이식 파티션 히터 D2401', tag: '195W · 접이식 파티션 히터', emoji: '🟧', url: 'https://link.coupang.com/a/iW05pEKhWK', cta: '쿠팡에서 보기' },
      { name: '시프이컴 PTC 미니 온풍기 CIF-FH04W', tag: '500W · 책상 위 미니 온풍기', emoji: '♨️', url: 'https://link.coupang.com/a/iUNrRsAlDE', cta: '쿠팡에서 보기' },
      { name: '락앤락 메트로 머그 텀블러 600ml', tag: '600ml · 스테인리스 304 · 보온보냉', emoji: '☕', url: 'https://link.coupang.com/a/iUQfdkygHQ', cta: '쿠팡에서 보기' }
    ]
  },

  links: {
    blog: 'https://blog.naver.com/ufssdf987',
    nts: 'https://www.nts.go.kr/',
    hometax: 'https://www.hometax.go.kr/',
    law: 'https://www.law.go.kr/',
    yumam: 'https://www.8899.or.kr/'
  },

  share: {
    hashtag: '#부가가치세 #부가세계산기 #간이과세 #노란우산공제 #개인사업자절세'
  }
};
