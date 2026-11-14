import type { RelationSpec, Scalar, Truth } from './schema';
export interface RelatedFact {
    id: string;
    collection: string;
    scope: string;
    targetId?: string;
    ownerId?: string;
    properties: Record<string, Scalar | Scalar[] | undefined>;
    confirmed: boolean;
}
/** Only resolved, explicitly linked objects may supply evidence for a relation. */
export function evaluateRelation(spec: RelationSpec, subject: RelatedFact, objects: readonly RelatedFact[]): Truth {
    if (!subject.confirmed || subject.collection !== spec.left.collection)
        return 'unknown';
    const left = subject.properties[spec.left.property];
    if (left === undefined || !spec.right)
        return 'unknown';
    const ref = spec.right;
    const id = ref.link === 'target' ? subject.targetId : ref.link === 'owner' ? subject.ownerId : ref.link === 'self' ? subject.id : undefined;
    if (!id)
        return 'unknown';
    const candidates = objects.filter(o => o.id === id && o.collection === ref.collection && o.scope === subject.scope);
    if (candidates.length !== 1 || !candidates[0].confirmed)
        return 'unknown';
    const right = candidates[0].properties[ref.property];
    if (right === undefined)
        return 'unknown';
    if (spec.validator === 'same-property')
        return Array.isArray(left) && Array.isArray(right) ? left.length === right.length && left.every((v, i) => v === right[i]) : left === right;
    if (spec.validator === 'membership')
        return Array.isArray(right) && !Array.isArray(left) ? right.includes(left) : 'unknown';
    // Geometric, form and expert validators require evidence adapters. A name is not proof.
    return 'unknown';
}
