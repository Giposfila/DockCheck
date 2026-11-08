import index from './source-index.json';
import { COVERAGE } from './catalog';
import type { CoverageRow } from './schema';
/** The locator index contains hashes rather than redistributing the local PDF's text. */
export const SOURCE_INDEX=index;
export interface SourceDecision {fragmentId:string;pdfPage:number;clause:string;decisionIds:string[];ruleIds:string[];decisions:CoverageRow['decision'][];questions:string[]}
export const SOURCE_COVERAGE:SourceDecision[]=index.fragments.map(fragment=>{
 const c=fragment.clause;
 const inRange=(clause:string)=>{const range=/^(\d+(?:\.\d+)*)[–—](\d+(?:\.\d+)*)$/u.exec(clause);if(!range)return false;const start=range[1].split('.'),end=range[2].split('.'),parts=c.split('.');return parts.length===start.length&&start.length===end.length&&parts.slice(0,-1).join('.')===start.slice(0,-1).join('.')&&Number(parts.at(-1))>=Number(start.at(-1))&&Number(parts.at(-1))<=Number(end.at(-1));};
 let rows=COVERAGE.filter(row=>row.source.clause===c||inRange(row.source.clause));
 if(c==='front-matter'||fragment.pdfPage<=3)rows=COVERAGE.filter(row=>row.id==='front-matter');
 else if(c.startsWith('3.'))rows=COVERAGE.filter(row=>row.id==='terms');
 else if(['1','1.1','1.2','1.3','1.4'].includes(c))rows=COVERAGE.filter(row=>row.id==='scope');
 else if(['5.1','5.2','5.3','5.4'].includes(c))rows=COVERAGE.filter(row=>row.id==='general');
 // Section headings are context; their individual obligations have their own entries.
 else if(!rows.length&&/^\d+(?:\.\d+)?$/u.test(c))rows=COVERAGE.filter(row=>row.source.clause.startsWith(c+'.'));
 if(c==='Библиография')rows=COVERAGE.filter(row=>row.summary==='ПВД МД – 2014');
 return {fragmentId:fragment.id,pdfPage:fragment.pdfPage,clause:c,decisionIds:rows.map(r=>r.id),ruleIds:[...new Set(rows.flatMap(r=>r.ruleIds))],decisions:[...new Set(rows.map(r=>r.decision))],questions:rows.length?[]:['Не установлено решение; требуется сверка локального PDF']};
});
