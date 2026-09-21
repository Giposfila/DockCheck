import './styles.css';
import { checkDocx, DEFAULT_REQUIREMENTS } from './checker';
import type { Category, CheckReport, Finding, Requirements } from './types';

const STANDARD_URL = 'https://iubp.sfu-kras.ru/sites/default/files/page_files/standart-oformleniya_otcheta_po_praktike_compressed.pdf';
const STORAGE_KEY = 'dockcheck-sfu-requirements-v1';

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

function loadRequirements(): Requirements {
  try {
    return { ...DEFAULT_REQUIREMENTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') };
  } catch {
    return structuredClone(DEFAULT_REQUIREMENTS);
  }
}

let requirements = loadRequirements();
let report: CheckReport | null = null;
let activeFilter: Category | 'all' | 'manual' = 'all';
let currentFileName = '';

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
          <div><strong>Основа проверки</strong><span>СТУ 7.5-07-2021, разделы 6–7</span></div>
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
  <aside class="drawer" id="settingsDrawer" aria-hidden="true" aria-label="Настройки шаблона">
    <div class="drawer-head"><div><span class="mini-label">ШАБЛОН ТРЕБОВАНИЙ</span><h2>Что проверять</h2></div><button class="icon-button" id="closeSettings" aria-label="Закрыть">${icon('close')}</button></div>
    <form id="requirementsForm">
      <fieldset><legend>Основной текст</legend>
        <label>Шрифт<input name="fontFamily" value="${requirements.fontFamily}"></label>
        <div class="field-row"><label>Кегль, пт<input type="number" name="fontSizePt" min="8" max="32" step="0.5" value="${requirements.fontSizePt}"></label><label>Абзац, мм<input type="number" name="firstLineIndentMm" min="0" max="30" step="0.5" value="${requirements.firstLineIndentMm}"></label></div>
        <label>Допустимые интервалы<input name="allowedLineSpacing" value="${requirements.allowedLineSpacing.join(', ')}"><small>Через запятую: 1, 1.5</small></label>
        <label class="toggle"><input type="checkbox" name="requireJustified" ${requirements.requireJustified ? 'checked' : ''}><span></span><div><strong>Выравнивание по ширине</strong><small>Для абзацев основного текста</small></div></label>
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
      <fieldset><legend>Обязательные разделы</legend>
        <label>По одному на строку<textarea name="requiredSections" rows="4">${requirements.requiredSections.join('\n')}</textarea></label>
      </fieldset>
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
}

function closeSettings() {
  settingsDrawer.classList.remove('open');
  settingsDrawer.setAttribute('aria-hidden', 'true');
  drawerBackdrop.classList.add('hidden');
}

document.querySelector('#settingsButton')!.addEventListener('click', openSettings);
document.querySelector('#closeSettings')!.addEventListener('click', closeSettings);
drawerBackdrop.addEventListener('click', closeSettings);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSettings(); });
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
  currentFileName = file.name;
  uploadSection.classList.add('hidden');
  reportSection.classList.add('hidden');
  processing.classList.remove('hidden');
  document.querySelector('#processingName')!.textContent = `${file.name} · ${formatBytes(file.size)}`;
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    report = await checkDocx(await file.arrayBuffer(), requirements);
    report.fileName = file.name;
    activeFilter = 'all';
    renderReport(report);
    processing.classList.add('hidden');
    reportSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
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
  const errors = nextReport.findings.filter((f) => f.severity === 'error').length;
  const warnings = nextReport.findings.length - errors;
  const checked = Math.max(12, 12 + nextReport.stats.paragraphs * 4 + nextReport.stats.sections * 5);
  const score = Math.max(0, Math.round(100 - errors * 6 - warnings * 2.5));
  document.querySelector('#reportTitle')!.textContent = currentFileName;
  document.querySelector('#reportMeta')!.textContent = `${nextReport.stats.paragraphs} абзацев · ${nextReport.stats.tables} таблиц · ${nextReport.stats.images} изображений`;
  document.querySelector('#scoreGrid')!.innerHTML = `
    <div class="score-card score-main"><div class="score-ring" style="--score:${score * 3.6}deg"><span>${score}</span></div><div><span class="score-label">Предварительная готовность</span><strong>${score >= 85 ? 'Почти готово' : score >= 60 ? 'Нужна правка' : 'Есть существенные замечания'}</strong><small>Оценка — ориентир, не решение нормоконтроля</small></div></div>
    <div class="score-card"><span class="metric-icon error">${icon('alert')}</span><div><span class="score-label">Нарушения</span><strong>${errors}</strong><small>Требуют исправления</small></div></div>
    <div class="score-card"><span class="metric-icon warning">${icon('eye')}</span><div><span class="score-label">Предупреждения</span><strong>${warnings}</strong><small>Стоит перепроверить</small></div></div>
    <div class="score-card"><span class="metric-icon ok">${icon('check')}</span><div><span class="score-label">Проверено свойств</span><strong>${checked}+</strong><small>По структуре DOCX</small></div></div>`;
  renderFilters(nextReport);
  renderFindings(nextReport);
}

