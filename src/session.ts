import { Deck, type LevelId, type Mode, type Question } from "./engine";
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
  ) {
    this.deck = new Deck(levelId, rng);
  }
  get elapsed() {
    return Math.min(
      60000,
      this.active + (this.status === "playing" ? this.now() - this.since : 0),
    );
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
      question: this.deck.next(),
      appearedAt,
      attempts: [],
      completed: false,
    });
  }
  tick() {
    if (this.status === "playing" && this.elapsed >= 60000) this.finish();
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
    if (time >= 60000) {
      this.finish();
      return "ignored";
    }
    const correct = value === r.question.answer,
      first = r.attempts.length === 0;
    r.attempts.push({ value, atActiveMs: time, isCorrect: correct });
    if (!correct) {
      this.wrongSubmissionCount++;
      this.streak = 0;
      return "wrong";
    }
    r.completed = true;
    r.completedAt = time;
    this.completedCount++;
    this.score += 100;
    if (first) {
      this.firstTryCorrectCount++;
      this.streak++;
      this.score += 20;
      if (this.streak % 5 === 0) this.score += 50;
    } else this.streak = 0;
    this.maxStreak = Math.max(this.maxStreak, this.streak);
    this.next(time);
    return "correct";
  }
  finish() {
    if (this.status !== "playing") return;
    this.active = 60000;
    this.status = "results";
  }
  summary() {
    const done = this.records.filter((r) => r.completed);
    return {
      schemaVersion: 1 as const,
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
export type Result = ReturnType<Session["summary"]>;
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
