import type { DocumentModel, DocumentLocation, Paragraph, ResolvedProperty, HeadingClassification } from './model';
import { unknown } from './model';
export interface ClassifiedElement {id:string;kind:string;paragraphIds:string[];at:DocumentLocation;confidence:'candidate'|'confirmed';evidence:string[];parentId?:string;label?:string}
export interface ReferenceCandidate {kind:'table'|'figure'|'formula'|'bibliography';text:string;targetLabel:string;at:DocumentLocation;status:'ambiguous';reason:string}
export interface StructureModel {elements:ClassifiedElement[];references:ReferenceCandidate[];bibliography:ClassifiedElement[];limitations:string[]}
const names:Record<string,string>={
 'РЕФЕРАТ':'abstract','АННОТАЦИЯ':'annotation','СОДЕРЖАНИЕ':'contents','ОГЛАВЛЕНИЕ':'contents',
 'ВВЕДЕНИЕ':'introduction','ОСНОВНАЯ ЧАСТЬ':'body','ЗАКЛЮЧЕНИЕ':'conclusion',
 'СПИСОК СОКРАЩЕНИЙ':'abbreviations','СПИСОК УСЛОВНЫХ ОБОЗНАЧЕНИЙ':'abbreviations',
 'СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ':'bibliography','СПИСОК ИСТОЧНИКОВ':'bibliography','СПИСОК ЛИТЕРАТУРЫ':'bibliography'
};
const numbered=/^([1-9]\d*(?:\.[1-9]\d*)*)([.)]?)\s+(.+)$/u;
const tocStyle=(p:Paragraph)=>p.styleNames?.some(n=>/^(?:toc(?:\s*\d+|\s+heading)?|оглавление(?:\s*\d+)?|содержание(?:\s*\d+)?)$/iu.test(n.trim()));
const contentsEntry=(p:Paragraph)=>p.contentsField||
 (tocStyle(p)&&!p.styleNames?.some(n=>/^(?:toc heading|заголовок оглавления)$/iu.test(n.trim())))||
 /(?:\t|\.{2,}|…+)\s*\d+\s*$/u.test(p.text);
