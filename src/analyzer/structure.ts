import type { DocumentModel, DocumentLocation, Paragraph, ResolvedProperty } from './model';
import { unknown } from './model';
export interface ClassifiedElement {id:string;kind:string;paragraphIds:string[];at:DocumentLocation;confidence:'candidate'|'confirmed';evidence:string[];parentId?:string;label?:string}
export interface ReferenceCandidate {kind:'table'|'figure'|'formula'|'bibliography';text:string;targetLabel:string;at:DocumentLocation;status:'ambiguous';reason:string}
export interface StructureModel {elements:ClassifiedElement[];references:ReferenceCandidate[];bibliography:ClassifiedElement[];limitations:string[]}
/** Candidates retain original UTF-16 ranges. A lexical match never confirms a structural role. */
export function describeStructure(model:DocumentModel):StructureModel {
 const elements:ClassifiedElement[]=[],references:ReferenceCandidate[]=[],bibliography:ClassifiedElement[]=[];
 const names:Record<string,string>={'РЕФЕРАТ':'abstract','СОДЕРЖАНИЕ':'contents','ВВЕДЕНИЕ':'introduction','ЗАКЛЮЧЕНИЕ':'conclusion','СПИСОК СОКРАЩЕНИЙ':'abbreviations','СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ':'bibliography'};
 let appendix:ClassifiedElement|undefined;const parents:ClassifiedElement[]=[];let inBibliography=false;
 for(const p of model.paragraphs){
  p.roleEvidence??={confidence:'candidate',basis:[`Роль ${p.role} назначена по стилю, области или контексту` ]};
  if(p.at.area!=='body')continue;
  const text=p.text.trim(),name=names[text.toLocaleUpperCase('ru-RU')],app=/^ПРИЛОЖЕНИЕ\s+([А-ЯЁ])(?:\s|$)/u.exec(text);
  if(name||app){const el:ClassifiedElement={id:`element:${p.id}`,kind:app?'appendix':name,paragraphIds:[p.id],at:p.at,confidence:'candidate',evidence:['Совпадение строки; структурная роль требует подтверждения'],label:app?.[1]};elements.push(el);if(app)appendix=el;inBibliography=name==='bibliography';}
  if(p.role==='heading'){
   const level=p.properties.outlineLevel?.status==='resolved'?Number(p.properties.outlineLevel.value):undefined;
   const el:ClassifiedElement={id:`heading:${p.id}`,kind:'heading',paragraphIds:[p.id],at:p.at,confidence:'candidate',evidence:[`Стиль/outline level: ${level??'не определён'}`],parentId:level!==undefined?parents[level-1]?.id:undefined,label:/^\d+(?:\.\d+)*/u.exec(text)?.[0]};
   elements.push(el);if(level!==undefined){parents[level]=el;parents.length=level+1;}
  }
  if(appendix&&appendix.paragraphIds[0]!==p.id)appendix.paragraphIds.push(p.id);
  if(inBibliography&&/^\d+[.)]?\s+\S/u.test(text))bibliography.push({id:`bibliography:${p.id}`,kind:'bibliographic-record',paragraphIds:[p.id],at:p.at,confidence:'candidate',evidence:['Нумерованная строка после кандидата заголовка списка']});
  for(const [kind,pattern] of [['table',/таблиц[аеуы]?\s+([А-Я]?\.?\d+(?:\.\d+)*)/giu],['figure',/рисун(?:ок|к[аеуы])\s+([А-Я]?\.?\d+(?:\.\d+)*)/giu],['formula',/формул[аеуы]?\s+\(([А-Я]?\.?\d+(?:\.\d+)*)\)/giu],['bibliography',/\[(\d+(?:[^\]\n]*))\]/gu]] as const){for(const match of p.text.matchAll(pattern))references.push({kind,text:match[0],targetLabel:match[1],at:{...p.at,range:{start:match.index!,end:match.index!+match[0].length,unit:'utf16'}},status:'ambiguous',reason:'Лексическая отсылка; цель и область счёта не подтверждены'});}
 }
 return {elements,references,bibliography,limitations:['Классификация структуры эвристическая; совпадения не доказывают наличие обязательного элемента','Счётчики объектов и библиографические связи не подтверждены']};
}
/** Conservative support for a single decimal level. Other formats/levels remain explicit unknown. */
export function resolveVisibleNumbers(paragraphs:Paragraph[]):void {
 const states=new Map<string,{value:number;blocked:boolean}>();
 for(const p of paragraphs){if(p.role!=='list')continue;const props=p.properties;
  const id=props.numId,level=props.level,format=props.numberFormat,text=props.numberText,start=props.numberStart;
  const key=`${p.at.part}:${p.at.storyId??p.at.area}:${id?.value}`;
  const state=states.get(key);
  const unsupported=id?.status!=='resolved'||level&&level.status!=='resolved'||Number(level?.value??0)!==0||format?.status!=='resolved'||format.value!=='decimal'||text?.status!=='resolved'||typeof text.value!=='string'||!/^%1[.)]?$/u.test(text.value)||start?.status!=='resolved'||!/^\d+$/u.test(String(start.value))||props.numberRestart!==undefined||id?.value==='0';
  if(unsupported||state?.blocked){props.visibleNumber={...unknown('Видимый номер: поддержан только одноуровневый decimal с явным стартом и %1; остальные цепочки требуют полного автомата'),status:'unsupported'};states.set(key,{value:0,blocked:true});continue;}
  const value=state?state.value+1:Number(start.value);states.set(key,{value,blocked:false});
  props.visibleNumber={value:String(text.value).replace('%1',String(value)),status:'resolved',source:text.source,reason:'Последовательный счёт одноуровневого decimal в одной истории; numId разделяют области счёта'} satisfies ResolvedProperty;
 }
}
