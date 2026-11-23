import "./style.css";
import { expression, levels, type LevelId, type Mode } from "./engine";
import { Session, gameplayLabel, type Gameplay, type Result } from "./session";
import { hintFor } from "./hints";
import { Store, validData } from "./store";

const root = document.querySelector<HTMLDivElement>("#app")!;
let storage: Storage;
try {
  storage = localStorage;
} catch {
  storage = {
    getItem() {
      throw Error("unavailable");
    },
    setItem() {
      throw Error("unavailable");
    },
  } as unknown as Storage;
}
const store = new Store(storage);
const avatars = ["🧑‍🚀", "👩‍🚀", "🤖", "👽", "🐱", "🐰"];
const esc = (text: unknown) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const modeLabel = (m: Mode) => (m === "keypad" ? "數字鍵盤" : "四選一");
let screen: "map" | "game" | "results" = "map",
  session: Session | null = null,
  result: Result | null = null;
let selectedLevel: LevelId = "A1",
  selectedMode: Mode = "keypad",
  selectedGameplay: Gameplay = "mission",
  input = "",
  feedback = "",
  lastSubmit = -Infinity;
let avatar = 0,
  readyUntil = 0,
  readyPaused = false,
  readyLeft = 3000,
  saved = false;
let modal: HTMLDialogElement | null = null,
  audio: AudioContext | null = null;
let pendingImport: unknown = null;
let offlineStatus = import.meta.env.PROD ? "正在準備離線遊玩" : "";
const activePlayer = () => store.player;
const prefs = () =>
  activePlayer()?.preferences ?? { sound: true, reduced: false };
