import { CATALOG } from './catalog';
import type { Condition } from './schema';
export interface FactDefinition {
    key: string;
    provider: 'profile' | 'document' | 'object' | 'confirmed-layout' | 'expert';
    path: string;
    missing: 'unknown';
}
const keys = (c: Condition): string[] => c.op === 'always' ? [] : c.op === 'all' || c.op === 'any' ? c.args.flatMap(keys) : c.op === 'not' ? keys(c.arg) : c.op === 'every' || c.op === 'some' ? [c.fact, ...keys(c.where)] : 'fact' in c ? [c.fact] : [];
const profileKeys = ['workKind', 'documentMode', 'medium', 'execution', 'titleForm', 'approvalForm', 'approvalVariant', 'consultants', 'bibliographyGrouping', 'documentationSystem'];
/** A provider declaration describes where evidence must come from, not its availability. */
export const FACT_REGISTRY: readonly FactDefinition[] = [...new Set(CATALOG.rules.flatMap(r => [r.when, r.selector, ...r.exceptions].flatMap(keys)))].sort().map(key => ({ key, provider: key === 'confirmedPageCount' ? 'confirmed-layout' : profileKeys.includes(key) || key.startsWith('numbering.') ? 'profile' : ['has.tables', 'has.images', 'has.formulas', 'has.lists', 'has.headings'].includes(key) ? 'document' : key.startsWith('contentRequired.') ? 'expert' : 'object', path: key === 'stampForm' || key === 'drawingKind' || key === 'format' ? `artifactManifest[].sheets[].${key}` : key, missing: 'unknown' }));
