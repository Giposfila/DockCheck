const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { strict as assert } from 'node:assert';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try {
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});
 const page=await context.newPage();
 const errors=[],requests=[];
 page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
 page.on('pageerror',e=>errors.push(String(e)));
 const root=decodeURIComponent(new URL('../',import.meta.url).pathname).replace(/\/$/,'');
 const url=process.env.DOCKCHECK_URL ?? 'http://localhost:4173';
 await page.goto(url);
 // Existing current and legacy preferences must have no effect on the built-in checks.
 const stored={
  'dockcheck-work-profile-v2':JSON.stringify({schemaVersion:2,id:'custom',formatting:{fontSizePt:22}}),
  'dockcheck-sfu-requirements-v1':JSON.stringify({fontFamily:'Calibri',fontSizePt:22})
 };
 await page.evaluate(values=>{for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);},stored);
 async function load(kind) {
  await page.goto(url);
  assert.equal(await page.locator('#settingsButton, #settingsDrawer, #requirementsForm, #importProfile, #exportProfile').count(),0);
  await page.locator('#fileInput').setInputFiles(`${root}/tests/fixtures/${kind}.docx`);
  await page.locator('#reportSection').waitFor({state:'visible'});
  assert.match(await page.locator('#profileReport').textContent(),/Встроенные общие требования СТУ/);
 }
 for(const kind of ['correct','incorrect','partial','search','textbox']) {
  await load(kind);
  const pending=page.waitForEvent('download');
  await page.locator('#downloadJson').click();
  const download=await pending;
  await download.saveAs(`/tmp/dockcheck-${kind}-builtin.json`);
  const {report}=JSON.parse(await readFile(`/tmp/dockcheck-${kind}-builtin.json`,'utf8'));
  assert.equal(report.profile.id,'work');
  assert.equal(report.profile.formatting,undefined);
  assert.deepEqual(report.profile.localRequirements,[]);
  assert.ok(report.results.every(r=>r.origin!=='local'));
  assert.equal(await page.locator('.finding-card').count(),report.findings.length);
  assert.equal(await page.locator('[data-filter=manual], [data-filter=recommendations], #downloadDiagnostics, #groupCoverage').count(),0);
  assert.doesNotMatch(await page.locator('#reportSection').innerText(),/Проверить вручную|Не удалось проверить|не определено/);
  assert.ok(report.results.every(r=>r.status==='fail'&&r.origin==='standard'));
  assert.equal(report.manualChecks,undefined);
  assert.equal(report.coverage.unknown,0);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  await page.screenshot({path:`/tmp/dockcheck-${kind}-builtin-mobile.png`,fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  console.log(`PASS: ${kind}, built-in profile, report export, confirmed results only, mobile layout`);
 }
 const pending=page.waitForEvent('download');await page.locator('#downloadButton').click();
 const download=await pending;await download.saveAs('/tmp/dockcheck-builtin-report.txt');
 assert.match(await readFile('/tmp/dockcheck-builtin-report.txt','utf8'),/^ДОКЧЕК — ПРОВЕРКА ПО СТУ СФУ/);
 if(process.env.DOCKCHECK_DOCUMENT) {
  await page.goto(url);
  await page.locator('#fileInput').setInputFiles(process.env.DOCKCHECK_DOCUMENT);
  await page.locator('#reportSection').waitFor({state:'visible'});
  const count=Number(process.env.DOCKCHECK_EXPECTED_INDENTS??68);
  assert.ok(await page.locator('.finding-card').count()>=count);
  assert.equal((await page.locator('.finding-card h3').allTextContents()).filter(t=>/12\.7 мм вместо 12\.5 мм/.test(t)).length,count);
  assert.equal(await page.locator('#documentStructure [data-kind=section]').count(),3);
  assert.equal(await page.locator('#documentStructure [data-kind=subsection]').count(),17);
  for(const [button,path] of [['#downloadJson','/tmp/dockcheck-real-violations.json']]) {
   const pending=page.waitForEvent('download');await page.locator(button).click();
   await (await pending).saveAs(path);
  }
  const exported=JSON.parse(await readFile('/tmp/dockcheck-real-violations.json','utf8')).report;
  assert.equal(exported.results.filter(r=>r.ruleId==='stu.paragraph.indent').length,count);
  assert.ok(exported.results.every(r=>r.status==='fail'&&r.paragraphText));
  assert.equal(exported.results.filter(r=>r.ruleId==='stu.structural-heading.indent').length,1);
  assert.equal(exported.manualChecks,undefined);
  assert.ok(exported.results.every(r=>r.status==='fail'&&!r.ruleId.startsWith('stu.expert.')));
  assert.equal(await page.locator('[data-filter=manual], #downloadDiagnostics').count(),0);
  assert.doesNotMatch(await page.locator('#reportSection').innerText(),/Проверить вручную|Не удалось проверить|не определено/);
  const copy=page.locator('.copy-quote').first();await copy.click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),exported.results[0].paragraphText);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  await page.screenshot({path:'/tmp/dockcheck-real-document-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});
  console.log(`PASS: real document, ${count} indent violations, quote copying, confirmed-only export, mobile layout`);
 }
 assert.deepEqual(await page.evaluate(values=>Object.fromEntries(Object.keys(values).map(key=>[key,localStorage.getItem(key)])),stored),stored);
 await page.locator('#newFileButton').click();
 await page.locator('#uploadSection').waitFor({state:'visible'});
 assert.equal(await page.locator('#fileInput').inputValue(),'');
 await page.screenshot({path:'/tmp/dockcheck-builtin-desktop.png',fullPage:true});
 assert.ok(requests.every(r=>new URL(r.url).hostname===new URL(url).hostname&&r.method==='GET'));
 assert.deepEqual(errors,[]);
 console.log('PASS: saved templates ignored, text export, new file, no document upload requests or browser errors');
} finally {await browser.close();}