const mark=(p:Paragraph,role:Paragraph['role'],basis:string[])=>{p.role=role;p.roleEvidence={confidence:'confirmed',basis};};
/** Identity follows names and numbering; typography is checked later, never used as a prerequisite. */
export function describeStructure(model:DocumentModel):StructureModel {
 const elements:ClassifiedElement[]=[],references:ReferenceCandidate[]=[],bibliography:ClassifiedElement[]=[];
 const divisions=new Map<string,ClassifiedElement>();
 let region:string|undefined,owner:ClassifiedElement|undefined,body:ClassifiedElement|undefined,appendix:ClassifiedElement|undefined;
 let lastSection=0;
 for(const p of model.paragraphs){
  p.roleEvidence??={confidence:'candidate',basis:[`Роль ${p.role} назначена по стилю или области`]};
  if(p.at.area!=='body')continue;
  const text=p.text.trim(),norm=text.replace(/\s+/gu,' ').toLocaleUpperCase('ru-RU');
  if(contentsEntry(p)){mark(p,'contents',['Поле, стиль или строка содержания с номером страницы']);continue;}
  for(const [kind,pattern] of [['table',/таблиц[аеуы]?\s+([А-Я]?\.?\d+(?:\.\d+)*)/giu],['figure',/рисун(?:ок|к[аеуы])\s+([А-Я]?\.?\d+(?:\.\d+)*)/giu],['formula',/формул[аеуы]?\s+\(([А-Я]?\.?\d+(?:\.\d+)*)\)/giu],['bibliography',/\[(\d+(?:[^\]\n]*))\]/gu]] as const){for(const match of p.text.matchAll(pattern))references.push({kind,text:match[0],targetLabel:match[1],at:{...p.at,range:{start:match.index!,end:match.index!+match[0].length,unit:'utf16'}},status:'ambiguous',reason:'Лексическая отсылка; цель и область счёта не подтверждены'});}
  const outline=p.properties.outlineLevel;
  const styled=p.role==='heading'||outline?.status==='resolved'&&Number(outline.value)<9;
  const list=(p.role==='list'&&!styled)||p.role==='caption';
  const match=numbered.exec(text);
  const bare=styled?/^([1-9]\d*(?:\.[1-9]\d*)*)[.)]?$/u.exec(text):undefined;
  const auto=p.properties.visibleNumber;
  const autoNumber=auto?.status==='resolved'?String(auto.value).replace(/[.)]$/u,''):undefined;
  const nameText=(match?.[3]??norm).replace(/\s+/gu,' ').toLocaleUpperCase('ru-RU');
  const name=match&&names[nameText]==='body'?undefined:names[nameText];
  const app=/^ПРИЛОЖЕНИЕ(?:\s+([А-ЯЁ]))?(?:\s.*)?$/u.exec(norm);
  let heading:HeadingClassification|undefined;
  if(!list&&(name||app)){
   heading={kind:app?'appendix':'structural',elementKind:app?'appendix':name,number:match?.[1]??autoNumber,title:match?.[3]??text,basis:['Точное стандартное название отдельного абзаца','Исключены записи содержания, списки и отдельные истории']};
  }else if(!list&&text&&region!=='bibliography'&&region!=='appendix'){
   const label=match?.[1]??bare?.[1]??autoNumber,parts=label?.split('.');
   const conventional=!!match&&!match[2]&&!/[.!?;](?:\s|$)|[\n\t]/u.test(match[3])&&
    (parts!.length===1?Number(label)===lastSection+1:divisions.has(parts!.slice(0,-1).join('.')));
   if(styled||conventional){
    const level=parts?.length??(outline?.status==='resolved'?Number(outline.value)+1:1);
    if(level<=4)heading={kind:level===1?'section':level===2?'subsection':level===3?'point':'subpoint',level,number:label,title:bare?'':match?.[3]??text,basis:[styled?'Стиль/уровень заголовка OOXML':'Номер отдельной строки согласован с иерархией разделов', 'Исключены списки и записи содержания']};
   }
  }
  if(heading){
   p.heading=heading;mark(p,'heading',heading.basis);
   const el:ClassifiedElement={id:`element:${p.id}`,kind:heading.elementKind??heading.kind,paragraphIds:[p.id],at:p.at,confidence:'confirmed',evidence:heading.basis,label:app?.[1]??heading.number};
   if(heading.kind==='structural'||heading.kind==='appendix'){
    region=heading.elementKind;owner=el;divisions.clear();lastSection=0;
    appendix=heading.kind==='appendix'?el:undefined;
   }else{
    if(!body){body={id:`body:${p.id}`,kind:'body',paragraphIds:[],at:p.at,confidence:'confirmed',evidence:['Распознаны нумерованные разделы основной части']};elements.push(body);}
    region='body';owner=undefined;
    if(heading.number){
     const parent=heading.number.split('.').slice(0,-1).join('.');
     el.parentId=parent?divisions.get(parent)?.id:body.id;
     divisions.set(heading.number,el);
     if(heading.level===1)lastSection=Number(heading.number);
    }
    body.paragraphIds.push(p.id);
   }
   elements.push(el);continue;
  }
  if(owner)owner.paragraphIds.push(p.id);
  if(region==='body'&&body)body.paragraphIds.push(p.id);
  if(region==='bibliography'&&text){
   if(p.role==='body')mark(p,'bibliography',['После подтверждённого заголовка списка источников']);
   if(p.role==='list'||/^\d+[.)]?\s+\S/u.test(text))bibliography.push({id:`bibliography:${p.id}`,kind:'bibliographic-record',paragraphIds:[p.id],at:p.at,confidence:'confirmed',evidence:['Нумерованная запись внутри списка источников'],parentId:owner?.id});
  }
  if(appendix&&!appendix.paragraphIds.includes(p.id))appendix.paragraphIds.push(p.id);
 }
 const firstBoundary=model.paragraphs.findIndex(p=>!!p.heading);
 const front=model.paragraphs.slice(0,firstBoundary<0?0:firstBoundary).filter(p=>p.at.area==='body'&&p.text.trim()&&!contentsEntry(p));
 const institution=front.find(p=>/МИНИСТЕРСТВО|УНИВЕРСИТЕТ|ИНСТИТУТ/u.test(p.text.toLocaleUpperCase('ru-RU')));
 const documentType=front.find(p=>/^(?:ОТЧ[ЕЁ]Т|КУРСОВ|ДИПЛОМ|ПОЯСНИТЕЛЬНАЯ ЗАПИСКА)/u.test(p.text.trim().toLocaleUpperCase('ru-RU')));
 if(institution&&documentType&&institution!==documentType){
  for(const p of front)mark(p,'title',['Начальный блок с реквизитами учреждения и видом учебного документа']);
  elements.unshift({id:`title:${front[0].id}`,kind:'title',paragraphIds:front.map(p=>p.id),at:front[0].at,confidence:'confirmed',evidence:['Начальный блок: учреждение и вид документа; форма и реквизиты проверяются отдельно']});
 }
 return {elements,references,bibliography,limitations:['Распознавание элементов не подтверждает их полноту, смысловую корректность или пагинацию','Двухкомпонентный номер без уровня структуры может обозначать подраздел или пункт без подразделов','Связи отсылок с объектами требуют отдельной проверки']};
}
/** Body formatting scopes consume the same heading classification as normative checks. */
export function classifyFormattingRoles(model:DocumentModel):void {
 let scope:'unclassified'|'body'|'bibliography'|'special'='unclassified';
 let boundary:string|undefined;
 for(const p of model.paragraphs){
  if(p.at.area!=='body')continue;
  if(p.heading){
   boundary=p.id;
   const kind=p.heading.elementKind;
   scope=kind==='bibliography'?'bibliography':!kind||['introduction','body','conclusion'].includes(kind)?'body':'special';continue;
  }
  if(p.role==='contents'||p.role==='title')continue;
  if(scope==='bibliography'&&p.role==='body')mark(p,'bibliography',[`После списка источников ${boundary}`]);
  if(p.role!=='body'||!p.text.trim())continue;
  if(model.objects.some(o=>o.kind==='formula'&&o.at.paragraphId===p.id))continue;
  if(scope==='body')mark(p,'body',[`Основной поток после распознанного заголовка ${boundary}`,'Исключены содержание, титул, подписи, списки и отдельные истории']);
 }
}
/** Conservative support for a single decimal level. Other formats/levels remain explicit unknown. */
export function resolveVisibleNumbers(paragraphs:Paragraph[]):void {
 const states=new Map<string,{value:number;blocked:boolean}>();
 for(const p of paragraphs){if(p.role!=='list'&&(p.properties.numId?.status!=='resolved'||p.properties.numId.value==='0'))continue;const props=p.properties;
  const id=props.numId,level=props.level,format=props.numberFormat,text=props.numberText,start=props.numberStart;
  const key=`${p.at.part}:${p.at.storyId??p.at.area}:${id?.value}`;
  const state=states.get(key);
  const unsupported=id?.status!=='resolved'||level&&level.status!=='resolved'||Number(level?.value??0)!==0||format?.status!=='resolved'||format.value!=='decimal'||text?.status!=='resolved'||typeof text.value!=='string'||!/^%1[.)]?$/u.test(text.value)||start?.status!=='resolved'||!/^\d+$/u.test(String(start.value))||props.numberRestart!==undefined||id?.value==='0';
  if(unsupported||state?.blocked){props.visibleNumber={...unknown('Видимый номер: поддержан только одноуровневый decimal с явным стартом и %1; остальные цепочки требуют полного автомата'),status:'unsupported'};states.set(key,{value:0,blocked:true});continue;}
  const value=state?state.value+1:Number(start.value);states.set(key,{value,blocked:false});
  props.visibleNumber={value:String(text.value).replace('%1',String(value)),status:'resolved',source:text.source,reason:'Последовательный счёт одноуровневого decimal в одной истории; numId разделяют области счёта'} satisfies ResolvedProperty;
 }
}
