import type { DocumentModel, ResolvedProperty } from '../analyzer/model';
import { unknown } from '../analyzer/model';
import type { CheckResult, Requirements, Category } from '../types';
export function checks(model: DocumentModel, req: Requirements): CheckResult[] {
 const results: CheckResult[]=[];
 const test=(ruleId:string,title:string,location:string,property:ResolvedProperty|undefined,expected:unknown,predicate:(v:any)=>boolean,category:Category='text')=>{
  const p=property ?? unknown();
  results.push({ruleId,title,location,status:p.status!=='resolved'?'unknown':predicate(p.value)?'pass':'fail',severity:'warning',category,actual:p.value,expected,source:p.source,clause:'Настраиваемый профиль',explanation:p.reason ?? 'Сравнение итогового свойства с профилем',recommendation:`Установите «${title}»: ${JSON.stringify(expected)}`});
 };
 for(const p of model.paragraphs) {
  for(const [i,r] of p.runs.entries()) if(r.text.trim() || r.pageField) {
   test('text.font','Шрифт отличается от шаблона',`${p.location} → фрагмент ${i+1}`,r.properties.font,req.fontFamily,v=>String(v).split(' / ').every(x=>x.toLowerCase()===req.fontFamily.toLowerCase()));
   test('text.size','Размер шрифта отличается от шаблона',`${p.location} → фрагмент ${i+1}`,r.properties.fontSize,req.fontSizePt,v=>Math.abs(v-req.fontSizePt)<=.1);
   if(p.role==='heading') test('heading.bold','Полужирное оформление заголовка',p.location,r.properties.bold,true,v=>v===true,'heading');
  }
  if(!p.text.trim() || p.role!=='body') continue;
  if(req.requireJustified) test('paragraph.align','Выравнивание по ширине',p.location,p.properties.align,'both',v=>v==='both');
  const indent=p.properties.hanging?.status==='resolved' ? {...p.properties.hanging,value:-Number(p.properties.hanging.value)}:p.properties.firstLine;
  test('paragraph.indent','Абзацный отступ',p.location,indent,req.firstLineIndentMm,v=>Math.abs(v-req.firstLineIndentMm)<=.7);
  const line=p.properties.line; const mode=p.properties.lineRule?.value ?? 'auto';
  test('paragraph.spacing','Межстрочный интервал',p.location,mode==='auto'&&line?{...line,value:Number(line.value)/240,unit:'multiplier'}:unknown(`Интервал ${mode} в пунктах не сравним с множителем`),req.allowedLineSpacing,v=>req.allowedLineSpacing.some(x=>Math.abs(x-v)<.06));
 }
 model.sections.forEach((s,i)=>{
  const location=`Раздел ${i+1}`;
  if(req.requireA4) {
   const landscape=s.properties.orientation?.value==='landscape';
   test('section.width','Ширина A4',location,s.properties.width,landscape?297:210,v=>Math.abs(v-(landscape?297:210))<1.6,'page');
   test('section.height','Высота A4',location,s.properties.height,landscape?210:297,v=>Math.abs(v-(landscape?210:297))<1.6,'page');
  }
  for(const [key,prop] of Object.entries({top:'top',bottom:'bottom',left:'marginLeft',right:'marginRight'})) test(`section.margin.${key}`,`Поле ${key}`,location,s.properties[prop],req.portraitMarginsMm[key as keyof Requirements['portraitMarginsMm']],v=>Math.abs(v-req.portraitMarginsMm[key as keyof Requirements['portraitMarginsMm']])<=.7,'page');
 });
 for(const obj of model.objects) {
  if(!['tbl','drawing'].includes(obj.kind)) continue;
  const table=obj.kind==='tbl';
  const pattern=table?/^Таблица\s+[А-Я]?\d+(?:\.\d+)?\s+[–—-]\s+\S/u:/^Рисунок\s+[А-Я]?\d+(?:\.\d+)?\s+[–—-]\s+\S/u;
  const caption=obj.caption ?? '';
  test(table?'table.caption':'figure.caption',table?'Подпись таблицы':'Подпись рисунка',obj.location,caption?{value:caption,status:'resolved',source:null}:unknown('Подпись не найдена рядом с объектом; проверьте вручную'),table?'Таблица N – Наименование':'Рисунок N – Наименование',v=>pattern.test(v)&&!/[.]$/u.test(v),table?'table':'figure');
 }
 for(const limitation of model.limitations) test('document.support','Ограничение анализа','Документ',unknown(limitation),'Ручная проверка',()=>false,'structure');
 test('document.pagination','Фактическая пагинация','Документ',unknown('Без движка вёрстки число страниц и необходимость содержания не определены'),'Ручная проверка',()=>false,'page');
 return results;
}
