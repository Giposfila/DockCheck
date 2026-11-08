import { completePackage } from './helpers';
import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { checkDocx, DEFAULT_REQUIREMENTS } from '../src/checker';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const run=(text:string,size=24)=>`<w:r><w:rPr><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
async function check(body:string) {
 const zip=new JSZip();zip.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`);
 return checkDocx(await completePackage(zip).generateAsync({type:'uint8array'}),{...DEFAULT_REQUIREMENTS,requirePageNumbers:false,requiredSections:[]});
}
it('uses original UTF16 offsets for identical fragments and Unicode whitespace',async()=>{
 const r=await check(`<w:p>${run('😀 Текст',28)}<w:hyperlink>${run(' Текст')}</w:hyperlink>${run(' Текст')}<w:r><w:tab/><w:br/></w:r></w:p>`);
 const findings=r.findings.filter(f=>f.id.startsWith('text.size'));
 expect(findings.map(f=>f.at?.range)).toEqual([{start:8,end:14,unit:'utf16'},{start:14,end:20,unit:'utf16'}]);
 expect(findings.map(f=>f.excerpt)).toEqual([' Текст',' Текст']);
 expect(findings[0].at?.fragmentId).not.toBe(findings[1].at?.fragmentId);
 expect(r.document.paragraphs[0].text).toBe('😀 Текст Текст Текст\t\n');
 const align=r.results.find(x=>x.ruleId==='paragraph.align')!;
 expect(align.at?.range).toEqual({start:0,end:22,unit:'utf16'});
});
it('preserves nested table path and independent paragraph ordinals',async()=>{
 const r=await check(`<w:p>${run('Body')}</w:p><w:tbl><w:tr><w:tc><w:p>${run('Cell')}</w:p><w:tbl><w:tr><w:tc><w:p>${run('Nested')}</w:p></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl><w:p>${run('Body')}</w:p>`);
 expect(r.document.paragraphs.map(p=>p.at.paragraphNumber)).toEqual([1,1,1,2]);
 expect(r.document.paragraphs[2].at.tablePath).toEqual([{table:1,row:1,cell:1},{table:2,row:1,cell:1}]);
});
it('retains a separate text box story without duplicating its text',async()=>{
 const r=await check(`<w:p>${run('Outer')}<w:r><w:txbxContent><w:p>${run('Inside')}</w:p></w:txbxContent></w:r></w:p>`);
 expect(r.document.paragraphs.map(p=>p.text)).toEqual(['Outer','Inside']);
 expect(r.document.paragraphs[1].at).toMatchObject({area:'textbox',storyId:'блок 1',paragraphNumber:1});
});
it('never invents pages without cached data or after the last marker',async()=>{
 const r=await check(`<w:p>${run('Before')}<w:r><w:lastRenderedPageBreak/><w:t>Middle</w:t><w:lastRenderedPageBreak/><w:t>After</w:t></w:r></w:p>`);
 const runs=r.document.paragraphs[0].runs.filter(r=>r.text);
 expect(runs.map(r=>r.at.page.status)).toEqual(['unknown','saved','unknown']);
 expect(runs[1].at.page).toMatchObject({physical:2,source:'lastRenderedPageBreak'});
 expect(r.document.paragraphs[0].at.page.status).toBe('unknown');
 expect((await check(`<w:p>${run('No markers')}</w:p>`)).document.paragraphs[0].at.page.status).toBe('unknown');
});
it('does not double count explicit breaks and refuses section restart precision',async()=>{
 for(const extra of ['<w:r><w:br w:type="page"/></w:r>','<w:pPr><w:pageBreakBefore/></w:pPr>','<w:pPr><w:sectPr/></w:pPr>']) {
 const r=await check(`<w:p>${extra}<w:r><w:lastRenderedPageBreak/><w:t>X</w:t><w:lastRenderedPageBreak/></w:r></w:p><w:sectPr><w:pgNumType w:start="1"/></w:sectPr>`);
 expect(r.document.paragraphs.flatMap(p=>p.runs).every(r=>r.at.page.status==='unknown')).toBe(true);
 }
});

it('keeps every result and quote in groups and export regardless of card count',async()=>{
 const {groupResults,exportReport}=await import('../src/report');
 const r=await check(`<w:p>${run('Repeat')}${run('Repeat')}</w:p>`);
 const groups=groupResults(r.results);
 expect([...groups.values()].flat()).toHaveLength(r.results.length);
 expect([...groups.values()].find(g=>g[0].ruleId==='text.size')).toHaveLength(2);
 expect(Object.values(r.coverage).reduce((a,b)=>a+b,0)).toBe(r.results.length);
 const output=exportReport(r);
 expect(output).toContain('"start":6,"end":12,"unit":"utf16"');
 expect(output).toContain('Цитата: "Repeat"');expect(output).toContain('Страница не определена');
});
it('preserves all search locations in complete DOCX fixtures',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const file of ['search','textbox']) {
  const r=await checkDocx(await readFile(new URL(`./fixtures/${file}.docx`,import.meta.url)),{...DEFAULT_REQUIREMENTS,requirePageNumbers:false,requiredSections:[]});
  expect(r.results.every(r=>r.at?.part&&r.at.page)).toBe(true);
  for(const f of r.findings) if(f.excerpt!==undefined)expect(f.excerpt).toBe(f.paragraphText!.slice(f.at!.range!.start,f.at!.range!.end));
  if(file==='search')expect(r.findings).toHaveLength(3);
  else {expect(r.document.paragraphs.some(p=>p.at.area==='textbox')).toBe(true);expect(r.findings).toHaveLength(0);}
 }
});
it('does not count both MC Choice and Fallback text boxes',async()=>{
 const r=await check(`<w:p><w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="w"><w:txbxContent><w:p>${run('Repeat')}</w:p></w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent><w:p>${run('Repeat')}</w:p></w:txbxContent></mc:Fallback></mc:AlternateContent></w:r></w:p>`);
 expect(r.document.paragraphs.map(p=>p.text)).toEqual(['']);
 expect(r.results.some(r=>r.ruleId==='document.region'&&r.status==='unknown')).toBe(true);
});
