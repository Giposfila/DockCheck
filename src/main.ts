import './styles.css';
import { exportReport, exportReportJson, groupResults, resultFinding, confirmedChecks, visibleViolations } from './report';
import { pageLabel } from './analyzer/location';
import { checkDocx } from './checker';
import { DEFAULT_PROFILE } from './requirements/profile';
import type { Category, CheckReport, Finding } from './types';

const STANDARD_URL = 'https://iubp.sfu-kras.ru/sites/default/files/page_files/standart-oformleniya_otcheta_po_praktike_compressed.pdf';

const icon = (name: 'lock' | 'file' | 'upload' | 'check' | 'alert' | 'eye' | 'download' | 'arrow' | 'copy' | 'search') => {
  const paths: Record<typeof name, string> = {
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    alert: '<path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  };
  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
};

let analysisEpoch=0;
let report: CheckReport | null = null;
let activeFilter: Category | 'all' = 'all';
let currentFileName = '';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="ДокЧек — на главную">
      <span class="brand-mark">Д</span><span>ДокЧек</span>
    </a>
    <div class="top-actions">
      <span class="privacy-pill">${icon('lock')} Файл остаётся в браузере</span>
    </div>
  </header>

  <main>
    <section class="hero" id="uploadSection">
      <div class="hero-copy">
        <div class="eyebrow"><span></span> СТУ СФУ 7.5-07-2021</div>
        <h1>Проверьте документ<br><em>до нормоконтроля</em></h1>
        <p class="hero-lead">Загрузите DOCX — сервис проверит поля, шрифт, интервалы, заголовки, подписи и структуру по СТУ СФУ. Спорные места честно оставит человеку.</p>
        <div class="trust-row">
          <div><strong>Локально</strong><span>без передачи файла</span></div>
          <div><strong>Понятно</strong><span>с указанием абзацев</span></div>
          <div><strong>По СТУ</strong><span>встроенные требования</span></div>
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

  <div class="toast hidden" id="toast" role="status"></div>
`;

const fileInput = document.querySelector<HTMLInputElement>('#fileInput')!;
const dropzone = document.querySelector<HTMLElement>('#dropzone')!;
const uploadSection = document.querySelector<HTMLElement>('#uploadSection')!;
const processing = document.querySelector<HTMLElement>('#processing')!;
const reportSection = document.querySelector<HTMLElement>('#reportSection')!;

function showToast(message: string, isError = false) {
  const toast = document.querySelector<HTMLElement>('#toast')!;
  toast.textContent = message;
  toast.className = `toast${isError ? ' toast-error' : ''}`;
  window.setTimeout(() => toast.classList.add('hidden'), 3600);
}

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
  currentFileName = file.name;
  uploadSection.classList.add('hidden');
  reportSection.classList.add('hidden');
  processing.classList.remove('hidden');
  document.querySelector('#processingName')!.textContent = `${file.name} · ${formatBytes(file.size)}`;
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    const nextReport = await checkDocx(await file.arrayBuffer(), DEFAULT_PROFILE);
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
  const checked=confirmedChecks(nextReport.results);
  const violations=visibleViolations(nextReport.results).length;
  const passed=checked.filter(r=>r.status==='pass').length;
  document.querySelector('#reportTitle')!.textContent=currentFileName;
  document.querySelector('#reportMeta')!.textContent=`${checked.length} подтверждённых проверок · ${violations} нарушений · ${nextReport.stats.paragraphs} абзацев · ${nextReport.stats.tables} таблиц · ${nextReport.stats.images} изображений`;
  document.querySelector('#scoreGrid')!.innerHTML=`
    <div class="score-card score-main"><div class="score-ring" style="--score:360deg"><span>${violations}</span></div><div><span class="score-label">Подтверждённые нарушения</span><strong>${violations===0?'Нарушений не найдено':'Требуют исправления'}</strong><small>По автоматически проверенным свойствам</small></div></div>
    <div class="score-card"><span class="metric-icon ok">${icon('check')}</span><div><span class="score-label">Соответствий</span><strong>${passed}</strong><small>Подтверждённых проверок</small></div></div>
    <div class="score-card"><span class="metric-icon ok">${icon('file')}</span><div><span class="score-label">Проверено свойств</span><strong>${checked.length}</strong><small>По структуре DOCX</small></div></div>`;
  const meta=document.querySelector('#reportMeta')!;
  const info=document.createElement('p');info.id='profileReport';info.textContent='Встроенные общие требования СТУ. Показаны только подтверждённые результаты автоматической проверки. Проверка частичная.';meta.append(info);
  const recognized=nextReport.document.structure?.elements.filter(e=>e.confidence==='confirmed')??[];
  if(recognized.length){
   const details=document.createElement('details');details.id='documentStructure';
   const summary=document.createElement('summary');summary.textContent=`Распознанная структура · разделы: ${recognized.filter(e=>e.kind==='section').length} · подразделы: ${recognized.filter(e=>e.kind==='subsection').length}`;details.append(summary);
   const labels:Record<string,string>={title:'Титульный лист',body:'Основная часть',contents:'Содержание',introduction:'Введение',conclusion:'Заключение',bibliography:'Список источников',abstract:'Реферат',annotation:'Аннотация',abbreviations:'Список сокращений',appendix:'Приложение',section:'Раздел',subsection:'Подраздел',point:'Пункт',subpoint:'Подпункт'};
   const list=document.createElement('ul');
   for(const element of recognized){const item=document.createElement('li');item.dataset.kind=element.kind;const p=nextReport.document.paragraphs.find(p=>p.id===element.paragraphIds[0]);item.textContent=`${labels[element.kind]??element.kind}${element.label?` ${element.label}`:''}${p&&['section','subsection','point','subpoint'].includes(element.kind)?`: ${p.heading?.title??p.text}`:''}`;list.append(item);}
   details.append(list);meta.append(details);
  }
  renderFilters(nextReport);
  renderFindings(nextReport);
}

function renderFilters(nextReport: CheckReport) {
  const violations=visibleViolations(nextReport.results);
  const categories = (Object.keys(categoryLabels) as Category[]).filter(category=>violations.some(r=>r.category===category));
  document.querySelector('#filters')!.innerHTML = `
    <span class="filter-title">РАЗДЕЛЫ ОТЧЁТА</span>
    <button class="filter ${activeFilter === 'all' ? 'active' : ''}" data-filter="all"><span>Все замечания</span><b>${violations.length}</b></button>
    ${categories.map((category) => `<button class="filter ${activeFilter === category ? 'active' : ''}" data-filter="${category}"><span>${categoryLabels[category]}</span><b>${violations.filter(r=>r.category===category).length}</b></button>`).join('')}
    `;
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
      ${finding.at?.page && finding.at.page.status !== 'unknown' ? `<p class="page-reference">${escapeHtml(pageLabel(finding.at.page))}</p>` : ''}
      ${quoteHtml(finding)}
      <h3>${escapeHtml(finding.title)}</h3>
      ${finding.recommendation ? `<p>${escapeHtml(finding.recommendation)}</p>` : ""}
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
 if(!range || text===undefined || !text.length) return '';
 const excerpt=text.slice(range.start,range.end);
 const beginning=Array.from(excerpt).slice(0,180).join('');
 return `<div class="quote-preview">
   <blockquote>${visibleText(beginning)}${beginning.length<excerpt.length?'…':''}</blockquote>
   <div class="quote-actions">
     <button type="button" class="icon-button copy-quote" data-result="${escapeHtml(f.id)}" aria-label="Скопировать промежуток" title="Скопировать промежуток">${icon('copy')}</button>
   </div>
 </div>`;
}
function renderFindings(nextReport: CheckReport) {
 const container=document.querySelector('#findings')!;
 const items=visibleViolations(nextReport.results).filter(r=>activeFilter==='all'||r.category===activeFilter);
 container.innerHTML=`<div class="list-head"><h2>Подтверждённые нарушения</h2><span>${items.length} мест</span></div>`+
 [...groupResults(items).values()].map(group=>`<details class="finding-group" open><summary>${escapeHtml(group[0].title)} — ${group.length} мест</summary>${group.map(r=>findingCard(resultFinding(r,nextReport.results.indexOf(r)))).join('')}</details>`).join('')+
 (!items.length?'<div class="empty-state"><h3>Подтверждённых нарушений не найдено</h3><p>Проверка выполнена по доступным автоматическим правилам и не доказывает соответствие всем требованиям СТУ.</p></div>':'');
 container.querySelectorAll<HTMLButtonElement>('.copy-quote').forEach(button=>button.addEventListener('click',async()=>{
  const r=nextReport.results[Number(button.dataset.result)], range=r.at?.range;
  if(!range || r.paragraphText===undefined) return;
  const text=r.paragraphText.slice(range.start,range.end);
  try {await navigator.clipboard.writeText(text);showToast('Промежуток скопирован');} catch {showToast('Не удалось скопировать промежуток',true);}
 }));
}

document.querySelector('#newFileButton')!.addEventListener('click', () => {
  analysisEpoch++;
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

document.querySelector('#downloadJson')!.addEventListener('click',()=>{if(report)downloadJson('dockcheck-report.json',JSON.parse(exportReportJson(report)));});
function downloadJson(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url);}
