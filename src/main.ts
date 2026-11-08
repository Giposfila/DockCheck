import './styles.css';
import { exportReport, exportReportJson, groupResults, resultFinding } from './report';
import { pageLabel, unknownPage } from './analyzer/location';
import { checkDocx, DEFAULT_REQUIREMENTS } from './checker';
import { DEFAULT_PROFILE, PROFILE_STORAGE_KEY, LEGACY_STORAGE_KEY, formattingFor, migrateLegacy, parseProfile, profileConflicts, WORK_KINDS } from './requirements/profile';
import type { WorkProfile } from './requirements/profile';
import { CATALOG, COVERAGE, EXCLUSIONS } from './requirements/catalog';
import type { Category, CheckReport, Finding, Requirements } from './types';

const STANDARD_URL = 'https://iubp.sfu-kras.ru/sites/default/files/page_files/standart-oformleniya_otcheta_po_praktike_compressed.pdf';
const STORAGE_KEY = PROFILE_STORAGE_KEY;
let storageNotice='';

const icon = (name: 'lock' | 'file' | 'upload' | 'settings' | 'check' | 'alert' | 'eye' | 'download' | 'close' | 'arrow') => {
  const paths: Record<typeof name, string> = {
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H10v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h3.2v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    alert: '<path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  };
  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
};

function loadProfile(): WorkProfile {
  try {
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw)return parseProfile(JSON.parse(raw));
    const old=localStorage.getItem(LEGACY_STORAGE_KEY);
    if(old){const migrated=migrateLegacy(JSON.parse(old));storageNotice=migrated.notice;localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated.profile));return migrated.profile;}
  } catch {storageNotice='Настройки не прошли проверку. Применён исходный профиль; повреждённые данные не объединены с ним.';}
  return structuredClone(DEFAULT_PROFILE);
}
let profile=loadProfile();
let requirements=formattingFor(profile);
let currentFile:File|null=null;
let analysisEpoch=0;
let report: CheckReport | null = null;
let activeFilter: Category | 'all' | 'manual' | 'recommendations' = 'all';
let currentFileName = '';

