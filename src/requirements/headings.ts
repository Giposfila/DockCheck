import type { DocumentModel, Paragraph, ResolvedProperty, Run } from '../analyzer/model';
import type { CheckResult } from '../types';
import type { Rule } from './schema';
import { TOLERANCE } from '../checks/formatting';

function property(p:Paragraph,key:string,fallback?:string|number):ResolvedProperty {
 const value=p.properties[key];
 if(fallback!==undefined&&(!value||value.status==='unknown'&&value.source===null&&value.reason==='Свойство отсутствует или не разрешено'))
  return {value:fallback,status:'resolved',source:{part:p.at.part,property:`OOXML-default:${key}`},reason:'Значение по умолчанию при отсутствии свойства в разрешённом каскаде'};
 return value??{value:null,status:'unknown',source:null};
}
/** Dedicated predicates for identified headings. Layout and meaning remain separate checks. */
export function evaluateHeadings(rule:Rule,model:DocumentModel,base:CheckResult):CheckResult[]|undefined {
 const structural=rule.id.startsWith('stu.structural-heading.');
 const division=rule.id.startsWith('stu.heading-style.')||rule.id==='stu.heading.sections';
 if(!structural&&!division)return;
 const targets=model.paragraphs.filter(p=>p.heading&&(structural?p.heading.kind==='structural'&&p.heading.elementKind!=='body':
  rule.id==='stu.heading.sections'?['section','subsection'].includes(p.heading.kind):!['structural','appendix'].includes(p.heading.kind)));
 if(!targets.length)return [{...base,status:model.structure?.elements.length?'not_applicable':'unknown',applicability:model.structure?.elements.length?false:'unknown',reasonCode:model.structure?.elements.length?undefined:'missing_fact',explanation:'Подходящие заголовки в поддержанной структуре не обнаружены'}];
 const key=rule.id.split('.').at(-1)!;
 return targets.flatMap(p=>{
  const emit=(actual:unknown,expected:unknown,verdict:boolean|'unknown',prop:string,source:CheckResult['source'],run?:Run,code:CheckResult['reasonCode']='missing_fact',explanation='Сравнение свойства распознанного заголовка с требованием СТУ',unit?:string):CheckResult=>({
   ...base,at:run?.at??p.at,paragraphText:p.text,location:p.location,applicability:true,
   status:verdict==='unknown'?'unknown':verdict?'pass':'fail',reasonCode:verdict==='unknown'?code:undefined,
   actual,expected,property:prop,source,unit:unit??rule.assertion.unit,
   tolerance:unit==='mm'?TOLERANCE.mm:undefined,explanation,
   scope:structural?'Заголовок структурного элемента':p.heading!.kind,
   recommendation:verdict==='unknown'?base.recommendation:`В Word найдите указанный заголовок и исправьте «${rule.title}» по п. ${rule.source.clause}.`,
   evidence:[{kind:'classification',detail:p.heading!.basis.join('; ')},{kind:'ooxml',detail:`${prop}: ${String(actual)}`,source}]
  });
  const textSource={part:p.at.part,property:'paragraph.text'};
  if(key==='bold'||key==='underline'||key==='no-underline'){
   const runs=p.runs.filter(r=>r.text.trim());
   if(!runs.length)return [emit(null,rule.assertion.value,'unknown',key,null)];
   return runs.map(run=>{
    const bold=key==='bold',prop=run.properties[bold?'bold':'underline'];
    const actual=bold?prop?.value:prop?.value===null||prop?.value===undefined?null:!['none','0','false'].includes(String(prop.value));
    const expected=bold;
    return emit(actual,expected,prop?.status==='resolved'?actual===expected:'unknown',bold?'bold':'underline',prop?.source??null,run);
   });
  }
  if(structural&&key==='upper'){
   const title=p.heading!.title;
   return [emit(title,title.toLocaleUpperCase('ru-RU'),title===title.toLocaleUpperCase('ru-RU'),'paragraph.text',textSource)];
  }
  if(structural&&key==='number'){
   const automatic=p.properties.numId?.status==='resolved'&&p.properties.numId.value!=='0';
   const uncertain=!p.heading!.number&&!automatic&&[p.properties.numId,p.properties.firstLine].some(v=>v?.status==='unsupported'||v?.status==='unknown'&&v.source!==null);
   return [emit(uncertain?null:!!p.heading!.number||automatic,false,uncertain?'unknown':!p.heading!.number&&!automatic,'heading.number',automatic?p.properties.numId.source:textSource)];
  }
  if(structural&&(key==='indent'||key==='center')){
   const hanging=p.properties.hanging;
   const hasHanging=hanging&&(hanging.status==='resolved'||hanging.source!==null||hanging.status==='unsupported');
   const prop=key==='center'?property(p,'align','left'):hasHanging?{...hanging,value:hanging.status==='resolved'?-Number(hanging.value):null}:property(p,'firstLine',0);
   const expected=key==='center'?'center':0;
   const ok=key==='center'?prop.value==='center':Math.abs(Number(prop.value))<=TOLERANCE.mm;
   return [emit(prop.value,expected,prop.status==='resolved'?ok:'unknown',key==='center'?'align':'firstLine',prop.source,undefined,'missing_fact',prop.reason??'Сверка итогового свойства заголовка',key==='indent'?'mm':undefined)];
  }
  if(rule.id==='stu.heading.sections')return [emit(!!p.heading!.title.trim(),true,!!p.heading!.title.trim(),'heading.title',textSource)];
  if(!structural&&key==='after-number')return [emit(p.heading!.number??null,'Номер перед названием',p.heading!.number?true:p.properties.numId?.status==='resolved'?'unknown':false,'heading.number',textSource)];
  if(!structural&&key==='capital'){
   const letter=p.heading!.title.match(/\p{L}/u)?.[0];
   return [emit(letter??null,'Прописная первая буква',letter?letter===letter.toLocaleUpperCase('ru-RU'):'unknown','paragraph.text',textSource)];
  }
  if(!structural&&key==='no-final-period')return [emit(p.heading!.title,'Без точки в конце',!/[.]$/u.test(p.heading!.title),'paragraph.text',textSource)];
  const layout=key==='gap';
  return [emit(null,base.expected,'unknown',rule.property,null,undefined,layout?'needs_layout':'unimplemented',layout?'Заголовок распознан; расстояние до текста требует подтверждённой вёрстки':'Заголовок распознан; предикат этого свойства ещё не реализован')];
 });
}
