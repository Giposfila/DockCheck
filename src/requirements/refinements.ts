import { TITLE_BLOCKS } from './referenceData';
import { always, EDITION, eq } from './schema';
import type { Assertion, Condition, CoverageRow, Rule } from './schema';
/** Reviewed corrections to the first catalog. Unsupported evidence stays explicit. */
export function refineCatalog(rules: Rule[], matrix: CoverageRow[]) {
    const get = (id: string) => { const rule = rules.find(r => r.id === `stu.${id}`); if (!rule)
        throw Error(`Нет правила ${id}`); return rule; };
    const all = (...args: Condition[]): Condition => ({ op: 'all', args });
    const any = (...args: Condition[]): Condition => ({ op: 'any', args });
    const has = (kind: string) => eq(`has.${kind}`, true);
    const vkr: Condition = { op: 'in', fact: 'workKind', value: ['master', 'diploma-project', 'diploma-work', 'bachelor'] };
    const add = (id: string, clause: string, pdfPage: number, title: string, assertion: Assertion, options: Partial<Rule> = {}) => {
        const rule: Rule = { ...get('structure.body'), id: `stu.${id}`, title, description: title, source: { edition: EDITION, clause, pdfPage }, property: id, assertion, when: always, selector: always, exceptions: [], alternatives: [], dependsOn: [], evidence: ['manual'], externalDependencies: [], explanation: title, recommendation: `Проверьте ${title.toLowerCase()} по ${clause}.`, ...options };
        rules.push(rule);
        matrix.push({ id: `fragment.${id}`, source: rule.source, summary: title, type: rule.modality === 'mandatory' || rule.modality === 'prohibition' ? 'formal' : rule.modality, ruleIds: [rule.id], decision: 'included', reason: 'Атомарное требование восстановлено при сверке аудита', evidence: rule.evidence, implementation: 'unimplemented', questions: [] });
        return rule;
    };
    const relation = (value: string): Assertion => ({ op: 'relation', value });
    get('heading.sections').when = always;
    get('heading.sections').target = 'object';
    get('heading.sections').selector = { op: 'in', fact: 'kind', value: ['section', 'subsection'] };
    get('heading.points').when = { op: 'gte', fact: 'pointsWithSubpoints', value: 2 };
    get('pagination.footer').when = eq('documentMode', 'unframed');
    get('contents.short').when = { op: 'lte', fact: 'confirmedPageCount', value: 24 };
    get('contents.short').property = 'has.contents';
    get('contents.short').assertion = { op: 'eq', value: false };
    for (const rule of rules) {
        // Execution method and carrier are independent facts. Old profiles retain handwritten semantics.
        const replace = (c: Condition): Condition => c.op === 'eq' && c.fact === 'medium' && c.value === 'handwritten' ? eq('execution', 'handwritten') : c.op === 'not' ? { ...c, arg: replace(c.arg) } : c.op === 'all' || c.op === 'any' ? { ...c, args: c.args.map(replace) } : c;
        rule.when = replace(rule.when);
    }
    get('print.computer').exceptions = [eq('execution', 'handwritten')];
    get('title.approval').when = { op: 'in', fact: 'titleForm', value: ['Б', 'В', 'Г', 'Д', 'Ж', 'Л'] };
    get('title.approval-page').when = all(vkr, eq('approvalVariant', 'separate'));
    get('title.approval-page').assertion = { op: 'eq', value: 'Е' };
    get('title.approval-page').property = 'approvalForm';
    add('general.gost-text', '5.3', 9, 'Текстовые документы по разделам 5 и 6 ГОСТ Р 2.105', relation('Разделы 5 и 6'), { evidence: ['external-standard'], externalDependencies: ['ГОСТ Р 2.105–2019'] });
    add('keywords.inline', '6.3.1', 11, 'Ключевые слова в строку', { op: 'eq', value: true }, { when: vkr, evidence: ['structure', 'layout'] });
    add('figure-explanation.font', '7.8.3', 23, 'Шрифт поясняющих данных: рекомендуется Times New Roman', { op: 'eq', value: 'Times New Roman' }, { target: 'run', property: 'font', selector: eq('role', 'figure-explanation'), modality: 'recommendation', evidence: ['structure', 'ooxml'], category: 'figure' });
    get('formula.handwritten').title = 'Допустима рукописная вставка формул и обозначений';
    get('formula.handwritten').assertion = relation('Рукописный вариант разрешён');
    add('formula.handwritten-ink', '7.6.9', 18, 'Рукописные формулы и обозначения: чёрная паста', { op: 'eq', value: 'black' }, { when: has('handwritten-formulas'), target: 'object', evidence: ['external-artifact'] });
    add('formula.handwritten-signs', '7.6.9', 18, 'Рукописные знаки по ГОСТ 2.304', relation('Знаки по стандарту'), { when: has('handwritten-formulas'), target: 'object', evidence: ['external-standard', 'external-artifact'], externalDependencies: ['ГОСТ 2.304–81'] });
    add('appendix.format-eligibility', '7.11.4', 27, 'Выбранный формат приложения допустим', structuredClone(get('appendix.formats').assertion), { when: has('appendices'), target: 'artifact', property: 'format', selector: eq('artifactKind', 'appendix'), evidence: ['external-artifact'] });
    const componentNames: Record<string, string> = { goal: 'цель', tasks: 'задачи', relevance: 'актуальность', novelty: 'новизна', efficiency: 'эффективность', conclusions: 'выводы', 'practical-recommendations': 'рекомендации по практической реализации', 'problem-state': 'состояние исследуемой проблемы', methods: 'методы решения', means: 'средства решения', theory: 'теоретические вопросы', methodology: 'методики выполнения работы', experiments: 'экспериментальные исследования', 'patent-search': 'патентно-информационный поиск', calculations: 'расчёты', graphs: 'графики', tables: 'таблицы', schemes: 'схемы', 'task-completion': 'полнота решения задач', results: 'результаты', advantages: 'преимущества решений', recommendations: 'рекомендации по использованию', 'technical-economic-efficiency': 'технико-экономическая эффективность', 'theoretical-practical-value': 'теоретическая и практическая ценность' };
    // Separate content presence from expert judgment of its quality. The latter remains reviewable.
    for (const [prefix, clause, page, modality, components] of [
        ['abstract-content', '6.3.2', 11, 'mandatory', ['goal', 'tasks', 'relevance', 'novelty', 'efficiency', 'conclusions', 'practical-recommendations']],
        ['introduction-content', '6.5', 12, 'mandatory', ['problem-state', 'goal', 'tasks', 'methods', 'means', 'relevance', 'novelty']],
        ['body-content', '6.6', 12, 'mandatory', ['theory', 'methodology', 'experiments', 'patent-search', 'calculations', 'graphs', 'tables', 'schemes']],
        ['conclusion-content', '6.7', 12, 'permission', ['conclusions', 'task-completion', 'results', 'advantages', 'recommendations', 'technical-economic-efficiency', 'theoretical-practical-value']],
    ] as const)
        for (const component of components)
            add(`${prefix}.${component}`, clause, page, `${clause}: наличие компонента «${componentNames[component]}»`, { op: 'eq', value: true }, { when: prefix === 'abstract-content' ? vkr : always, modality, evidence: ['structure', 'manual'], ...(prefix === 'body-content' ? { when: eq(`contentRequired.${component}`, true) } : {}) });
    const judgments = matrix.filter(row => row.decision === 'excluded');
    for (const row of judgments) {
        const id = row.id.replace('excluded.', 'expert.');
        add(id, row.source.clause, row.source.pdfPage, row.summary, relation('Экспертное заключение по исходному нормативному фрагменту'), { evidence: ['manual'], modality: row.id === 'excluded.slide-style' ? 'recommendation' : 'mandatory' });
        row.reason = 'Исключено только из автоматической статистики; норма сохранена для экспертной проверки';
    }
    // Conditions refer to each selected object, never to the existence of any unrelated object.
    for (const rule of rules) {
        if (rule.id.startsWith('stu.formula-number.') || rule.id === 'stu.formula.section-numbering') {
            rule.target = 'object';
            rule.selector = eq('kind', 'formula');
            rule.exceptions = [{ op: 'in', fact: 'formula.scope', value: ['table', 'figure-explanation', 'appendix'] }];
        }
        if (rule.id === 'stu.formula.appendix')
            rule.when = all(has('formulas'), eq('formula.scope', 'appendix'));
        if (rule.id === 'stu.figure.appendix' || rule.id === 'stu.table-number.appendix')
            rule.when = all(rule.when, eq('scope', 'appendix'));
        if (rule.id.startsWith('stu.figure-number.') || ['stu.table-number.arabic', 'stu.table-number.sequence'].includes(rule.id))
            rule.exceptions = [eq('scope', 'appendix')];
        if (rule.id.startsWith('stu.table-units.common'))
            rule.when = all(has('tables'), eq('table.units', 'common'));
        if (rule.id.startsWith('stu.table-units.mixed'))
            rule.when = all(has('tables'), eq('table.units', 'mixed'));
        if (rule.id.startsWith('stu.table-continuation.'))
            rule.when = all(has('tables'), eq('table.continued', true));
        if (rule.id.startsWith('stu.figure-continuation.'))
            rule.when = all(has('images'), eq('figure.continued', true));
        if (rule.id.startsWith('stu.appendix-number.') && rule.id !== 'stu.appendix-number.internal')
            rule.when = all(has('appendices'), eq('appendix.kind', 'table'), eq('appendix.continued', true));
        if (rule.id.startsWith('stu.appendix-pages.separate-'))
            rule.when = all(has('appendices'), eq('appendix.variant', 'separate'));
        if (rule.id.startsWith('stu.citation-inline.'))
            rule.when = has('citation-inline');
        if (rule.id.startsWith('stu.citation-footnote.'))
            rule.when = has('citation-footnote');
        if (rule.id.startsWith('stu.citation-list.'))
            rule.when = all(has('citation-list'), has('bibliography'));
        if (rule.id === 'stu.figure.drawing-standard')
            rule.when = has('embedded-drawings');
        if (rule.id.startsWith('stu.fold.')) {
            rule.when = all(any(has('drawings'), has('posters')), eq('format', rule.id.split('.').at(-1)!));
            rule.selector = { op: 'in', fact: 'artifactKind', value: ['drawing', 'poster'] };
            rule.assertion = { op: 'relation', value: 'Последовательность по схеме Ф; только по визуальному эталону', relation: { validator: 'form', left: { collection: 'sheets', link: 'self', property: 'folds', scope: 'sheet' }, parameters: { reference: 'appendix-Ф', page: rule.source.pdfPage } } };
        }
        if (/^stu\.stamp\.[1-6]\./.test(rule.id))
            rule.target = 'artifact';
        if (rule.id.startsWith('stu.stamp.cell.')) {
            rule.target = 'artifact';
            const cell = Number(rule.id.split('.').at(-1));
            const cellsByForm: Record<string, number[]> = { '1': [1, 2, 7, 8, 9, 10, 11, 12, 13, 17], '2': [1, 2, 7, 8, 9, 10, 11, 12, 13, 16], '3': [2, 7], '4': [2, 7], '5': [1, 2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17], '6': [2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 16] };
            const stamp: Condition = { op: 'in', fact: 'stampForm', value: Object.keys(cellsByForm).filter(form => cellsByForm[form].includes(cell)) };
            rule.when = all(stamp, cell === 3 || cell === 4 || cell === 6 ? eq('documentationSystem', 'SPDS') : cell === 5 ? eq('drawingKind', 'detail') : cell === 14 ? all(eq('artifactKind', 'drawing'), { op: 'in', fact: 'drawingKind', value: ['detail', 'assembly'] }) : cell === 15 ? eq('artifactKind', 'drawing') : always);
            if (cell === 14)
                rule.externalDependencies = ['ГОСТ 2.109 (редакция в СТУ не указана)'];
            if (cell === 15)
                rule.externalDependencies = ['ГОСТ 2.302–68'];
        }
    }
    get('table-continuation.replacement').modality = 'permission';
    for (const id of ['table-continuation.first-row', 'table-continuation.lines'])
        get(id).when = all(get(id).when, eq('table.headerReplacement', true));
    // Relations use object references and an allowlisted validator, never executable profile code.
    for (const [id, validator, collection, property, rightCollection, rightProperty, scope] of [
        ['contents.identity', 'same-property', 'contentsEntries', 'title', 'headings', 'title', 'document'],
        ['contents.pages', 'same-property', 'contentsEntries', 'page', 'headings', 'startPage', 'document'],
        ['formula-number.position', 'placement', 'formulas', 'number', 'formulas', 'bounds', 'document'],
        ['table-continuation.header', 'same-property', 'tableParts', 'header', 'tables', 'header', 'document'],
        ['citation-list.number', 'membership', 'citations', 'targetId', 'bibliographyEntries', 'id', 'document'],
        ['appendix-pages.separate-included', 'sequence', 'appendices', 'pages', 'artifacts', 'pages', 'artifact'],
    ] as const) {
        get(id).assertion.relation = { validator, left: { collection, property, link: 'self', scope }, right: { collection: rightCollection, property: rightProperty, link: 'target', scope }, parameters: {} };
        get(id).target = 'object';
    }
    // Keep the two kinds of numbering alternative exclusive through selected profile facts.
    for (const [base, alternative, kind] of [['table-number.sequence', 'table.section-numbering', 'tables'], ['figure-number.sequence', 'figure.section-numbering', 'figures'], ['formula-number.sequence', 'formula.section-numbering', 'formulas']] as const) {
        get(base).when = all(get(base).when, eq(`numbering.${kind}`, 'continuous'));
        get(alternative).when = all(get(alternative).when, eq(`numbering.${kind}`, 'section'));
        get(alternative).modality = 'mandatory';
        get(alternative).dependsOn = [`stu.${base.split('.')[0]}.arabic`];
    }
    const fieldNames: Record<string, string> = { signature: 'подпись', date: 'дата', initials: 'инициалы', surname: 'фамилия', position: 'должность', degree: 'учёная степень', section: 'раздел', group: 'группа', recordbook: 'номер зачётной книжки', ministry: 'наименование министерства', 'official-university-name': 'полное официальное наименование университета', institute: 'институт', department: 'кафедра', 'document-name': 'наименование документа', topic: 'тема', city: 'город', year: 'год' };
    const roleNames: Record<string, string> = { constant: 'постоянные надписи', identity: 'сведения о работе', approver: 'утверждающий', supervisor: 'руководитель', graduate: 'выпускник', reviewer: 'рецензент', student: 'студент', 'university-supervisor': 'руководитель от университета', 'enterprise-supervisor': 'руководитель от предприятия', teacher: 'преподаватель', consultant: 'каждый консультант', normcontroller: 'нормоконтролёр' };
    for (const [form, blocks] of Object.entries(TITLE_BLOCKS))
        for (const block of blocks)
            for (const field of block.fields) {
                const when = all(form === 'Е' ? eq('approvalForm', form) : eq('titleForm', form), ...(block.optional ? [eq(`title.has.${block.role}`, true)] : []));
                add(`title-detail.${form.charCodeAt(0)}.${block.role}.${field}`, `Приложение ${form}`, 33 + 'БВГДЕЖИКЛМН'.indexOf(form), `Форма ${form}: ${roleNames[block.role]}, ${fieldNames[field]}`, { op: 'relation', value: 'Реквизит соответствующего блока формы', relation: { validator: 'form', left: { collection: 'titleBlocks', link: block.repeated ? 'members' : 'self', property: field, scope: 'artifact' }, parameters: { reference: `title-${form}`, role: block.role, repeated: !!block.repeated } } }, { when, target: 'object', evidence: ['structure', 'manual', 'geometry'] });
            }
    // Correct references after changing declaration kinds; the normative statement stays immutable.
    for (const row of matrix)
        if (row.decision === 'included') {
            const r = rules.find(r => row.ruleIds.includes(r.id))!;
            row.source = r.source;
            row.type = r.modality === 'mandatory' || r.modality === 'prohibition' ? 'formal' : r.modality;
            row.evidence = r.evidence;
        }
}