const workKindLabels:Record<string,string>={master:'Магистерская диссертация','diploma-project':'Дипломный проект','diploma-work':'Дипломная работа',bachelor:'Бакалаврская работа','course-project':'Курсовой проект','course-work':'Курсовая работа','practice-report':'Отчёт по практике','research-report':'Отчёт НИР','lab-report':'Лабораторная работа','practical-report':'Практическая работа','project-report':'Отчёт о проекте',abstract:'Реферат','calculation-graphic-assignment':'Расчётно-графическое задание','calculation-graphic-work':'Расчётно-графическая работа','calculation-assignment':'Расчётное задание','control-work':'Контрольная работа',essay:'Эссе'};
const artifactLabels:Record<string,string>={assignment:'Задание ВКР',separateAppendices:'Отдельные приложения',drawings:'Чертежи',posters:'Плакаты',slides:'Слайды'};
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="ДокЧек — на главную">
      <span class="brand-mark">Д</span><span>ДокЧек</span>
    </a>
    <div class="top-actions">
      <span class="privacy-pill">${icon('lock')} Файл остаётся в браузере</span>
      <button class="button button-ghost" id="settingsButton">${icon('settings')} Шаблон проверки</button>
    </div>
  </header>

  <main>
    <section class="hero" id="uploadSection">
      <div class="hero-copy">
        <div class="eyebrow"><span></span> СТУ СФУ 7.5-07-2021</div>
        <h1>Проверьте документ<br><em>до нормоконтроля</em></h1>
        <p class="hero-lead">Загрузите DOCX — сервис проверит поля, шрифт, интервалы, заголовки, подписи и структуру. Спорные места честно оставит человеку.</p>
        <div class="trust-row">
          <div><strong>Локально</strong><span>без передачи файла</span></div>
          <div><strong>Понятно</strong><span>с указанием абзацев</span></div>
          <div><strong>Гибко</strong><span>с вашим шаблоном</span></div>
        </div>
      </div>
      <div class="upload-card-wrap">
        <div class="upload-card" id="dropzone" tabindex="0" role="button" aria-label="Выбрать документ DOCX">
          <input type="file" id="fileInput" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
          <div class="upload-icon">${icon('upload')}</div>
          <h2>Перетащите DOCX сюда</h2>
          <p>или выберите файл с устройства</p>
          <button class="button button-primary" id="pickButton">Выбрать документ ${icon('arrow')}</button>
          <span class="file-limit">DOCX · до 25 МБ</span>
        </div>
        <div class="standard-note">
          ${icon('file')}
          <div><strong>Основа проверки</strong><span>Каталог СТУ 2021: нормы и возможности проверки показаны отдельно</span></div>
          <a href="${STANDARD_URL}" target="_blank" rel="noreferrer">Открыть стандарт ↗</a>
        </div>
      </div>
    </section>

    <section class="processing hidden" id="processing" aria-live="polite">
      <div class="loader"><span></span><span></span><span></span></div>
      <h2>Читаем структуру документа</h2>
      <p id="processingName"></p>
    </section>

    <section class="report hidden" id="reportSection">
      <div class="report-heading">
        <div>
          <div class="eyebrow"><span></span> РЕЗУЛЬТАТ ПРОВЕРКИ</div>
          <h2 id="reportTitle">Отчёт</h2>
          <p id="reportMeta"></p>
        </div>
        <div class="report-actions">
          <button class="button button-ghost" id="newFileButton">Новый файл</button>
          <button class="button button-ghost" id="downloadJson">JSON отчёта</button>
          <button class="button button-dark" id="downloadButton">${icon('download')} Скачать отчёт</button>
        </div>
      </div>
      <div class="score-grid" id="scoreGrid"></div>
      <div class="report-layout">
        <aside class="filters" id="filters"></aside>
        <div class="findings" id="findings"></div>
      </div>
    </section>
  </main>

  <footer>
    <span>ДокЧек · локальная предварительная проверка</span>
    <span>Не заменяет решение нормоконтролёра</span>
  </footer>

  <div class="drawer-backdrop hidden" id="drawerBackdrop"></div>
  <aside class="drawer" id="settingsDrawer" role="dialog" aria-modal="true" aria-hidden="true" aria-label="Настройки шаблона">
    <div class="drawer-head"><div><span class="mini-label">ШАБЛОН ТРЕБОВАНИЙ</span><h2>Что проверять</h2></div><button class="icon-button" id="closeSettings" aria-label="Закрыть">${icon('close')}</button></div>
    <form id="requirementsForm">
      <p id="profileIdentity"></p>
      <fieldset><legend>Контекст работы</legend>
        <label>Вид работы<select name="workKind"><option value="">Не указан</option>${WORK_KINDS.map(k=>`<option value="${k}" ${profile.workKind===k?'selected':''}>${workKindLabels[k]??k}</option>`).join('')}</select></label>
        <label>Режим документа<select name="documentMode"><option value="">Не указан</option><option value="unframed">Без рамки · 7.1.2</option><option value="framed">Пояснительная записка с рамкой · 7.1.3</option></select></label>
        <label>Носитель<select name="medium"><option value="">Не указан</option><option value="electronic">Электронный</option><option value="paper">Бумажный</option><option value="handwritten">Рукописный</option></select></label>
        <label>Система документации<select name="documentationSystem"><option value="">Не указана</option>${['ESKD','SPDS','ESTD','ESPD','mining'].map(k=>`<option>${k}</option>`).join('')}</select></label>
        <label>Специальность<input name="specialty"></label><label>Код направления<input name="directionCode"></label>
        <label>Согласование<select name="approvalVariant"><option value="">Не указано</option><option value="separate">Дополнительная страница Е</option><option value="combined">Совмещённая форма Ж (до двух консультантов)</option></select></label>
        <label>Число консультантов<input name="consultants" type="number" min="0" step="1"></label>
        ${(['assignment','separateAppendices','drawings','posters','slides'] as const).map(k=>`<label>${artifactLabels[k]}<select name="artifact.${k}"><option value="">Неизвестно</option><option value="true">Есть</option><option value="false">Нет</option></select></label>`).join('')}
      </fieldset>
      <fieldset><legend>Состав по заданию</legend><label>Источник состава<input name="compositionSource"></label><label>Элементы в порядке следования<textarea name="composition" rows="4"></textarea></label><small>6.1: титул и основная часть обязательны. Остальное определяется видом работы и заданием.</small></fieldset>
      <fieldset><legend>Реквизиты и внешние материалы</legend><label>Реквизиты работы (JSON)<textarea name="requisites" rows="3"></textarea></label><label>Комплект артефактов (JSON)<textarea name="artifactManifest" rows="3"></textarea></label><label>Внешние доказательства (JSON)<textarea name="externalEvidence" rows="3"></textarea></label><small>Сведения хранятся отдельно от фактов DOCX. Заявленное наличие другого файла не подтверждает его соответствие.</small></fieldset>
      <fieldset><legend>Нумерация и ссылки</legend>
      ${['tables','figures','formulas'].map(k=>`<label>${{tables:'Таблицы',figures:'Рисунки',formulas:'Формулы'}[k]}<select name="numbering.${k}"><option value="">Не указано</option><option value="continuous">Сквозная</option><option value="section">По разделам</option></select></label>`).join('')}
      <small>В приложениях всегда отдельная область счёта с буквой приложения.</small>
      <label>Группировка источников<select name="bibliographyGrouping"><option value="">Не указана</option><option value="alphabetical">Алфавитная</option><option value="systematic">В порядке упоминания</option><option value="chronological">Хронологическая</option></select></label>
      </fieldset>
      <fieldset><legend>Оформление по СТУ</legend><p>7.1.1: основной текст TNR 14 пт, интервал 1 или 1,5, отступ 12,5 мм. Поля по 7.1.2 зависят от ориентации. В таблицах рекомендован кегль 10–12 (7.7.13).</p><p>6.4.1: содержание до 24 страниц включительно не рекомендуется. Объём требует подтверждённой вёрстки.</p></fieldset>
      <fieldset><legend>Локальные требования</legend>
      <label><input type="checkbox" name="useLocalFormatting"> Дополнительно сравнивать с локальным шаблоном оформления</label>
      <small>Эти настройки не изменяют каталог СТУ. Результаты помечаются как локальные сравнения.</small>
      <label>Источник локального шаблона<input name="localSource"></label>
      <label>Локальные дополнения (JSON)<textarea name="localRequirements" rows="4"></textarea><small>id local.*, ruleId, assertion, source, explanation. Исходная норма сохраняется.</small></label>
      </fieldset>
      <fieldset><legend>Основной текст</legend>
        <label>Шрифт<input name="fontFamily" value="${escapeHtml(requirements.fontFamily)}"></label>
        <div class="field-row"><label>Кегль, пт<input type="number" name="fontSizePt" min="8" max="32" step="0.5" value="${requirements.fontSizePt}"></label><label>Абзац, мм<input type="number" name="firstLineIndentMm" min="0" max="30" step="0.5" value="${requirements.firstLineIndentMm}"></label></div>
        <label>Допустимые интервалы<input name="allowedLineSpacing" value="${requirements.allowedLineSpacing.join(', ')}"><small>Через запятую: 1, 1.5</small></label>
        <label class="toggle"><input type="checkbox" name="requireJustified" ${requirements.requireJustified ? 'checked' : ''}><span></span><div><strong>Выравнивание по ширине</strong><small>Для абзацев основного текста</small></div></label>
      </fieldset>
      <fieldset><legend>Область проверки шрифта и кегля</legend>
        <small>Включайте дополнительные роли, если ваш профиль устанавливает для них тот же шрифт и размер.</small>
        ${([['body','Основной текст'],['heading','Заголовки'],['list','Списки'],['table','Таблицы'],['caption','Подписи'],['note','Сноски'],['header','Верхние колонтитулы'],['footer','Нижние колонтитулы'],['textbox','Текстовые блоки']] as const).map(([role,label])=>`<label><input type="checkbox" name="textRole" value="${role}" ${(requirements.textRoles ?? ['body']).includes(role)?'checked':''}> ${label}</label>`).join('')}
      </fieldset>
      <fieldset><legend>Поля вертикальной страницы</legend>
        <div class="field-grid">
          <label>Слева, мм<input type="number" name="marginLeft" value="${requirements.portraitMarginsMm.left}"></label>
          <label>Справа, мм<input type="number" name="marginRight" value="${requirements.portraitMarginsMm.right}"></label>
          <label>Сверху, мм<input type="number" name="marginTop" value="${requirements.portraitMarginsMm.top}"></label>
          <label>Снизу, мм<input type="number" name="marginBottom" value="${requirements.portraitMarginsMm.bottom}"></label>
        </div>
        <label class="toggle"><input type="checkbox" name="requireA4" ${requirements.requireA4 ? 'checked' : ''}><span></span><div><strong>Формат A4</strong><small>210 × 297 мм</small></div></label>
        <label class="toggle"><input type="checkbox" name="requirePageNumbers" ${requirements.requirePageNumbers ? 'checked' : ''}><span></span><div><strong>Номера страниц</strong><small>Поле PAGE по центру снизу</small></div></label>
      </fieldset>
      <fieldset><legend>Разделы локального шаблона</legend>
        <label>По одному на строку<textarea name="requiredSections" rows="4">${escapeHtml(requirements.requiredSections.join('\n'))}</textarea></label>
      </fieldset>
      <div class="profile-tools"><button type="button" class="button button-ghost" id="exportCatalog">Каталог и покрытие</button><button type="button" class="button button-ghost" id="exportProfile">Экспорт профиля</button><label class="button button-ghost">Импорт профиля<input id="importProfile" type="file" accept="application/json,.json" hidden></label></div>
      <div class="drawer-actions"><button type="button" class="button button-ghost" id="resetSettings">Сбросить</button><button type="submit" class="button button-primary">Сохранить шаблон</button></div>
    </form>
  </aside>
  <div class="toast hidden" id="toast" role="status"></div>
