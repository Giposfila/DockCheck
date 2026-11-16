import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { completePackage } from './helpers';
import { checkDocx } from '../src/checker';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const p=(text:string,pr='',rp='')=>`<w:p><w:pPr>${pr}</w:pPr><w:r><w:rPr>${rp}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
async function report(body:string,numbering?:string){
 const z=new JSZip();z.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`);
 z.file('word/styles.xml',`<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="28"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style><w:style w:type="paragraph" w:styleId="H"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>`);
 if(numbering)z.file('word/numbering.xml',`<w:numbering xmlns:w="${W}">${numbering}</w:numbering>`);
 return checkDocx(await completePackage(z).generateAsync({type:'uint8array'}));
}
it('recognizes standard element names, numbered divisions and their parents without requiring heading styles',async()=>{
 const r=await report(p('Министерство науки и высшего образования РФ')+p('ОТЧЕТ О ПРАКТИЧЕСКОЙ РАБОТЕ')+
  p('СОДЕРЖАНИЕ')+p('ВВЕДЕНИЕ\t3','<w:pStyle w:val="TOC1"/>')+
  p('ВВЕДЕНИЕ')+p('Текст введения.')+p('1 Основная часть')+p('1.1 Методы')+p('1.1.1 Подготовка')+
  p('1.1.1.1 Исходные данные')+p('2 Результаты')+p('ЗАКЛЮЧЕНИЕ')+p('СПИСОК ЛИТЕРАТУРЫ')+p('1. Книга. 2026.')+p('ПРИЛОЖЕНИЕ А'));
 const elements=r.document.structure!.elements;
 for(const kind of ['title','contents','introduction','body','conclusion','bibliography','appendix'])expect(elements.find(e=>e.kind===kind)?.confidence).toBe('confirmed');
 const divisions=elements.filter(e=>['section','subsection','point','subpoint'].includes(e.kind));
 expect(divisions.map(e=>[e.kind,e.label])).toEqual([['section','1'],['subsection','1.1'],['point','1.1.1'],['subpoint','1.1.1.1'],['section','2']]);
 expect(divisions[1].parentId).toBe(divisions[0].id);expect(divisions[2].parentId).toBe(divisions[1].id);
 expect(r.results.find(x=>x.ruleId==='stu.structure.title')).toMatchObject({status:'pass'});
 expect(r.results.find(x=>x.ruleId==='stu.structure.body')).toMatchObject({status:'pass'});
 expect(r.document.paragraphs.find(p=>p.text==='Текст введения.')?.roleEvidence?.confidence).toBe('confirmed');
});
it('keeps contents copies, automatic lists, bibliography and prose out of the heading tree',async()=>{
 const r=await report(p('СОДЕРЖАНИЕ')+p('1 Методы\t4')+p('1.1 Материалы .... 5')+
  p('ВВЕДЕНИЕ')+p('1. Перечисление')+p('1) Еще перечисление')+p('2026 Год выполнения')+p('1 Обычный текст.')+
  '<w:tbl><w:tr><w:tc>'+p('ЗАКЛЮЧЕНИЕ')+'</w:tc></w:tr></w:tbl>'+
  p('СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ')+p('1 Название книги'));
 expect(r.document.structure!.elements.filter(e=>['section','subsection'].includes(e.kind))).toEqual([]);
 expect(r.document.structure!.elements.filter(e=>e.kind==='conclusion')).toEqual([]);
 expect(r.document.structure!.elements.filter(e=>e.kind==='introduction')).toHaveLength(1);
});
it('checks structural heading formatting with exact text and run evidence',async()=>{
 const r=await report(p('введение','<w:jc w:val="left"/><w:ind w:firstLine="720"/>','<w:b w:val="0"/><w:u w:val="single"/>'));
 const rows=r.results.filter(x=>x.ruleId.startsWith('stu.structural-heading.'));
 for(const key of ['upper','bold','center','indent','underline'])expect(rows.find(x=>x.ruleId===`stu.structural-heading.${key}`)).toMatchObject({status:'fail',paragraphText:'введение',applicability:true});
 expect(rows.find(x=>x.ruleId.endsWith('.number'))?.status).toBe('pass');
 expect(rows.find(x=>x.ruleId.endsWith('.gap'))).toMatchObject({status:'unknown',reasonCode:'needs_layout'});
});
it('checks numbered headings and does not infer pagination from recognized structure',async()=>{
 const r=await report(p('1 методы.','<w:pStyle w:val="H"/>','<w:b w:val="0"/><w:u w:val="single"/>')+
  p('ЗАКЛЮЧЕНИЕ','<w:jc w:val="center"/><w:ind w:firstLine="0"/>','<w:b/>'));
 for(const key of ['capital','bold','no-final-period','no-underline'])expect(r.results.find(x=>x.ruleId===`stu.heading-style.${key}`)).toMatchObject({status:'fail',paragraphText:'1 методы.'});
 expect(r.results.find(x=>x.ruleId==='stu.heading.sections')).toMatchObject({status:'pass'});
 expect(r.results.find(x=>x.ruleId==='stu.structure.new-page')).toMatchObject({status:'unknown',reasonCode:'needs_layout'});
 expect(r.document.paragraphs.every(p=>p.at.page.status!=='confirmed')).toBe(true);
});
it('recognizes numbered structural headings and reports their numbering separately',async()=>{
 const r=await report(p('1 ВВЕДЕНИЕ','<w:pStyle w:val="H"/>'));
 expect(r.document.structure!.elements.find(e=>e.kind==='introduction')?.confidence).toBe('confirmed');
 expect(r.results.find(x=>x.ruleId==='stu.structural-heading.number')).toMatchObject({status:'fail'});
});
it('recognizes supported automatic heading numbers and flags numbering on structural headings',async()=>{
 const num='<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
 const pr='<w:pStyle w:val="H"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
 const r=await report(p('Методы',pr)+p('ВВЕДЕНИЕ',pr),num);
 expect(r.document.paragraphs[0].heading).toMatchObject({kind:'section',number:'1',title:'Методы'});
 expect(r.results.find(x=>x.ruleId==='stu.heading-style.after-number')).toMatchObject({status:'pass'});
 expect(r.results.find(x=>x.ruleId==='stu.structural-heading.number')).toMatchObject({status:'fail'});
});
it('locates only the incorrectly formatted run in a mixed structural heading',async()=>{
 const r=await report('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>ВВЕ</w:t></w:r><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>ДЕНИЕ</w:t></w:r></w:p>');
 const rows=r.results.filter(x=>x.ruleId==='stu.structural-heading.bold');
 expect(rows.map(x=>x.status)).toEqual(['pass','fail']);
 expect(rows[1].at?.range).toEqual({start:3,end:8,unit:'utf16'});
 expect(rows[1].paragraphText?.slice(3,8)).toBe('ДЕНИЕ');
});
it('distinguishes a missing validator from ambiguous classification once a structural element is recognized',async()=>{
 const r=await report(p('ВВЕДЕНИЕ'));
 expect(r.results.find(x=>x.ruleId==='stu.introduction-content.goal')).toMatchObject({applicability:true,status:'unknown',reasonCode:'unimplemented'});
});
it('reports a styled section number without a title as a missing heading',async()=>{
 const r=await report(p('1','<w:pStyle w:val="H"/>'));
 expect(r.document.paragraphs[0].heading).toMatchObject({kind:'section',number:'1',title:''});
 expect(r.results.find(x=>x.ruleId==='stu.heading.sections')).toMatchObject({status:'fail',actual:false,paragraphText:'1'});
});
it('does not replace malformed indentation or an unresolved style with a passing default',async()=>{
 const malformed=await report(p('ВВЕДЕНИЕ','<w:ind w:hanging="invalid"/>'));
 expect(malformed.results.find(x=>x.ruleId==='stu.structural-heading.indent')).toMatchObject({status:'unknown',reasonCode:'missing_fact'});
 const unresolved=await report(p('ВВЕДЕНИЕ','<w:pStyle w:val="Missing"/>'));
 for(const key of ['bold','indent','center','number'])expect(unresolved.results.find(x=>x.ruleId===`stu.structural-heading.${key}`)).toMatchObject({status:'unknown'});
});
