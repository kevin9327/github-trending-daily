const repoList = document.querySelector("#repoList");
const emptyState = document.querySelector("#emptyState");
const notice = document.querySelector("#notice");
const dateValue = document.querySelector("#dateValue");
const fetchedValue = document.querySelector("#fetchedValue");
const countValue = document.querySelector("#countValue");
const statusValue = document.querySelector("#statusValue");
const refreshButton = document.querySelector("#refreshButton");
const searchInput = document.querySelector("#searchInput");
const sortSelect = document.querySelector("#sortSelect");
const dateSelect = document.querySelector("#dateSelect");
const autoRefreshLabel = document.querySelector("#autoRefreshLabel");
const featuredList = document.querySelector("#featuredList");
const categoryChips = document.querySelector("#categoryChips");

let repositories = [];
let latestDate = "";
let isStaticMode = window.location.hostname.endsWith("github.io");
let activeCategory = "전체";
let nextRefreshAt = 0;

const autoRefreshIntervalMs = 5 * 60 * 1000;
const categories = ["전체", "AI", "개발도구", "데이터/인프라", "웹/앱", "언어/런타임"];

function staticUrl(path) {
  return new URL(path, window.location.href).toString();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? `요청 실패: ${response.status}`);
  }
  return response.json();
}

async function fetchStaticJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`정적 데이터 파일을 찾지 못했습니다: ${url}`);
  }
  return response.json();
}

async function getDates() {
  try {
    const payload = await fetchJson("/api/dates");
    isStaticMode = false;
    return payload.dates ?? [];
  } catch {
    isStaticMode = true;
    const manifest = await fetchStaticJson(staticUrl("data/manifest.json"));
    return manifest.dates ?? [];
  }
}

