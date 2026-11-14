import type { Requirements } from '../types';
import { DEFAULT_REQUIREMENTS } from '../profiles/default';
import { CATALOG_VERSION, deepFreeze } from './schema';
import { CATALOG, TITLE_FORMS } from './catalog';
import { validateCatalog } from './schema';
import type { Rule, Assertion } from './schema';
export const PROFILE_STORAGE_KEY='dockcheck-work-profile-v2';
export const LEGACY_STORAGE_KEY='dockcheck-sfu-requirements-v1';
export const WORK_KINDS=Object.keys(TITLE_FORMS) as (keyof typeof TITLE_FORMS)[];
export interface LocalRequirement {id:string;ruleId:string;assertion:Assertion;source:string;explanation:string}
export interface LocalAddition {id:string; source:string; explanation:string; rule:Omit<Rule,'source'>}
export interface SheetContext {id:string;format?:'A4'|'A3'|'A3×4'|'A4×4'|'A2'|'A1';stampForm?:'1'|'2'|'3'|'4'|'5'|'6';drawingKind?:'detail'|'assembly'|'scheme'|'construction';documentationSystem?:'ESKD'|'SPDS'|'ESTD'|'ESPD'|'mining';medium?:'electronic'|'paper';execution?:'printed'|'handwritten';first?:boolean}
export interface ArtifactDescriptor {id:string;kind:'docx'|'assignment'|'appendix'|'drawing'|'poster'|'slides'|'physical';name:string;provided:boolean;source:string; sheets?:SheetContext[];medium?:'electronic'|'paper';execution?:'printed'|'handwritten';pageCountScope?:string;parentId?:string}
export interface ExternalEvidence {ruleId:string;artifactId?:string;kind:'user-confirmation'|'external-document';source:string;statement:string}
export interface WorkProfile {
 schemaVersion:2;id:string;version:string;catalogVersion:string;
 execution?:'printed'|'handwritten';
 workKind?:keyof typeof TITLE_FORMS;documentMode?:'unframed'|'framed';medium?:'electronic'|'paper'|'handwritten';
 documentationSystem?:'ESKD'|'SPDS'|'ESTD'|'ESPD'|'mining';specialty?:string;directionCode?:string;
 composition?:{elements:string[];source:string};
 artifacts:{assignment?:boolean;separateAppendices?:boolean;drawings?:boolean;posters?:boolean;slides?:boolean};
 approvalVariant?:'separate'|'combined';consultants?:number;
 numbering:{tables?:'continuous'|'section';figures?:'continuous'|'section';formulas?:'continuous'|'section';appendices:'separate'};
 bibliographyGrouping?:'alphabetical'|'systematic'|'chronological';
 requisites:Record<string,string>;localRequirements:LocalRequirement[];
 artifactManifest?:ArtifactDescriptor[];externalEvidence?:ExternalEvidence[];localAdditions?:LocalAddition[];
 // Compatibility settings are explicitly local comparisons, never replacements for the base standard.
 formatting?:Requirements;
}
export const DEFAULT_PROFILE:WorkProfile=deepFreeze({schemaVersion:2,id:'work',version:'1',catalogVersion:CATALOG_VERSION,artifacts:{},numbering:{appendices:'separate'},requisites:{},localRequirements:[]});
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function keys(v:Record<string,any>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Неизвестное поле профиля');}
function enumValue(value:unknown,values:readonly string[],name:string){if(value!==undefined&&!values.includes(value as string))throw Error(`Неверное значение ${name}`);}
export function validateFormatting(v:unknown):asserts v is Requirements {
 if(!record(v))throw Error('Неверные настройки оформления');
 keys(v,['textRoles','fontFamily','fontSizePt','allowedLineSpacing','firstLineIndentMm','portraitMarginsMm','landscapeMarginsMm','requireA4','requireJustified','requirePageNumbers','requiredSections']);
 if(typeof v.fontFamily!=='string'||!v.fontFamily.trim()||typeof v.fontSizePt!=='number'||!Number.isFinite(v.fontSizePt)||v.fontSizePt<=0||typeof v.firstLineIndentMm!=='number'||!Number.isFinite(v.firstLineIndentMm)||v.firstLineIndentMm<0)throw Error('Неверный шрифт или отступ');
 if(!Array.isArray(v.allowedLineSpacing)||!v.allowedLineSpacing.length||v.allowedLineSpacing.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<=0))throw Error('Неверные интервалы');
 for(const key of ['portraitMarginsMm','landscapeMarginsMm']){const m=v[key];if(key==='landscapeMarginsMm'&&m===undefined)continue;if(!record(m))throw Error('Неверные поля');keys(m,['top','bottom','left','right']);for(const s of ['top','bottom','left','right'])if(typeof m[s]!=='number'||!Number.isFinite(m[s])||m[s]<0)throw Error('Неверное поле страницы');}
 for(const k of ['requireA4','requireJustified','requirePageNumbers'])if(typeof v[k]!=='boolean')throw Error('Неверный флаг');
 if(!Array.isArray(v.requiredSections)||!v.requiredSections.every(x=>typeof x==='string'))throw Error('Неверный состав');
 if(v.textRoles!==undefined&&(!Array.isArray(v.textRoles)||v.textRoles.some(x=>!['body','heading','table','footer','header','note','list','caption','textbox','unknown'].includes(x))))throw Error('Неверная роль');
}
export function parseProfile(input:unknown):WorkProfile {
 if(!record(input))throw Error('Профиль должен быть объектом');
 const value=input.catalogVersion==='stu-2021.1'?{...input,catalogVersion:CATALOG_VERSION}:input;
 keys(value,['schemaVersion','id','version','catalogVersion','workKind','documentMode','medium','documentationSystem','specialty','directionCode','composition','artifacts','approvalVariant','consultants','numbering','bibliographyGrouping','requisites','localRequirements','formatting','artifactManifest','externalEvidence','execution','localAdditions']);
 if(value.schemaVersion!==2||value.catalogVersion!==CATALOG_VERSION||!['id','version'].every(k=>typeof value[k]==='string'&&value[k].trim()))throw Error('Неподдерживаемая версия профиля или каталога');
 enumValue(value.execution,['printed','handwritten'],'исполнение');enumValue(value.workKind,WORK_KINDS,'вид работы');enumValue(value.documentMode,['unframed','framed'],'рамка');enumValue(value.medium,['electronic','paper','handwritten'],'носитель');enumValue(value.documentationSystem,['ESKD','SPDS','ESTD','ESPD','mining'],'система документации');enumValue(value.approvalVariant,['separate','combined'],'согласование');enumValue(value.bibliographyGrouping,['alphabetical','systematic','chronological'],'группировка');
 for(const k of ['specialty','directionCode'])if(value[k]!==undefined&&typeof value[k]!=='string')throw Error('Неверный код');
 if(value.consultants!==undefined&&(!Number.isInteger(value.consultants)||value.consultants<0))throw Error('Неверное число консультантов');
 if(value.composition!==undefined){if(!record(value.composition)||!Array.isArray(value.composition.elements)||!value.composition.elements.every((x:unknown)=>typeof x==='string')||typeof value.composition.source!=='string'||!value.composition.source.trim())throw Error('Нужен источник состава');keys(value.composition,['elements','source']);}
 if(!record(value.artifacts)||!record(value.numbering)||!record(value.requisites)||!Array.isArray(value.localRequirements))throw Error('Неполная схема профиля');
 keys(value.artifacts,['assignment','separateAppendices','drawings','posters','slides']);if(Object.values(value.artifacts).some(x=>typeof x!=='boolean'))throw Error('Неверный состав артефактов');
 keys(value.numbering,['tables','figures','formulas','appendices']);if(value.numbering.appendices!=='separate')throw Error('У приложений отдельная область счёта');for(const k of ['tables','figures','formulas'])enumValue(value.numbering[k],['continuous','section'],'нумерация');
 if(Object.entries(value.requisites).some(([k,v])=>['__proto__','constructor','prototype'].includes(k)||typeof v!=='string'))throw Error('Неверные реквизиты');
 const ids=new Set<string>();
 for(const l of value.localRequirements){if(!record(l))throw Error('Неверное локальное правило');keys(l,['id','ruleId','assertion','source','explanation']);if(typeof l.id!=='string'||!l.id.startsWith('local.')||ids.has(l.id)||!['source','explanation'].every(k=>typeof l[k]==='string'&&l[k].trim()))throw Error('Локальное правило требует id, источник и объяснение');ids.add(l.id);const base=CATALOG.rules.find(r=>r.id===l.ruleId);if(!base||!record(l.assertion))throw Error('Неизвестное базовое правило');
  const a=l.assertion;keys(a,['op','value','unit']);if(!['eq','oneOf','range','min','max','relation'].includes(a.op)||a.unit!==base.assertion.unit)throw Error('Несовместимый предикат локального правила');
  const scalar=(x:unknown)=>typeof x==='string'||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x);
  if(!(scalar(a.value)||Array.isArray(a.value)&&a.value.length>0&&a.value.every(scalar))||a.unit&&!(typeof a.value==='number'||Array.isArray(a.value)&&a.value.every((x:unknown)=>typeof x==='number')))throw Error('Неверное локальное значение');
  if(a.op==='oneOf'&&!Array.isArray(a.value)||a.op==='range'&&(!Array.isArray(a.value)||a.value.length!==2||typeof a.value[0]!=='number'||typeof a.value[1]!=='number'||a.value[0]>a.value[1])||['min','max'].includes(a.op)&&typeof a.value!=='number')throw Error('Неверный локальный диапазон');
 }
 if(value.artifactManifest!==undefined){if(!Array.isArray(value.artifactManifest))throw Error('Неверный комплект артефактов');const artifactIds=new Set<string>();for(const a of value.artifactManifest){if(!record(a))throw Error('Неверный артефакт');keys(a,['id','kind','name','provided','source','sheets','medium','execution','pageCountScope','parentId']);enumValue(a.medium,['electronic','paper'],'носитель');enumValue(a.execution,['printed','handwritten'],'исполнение');for(const key of ['pageCountScope','parentId'])if(a[key]!==undefined&&(typeof a[key]!=='string'||!a[key].trim()))throw Error('Неверная связь артефакта');if(a.sheets!==undefined){if(!Array.isArray(a.sheets))throw Error('Неверные листы');const sheetIds=new Set<string>();for(const sheet of a.sheets){if(!record(sheet))throw Error('Неверный лист');keys(sheet,['id','format','stampForm','drawingKind','documentationSystem','medium','execution','first']);if(typeof sheet.id!=='string'||!sheet.id.trim()||sheetIds.has(sheet.id))throw Error('Неверный id листа');sheetIds.add(sheet.id);enumValue(sheet.format,['A4','A3','A3×4','A4×4','A2','A1'],'формат');enumValue(sheet.stampForm,['1','2','3','4','5','6'],'форма надписи');enumValue(sheet.drawingKind,['detail','assembly','scheme','construction'],'вид чертежа');enumValue(sheet.documentationSystem,['ESKD','SPDS','ESTD','ESPD','mining'],'система');enumValue(sheet.medium,['electronic','paper'],'носитель');enumValue(sheet.execution,['printed','handwritten'],'исполнение');if(sheet.first!==undefined&&typeof sheet.first!=='boolean')throw Error('Неверный порядок листа');}}if(!['id','name','source'].every(k=>typeof a[k]==='string'&&a[k].trim())||artifactIds.has(a.id)||typeof a.provided!=='boolean')throw Error('Артефакт требует уникальный id, имя, источник и наличие');enumValue(a.kind,['docx','assignment','appendix','drawing','poster','slides','physical'],'артефакт');if(!a.kind)throw Error('Нет вида артефакта');artifactIds.add(a.id);}}
 if(value.artifactManifest){const artifacts=value.artifactManifest as ArtifactDescriptor[];for(const a of artifacts){if(a.parentId!==undefined&&!artifacts.some(p=>p.id===a.parentId&&p.id!==a.id))throw Error('Неизвестный родитель артефакта');const seen=new Set<string>([a.id]);let parent=a.parentId;while(parent){if(seen.has(parent))throw Error('Цикл артефактов');seen.add(parent);parent=artifacts.find(p=>p.id===parent)?.parentId;}}}
 if(value.localAdditions!==undefined){if(!Array.isArray(value.localAdditions))throw Error('Неверные локальные нормы');for(const a of value.localAdditions){if(!record(a))throw Error('Неверная локальная норма');keys(a,['id','source','explanation','rule']);if(typeof a.id!=='string'||!a.id.startsWith('local.')||ids.has(a.id)||!['source','explanation'].every(k=>typeof a[k]==='string'&&a[k].trim())||!record(a.rule)||a.rule.id!==a.id)throw Error('Локальная норма требует id и источник');ids.add(a.id);if('source' in a.rule)throw Error('Источник локальной нормы задаётся отдельно');validateCatalog([{...a.rule,source:{edition:'СТУ 7.5–07–2021',clause:'validation-only',pdfPage:1}}]);}}
 if(value.externalEvidence!==undefined){if(!Array.isArray(value.externalEvidence))throw Error('Неверные внешние доказательства');for(const e of value.externalEvidence){if(!record(e))throw Error('Неверное доказательство');keys(e,['ruleId','artifactId','kind','source','statement']);if(!CATALOG.rules.some(r=>r.id===e.ruleId)||!['source','statement'].every(k=>typeof e[k]==='string'&&e[k].trim()))throw Error('Доказательство требует правило, источник и описание');if(!['user-confirmation','external-document'].includes(e.kind))throw Error('Неверный вид доказательства');if(e.artifactId!==undefined&&!value.artifactManifest?.some((a:ArtifactDescriptor)=>a.id===e.artifactId))throw Error('Неизвестный артефакт доказательства');}}
 if(value.formatting!==undefined){validateFormatting(value.formatting);if(!value.requisites.localFormattingSource?.trim())throw Error('Нужен источник локального оформления');}
 return structuredClone(value) as WorkProfile;
}
export function profileConflicts(p:WorkProfile):string[]{const conflicts=p.localRequirements.filter(l=>JSON.stringify(l.assertion)!==JSON.stringify(CATALOG.rules.find(r=>r.id===l.ruleId)!.assertion)).map(l=>`${l.id}: отличается от ${l.ruleId}; источник: ${l.source}`);if(p.formatting)conflicts.push('Локальный шаблон оформления: результаты сравнения отделены от исходного СТУ');if(p.approvalVariant==='combined'&&p.consultants!==undefined&&p.consultants>2)conflicts.push('Форма Ж недопустима при числе консультантов больше двух');if(p.workKind&&p.documentMode&&(['diploma-project','course-project'].includes(p.workKind)!==(p.documentMode==='framed')))conflicts.push('Режим рамки противоречит виду работы (7.1.2–7.1.3)');return conflicts;}
export function migrateLegacy(raw:unknown):{profile:WorkProfile;notice:string}{
 const profile=structuredClone(DEFAULT_PROFILE);
 // Only validate known old fields; the obsolete contents threshold is deliberately discarded.
 try{if(!record(raw))throw Error();const {requireContentsOverPages:discarded,...old}=raw;void discarded;validateFormatting(old);profile.formatting={...old,requiredSections:[]};profile.requisites.localFormattingSource='Ранее сохранённый пользовательский шаблон';profile.id='migrated-local';profile.version='1';return {profile,notice:'Старый шаблон перенесён как локальное оформление. Список разделов и порог содержания сброшены: они не устанавливают обязательность по СТУ.'};}catch{return {profile,notice:'Старые настройки повреждены или несовместимы. Применён новый профиль с неизвестным контекстом работы.'};}
}
export function legacyProfile(requirements:Requirements):WorkProfile {validateFormatting(requirements);return {...structuredClone(DEFAULT_PROFILE),id:'legacy-api',documentMode:'unframed',requisites:{localFormattingSource:'Явно переданный совместимый Requirements API'},formatting:structuredClone(requirements)};}
export function formattingFor(p:WorkProfile):Requirements{return structuredClone(p.formatting??DEFAULT_REQUIREMENTS);}
