# 누리닷 홈페이지

Notion 「홈페이지」의 2026-11-13 `nuridot-site.zip`을 반영한 정적 사이트입니다.
원본: https://app.notion.com/p/41743813bc2e80978308d582a0bde3b8

## 구성

- `index.html`: 제품·기능·다운로드·요금제·QnA·문의
- `terms.html`, `privacy.html`: 첨부된 약관과 개인정보 처리방침 원문
- `assets/`: 디자인 이미지, 스타일, 언어/점자 전환, 문의 폼
- `Dockerfile`, `nginx.conf`: 기존 Cloud Run 서비스의 nginx 배포
- `IMG/`: 기존 공개 이미지 주소 호환용

빌드 도구 없이 배포합니다. `package.json`의 의존성은 테스트에만 사용되며 컨테이너에는 포함되지 않습니다.

## 로컬 확인 및 테스트

```sh
python -m http.server 8766 --bind 127.0.0.1
npm ci
npm test
```

테스트는 로컬 파일·앵커, 점자/영문 복원, 요금제 키보드 탐색, 모바일 메뉴, 문의 검증·중복 전송 방지·성공/실패 처리를 확인합니다. 문의 테스트는 네트워크 응답을 모의하여 실제 문의를 생성하지 않습니다.

## 운영 연결

- 홈페이지: https://nuridot.com/
- 이전 주소 `https://semo-jum.com/`는 경로와 쿼리를 유지해 새 도메인으로 영구 이동합니다 (HTTP 308).
- Windows 설치 파일: https://github.com/nuridot/Semojum/releases/latest/download/Semojum-win-x64.msi
- 문의: `POST https://api.semojum.app/api/public/inquiries`
  - 문의 유형은 구매 문의(`PURCHASE`), 체험 문의(`TRIAL`), 건의사항(`SUGGESTION`), 기타 (직접 입력)(`ETC`)입니다.
  - 기타 선택 시 유형을 직접 입력해야 하며, 입력값은 `title`에 저장합니다. 그 외 유형은 유형 이름을 제목으로 보냅니다.
  - 선택한 유형과 기관명·전화·월 처리량은 본문에 포함됩니다. `name`, `email`, `message`, `website` 계약을 유지합니다.
  - 입력은 성공했을 때만 초기화합니다.
  - `window.__API_BASE__`로 테스트 환경의 주소를 지정할 수 있습니다.
- 검색 메타데이터와 사이트맵은 현재 운영 도메인을 사용합니다. 향후 도메인 이전 시 함께 수정해야 합니다.

## 배포

기존 프로젝트·서비스·리전을 명시하여 배포합니다. 공개 접근 및 서비스 리소스 설정은 유지합니다.

```sh
gcloud run deploy semojum-web --source . --project semojum-website --region asia-northeast1 --account contact@semo-jum.com --quiet
```

누락된 경로는 404를 반환합니다. HTML과 이름이 고정된 `assets/`는 재검증하여 업데이트를 즉시 반영합니다.

### nuridot.com 도메인 연결

Cloud Run 도메인 매핑은 `semojum-website` 프로젝트의 `asia-northeast1` 리전에서 `semojum-web` 서비스를 가리킵니다. Cloudflare에는 루트 도메인의 다음 레코드를 DNS only, TTL 300초로 등록했습니다. 기존 MX, SPF, DKIM, Google 소유권 확인 TXT는 유지합니다.

- A: `216.239.32.21`, `216.239.34.21`, `216.239.36.21`, `216.239.38.21`
- AAAA: `2001:4860:4802:32::15`, `2001:4860:4802:34::15`, `2001:4860:4802:36::15`, `2001:4860:4802:38::15`

인증서는 Google이 자동으로 발급·갱신합니다. 이 설정은 `nuridot.com`에만 적용되며 `www`는 포함하지 않습니다.

## 점자 자료

`assets/braille.js`는 첨부 소스의 점역 엔진 생성 자료입니다. 본문 텍스트를 바꾸면 `nuridot/braille`의 `semojum_braille` 패키지를 사용할 수 있는 환경에서 `tools-build-braille.py`를 실행해 다시 생성해야 합니다. 동적 문의 상태와 숨김 스팸 방지 필드는 `data-nobr`로 제외합니다.

GA는 원본대로 꺼져 있습니다. 사업자등록 관련 미확정 표기와 정책 본문도 제공된 원문을 유지합니다.

## 홈페이지 로그인

홈페이지 헤더에서 아이디·이메일 로그인, 이메일 가입·코드 확인, 비밀번호 재설정, 로그아웃을 이용합니다. 카드에는 한국어·영문과 모바일 레이아웃이 있습니다. 별칭과 크레딧은 인증된 API 응답을 사용합니다. nginx는 홈페이지에서 사용하는 인증 API와 지갑 경로만 같은 출처로 프록시합니다. 정적 개발 서버에서는 기존 `window.__API_BASE__`로 테스트 API 주소를 지정할 수 있습니다.

액세스 토큰은 메모리에 두고, 새로고침할 때 리프레시 토큰으로 재발급합니다. 로그인 상태 유지를 선택하면 리프레시 토큰을 localStorage에, 해제하면 sessionStorage에 보관합니다. 로그아웃은 서버에서 세션을 종료한 뒤 로컬 값을 지웁니다.

### 소셜 로그인 웹 설정

이 사이트의 OAuth 복귀 경로는 `/auth-callback.html`입니다. 사용하려는 도메인별로 전체 HTTPS URI를 제공자 콘솔에 등록하고, 백엔드가 그 URI와 같은 웹 클라이언트로 코드를 교환하도록 설정합니다. 예를 들어 누리닷 도메인의 등록 주소는 `https://nuridot.com/auth-callback.html`입니다. Google은 웹 애플리케이션 클라이언트가 필요합니다.

누리닷 Google Cloud 프로젝트의 웹 클라이언트 `nuridot-homepage`에는 원본 `https://nuridot.com`과 위 복귀 주소가 등록되어 있습니다. 홈페이지의 기본 설정은 이 클라이언트의 공개 ID를 사용합니다. 사이트는 `GET /api/auth/social/providers`가 같은 ID를 반환할 때 해당 버튼을 활성화합니다.

다른 배포에서 설정을 재정의하려면 `assets/auth-client.js` 로드 전에 아래와 같이 출처별 공개 ID를 지정합니다. 설정에는 해당 출처의 복귀 주소를 등록한 제공자만 포함합니다.

```js
window.__NURIDOT_WEB_CLIENTS__ = {
  'https://nuridot.com': {
    KAKAO: '<등록한 카카오 REST API 키>',
    GOOGLE: '<백엔드가 반환하는 웹 클라이언트 ID>',
    NAVER: '<등록한 네이버 클라이언트 ID>'
  }
};
```

가입 시 보내는 이용약관과 개인정보 처리방침 판은 이 사이트에 게시된 두 문서의 시행일과 맞춥니다. 문서가 개정되면 본문과 `assets/auth-client.js`의 판을 함께 갱신합니다.
