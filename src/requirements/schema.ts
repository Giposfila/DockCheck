import type { Category } from '../types';
export type Truth = true | false | 'unknown';
export type Scalar = string | number | boolean;
export type Condition = {op:'always'} | {op:'eq'|'in';fact:string;value:Scalar|Scalar[]} | {op:'not';arg:Condition} | {op:'all'|'any';args:Condition[]};
export type Modality = 'mandatory'|'prohibition'|'recommendation'|'permission';
export type Capability = 'ooxml'|'structure'|'counters'|'layout'|'geometry'|'language'|'external-standard'|'external-artifact'|'manual';
export interface NormSource { edition:'СТУ 7.5–07–2021'; clause:string; pdfPage:number; appendix?:string; form?:string }
export interface Assertion {op:'eq'|'oneOf'|'range'|'min'|'max'|'pattern'|'relation';value:Scalar|Scalar[];unit?:'mm'|'pt'|'multiplier'|'count'|'percent'|'characters'|'line'}
export interface Rule {
 id:string;title:string;description:string;source:NormSource;modality:Modality;when:Condition;
 target:'document'|'paragraph'|'run'|'section'|'object'|'artifact';selector:Condition;property:string;assertion:Assertion;
 exceptions:Condition[];alternatives:string[];dependsOn:string[];evidence:Capability[];externalDependencies:string[];
 explanation:string;recommendation:string;category:Category;
}
export interface CoverageRow {id:string;source:NormSource;summary:string;type:'formal'|'recommendation'|'permission'|'example'|'definition'|'subjective';ruleIds:string[];decision:'included'|'excluded'|'external-dependency'|'context';reason:string;evidence:Capability[];implementation:'automatic'|'partial'|'unimplemented'|'not-applicable';questions:string[]}
export const EDITION = 'СТУ 7.5–07–2021' as const;
export const CATALOG_VERSION = 'stu-2021.1';
export const always:Condition={op:'always'};
export const eq=(fact:string,value:Scalar):Condition=>({op:'eq',fact,value});
export function evaluate(c:Condition,facts:Record<string,unknown>):Truth {
 switch(c.op){
 case 'always':return true;
 case 'eq':case 'in': {const v=Object.hasOwn(facts,c.fact)?facts[c.fact]:undefined;return v===undefined||v===null?'unknown':c.op==='eq'?v===c.value:(c.value as Scalar[]).includes(v as Scalar);}
 case 'not':{const v=evaluate(c.arg,facts);return v==='unknown'?v:!v;}
 case 'all':case 'any':{const values=c.args.map(a=>evaluate(a,facts));return c.op==='all'?values.includes(false)?false:values.includes('unknown')?'unknown':true:values.includes(true)?true:values.includes('unknown')?'unknown':false;}
 }
}
function object(v:unknown):v is Record<string,any>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function scalar(v:unknown):v is Scalar{return typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v);}
export function validateCondition(v:unknown,depth=0):asserts v is Condition {
 if(depth>24||!object(v))throw Error('Неверное условие или превышена глубина');
 const allowed=v.op==='always'?['op']:v.op==='eq'||v.op==='in'?['op','fact','value']:v.op==='not'?['op','arg']:['op','args'];
 if(Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Неизвестное поле условия');
 switch(v.op){case 'always':return;case 'eq':case 'in':if(typeof v.fact!=='string'||!v.fact||['__proto__','constructor','prototype'].includes(v.fact)||!(v.op==='eq'?scalar(v.value):Array.isArray(v.value)&&v.value.length>0&&v.value.every(scalar)))throw Error('Неверное сравнение');return;case 'not':validateCondition(v.arg,depth+1);return;case 'all':case 'any':if(!Array.isArray(v.args)||!v.args.length)throw Error('Пустое условие');v.args.forEach(a=>validateCondition(a,depth+1));return;default:throw Error('Неизвестная операция условия');}
}
export function validateCatalog(input:unknown,coverage?:CoverageRow[]):asserts input is Rule[] {
 if(!Array.isArray(input))throw Error('Каталог должен быть массивом');
 const ids=new Set<string>();
 for(const r of input){
  if(!object(r)||typeof r.id!=='string'||!/^[-\w.]+$/.test(r.id)||ids.has(r.id))throw Error('Повторный или неверный id правила');ids.add(r.id);
  for(const key of ['title','description','property','explanation','recommendation'])if(typeof r[key]!=='string'||!r[key])throw Error(`Нет ${key}: ${r.id}`);
  if(!object(r.source)||r.source.edition!==EDITION||!Number.isInteger(r.source.pdfPage)||r.source.pdfPage<1||r.source.pdfPage>61||!r.source.clause)throw Error(`Неверный источник: ${r.id}`);
  if(!['mandatory','prohibition','recommendation','permission'].includes(r.modality)||!['document','paragraph','run','section','object','artifact'].includes(r.target)||!['page','text','structure','heading','table','figure','references'].includes(r.category))throw Error(`Неверный тип правила ${r.id}`);
  validateCondition(r.when);validateCondition(r.selector);
  if(!Array.isArray(r.exceptions))throw Error('Нет исключений');r.exceptions.forEach(x=>validateCondition(x));
  for(const k of ['dependsOn','alternatives','externalDependencies','evidence'])if(!Array.isArray(r[k])||!r[k].every((x:unknown)=>typeof x==='string'))throw Error(`Неверное поле ${k}`);
  if(!r.evidence.length||r.evidence.some((x:string)=>!['ooxml','structure','counters','layout','geometry','language','external-standard','external-artifact','manual'].includes(x)))throw Error('Неизвестная возможность');
  const a=r.assertion;if(!object(a)||!['eq','oneOf','range','min','max','pattern','relation'].includes(a.op)||!(scalar(a.value)||Array.isArray(a.value)&&a.value.length>0&&a.value.every(scalar)))throw Error(`Неверный предикат ${r.id}`);
  const propertyUnit:Record<string,string>={fontSize:'pt',firstLine:'mm',line:'multiplier',consultants:'count','stamp.width':'mm','stamp.height':'mm'};
  const expectedUnit=propertyUnit[r.property]??(/^(?:margin\.|frame\.(?:edge|gap)\.|stamp\.(?:column|row)\.)/.test(r.property)?'mm':undefined);
  if(expectedUnit&&a.unit!==expectedUnit)throw Error(`Несовместимые единицы свойства ${r.property}`);
  if(a.unit&&!['mm','pt','multiplier','count','percent','characters','line'].includes(a.unit))throw Error('Неизвестная единица');
  if(a.op==='oneOf'&&!Array.isArray(a.value)||a.op==='range'&&(!Array.isArray(a.value)||a.value.length!==2||a.value.some((x:unknown)=>typeof x!=='number')||a.value[0]>a.value[1])||['min','max'].includes(a.op)&&typeof a.value!=='number')throw Error('Неверный диапазон');
  if(a.unit&&!(typeof a.value==='number'||Array.isArray(a.value)&&a.value.every((x:unknown)=>typeof x==='number')))throw Error('Несовместимые единицы');
 }
 const rules=input as Rule[];const byId=new Map(rules.map(r=>[r.id,r]));
 for(const r of rules)for(const ref of [...r.dependsOn,...r.alternatives])if(!ids.has(ref)||ref===r.id)throw Error(`Неизвестная или собственная ссылка ${ref}`);
 const active=new Set<string>(),done=new Set<string>();
 const visit=(id:string)=>{if(active.has(id))throw Error('Цикл зависимостей');if(done.has(id))return;active.add(id);byId.get(id)!.dependsOn.forEach(visit);active.delete(id);done.add(id);};rules.forEach(r=>visit(r.id));
 const assertions=new Map<string,Rule[]>();
 const disjoint=(a:Assertion,b:Assertion)=>{
  if(a.unit!==b.unit)return true;
  const set=(x:Assertion)=>x.op==='eq'?[x.value as Scalar]:x.op==='oneOf'?x.value as Scalar[]:undefined;
  const x=set(a),y=set(b);
  const contains=(q:Assertion,value:Scalar)=>q.op==='eq'?value===q.value:q.op==='oneOf'?(q.value as Scalar[]).includes(value):typeof value==='number'?q.op==='range'?value>=Number((q.value as number[])[0])&&value<=Number((q.value as number[])[1]):q.op==='min'?value>=Number(q.value):q.op==='max'?value<=Number(q.value):true:true;
  if(x)return !x.some(v=>contains(b,v));if(y)return !y.some(v=>contains(a,v));
  const bounds=(q:Assertion):[number,number]=>q.op==='range'?q.value as [number,number]:q.op==='min'?[Number(q.value),Infinity]:q.op==='max'?[-Infinity,Number(q.value)]:[-Infinity,Infinity];
  const [l,h]=bounds(a),[m,n]=bounds(b);return Math.max(l,m)>Math.min(h,n);
 };
 for(const r of rules){const k=JSON.stringify([r.target,r.property,r.when,r.selector,r.exceptions]);const previous=assertions.get(k)??[];for(const p of previous)if(p.modality==='mandatory'&&r.modality==='mandatory'&&disjoint(p.assertion,r.assertion))throw Error(`Противоречие ${p.id} / ${r.id}`);previous.push(r);assertions.set(k,previous);}

 if(coverage){const rows=new Set<string>();for(const row of coverage){if(rows.has(row.id)||!row.id||!row.source||!row.reason||!row.summary||!row.decision)throw Error('Неверная строка покрытия');rows.add(row.id);if(row.decision==='included'&&!row.ruleIds.length)throw Error('Фрагмент без правила');row.ruleIds.forEach(id=>{if(!ids.has(id))throw Error(`Нет правила ${id}`);});}for(const r of rules)if(!coverage.some(row=>row.ruleIds.includes(r.id)))throw Error(`Правило без фрагмента ${r.id}`);}
}
export function deepFreeze<T>(v:T):T {if(v&&typeof v==='object'){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;}
