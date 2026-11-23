import { it, expect, vi } from "vitest";
import { Session } from "../src/session";
import { Store, STORE_KEY, validData } from "../src/store";
import { makePool, choicesFor } from "../src/engine";
import { hintFor } from "../src/hints";
vi.stubGlobal("matchMedia", () => ({matches:false}));
function setup(gameplay: "mission"|"challenge"|"review" = "mission") {
 let time=0;
 const storage = new Map<string,string>();
 const io={getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{storage.set(k,v)}};
 const store=new Store(io), player=store.addPlayer("小星",0);
 const q=makePool("A1").find(q=>q.a===3&&q.b===4)!;
 q.choices=choicesFor(7,10,0);
 const session=new Session(player.playerId,"A1","keypad",()=>time,()=>.4,gameplay,[q]);
 session.start();
 return {session,store,io,set:(v:number)=>time=v};
}
it("an untimed mission completes exactly ten questions and survives backup/reload",()=>{
 const {session:s,store,io,set}=setup();
 set(70000);s.tick();expect(s.status).toBe("playing");
 for(let i=0;i<10;i++){set(71000+i*1000);s.submit(s.current.question.answer,s.current.question.id);}
 expect(s.status).toBe("results");expect(s.records).toHaveLength(10);
 expect(s.summary().activeDurationMs).toBe(80000);
 store.record(s.summary());expect(validData(store.data)).toBe(true);
 expect(new Store(io).data.sessions[0].completedCount).toBe(10);
 const other=setup().store;other.merge(store.data);other.merge(store.data);
 expect(other.data.sessions).toHaveLength(1);
});
it("manual and automatic hints never award independent or streak bonuses",()=>{
 const {session:s,set,store}=setup();
 s.useHint();s.submit(s.current.question.answer,s.current.question.id);
 set(1000);const id=s.current.question.id, choices=[...s.current.question.choices];
 for(let i=0;i<2;i++)s.submit((s.current.question.answer+1)%21,id);
 expect(s.current.hintUsed).toBe(true);expect(s.current.question.choices).toEqual(choices);
 s.submit(s.current.question.answer,id);
 for(let i=2;i<10;i++){set(1000+i*1000);s.submit(s.current.question.answer,s.current.question.id);}
 expect(s.summary().hintCount).toBe(2);expect(s.firstTryCorrectCount).toBe(8);
 expect(s.score).toBe(1210);store.record(s.summary());expect(validData(store.data)).toBe(true);
 const bad=structuredClone(store.data);bad.sessions[0].hintCount=0;expect(validData(bad)).toBe(false);
});
it("last unfinished wrong question lowers independent accuracy",()=>{
 const {session:s,set,store}=setup("challenge");
 set(1000);s.submit(s.current.question.answer,s.current.question.id);
 set(2000);s.submit((s.current.question.answer+1)%21,s.current.question.id);
 set(60000);s.tick();expect(s.summary().independentAccuracy).toBe(.5);
 expect(s.summary().firstTryAccuracy).toBe(1);
 store.record(s.summary());expect(validData(store.data)).toBe(true);
});
it("a hint-only final question is eligible for review but not an attempted submission",()=>{
 const {session:s,set}=setup("challenge");s.useHint();set(60000);s.tick();
 expect(s.summary().hintCount).toBe(1);expect(s.summary().attemptedCount).toBe(0);
 expect(s.summary().independentAccuracy).toBeNull();
});
it("review ends at its own target and retains separate gameplay",()=>{
 const {session:s,set,store}=setup("review");set(123456);s.submit(7,s.current.question.id);
 expect(s.status).toBe("results");expect(s.summary().targetCount).toBe(1);
 store.record(s.summary());expect(validData(store.data)).toBe(true);
 expect(()=>new Session("x","A1","keypad",undefined,undefined,"review")).toThrow();
});
it("legacy backups retain unknown hint history and merge with new records",()=>{
 const {session:s,set,store,io}=setup("challenge");set(1000);s.submit(s.current.question.answer,s.current.question.id);set(60000);s.tick();
 const legacy:any=structuredClone(s.summary());legacy.schemaVersion=1;
 for(const k of ["gameplay","targetCount","hintCount","attemptedCount","independentAccuracy"])delete legacy[k];
 for(const q of legacy.questions)delete q.hintUsed;
 const data={...store.data,schemaVersion:1,sessions:[legacy]};expect(validData(data)).toBe(true);
 io.setItem(STORE_KEY,JSON.stringify(data));const loaded=new Store(io);
 expect(loaded.data.schemaVersion).toBe(2);expect(loaded.data.sessions[0].hintCount).toBeUndefined();
 loaded.merge(data);expect(loaded.data.sessions).toHaveLength(1);
});
it("bad version two records are rejected without changing original storage",()=>{
 const {store,io}=setup();const raw=JSON.stringify({...store.data,schemaVersion:99});
 io.setItem(STORE_KEY,raw);const loaded=new Store(io);loaded.addPlayer("新",1);
 expect(loaded.protected).toBe(true);expect(io.getItem(STORE_KEY)).toBe(raw);
});
it("hints expose known quantities without filling a missing term",()=>{
 const find=(id:string,a:number,b:number,op:string,u:string)=>makePool(id as any).find(q=>q.a===a&&q.b===b&&q.op===op&&q.unknown===u)!;
 const cases=[find("A1",0,10,"+","result"),find("B3",8,7,"+","result"),find("B3",13,8,"−","result"),find("A4",3,4,"+","a"),find("B4",15,7,"−","a"),find("B4",15,7,"−","b")];
 for(const q of cases){const h=hintFor(q);expect(h.title).toBeTruthy();expect(h.text).not.toContain(`= ${q.answer}`);expect(h.groups.every(g=>g.count>=0&&g.count<=20)).toBe(true);}
 expect(hintFor(cases[1]).text).toContain("再加 2");
 expect(hintFor(cases[2]).text).toContain("先拿走 3");
 expect(hintFor(cases[4]).groups.map(g=>g.count)).toEqual([7,8]);
});
