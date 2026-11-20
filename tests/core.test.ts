import { describe, it, expect, vi } from "vitest";
import {
  levels,
  makePool,
  Deck,
  equivalent,
  expression,
  choicesFor,
} from "../src/engine";
import { Session, stars } from "../src/session";
import { Store, STORE_KEY, empty, validData } from "../src/store";

const rng = () => {
  let seed = 137;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};
describe("all finite question pools", () => {
  for (const level of levels)
    it(`${level.id}: every equation, missing term and classification is legal`, () => {
      const pool = makePool(level.id),
        max = level.id[0] === "A" ? 10 : 20;
      expect(pool.length).toBeGreaterThan(10);
      expect(new Set(pool.map((q) => q.id)).size).toBe(pool.length);
      for (const q of pool) {
        for (const n of [q.a, q.b, q.result, q.answer]) {
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(max);
        }
        expect(q.op === "+" ? q.a + q.b : q.a - q.b).toBe(q.result);
        expect(q.answer).toBe(
          q.unknown === "a" ? q.a : q.unknown === "b" ? q.b : q.result,
        );
        const crossing =
          q.op === "+"
            ? Math.floor(q.a / 10) + Math.floor(q.b / 10) !==
              Math.floor(q.result / 10)
            : Math.floor(q.a / 10) - Math.floor(q.b / 10) !==
              Math.floor(q.result / 10);
        if (["A1", "B1"].includes(level.id)) expect(q.op).toBe("+");
        if (["A2", "B2"].includes(level.id)) expect(q.op).toBe("−");
        if (["B1", "B2"].includes(level.id)) expect(crossing).toBe(false);
        if (level.id === "B3") expect(crossing).toBe(true);
        if (level.id[0] === "B" && level.id !== "B3")
          expect(Math.max(q.a, q.b, q.result)).toBeGreaterThan(10);
        expect(expression(q).split("?")).toHaveLength(2);
        if (level.id === "A4") expect(q.unknown).not.toBe("result");
      }
    });
  it("contains independently known boundary examples and excludes invalid ones", () => {
    expect(
      makePool("A1").some((q) => q.a === 0 && q.b === 10 && q.answer === 10),
    ).toBe(true);
    expect(
      makePool("B1").some((q) => q.a === 10 && q.b === 10 && q.answer === 20),
    ).toBe(true);
    expect(makePool("B1").some((q) => q.a === 11 && q.b === 0)).toBe(true);
    expect(makePool("B1").some((q) => q.a === 9 && q.b === 1)).toBe(false);
    expect(
      makePool("B3").some(
        (q) => q.a === 13 && q.b === 8 && q.op === "−" && q.answer === 5,
      ),
    ).toBe(true);
    expect(makePool("B3").some((q) => q.a === 10 && q.b === 0)).toBe(false);
  });
});
describe("decks and four choices", () => {
  for (const l of levels)
    it(`${l.id}: 1200 draws exhaust safely, avoid equivalent neighbours, balance positions`, () => {
      const deck = new Deck(l.id, rng()),
        positions = [0, 0, 0, 0];
      let previous = "",
        zero = 0,
        plus = 0,
        missing = 0,
        cross = 0;
      for (let i = 0; i < 1200; i++) {
        const q = deck.next();
        expect(equivalent(q)).not.toBe(previous);
        previous = equivalent(q);
        expect(new Set(q.choices).size).toBe(4);
        expect(q.choices.filter((n) => n === q.answer)).toHaveLength(1);
        for (const n of q.choices) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(l.id[0] === "A" ? 10 : 20);
        }
        positions[q.choices.indexOf(q.answer)]++;
        if ([q.a, q.b, q.result].includes(0)) zero++;
        if (q.op === "+") plus++;
        if (q.unknown !== "result") missing++;
        if (q.op === "+" ? (q.a % 10) + (q.b % 10) >= 10 : q.a % 10 < q.b % 10)
          cross++;
      }
      expect(positions).toEqual([300, 300, 300, 300]);
      expect(zero).toBeLessThanOrEqual(240);
      if (["A3", "A4", "B3", "B4"].includes(l.id)) expect(plus).toBe(600);
      if (l.id === "B4") {
        expect(missing).toBe(600);
        expect(cross).toBeGreaterThanOrEqual(300);
      }
    });
  it("can produce legal choices for every answer at both boundaries", () => {
    for (const max of [10, 20])
      for (let a = 0; a <= max; a++)
        for (let p = 0; p < 4; p++) {
          const c = choicesFor(a, max, p, rng());
          expect(c[p]).toBe(a);
          expect(new Set(c).size).toBe(4);
          expect(c.every((n) => n >= 0 && n <= max)).toBe(true);
        }
  });
});
function fixture() {
  let clock = 0;
  const s = new Session(
    crypto.randomUUID(),
    "A1",
    "keypad",
    () => clock,
    rng(),
  );
  s.start();
  return {
    s,
    set: (n: number) => (clock = n),
    correct: () => s.submit(s.current.question.answer, s.current.question.id),
  };
}
describe("60-second session and scoring", () => {
  it("charges question-generation overhead to active play instead of dropping it", () => {
    let clock = 0;
    const s = new Session(
      crypto.randomUUID(),
      "A1",
      "keypad",
      () => clock,
      () => {
        clock++;
        return 0.37;
      },
    );
    s.start();
    clock = 1000;
    s.submit(s.current.question.answer, s.current.question.id);
    expect(s.current.appearedAt).toBe(1000);
  });
  it("counts retries once, preserves options, rejects stale submission", () => {
    const { s, set, correct } = fixture();
    const q = s.current.question,
      choices = [...q.choices];
    set(1000);
    expect(s.submit((q.answer + 1) % 11, q.id)).toBe("wrong");
    set(2000);
    s.submit((q.answer + 2) % 11, q.id);
    expect(s.completedCount).toBe(0);
    expect(s.current.question.choices).toEqual(choices);
    set(3000);
    correct();
    expect(s.completedCount).toBe(1);
    expect(s.firstTryCorrectCount).toBe(0);
    expect(s.wrongSubmissionCount).toBe(2);
    expect(s.score).toBe(100);
    expect(s.submit(q.answer, q.id)).toBe("ignored");
    set(60000);
    s.tick();
    expect(s.summary().avgCompletionTime).toBe(3000);
  });
  it("awards 5 and 10 streak milestones exactly once; a retry breaks streak", () => {
    const { s, set, correct } = fixture();
    for (let i = 1; i <= 10; i++) {
      set(i * 500);
      correct();
    }
    expect(s.score).toBe(1300);
    expect(s.maxStreak).toBe(10);
    s.submit((s.current.question.answer + 1) % 11, s.current.question.id);
    correct();
    expect(s.streak).toBe(0);
    expect(s.score).toBe(1400);
    correct();
    expect(s.streak).toBe(1);
    expect(s.score).toBe(1520);
  });
  it("accepts before deadline, rejects at deadline, and does not double-settle", () => {
    const { s, set, correct } = fixture();
    set(59999);
    expect(correct()).toBe("correct");
    set(60000);
    expect(correct()).toBe("ignored");
    expect(s.status).toBe("results");
    expect(s.completedCount).toBe(1);
    s.tick();
    expect(s.completedCount).toBe(1);
  });
  it("pauses active time and hides no time in retry statistics", () => {
    const { s, set, correct } = fixture();
    set(1000);
    s.pause();
    set(90000);
    expect(s.elapsed).toBe(1000);
    expect(correct()).toBe("ignored");
    s.resume();
    set(92000);
    correct();
    expect(s.current.appearedAt).toBe(3000);
    s.pause();
    set(200000);
    s.resume();
    set(257000);
    s.tick();
    expect(s.status).toBe("results");
    expect(s.summary().avgCompletionTime).toBe(3000);
  });
  it("unfinished wrong question is excluded from denominator but preserves errors", () => {
    const { s, set, correct } = fixture();
    set(1000);
    correct();
    set(2000);
    s.submit((s.current.question.answer + 1) % 11, s.current.question.id);
    set(60000);
    s.tick();
    const r = s.summary();
    expect(r.firstTryAccuracy).toBe(1);
    expect(r.wrongSubmissionCount).toBe(1);
    expect(r.completedCount).toBe(1);
  });
  it("rejects invalid input; empty session displays undefined accuracy as null", () => {
    const { s, set } = fixture();
    for (const value of [NaN, -1, 21, 2.5])
      expect(s.submit(value, s.current.question.id)).toBe("ignored");
    set(60000);
    s.tick();
    expect(s.summary().firstTryAccuracy).toBeNull();
    expect(s.summary().avgCompletionTime).toBeNull();
    expect(s.summary().wrongSubmissionCount).toBe(0);
  });
  it("does not save aborted sessions as results", () => {
    const { s, set } = fixture();
    set(5000);
    s.abort();
    set(100000);
    s.tick();
    expect(s.status).toBe("aborted");
    expect(s.active).toBe(5000);
  });
  it("A1 tiers use both count and accuracy; other levels remain uncalibrated", () => {
    expect(
      stars({ levelId: "A1", completedCount: 15, firstTryAccuracy: 0.9 }),
    ).toBe(3);
    expect(
      stars({ levelId: "A1", completedCount: 15, firstTryAccuracy: 0.7 }),
    ).toBe(1);
    expect(
      stars({ levelId: "B1", completedCount: 99, firstTryAccuracy: 1 }),
    ).toBeNull();
  });
});
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, v: string) => {
      values.set(key, v);
    },
  };
}
describe("persistence and backup", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  it("same nicknames have different IDs; preferences and round trips remain independent", () => {
    const storage = memory(),
      store = new Store(storage),
      a = store.addPlayer("小星", 0),
      b = store.addPlayer("小星", 1);
    expect(a.playerId).not.toBe(b.playerId);
    a.preferences.sound = false;
    store.save();
    const reload = new Store(storage);
    expect(reload.data.players[0].preferences.sound).toBe(false);
    expect(reload.player?.playerId).toBe(b.playerId);
    expect(reload.player?.preferences.sound).toBe(true);
  });
  it("preserves damaged original and handles quota errors without losing in-memory result", () => {
    const storage = memory();
    storage.setItem(STORE_KEY, "broken");
    const store = new Store(storage);
    store.addPlayer("測試", 0);
    expect(store.protected).toBe(true);
    expect(storage.getItem(STORE_KEY)).toBe("broken");
    const quota = new Store({
      getItem: () => null,
      setItem: () => {
        throw Error("quota");
      },
    });
    quota.addPlayer("暫存", 0);
    expect(quota.data.players).toHaveLength(1);
    expect(quota.warning).toContain("匯出備份");
  });
  it("validates round records, merges identically once, rejects conflict transactionally", () => {
    const store = new Store(memory()),
      player = store.addPlayer("測試", 0);
    let clock = 0;
    const s = new Session(player.playerId, "B4", "choices", () => clock, rng());
    s.start();
    for (let i = 1; i <= 7; i++) {
      clock = i * 1000;
      if (i === 3)
        s.submit((s.current.question.answer + 1) % 21, s.current.question.id);
      s.submit(s.current.question.answer, s.current.question.id);
    }
    clock = 60000;
    s.tick();
    store.record(s.summary());
    expect(validData(store.data)).toBe(true);
    const other = new Store(memory());
    other.merge(structuredClone(store.data));
    other.merge(structuredClone(store.data));
    expect(other.data.sessions).toHaveLength(1);
    const conflict = structuredClone(store.data);
    conflict.players[0].nickname = "另一人";
    const before = JSON.stringify(other.data);
    expect(() => other.merge(conflict)).toThrow("不同資料");
    expect(JSON.stringify(other.data)).toBe(before);
    const invalid = structuredClone(store.data);
    invalid.sessions[0].questions[0].question.op = "<img>" as "+";
    expect(validData(invalid)).toBe(false);
    invalid.sessions[0].questions[0].question =
      store.data.sessions[0].questions[0].question;
    invalid.sessions[0].score++;
    expect(validData(invalid)).toBe(false);
  });
  it("rejects hostile and malformed shapes without throwing", () => {
    for (const data of [
      null,
      {},
      [],
      { ...empty(), players: [null] },
      { ...empty(), sessions: [null] },
      { ...empty(), players: [{ playerId: '\" onclick=alert(1)' }] },
    ])
      expect(validData(data)).toBe(false);
  });
  it("ignores JSON object-key order when merging duplicate records", () => {
    const store = new Store(memory());
    store.addPlayer("測試", 0);
    const copy = structuredClone(store.data);
    copy.players[0] = Object.fromEntries(
      Object.entries(copy.players[0]).reverse(),
    ) as unknown as (typeof copy.players)[number];
    store.merge(copy);
    expect(store.data.players).toHaveLength(1);
  });
});
