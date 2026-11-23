import { Deck, type LevelId, type Mode, type Question } from "./engine";
export type Gameplay = "mission" | "challenge" | "review";
export const gameplayLabel = (g: Gameplay = "challenge") => ({ mission: "10 題探險", challenge: "60 秒挑戰", review: "錯題再練" })[g];
export interface Attempt {
  value: number;
  atActiveMs: number;
  isCorrect: boolean;
}
export interface RecordQuestion {
  question: Question;
  appearedAt: number;
  attempts: Attempt[];
  completed: boolean;
  hintUsed?: boolean;
  completedAt?: number;
}
export type Status = "ready" | "playing" | "paused" | "results" | "aborted";
export class Session {
  readonly id = crypto.randomUUID();
  readonly startedAt = new Date().toISOString();
  status: Status = "ready";
  active = 0;
  private since = 0;
  private deck: Deck;
  records: RecordQuestion[] = [];
  completedCount = 0;
  firstTryCorrectCount = 0;
  wrongSubmissionCount = 0;
  maxStreak = 0;
  streak = 0;
  score = 0;
  constructor(
    public playerId: string,
    public levelId: LevelId,
    public answerMode: Mode,
    private now = () => performance.now(),
    rng = Math.random,
    public gameplay: Gameplay = "challenge",
    private reviewQuestions: Question[] = [],
  ) {
    this.deck = new Deck(levelId, rng);
    this.reviewQuestions = reviewQuestions.slice(0, 5).map(q => structuredClone(q));
    if (gameplay === "review" && !this.reviewQuestions.length) throw Error("沒有待練習題目");
  }
  get elapsed() {
    return Math.min(
      this.gameplay === "challenge" ? 60000 : Infinity,
      this.active + (this.status === "playing" ? this.now() - this.since : 0),
    );
  }
  get target() { return this.gameplay === "mission" ? 10 : this.gameplay === "review" ? this.reviewQuestions.length : Infinity; }
  useHint() {
    this.tick();
    if (this.status !== "playing") return false;
    this.current.hintUsed = true;
    this.streak = 0;
    return true;
  }
  get remaining() {
    return Math.max(0, 60000 - this.elapsed);
  }
  get current() {
    return this.records.at(-1)!;
  }
  start() {
    if (this.status !== "ready") return;
    this.since = this.now();
    this.status = "playing";
    this.next();
  }
  private next(appearedAt = this.elapsed) {
    this.records.push({
      question: this.gameplay === "review" ? this.reviewQuestions[this.completedCount] : this.deck.next(),
      hintUsed: false,
      appearedAt,
      attempts: [],
      completed: false,
    });
  }
  tick() {
    if (this.status === "playing" && this.gameplay === "challenge" && this.elapsed >= 60000) this.finish();
  }
  pause() {
    if (this.status !== "playing") return;
    this.tick();
    if (this.status !== "playing") return;
    this.active = this.elapsed;
    this.status = "paused";
  }
  resume() {
    if (this.status !== "paused") return;
    this.since = this.now();
    this.status = "playing";
  }
  abort() {
    if (this.status === "results") return;
    this.active = this.elapsed;
    this.status = "aborted";
  }
  submit(
    value: number,
    questionToken: string,
  ): "correct" | "wrong" | "ignored" {
    this.tick();
    if (
      this.status !== "playing" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 20 ||
      this.current.question.id !== questionToken ||
      this.current.completed
    )
      return "ignored";
    const r = this.current,
      time = this.elapsed;
    if (this.gameplay === "challenge" && time >= 60000) {
      this.finish();
      return "ignored";
    }
    const correct = value === r.question.answer,
      first = r.attempts.length === 0;
    r.attempts.push({ value, atActiveMs: time, isCorrect: correct });
    if (!correct) {
      this.wrongSubmissionCount++;
      this.streak = 0;
      if (r.attempts.length >= 2) this.useHint();
      return "wrong";
    }
    r.completed = true;
    r.completedAt = time;
    this.completedCount++;
    this.score += 100;
    if (first && !r.hintUsed) {
      this.firstTryCorrectCount++;
      this.streak++;
      this.score += 20;
      if (this.streak % 5 === 0) this.score += 50;
    } else this.streak = 0;
    this.maxStreak = Math.max(this.maxStreak, this.streak);
    if (this.completedCount >= this.target) this.finish();
    else this.next(time);
    return "correct";
  }
  finish() {
    if (this.status !== "playing") return;
    this.active = this.gameplay === "challenge" ? 60000 : this.elapsed;
    this.status = "results";
  }
  summary() {
    const done = this.records.filter((r) => r.completed);
    return {
      schemaVersion: 2 as 1 | 2,
      gameplay: this.gameplay,
      targetCount: Number.isFinite(this.target) ? this.target : null,
      hintCount: this.records.filter(r => r.hintUsed).length,
      attemptedCount: this.records.filter(r => r.attempts.length).length,
      independentAccuracy: this.records.some(r => r.attempts.length) ? this.firstTryCorrectCount / this.records.filter(r => r.attempts.length).length : null,
      sessionId: this.id,
      playerId: this.playerId,
      levelId: this.levelId,
      answerMode: this.answerMode,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      activeDurationMs: this.active,
      completedCount: this.completedCount,
      firstTryCorrectCount: this.firstTryCorrectCount,
      wrongSubmissionCount: this.wrongSubmissionCount,
      maxStreak: this.maxStreak,
      score: this.score,
      firstTryAccuracy: this.completedCount
        ? this.firstTryCorrectCount / this.completedCount
        : null,
      avgCompletionTime: done.length
        ? done.reduce((sum, r) => sum + r.completedAt! - r.appearedAt, 0) /
          done.length
        : null,
      questions: this.records,
    };
  }
}
type Summary = ReturnType<Session["summary"]>;
export type Result = Omit<Summary, "gameplay" | "targetCount" | "hintCount" | "attemptedCount" | "independentAccuracy"> & Partial<Pick<Summary, "gameplay" | "targetCount" | "hintCount" | "attemptedCount" | "independentAccuracy">>;
export const starThresholds = {
  A1: [
    { count: 5, accuracy: 0.7 },
    { count: 10, accuracy: 0.8 },
    { count: 15, accuracy: 0.9 },
  ],
};
export function stars(
  r: Pick<Result, "levelId" | "completedCount" | "firstTryAccuracy">,
): number | null {
  if (r.levelId !== "A1") return null;
  const accuracy = r.firstTryAccuracy ?? 0;
  let earned = 0;
  starThresholds.A1.forEach((threshold, index) => {
    if (r.completedCount >= threshold.count && accuracy >= threshold.accuracy)
      earned = index + 1;
  });
  return earned;
}
