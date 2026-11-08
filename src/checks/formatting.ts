import type { DocumentModel, DocumentLocation, ResolvedProperty } from '../analyzer/model';
import { displayValue } from '../report';
import { unknownPage, locationLabel } from '../analyzer/location';
import { unknown } from '../analyzer/model';
import type { CheckResult, Requirements, Category } from '../types';
// Quantization tolerances, not normative allowances: 1 twip ≈ .01764 mm,
// spacing auto uses 1/240 line; font sizes are stored in half-points.
export const TOLERANCE={fontPt:.01,mm:.02,line:1/240+1e-10};
export function checks(model: DocumentModel, req: Requirements): CheckResult[] {
 const results: CheckResult[]=[];
 let at:DocumentLocation|undefined, paragraphText:string|undefined, scopeUnknown=false;
 const test=(ruleId:string,title:string,location:string,property:ResolvedProperty|undefined,expected:unknown,predicate:(v:any)=>boolean,category:Category='text')=>{
  const observed=property ?? unknown();
  const p=scopeUnknown?{...observed,status:'unknown',reason:'Правило основного текста не применяется уверенно к этой роли. Уточните область применения в настройках профиля.'}:observed;
  const unit=p.unit ?? (ruleId==='text.size'?'pt':ruleId==='paragraph.indent'||ruleId.startsWith('section.')?'mm':ruleId==='paragraph.spacing'?'multiplier':undefined);
  const tolerance=ruleId==='text.size'?TOLERANCE.fontPt:ruleId==='paragraph.indent'||ruleId.startsWith('section.margin.')?TOLERANCE.mm:ruleId==='paragraph.spacing'?TOLERANCE.line:ruleId==='section.width'||ruleId==='section.height'?TOLERANCE.mm:undefined;
  results.push({scope:ruleId.startsWith('paragraph.')?'Основной текст':ruleId.startsWith('text.')?`Роли профиля: ${(req.textRoles ?? ['body']).join(', ')}`:category,tolerance,property:p.source?.property ?? ruleId,at:at ?? {part:'word/document.xml',area:'document',tablePath:[],page:unknownPage()},paragraphText,unit,ruleId,title,location,status:p.status!=='resolved'?'unknown':predicate(p.value)?'pass':'fail',severity:'warning',category,actual:p.value,expected,source:p.source,clause:'Настраиваемый профиль',explanation:(p.reason ?? 'Сравнение итогового свойства с профилем')+(tolerance===undefined?'':`; технический допуск ${tolerance} ${unit ?? ''}, на округление единиц OOXML, не нормативное разрешение отклонений`),recommendation:p.status!=='resolved'?'Проверьте это место в Word и уточните неизвестное свойство или область профиля.':`В Word найдите цитату (Ctrl+F), выделите указанный текст или объект и установите «${title}»: ${displayValue(expected,unit)}.`});
 };
 for(const p of model.paragraphs) {
  paragraphText=p.text;
  scopeUnknown=!(req.textRoles ?? ['body']).includes(p.role);
  for(const [i,r] of p.runs.entries()) if(r.text.trim()) {
   at=r.at;
   for(const span of r.fontRanges.length?r.fontRanges:[{start:r.at.range!.start,end:r.at.range!.end,property:r.properties.font}]) {
    at={...r.at,range:{start:span.start,end:span.end,unit:'utf16'}};
    test('text.font','Шрифт',`${p.location} → фрагмент ${i+1}`,span.property,req.fontFamily,v=>String(v).split(' / ').every(x=>x.toLowerCase()===req.fontFamily.toLowerCase()));
   }
   at=r.at;
   test('text.size','Размер шрифта',`${p.location} → фрагмент ${i+1}`,r.properties.fontSize,req.fontSizePt,v=>Math.abs(v-req.fontSizePt)<=TOLERANCE.fontPt);
   if(p.role==='heading') {scopeUnknown=false;test('heading.bold','Полужирное оформление заголовка',p.location,r.properties.bold,true,v=>v===true,'heading');scopeUnknown=!(req.textRoles ?? ['body']).includes(p.role);}
  }
  at=p.at;
  if(p.role==='list') {scopeUnknown=false;at={...p.at,range:undefined};paragraphText=undefined;test('list.number','Видимый номер и перезапуск списка',p.location,p.properties.visibleNumber,'Ручная проверка',()=>false,'structure');at=p.at;paragraphText=p.text;}
  if(!p.text.trim() || p.role!=='body') continue;
  if(req.requireJustified) test('paragraph.align','Выравнивание по ширине',p.location,p.properties.align,'both',v=>v==='both');
  const indent=p.properties.hanging?.status==='resolved' ? {...p.properties.hanging,value:-Number(p.properties.hanging.value)}:p.properties.firstLine;
  test('paragraph.indent','Абзацный отступ',p.location,indent,req.firstLineIndentMm,v=>Math.abs(v-req.firstLineIndentMm)<=TOLERANCE.mm);
  const line=p.properties.line; const mode=p.properties.lineRule?.value ?? 'auto';
  test('paragraph.spacing','Межстрочный интервал',p.location,mode==='auto'&&line?{...line,value:Number(line.value)/240,unit:'multiplier'}:unknown(`Интервал ${mode} в пунктах не сравним с множителем`),req.allowedLineSpacing,v=>req.allowedLineSpacing.some(x=>Math.abs(x-v)<=TOLERANCE.line));
 }
 scopeUnknown=false;at=undefined;paragraphText=undefined;
 model.sections.forEach((s,i)=>{
  const location=`Раздел ${i+1}`;
  at={part:'word/document.xml',area:'section',section:i+1,tablePath:[],page:unknownPage()};
  if(req.requireA4) {
   const landscape=s.properties.orientation?.value==='landscape';
   test('section.width','Ширина A4',location,s.properties.width,landscape?297:210,v=>Math.abs(v-(landscape?297:210))<=TOLERANCE.mm,'page');
   test('section.height','Высота A4',location,s.properties.height,landscape?210:297,v=>Math.abs(v-(landscape?210:297))<=TOLERANCE.mm,'page');
  }
  for(const [key,prop] of Object.entries({top:'top',bottom:'bottom',left:'marginLeft',right:'marginRight'})) {
   const property=s.properties.orientation?.value==='landscape'?unknown('Профиль задаёт поля вертикальной страницы; для альбомной страницы требование не установлено'):['left','right'].includes(key)&&s.properties.mirrorMargins.value===true?unknown('При зеркальных полях нужны отдельные требования к внутреннему и внешнему полю'):s.properties[prop];
   test(`section.margin.${key}`,`Поле ${{top:'сверху',bottom:'снизу',left:'слева',right:'справа'}[key]}`,location,property,req.portraitMarginsMm[key as keyof Requirements['portraitMarginsMm']],v=>Math.abs(v-req.portraitMarginsMm[key as keyof Requirements['portraitMarginsMm']])<=.7,'page');
  }
 });
 at=undefined;
 for(const obj of model.objects) {
  at=obj.at;
  if(!['tbl','drawing'].includes(obj.kind)) continue;
  const table=obj.kind==='tbl';
  const pattern=table?/^Таблица\s+[А-Я]?\d+(?:\.\d+)?\s+[–—-]\s+\S/u:/^Рисунок\s+[А-Я]?\d+(?:\.\d+)?\s+[–—-]\s+\S/u;
  const caption=obj.caption ?? '';
  const plausible=(table?/^Таблица\s+\S/u:/^Рисунок\s+\S/u).test(caption);
  const captionParagraph=plausible?model.paragraphs.find(p=>p.id===obj.captionParagraphId):undefined;
  paragraphText=captionParagraph?.text;at=captionParagraph?.at ?? obj.at;
  test(table?'table.caption':'figure.caption',table?'Подпись таблицы':'Подпись рисунка',captionParagraph?.location ?? obj.location,plausible?{value:caption,status:'resolved',source:null}:unknown('Подпись не найдена рядом с объектом; проверьте вручную'),table?'Таблица N – Наименование':'Рисунок N – Наименование',v=>pattern.test(v)&&!/[.]$/u.test(v),table?'table':'figure');
 }
 at=undefined;paragraphText=undefined;
 for(const region of model.unsupported) {at=region.at;test('document.region','Непроверенная область',locationLabel(region.at),unknown(region.reason),'Ручная проверка',()=>false,'structure');}
 at=undefined;
 for(const limitation of model.limitations) test('document.support','Ограничение анализа','Документ',unknown(limitation),'Ручная проверка',()=>false,'structure');
 test('document.pagination','Фактическая пагинация','Документ',unknown('Без движка вёрстки число страниц и необходимость содержания не определены'),'Ручная проверка',()=>false,'page');
 return results;
}
