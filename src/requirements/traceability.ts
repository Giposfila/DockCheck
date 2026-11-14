import { validateCatalog } from './schema';
import type { Rule, SourceLocator } from './schema';
export interface SourceAtom {
    id: string;
    locator: SourceLocator;
    kind: 'norm' | 'example' | 'definition' | 'reference';
}
export interface AtomDecision {
    atomId: string;
    kind: 'included' | 'expert' | 'external' | 'context';
    ruleIds: string[];
    rationale: string;
}
export interface TraceabilitySummary {
    total: number;
    covered: number;
    percent: number;
    unresolved: string[];
}
/** No clause/range fallback: each atom must have an explicit, source-bound decision. */
export function assessTraceability(atoms: readonly SourceAtom[], decisions: readonly AtomDecision[], rules: Rule[]): TraceabilitySummary {
    validateCatalog(rules);
    const byId = new Map(rules.map(r => [r.id, r]));
    const atomIds = new Set<string>();
    for (const atom of atoms) {
        if (!['norm', 'example', 'definition', 'reference'].includes(atom.kind) || !atom.id || atomIds.has(atom.id) || atom.locator.atomId !== atom.id || !Number.isInteger(atom.locator.firstLine) || !Number.isInteger(atom.locator.lastLine) || atom.locator.firstLine < 1 || atom.locator.lastLine < atom.locator.firstLine || !['documentSha256', 'sha256'].every(k => /^[a-f0-9]{64}$/.test(atom.locator[k as 'sha256' | 'documentSha256'])))
            throw Error('Повторный или неверный атом');
        atomIds.add(atom.id);
    }
    const links = new Map<string, AtomDecision>();
    for (const d of decisions) {
        if (!atomIds.has(d.atomId) || links.has(d.atomId) || new Set(d.ruleIds).size !== d.ruleIds.length || !d.rationale.trim() || !['included', 'expert', 'external', 'context'].includes(d.kind))
            throw Error('Неверное решение по атому');
        for (const id of d.ruleIds)
            if (!byId.has(id))
                throw Error(`Нет правила ${id}`);
        links.set(d.atomId, d);
    }
    const unresolved = atoms.filter(atom => {
        const d = links.get(atom.id);
        if (!d)
            return true;
        if (atom.kind !== 'norm')
            return d.kind !== 'context';
        if (d.kind === 'context' || !d.ruleIds.length)
            return true;
        return d.ruleIds.some(id => {
            const r = byId.get(id)!;
            const locator = r.source.locators?.find(l => l.atomId === atom.id);
            if (!locator || (['atomId', 'documentSha256', 'sha256', 'firstLine', 'lastLine'] as const).some(k => locator[k] !== atom.locator[k]))
                return true;
            if (d.kind === 'expert' && !r.evidence.includes('manual'))
                return true;
            if (d.kind === 'external' && (!r.externalDependencies.length || !r.evidence.includes('external-standard')))
                return true;
            return false;
        });
    }).map(a => a.id);
    return { total: atoms.length, covered: atoms.length - unresolved.length, percent: atoms.length ? (atoms.length - unresolved.length) * 100 / atoms.length : 0, unresolved };
}
