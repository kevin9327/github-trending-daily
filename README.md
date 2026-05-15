# 오늘의 GitHub 트렌딩

Playwright로 GitHub Trending `daily` 순위를 수집하고, 날짜별 스냅샷으로 저장해 보여주는 운영형 웹앱입니다. GitHub API 토큰 없이 GitHub Trending 웹페이지를 읽기 때문에 무료로 시작할 수 있습니다.

실서비스 무료 운영의 기본 경로는 `GitHub Actions + GitHub Pages`입니다. 서버를 24시간 켜두지 않고도 Actions가 매일 Playwright로 데이터를 수집하고, 날짜별 JSON을 저장소에 자동 커밋한 뒤 Pages가 정적 사이트를 제공합니다.

## 실행

```powershell
npm.cmd install
npm.cmd start
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 운영 기능

- Playwright Chromium으로 `https://github.com/trending?since=daily` 수집
- `data/latest.json`과 `data/history/YYYY-MM-DD.json`에 스냅샷 저장
- 수집 실패 시 마지막 정상 스냅샷 계속 제공
- `/api/health` 헬스체크 제공
- `/api/dates`로 저장된 날짜 목록 제공
- `/api/trending?date=YYYY-MM-DD`로 과거 스냅샷 조회
- 매일 `Asia/Seoul` 기준 09:10 자동 갱신, 매시간 누락 catch-up
- 수동 새로고침 쿨다운 및 선택적 관리자 토큰
- Dockerfile과 Render 무료 플랜용 `render.yaml` 포함

## 명령

```powershell
npm.cmd run scrape
npm.cmd run build:static
npm.cmd start
npm.cmd run verify
```

`verify`는 서버형 앱과 정적 배포 앱 모두에서 화면 렌더링을 Playwright로 확인합니다.

## GitHub Pages로 실제 서비스하기

1. 이 프로젝트를 GitHub 저장소에 올립니다.
2. 저장소 `Settings > Pages`에서 `Source`를 `GitHub Actions`로 선택합니다.
3. `Actions` 탭에서 `Deploy GitHub Trending Daily` 워크플로를 수동 실행하거나 `main` 브랜치에 push합니다.
4. 배포가 끝나면 GitHub Pages 주소가 생성됩니다.

워크플로는 매일 00:20 UTC, 한국 시간 09:20에 실행됩니다. 실행 과정은 다음과 같습니다.

- `npm ci`로 의존성 설치
- Playwright Chromium 설치
- `npm run scrape`로 오늘 GitHub Trending 수집
- `data/history/YYYY-MM-DD.json`을 저장소에 자동 커밋
- `npm run build:static`으로 `dist` 생성
- GitHub Pages로 배포

히스토리 데이터는 저장소의 `data/history/`에 날짜별 파일로 남습니다. 그래서 매일 실행될수록 다음처럼 쌓입니다.

```text
data/latest.json
data/history/2026-05-15.json
data/history/2026-05-16.json
data/history/2026-05-17.json
```

이 방식은 GitHub Actions cache보다 서비스 운영에 더 적합합니다. 데이터가 저장소 커밋 기록에 남기 때문에 과거 날짜를 안정적으로 다시 볼 수 있습니다.

## 로컬에서 정적 배포 결과 확인

```powershell
npm.cmd run scrape
npm.cmd run build:static
npx.cmd --yes serve dist -l 4173
```

다른 터미널에서:

```powershell
$env:VERIFY_URL="http://localhost:4173"
npm.cmd run verify
```

## 환경 변수

`.env.example`을 참고하세요.

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `3000` | 서버 포트 |
| `APP_TIMEZONE` | `Asia/Seoul` | 날짜 계산 기준 |
| `TRENDING_SINCE` | `daily` | GitHub Trending 기간 |
| `TRENDING_LANGUAGE` | 빈 값 | 특정 언어만 볼 때 사용 |
| `DATA_DIR` | `./data` | 스냅샷 저장 경로 |
| `STARTUP_REFRESH` | `true` | 시작 시 오늘 데이터가 없으면 수집 |
| `SCHEDULED_REFRESH_HOUR` | `9` | 매일 갱신 시각 |
| `SCHEDULED_REFRESH_MINUTE` | `10` | 매일 갱신 분 |
| `MANUAL_REFRESH_COOLDOWN_MINUTES` | `15` | 수동 새로고침 제한 |
| `ADMIN_REFRESH_TOKEN` | 빈 값 | 설정하면 수동 새로고침에 토큰 필요 |

## 무료 배포 메모

GitHub Pages 방식은 서버 비용이 들지 않고 sleep 문제가 없습니다. 단, 방문자가 직접 즉시 새로고침하는 기능은 없고 GitHub Actions 실행 주기에 맞춰 갱신됩니다.

Render의 무료 웹 서비스도 사용할 수 있지만 일정 시간 미사용 시 sleep 될 수 있습니다. 서버형 운영이 꼭 필요하면 `render.yaml`을 사용하세요.
