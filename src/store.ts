import type { Result } from "./session";
import { makePool, levels } from "./engine";
export interface Preferences {
  sound: boolean;
  reduced: boolean;
}
export interface Player {
  playerId: string;
  nickname: string;
  avatarId: number;
  createdAt: string;
  preferences: Preferences;
}
export interface Data {
  schemaVersion: 1;
  players: Player[];
  sessions: Result[];
  selectedPlayerId: string | null;
}
export const STORE_KEY = "space-math-v1";
export const empty = (): Data => ({
  schemaVersion: 1,
  players: [],
  sessions: [],
  selectedPlayerId: null,
});
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
const uuid = (s: unknown) =>
  typeof s === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s);
const date = (s: unknown) =>
  typeof s === "string" && Number.isFinite(Date.parse(s));
const legalPools = new Map(
  levels.map((l) => [l.id, new Map(makePool(l.id).map((q) => [q.id, q]))]),
);
export function validData(value: unknown): value is Data {
  try {
    if (!value || typeof value !== "object") return false;
    const d = value as Data;
    if (
      d.schemaVersion !== 1 ||
      !Array.isArray(d.players) ||
      !Array.isArray(d.sessions) ||
      !(d.selectedPlayerId === null || typeof d.selectedPlayerId === "string")
    )
      return false;
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    if (
      !d.players.every(
        (p) =>
          p &&
          uuid(p.playerId) &&
          typeof p.nickname === "string" &&
          p.nickname.trim().length > 0 &&
          p.nickname.length <= 12 &&
          Number.isInteger(p.avatarId) &&
          p.avatarId >= 0 &&
          p.avatarId < 6 &&
          date(p.createdAt) &&
          !!p.preferences &&
          typeof p.preferences.sound === "boolean" &&
          typeof p.preferences.reduced === "boolean",
      ) ||
      !unique(d.players.map((p) => p.playerId))
    )
      return false;
    const ids = new Set(d.players.map((p) => p.playerId));
    return (
      (d.selectedPlayerId === null || ids.has(d.selectedPlayerId)) &&
      unique(d.sessions.map((s) => s.sessionId)) &&
      d.sessions.every((s) => {
        if (
          !s ||
          s.schemaVersion !== 1 ||
          !uuid(s.sessionId) ||
          !ids.has(s.playerId) ||
          !/^([AB][1-4])$/.test(s.levelId) ||
          !["keypad", "choices"].includes(s.answerMode) ||
          s.activeDurationMs !== 60000 ||
          !Array.isArray(s.questions) ||
          !s.questions.length ||
          !date(s.startedAt) ||
          !date(s.endedAt)
        )
          return false;
        if (
          ![
            s.completedCount,
            s.firstTryCorrectCount,
            s.wrongSubmissionCount,
            s.maxStreak,
            s.score,
          ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
          s.firstTryCorrectCount > s.completedCount ||
          s.maxStreak > s.firstTryCorrectCount
        )
          return false;
        if (
          s.firstTryAccuracy !==
            (s.completedCount
              ? s.firstTryCorrectCount / s.completedCount
              : null) ||
          !(
            s.avgCompletionTime === null ||
            (Number.isFinite(s.avgCompletionTime) &&
              s.avgCompletionTime >= 0 &&
              s.avgCompletionTime <= 60000)
          )
        )
          return false;
        let completed = 0,
          first = 0,
          wrong = 0,
          streak = 0,
          maxStreak = 0,
          score = 0,
          total = 0,
          previous = 0;
        const valid = s.questions.every((r, index) => {
          if (
            !r ||
            !r.question ||
            !Array.isArray(r.attempts) ||
            typeof r.completed !== "boolean" ||
            !Number.isFinite(r.appearedAt) ||
            r.appearedAt < previous ||
            r.appearedAt >= 60000 ||
            (!r.completed && index !== s.questions.length - 1)
          )
            return false;
          const q = r.question,
            legal = legalPools.get(s.levelId)?.get(q.id);
          if (
            !legal ||
            (["a", "b", "result", "op", "unknown", "answer"] as const).some(
              (k) => q[k] !== legal[k],
            ) ||
            !Array.isArray(q.choices) ||
            q.choices.length !== 4 ||
            new Set(q.choices).size !== 4 ||
            !q.choices.includes(q.answer) ||
            !q.choices.every(
              (n) =>
                Number.isInteger(n) &&
                n >= 0 &&
                n <= (s.levelId[0] === "A" ? 10 : 20),
            )
          )
            return false;
          let at = r.appearedAt;
          for (let i = 0; i < r.attempts.length; i++) {
            const a = r.attempts[i];
            if (
              !Number.isInteger(a.value) ||
              a.value < 0 ||
              a.value > 20 ||
              !Number.isFinite(a.atActiveMs) ||
              a.atActiveMs < at ||
              a.atActiveMs >= 60000 ||
              a.isCorrect !== (a.value === q.answer) ||
              (a.isCorrect && i !== r.attempts.length - 1)
            )
              return false;
            at = a.atActiveMs;
            if (!a.isCorrect) {
              wrong++;
              streak = 0;
            }
          }
          if (r.completed) {
            if (!r.attempts.at(-1)?.isCorrect || r.completedAt !== at)
              return false;
            completed++;
            score += 100;
            total += at - r.appearedAt;
            if (r.attempts.length === 1) {
              first++;
              streak++;
              score += 20;
              if (streak % 5 === 0) score += 50;
            } else streak = 0;
            maxStreak = Math.max(maxStreak, streak);
          } else if (
            r.attempts.at(-1)?.isCorrect ||
            r.completedAt !== undefined
          )
            return false;
          previous = at;
          return true;
        });
        return (
          valid &&
          s.completedCount === completed &&
          s.firstTryCorrectCount === first &&
          s.wrongSubmissionCount === wrong &&
          s.maxStreak === maxStreak &&
          s.score === score &&
          s.avgCompletionTime === (completed ? total / completed : null)
        );
      })
    );
  } catch {
    return false;
  }
}
export class Store {
  data = empty();
  warning = "";
  protected = false;
  constructor(private storage: Pick<Storage, "getItem" | "setItem">) {
    try {
      const raw = storage.getItem(STORE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (!validData(parsed)) throw new Error("invalid");
        this.data = parsed;
      }
    } catch {
      this.protected = true;
      this.warning =
        "本機紀錄無法讀取。原資料保留，本次可繼續遊玩；請先匯出備份。";
    }
  }
  save() {
    if (this.protected) return false;
    try {
      this.storage.setItem(STORE_KEY, JSON.stringify(this.data));
      this.warning = "";
      return true;
    } catch {
      this.warning = "裝置暫時無法儲存。成績仍在本頁，請匯出備份後再離開。";
      return false;
    }
  }
  addPlayer(nickname: string, avatarId: number) {
    const p: Player = {
      playerId: crypto.randomUUID(),
      nickname: nickname.trim().slice(0, 12),
      avatarId,
      createdAt: new Date().toISOString(),
      preferences: {
        sound: true,
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      },
    };
    this.data.players.push(p);
    this.data.selectedPlayerId = p.playerId;
    this.save();
    return p;
  }
  get player() {
    return this.data.players.find(
      (p) => p.playerId === this.data.selectedPlayerId,
    );
  }
  record(result: Result) {
    if (!this.data.sessions.some((s) => s.sessionId === result.sessionId)) {
      this.data.sessions.push(result);
      this.save();
    }
  }
  merge(value: unknown) {
    if (!validData(value))
      throw new Error("備份格式或版本不正確，沒有變更任何紀錄。");
    const data = structuredClone(this.data);
    for (const field of ["players", "sessions"] as const) {
      const key = field === "players" ? "playerId" : "sessionId";
      const existing = new Map(
        (data[field] as unknown as Record<string, unknown>[]).map((x) => [
          x[key],
          x,
        ]),
      );
      for (const item of value[field] as unknown as Record<string, unknown>[]) {
        const old = existing.get(item[key]);
        if (
          old &&
          JSON.stringify(canonical(old)) !== JSON.stringify(canonical(item))
        )
          throw new Error("備份含相同 ID 的不同資料，已停止匯入。");
        if (!old) (data[field] as unknown[]).push(item);
      }
    }
    if (!data.selectedPlayerId) data.selectedPlayerId = value.selectedPlayerId;
    this.data = data;
    this.save();
  }
}
