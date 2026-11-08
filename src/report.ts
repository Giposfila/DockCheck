import type { CheckReport, CheckResult, Finding } from './types';
import { pageLabel, unknownPage } from './analyzer/location';
export const statusLabels = {pass:'Проверено',fail:'Нарушение',unknown:'Не удалось проверить',not_applicable:'Не применяется'};
export function displayValue(value: unknown, unit?:string): string {
 const units:Record<string,string>={pt:'пт',mm:'мм',multiplier:'×',count:'шт.'};
 const names:Record<string,string>={both:'по ширине',center:'по центру',left:'слева',right:'справа',true:'да',false:'нет'};
 const v=Array.isArray(value)?value.join(' или '):value===null||value===undefined?'не определено':names[String(value)] ?? String(value);
 return `${v}${unit ? ` ${units[unit] ?? unit}`:''}`;
}
export function resultFinding(r:CheckResult,index:number):Finding {
 return {normSource:r.normSource,modality:r.modality,origin:r.origin,reasonCode:r.reasonCode,evidence:r.evidence,id:String(index),severity:r.severity,category:r.category,title:r.status==='fail'?`${r.title}: ${displayValue(r.actual,r.unit)} вместо ${displayValue(r.expected,r.unit)}`:`${statusLabels[r.status]}: ${r.title}`,location:r.location,at:r.at,paragraphText:r.paragraphText,excerpt:r.at?.range && r.paragraphText!==undefined?r.paragraphText.slice(r.at.range.start,r.at.range.end):undefined,actual:displayValue(r.actual,r.unit),expected:displayValue(r.expected,r.unit),clause:r.clause,source:r.source,recommendation:r.recommendation,explanation:r.explanation,unit:r.unit};
}
export function groupResults(results:CheckResult[]):Map<string,CheckResult[]> {
 const groups=new Map<string,CheckResult[]>();
 for(const r of results) {const key=r.origin==='standard'&&r.status==='unknown'?`unknown:${r.reasonCode}`:`${r.status}:${r.ruleId}`;const group=groups.get(key) ?? [];group.push(r);groups.set(key,group);}
 return groups;
}
export function exportReportJson(report:CheckReport):string {return JSON.stringify({schemaVersion:1,report},null,2);}
export function exportReport(report:CheckReport):string {
 return `ДОКЧЕК — СРАВНЕНИЕ С НАСТРАИВАЕМЫМ ПРОФИЛЕМ\nФайл: ${report.fileName ?? ''}\nПроверено: ${report.checkedAt}\nПрофиль: ${report.profile?.id??'legacy'}@${report.profile?.version??'1'}; каталог: ${report.profile?.catalogVersion??'не указан'}\nУстаревший отчёт: ${report.stale??false}\nКонфликты: ${JSON.stringify(report.profileConflicts??[])}\nУчёт норм каталога: ${JSON.stringify(report.catalogCoverage??{})}\nСтатусы результатов (не процент соответствия СТУ): ${JSON.stringify(report.coverage)}\n\n`+report.results.map((r,i)=>{
  const f=resultFinding(r,i);
  return `${i+1}. [${statusLabels[r.status]}] ${f.title}\n${r.location}\n${pageLabel(r.at?.page ?? unknownPage())}\nРасположение: ${JSON.stringify(r.at ?? {area:'document',page:unknownPage()})}\nЦитата: ${f.excerpt===undefined?'Текстовая цитата неприменима':JSON.stringify(f.excerpt)}\nПолный абзац: ${r.paragraphText===undefined?'неприменим':JSON.stringify(r.paragraphText)}\nФакт: ${f.actual}; требование: ${f.expected}\nИсточник: ${JSON.stringify(r.source)}\nОбласть: ${r.scope ?? r.category}; свойство: ${r.property ?? r.ruleId}; допуск: ${r.tolerance ?? 'не применяется'}\nНормативный источник: ${JSON.stringify(r.normSource??null)}\nПроисхождение: ${r.origin??'local'}; модальность: ${r.modality??'не указана'}; профиль: ${r.profileVersion??'не указан'}\nПрименимость: ${r.applicability??'unknown'}; причина: ${r.reasonCode??'не требуется'}\nДоказательства: ${JSON.stringify(r.evidence??[])}\nПункт: ${r.clause}\n${r.explanation}\n${r.recommendation}`;
 }).join('\n\n')+'\n\nЧастичная проверка оформления не доказывает соответствие документа.';
}
