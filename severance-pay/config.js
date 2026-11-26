/*!
 * config.js — 수익화·링크 설정 (이 파일만 고치면 됩니다)
 * ------------------------------------------------------------------
 * 1) AdSense: 승인 후 adsense.client 와 slots 값을 채우면 광고가 자동으로 붙습니다.
 *    지금은 승인 전이라 비어 있고, 광고 영역은 화면에 나오지 않습니다.
 *    미리보기: 주소 뒤에 ?ads=preview 를 붙이면 자리 표시(점선 박스)가 보입니다.
 * 2) relatedPost: 결과 아래 '운영 블로그' 카드에 걸리는 글입니다.
 *    새 글 주소를 넣으면 카드 제목·링크가 그 글로 바뀝니다.
 *    (비워 두면 블로그 홈으로 연결됩니다.)
 * 3) siteUrl 은 공유 문구에 쓰는 배포 주소입니다.
 */
window.APP_CONFIG = {
  version: '1.0.12',
  siteName: '퇴직금·실업급여·주휴수당 계산기',
  siteUrl: 'https://ufssdf987-creator.github.io/severance-pay/',

  adsense: {
    client: '',              // 예: 'ca-pub-4355917079579050'
    slots: {
      'ad-top': '',          // 상단 가로 배너 (data-ad-slot 값)
      'ad-mid': '',          // 퇴직금 결과 아래
      'ad-mid-job': '',      // 실업급여 결과 아래
      'ad-mid-weekly': '',   // 주휴수당 결과 아래
      'ad-bottom': ''        // 하단
    },
    showPlaceholders: false  // 광고 자리를 미리 보려면 true
  },

  links: {
    blog: 'https://blog.naver.com/ufssdf987',
    moel: 'https://www.moel.go.kr/',
    severanceCalc: 'https://labor.moel.go.kr/cmmt/calRtrmnt.do',
    ei: 'https://www.ei.go.kr/',
    hub: '../'
  },

  relatedPost: {
    label: '운영 블로그',
    title: '생활정보·부업 이야기를 블로그에 정리하고 있어요',
    url: 'https://blog.naver.com/ufssdf987',
    note: '퇴직·실업급여처럼 서류가 필요한 일은 공식 홈페이지 안내를 함께 확인하세요.'
  },

  share: {
    hashtag: '#퇴직금계산기 #실업급여 #주휴수당'
  }
};