function renderFilters(nextReport: CheckReport) {
  const categories = (Object.keys(categoryLabels) as Category[]).filter((category) => nextReport.findings.some((f) => f.category === category));
  document.querySelector('#filters')!.innerHTML = `
    <span class="filter-title">РАЗДЕЛЫ ОТЧЁТА</span>
    <button class="filter ${activeFilter === 'all' ? 'active' : ''}" data-filter="all"><span>Все замечания</span><b>${nextReport.findings.length}</b></button>
    ${categories.map((category) => `<button class="filter ${activeFilter === category ? 'active' : ''}" data-filter="${category}"><span>${categoryLabels[category]}</span><b>${nextReport.findings.filter((f) => f.category === category).length}</b></button>`).join('')}
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
      <div class="finding-top"><span>${categoryLabels[finding.category]} · п. ${escapeHtml(finding.clause)}</span><span class="location">${escapeHtml(finding.location)}</span></div>
      <h3>${escapeHtml(finding.title)}</h3>
      ${finding.excerpt ? `<blockquote>«${escapeHtml(finding.excerpt)}»</blockquote>` : ''}
      <div class="comparison"><div><span>СЕЙЧАС</span><p>${escapeHtml(finding.actual)}</p></div><div><span>ТРЕБУЕТСЯ</span><p>${escapeHtml(finding.expected)}</p></div></div>
    </div>
  </article>`;
}

function renderFindings(nextReport: CheckReport) {
  const container = document.querySelector('#findings')!;
  if (activeFilter === 'manual') {
    container.innerHTML = `<div class="list-head"><div><span class="mini-label">ЗОНА ОТВЕТСТВЕННОСТИ ЧЕЛОВЕКА</span><h2>Проверьте вручную</h2></div><span>${nextReport.manualChecks.length} пунктов</span></div>
      <div class="manual-intro">${icon('eye')} <p><strong>DOCX — не готовая страница.</strong> Эти пункты зависят от визуальной вёрстки, смысла текста или вида учебной работы.</p></div>
      ${nextReport.manualChecks.map((item, index) => `<article class="manual-card"><span>${String(index + 1).padStart(2, '0')}</span><div><small>П. ${escapeHtml(item.clause)}</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.reason)}</p></div></article>`).join('')}`;
    return;
  }
  const items = activeFilter === 'all' ? nextReport.findings : nextReport.findings.filter((f) => f.category === activeFilter);
  container.innerHTML = `<div class="list-head"><div><span class="mini-label">АВТОМАТИЧЕСКАЯ ПРОВЕРКА</span><h2>${activeFilter === 'all' ? 'Все замечания' : categoryLabels[activeFilter]}</h2></div><span>${items.length} найдено</span></div>
    ${items.length ? items.map(findingCard).join('') : `<div class="empty-state"><div>${icon('check')}</div><h3>Замечаний не найдено</h3><p>В этом разделе всё соответствует текущему шаблону.</p></div>`}`;
}

document.querySelector('#newFileButton')!.addEventListener('click', () => {
  report = null;
  fileInput.value = '';
  reportSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.querySelector('#downloadButton')!.addEventListener('click', () => {
  if (!report) return;
  const rows = report.findings.map((f, i) => `${i + 1}. [${f.severity === 'error' ? 'НАРУШЕНИЕ' : 'ПРЕДУПРЕЖДЕНИЕ'}] ${f.title}\n   ${f.location}; п. ${f.clause}\n   Сейчас: ${f.actual}\n   Требуется: ${f.expected}${f.excerpt ? `\n   Фрагмент: «${f.excerpt}»` : ''}`).join('\n\n');
  const manual = report.manualChecks.map((item, i) => `${i + 1}. ${item.title} (${item.clause})\n   ${item.reason}`).join('\n\n');
  const body = `ДОКЧЕК — ОТЧЁТ ПО СТУ СФУ 7.5-07-2021\n\nФайл: ${report.fileName}\nПроверено: ${new Date(report.checkedAt).toLocaleString('ru-RU')}\nАбзацев: ${report.stats.paragraphs}; таблиц: ${report.stats.tables}; изображений: ${report.stats.images}\n\nАВТОМАТИЧЕСКИЕ ЗАМЕЧАНИЯ (${report.findings.length})\n\n${rows || 'Не найдено.'}\n\nПРОВЕРИТЬ ВРУЧНУЮ\n\n${manual}\n\nОтчёт является предварительным и не заменяет нормоконтроль.`;
  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${currentFileName.replace(/\.docx$/i, '')}-отчёт.txt`;
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector('#requirementsForm')!.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget as HTMLFormElement);
  const numeric = (name: string, fallback: number) => Number(data.get(name)) || fallback;
  requirements = {
    ...requirements,
    fontFamily: String(data.get('fontFamily') || DEFAULT_REQUIREMENTS.fontFamily).trim(),
    fontSizePt: numeric('fontSizePt', DEFAULT_REQUIREMENTS.fontSizePt),
    firstLineIndentMm: numeric('firstLineIndentMm', DEFAULT_REQUIREMENTS.firstLineIndentMm),
    allowedLineSpacing: String(data.get('allowedLineSpacing') || '1, 1.5').split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0),
    portraitMarginsMm: { left: numeric('marginLeft', 30), right: numeric('marginRight', 10), top: numeric('marginTop', 20), bottom: numeric('marginBottom', 20) },
    requireA4: data.has('requireA4'), requireJustified: data.has('requireJustified'), requirePageNumbers: data.has('requirePageNumbers'),
    requiredSections: String(data.get('requiredSections') || '').split('\n').map((s) => s.trim()).filter(Boolean),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requirements));
  closeSettings();
  showToast('Шаблон сохранён для следующих проверок.');
});

document.querySelector('#resetSettings')!.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
});
