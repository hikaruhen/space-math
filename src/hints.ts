import { carry, borrow, type Question } from "./engine";
export interface Hint { title: string; text: string; groups: { label: string; count: number }[] }
export function hintFor(q: Question): Hint {
  if (q.unknown !== "result") {
    const total = q.op === "+" ? q.result : q.a;
    const known = q.op === "+" ? (q.unknown === "a" ? q.b : q.a) : (q.unknown === "a" ? null : q.result);
    if (q.op === "−" && q.unknown === "a") return { title: "把拿走的和剩下的合起來", text: `拿走 ${q.b} 個，還剩 ${q.result} 個。原來有多少？把兩部分合起來看看。`, groups: [{ label: "拿走", count: q.b }, { label: "剩下", count: q.result }] };
    return { title: "找出藏起來的那一部分", text: `全部有 ${total} 個，已知一部分是 ${known} 個。從全部圈出已知的，另一部分有多少？`, groups: [{ label: "全部", count: total }, { label: "已知部分", count: known! }] };
  }
  if (q.op === "+" && q.result > 10 && carry(q.a,q.b)) {
    const need = 10 - q.a % 10;
    return { title: "先湊成 10", text: `${q.a} 再加 ${need} 就能湊成 10。把 ${q.b} 分成 ${need} 和另一部分，湊十後再接著加。`, groups: [{ label: "先有", count: q.a }, { label: "再加", count: q.b }] };
  }
  if (q.op === "−" && q.a > 10 && borrow(q.a,q.b)) return { title: "先減到 10", text: `${q.a} 先拿走 ${q.a-10} 個就剩 10。總共要拿走 ${q.b} 個，接下來還要拿走幾個？`, groups: [{ label: "原來有", count: q.a }] };
  return { title: q.op === "+" ? "合起來數一數" : "拿走後數一數", text: q.op === "+" ? `把 ${q.a} 個和 ${q.b} 個合起來；滿十個可以圈成一組。` : `先有 ${q.a} 個，拿走 ${q.b} 個。用手指遮住拿走的，再數剩下的。`, groups: q.op === "+" ? [{ label: "先有", count: q.a }, { label: "再加", count: q.b }] : [{ label: "原來有", count: q.a }] };
}
