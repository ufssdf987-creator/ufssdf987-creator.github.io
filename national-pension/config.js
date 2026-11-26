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
  version: '1.0.1',
  siteName: '2026 국민연금·기초연금 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/national-pension/',

  adsense: {
    client: 'ca-pub-4355917079579050',
    slots: {
      top: '',    // 상단 가로 배너 (data-ad-slot 값, 10자리)
      mid: '',    // 예상수령액 결과 아래
      mid2: '',   // 조기·연기 결과 아래
      bottom: ''  // 기초연금 결과 아래
    },
    showPlaceholders: false
  },

  coupang: {
    // 공정위 문구는 카드·푸터에 그대로 노출됩니다.
    disclosure: '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    heading: '연금액 적어보는 밤, 발이 차가울 때',
    subheading: '가입기간과 월소득 정리하다 보면 시간이 갑니다. 콘센트에 꽂아 두는 발열 매트 하나면 책상 앞이 한결 따뜻해집니다.',
    items: [
      {
        name: '한일의료기 탄소열선 고급 전기요 HL-D205',
        tag: '150W · 탄소열선 전기요',
        emoji: '🔌',
        url: 'https://link.coupang.com/a/iUKxRtUptk',
        cta: '쿠팡에서 보기'
      }
    ]
  },

  links: {
    blog: 'https://blog.naver.com/ufssdf987',
    nps: 'https://www.nps.or.kr/',
    bokjiro: 'https://www.bokjiro.go.kr/',
    mohw: 'https://www.mohw.go.kr/',
    law: 'https://www.law.go.kr/'
  },

  share: {
    hashtag: '#국민연금계산기 #국민연금예상수령액 #조기노령연금 #연기연금 #기초연금 #노령연금수급연령 #소득대체율 #국민연금개혁 #보험료율인상 #기초연금선정기준액 #부부기초연금 #소득인정액 #반환일시금 #실업크레딧 #출산크레딧'
  }
};
