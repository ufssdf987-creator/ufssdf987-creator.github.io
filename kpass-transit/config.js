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
  version: '1.0.4',
  siteName: 'K-패스·대중교통 환급 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/kpass-transit/',

  adsense: {
    client: 'ca-pub-4355917079579050',
    slots: {
      top: '',    // 상단 가로 배너 (data-ad-slot 값, 10자리)
      mid: '',    // 환급 결과 아래
      mid2: '',   // 카드 비교 결과 아래
      bottom: ''  // 출퇴근 비교 결과 아래
    },
    showPlaceholders: false
  },

  coupang: {
    // 공정위 문구는 카드·푸터에 그대로 노출됩니다.
    disclosure: '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    heading: '환급받은 교통비, 난방비로 새지 않게',
    subheading: '겨울 출퇴근하고 돌아온 방, 필요한 곳만 데우는 소형 파티션 히터입니다. 전기요금 계산기와 함께 보면 겨울 고정비가 잡힙니다.',
    items: [
      {
        name: '홈플래닛 접이식 파티션 히터 D2401',
        tag: '개인용 소형 히터 · 필요할 때만',
        emoji: '🔥',
        url: 'https://link.coupang.com/a/iW05pEKhWK',
        cta: '쿠팡에서 보기'
      }
    ]
  },

  links: {
    blog: 'https://blog.naver.com/ufssdf987',
    kpass: 'https://korea-pass.kr/',
    kotsa: 'https://www.kotsa.or.kr/',
    seoul: 'https://news.seoul.go.kr/traffic/public/climatecard-faq/faq-climatepass',
    opinet: 'https://www.opinet.co.kr/'
  },

  share: {
    hashtag: '#K패스 #모두의카드 #대중교통환급 #청년교통비 #기후동행패스 #교통비계산기'
  }
};
