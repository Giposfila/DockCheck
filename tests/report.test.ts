import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { checkDocx } from '../src/checker';
import { exportReport, exportReportJson, visibleViolations } from '../src/report';
import { unknownPage } from '../src/analyzer/location';
import type { CheckResult } from '../src/types';

const violation: CheckResult = {
 ruleId:'stu.text.size', status:'fail', origin:'standard', modality:'mandatory',
 applicability:true, category:'text', severity:'error', title:'Размер шрифта',
 location:'Основной текст → абзац 1', actual:12, expected:14, unit:'pt',
 source:{part:'word/document.xml',property:'fontSize'}, clause:'7.1.1',
 evidence:[{kind:'ooxml',detail:'Размер фрагмента 12 пт'}],
 explanation:'Сравнение подтверждённого свойства', recommendation:'Установите 14 пт.',
 paragraphText:'Текст Текст',
 at:{part:'word/document.xml',area:'body',tablePath:[],page:unknownPage(),range:{start:6,end:11,unit:'utf16'}}
};
it('shows only proven mandatory general violations and preserves their locations', () => {
 const hidden: CheckResult[] = [
  {...violation,status:'unknown',reasonCode:'ambiguous_role'},
  {...violation,status:'pass'}, {...violation,status:'not_applicable'},
  {...violation,category:'structure'}, {...violation,modality:'recommendation'},
  {...violation,modality:'permission'}, {...violation,origin:'local'},
  {...violation,origin:'analysis'}, {...violation,ruleId:'stu.document.framed-mode'},
  {...violation,applicability:'unknown'}, {...violation,reasonCode:'needs_layout'},
  {...violation,evidence:[{kind:'user-context',detail:'Только настройка профиля'}]}
 ];
 expect(visibleViolations([...hidden,violation])).toEqual([violation]);
 expect(visibleViolations([{...violation,modality:'prohibition'}])).toHaveLength(1);
});
it('uses the same selection for text and JSON exports without changing diagnostics', async () => {
 const report=await checkDocx(await readFile(new URL('./fixtures/incorrect.docx',import.meta.url)));
 const hidden={...violation,status:'unknown' as const,title:'Скрытая ручная проверка'};
 report.results=[hidden,violation];
 const output=exportReport(report);
 expect(output).toContain('Подтверждённых нарушений: 1');
 expect(output).toContain('Цитата: "Текст"');
 expect(output).toContain('"start":6,"end":11,"unit":"utf16"');
 expect(output).toContain('12 пт');expect(output).toContain('14 пт');
 expect(output).not.toContain(hidden.title);
 const exported=JSON.parse(exportReportJson(report)).report;
 expect(exported.results).toEqual([violation]);
 expect(exported.findings).toHaveLength(1);
 expect(exported.findings[0].excerpt).toBe('Текст');
 expect(exported.manualChecks).toBeUndefined();
 expect(report.results).toEqual([hidden,violation]);
});
it('separates confirmed checks from unknown, subjective and advisory results', async()=>{
 const { confirmedChecks }=await import('../src/report');
 const passed={...violation,status:'pass' as const};
 const subjective={...violation,ruleId:'stu.expert.clarity'};
 expect(confirmedChecks([violation,passed,subjective,{...violation,status:'unknown'},{...violation,modality:'recommendation'}])).toEqual([violation,passed]);
 const report=await checkDocx(await readFile(new URL('./fixtures/incorrect.docx',import.meta.url)));
 report.results=[violation,passed,{...violation,status:'unknown'}];
 const output=exportReport(report);
 expect(output.split('1. [')[0]).not.toContain('unknown');expect(output).not.toContain('Не удалось проверить');
 const exported=JSON.parse(exportReportJson(report)).report;
 expect(exported.coverage).toEqual({pass:1,fail:1,unknown:0,not_applicable:0});
});