`;

const fileInput = document.querySelector<HTMLInputElement>('#fileInput')!;
const dropzone = document.querySelector<HTMLElement>('#dropzone')!;
const uploadSection = document.querySelector<HTMLElement>('#uploadSection')!;
const processing = document.querySelector<HTMLElement>('#processing')!;
const reportSection = document.querySelector<HTMLElement>('#reportSection')!;
const settingsDrawer = document.querySelector<HTMLElement>('#settingsDrawer')!;
const drawerBackdrop = document.querySelector<HTMLElement>('#drawerBackdrop')!;

function showToast(message: string, isError = false) {
  const toast = document.querySelector<HTMLElement>('#toast')!;
  toast.textContent = message;
  toast.className = `toast${isError ? ' toast-error' : ''}`;
  window.setTimeout(() => toast.classList.add('hidden'), 3600);
}

function openSettings() {
  settingsDrawer.classList.add('open');
  settingsDrawer.setAttribute('aria-hidden', 'false');
  drawerBackdrop.classList.remove('hidden');
  document.querySelector<HTMLButtonElement>('#closeSettings')!.focus();
}

function closeSettings() {
  settingsDrawer.classList.remove('open');
  settingsDrawer.setAttribute('aria-hidden', 'true');
  drawerBackdrop.classList.add('hidden');
  document.querySelector<HTMLButtonElement>('#settingsButton')!.focus();
}

document.querySelector('#settingsButton')!.addEventListener('click', openSettings);
document.querySelector('#closeSettings')!.addEventListener('click', closeSettings);
drawerBackdrop.addEventListener('click', closeSettings);
document.addEventListener('keydown', (event) => {
 if(!settingsDrawer.classList.contains('open'))return;
 if(event.key==='Escape')closeSettings();
 if(event.key==='Tab') {
  const controls=Array.from(settingsDrawer.querySelectorAll<HTMLElement>('button,input,textarea,select')).filter(el=>el.getClientRects().length>0);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }
});
document.querySelector('#pickButton')!.addEventListener('click', (event) => { event.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') fileInput.click(); });
fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) void handleFile(fileInput.files[0]); });

for (const eventName of ['dragenter', 'dragover']) dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
for (const eventName of ['dragleave', 'drop']) dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); });
dropzone.addEventListener('drop', (event) => {
  const file = (event as DragEvent).dataTransfer?.files[0];
  if (file) void handleFile(file);
});

async function handleFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.docx')) return showToast('Нужен файл в формате DOCX.', true);
  if (file.size > 25 * 1024 * 1024) return showToast('Файл больше 25 МБ.', true);
  const epoch=++analysisEpoch;
  const usedProfile=structuredClone(profile);
  currentFile=file;
  currentFileName = file.name;
  uploadSection.classList.add('hidden');
  reportSection.classList.add('hidden');
  processing.classList.remove('hidden');
  document.querySelector('#processingName')!.textContent = `${file.name} · ${formatBytes(file.size)}`;
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    const nextReport = await checkDocx(await file.arrayBuffer(), usedProfile);
    if(epoch!==analysisEpoch)return;
    report=nextReport;
    report.fileName = file.name;
    activeFilter = 'all';
    renderReport(report);
    processing.classList.add('hidden');
    reportSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    if(epoch!==analysisEpoch)return;
    processing.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    showToast(error instanceof Error ? error.message : 'Не удалось прочитать документ.', true);
  }
}

function formatBytes(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ` : `${Math.ceil(bytes / 1024)} КБ`;
}

