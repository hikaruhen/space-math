import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'});
const context=await browser.newContext({viewport:{width:1024,height:768},acceptDownloads:true});
const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://127.0.0.1:5175');await p.evaluate(()=>navigator.serviceWorker.ready);
await p.reload();await expect(p.locator('#offline-status')).toHaveText('已可離線遊玩');
await p.locator('[data-level=A1]').click();await p.locator('#nickname').fill('離線測試');await p.locator('#player-form button[type=submit]').click();
await p.locator('[data-gameplay=challenge]').click();await p.locator('[data-mode=keypad]').click();await p.locator('[data-action=start]').click();
await expect(p.locator('#equation')).toContainText('=',{timeout:6000});
for(let i=0;i<3;i++){
 const ns=(await p.locator('#equation>span').allTextContents());const a=Number(ns[0]),b=Number(ns[2]);
 await p.keyboard.type(String(a+b));await p.keyboard.press('Enter');await p.waitForTimeout(220);
}
console.log('Real-time 60-second challenge running');
await expect(p.locator('.results-screen h1')).toHaveText('挑戰完成，做得好！',{timeout:65000});
await p.locator('[data-action=settings]').click();
const download=p.waitForEvent('download');await p.locator('[data-action=backup]').click();await (await download).saveAs('test-results/backup-v2.json');
await p.locator('[data-action=close]').click();await context.setOffline(true);await p.reload();
await expect(p.locator('[data-level=A1]')).toContainText('已探索 1 趟');
await p.locator('[data-level=B4]').click();await p.locator('[data-gameplay=mission]').click();await p.locator('[data-action=start]').click();
await expect(p.locator('#equation')).toContainText('=',{timeout:6000});await p.locator('[data-action=hint]').click();await expect(p.locator('.hint-card')).toBeVisible();
await p.screenshot({path:'test-results/offline-production.png'});
const imported=await browser.newContext();const q=await imported.newPage();await q.goto('http://127.0.0.1:5175');
await q.locator('[data-action=settings]').click();await q.locator('#import-file').setInputFiles('test-results/backup-v2.json');await expect(q.locator('.modal')).toContainText('1 位玩家、1 趟探險');
await q.locator('[data-action=confirm-import]').click();await expect(q.locator('[data-level=A1]')).toContainText('已探索 1 趟');
await q.reload();await expect(q.locator('.player-button')).toContainText('離線測試');
expect(errors).toEqual([]);
await writeFile('test-results/production-report.json',JSON.stringify({realTimeChallenge:true,offlineReload:true,offlineHint:true,backupUiRoundTrip:true,errors},null,2));
console.log('Production: real-time challenge, offline reload/hints, downloaded backup import passed');await browser.close();

