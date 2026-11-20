export type LevelId = "A1" | "A2" | "A3" | "A4" | "B1" | "B2" | "B3" | "B4";
export type Mode = "keypad" | "choices";
export type Unknown = "a" | "b" | "result";
export interface Question {
  id: string;
  a: number;
  b: number;
  result: number;
  op: "+" | "−";
  unknown: Unknown;
  answer: number;
  choices: number[];
}
export const levels: {
  id: LevelId;
  title: string;
  subtitle: string;
  color: string;
  example: string;
}[] = [
  {
    id: "A1",
    title: "加法啟航",
    subtitle: "10 以內加法",
    color: "#80e3c5",
    example: "3 + 4 = ?",
  },
  {
    id: "A2",
    title: "減法漫遊",
    subtitle: "10 以內減法",
    color: "#80caff",
    example: "9 − 5 = ?",
  },
  {
    id: "A3",
    title: "雙向航線",
    subtitle: "10 以內加減混合",
    color: "#c0a2ff",
    example: "4 + 5 = ?",
  },
  {
    id: "A4",
    title: "神祕座標",
    subtitle: "10 以內補數與缺項",
    color: "#f6b2d5",
    example: "? + 4 = 10",
  },
  {
    id: "B1",
    title: "加法遠征",
    subtitle: "20 以內不進位加法",
    color: "#ffca82",
    example: "12 + 5 = ?",
  },
  {
    id: "B2",
    title: "減法軌道",
    subtitle: "20 以內不退位減法",
    color: "#ffe185",
    example: "18 − 6 = ?",
  },
  {
    id: "B3",
    title: "跨十躍遷",
    subtitle: "20 以內進位與退位",
    color: "#a8d5ff",
    example: "8 + 7 = ?",
  },
  {
    id: "B4",
    title: "星際解謎",
    subtitle: "20 以內混合與缺項",
    color: "#d0b2ff",
    example: "? − 7 = 8",
  },
];
export const carry = (a: number, b: number) => (a % 10) + (b % 10) >= 10;
export const borrow = (a: number, b: number) => a % 10 < b % 10;
export function makePool(level: LevelId): Question[] {
  const max = level[0] === "A" ? 10 : 20,
    pool: Question[] = [];
  for (let a = 0; a <= max; a++)
    for (let b = 0; b <= max; b++)
      for (const op of ["+", "−"] as const) {
        const result = op === "+" ? a + b : a - b;
        if (result < 0 || result > max) continue;
        const crossing = op === "+" ? carry(a, b) : borrow(a, b);
        if (level[0] === "B" && level !== "B3" && Math.max(a, b, result) <= 10)
          continue;
        if ((level === "A1" || level === "B1") && op !== "+") continue;
        if ((level === "A2" || level === "B2") && op !== "−") continue;
        if ((level === "B1" || level === "B2") && crossing) continue;
        if (level === "B3" && !crossing) continue;
        const positions: Unknown[] =
          level === "A4"
            ? ["a", "b"]
            : level === "B4"
              ? ["result", "a", "b"]
              : ["result"];
        for (const unknown of positions)
          pool.push({
            id: `${level}:${a}:${op}:${b}:${unknown}`,
            a,
            b,
            result,
            op,
            unknown,
            answer: unknown === "a" ? a : unknown === "b" ? b : result,
            choices: [],
          });
      }
  return pool;
}
export function shuffle<T>(items: T[], rng = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function equivalent(q: Question): string {
  return q.op === "+" && q.unknown === "result"
    ? `${Math.min(q.a, q.b)}+${Math.max(q.a, q.b)}`
    : q.id;
}
export function choicesFor(
  answer: number,
  max: number,
  position: number,
  rng = Math.random,
): number[] {
  const candidates = [
    answer - 1,
    answer + 1,
    answer - 2,
    answer + 2,
    10 - answer,
    answer - 10,
    answer + 10,
  ];
  const distractors = [
    ...new Set([
      ...shuffle(candidates, rng),
      ...shuffle(
        Array.from({ length: max + 1 }, (_, i) => i),
        rng,
      ),
    ]),
  ]
    .filter((n) => n >= 0 && n <= max && n !== answer)
    .slice(0, 3);
  distractors.splice(position, 0, answer);
  return distractors;
}
// Sampling policy lives with the engine so child trials can tune it without UI changes.
export const samplingPolicy = {
  mixedOperators: ["+", "−"] as const,
  b4Missing: [false, false, true, true],
  b4RequireCrossing: [true, true, true, true, false, false, false, false],
  zeroCycle: 10,
  zeroSlot: 7,
};
export class Deck {
  private pools = new Map<string, Question[]>();
  private positions: number[] = [];
  private index = 0;
  private previous = "";
  constructor(
    public level: LevelId,
    private rng = Math.random,
  ) {}
  next(): Question {
    // Eight-question quotas keep mixed operations balanced; B4 has 50% missing terms,
    // 50% subtraction, and at least 50% crossing. One zero slot per ten questions.
    const i = this.index++,
      mixed = ["A3", "A4", "B3", "B4"].includes(this.level);
    const op = mixed
      ? samplingPolicy.mixedOperators[i % samplingPolicy.mixedOperators.length]
      : undefined;
    const missing =
      this.level === "A4" ||
      (this.level === "B4" &&
        samplingPolicy.b4Missing[i % samplingPolicy.b4Missing.length]);
    const crossing =
      this.level === "B4" &&
      samplingPolicy.b4RequireCrossing[
        i % samplingPolicy.b4RequireCrossing.length
      ];
    const zero = i % samplingPolicy.zeroCycle === samplingPolicy.zeroSlot;
    const key = `${op}:${missing}:${crossing}:${zero}`;
    let bag = this.pools.get(key);
    if (!bag?.length) {
      let candidates = makePool(this.level).filter(
        (q) =>
          (!op || q.op === op) &&
          (this.level !== "B4" || (q.unknown !== "result") === missing) &&
          (!crossing || (q.op === "+" ? carry(q.a, q.b) : borrow(q.a, q.b))) &&
          (zero || ![q.a, q.b, q.result].includes(0)),
      );
      if (!candidates.length) candidates = makePool(this.level);
      bag = shuffle(candidates, this.rng);
      this.pools.set(key, bag);
    }
    let idx = bag.findIndex((q) => equivalent(q) !== this.previous);
    if (idx < 0) {
      const alternate = makePool(this.level).filter(
        (q) =>
          equivalent(q) !== this.previous &&
          (!op || q.op === op) &&
          (this.level !== "B4" || (q.unknown !== "result") === missing) &&
          (!crossing || (q.op === "+" ? carry(q.a, q.b) : borrow(q.a, q.b))) &&
          (zero || ![q.a, q.b, q.result].includes(0)),
      );
      if (alternate.length) {
        bag.unshift(alternate[Math.floor(this.rng() * alternate.length)]);
        idx = 0;
      } else idx = 0;
    }
    const q = { ...bag.splice(idx, 1)[0] };
    this.previous = equivalent(q);
    if (!this.positions.length)
      this.positions = shuffle([0, 1, 2, 3], this.rng);
    q.choices = choicesFor(
      q.answer,
      this.level[0] === "A" ? 10 : 20,
      this.positions.pop()!,
      this.rng,
    );
    return q;
  }
}
export function expression(q: Question): string {
  return `${q.unknown === "a" ? "?" : q.a} ${q.op} ${q.unknown === "b" ? "?" : q.b} = ${q.unknown === "result" ? "?" : q.result}`;
}
