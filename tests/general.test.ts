import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GENERAL_RULES, GENERAL_COVERAGE } from '../src/requirements/general';
import { DEFAULT_PROFILE, WORK_KINDS } from '../src/requirements/profile';
import { evaluateRequirements, IMPLEMENTATIONS } from '../src/requirements/engine';
import { checkDocx } from '../src/checker';
import type { DocumentModel } from '../src/analyzer/model';
const model: DocumentModel = { paragraphs: [], sections: [], objects: [], tables: 0, images: 0, unsupported: [], limitations: [] };
describe('common requirements only', () => {
 it('keeps common elements and formatting without requiring optional sections', () => {
  const ids = GENERAL_RULES.map(r => r.id);
  for (const id of ['structure.title', 'structure.body', 'title.first', 'text.font', 'text.size', 'table.text-size', 'contents.short']) expect(ids).toContain(`stu.${id}`);
  const results = evaluateRequirements(model, structuredClone(DEFAULT_PROFILE), []);
  expect(results.find(r => r.ruleId === 'stu.introduction-content.goal')).toMatchObject({ status: 'unknown', applicability: 'unknown' });
 });
 it.each(WORK_KINDS)('never restores type-specific norms for %s', workKind => {
  const results = evaluateRequirements(model, { ...structuredClone(DEFAULT_PROFILE), workKind, approvalVariant: 'combined', consultants: 3 }, []);
  for (const result of results) {
   expect(result.ruleId).not.toMatch(/^stu\.(abstract|keywords|assignment|procedure|margin|stamp|fold|slide|drawing|poster|document)\./);
   expect(result.ruleId).not.toMatch(/^stu\.title\.(form|specialty|reviewer|approval|combined)/);
   expect(result.normSource?.clause).not.toMatch(/^(5\.[5-8]|6\.3|7\.1\.[23]|[89]\.)/);
  }
  expect(results.map(r => r.ruleId)).toEqual(GENERAL_RULES.map(r => r.id));
 });
 it('uses the same scope for reports, manual checks and coverage', async () => {
  const report = await checkDocx(new Uint8Array(await readFile(new URL('./fixtures/correct.docx', import.meta.url))));
  expect(report.catalogCoverage?.total).toBe(GENERAL_RULES.length);
  expect(IMPLEMENTATIONS.map(r => r.ruleId)).toEqual(GENERAL_RULES.map(r => r.id));
  expect(report.results.some(r => r.ruleId === 'footer.page')).toBe(false);
  expect(report.manualChecks.some(r => /7\.1\.[23]|6\.3\./.test(r.clause))).toBe(false);
  expect(GENERAL_COVERAGE.some(row => row.id === 'appendix.U.laws')).toBe(true);
  const ids = new Set(GENERAL_RULES.map(r => r.id));
  expect(GENERAL_COVERAGE.every(row => row.ruleIds.every(id => ids.has(id)))).toBe(true);
 });
});
it('excludes subjective expert judgments from active checking and manual tasks', async()=>{
 expect(GENERAL_RULES.some(r=>r.id.startsWith('stu.expert.')||r.assertion.relation?.validator==='expert')).toBe(false);
 const report=await checkDocx(new Uint8Array(await readFile(new URL('./fixtures/correct.docx',import.meta.url))));
 expect(report.results.some(r=>r.ruleId.startsWith('stu.expert.'))).toBe(false);
 expect(report.manualChecks.some(r=>/Логичность, однозначность|Краткость и смысловое соответствие|Содержательная полнота основной части/.test(r.title))).toBe(false);
});
