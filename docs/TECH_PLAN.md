> 2026-11-23：本文件保留 v1 歷史；v2 的玩法、提示、指標與驗收以 [產品規格](PRODUCT_SPEC.md) 及 [v2 試玩紀錄](PLAYTEST_V2.md) 為準。

# 技術架構、階段規劃與資料模型（供 Codex 評估）

## 1. 技術提案（非強制細節）
靜態網站 HTML / CSS / JavaScript，部署 GitHub Pages。保持模組化，不一定需要前端框架；依現有專案工具鏈決定。Canvas 可用於太空背景效果，**UI、題目與按鍵優先使用可觸控、可測試的 DOM**。初期以 localStorage 儲存玩家偏好與歷史紀錄；紀錄成長後評估 IndexedDB。日後可加 PWA、JSON 匯出／匯入。

## 2. 建議模組
- `questionEngine`：關卡合法題型、題庫取樣、數學答案、干擾選項。
- `gameSession`：準備、遊玩、暫停、回復、結束的狀態機；單調計時。
- `answerController`：數字輸入、四選一、錯誤重試、防重複提交。
- `scoring`：各種指標、積分、連擊與星級。
- `playerStore`：玩家、成績、設定的版本化本機持久化。
- `ui`：響應式畫面、可及性、提示。
- `effects`：動畫與音效，不能成為題目推進的阻塞依賴。

## 3. 建議狀態機
`player_select → level_select → mode_select → ready → playing ↔ paused → results`
另外中止可返回關卡選擇；不把中止的局列為「正常 60 秒成績」。背景事件自動進入 `paused`。任何異步音效、動畫回呼都不能覆寫已結束遊戲的狀態。

## 4. 建議資料介面（示意結構，不是程式）
- 玩家：`playerId`, `nickname`, `avatarId`, `createdAt`, `preferences`
- 單局：`sessionId`, `playerId`, `levelId`, `answerMode`, `startedAt`, `endedAt`, `activeDurationMs`, `completedCount`, `firstTryCorrectCount`, `wrongSubmissionCount`, `maxStreak`, `score`, `schemaVersion`
- 題目紀錄：`questionId`, `kind`, `operands`, `operator`, `unknownPosition`, `correctAnswer`, `choices`, `attempts[{value,atActiveMs,isCorrect}]`, `completed`
- 本機總表：`players`, `sessions`, `settings`, `schemaVersion`
- 使用 UUID 或等價非碰撞本機 ID；不得把暱稱當唯一識別鍵。

## 5. 階段
| 階段 | 交付範圍 | 完成判準 |
|---|---|---|
| P0 | 數學引擎、八關、兩模式、重試、60秒計時、基礎結算 | 數學與狀態機測試通過；可進行完整一輪 |
| P1 | 平板觸控、響應式 UI、提示、暫停、基礎火箭動畫／音效 | 4:3、16:10 可直接操作、失焦暫停有效 |
| P2 | 多玩家、本機紀錄、獨立榜單、星級與關卡地圖（全開放） | 資料跨重新整理保留且玩家互不混淆 |
| P3 | 美術精緻化、太空獎勵、連擊演出、完整音效 | 美術不遮擋 UI、不延誤計時，減少動畫選項有效 |
| P4 | GitHub Pages、PWA、JSON 備份、跨裝置尺寸測試 | 靜態部署可用，離線及備份行為有測試 |

## 6. 與既有專案整合
如 Codex 在既有資料夾啟動，先檢查 git 狀態、AGENTS.md、既有工具鏈及作品列表。不得覆寫現有作品，不得假設可改寫既有 AGENTS.md；提交設計與變更計畫，等待使用者允許後才實作。

## 7. 性能與部署風險
- 瀏覽器背景計時器節流：不要把 60 次 `setInterval` 當成 60 秒，必須以 monotonic clock 與有效時間計算。
- 音效策略：先由使用者互動喚醒 AudioContext，失敗時靜音回退。
- GitHub Pages 子路徑：資源使用相對路徑並在部署前測試。
- 觸控事件：防連點、防重複提交、橫向畫面誤捲動。
- 資料：版本遷移、損壞資料回退、localStorage 配額／清除風險。
