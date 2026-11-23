import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base=process.env.GAME_URL || "http://127.0.0.1:5174";
await mkdir("test-results",{recursive:true});
const browser=await chromium.launch({channel:"chrome"});
const context=await browser.newContext({viewport:{width:1024,height:768}});
const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.clock.install();await page.goto(base);
const click=action=>page.locator(`[data-action="${action}"]`).first().click();
await page.locator('[data-action="level"][data-level="A1"]').click();
await page.locator('#nickname').fill("小星試玩");await page.locator('#player-form button[type=submit]').click();
await expect(page.locator('[data-gameplay="mission"]')).toHaveAttribute('aria-pressed','true');
async function start(level,mode,gameplay="mission"){
 if(await page.locator('.modal').count()===0)await page.locator(`[data-level="${level}"]`).click();
 await page.locator(`[data-gameplay="${gameplay}"]`).click();await page.locator(`[data-mode="${mode}"]`).click();
 await click('start');await page.clock.runFor(3200);await expect(page.locator('#equation')).toContainText('=');
}
async function answer(value,mode){
 if(mode==='keypad'){await page.keyboard.type(String(value));await page.keyboard.press('Enter');}
 else await page.locator(`[data-action=choice][data-value="${value}"]`).click();
 await page.clock.runFor(230);
}
async function solve(){
 const text=await page.locator('#equation').innerText();const [a,op,b,,r]=text.trim().split(/\s+/);
 const n=Number;return a==='?'?(op==='+'?n(r)-n(b):n(r)+n(b)):b==='?'?(op==='+'?n(r)-n(a):n(a)-n(r)):(op==='+'?n(a)+n(b):n(a)-n(b));
}
const report=[];
for(const level of ['A1','A2','A3','A4','B1','B2','B3','B4'])for(const mode of ['keypad','choices']){
 console.log("Playing",level,mode);
 await start(level,mode);
 for(let i=0;i<10;i++){
  const correct=await solve();
  if(i===0 && level==='A1'){
   const before=await page.locator('#equation').innerText();const opts=await page.locator('[data-action=choice]').allTextContents();
   const wrong=mode==='choices'?Number(await page.locator(`[data-action=choice]:not([data-value="${correct}"])`).first().getAttribute('data-value')):(correct+1)%21;
   await answer(wrong,mode);expect(await page.locator('#equation').innerText()).toBe(before);
   await answer(wrong,mode);await expect(page.locator('.hint-card')).toBeVisible();
   expect(await page.locator('[data-action=choice]').allTextContents()).toEqual(opts);
   if(mode==='keypad')await page.screenshot({path:'test-results/tablet-hint.png'});
  }
  if(i===2 && level==='B3'){await click('hint');await expect(page.locator('.hint-card')).toBeVisible();}
  if(i===3 && level==='B4'){
   await click('pause');const before=await page.locator('#time-left').textContent();await page.clock.runFor(90000);
   expect(await page.locator('#time-left').textContent()).toBe(before);await expect(page.locator('.game-grid')).toHaveAttribute('inert','');await click('resume');
  }
  await answer(correct,mode);
 }
 if(!await page.locator('.results-screen').count()){console.log('Incomplete',await page.locator('.play-screen').innerText(),errors);await page.screenshot({path:'test-results/failure.png'});}
 await expect(page.locator('.results-screen h1')).toHaveText('成功抵達，你做到了！');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('space-math-v1')));const r=data.sessions.at(-1);
 expect(r.completedCount).toBe(10);expect(r.gameplay).toBe('mission');expect(r.questions.length).toBe(10);
 expect(r.firstTryCorrectCount).toBe(level==='A1'||level==='B3'?9:10);
 report.push(`${level} ${mode}: 10 題完成，獨立首次 ${r.firstTryCorrectCount}`);
 if(level==='A1'&&mode==='keypad'){
  await page.screenshot({path:'test-results/results.png'});await click('review');await page.clock.runFor(3200);await answer(await solve(),mode);
  await expect(page.locator('.results-screen')).toBeVisible();await expect(page.locator('[data-action=review]')).toHaveCount(0);
  await click('replay');await page.clock.runFor(3200);await answer(await solve(),mode);await expect(page.locator('.results-screen')).toBeVisible();
 }
 await click('home');
}
await start('A1','keypad','challenge');
for(let i=0;i<11;i++)await answer(await solve(),'keypad');
await expect(page.locator('.progress-note')).toContainText('已抵達 1 站');
await click('hint');await answer((await solve()+1)%21,'keypad');await page.clock.runFor(60000);
await expect(page.locator('.results-screen h1')).toHaveText('挑戰完成，做得好！');
const sessions=await page.evaluate(()=>JSON.parse(localStorage.getItem('space-math-v1')).sessions);
expect(sessions.at(-1).independentAccuracy).toBe(11/12);
await page.reload();await click('history');await page.locator('#history-gameplay').selectOption('review');
await expect(page.locator('.history-list article')).toHaveCount(2);await click('close');
for(const size of [{width:1024,height:768},{width:390,height:844},{width:320,height:740}]){
 await page.setViewportSize(size);await start('B4','keypad');await click('hint');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
 const keys=await page.locator('.keypad button').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
 expect(keys.every(k=>k.w>=48&&k.h>=48)).toBe(true);
 await page.screenshot({path:`test-results/layout-${size.width}.png`,fullPage:true});
 await click('hint-close');await expect(page.locator('.hint-card')).toHaveCount(0);
 await expect(page.locator('[data-action=hint]')).toHaveAttribute('aria-expanded','false');
 await page.screenshot({path:`test-results/answer-${size.width}.png`,fullPage:true});
 if(size.width===1024){const box=await page.locator('[data-action=submit]').boundingBox();expect(box.y+box.height).toBeLessThan(768);}
 await click('pause');await click('quit');
}
expect(errors).toEqual([]);
await writeFile('test-results/browser-report.json',JSON.stringify({report,sessions:sessions.length,errors},null,2));
console.log(JSON.stringify({missions:report.length,sessions:sessions.length,layouts:3,errors}));await browser.close();

