import { resultFinding } from './report';
import { unknownPage } from './analyzer/location';
import { openPackage } from './analyzer/package';
import { analyze } from './analyzer/resolve';
import { checks } from './checks/formatting';
import { DEFAULT_REQUIREMENTS } from './profiles/default';
import type { CheckReport, Requirements } from './types';
export { DEFAULT_REQUIREMENTS } from './profiles/default';
export async function checkDocx(data: ArrayBuffer | Uint8Array, requirements: Requirements = DEFAULT_REQUIREMENTS): Promise<CheckReport> {
 const pkg=await openPackage(data); const document=await analyze(pkg); const results=checks(document,requirements);
 if(requirements.requirePageNumbers) for(const [i,s] of document.sections.entries()) {
  for(const variant of new Set(['default',...Object.keys(s.footers)])) {
   const part=s.footers[variant]; const footer=part ? await pkg.read(part):undefined;
   const matches=document.paragraphs.filter(p=>part && p.id.startsWith(part+':') && (p.pageField || p.fieldStatus==='unsupported'));
   for(const p of matches.length?matches:[undefined]) {
    const align=p?.properties.align;
    const centered=align?.status==='resolved' && align.value==='center';
    results.push({at:{...(p?.at ?? {part:part ?? 'word/document.xml',area:'footer',tablePath:[],page:unknownPage('Колонтитул может повторяться на нескольких страницах')}),section:i+1,storyId:variant,range:undefined},ruleId:'footer.page',status:!footer?'unknown':!p?'fail':p.fieldStatus==='unsupported'?'unknown':align?.status!=='resolved'?'unknown':centered?'pass':'fail',severity:'warning',category:'page',title:'Номер страницы по центру нижнего колонтитула',location:`Раздел ${i+1} → нижний колонтитул ${variant}${p ? ` → ${p.location}`:''}`,actual:p?`PAGE, ${align?.value ?? 'выравнивание неизвестно'}`:null,expected:'PAGE, center',source:{part:part ?? 'word/document.xml',property:'PAGE'},clause:'Настраиваемый профиль',explanation:!footer?'Колонтитул не определён':'Проверяется собственный абзац поля PAGE; отображение, переключатели поля и печатный номер требуют ручной проверки',recommendation:'В Word откройте нижний колонтитул указанного раздела, выделите абзац поля PAGE и установите выравнивание по центру.'});
   }
  }
 }
 for(const section of requirements.requiredSections) {
  const found=document.paragraphs.some(p=>p.text.trim().toLocaleUpperCase('ru-RU')===section.toLocaleUpperCase('ru-RU'));
  results.push({at:{part:'word/document.xml',area:'document',tablePath:[],page:unknownPage()},ruleId:'structure.section',status:'unknown',severity:'warning',category:'structure',title:`Раздел «${section}»`,location:'Структура документа',actual:found?section:null,expected:section,source:null,clause:'Настраиваемый профиль',explanation:'Поиск текста не доказывает структурную роль абзаца',recommendation:'Проверьте заголовки разделов'});
 }
 const coverage: CheckReport['coverage']={pass:0,fail:0,unknown:0,not_applicable:0};
 for(const r of results) coverage[r.status]++;
 return {document,results,coverage,findings:results.filter(r=>r.status==='fail').map((r,i)=>({...resultFinding(r,i),id:`${r.ruleId}:${i}`})),manualChecks:results.filter(r=>r.status==='unknown').map(r=>({title:`${r.location}: ${r.title}`,reason:r.explanation,clause:r.clause})),stats:{paragraphs:document.paragraphs.length,tables:document.tables,images:document.images,sections:document.sections.length},checkedAt:new Date().toISOString()};
}
export const units={TWIPS_PER_MM:56.6929133858};
