import { deepFreeze, EDITION } from './schema';
/** Appendix Х is informative. These codes are choices, never required document contents. */
export const DOCUMENT_CODES = deepFreeze([
    ['Пояснительная записка', 'ПЗ'], ['Расчеты', 'РР'], ['Программа и методика испытаний', 'ПМ'], ['Инструкция', 'И'], ['Документы прочие', 'Д'], ['Ведомость спецификаций', 'ВС'], ['Ведомость покупных изделий', 'ВП'], ['Таблицы', 'ТБ'], ['Технические условия', 'ТУ'], ['Сборочный чертеж', 'СБ'], ['Чертеж общего вида', 'ВО'], ['Теоретический чертеж', 'ТЧ'], ['Габаритный чертеж', 'ГЧ'], ['Электромонтажный чертеж', 'МЭ'], ['Монтажный чертеж', 'МЧ'], ['Упаковочный чертеж', 'УЧ'], ['Маршрутная карта', 'МК'], ['Карта технологического процесса', 'КТП'], ['Операционная карта', 'ОК'], ['Ведомость оборудования', 'ВОБ'], ['Ведомость материалов', 'ВМ'], ['Спецификация оборудования, изделий и материалов', 'С'], ['Локальная смета', 'ЛС'], ['Технология производства', 'ТХ'], ['Генеральный план', 'ГП'], ['Генеральный план и сооружения транспорта', 'ГТ'], ['Архитектурные решения', 'АР'], ['Архитектурно-строительные решения', 'АС'], ['Интерьеры', 'АИ'], ['Конструкции железобетонные', 'КЖ'], ['Конструкции металлические', 'КМ'], ['Конструкции металлические деталировочные', 'КМД'], ['Конструкции деревянные', 'КД'], ['Водоснабжение и канализация', 'ВК'], ['Отопление, вентиляция и кондиционирование', 'ОВ'], ['Тепломеханические решения котельных', 'ТМ'], ['Газоснабжение (внутренние устройства)', 'ГСВ'], ['Гидротехнические решения', 'ГР'], ['Наружные сети водоснабжения', 'НВ'], ['Наружные сети канализации', 'НК'], ['Тепломеханические решения тепловых сетей', 'ТС'], ['Автомобильные дороги', 'АД'], ['Сооружения транспорта', 'ТР'],
].map(([name, code], i) => ({ name, code, source: { edition: EDITION, clause: 'Приложение Х', pdfPage: i < 37 ? 59 : 60, appendix: 'Х', appendixStatus: 'informative' as const, contentKind: 'reference' as const } })));
export const SCHEME_KINDS = deepFreeze([['электрические', 'Э'], ['гидравлические', 'Г'], ['пневматические', 'П'], ['кинематические', 'К'], ['вакуумные', 'В'], ['оптические', 'Л'], ['энергетические', 'Р'], ['деления', 'Е'], ['комбинированные', 'С']].map(([name, code]) => ({ name, code, pdfPage: 60 })));
export const SCHEME_TYPES = deepFreeze([['структурные', '1'], ['функциональные', '2'], ['принципиальные', '3'], ['соединений (монтажные)', '4'], ['подключения', '5'], ['общие', '6'], ['расположения', '7'], ['объединенные', '0']].map(([name, code]) => ({ name, code, pdfPage: 60 })));
/** Geometry is tied to the original page image, not inferred from arrays of lengths. */
export const VISUAL_REFERENCES = deepFreeze([
    { id: 'assignment-А', pages: [31, 32], appendix: 'А', status: 'recommended' },
    ...Array.from('БВГДЕЖИКЛМН', (appendix, i) => ({ id: `title-${appendix}`, pages: [33 + i], appendix, status: 'mandatory' })),
    { id: 'frame-Р', pages: [45], appendix: 'Р', status: 'mandatory' },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `stamp-${i + 1}`, pages: [46 + Math.floor(i / 2)], appendix: 'С', status: 'mandatory' })),
    { id: 'contents-Т', pages: [50], appendix: 'Т', status: 'mandatory', contentKind: 'example' },
    { id: 'appendix-Ф', pages: [57, 58], appendix: 'Ф', status: 'mandatory' },
].map(r => ({ ...r, edition: EDITION, sourceSha256: '12c0b94ee68a1233600f59ab44f84b418e2e93c2516af121ccf9e7026f85c27c', source: 'local-original-pdf', requires: 'visual-comparison', automaticValidatorAvailable: false })));
export interface FormBlock {
    role: string;
    fields: string[];
    repeated?: boolean;
    optional?: boolean;
}
const signer = (role: string, extra: string[] = [], optional = false): FormBlock => ({ role, fields: ['signature', 'date', 'initials', 'surname', ...extra], optional });
export const TITLE_BLOCKS: Readonly<Record<string, readonly FormBlock[]>> = deepFreeze(Object.fromEntries(Array.from('БВГДЕЖИКЛМН', form => {
    const blocks: FormBlock[] = [];
    if (form !== 'Е')
        blocks.push({ role: 'constant', fields: ['ministry', 'official-university-name'] }, { role: 'identity', fields: ['institute', 'department', 'document-name', 'topic', 'city', 'year'] });
    if ('БВГДЖЛ'.includes(form))
        blocks.push(signer('approver', ['position']));
    if ('БВГДЖИЛ'.includes(form))
        blocks.push(signer('supervisor', ['position', 'degree']));
    if ('БВГДЖ'.includes(form))
        blocks.push(signer('graduate'));
    if ('БГЖ'.includes(form))
        blocks.push(signer('reviewer', ['position', 'degree'], true));
    if ('ИКЛМН'.includes(form))
        blocks.push(signer('student', ['group', 'recordbook']));
    if (form === 'К')
        blocks.push(signer('university-supervisor'), signer('enterprise-supervisor'));
    if ('МН'.includes(form))
        blocks.push(signer('teacher'));
    if ('ЕЖ'.includes(form))
        blocks.push({ ...signer('consultant', ['section']), repeated: true }, signer('normcontroller'));
    return [form, blocks];
})));
