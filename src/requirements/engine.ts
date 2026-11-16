import { evaluateHeadings } from './headings';
import { GENERAL_RULES } from './general';
import type { DocumentModel } from '../analyzer/model';
import { unknownPage } from '../analyzer/location';
import type { CheckResult } from '../types';
import { CATALOG, TITLE_FORMS, RULE_SUPPORT } from './catalog';
import { evaluate } from './schema';
import type { Assertion, Rule, Truth } from './schema';
import type { WorkProfile } from './profile';
import { TOLERANCE } from '../checks/formatting';
export interface RuleImplementation {ruleId:string;capabilities:string[];state:'automatic'|'partial'|'unimplemented'}
const bridges:Record<string,string>={'text.font':'stu.text.font','text.size':'stu.text.size','paragraph.indent':'stu.paragraph.indent','paragraph.spacing':'stu.paragraph.spacing','paragraph.align':'stu.paragraph.align'};
export const IMPLEMENTATIONS:RuleImplementation[]=GENERAL_RULES.map(r=>({ruleId:r.id,capabilities:r.evidence,state:RULE_SUPPORT[r.id]}));
export function profileFacts(profile:WorkProfile,model:DocumentModel):Record<string,unknown>{
 const facts:Record<string,unknown>={...profile,execution:profile.execution??(profile.medium==='handwritten'?'handwritten':undefined),medium:profile.medium==='handwritten'?undefined:profile.medium,titleForm:profile.workKind?TITLE_FORMS[profile.workKind]:undefined};
 for(const [key,value] of Object.entries(profile.numbering))facts[`numbering.${key}`]=value;
 for(const [key,value] of Object.entries(profile.artifacts))facts[`has.${key}`]=value;
 for(const [key,count] of [['tables',model.tables],['images',model.images],['formulas',model.objects.filter(o=>o.kind==='formula').length],['lists',model.paragraphs.filter(p=>p.role==='list').length],['headings',model.paragraphs.filter(p=>p.role==='heading').length]] as const)facts[`has.${key}`]=count>0?true:model.unsupported.length?undefined:false;
 if(profile.workKind&&['master','diploma-project','diploma-work','bachelor'].includes(profile.workKind)&&profile.approvalVariant==='combined')facts.titleForm='Ж';
 if(profile.approvalVariant==='separate')facts.approvalForm='Е';
 // Confirmed recognized elements establish presence; absence is not inferred from candidates.
 for(const kind of ['introduction','conclusion','contents','abbreviations','bibliography','appendices','citations','citation-inline','citation-footnote','citation-list','handwritten-formulas','embedded-drawings'])facts[`has.${kind}`]=undefined;
 for(const kind of ['introduction','conclusion','contents','abbreviations','bibliography','appendices'])if(model.structure?.elements.some(e=>e.confidence==='confirmed'&&e.kind===(kind==='appendices'?'appendix':kind)))facts[`has.${kind}`]=true;
 if(model.structure?.elements.some(e=>e.confidence==='confirmed'&&e.kind==='body'))facts.pointsWithSubpoints=new Set(model.structure.elements.filter(e=>e.kind==='subpoint'&&e.parentId).map(e=>e.parentId)).size;
 for(const [kind,artifactKind] of [['drawings','drawing'],['posters','poster'],['slides','slides'],['separateAppendices','appendix']] as const)if(profile.artifactManifest?.some(a=>a.kind===artifactKind))facts[`has.${kind}`]=true;
 if(profile.artifactManifest?.some(a=>a.kind==='appendix'))facts['has.appendices']=true;
 return facts;
}
export function applicability(rule:Rule,facts:Record<string,unknown>):Truth {
 const condition=evaluate(rule.when,facts);const exceptions=rule.exceptions.map(e=>evaluate(e,facts));
 if(condition===false||exceptions.includes(true))return false;
 if(condition==='unknown'||exceptions.includes('unknown'))return 'unknown';return true;
}
export function predicate(a:Assertion,actual:unknown,tolerance=0):boolean|'unknown'{
 if(actual===undefined||actual===null)return 'unknown';
 switch(a.op){case 'eq':return typeof a.value==='number'&&typeof actual==='number'?Math.abs(actual-a.value)<=tolerance:actual===a.value;
 case 'oneOf':return (a.value as (string|number|boolean)[]).some(v=>typeof v==='number'&&typeof actual==='number'?Math.abs(actual-v)<=tolerance:v===actual);
 case 'range':return typeof actual==='number'&&actual>=Number((a.value as number[])[0])-tolerance&&actual<=Number((a.value as number[])[1])+tolerance;
 case 'min':return typeof actual==='number'&&actual>=Number(a.value)-tolerance;case 'max':return typeof actual==='number'&&actual<=Number(a.value)+tolerance;
 // Relations and patterns require dedicated validators. Imported data is never executed.
 default:return 'unknown';}
}
function reason(rule:Rule):CheckResult['reasonCode'] {return rule.evidence.includes('external-artifact')?'external_artifact':rule.evidence.includes('layout')?'needs_layout':rule.evidence.includes('external-standard')?'external_standard':'unimplemented';}
const reasons:Record<NonNullable<CheckResult['reasonCode']>,string>={unknown_context:'Неизвестен контекст применения правила',ambiguous_role:'Структурная роль или связь не подтверждена; совпадение строки недостаточно',missing_fact:'Не найден достоверный факт документа',unsupported:'Конструкция не поддержана',needs_layout:'Нужна подтверждённая вёрстка с картой исходных объектов; сохранённые разрывы не доказывают пагинацию',external_standard:'Полный текст внешнего стандарта и нормативный модуль отсутствуют',external_artifact:'Нужен отдельный артефакт или подтверждение процедуры; один DOCX не даёт доказательств',unimplemented:'Предикат нормы ещё не реализован'};
function result(rule:Rule,profile:WorkProfile,facts:Record<string,unknown>):CheckResult{
 const applies=applicability(rule,facts);const code=applies==='unknown'?'unknown_context':reason(rule);
 return {ruleId:rule.id,title:rule.title,status:applies==='unknown'?'unknown':applies===false||rule.modality==='permission'?'not_applicable':'unknown',severity:'warning',category:rule.category,location:'Документ / комплект работы',at:{part:'word/document.xml',area:'document',tablePath:[],page:unknownPage()},actual:null,expected:rule.assertion.value,unit:rule.assertion.unit,source:null,normSource:rule.source,clause:`${rule.source.edition}, ${rule.source.clause}, PDF ${rule.source.pdfPage}`,modality:rule.modality,profileVersion:`${profile.id}@${profile.version}`,origin:'standard',applicability:applies,reasonCode:applies==='unknown'?'unknown_context':applies===false||rule.modality==='permission'?undefined:code,evidence:[],explanation:applies==='unknown'?reasons.unknown_context:applies===false?'Неприменимость установлена по контексту':rule.modality==='permission'?'Допустимый вариант; наличие конструкции не требуется':reasons[code!],recommendation:rule.recommendation};
}
/** Catalog evaluation consumes only the resolved model. Never accesses ZIP or XML. */
export function evaluateRequirements(model:DocumentModel,profile:WorkProfile,formatting:CheckResult[], rules:readonly Rule[]=GENERAL_RULES):CheckResult[]{
 const facts=profileFacts(profile,model),results:CheckResult[]=[];
 for(const rule of rules){
  const base=result(rule,profile,facts);
  const headings=evaluateHeadings(rule,model,base);
  if(headings){results.push(...headings);continue;}
  if(rule.id==='stu.structure.title'||rule.id==='stu.structure.body'){
   const kind=rule.id.endsWith('.title')?'title':'body';
   const element=model.structure?.elements.find(e=>e.kind===kind&&e.confidence==='confirmed');
   if(element){const p=model.paragraphs.find(p=>p.id===element.paragraphIds[0]);results.push({...base,status:'pass',applicability:true,actual:true,reasonCode:undefined,at:element.at,paragraphText:p?.text,location:p?.location??base.location,evidence:[{kind:'classification',detail:element.evidence.join('; ')}],explanation:'Элемент распознан по документу; наличие не подтверждает полноту содержания или правильность реквизитов'});continue;}
   base.reasonCode='missing_fact';base.explanation=kind==='title'?'Титульный блок не распознан по доступным признакам; отсутствие не доказано':'Область основной части не распознана; отсутствие не доказано';
  }
  if(rule.target==='artifact'){
   const sheetRules=rule.id.startsWith('stu.stamp.')||rule.id.startsWith('stu.fold.')||rule.id==='stu.appendix.format-eligibility';
   if(sheetRules){
    const contexts=(profile.artifactManifest??[]).flatMap(a=>a.sheets?.length?a.sheets.map(sheet=>({artifact:a,sheet})):[]);
    if(contexts.length){for(const {artifact,sheet} of contexts){const objectFacts={...facts,...sheet,artifactKind:artifact.kind,medium:sheet.medium??artifact.medium,execution:sheet.execution??artifact.execution};const candidate=result({...rule,when:{op:'all',args:[rule.when,rule.selector]}},profile,objectFacts);candidate.location=`${artifact.name} → лист ${sheet.id}`;candidate.evidence=[{kind:'user-context',detail:`Артефакт ${artifact.id}, лист ${sheet.id}; источник: ${artifact.source}`}];results.push(candidate);}continue;}
   }
  }
  const legacyId=Object.keys(bridges).find(k=>bridges[k]===rule.id);
  if(legacyId){
   const matches=formatting.filter(r=>r.ruleId===legacyId);
   if(matches.length){
    for(const r of matches){
     const p=model.paragraphs.find(p=>p.id===r.at?.paragraphId);
     const roleConfirmed=p?.roleEvidence?.confidence==='confirmed';
     const role=roleConfirmed?p.role:p&&['table','header','footer','note','textbox'].includes(p.at.area)?p.at.area:undefined;
     const selected=evaluate(rule.selector,{role});
     const applies=base.applicability===false||selected===false?false:base.applicability==='unknown'||selected==='unknown'?'unknown':true;
     results.push({...r,...base,at:r.at,paragraphText:r.paragraphText,location:r.location,source:r.source,actual:r.actual,expected:rule.assertion.value,tolerance:r.tolerance,property:rule.property,applicability:applies,
      status:applies===false?'not_applicable':applies==='unknown'?'unknown':r.status,
      reasonCode:applies===false?undefined:applies==='unknown'?'ambiguous_role':r.status==='unknown'?'missing_fact':undefined,
      recommendation:applies===true?r.recommendation:base.recommendation,
      explanation:applies===false?'Область объекта исключает роль основного текста':applies==='unknown'?reasons.ambiguous_role:r.explanation,
      evidence:[{kind:'ooxml',detail:`Сохранён исходный факт или его неопределённость: ${r.explanation}`,source:r.source},{kind:'classification',detail:p?.roleEvidence?.basis.join('; ')??'Роль неизвестна'}]});
    }
    continue;
   }
  }

  if(rule.id.startsWith('stu.document.')&&base.applicability===true){const verdict=predicate(rule.assertion,profile.documentMode);base.status=verdict==='unknown'?'unknown':verdict?'pass':'fail';base.actual=profile.documentMode??null;base.reasonCode=verdict==='unknown'?'unknown_context':undefined;base.explanation='Сверка указанного режима с выбранным видом работы; наличие реальной рамки требует геометрии';base.evidence=[{kind:'user-context',detail:'Режим и вид работы из профиля'}];}
  if(rule.id.startsWith('stu.table.text-')){
   const paragraphs=model.paragraphs.filter(p=>p.at.area==='table'&&p.role==='table');
   if(paragraphs.length){for(const p of paragraphs)for(const run of p.runs.filter(r=>r.text.trim())){
    const prop=run.properties[rule.property];const verdict=prop?.status==='resolved'?predicate(rule.assertion,prop.value,rule.property==='fontSize'?TOLERANCE.fontPt:0):'unknown';
    results.push({...base,status:verdict==='unknown'?'unknown':verdict?'pass':'fail',actual:prop?.value??null,at:run.at,paragraphText:p.text,location:p.location,source:prop?.source??null,reasonCode:verdict==='unknown'?'missing_fact':undefined,explanation:verdict==='unknown'?reasons.missing_fact:'Рекомендация для текста ячейки; отклонение не входит в нарушения обязательных норм',evidence:[{kind:'ooxml',detail:'Область таблицы подтверждена контейнером OOXML',source:prop?.source}]});
   }continue;}
   if(!model.unsupported.length){base.status='not_applicable';base.applicability=false;base.reasonCode=undefined;base.explanation='Таблиц в поддержанном документе нет';}
  }
  if(rule.id==='stu.page.a4'&&model.sections.length){
   for(const [i,section] of model.sections.entries()){
    const w=section.properties.width,h=section.properties.height;
    const dims=w?.status==='resolved'&&h?.status==='resolved';const ok=dims&&((Math.abs(Number(w.value)-210)<=TOLERANCE.mm&&Math.abs(Number(h.value)-297)<=TOLERANCE.mm)||(Math.abs(Number(w.value)-297)<=TOLERANCE.mm&&Math.abs(Number(h.value)-210)<=TOLERANCE.mm));
    // Appendix scopes cannot be established from a section break or a matching heading alone.
    results.push({...base,location:`Раздел ${i+1}`,at:{...base.at!,area:'section',section:i+1},actual:dims?[w.value,h.value]:null,status:'unknown',reasonCode:dims?'ambiguous_role':'missing_fact',explanation:dims?`Геометрия ${ok?'совпадает':'не совпадает'} с A4; область приложений и допустимые форматы не подтверждены`:reasons.missing_fact,evidence:[{kind:'ooxml',detail:'Размеры секции',source:w?.source}]});
   }continue;
  }
  if(rule.id.startsWith('stu.margin.')){
   const [, ,orientation,side]=rule.id.split('.');
   if(model.sections.length){for(const [i,section] of model.sections.entries()){
    const orientationProp=section.properties.orientation;const f={...facts,orientation:orientationProp?.status==='resolved'?orientationProp.value:undefined};const applies=applicability({...rule,when:{op:'all',args:[rule.when,rule.selector]}},f);
    const property=section.properties[side==='left'?'marginLeft':side==='right'?'marginRight':side];const mirrors=section.properties.mirrorMargins;
    const supported=property?.status==='resolved'&&(!['left','right'].includes(side)||mirrors?.status==='resolved'&&mirrors.value===false);
    const verdict=supported?predicate(rule.assertion,property.value,TOLERANCE.mm):'unknown';
    results.push({...base,applicability:applies,status:applies===false?'not_applicable':applies==='unknown'||verdict==='unknown'?'unknown':verdict?'pass':'fail',at:{part:'word/document.xml',area:'section',section:i+1,tablePath:[],page:unknownPage()},location:`Раздел ${i+1}, ${orientation}`,actual:property?.value??null,source:property?.source??null,tolerance:TOLERANCE.mm,reasonCode:applies==='unknown'?'unknown_context':!supported?'missing_fact':undefined,explanation:applies===false?'Другая ориентация или режим документа':applies==='unknown'?reasons.unknown_context:!supported?'Поле не разрешено либо нужны внутреннее и внешнее поля':`Сравнение разрешённого поля; техническая погрешность ${TOLERANCE.mm} мм для квантования twip`,evidence:[{kind:'ooxml',detail:`Поле ${side}`,source:property?.source}]});
   }continue;}
  }
  if(rule.id==='stu.title.combined-eligibility'&&base.applicability===true){
   // Permission describes the option; its eligibility is evaluated without demanding the option.
   const verdict=predicate(rule.assertion,profile.consultants);base.status=verdict==='unknown'?'unknown':verdict?'pass':'fail';base.actual=profile.consultants??null;base.reasonCode=verdict==='unknown'?'unknown_context':undefined;base.explanation='Условие выбора формы Ж: не более двух консультантов';base.evidence=[{kind:'user-context',detail:'Число консультантов из профиля'}];
  }
  results.push(base);
 }
 // Resolve dependencies conservatively; a dependent claim needs its prerequisite.
 for(const rule of rules.filter(r=>r.dependsOn.length)){const dependent=results.filter(r=>r.ruleId===rule.id);const prerequisites=results.filter(r=>rule.dependsOn.includes(r.ruleId));for(const r of dependent)if(r.status!=='not_applicable'&&(prerequisites.length<rule.dependsOn.length||prerequisites.some(p=>p.status!=='pass'))){r.status='unknown';r.reasonCode='missing_fact';r.explanation='Не подтверждены предварительные требования: '+rule.dependsOn.join(', ');}}
 for(const r of results){const external=profile.externalEvidence?.filter(e=>e.ruleId===r.ruleId)??[];r.evidence??=[];r.evidence.push(...external.map(e=>({kind:e.kind,detail:`${e.source}: ${e.statement}${e.artifactId?`; артефакт ${e.artifactId}`:''}`})));if(external.length&&r.status==='unknown')r.explanation+='; пользовательские сведения сохранены отдельно, их наличие не заменяет проверку нормативного предиката';}
 // Evaluate local additions alongside the original standard; no mutation/overrides of catalog rules.
 for(const local of profile.localRequirements){const rule=CATALOG.rules.find(r=>r.id===local.ruleId)!;const originals=results.filter(r=>r.ruleId===rule.id);for(const original of originals){const verdict=original.status==='unknown'||original.status==='not_applicable'?'unknown':predicate(local.assertion,original.actual,original.tolerance);results.push({...original,ruleId:local.id,origin:'local',expected:local.assertion.value,status:original.status==='not_applicable'?'not_applicable':verdict==='unknown'?'unknown':verdict?'pass':'fail',clause:local.source,explanation:`${local.explanation}. Локальное требование; исходная норма ${rule.id} сохранена отдельно`});}}
 for(const local of profile.localAdditions??[]){const r=result({...local.rule,when:{op:'all',args:[local.rule.when,local.rule.selector]},source:CATALOG.rules[0].source},profile,facts);r.origin='local';r.normSource=undefined;r.clause=local.source;r.explanation=local.explanation+'; '+r.explanation;results.push(r);}
 return results;
}
