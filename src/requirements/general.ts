import { CATALOG, COVERAGE } from './catalog';
import { deepFreeze } from './schema';
import type { Rule } from './schema';

// Boundary from Основные.md and По видам.md. Do not infer common rules
// from a selected work kind: 7.1.2/7.1.3 and title forms belong to part two.
function commonSource(source: Rule['source']): boolean {
 const clause = source.clause;
 if (clause === 'Приложение У') return true;
 if (source.appendix) return source.appendix === 'У';
 return /^(5\.[1-4](?:$|\D)|6\.(?:1(?:$|\D)|2\.[12](?:$|\D)|[4-9](?:$|\D)|10(?:$|\D))|7\.(?:1\.1(?:$|\D)|[2-9](?:$|\D)|1[01](?:$|\D)))/.test(clause);
}
const specific = new Set(['stu.title.form', 'stu.title.specialty', 'stu.title.reviewer', 'stu.title.approval-page', 'stu.title.approval']);
export const GENERAL_RULES = deepFreeze(CATALOG.rules.filter(rule => commonSource(rule.source) && !specific.has(rule.id)).map(rule => {
 const common: Rule = structuredClone(rule);
 // These sections are optional; their formatting applies when present.
 if (rule.source.clause === '6.5') common.when = { op: 'eq', fact: 'has.introduction', value: true };
 if (rule.source.clause === '6.7') common.when = { op: 'eq', fact: 'has.conclusion', value: true };
 return common;
}));
export const GENERAL_CATALOG = deepFreeze({ ...CATALOG, scope: 'general', sourceFile: 'Основные.md', rules: GENERAL_RULES });
const ids = new Set(GENERAL_RULES.map(rule => rule.id));
export const GENERAL_COVERAGE = deepFreeze(COVERAGE.filter(row => commonSource(row.source)).map(row => ({ ...row, ruleIds: row.ruleIds.filter(id => ids.has(id)) })).filter(row => !row.ruleIds.length ? row.decision !== 'included' : true));
export const GENERAL_EXCLUSIONS = deepFreeze(GENERAL_COVERAGE.filter(row => row.decision === 'excluded'));