const categoryLabels: Record<Category, string> = { page: 'Страница', text: 'Основной текст', structure: 'Структура', heading: 'Заголовки', table: 'Таблицы', figure: 'Рисунки', references: 'Источники' };

function escapeHtml(value: string): string {
  const el = document.createElement('div');
  el.textContent = value;
  return el.innerHTML;
}

function renderReport(nextReport: CheckReport) {
  const violations=nextReport.findings.length;
  const checked = nextReport.coverage.pass + nextReport.coverage.fail;
  const score = nextReport.catalogCoverage?.implemented??0;
  document.querySelector('#reportTitle')!.textContent = currentFileName;
  document.querySelector('#reportMeta')!.textContent = `${nextReport.coverage.pass} проверок пройдено · ${violations} нарушений обязательных норм и локальных сравнений · ${nextReport.coverage.unknown} не определено · ${nextReport.stats.paragraphs} абзацев · ${nextReport.stats.tables} таблиц · ${nextReport.stats.images} изображений`;
  document.querySelector('#scoreGrid')!.innerHTML = `
    <div class="score-card score-main"><div class="score-ring" style="--score:360deg"><span>${score}</span></div><div><span class="score-label">Норм с реализацией</span><strong>${nextReport.coverage.unknown} не определено</strong><small>Реализация частичная; это не процент соответствия СТУ</small></div></div>
    <div class="score-card"><span class="metric-icon error">${icon('alert')}</span><div><span class="score-label">Нарушения</span><strong>${violations}</strong><small>Требуют исправления</small></div></div>
    <div class="score-card"><span class="metric-icon warning">${icon('eye')}</span><div><span class="score-label">Не удалось проверить</span><strong>${nextReport.coverage.unknown}</strong><small>Свойство или область неизвестны</small></div></div>
    <div class="score-card"><span class="metric-icon ok">${icon('check')}</span><div><span class="score-label">Проверено свойств</span><strong>${checked}</strong><small>По структуре DOCX</small></div></div>`;
  const meta=document.querySelector('#reportMeta')!;
  const info=document.createElement('p');info.id='profileReport';info.textContent=`Профиль ${nextReport.profile?.id}@${nextReport.profile?.version} · ${nextReport.profile?.catalogVersion}. ${nextReport.profile?.formatting?'СТУ + локальный шаблон':'Исходный СТУ'}. Не указан контекст: ${['workKind','documentMode','medium'].filter(k=>!(nextReport.profile as any)?.[k]).join(', ')||'нет'}. Каталог: ${CATALOG.rules.length} норм; ${EXCLUSIONS.length} субъективных фрагментов исключены. Внешние артефакты требуют отдельного подтверждения.`;meta.append(info);
  if(nextReport.profileConflicts?.length){const conflicts=document.createElement('p');conflicts.textContent=nextReport.profileConflicts.join('; ');meta.append(conflicts);}
  const groups=document.createElement('details');groups.id='groupCoverage';const heading=document.createElement('summary');heading.textContent='Группы требований и недостающие возможности';groups.append(heading);
  for(const [key,label] of Object.entries(categoryLabels)){const norms=CATALOG.rules.filter(r=>r.category===key);const pending=new Set(nextReport.results.filter(r=>r.origin==='standard'&&r.category===key&&r.status==='unknown').map(r=>r.ruleId));const external=norms.filter(r=>r.evidence.includes('external-artifact'));const line=document.createElement('p');line.textContent=`${label}: ${norms.length} норм; ${pending.size} не проверены; ${external.length} требуют внешних материалов.`;groups.append(line);}
  meta.append(groups);
  renderFilters(nextReport);
  renderFindings(nextReport);
}

