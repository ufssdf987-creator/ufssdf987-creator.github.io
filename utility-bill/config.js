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
  version: '1.0.3',
  siteName: '2026 전기요금·도시가스·복지할인 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/utility-bill/',

  adsense: {
    client: 'ca-pub-4355917079579050',
    slots: {
      top: '',    // 상단 가로 배너 (data-ad-slot 값, 10자리)
      mid: '',    // 전기요금 결과 아래
      mid2: '',   // 도시가스 결과 아래
      bottom: ''  // 복지할인 결과 아래
    },
    showPlaceholders: false
  },

  coupang: {
    // 공정위 문구는 카드·푸터에 그대로 노출됩니다.
    disclosure: '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    heading: '전기요 아끼는 밤에 챙길 것',
    subheading: '같은 난방이라도 소비전력이 낮은 기기로 바꾸면 요금이 달라져요.',
    items: [
      { name: '한일의료기 탄소열선 고급 전기요 HL-D205', tag: '150W · 탄소열선 전기요', emoji: '🔌', url: 'https://link.coupang.com/a/iUKxRtUptk', cta: '쿠팡에서 보기' },
      { name: '홈플래닛 접이식 파티션 히터 D2401', tag: '195W · 접이식 파티션 히터', emoji: '🟧', url: 'https://link.coupang.com/a/iW05pEKhWK', cta: '쿠팡에서 보기' },
      { name: '일월 숲속애 온수매트', tag: '480W · 온수매트(더블 기준)', emoji: '♨️', url: 'https://link.coupang.com/a/iV0FQzRrHg', cta: '쿠팡에서 보기' }
    ]
  },

  links: {
    blog: 'https://blog.naver.com/ufssdf987',
    kepco: 'https://cyber.kepco.co.kr/',
    kepcoon: 'https://online.kepco.co.kr/',
    seoulgas: 'https://www.seoulgas.co.kr/',
    energyv: 'https://www.energyv.or.kr/'
  },

  share: {
    hashtag: '#전기요금계산기 #누진세계산기 #도시가스계산기 #가스비계산 #한전주택용 #주택용저압 #주택용고압 #기후환경요금 #연료비조정단가 #전력산업기반기금 #도시가스요금 #MJ계산 #516MJ #다자녀전기요금 #대가족할인 #출산가구할인 #복지할인 #도시가스요금경감 #에너지바우처 #기초생활수급자 #차상위계층 #장애인할인 #난방비절약'
  }
};
