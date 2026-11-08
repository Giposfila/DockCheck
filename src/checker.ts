import { DEFAULT_PROFILE, formattingFor, legacyProfile, parseProfile, profileConflicts } from './requirements/profile';
import type { WorkProfile } from './requirements/profile';
import { evaluateRequirements } from './requirements/engine';
import { IMPLEMENTATIONS } from './requirements/engine';
import { resultFinding } from './report';
import { unknownPage } from './analyzer/location';
import { openPackage } from './analyzer/package';
import { analyze } from './analyzer/resolve';
import { checks } from './checks/formatting';
import { DEFAULT_REQUIREMENTS } from './profiles/default';
import type { CheckReport, Requirements } from './types';
export { DEFAULT_REQUIREMENTS } from './profiles/default';
export async function checkDocx(data: ArrayBuffer | Uint8Array, input: Requirements | WorkProfile = DEFAULT_PROFILE): Promise<CheckReport> {
 const profile='schemaVersion' in input?parseProfile(input):legacyProfile(input);
 const requirements=formattingFor(profile);
 const pkg=await openPackage(data); const document=await analyze(pkg); const comparisons=checks(document,requirements);
 const results=evaluateRequirements(document,profile,checks(document,DEFAULT_REQUIREMENTS));
 if(profile.formatting)results.push(...comparisons.map(r=>({...r,origin:'local' as const,modality:'mandatory' as const,profileVersion:`${profile.id}@${profile.version}`,clause:profile.requisites.localFormattingSource??'Явный локальный шаблон',evidence:[{kind:'local-profile',detail:profile.requisites.localFormattingSource??'Явный локальный шаблон'},{kind:'ooxml',detail:'Разрешённое свойство документа',source:r.source}],explanation:r.explanation+'; сравнение с локальным шаблоном, структурная роль эвристическая'})));
 else results.push(...comparisons.filter(r=>r.ruleId.startsWith('document.')||r.ruleId==='list.number').map(r=>({...r,origin:'analysis' as const})));
 if(requirements.requirePageNumbers) for(const [i,s] of document.sections.entries()) {
  for(const variant of new Set(['default',...Object.keys(s.footers)])) {
   const part=s.footers[variant];
   const matches=document.paragraphs.filter(p=>part && p.id.startsWith(part+':') && (p.pageField || p.fieldStatus==='unsupported'));
   for(const p of matches.length?matches:[undefined]) {
    const align=p?.properties.align;
    const centered=align?.status==='resolved' && align.value==='center';
    results.push({at:{...(p?.at ?? {part:part ?? 'word/document.xml',area:'footer',tablePath:[],page:unknownPage('Колонтитул может повторяться на нескольких страницах')}),section:i+1,storyId:variant,range:undefined},ruleId:'footer.page',status:!profile.formatting||profile.documentMode!=='unframed'?'unknown':!part?'unknown':!p?'unknown':p.fieldStatus==='unsupported'?'unknown':align?.status!=='resolved'?'unknown':centered?'pass':'fail',severity:'warning',category:'page',title:'Номер страницы по центру нижнего колонтитула',location:`Раздел ${i+1} → нижний колонтитул ${variant}${p ? ` → ${p.location}`:''}`,actual:p?`PAGE, ${align?.value ?? 'выравнивание неизвестно'}`:null,expected:'PAGE, center',source:{part:part ?? 'word/document.xml',property:'PAGE'},origin:profile.formatting?'local':'analysis',profileVersion:`${profile.id}@${profile.version}`,reasonCode:profile.documentMode!=='unframed'?'unknown_context':!profile.formatting?'needs_layout':!p?'missing_fact':undefined,evidence:[{kind:'ooxml',detail:'Только абзац PAGE и его выравнивание'}],clause:'7.2.1 — частичная проверка свойства PAGE',explanation:!part?'Колонтитул не определён':'Проверяется собственный абзац поля PAGE; отображение, переключатели поля и печатный номер требуют ручной проверки',recommendation:'В Word откройте нижний колонтитул указанного раздела, выделите абзац поля PAGE и установите выравнивание по центру.'});
   }
  }
 }
 for(const section of requirements.requiredSections) {
  const found=document.paragraphs.some(p=>p.text.trim().toLocaleUpperCase('ru-RU')===section.toLocaleUpperCase('ru-RU'));
  results.push({at:{part:'word/document.xml',area:'document',tablePath:[],page:unknownPage()},ruleId:'structure.section',status:'unknown',severity:'warning',category:'structure',title:`Раздел «${section}»`,location:'Структура документа',actual:found?section:null,expected:section,source:null,clause:'Настраиваемый профиль',explanation:'Поиск текста не доказывает структурную роль абзаца',recommendation:'Проверьте заголовки разделов'});
 }
 const coverage: CheckReport['coverage']={pass:0,fail:0,unknown:0,not_applicable:0};
 for(const r of results) coverage[r.status]++;
 return {document,results,coverage,profile,profileConflicts:profileConflicts(profile),catalogCoverage:{total:IMPLEMENTATIONS.length,implemented:IMPLEMENTATIONS.filter(r=>r.state!=='unimplemented').length,unknown:new Set(results.filter(r=>r.origin==='standard'&&r.status==='unknown').map(r=>r.ruleId)).size,notApplicable:new Set(results.filter(r=>r.origin==='standard'&&r.status==='not_applicable').map(r=>r.ruleId)).size},findings:results.filter(r=>r.status==='fail'&&r.modality!=='recommendation'&&r.modality!=='permission').map((r,i)=>({...resultFinding(r,i),id:`${r.ruleId}:${i}`})),manualChecks:results.filter(r=>r.status==='unknown').map(r=>({title:`${r.location}: ${r.title}`,reason:r.explanation,clause:r.clause})),stats:{paragraphs:document.paragraphs.length,tables:document.tables,images:document.images,sections:document.sections.length},checkedAt:new Date().toISOString()};
}
export const units={TWIPS_PER_MM:56.6929133858};