function renderFilters(nextReport: CheckReport) {
  const categories = (Object.keys(categoryLabels) as Category[]).filter((category) => nextReport.findings.some((f) => f.category === category));
  document.querySelector('#filters')!.innerHTML = `
    <span class="filter-title">РАЗДЕЛЫ ОТЧЁТА</span>
    <button class="filter ${activeFilter === 'all' ? 'active' : ''}" data-filter="all"><span>Все замечания</span><b>${nextReport.findings.length}</b></button>
    ${categories.map((category) => `<button class="filter ${activeFilter === category ? 'active' : ''}" data-filter="${category}"><span>${categoryLabels[category]}</span><b>${nextReport.findings.filter((f) => f.category === category).length}</b></button>`).join('')}
    <button class="filter ${activeFilter==='recommendations'?'active':''}" data-filter="recommendations"><span>Рекомендации</span><b>${nextReport.results.filter(r=>r.modality==='recommendation'&&r.status==='fail').length}</b></button>
    <button class="filter manual ${activeFilter === 'manual' ? 'active' : ''}" data-filter="manual"><span>Проверить вручную</span><b>${nextReport.manualChecks.length}</b></button>`;
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter as typeof activeFilter;
    renderFilters(nextReport);
    renderFindings(nextReport);
  }));
}