async function getTrending(date = "") {
  if (!isStaticMode) {
    try {
      const url = date ? `/api/trending?date=${encodeURIComponent(date)}` : "/api/trending";
      return await fetchJson(url);
    } catch (error) {
      isStaticMode = true;
      if (!date) {
        setNotice("서버 API가 없어 정적 배포 데이터로 전환했습니다.");
      }
    }
  }

  const snapshot = date
    ? await fetchStaticJson(staticUrl(`data/history/${encodeURIComponent(date)}.json`))
    : await fetchStaticJson(staticUrl("data/latest.json"));
  return {
    status: "ready",
    stale: false,
    staticMode: true,
    data: snapshot
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("en").format(value ?? 0);
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatRelativeTime(ms) {
  if (ms <= 0) return "곧 확인";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}분 ${String(seconds).padStart(2, "0")}초 뒤 확인`;
}

function setNotice(message) {
  notice.hidden = !message;
  notice.textContent = message ?? "";
}

function deriveCategory(repo) {
  const text = `${repo.fullName} ${repo.description} ${repo.language}`.toLowerCase();

  if (/(data|database|metrics|logs|gpu|analytics|infrastructure|telegraf|search)/i.test(text)) {
    return "데이터/인프라";
  }
  if (/(ai|agentic|agents|llm|claude|openai|model|tts|vision|notebooklm|mcp)/i.test(text)) return "AI";
  if (/(cli|runtime|sdk|framework|workflow|developer|skills|tool|bun|n8n)/i.test(text)) return "개발도구";
  if (/(web|app|frontend|react|swift|android|ios|desktop|server)/i.test(text)) return "웹/앱";
  if (/(rust|python|go|typescript|shell|swift|javascript)/i.test(repo.language ?? "")) return "언어/런타임";
  return "개발도구";
}

function learningScore(repo) {
  const rankScore = Math.max(0, 40 - repo.rank * 2);
  const todayScore = Math.min(40, Math.log10((repo.starsToday ?? 0) + 1) * 12);
  const communityScore = Math.min(20, Math.log10((repo.stars ?? 0) + 1) * 4);
  return Math.round(rankScore + todayScore + communityScore);
}

function learningLevel(repo) {
  const score = learningScore(repo);
  if (score >= 72) return "핵심 강의";
  if (score >= 58) return "실습 추천";
  return "가볍게 보기";
}

function learningFocus(repo) {
  const category = deriveCategory(repo);
  if (category === "AI") return "AI 흐름과 실제 사용 사례를 살펴보기 좋습니다.";
  if (category === "개발도구") return "개발 생산성을 높이는 방식과 도구 구조를 보기 좋습니다.";
  if (category === "데이터/인프라") return "운영, 관측, 데이터 처리 아이디어를 얻기 좋습니다.";
  if (category === "웹/앱") return "제품 화면이나 앱 기능으로 옮길 아이디어를 찾기 좋습니다.";
  return "언어 생태계와 런타임 변화를 따라가기 좋습니다.";
}

function getFilteredRepos() {
  const query = searchInput.value.trim().toLowerCase();
  const sortBy = sortSelect.value;

  const filtered = repositories.filter((repo) => {
    const haystack = `${repo.fullName} ${repo.description} ${repo.language}`.toLowerCase();
    const matchesQuery = haystack.includes(query);
    const matchesCategory = activeCategory === "전체" || deriveCategory(repo) === activeCategory;
    return matchesQuery && matchesCategory;
  });

  return filtered.sort((a, b) => {
    if (sortBy === "rank") return a.rank - b.rank;
    if (sortBy === "learningScore") return learningScore(b) - learningScore(a);
    return (b[sortBy] ?? 0) - (a[sortBy] ?? 0);
  });
}

function renderCategoryChips() {
  categoryChips.replaceChildren(
    ...categories.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = category === activeCategory ? "chip is-active" : "chip";
      button.textContent = category;
      button.addEventListener("click", () => {
        activeCategory = category;
        renderCategoryChips();
        renderRepos();
      });
      return button;
    })
  );
}

function renderFeatured() {
  const featured = [...repositories]
    .sort((a, b) => learningScore(b) - learningScore(a))
    .slice(0, 3);

  featuredList.replaceChildren(
    ...featured.map((repo, index) => {
      const card = document.createElement("a");
      card.className = "featured-card";
      card.href = repo.url;
      card.target = "_blank";
      card.rel = "noreferrer";

      const label = document.createElement("span");
      label.className = "featured-label";
      label.textContent = `추천 ${index + 1}`;

      const title = document.createElement("strong");
      title.textContent = repo.fullName;

      const meta = document.createElement("span");
      meta.textContent = `${deriveCategory(repo)} · ${learningLevel(repo)} · ${formatNumber(repo.starsToday)}개 증가`;

      card.append(label, title, meta);
      return card;
    })
  );
}

function renderRepos() {
  const items = getFilteredRepos();
  emptyState.hidden = items.length > 0;
  repoList.replaceChildren(
    ...items.map((repo) => {
      const card = document.createElement("article");
      card.className = "repo-card";

      const rank = document.createElement("div");
      rank.className = "rank";
      rank.textContent = `#${repo.rank}`;

      const main = document.createElement("div");
      main.className = "repo-main";

      const title = document.createElement("a");
      title.className = "repo-title";
      title.href = repo.url;
      title.target = "_blank";
      title.rel = "noreferrer";
      title.textContent = repo.fullName;

      const description = document.createElement("p");
      description.className = "repo-description";
      description.textContent = repo.description || "설명이 없습니다.";

      const meta = document.createElement("div");
      meta.className = "repo-meta";

      const category = document.createElement("span");
      category.className = "course-tag";
      category.textContent = deriveCategory(repo);

      const level = document.createElement("span");
      level.className = "course-tag level";
      level.textContent = learningLevel(repo);

      meta.append(category, level);

      if (repo.language) {
        const language = document.createElement("span");
        language.className = "language";

        const languageDot = document.createElement("span");
        languageDot.className = "language-dot";
        languageDot.style.background = repo.languageColor || "#f5b44b";

        language.append(languageDot, document.createTextNode(repo.language));
        meta.append(language);
      }

      const stars = document.createElement("span");
      stars.textContent = `별 ${formatNumber(repo.stars)}개`;

      const forks = document.createElement("span");
      forks.textContent = `포크 ${formatNumber(repo.forks)}개`;

      meta.append(stars, forks);
      main.append(title, description, meta);

      const score = document.createElement("div");
      score.className = "repo-score";

      const scoreToday = document.createElement("span");
      scoreToday.className = "score-today";
      scoreToday.textContent =
        repo.starsTodayText?.replace(/stars? today/i, "개의 별 증가") || "오늘 트렌딩";

      const focus = document.createElement("span");
      focus.className = "learning-focus";
      focus.textContent = learningFocus(repo);

      score.append(scoreToday, focus);
      card.append(rank, main, score);

      return card;
    })
  );
}

