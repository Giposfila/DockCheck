import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/requirements/catalog';
import { DEFAULT_PROFILE, parseProfile } from '../src/requirements/profile';
import { evaluateRequirements, applicability, profileFacts } from '../src/requirements/engine';
import { evaluate, validateCatalog } from '../src/requirements/schema';
import { evaluateRelation } from '../src/requirements/relations';
import { FACT_REGISTRY } from '../src/requirements/facts';
import { DOCUMENT_CODES, SCHEME_KINDS, SCHEME_TYPES, VISUAL_REFERENCES, TITLE_BLOCKS } from '../src/requirements/referenceData';
import { assessTraceability } from '../src/requirements/traceability';
import type { DocumentModel } from '../src/analyzer/model';
import type { Rule, SourceLocator } from '../src/requirements/schema';
const model = (): DocumentModel => ({ paragraphs: [], sections: [], objects: [], tables: 0, images: 0, unsupported: [], limitations: [] });
const profile = () => structuredClone(DEFAULT_PROFILE);
const rule = (id: string) => structuredClone(CATALOG.rules.find(r => r.id === `stu.${id}`)!);
const result = (id: string, p = profile()) => evaluateRequirements(model(), p, []).find(r => r.ruleId === `stu.${id}`)!;
describe('requirements audit regression coverage', () => {
    it('compares only confirmed explicitly linked object properties', () => {
        const spec = rule('contents.identity').assertion.relation!;
        const entry = { id: 'e1', collection: 'contentsEntries', scope: 'doc', targetId: 'h2', properties: { title: 'Introduction' }, confirmed: true };
        const headings = [{ id: 'h1', collection: 'headings', scope: 'doc', properties: { title: 'Introduction' }, confirmed: true }, { id: 'h2', collection: 'headings', scope: 'doc', properties: { title: 'Methods' }, confirmed: true }];
        expect(evaluateRelation(spec, entry, headings)).toBe(false);
        expect(evaluateRelation(spec, { ...entry, targetId: undefined }, headings)).toBe('unknown');
        expect(evaluateRelation(spec, { ...entry, targetId: 'h1' }, headings)).toBe(true);
        expect(evaluateRelation(spec, entry, headings.map(h => ({ ...h, confirmed: false })))).toBe('unknown');
        expect(() => validateCatalog([{ ...rule('contents.identity'), assertion: { op: 'relation', value: 'unsafe', relation: { ...spec, validator: 'eval' } as never } }])).toThrow();
    });
    it('expresses exact numeric thresholds and quantified unknown collections', () => {
        const short = rule('contents.short');
        expect(applicability(short, { confirmedPageCount: 24 })).toBe(true);
        expect(applicability(short, { confirmedPageCount: 25 })).toBe(false);
        expect(applicability(short, { estimatedPageCount: 12 })).toBe('unknown');
        const c = { op: 'every' as const, fact: 'sheets', where: { op: 'eq' as const, fact: 'format', value: 'A4' } };
        expect(evaluate(c, { sheets: [{ format: 'A4' }, {}] })).toBe('unknown');
        expect(evaluate(c, { sheets: [{ format: 'A4' }, { format: 'A3' }] })).toBe(false);
        expect(evaluate(c, {})).toBe('unknown');
        expect(() => validateCatalog([{ ...short, when: { op: 'lte', fact: 'x', value: NaN } }])).toThrow();
    });
    it('declares object fact providers and preserves unavailable document context', () => {
        expect(FACT_REGISTRY.find(f => f.key === 'stampForm')?.path).toBe('artifactManifest[].sheets[].stampForm');
        const facts = profileFacts({ ...profile(), numbering: { appendices: 'separate', formulas: 'section' } }, model());
        expect(facts['numbering.formulas']).toBe('section');
        expect(facts['has.contents']).toBeUndefined();
        expect(facts.stampForm).toBeUndefined();
    });
    it('never disables required headings because no headings were found', () => {
        expect(result('heading.sections').status).toBe('unknown');
        expect(applicability(rule('heading.sections'), { 'has.headings': false })).toBe(true);
        expect(applicability(rule('heading.points'), { pointsWithSubpoints: 2 })).toBe(true);
        expect(applicability(rule('heading.points'), { pointsWithSubpoints: 1 })).toBe(false);
    });
    it('retains content components for expert review with the original normative force', () => {
        expect(rule('abstract-content.goal')).toMatchObject({ modality: 'mandatory', evidence: ['structure', 'manual'] });
        expect(rule('introduction-content.methods').modality).toBe('mandatory');
        expect(rule('conclusion-content.technical-economic-efficiency').modality).toBe('permission');
        expect(result('abstract-content.goal', { ...profile(), workKind: 'bachelor' }).status).toBe('unknown');
        expect(rule('expert.clarity').evidence).toContain('manual');
    });
    it('separates permission from restrictions on the chosen variant', () => {
        expect(rule('formula.handwritten').modality).toBe('permission');
        expect(rule('formula.handwritten-ink')).toMatchObject({ modality: 'mandatory', assertion: { op: 'eq', value: 'black' } });
        expect(applicability(rule('formula.handwritten-ink'), { 'has.handwritten-formulas': true })).toBe(true);
        expect(rule('appendix.format-eligibility').modality).toBe('mandatory');
    });
    it('keeps object exceptions and continuation conditions distinct', () => {
        expect(applicability(rule('formula-number.sequence'), { 'has.formulas': true, 'numbering.formulas': 'continuous', 'formula.scope': 'table' })).toBe(false);
        expect(applicability(rule('formula-number.sequence'), { 'has.formulas': true, 'numbering.formulas': 'continuous' })).toBe('unknown');
        expect(applicability(rule('table-units.common'), { 'has.tables': true, 'table.units': 'mixed' })).toBe(false);
        expect(applicability(rule('table-units.mixed'), { 'has.tables': true, 'table.units': 'mixed' })).toBe(true);
        expect(applicability(rule('table-continuation.header'), { 'has.tables': true, 'table.continued': false })).toBe(false);
        expect(applicability(rule('appendix-pages.separate-title'), { 'has.appendices': true, 'appendix.variant': 'continued' })).toBe(false);
    });
    it('selects numbering alternatives and requires their prerequisites', () => {
        expect(applicability(rule('table-number.sequence'), { 'has.tables': true, 'numbering.tables': 'section', scope: 'body' })).toBe(false);
        expect(rule('table.section-numbering').dependsOn).toEqual(['stu.table-number.arabic']);
        const r = result('table.section-numbering', { ...profile(), numbering: { appendices: 'separate', tables: 'section' } });
        expect(r.status).toBe('not_applicable'); // No tables in a fully supported empty model.
    });
    it('applies stamp cells to sheets independently of bachelor text framing', () => {
        const p = parseProfile({ ...profile(), workKind: 'bachelor', documentMode: 'unframed', artifactManifest: [{ id: 'graphics', kind: 'drawing', name: 'Чертеж', provided: true, source: 'Задание', sheets: [{ id: 'd1', format: 'A1', stampForm: '5', drawingKind: 'detail', documentationSystem: 'ESKD' }, { id: 'd2', format: 'A3', stampForm: '3' }] }] });
        const results = evaluateRequirements(model(), p, []).filter(r => r.ruleId === 'stu.stamp.cell.7');
        expect(results).toHaveLength(2);
        expect(results.every(r => r.status === 'unknown' && r.applicability === true)).toBe(true);
        const mass = evaluateRequirements(model(), p, []).filter(r => r.ruleId === 'stu.stamp.cell.14');
        expect(mass.map(r => r.status)).toEqual(['unknown', 'not_applicable']);
    });
    it('models constants and repeated signatory fields without inventing approval blocks', () => {
        expect(TITLE_BLOCKS['Е'].find(b => b.role === 'consultant')).toMatchObject({ repeated: true, fields: ['signature', 'date', 'initials', 'surname', 'section'] });
        for (const form of ['И', 'К', 'М', 'Н'])
            expect(TITLE_BLOCKS[form].some(b => b.role === 'approver')).toBe(false);
        expect(TITLE_BLOCKS['Б'].find(b => b.role === 'constant')?.fields).toContain('ministry');
        expect(TITLE_BLOCKS['Б'].find(b => b.role === 'reviewer')?.optional).toBe(true);
    });
    it('retains individual missing norms and external dependencies', () => {
        expect(rule('figure-explanation.font')).toMatchObject({ modality: 'recommendation', assertion: { value: 'Times New Roman' } });
        expect(rule('general.gost-text').externalDependencies).toContain('ГОСТ Р 2.105–2019');
        expect(rule('stamp.cell.14').externalDependencies).toContain('ГОСТ 2.109 (редакция в СТУ не указана)');
        expect(rule('stamp.cell.15').externalDependencies).toContain('ГОСТ 2.302–68');
        expect(rule('keywords.inline').modality).toBe('mandatory');
        expect(applicability(rule('pagination.footer'), { documentMode: 'framed' })).toBe(false);
    });
    it('separates carrier from execution and folds only the selected drawing/poster format', () => {
        const p = parseProfile({ ...profile(), medium: 'paper', execution: 'handwritten', artifactManifest: [{ id: 'p', kind: 'poster', name: 'Плакат', provided: true, source: 'Задание', sheets: [{ id: 'one', format: 'A1' }] }] });
        expect(profileFacts(p, model())).toMatchObject({ medium: 'paper', execution: 'handwritten' });
        expect(applicability(rule('handwritten.ink'), profileFacts(p, model()))).toBe(true);
        expect(applicability(rule('print.white'), profileFacts(p, model()))).toBe(true);
        const results = evaluateRequirements(model(), p, []);
        expect(results.find(r => r.ruleId === 'stu.fold.A1')?.status).toBe('unknown');
        for (const id of ['A2', 'A3'])
            expect(results.find(r => r.ruleId === `stu.fold.${id}`)?.status).toBe('not_applicable');
        expect(() => parseProfile({ ...p, artifactManifest: [{ ...p.artifactManifest![0], parentId: 'missing' }] })).toThrow();
    });
    it('accepts independent local requirements with provenance and preserves the standard', () => {
        const { source: _source, ...base } = rule('structure.body');
        const local = { id: 'local.test-results', source: 'Методические указания, пункт 4', explanation: 'Раздел результатов испытаний', rule: { ...base, id: 'local.test-results', property: 'structure.test-results', assertion: { op: 'eq' as const, value: true } } };
        const p = parseProfile({ ...profile(), localAdditions: [local] });
        expect(result('structure.body', p).origin).toBe('standard');
        const r = evaluateRequirements(model(), p, []).find(r => r.ruleId === local.id)!;
        expect(r).toMatchObject({ origin: 'local', status: 'unknown', clause: local.source });
        expect(r.normSource).toBeUndefined();
        expect(() => parseProfile({ ...p, localAdditions: [{ ...local, source: '' }] })).toThrow();
        expect(parseProfile({ ...profile(), catalogVersion: 'stu-2021.1' }).catalogVersion).toBe('stu-2021.2');
    });
    it('provides informative codes and source-bound geometric references', () => {
        expect(DOCUMENT_CODES.find(c => c.name === 'Пояснительная записка')?.code).toBe('ПЗ');
        expect(DOCUMENT_CODES.find(c => c.name === 'Сборочный чертеж')?.code).toBe('СБ');
        expect(DOCUMENT_CODES.every(c => c.source.appendixStatus === 'informative')).toBe(true);
        expect(SCHEME_KINDS).toHaveLength(9);
        expect(SCHEME_TYPES).toHaveLength(8);
        expect(VISUAL_REFERENCES.find(r => r.id === 'appendix-Ф')).toMatchObject({ pages: [57, 58], automaticValidatorAvailable: false });
    });
    it('does not infer atomic coverage from any rule sharing a clause', () => {
        const locator: SourceLocator = { atomId: 'kw.inline', documentSha256: 'a'.repeat(64), sha256: 'b'.repeat(64), firstLine: 655, lastLine: 656 };
        const atoms = [{ id: 'kw.inline', locator, kind: 'norm' as const }];
        const d = [{ atomId: 'kw.inline', kind: 'included' as const, ruleIds: ['stu.keywords.inline'], rationale: 'В строку' }];
        const r = rule('keywords.inline');
        expect(assessTraceability(atoms, d, [r]).percent).toBe(0);
        r.source.locators = [locator];
        expect(assessTraceability(atoms, d, [r])).toMatchObject({ percent: 100, unresolved: [] });
        expect(assessTraceability([...atoms, { ...atoms[0], id: 'kw.commas', locator: { ...locator, atomId: 'kw.commas' } }], d, [r]).percent).toBe(50);
        expect(() => assessTraceability(atoms, [...d, ...d], [r])).toThrow();
    });
});