function findingCard(finding: Finding): string {
  return `<article class="finding-card ${finding.severity}">
    <div class="finding-status">${finding.severity === 'error' ? icon('alert') : icon('eye')}</div>
    <div class="finding-body">
      <div class="finding-top"><span>${finding.origin==='local'?'Локальное сравнение':finding.modality==='recommendation'?'Рекомендация':finding.origin==='standard'?'СТУ':'Возможности анализа'} · ${categoryLabels[finding.category]} · п. ${escapeHtml(finding.clause)}</span><span class="location">${escapeHtml(finding.location)}</span></div>
      <h3>${escapeHtml(finding.title)}</h3>
      <p class="page-reference">${escapeHtml(pageLabel(finding.at?.page ?? unknownPage()))}</p>
      ${quoteHtml(finding)}
      ${finding.recommendation ? `<p>${escapeHtml(finding.recommendation)}</p>` : ""}
      <details><summary>Источник свойства и требование</summary><p>${escapeHtml(finding.explanation ?? '')}</p><p>${escapeHtml(JSON.stringify(finding.source ?? 'Источник не определён'))}</p><p>${escapeHtml(finding.clause)}</p><p>Норма: ${escapeHtml(JSON.stringify(finding.normSource??null))}</p><p>Причина: ${escapeHtml(finding.reasonCode??'не требуется')}</p><p>Доказательства: ${escapeHtml(JSON.stringify(finding.evidence??[]))}</p></details>
      <div class="comparison"><div><span>СЕЙЧАС</span><p>${escapeHtml(finding.actual)}</p></div><div><span>ТРЕБУЕТСЯ</span><p>${escapeHtml(finding.expected)}</p></div></div>
    </div>
  </article>`;
}

function visibleText(text:string,spaces=false):string {
 const escaped=spaces?escapeHtml(text).replace(/ /g,'<span class="invisible-symbol" aria-label="пробел">·</span>').replace(/&nbsp;/g,'<span class="invisible-symbol" aria-label="неразрывный пробел">⍽</span>'):escapeHtml(text);
 return escaped.replace(/\t/g,'<span class="invisible-symbol" aria-label="табуляция">⇥</span>').replace(/\n/g,'<span class="invisible-symbol" aria-label="разрыв строки">↵</span>\n');
}
function quoteHtml(f:Finding):string {
 const range=f.at?.range, text=f.paragraphText;
 if(!range || text===undefined || !text.length) return '<p>Текстовая цитата неприменима: используйте расположение объекта.</p>';
 const start=Math.max(0,range.start-70),end=Math.min(text.length,range.end+70);
 const quote=(from:number,to:number,spaces=false)=>`${visibleText(text.slice(from,range.start),spaces)}<mark>${visibleText(text.slice(range.start,range.end),spaces)}</mark>${visibleText(text.slice(range.end,to),spaces)}`;
 return `<blockquote>${start?'…':''}${quote(start,end)}${end<text.length?'…':''}</blockquote>
 <details><summary>Полный абзац и невидимые символы</summary><blockquote>${quote(0,text.length,true)}</blockquote></details>
 <button class="button button-ghost copy-quote" data-result="${escapeHtml(f.id)}">Скопировать цитату для поиска</button>`;
}
function renderFindings(nextReport: CheckReport) {
 const container=document.querySelector('#findings')!;
 const items=nextReport.results.filter(r=>activeFilter==='manual'?r.status==='unknown':activeFilter==='recommendations'?r.modality==='recommendation'&&r.status==='fail':r.status==='fail'&&r.modality!=='recommendation'&&r.modality!=='permission'&&(activeFilter==='all'||r.category===activeFilter));
 container.innerHTML=`<div class="list-head"><h2>${activeFilter==='manual'?'Не удалось проверить':activeFilter==='recommendations'?'Отклонения от рекомендаций':'Замечания'}</h2><span>${items.length} мест</span></div>`+
 [...groupResults(items).values()].map(group=>`<details class="finding-group" ${group[0].origin==='standard'&&group[0].status==='unknown'?'':'open'}><summary>${escapeHtml(group[0].origin==='standard'&&group[0].status==='unknown'?`${group[0].reasonCode}: ${group[0].explanation}`:group[0].title)} — ${group.length} мест</summary>${group.map(r=>findingCard(resultFinding(r,nextReport.results.indexOf(r)))).join('')}</details>`).join('')+
 (!items.length?'<div class="empty-state"><h3>Замечаний не найдено</h3><p>Проверка частичная. Непроверенные свойства доступны в разделе «Проверить вручную».</p></div>':'');
 container.querySelectorAll<HTMLButtonElement>('.copy-quote').forEach(button=>button.addEventListener('click',async()=>{
  const r=nextReport.results[Number(button.dataset.result)], range=r.at?.range;
  if(!range || r.paragraphText===undefined) return;
  const text=r.paragraphText.slice(range.start,range.end);
  try {await navigator.clipboard.writeText(text);showToast('Цитата скопирована. Вставьте её в поиск Word (Ctrl+F).');} catch {showToast('Буфер обмена недоступен. Выделите и скопируйте текст цитаты.',true);}
 }));
}