function applyPayload(payload) {
  repositories = payload.data?.repositories ?? [];
  latestDate = payload.data?.date ?? "";
  dateValue.textContent = latestDate || "-";
  fetchedValue.textContent = formatDateTime(payload.data?.fetchedAt);
  countValue.textContent = formatNumber(repositories.length);
  statusValue.textContent = payload.status === "refreshing" ? "새로고침 중" : "준비됨";

  if (payload.staticMode) {
    setNotice("이 사이트는 GitHub Actions가 매일 자동 수집한 정적 데이터로 서비스 중입니다.");
  } else if (payload.stale) {
    setNotice(`오늘 데이터가 아직 준비되지 않아 저장된 최신 스냅샷(${latestDate})을 보여주는 중입니다.`);
  } else if (payload.lastError) {
    setNotice(`마지막 새로고침이 ${formatDateTime(payload.lastError.at)}에 실패했습니다. 저장된 데이터를 보여줍니다.`);
  } else {
    setNotice("");
  }

  renderFeatured();
  renderCategoryChips();
  renderRepos();
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  statusValue.textContent = isLoading ? "새로고침 중" : "준비됨";
}

async function loadDates() {
  const current = dateSelect.value;
  const dates = await getDates();

  dateSelect.replaceChildren(new Option("최신", ""));
  for (const date of dates) {
    dateSelect.append(new Option(date, date));
  }

  dateSelect.value = current;
}

async function loadTrending(date = "") {
  setLoading(true);

  try {
    const payload = await getTrending(date);
    applyPayload(payload);
  } catch (error) {
    statusValue.textContent = "오류";
    setNotice(error.message);
  } finally {
    refreshButton.disabled = false;
  }
}

async function autoRefreshTrending() {
  if (dateSelect.value) return;

  if (isStaticMode) {
    autoRefreshLabel.textContent = "정적 사이트는 GitHub Actions가 매일 자동 갱신합니다";
    return;
  }

  await loadTrending();
  nextRefreshAt = Date.now() + autoRefreshIntervalMs;
}

async function refreshTrending() {
  setLoading(true);

  try {
    if (isStaticMode) {
      dateSelect.value = "";
      await loadTrending();
      setNotice("정적 배포 사이트는 GitHub Actions가 매일 자동 갱신합니다. 즉시 갱신은 Actions에서 수동 실행하세요.");
      return;
    }

    const response = await fetch("/api/refresh", { method: "POST" });
    const payload = await response.json();

    if (!response.ok && !["cooldown", "stale"].includes(payload.status)) {
      throw new Error(payload.message ?? "새로고침에 실패했습니다.");
    }

    dateSelect.value = "";
    applyPayload(payload);
    await loadDates();

    if (payload.status === "cooldown") {
      setNotice(`수동 새로고침 대기 중입니다. ${payload.retryAfterSeconds}초 뒤 다시 시도하세요.`);
    }
  } catch (error) {
    statusValue.textContent = "오류";
    setNotice(error.message);
  } finally {
    refreshButton.disabled = false;
  }
}

function updateAutoRefreshLabel() {
  if (isStaticMode) {
    autoRefreshLabel.textContent = "정적 배포: 매일 자동 갱신";
    return;
  }

  if (!nextRefreshAt) {
    autoRefreshLabel.textContent = "자동 확인 준비 중";
    return;
  }

  autoRefreshLabel.textContent = `자동 확인: ${formatRelativeTime(nextRefreshAt - Date.now())}`;
}

refreshButton.addEventListener("click", refreshTrending);
searchInput.addEventListener("input", renderRepos);
sortSelect.addEventListener("change", renderRepos);
dateSelect.addEventListener("change", () => loadTrending(dateSelect.value));

await loadDates();
await loadTrending();
nextRefreshAt = Date.now() + autoRefreshIntervalMs;
setInterval(updateAutoRefreshLabel, 1000);
setInterval(autoRefreshTrending, autoRefreshIntervalMs);
updateAutoRefreshLabel();
