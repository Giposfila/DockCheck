import type { DocumentLocation, PageReference, Paragraph } from './model';

export const unknownPage = (reason = 'В DOCX недостаточно сохранённых данных для определения страницы'): PageReference => ({status:'unknown', source:'none', reason});
export function pageLabel(page: PageReference): string {
 return page.status==='saved' ? `Страница ≈ ${page.physical} — по сохранённой разметке DOCX; в Word может отличаться` : page.status==='confirmed' ? `Страница ${page.physical}` : `Страница не определена — ${page.reason}`;
}
export function locationLabel(at: DocumentLocation): string {
 const areas = {body:'Основной текст',table:'Таблица',header:'Верхний колонтитул',footer:'Нижний колонтитул',note:'Сноска',textbox:'Текстовый блок',section:'Раздел',document:'Документ'};
 const path = [areas[at.area]];
 if(at.section!==undefined) path.push(`раздел ${at.section}`);
 if(at.storyId) path.push(at.storyId);
 for(const t of at.tablePath) {path.push(`таблица ${t.table}`);if(t.row)path.push(`строка ${t.row}`);if(t.cell)path.push(`ячейка ${t.cell}`);};
 if(at.paragraphNumber!==undefined) path.push(`абзац ${at.paragraphNumber}`);
 return path.join(' → ');
}
/** Saved breaks are a cache, never a layout proof. Only intervals bounded by two
 * cached markers receive a hint; an explicit/section break makes this cache ambiguous. */
export function assignSavedPages(paragraphs: Paragraph[], ambiguous: boolean) {
 const body = paragraphs.filter(p=>p.at.part==='word/document.xml' && p.at.area!=='textbox');
 const anchors = body.flatMap((p,i)=>p.savedBreaks.map(offset=>({i,offset})));
 function page(i:number,start:number,end:number):PageReference {
  if(ambiguous) return unknownPage('Разрывы страниц или секций не позволяют надёжно сопоставить сохранённые маркеры');
  let low=0,high=anchors.length;
  while(low<high){const middle=(low+high)>>>1,a=anchors[middle];if(a.i<i||a.i===i&&a.offset<=start)low=middle+1;else high=middle;}
  const next=anchors[low];
  if(!low || !next || next.i<i || next.i===i && next.offset<end) return unknownPage();
  return {status:'saved',source:'lastRenderedPageBreak',physical:low+1,reason:'Сохранённая разметка может быть устаревшей; печатный номер не вычислен'};
 }
 body.forEach((p,i)=>{
  p.at.page=page(i,0,p.text.length);
  for(const r of p.runs) r.at.page=page(i,r.at.range!.start,r.at.range!.end);
 });
}