document.querySelector('#newFileButton')!.addEventListener('click', () => {
  analysisEpoch++;currentFile=null;
  report = null;
  fileInput.value = '';
  reportSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.querySelector('#downloadButton')!.addEventListener('click', () => {
  if (!report) return;
  const body = exportReport(report);
  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${currentFileName.replace(/\.docx$/i, '')}-отчёт.txt`;
  link.click();
  URL.revokeObjectURL(url);
});

function syncProfileForm(){
 const form=document.querySelector<HTMLFormElement>('#requirementsForm')!;
 const set=(name:string,value:unknown)=>{const input=form.elements.namedItem(name) as HTMLInputElement|null;if(input)input.value=value===undefined?'':String(value);};
 for(const name of ['workKind','documentMode','medium','documentationSystem','specialty','directionCode','approvalVariant','consultants','bibliographyGrouping'] as const)set(name,profile[name]);
 for(const k of ['assignment','separateAppendices','drawings','posters','slides'] as const)set(`artifact.${k}`,profile.artifacts[k]);
 for(const k of ['tables','figures','formulas'] as const)set(`numbering.${k}`,profile.numbering[k]);
 set('requisites',JSON.stringify(profile.requisites,null,2));set('artifactManifest',JSON.stringify(profile.artifactManifest??[],null,2));set('externalEvidence',JSON.stringify(profile.externalEvidence??[],null,2));
 set('composition',profile.composition?.elements.join('\n'));set('compositionSource',profile.composition?.source);set('localRequirements',JSON.stringify(profile.localRequirements,null,2));set('localSource',profile.requisites.localFormattingSource);
 (form.elements.namedItem('useLocalFormatting') as HTMLInputElement).checked=!!profile.formatting;
 for(const name of ['fontFamily','fontSizePt','firstLineIndentMm'] as const)set(name,requirements[name]);
 set('allowedLineSpacing',requirements.allowedLineSpacing.join(', '));set('requiredSections',requirements.requiredSections.join('\n'));
 for(const [name,key] of [['marginLeft','left'],['marginRight','right'],['marginTop','top'],['marginBottom','bottom']] as const)set(name,requirements.portraitMarginsMm[key]);
 for(const name of ['requireA4','requirePageNumbers','requireJustified'] as const)(form.elements.namedItem(name) as HTMLInputElement).checked=requirements[name];
 form.querySelectorAll<HTMLInputElement>('[name=textRole]').forEach(el=>el.checked=(requirements.textRoles??['body']).includes(el.value as any));
 updateApplicableSettings();
 document.querySelector('#profileIdentity')!.textContent=`${profile.id}@${profile.version} · каталог ${profile.catalogVersion}`;
}
function updateApplicableSettings(){
 const kind=(document.querySelector('[name=workKind]') as HTMLSelectElement).value;
 const isVkr=!kind||['master','diploma-project','diploma-work','bachelor'].includes(kind);
 for(const name of ['approvalVariant','consultants']){const input=document.querySelector(`[name=${name}]`) as HTMLInputElement;input.closest('label')!.classList.toggle('hidden',!isVkr);}
 const source=document.querySelector('[name=localSource]') as HTMLInputElement;
 source.closest('label')!.classList.toggle('hidden',!(document.querySelector('[name=useLocalFormatting]') as HTMLInputElement).checked);
}
 document.querySelector('[name=workKind]')!.addEventListener('change',updateApplicableSettings);
 document.querySelector('[name=useLocalFormatting]')!.addEventListener('change',updateApplicableSettings);
async function applyProfile(next:WorkProfile){
 const validated=parseProfile(next);
 localStorage.setItem(STORAGE_KEY,JSON.stringify(validated));profile=validated;requirements=formattingFor(profile);syncProfileForm();closeSettings();
 if(report){report.stale=true;document.querySelector('#reportMeta')!.textContent='Профиль изменён. Пересчитываем отчёт…';}
 if(currentFile)await handleFile(currentFile);
 showToast('Профиль сохранён. Отчёт пересчитан при наличии документа.');
}
document.querySelector('#requirementsForm')!.addEventListener('submit', (event) => {
 event.preventDefault();
 try{
  const data=new FormData(event.currentTarget as HTMLFormElement);
  const optional=(name:string)=>String(data.get(name)??'').trim()||undefined;
  const next=structuredClone(profile);next.version=String(Number(profile.version.replace(/[^0-9]/g,'')) + 1 || 1);
  for(const name of ['workKind','documentMode','medium','documentationSystem','specialty','directionCode','approvalVariant','bibliographyGrouping'] as const){(next as any)[name]=optional(name);}
  next.consultants=optional('consultants')===undefined?undefined:Number(data.get('consultants'));
  for(const k of ['assignment','separateAppendices','drawings','posters','slides'] as const){const value=optional(`artifact.${k}`);next.artifacts[k]=value===undefined?undefined:value==='true';if(value===undefined)delete next.artifacts[k];}
  for(const k of ['tables','figures','formulas'] as const){next.numbering[k]=optional(`numbering.${k}`) as 'continuous'|'section'|undefined;}
  const elements=String(data.get('composition')??'').split('\n').map(s=>s.trim()).filter(Boolean);
  next.composition=elements.length?{elements,source:optional('compositionSource')??''}:undefined;
  next.requisites=JSON.parse(String(data.get('requisites')||'{}'));next.artifactManifest=JSON.parse(String(data.get('artifactManifest')||'[]'));next.externalEvidence=JSON.parse(String(data.get('externalEvidence')||'[]'));
  next.localRequirements=JSON.parse(String(data.get('localRequirements')||'[]'));
  if(data.has('useLocalFormatting')){
   if(!optional('localSource'))throw Error('Укажите источник локального шаблона.');
   next.requisites.localFormattingSource=optional('localSource')!;
   next.formatting={...requirements,textRoles:data.getAll('textRole') as NonNullable<Requirements['textRoles']>,fontFamily:String(data.get('fontFamily')??'').trim(),fontSizePt:Number(data.get('fontSizePt')),firstLineIndentMm:Number(data.get('firstLineIndentMm')),allowedLineSpacing:String(data.get('allowedLineSpacing')??'').split(/[,;\s]+/).filter(Boolean).map(Number),portraitMarginsMm:{left:Number(data.get('marginLeft')),right:Number(data.get('marginRight')),top:Number(data.get('marginTop')),bottom:Number(data.get('marginBottom'))},requireA4:data.has('requireA4'),requireJustified:data.has('requireJustified'),requirePageNumbers:data.has('requirePageNumbers'),requiredSections:String(data.get('requiredSections')??'').split('\n').map(s=>s.trim()).filter(Boolean)};
  }else delete next.formatting;
  void applyProfile(next).catch(e=>showToast(String(e),true));
 }catch(error){showToast(error instanceof Error?error.message:'Неверный профиль',true);}
});
document.querySelector('#downloadJson')!.addEventListener('click',()=>{if(report)downloadJson('dockcheck-report.json',JSON.parse(exportReportJson(report)));});
function downloadJson(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url);}
document.querySelector('#exportCatalog')!.addEventListener('click',async()=>{const {SOURCE_INDEX,SOURCE_COVERAGE}=await import('./requirements/sourceCoverage');downloadJson('dockcheck-catalog.json',{schemaVersion:1,catalog:CATALOG,coverage:COVERAGE,exclusions:EXCLUSIONS,sourceIndex:SOURCE_INDEX,sourceCoverage:SOURCE_COVERAGE});});
document.querySelector('#exportProfile')!.addEventListener('click',()=>downloadJson('dockcheck-profile.json',profile));
document.querySelector('#importProfile')!.addEventListener('change',async event=>{const input=event.target as HTMLInputElement;try{const file=input.files?.[0];if(!file)return;if(file.size>1024*1024)throw Error('Профиль больше 1 МиБ');const next=parseProfile(JSON.parse(await file.text()));await applyProfile(next);}catch(e){showToast(e instanceof Error?e.message:'Неверный профиль',true);}finally{input.value='';}});
document.querySelector('#resetSettings')!.addEventListener('click',()=>{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_STORAGE_KEY);location.reload();});
syncProfileForm();
if(storageNotice)showToast(storageNotice);