function play(correct = true) {
  if (!prefs().sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(correct ? 660 : 210, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      correct ? 990 : 170,
      audio.currentTime + 0.12,
    );
    g.gain.setValueAtTime(0.07, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.2);
  } catch {
    /* Sound cannot block play. */
  }
}
function stats(
  playerId = activePlayer()?.playerId,
  level?: LevelId,
  mode?: Mode,
  gameplay?: Gameplay,
) {
  return store.data.sessions.filter(
    (s) =>
      s.playerId === playerId &&
      (!level || s.levelId === level) &&
      (!mode || s.answerMode === mode) &&
      (!gameplay || (s.gameplay ?? "challenge") === gameplay),
  );
}
function warning() {
  return store.warning
    ? `<div class="storage-warning" role="status">${esc(store.warning)} <button data-action="backup">匯出備份</button></div>`
    : "";
}
function brand() {
  return `<a class="brand" href="#" data-action="home" aria-label="太空數學探險首頁"><span class="brand-mark">✦</span><span>太空數學探險<small>SPACE MATH EXPLORER</small></span></a>`;
}
function header() {
  const p = activePlayer();
  return `<header class="topbar">${brand()}<nav aria-label="個人與設定"><button class="icon-button" data-action="sound" aria-label="${prefs().sound ? "關閉" : "開啟"}音效" title="音效">${prefs().sound ? "♫" : "♪̸"}</button><button class="icon-button" data-action="settings" aria-label="設定與備份">⚙</button><button class="player-button" data-action="players"><span>${p ? avatars[p.avatarId] : "🧑‍🚀"}</span>${p ? esc(p.nickname) : "加入探險隊"}<span class="chevron">⌄</span></button></nav></header>`;
}
function applyPrefs() {
  document.documentElement.dataset.reduced = String(prefs().reduced);
}
function render() {
  applyPrefs();
  root.innerHTML = `<div class="app-shell">${header()}${warning()}${screen === "map" ? mapView() : screen === "game" ? gameView() : resultsView()}<footer class="footer"><span>小小計算，大大探索。</span><span id="offline-status">${offlineStatus}</span><span>無廣告 · 無需登入 · 紀錄存在這台裝置</span></footer></div><div class="toast" role="status" aria-live="polite"></div>`;
  if (screen === "game") updateGame();
}
function mapView() {
  const history = stats(),
    total = history.reduce((n, s) => n + s.completedCount, 0);
  return `<main class="map-screen"><section class="map-hero"><div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> 數字宇宙，準備出發</div><h1>每一次計算，<br>都離星星<span>更近一點。</span></h1><p>選一顆星球，完成 10 題小任務。<br>不用解鎖，照自己的步調探索！</p><div class="hero-chips"><span>✦ 8 顆探索星球</span><span>✦ 不限時，慢慢想</span><span>＋ 加減法練習</span></div></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="hero-planet"></div><div class="mini-moon"></div><img class="hero-rocket" src="./rocket.svg" alt=""><span class="spark s1">✦</span><span class="spark s2">✧</span><span class="spark s3">✦</span><div class="mission-tag">NEXT STOP <strong>數字星系</strong></div></div></section><section class="planet-section" aria-labelledby="planet-heading"><div class="section-heading"><div><div class="eyebrow">CHOOSE YOUR PLANET</div><h2 id="planet-heading">今天想去哪裡？</h2></div><button class="text-button" data-action="history">我的探險紀錄 <span>↗</span></button></div><div class="level-group"><div class="group-label"><span class="group-badge">A</span><h3>啟航星系</h3><span>10 以內</span><i></i><small>從這裡暖身</small></div><div class="planet-grid">${levels.slice(0, 4).map(levelCard).join("")}</div></div><div class="level-group"><div class="group-label"><span class="group-badge group-b">B</span><h3>遠征星系</h3><span>20 以內</span><i></i><small>再多一點挑戰</small></div><div class="planet-grid">${levels.slice(4).map(levelCard).join("")}</div></div></section><section class="bottom-note"><span class="note-star">✧</span><p><strong>答錯也沒關係，試試看！</strong><br>原題再挑戰，每一步都是進步。</p><div class="explorer-total"><strong>${total}</strong><span>累積完成題數</span></div></section></main>`;
}
function levelCard(l: (typeof levels)[number]) {
  const history = stats(undefined, l.id), best = history.length ? true : null;
  return `<button class="planet-card planet-${l.id.toLowerCase()}" style="--planet:${l.color}" data-action="level" data-level="${l.id}" aria-label="${l.id} ${l.title}，${l.subtitle}"><div class="card-top"><span class="level-code">${l.id}</span><span class="card-hint">自由探索 ↗</span></div><div class="planet-stage" aria-hidden="true"><div class="planet-orbit"></div><div class="planet-ball"><span></span><i></i></div><span class="planet-spark">✧</span></div><div class="card-content"><h3>${l.title}</h3><p>${l.subtitle}</p><div class="card-bottom"><span>${best === null ? "尚未探索" : `已探索 ${history.length} 趟`}</span><span class="go-dot">↗</span></div></div></button>`;
}
function gameView() {
  const l = levels.find((l) => l.id === selectedLevel)!;
  return `<main class="play-screen"><div class="play-heading"><button class="text-button" data-action="pause">Ⅱ 暫停</button><span>${l.id} · ${l.title} <small>${modeLabel(selectedMode)} · ${gameplayLabel(selectedGameplay)}</small></span><div class="timer" aria-label="剩餘時間"><span id="time-left">60</span><small>${selectedGameplay === "challenge" ? "秒" : "題完成"}</small></div></div><div class="game-grid"><section class="flight-panel" aria-label="火箭探索進度"><div class="flight-heading"><span class="eyebrow">YOUR SPACE MISSION</span><h2>向星星前進！</h2><p>每完成一題，火箭就前進一步。</p></div><div class="flight-space"><div class="flight-orbit"></div><div class="destination" style="--planet:${l.color}"></div><img id="flight-rocket" src="./rocket.svg" alt="你的火箭"><div id="flight-burst" aria-hidden="true">✦ ✧ ✦</div><span class="flight-star fs1">✧</span><span class="flight-star fs2">✦</span></div><div id="hint-area" aria-live="polite"></div><div class="flight-metrics"><div><strong id="completed">0</strong><span>完成題數</span></div><div><strong id="streak">0</strong><span>連續獨立答對</span></div></div><div class="flight-progress"><span id="progress-fill"></span></div><p class="progress-note">${selectedGameplay === "challenge" ? "每 10 題抵達一站，繼續飛向下一站" : "不限時，答對一題就前進一站"}</p></section><section class="question-panel" aria-label="答題區"><div class="question-label"><span>✦ 小小領航員，交給你了</span><span id="question-number">第 1 題</span></div><div id="equation" class="equation"></div><div id="feedback" class="feedback" role="status" aria-live="polite">先算算看，想好了再回答。</div><div id="answer-area"></div><button class="hint-button" data-action="hint" aria-expanded="false" aria-controls="hint-area">💡 幫我想想</button><div class="input-tip">${selectedMode === "keypad" ? "也可以使用電腦數字鍵，Enter 確認" : "點一下答案卡就能作答"}</div></section></div><div id="game-overlay"></div></main>`;
}
function updateGame() {
  if (!session) return;
  if (session.status === "results") {
    finish();
    return;
  }
  const grid = root.querySelector<HTMLElement>(".game-grid");
  if (grid) {
    grid.inert = session.status !== "playing";
    grid.setAttribute("aria-hidden", String(session.status !== "playing"));
  }
  const q = session.current?.question;
  const time = root.querySelector("#time-left");
  if (time) {
    time.textContent = selectedGameplay === "challenge" ? String(Math.ceil(session.remaining / 1000)) : `${session.completedCount}/${session.target}`;
    time.parentElement?.classList.toggle(
      "last-seconds",
      selectedGameplay === "challenge" && session.remaining <= 10000,
    );
  }
  const equation = root.querySelector("#equation");
  if (
    equation &&
    q &&
    equation.getAttribute("data-question") !==
      `${session.records.length}:${q.id}`
  ) {
    equation.innerHTML = expression(q)
      .split(" ")
      .map((t) =>
        t === "?" ? '<span class="unknown">?</span>' : `<span>${esc(t)}</span>`,
      )
      .join("");
    equation.setAttribute("data-question", `${session.records.length}:${q.id}`);
    root.querySelector("#question-number")!.textContent =
      `第 ${session.completedCount + 1} 題`;
    renderAnswer();
    root.querySelector("#hint-area")!.innerHTML = "";
    root.querySelector(".flight-panel")!.classList.remove("has-hint");
    root.querySelector("[data-action=hint]")!.setAttribute("aria-expanded", "false");
  }
  root.querySelector("#completed")!.textContent = String(
    session.completedCount,
  );
  root.querySelector("#streak")!.textContent = String(session.streak);
  const rocket = root.querySelector<HTMLElement>("#flight-rocket")!;
  rocket.style.setProperty("--travel", String(10 * session.completedCount / (session.completedCount + 10)));
  root.querySelector<HTMLElement>("#progress-fill")!.style.width =
    `${selectedGameplay === "challenge" ? 100 * session.completedCount / (session.completedCount + 10) : session.completedCount / session.target * 100}%`;
  root.querySelector(".progress-note")!.textContent = selectedGameplay === "challenge" ? `已抵達 ${Math.floor(session.completedCount / 10)} 站 · 下一站 ${(Math.floor(session.completedCount / 10) + 1) * 10} 題` : `再完成 ${session.target - session.completedCount} 題，就到達目的地！`;
  const overlay = root.querySelector("#game-overlay")!;
  const overlayKey =
    session.status === "ready"
      ? readyPaused
        ? "ready-paused"
        : `ready:${Math.max(1, Math.ceil((readyUntil - performance.now()) / 1000))}`
      : session.status;
  if (overlay.getAttribute("data-state") === overlayKey) return;
  overlay.setAttribute("data-state", overlayKey);
  if (session.status === "ready") {
    const count = readyPaused
      ? "準備暫停"
      : String(Math.max(1, Math.ceil((readyUntil - performance.now()) / 1000)));
    overlay.innerHTML = `<div class="game-cover"><div class="cover-card"><span class="eyebrow">READY, EXPLORER?</span><h2>${count}</h2><p>準備倒數不占用遊戲時間</p>${readyPaused ? '<button class="primary" data-action="resume">繼續準備</button>' : '<button class="secondary" data-action="pause">暫停準備</button>'}<button class="text-button" data-action="quit">返回星球地圖</button></div></div>`;
  } else if (session.status === "paused") {
    overlay.innerHTML = `<div class="game-cover"><div class="cover-card"><span class="pause-icon">Ⅱ</span><h2>休息一下</h2><p>時間已暫停，準備好再繼續。</p><button class="primary" data-action="resume">繼續探險</button><button class="secondary" data-action="quit">離開這趟探險</button><small>中途離開不列入正式成績</small></div></div>`;
  } else if (overlay.innerHTML) overlay.innerHTML = "";
}
function renderAnswer() {
  if (!session?.current) return;
  const q = session.current.question;
  const area = root.querySelector("#answer-area");
  if (!area) return;
  area.innerHTML =
    selectedMode === "keypad"
      ? `<div class="answer-display" aria-label="已輸入答案"><span id="input-value">${input || '<span class="input-placeholder">輸入答案</span>'}</span><button class="erase-button" data-action="backspace" aria-label="刪除一位">⌫</button></div><div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "清除", 0, "確認"].map((n) => `<button class="${n === "確認" ? "confirm-key" : ""}" data-action="${n === "確認" ? "submit" : n === "清除" ? "clear" : "digit"}" ${typeof n === "number" ? `data-value="${n}"` : ""} ${n === "確認" && !input ? "disabled" : ""}>${n}</button>`).join("")}</div>`
      : `<div class="choice-grid">${q.choices.map((n, i) => `<button data-action="choice" data-value="${n}" data-question="${esc(q.id)}"><span class="choice-index">${["A", "B", "C", "D"][i]}</span><strong>${n}</strong></button>`).join("")}</div>`;
}
function setInput(value: string) {
  if (session?.status !== "playing") return;
  if (value.length > 2 || Number(value) > 20) {
    announce("答案請輸入 0 到 20。");
    return;
  }
  input = value.replace(/^0+(?=\d)/, "");
  const el = root.querySelector("#input-value");
  if (el)
    el.innerHTML = input || '<span class="input-placeholder">輸入答案</span>';
  const button = root.querySelector<HTMLButtonElement>(
    '[data-action="submit"]',
  );
  if (button) button.disabled = !input;
}
function showHint() {
  if (!session?.useHint()) { updateGame(); return; }
  const h = hintFor(session.current.question);
  const area = root.querySelector("#hint-area")!;
  root.querySelector(".flight-panel")!.classList.add("has-hint");
  area.innerHTML = `<aside class="hint-card"><strong>${h.title}</strong><p>${h.text}</p><div class="hint-groups">${h.groups.map(g => `<div><small>${g.label}：${g.count} 個</small><div class="dots" aria-hidden="true">${g.count ? Array.from({length:g.count}, (_,i) => `<i class="${i % 10 === 9 ? "ten-end" : ""}"></i>`).join("") : "沒有小點"}</div></div>`).join("")}</div><button class="hint-return" data-action="hint-close">想好了，回到作答 ↓</button></aside>`;
  root.querySelector("[data-action=hint]")!.setAttribute("aria-expanded", "true");
  root.querySelector("#streak")!.textContent = "0";
  if (matchMedia("(max-width:760px)").matches) area.scrollIntoView({block:"start", behavior:"instant"});
}
function submit(value: number, token?: string) {
  if (!session || performance.now() - lastSubmit < 180) return;
  const q = token ?? session.current?.question.id;
  if (!q) return;
  const response = session.submit(value, q);
  if (response === "ignored") {
    updateGame();
    return;
  }
  lastSubmit = performance.now();
  input = "";
  play(response === "correct");
  feedback =
    response === "correct"
      ? session.streak > 0 && session.streak % 5 === 0
        ? `✦ ${session.streak} 連擊！太棒了，獲得 50 分獎勵`
        : "✓ 答對了！繼續探索。"
      : "↻ 還差一點！再想想，也可以看提示。";
  updateGame();
  if (screen !== "game") return;
  if (response === "wrong" && session.current.hintUsed) showHint();
  if (response === "correct" && session.completedCount % 10 === 0) feedback = `✦ 抵達第 ${session.completedCount / 10} 站！繼續向前飛。`;
  const f = root.querySelector("#feedback")!;
  f.textContent = feedback;
  f.className = `feedback ${response}`;
  if (response === "wrong") {
    if (selectedMode === "keypad") setInput("");
    else
      root
        .querySelectorAll<HTMLButtonElement>('[data-action="choice"]')
        .forEach((b) => {
          b.classList.toggle("wrong-choice", Number(b.dataset.value) === value);
        });
  } else {
    const burst = root.querySelector("#flight-burst");
    burst?.classList.remove("burst");
    requestAnimationFrame(() => burst?.classList.add("burst"));
  }
}
function start(review = false) {
  const questions = review ? result?.questions.filter(q => result?.gameplay === "review" || q.hintUsed || q.attempts.some(a => !a.isCorrect)).slice(0, 5).map(q => q.question) ?? [] : [];
  if (review) selectedGameplay = "review";
  closeModal();
  session = new Session(activePlayer()!.playerId, selectedLevel, selectedMode, undefined, undefined, selectedGameplay, questions);
  input = "";
  lastSubmit = -Infinity;
  feedback = "";
  saved = false;
  readyUntil = performance.now() + 3000;
  readyPaused = false;
  readyLeft = 3000;
  screen = "game";
  render();
}
function pause() {
  if (screen !== "game" || !session) return;
  if (session.status === "ready" && !readyPaused) {
    readyLeft = Math.max(0, readyUntil - performance.now());
    readyPaused = true;
  } else session.pause();
  updateGame();
}
function resume() {
  if (!session) return;
  if (session.status === "ready") {
    readyUntil = performance.now() + readyLeft;
    readyPaused = false;
  } else session.resume();
  play();
  updateGame();
}
function finish() {
  if (!session || saved) return;
  saved = true;
  result = session.summary();
  store.record(result);
  screen = "results";
  render();
  play();
}
function percent(n: number | null) {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}
function resultsView() {
  if (!result) return "";
  const r = result, history = stats(r.playerId, r.levelId, r.answerMode, r.gameplay ?? "challenge");
  const previous = history.filter(s => s.sessionId !== r.sessionId && s.schemaVersion === 2);
  const wrong = r.questions.filter(q => q.hintUsed || q.attempts.some(a => !a.isCorrect));
  const best = previous.length ? Math.max(...previous.map(s => s.firstTryCorrectCount)) : null;
  const praise = best !== null && r.firstTryCorrectCount > best ? `比以前更棒！獨立首次答對多了 ${r.firstTryCorrectCount-best} 題。` : r.firstTryCorrectCount > 0 ? `有 ${r.firstTryCorrectCount} 題是你自己一次算對的！` : "你願意再想一次，這就是進步的開始。";
  const advice = wrong.length ? "下一步：把剛才需要幫忙的題目，再自己算一次。" : "下一步：換一顆星球，或試試 60 秒挑戰。";
  return `<main class="results-screen"><div class="eyebrow">MISSION COMPLETE</div><div class="result-emblem" aria-hidden="true">🚀</div><h1>${r.gameplay === "challenge" ? "挑戰完成，做得好！" : "成功抵達，你做到了！"}</h1><p class="result-sub">${esc(activePlayer()?.nickname)} · ${r.levelId} · ${modeLabel(r.answerMode)} · ${gameplayLabel(r.gameplay)}</p><p class="achievement">${praise}</p><section class="result-board"><div class="result-primary"><strong>${r.completedCount}<small>題</small></strong><span>這趟完成</span></div><div class="result-stats"><div><span>獨立首次答對</span><strong>${r.firstTryCorrectCount} 題</strong></div><div><span>用提示想一想</span><strong>${r.hintCount ?? "—"} 題</strong></div><div><span>獨立首次正確率</span><strong>${percent(r.independentAccuracy ?? null)}</strong></div></div></section><p class="next-step">${advice}</p><div class="result-actions">${wrong.length ? '<button class="primary" data-action="review">錯題再練（最多 5 題）</button>' : ""}<button class="${wrong.length ? "secondary" : "primary"}" data-action="replay">再探險一次</button><button class="secondary" data-action="home">選擇其他星球</button></div><details class="review"><summary>給老師與自己的詳細紀錄</summary><p>獨立首次正確率＝未使用提示且首次答對 ÷ 所有已提交答案的題目（含最後未完成題）。使用提示不加首次答對與連擊獎勵。</p><div class="review-row"><span>${r.score} 積分</span><span>重試 ${r.wrongSubmissionCount} 次</span><span>最高連續獨立答對 ${r.maxStreak} 題</span><span>有效時間 ${(r.activeDurationMs/1000).toFixed(1)} 秒</span></div><div class="personal-best">同星球・同作答模式・同玩法：最多完成 ${Math.max(...history.map(s => s.completedCount))} 題；最高 ${Math.max(...history.map(s => s.score))} 分（可能來自不同回合）</div>${wrong.map(q => `<div class="review-row"><strong>${expression(q.question)}</strong><span>${q.hintUsed ? "使用過提示 · " : ""}提交：${q.attempts.map(a => `${a.value}${a.isCorrect ? " ✓" : ""}`).join("、") || "尚未提交"}</span></div>`).join("")}</details></main>`;
}
function openModal(content: string, label: string) {
  closeModal();
  modal = document.createElement("dialog");
  modal.className = "modal";
  modal.setAttribute("aria-label", label);
  modal.innerHTML = `<button class="close-modal" data-action="close" aria-label="關閉">×</button>${content}`;
  root.append(modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  const dialog = modal;
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (modal === dialog) modal = null;
  });
  modal.showModal();
}
function closeModal() {
  if (modal) {
    const old = modal;
    modal = null;
    old.close();
    old.remove();
  }
}
function levelModal(id: LevelId) {
  selectedLevel = id;
  if (selectedGameplay === "review") selectedGameplay = "mission";
  const l = levels.find((l) => l.id === id)!;
  if (!activePlayer()) {
    playersModal();
    return;
  }
  openModal(
    `<div class="eyebrow">${id} · ${l.subtitle}</div><h2>${l.title}</h2><p>先選玩法，再選怎麼回答。</p><div class="sample-equation">${l.example}</div><div class="mode-options gameplay-options"><button data-action="gameplay" data-gameplay="mission" aria-pressed="${selectedGameplay === "mission"}"><strong>🚀 10 題探險</strong><small>不限時，慢慢想</small></button><button data-action="gameplay" data-gameplay="challenge" aria-pressed="${selectedGameplay === "challenge"}"><strong>⚡ 60 秒挑戰</strong><small>熟悉了，再練速度</small></button></div><div class="mode-options"><button data-action="mode" data-mode="keypad" aria-pressed="${selectedMode === "keypad"}"><span>▦</span><strong>數字鍵盤</strong><small>輸入答案，按確認</small></button><button data-action="mode" data-mode="choices" aria-pressed="${selectedMode === "choices"}"><span>▤</span><strong>四選一</strong><small>點選答案，立即送出</small></button></div><p class="modal-note">玩法與作答方式分開記錄<br>答錯原題重試 · 暫停時不計時</p><button class="primary wide" data-action="start">準備出發</button>`,
    "選擇作答模式",
  );
}
function playersModal() {
  if (screen === "game") pause();
  openModal(
    `<div class="eyebrow">MEET THE CREW</div><h2>誰要一起探險？</h2><p>同一台裝置，也能各自記錄進步。</p><div class="player-list">${store.data.players.map((p) => `<button data-action="select-player" data-id="${p.playerId}" aria-pressed="${p.playerId === activePlayer()?.playerId}"><span>${avatars[p.avatarId]}</span><strong>${esc(p.nickname)}</strong><small>${p.playerId === activePlayer()?.playerId ? "目前玩家" : "選擇"}</small></button>`).join("")}</div><form id="player-form"><h3>${store.data.players.length ? "加入新隊員" : "建立你的探險角色"}</h3><div class="avatar-options" role="group" aria-label="選擇角色">${avatars.map((a, i) => `<button type="button" data-action="avatar" data-avatar="${i}" aria-label="角色 ${i + 1} ${a}" aria-pressed="${i === avatar}">${a}</button>`).join("")}</div><label class="field-label" for="nickname">探險暱稱</label><input id="nickname" name="nickname" maxlength="12" required placeholder="例如：小星星" autocomplete="off"><button class="primary wide" type="submit">加入探險隊</button></form><p class="modal-note">只儲存暱稱與角色，不需要真實姓名。</p>`,
    "選擇或新增玩家",
  );
}
function settingsModal() {
  openModal(
    `<div class="eyebrow">MISSION CONTROL</div><h2>探險設定</h2><div class="settings-row"><div><strong>遊戲音效</strong><p>答對、重試時的短音效</p></div><button class="toggle" data-action="sound" aria-pressed="${prefs().sound}">${prefs().sound ? "開啟" : "關閉"}</button></div><div class="settings-row"><div><strong>減少動態效果</strong><p>減少火箭轉場與星星效果</p></div><button class="toggle" data-action="reduced" aria-pressed="${prefs().reduced}">${prefs().reduced ? "開啟" : "關閉"}</button></div><div class="backup-box"><h3>保留每一次進步</h3><p>紀錄只存在這台裝置與瀏覽器。清除瀏覽資料可能遺失紀錄；可用備份移到其他裝置。</p><div class="button-row"><button class="secondary" data-action="backup">匯出備份</button><button class="secondary" data-action="import">匯入備份</button></div><input type="file" id="import-file" accept="application/json,.json" hidden></div>${store.protected ? '<p class="storage-warning">原始本機資料受保護，本頁變更不會覆寫。請先匯出本頁備份，並保留原始資料。</p>' : ""}<p class="modal-note">版本 2.0.0 · 八關皆可自由探索<br>成就記錄努力與進步，不代表已通過精熟測驗</p>`,
    "設定與備份",
  );
}
function historyModal() {
  if (!activePlayer()) {
    playersModal();
    return;
  }
  const history = stats().slice().reverse();
  openModal(
    `<div class="eyebrow">EXPLORATION LOG</div><h2>${esc(activePlayer()!.nickname)}的探險紀錄</h2><p>依關卡、作答方式與玩法分開查看。</p><div class="history-filters"><label>關卡<select id="history-level"><option value="all">全部星球</option>${levels.map((l) => `<option value="${l.id}">${l.id} ${l.title}</option>`).join("")}</select></label><label>模式<select id="history-mode"><option value="all">全部模式</option><option value="keypad">數字鍵盤</option><option value="choices">四選一</option></select></label><label>玩法<select id="history-gameplay"><option value="all">全部玩法</option><option value="mission">10 題探險</option><option value="challenge">60 秒挑戰</option><option value="review">錯題再練</option></select></label></div><div id="history-list">${historyRows(history)}</div>`,
    "探險歷史紀錄",
  );
}
function historyRows(history: Result[]) {
  return history.length
    ? `<div class="history-list">${history.map((r) => `<article><div><strong>${r.levelId} · ${modeLabel(r.answerMode)} · ${gameplayLabel(r.gameplay)}</strong><small>${new Date(r.startedAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div><div><strong>${r.completedCount} 題</strong><small>${r.score} 分 · ${r.schemaVersion === 1 ? `舊版首次 ${percent(r.firstTryAccuracy)}（未記錄提示）` : `獨立首次 ${percent(r.independentAccuracy ?? null)}`}</small></div></article>`).join("")}</div>`
    : '<div class="empty-state"><span>✧</span><p>這裡還沒有紀錄。<br>選一顆星球，開始第一趟探險吧！</p></div>';
}
function announce(text: string) {
  const toast = root.querySelector(".toast");
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 3500);
}
function backup() {
  const blob = new Blob([JSON.stringify(store.data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `space-math-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
root.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!b) return;
  const action = b.dataset.action;
  if (
    screen === "game" &&
    ["players", "settings", "sound", "home"].includes(action ?? "")
  )
    pause();
  switch (action) {
    case "home":
      e.preventDefault();
      if (screen === "game") {
        pause();
        return;
      }
      closeModal();
      screen = "map";
      render();
      break;
    case "level":
      levelModal(b.dataset.level as LevelId);
      break;
    case "hint-close":
      root.querySelector("#hint-area")!.innerHTML = "";
      root.querySelector(".flight-panel")!.classList.remove("has-hint");
      root.querySelector("[data-action=hint]")!.setAttribute("aria-expanded", "false");
      if (matchMedia("(max-width:760px)").matches) root.querySelector(".question-panel")!.scrollIntoView({block:"start", behavior:"instant"});
      break;
    case "hint":
      showHint();
      break;
    case "review":
      start(true);
      break;
    case "gameplay":
      selectedGameplay = b.dataset.gameplay as Gameplay;
      modal?.querySelectorAll("[data-action=gameplay]").forEach(el => el.setAttribute("aria-pressed", String((el as HTMLElement).dataset.gameplay === selectedGameplay)));
      break;
    case "mode":
      selectedMode = b.dataset.mode as Mode;
      modal
        ?.querySelectorAll('[data-action="mode"]')
        .forEach((el) =>
          el.setAttribute(
            "aria-pressed",
            String((el as HTMLElement).dataset.mode === selectedMode),
          ),
        );
      break;
    case "start":
      play();
      start();
      break;
    case "digit":
      if (session?.status === "playing") setInput(input + b.dataset.value);
      break;
    case "clear":
      setInput("");
      break;
    case "backspace":
      setInput(input.slice(0, -1));
      break;
    case "submit":
      if (input) submit(Number(input));
      break;
    case "choice":
      submit(Number(b.dataset.value), b.dataset.question);
      break;
    case "pause":
      pause();
      break;
    case "resume":
      resume();
      break;
    case "quit":
      session?.abort();
      session = null;
      screen = "map";
      render();
      break;
    case "replay":
      start(selectedGameplay === "review");
      break;
    case "close":
      closeModal();
      break;
    case "players":
      playersModal();
      break;
    case "avatar":
      avatar = Number(b.dataset.avatar);
      modal
        ?.querySelectorAll('[data-action="avatar"]')
        .forEach((el) =>
          el.setAttribute(
            "aria-pressed",
            String(Number((el as HTMLElement).dataset.avatar) === avatar),
          ),
        );
      break;
    case "select-player":
      if (screen === "game") {
        session?.abort();
        session = null;
      }
      store.data.selectedPlayerId = b.dataset.id!;
      store.save();
      closeModal();
      screen = "map";
      render();
      break;
    case "settings":
      settingsModal();
      break;
    case "sound":
      if (!activePlayer()) {
        playersModal();
        break;
      }
      activePlayer()!.preferences.sound = !prefs().sound;
      store.save();
      applyPrefs();
      if (modal) settingsModal();
      else {
        const sound = root.querySelector<HTMLButtonElement>(
          '[data-action="sound"]',
        );
        if (sound) {
          sound.textContent = prefs().sound ? "♫" : "♪̸";
          sound.setAttribute(
            "aria-label",
            `${prefs().sound ? "關閉" : "開啟"}音效`,
          );
        }
      }
      break;
    case "reduced":
      if (!activePlayer()) {
        playersModal();
        break;
      }
      activePlayer()!.preferences.reduced = !prefs().reduced;
      store.save();
      applyPrefs();
      settingsModal();
      break;
    case "history":
      historyModal();
      break;
    case "backup":
      backup();
      break;
    case "import":
      modal?.querySelector<HTMLInputElement>("#import-file")?.click();
      break;
    case "confirm-import":
      try {
        store.merge(pendingImport);
        pendingImport = null;
        closeModal();
        screen = "map";
        render();
        announce(store.warning || "備份已匯入。");
      } catch (error) {
        announce((error as Error).message);
      }
      break;
  }
});
root.addEventListener("submit", (e) => {
  if ((e.target as HTMLElement).id !== "player-form") return;
  e.preventDefault();
  const nickname = modal
    ?.querySelector<HTMLInputElement>("#nickname")
    ?.value.trim();
  if (!nickname) {
    announce("幫你的角色取個暱稱吧！");
    return;
  }
  if (screen === "game") {
    session?.abort();
    session = null;
  }
  store.addPlayer(nickname, avatar);
  closeModal();
  screen = "map";
  render();
  levelModal(selectedLevel);
});
root.addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id.startsWith("history-")) {
    const level =
      modal?.querySelector<HTMLSelectElement>("#history-level")?.value;
    const mode =
      modal?.querySelector<HTMLSelectElement>("#history-mode")?.value;
    const list = modal?.querySelector("#history-list");
    if (list)
      list.innerHTML = historyRows(
        stats()
          .filter(
            (r) =>
              (level === "all" || r.levelId === level) &&
              (mode === "all" || r.answerMode === mode) &&
              (modal?.querySelector<HTMLSelectElement>("#history-gameplay")?.value === "all" || (r.gameplay ?? "challenge") === modal?.querySelector<HTMLSelectElement>("#history-gameplay")?.value),
          )
          .reverse(),
      );
  }
  if (el.id === "import-file" && el.files?.[0]) {
    try {
      const file = el.files[0];
      if (file.size > 20 * 1024 * 1024)
        throw new Error("備份超過 20 MB，請確認檔案。");
      const parsed: unknown = JSON.parse(await file.text());
      if (!validData(parsed))
        throw new Error("備份格式或版本不正確，原紀錄未變更。");
      pendingImport = parsed;
      openModal(
        `<div class="eyebrow">RESTORE EXPLORATIONS</div><h2>匯入探險紀錄</h2><p>備份包含 ${parsed.players.length} 位玩家、${parsed.sessions.length} 趟探險。</p><p>將與本機資料合併，相同紀錄會略過；相同 ID 的內容衝突則停止整批匯入。</p><button class="primary wide" data-action="confirm-import">確認合併</button><button class="text-button wide" data-action="close">取消</button>`,
        "確認備份匯入",
      );
    } catch (error) {
      announce((error as Error).message);
    }
    el.value = "";
  }
});
document.addEventListener("keydown", (e) => {
  if (screen !== "game" || modal || session?.status !== "playing" || e.repeat)
    return;
  if (e.key === "Escape") {
    e.preventDefault();
    pause();
    return;
  }
  if (selectedMode === "keypad") {
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      setInput(input + e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      setInput(input.slice(0, -1));
    } else if (e.key === "Delete") {
      setInput("");
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (input) submit(Number(input));
    }
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
window.addEventListener("blur", pause);
window.addEventListener("beforeunload", (e) => {
  if (
    screen === "game" &&
    session &&
    ["ready", "playing", "paused"].includes(session.status)
  ) {
    e.preventDefault();
  }
});
setInterval(() => {
  if (screen !== "game" || !session) return;
  if (
    session.status === "ready" &&
    !readyPaused &&
    performance.now() >= readyUntil
  ) {
    session.start();
    updateGame();
  } else session.tick();
  updateGame();
}, 80);
render();
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const status = (message: string) => {
      offlineStatus = message;
      const el = root.querySelector("#offline-status");
      if (el) el.textContent = message;
    };
    void navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "redundant")
            status("離線準備未完成，請連網重開");
        });
        return navigator.serviceWorker.ready;
      })
      .then(() => status("已可離線遊玩"))
      .catch(() => status("此瀏覽器暫無法離線遊玩"));
  });
}
