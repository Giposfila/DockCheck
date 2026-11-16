import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { completePackage } from './helpers';
import { checkDocx } from '../src/checker';
import { exportReportJson } from '../src/report';

const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const wrap=(tag:string,xml:string)=>`<w:${tag} xmlns:w="${W}">${xml}</w:${tag}>`;
const p=(text:string,pr='')=>`<w:p><w:pPr>${pr}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const style=(id:string)=>`<w:pStyle w:val="${id}"/>`;
async function document(body:string,extraStyles='',numbering='') {
 const zip=new JSZip();
 zip.file('word/document.xml',wrap('document',`<w:body>${body}</w:body>`));
 zip.file('word/styles.xml',wrap('styles',`<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="28"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:jc w:val="both"/><w:spacing w:line="360"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="N"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="H"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>${extraStyles}`));
 if(numbering)zip.file('word/numbering.xml',wrap('numbering',numbering));
 return checkDocx(await completePackage(zip).generateAsync({type:'uint8array'}));
}
it('finds the wrong indent in body prose without applying body rules to title, contents or references',async()=>{
 const report=await document(
  p('Министерство науки и высшего образования РФ','<w:jc w:val="center"/><w:spacing w:line="276"/>')+
  p('СОДЕРЖАНИЕ','<w:jc w:val="center"/>')+
  p('ВВЕДЕНИЕ\t3',style('T'))+
  p('ВВЕДЕНИЕ',style('H'))+
  p('Цель работы — разработать систему.', '<w:ind w:firstLine="720"/>')+
  p('Оформление правильного абзаца.', '<w:ind w:firstLine="709"/>')+
  p('СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ',style('H'))+
  p('Описание источника.', '<w:ind w:firstLine="0"/>'),
  '<w:style w:type="paragraph" w:styleId="T"><w:name w:val="toc 1"/></w:style>');
 expect(report.findings.filter(f=>f.category==='text').map(f=>f.paragraphText)).toEqual(['Цель работы — разработать систему.']);
 expect(report.results.find(r=>r.ruleId==='stu.paragraph.indent'&&r.paragraphText==='Оформление правильного абзаца.')).toMatchObject({status:'pass'});
 expect(report.findings.find(f=>f.category==='text')).toMatchObject({actual:'12.7 мм',expected:'12.5 мм',excerpt:'Цель работы — разработать систему.'});
 expect(report.findings.find(f=>f.category==='text')!.recommendation).toContain('12.5 мм');
 const full=JSON.parse(exportReportJson(report,{diagnostics:true})).report;
 expect(full.results).toEqual(report.results);
 expect(full.manualChecks.length).toBeGreaterThan(0);
 expect(JSON.parse(exportReportJson(report)).report.results.filter((r:any)=>r.category==='text')).toHaveLength(1);
});
it('does not call computed decimal list numbers violations and preserves their evidence',async()=>{
 const num='<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
 const pr='<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
 const report=await document(p('1 Основная часть',style('H'))+p('Первый пункт',pr)+p('Второй пункт',pr), '',num);
 expect(report.findings.filter(f=>f.category==='text')).toEqual([]);
 expect(report.results.filter(r=>r.ruleId==='list.number').map(r=>({status:r.status,actual:r.actual}))).toEqual([{status:'unknown',actual:'1.'},{status:'unknown',actual:'2.'}]);
});
it('checks body text after a standard structural heading without a heading style',async()=>{
 const report=await document(p('ВВЕДЕНИЕ')+p('Неподтверждённая область.', '<w:ind w:firstLine="720"/>'));
 expect(report.findings.filter(f=>f.category==='text')).toHaveLength(1);
 expect(report.results.find(r=>r.ruleId==='stu.paragraph.indent'&&r.paragraphText==='Неподтверждённая область.')).toMatchObject({status:'fail',applicability:true});
});
it('excludes inherited TOC styles and keeps table and caption text out of body checks',async()=>{
 const report=await document(p('1 Основная часть',style('H'))+
  p('Запись содержания\t2',style('CustomToc'))+
  '<w:tbl><w:tr><w:tc>'+p('Ячейка','<w:ind w:firstLine="0"/>')+'</w:tc></w:tr></w:tbl>'+
  p('Рисунок 1 – Схема',style('C'))+
  p('Обычный текст.', '<w:ind w:firstLine="720"/>'),
  '<w:style w:type="paragraph" w:styleId="T"><w:name w:val="TOC 1"/></w:style><w:style w:type="paragraph" w:styleId="CustomToc"><w:basedOn w:val="T"/></w:style><w:style w:type="paragraph" w:styleId="C"><w:name w:val="Caption"/></w:style>');
 expect(report.findings.filter(f=>f.category==='text').map(f=>f.paragraphText)).toEqual(['Обычный текст.']);
 expect(report.document.paragraphs.find(p=>p.text.startsWith('Запись'))?.role).toBe('contents');
});
it('excludes a multi-paragraph TOC field even without TOC styles',async()=>{
 const report=await document(p('1 Основная часть',style('H'))+
  '<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText> TO</w:instrText><w:instrText>C \\o "1-3" </w:instrText><w:fldChar w:fldCharType="separate"/><w:t>Первая запись</w:t></w:r></w:p>'+
  p('Вторая запись','<w:ind w:firstLine="0"/>')+
  '<w:p><w:r><w:t>Последняя запись</w:t><w:fldChar w:fldCharType="end"/></w:r></w:p>'+
  p('2 Продолжение',style('H'))+p('Текст после содержания.','<w:ind w:firstLine="720"/>'));
 expect(report.findings.filter(f=>f.category==='text').map(f=>f.paragraphText)).toEqual(['Текст после содержания.']);
 expect(report.document.paragraphs.slice(1,4).every(p=>p.role==='contents')).toBe(true);
});
it('accepts only unit rounding and keeps real indent deviations',async()=>{
 const report=await document(p('1 Основная часть',style('H'))+
  [708,709,720,721].map(twips=>p(`Отступ ${twips}.`,`<w:ind w:firstLine="${twips}"/>`)).join(''));
 expect(report.results.filter(r=>r.ruleId==='stu.paragraph.indent').map(r=>r.status)).toEqual(['pass','pass','fail','fail']);
 expect(report.findings.filter(f=>f.category==='text').map(f=>f.actual)).toEqual(['12.7 мм','12.718 мм']);
});
