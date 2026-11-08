import { openPackage, all, attr, child } from './analyzer/package';
import { analyze } from './analyzer/resolve';
import { checks } from './checks/formatting';
import { DEFAULT_REQUIREMENTS } from './profiles/default';
import type { CheckReport, Requirements, CheckResult } from './types';
export { DEFAULT_REQUIREMENTS } from './profiles/default';
export async function checkDocx(data: ArrayBuffer | Uint8Array, requirements: Requirements = DEFAULT_REQUIREMENTS): Promise<CheckReport> {
 const pkg=await openPackage(data); const document=await analyze(pkg); const results=checks(document,requirements);
 if(requirements.requirePageNumbers) for(const [i,s] of document.sections.entries()) {
  for(const variant of new Set(['default',...Object.keys(s.footers)])) {
   const part=s.footers[variant]; const footer=part ? await pkg.read(part):undefined;
   const matches=document.paragraphs.filter(p=>part && p.id.startsWith(part+':') && p.pageField);
   const pageParas=matches;
   const centered=matches.some(p=>p.properties.align?.status==='resolved' && p.properties.align.value==='center');
   results.push({ruleId:'footer.page',status:!footer?'unknown':!pageParas.length?'fail':centered?'pass':matches.some(p=>p.properties.align?.status!=='resolved')?'unknown':'fail',severity:'warning',category:'page',title:'Номер страницы по центру нижнего колонтитула',location:`Раздел ${i+1} → ${variant}`,actual:centered?'PAGE, center':null,expected:'PAGE, center',source:{part:part ?? 'word/document.xml',property:'PAGE'},clause:'Настраиваемый профиль',explanation:!footer?'Колонтитул не определён':'Проверяется абзац поля PAGE; отображение и формат номера требуют ручной проверки',recommendation:'Добавьте поле PAGE и выровняйте его абзац по центру'});
  }
 }
 for(const section of requirements.requiredSections) {
  const found=document.paragraphs.some(p=>p.text.trim().toLocaleUpperCase('ru-RU')===section.toLocaleUpperCase('ru-RU'));
  results.push({ruleId:'structure.section',status:found?'pass':'unknown',severity:'warning',category:'structure',title:`Не найден раздел «${section}»`,location:'Структура документа',actual:found?section:null,expected:section,source:null,clause:'Настраиваемый профиль',explanation:'Поиск текста не доказывает структурную роль абзаца',recommendation:'Проверьте заголовки разделов'});
 }
 const coverage: CheckReport['coverage']={pass:0,fail:0,unknown:0,not_applicable:0};
 for(const r of results) coverage[r.status]++;
 return {document,results,coverage,findings:results.filter(r=>r.status==='fail').map((r,i)=>({id:`${r.ruleId}:${i}`,severity:r.severity,category:r.category,title:r.title,location:r.location,actual:String(r.actual),expected:JSON.stringify(r.expected),clause:r.clause,source:r.source,recommendation:r.recommendation})),manualChecks:results.filter(r=>r.status==='unknown').map(r=>({title:`${r.location}: ${r.title}`,reason:r.explanation,clause:r.clause})),stats:{paragraphs:document.paragraphs.length,tables:document.tables,images:document.images,sections:document.sections.length},checkedAt:new Date().toISOString()};
}
export const units={TWIPS_PER_MM:56.6929133858};
