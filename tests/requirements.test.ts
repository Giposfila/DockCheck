import {describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {CATALOG,COVERAGE,EXCLUSIONS,STAMP_GEOMETRY,TITLE_FORMS,EXTERNAL_DEPENDENCIES} from '../src/requirements/catalog';
import {SOURCE_COVERAGE,SOURCE_INDEX} from '../src/requirements/sourceCoverage';
import {always,eq,evaluate,validateCatalog} from '../src/requirements/schema';
import {DEFAULT_PROFILE,legacyProfile,migrateLegacy,parseProfile,profileConflicts,WORK_KINDS} from '../src/requirements/profile';
import {applicability,evaluateRequirements,predicate} from '../src/requirements/engine';
import {checkDocx,DEFAULT_REQUIREMENTS} from '../src/checker';
import {exportReport,exportReportJson} from '../src/report';
import {checks} from '../src/checks/formatting';
import type {DocumentModel,Paragraph} from '../src/analyzer/model';
import {unknownPage} from '../src/analyzer/location';
import {describeStructure,resolveVisibleNumbers} from '../src/analyzer/structure';
const rule=(id:string)=>structuredClone(CATALOG.rules.find(r=>r.id===id)!);
const model=():DocumentModel=>({paragraphs:[],sections:[],objects:[],tables:0,images:0,unsupported:[],limitations:[]});
const prop=(value:string|number|boolean,unit?:string)=>({value,status:'resolved' as const,source:{part:'word/document.xml',property:'test'},unit});
const paragraph=(text:string,role:Paragraph['role']='body'):Paragraph=>({id:'p1',text,role,location:'Абзац 1',at:{part:'word/document.xml',area:'body',paragraphId:'p1',tablePath:[],range:{start:0,end:text.length,unit:'utf16'},page:unknownPage()},properties:{},explicit:{},pageField:false,fieldStatus:'none',savedBreaks:[],runs:[]});
describe('normative data integrity',()=>{
 it('validates catalog, matrix and a decision for every indexed PDF fragment',()=>{
  expect(()=>validateCatalog(CATALOG.rules,COVERAGE)).not.toThrow();
  expect(new Set(SOURCE_INDEX.fragments.map(f=>f.pdfPage)).size).toBe(61);
  expect(SOURCE_COVERAGE.filter(f=>!f.decisionIds.length)).toEqual([]);
  expect(CATALOG.rules.length).toBeGreaterThan(350);
  for(const r of CATALOG.rules)for(const dependency of r.externalDependencies)expect(EXTERNAL_DEPENDENCIES.some(d=>d.designation===dependency)).toBe(true);
  expect(Object.isFrozen(CATALOG.rules[0].assertion)).toBe(true);
 });
 it('separates excluded judgments, examples and external normative texts',()=>{
  expect(EXCLUSIONS.every(r=>r.ruleIds.length===0&&r.type==='subjective')).toBe(true);
  expect(COVERAGE.find(r=>r.id==='appendix.P')?.decision).toBe('context');
  expect(EXTERNAL_DEPENDENCIES.every(d=>!d.fullTextAvailable&&!d.validatorAvailable)).toBe(true);
  expect(rule('stu.contents.short').modality).toBe('recommendation');
  expect(CATALOG.rules.some(r=>r.property==='requireContentsOverPages')).toBe(false);
 });
 it.each(WORK_KINDS)('has explicit title-form selection for %s',kind=>{expect(TITLE_FORMS[kind]).toMatch(/^[БВГДИКЛМН]$/u);expect(()=>parseProfile({...structuredClone(DEFAULT_PROFILE),workKind:kind})).not.toThrow();});
 it('checks transcribed diagram totals with independent expected overall dimensions',()=>{
  expect(STAMP_GEOMETRY.map(g=>[g.width,g.height])).toEqual([[185,40],[185,40],[185,15],[185,15],[185,55],[185,55]]);
  for(const g of STAMP_GEOMETRY){expect(g.columns.reduce((a,b)=>a+b,0)).toBe(185);expect(g.rows.reduce((a,b)=>a+b,0)).toBe(g.height);}
  expect(rule('stu.frame.edge.left').assertion.value).toBe(20);expect(rule('stu.frame.gap.vertical').assertion.value).toBe(15);
 });
 it('rejects duplicate ids, missing references, dependency cycles and contradictions',()=>{
  const r=rule('stu.text.size');expect(()=>validateCatalog([r,r])).toThrow();
  expect(()=>validateCatalog([{...r,dependsOn:['absent']}])).toThrow();
  const b={...r,id:'test.other',dependsOn:[r.id]};expect(()=>validateCatalog([{...r,dependsOn:[b.id]},b])).toThrow(/Цикл/);
  expect(()=>validateCatalog([r,{...r,id:'test.other',assertion:{op:'eq',value:12,unit:'pt'}}])).toThrow(/Противоречие/);
  expect(()=>validateCatalog([{...r,assertion:{op:'eq',value:'14',unit:'pt'}}])).toThrow(/единицы/);
  expect(()=>validateCatalog([{...r,when:{op:'execute',code:'alert(1)'}}])).toThrow();
 });
});
describe('declarative applicability and proof',()=>{
 it('uses three-valued conditions including unknown exceptions',()=>{
  expect(evaluate(eq('workKind','essay'),{})).toBe('unknown');
  expect(evaluate({op:'all',args:[eq('x',true),eq('y',true)]},{x:false})).toBe(false);
  expect(evaluate({op:'any',args:[eq('x',true),eq('y',true)]},{x:false})).toBe('unknown');
  expect(evaluate({op:'not',arg:eq('x',true)},{})).toBe('unknown');
  const r=rule('stu.text.size');r.exceptions=[eq('special',true)];
  expect(applicability(r,{})).toBe('unknown');expect(applicability(r,{special:true})).toBe(false);expect(applicability(r,{special:false})).toBe(true);
 });
 it('supports allowed numerical alternatives and never fills a missing fact',()=>{
  expect(predicate({op:'oneOf',value:[1,1.5],unit:'multiplier'},1)).toBe(true);
  expect(predicate({op:'oneOf',value:[1,1.5],unit:'multiplier'},2)).toBe(false);
  expect(predicate({op:'max',value:15,unit:'count'},null)).toBe('unknown');
 });
 it('does not turn permissions into demands or absence of context into inapplicability',()=>{
  const results=evaluateRequirements(model(),structuredClone(DEFAULT_PROFILE),[]);
  expect(results.find(r=>r.ruleId==='stu.margin.portrait.left')?.status).toBe('unknown');
  expect(results.find(r=>r.ruleId==='stu.poster.color')?.status).toBe('unknown');
  expect(evaluateRequirements(model(),{...structuredClone(DEFAULT_PROFILE),artifacts:{posters:false}},[]).find(r=>r.ruleId==='stu.poster.color')?.status).toBe('not_applicable');
  expect(results.find(r=>r.ruleId==='stu.abstract.pages')?.status).toBe('unknown');
  expect(evaluateRequirements(model(),{...structuredClone(DEFAULT_PROFILE),workKind:'essay'},[]).find(r=>r.ruleId==='stu.abstract.pages')?.status).toBe('not_applicable');
 });
 it.each(['portrait','landscape'] as const)('checks %s margins at twip precision',orientation=>{
  const m=model();m.sections=[{headers:{},footers:{},properties:{orientation:prop(orientation),marginLeft:prop(orientation==='portrait'?30:20,'mm'),marginRight:prop(orientation==='portrait'?10:20,'mm'),top:prop(orientation==='portrait'?20:30,'mm'),bottom:prop(orientation==='portrait'?20:10,'mm'),mirrorMargins:prop(false)}}];
  const profile={...structuredClone(DEFAULT_PROFILE),workKind:'essay' as const,documentMode:'unframed' as const};
  let result=evaluateRequirements(m,profile,[]).find(r=>r.ruleId===`stu.margin.${orientation}.left`)!;expect(result.status).toBe('pass');expect(result.tolerance).toBe(.02);
  m.sections[0].properties.marginLeft=prop(orientation==='portrait'?30.1:20.1,'mm');result=evaluateRequirements(m,profile,[]).find(r=>r.ruleId===`stu.margin.${orientation}.left`)!;expect(result.status).toBe('fail');
  expect(evaluateRequirements(m,{...profile,documentMode:'framed'},[]).find(r=>r.ruleId===`stu.margin.${orientation}.left`)?.status).toBe('not_applicable');
  expect(checks(m,DEFAULT_REQUIREMENTS).find(r=>r.ruleId==='section.margin.left')?.status).toBe('fail');
 });
 it('does not promote a matching heading or saved page into proof',()=>{
  const m=model();m.paragraphs=[paragraph('СОДЕРЖАНИЕ')];m.structure=describeStructure(m);
  expect(m.structure.elements[0].confidence).toBe('candidate');
  const results=evaluateRequirements(m,{...structuredClone(DEFAULT_PROFILE),workKind:'bachelor'},[]);
  expect(results.find(r=>r.ruleId==='stu.structure.title')?.status).toBe('unknown');
  expect(results.find(r=>r.ruleId==='stu.abstract.pages')).toMatchObject({status:'unknown',reasonCode:'needs_layout'});
  expect(m.paragraphs[0].text).toBe('СОДЕРЖАНИЕ');
 });
 it('checks the eligibility of the selected combined form without demanding it',()=>{
  const p={...structuredClone(DEFAULT_PROFILE),workKind:'bachelor' as const,approvalVariant:'combined' as const,consultants:3};
  expect(evaluateRequirements(model(),p,[]).find(r=>r.ruleId==='stu.title.combined-eligibility')?.status).toBe('fail');
  expect(profileConflicts(p).some(s=>s.includes('Ж'))).toBe(true);
  expect(evaluateRequirements(model(),{...p,consultants:2},[]).find(r=>r.ruleId==='stu.title.combined-eligibility')?.status).toBe('pass');
 });
});
describe('profile validation and migration',()=>{
 it('round-trips without partial application or executable input',()=>{expect(parseProfile(JSON.parse(JSON.stringify(DEFAULT_PROFILE)))).toEqual(DEFAULT_PROFILE);expect(()=>parseProfile({...DEFAULT_PROFILE,schemaVersion:1})).toThrow();expect(()=>parseProfile({...DEFAULT_PROFILE,workKind:'fake'})).toThrow();expect(()=>parseProfile({...DEFAULT_PROFILE,execute:'code'})).toThrow();expect(()=>parseProfile({...DEFAULT_PROFILE,consultants:-1})).toThrow();});
 it('requires local provenance and retains conflicting base rules',()=>{
  const p={...structuredClone(DEFAULT_PROFILE),localRequirements:[{id:'local.size',ruleId:'stu.text.size',assertion:{op:'eq' as const,value:12,unit:'pt' as const},source:'Методические указания кафедры',explanation:'Локальный шаблон'}]};expect(parseProfile(p)).toEqual(p);expect(profileConflicts(p)).toHaveLength(1);expect(rule('stu.text.size').assertion.value).toBe(14);
  expect(()=>parseProfile({...p,localRequirements:[{...p.localRequirements[0],source:''}]})).toThrow();
  expect(()=>parseProfile({...p,localRequirements:[{...p.localRequirements[0],assertion:{op:'eq',value:12,unit:'mm'}}]})).toThrow();
 });
 it('discards old section and contents obligations during migration',()=>{
  const migrated=migrateLegacy({...DEFAULT_REQUIREMENTS,requiredSections:['ВВЕДЕНИЕ'],requireContentsOverPages:24});
  expect(migrated.profile.formatting?.requiredSections).toEqual([]);expect(JSON.stringify(migrated.profile)).not.toContain('requireContentsOverPages');expect(()=>parseProfile(migrated.profile)).not.toThrow();
  expect(migrateLegacy({fontSizePt:'broken'}).profile).toEqual(DEFAULT_PROFILE);
  expect(()=>parseProfile(legacyProfile(DEFAULT_REQUIREMENTS))).not.toThrow();
 });
});
describe('new report and analytical evidence',()=>{
 it('has a conservative standard default and a separately identified compatibility comparison',async()=>{
  const data=await readFile(new URL('./fixtures/incorrect.docx',import.meta.url));
  const report=await checkDocx(data);expect(report.profile?.id).toBe('work');expect(report.results.find(r=>r.ruleId==='stu.text.font')).toMatchObject({status:'unknown',reasonCode:'ambiguous_role',origin:'standard',normSource:{clause:'7.1.1',pdfPage:14}});
  const local=await checkDocx(data,DEFAULT_REQUIREMENTS);expect(local.findings.some(f=>f.origin==='local')).toBe(true);
  const text=exportReport(report);for(const expected of ['Нормативный источник','Доказательства','ambiguous_role','stu-2021.1'])expect(text).toContain(expected);
  expect(JSON.parse(exportReportJson(report))).toMatchObject({schemaVersion:1,report:{profile:{schemaVersion:2}}});
  expect(report.stats.estimatedPages).toBeUndefined();
 });
 it('separates table size recommendations from mandatory body size',()=>{
  const m=model(),p=paragraph('Cell','table');p.at.area='table';p.runs=[{id:'r',text:'Cell',at:p.at,pageField:false,explicit:{},fontRanges:[],properties:{fontSize:prop(14,'pt'),font:prop('Times New Roman')}}];m.paragraphs=[p];m.tables=1;
  const results=evaluateRequirements(m,structuredClone(DEFAULT_PROFILE),checks(m,DEFAULT_REQUIREMENTS));
  expect(results.find(r=>r.ruleId==='stu.table.text-size')).toMatchObject({status:'fail',modality:'recommendation'});
  expect(results.find(r=>r.ruleId==='stu.text.size')?.status).toBe('not_applicable');
 });
 it('counts supported lists in separate stories and refuses unsupported levels',()=>{
  const list=(id:string,level=0):Paragraph=>({...paragraph('item','list'),id,properties:{numId:prop('7'),level:prop(String(level)),numberFormat:prop('decimal'),numberText:prop('%1)'),numberStart:prop('3')}});
  const ps=[list('a'),list('b'),list('c',1),list('d')];resolveVisibleNumbers(ps);
  expect(ps.map(p=>p.properties.visibleNumber.value)).toEqual(['3)','4)',null,null]);
  const separate=[list('a'),list('b')];separate[1].at.part='word/footer1.xml';resolveVisibleNumbers(separate);expect(separate.map(p=>p.properties.visibleNumber.value)).toEqual(['3)','3)']);
 });
 it('retains reference candidate UTF-16 ranges around emoji and repeated text',()=>{
  const m=model();m.paragraphs=[paragraph('😀 см. рисунок А.1 и рисунок А.1')];const result=describeStructure(m);expect(result.references).toHaveLength(2);
  for(const r of result.references){expect(m.paragraphs[0].text.slice(r.at.range!.start,r.at.range!.end)).toBe('рисунок А.1');expect(r.status).toBe('ambiguous');}
 });
});

describe('ONLYOFFICE converter reference (not a layout oracle)',()=>{
 it('reads independently specified RTF typography and page geometry from the converted DOCX',async()=>{
  const report=await checkDocx(await readFile(new URL('./fixtures/onlyoffice-reference.docx',import.meta.url)));
  const paragraphs=report.document.paragraphs.filter(p=>p.text.trim());
  expect(paragraphs).toHaveLength(2);
  expect(paragraphs[0].runs[0].properties.font.value).toBe('Times New Roman');
  expect(paragraphs[0].runs[0].properties.fontSize.value).toBe(14);
  expect(paragraphs[1].runs[0].properties.font.value).toBe('Arial');
  expect(paragraphs[1].runs[0].properties.fontSize.value).toBe(12);
  expect(paragraphs[0].properties.firstLine.value).toBeCloseTo(12.506,2);
  expect(paragraphs[0].properties.line.value).toBe(360);
  expect(paragraphs[0].properties.align.value).toBe('both');
  const section=report.document.sections[0].properties;
  expect(section.width.value).toBeCloseTo(210,1);expect(section.height.value).toBeCloseTo(297,1);
  expect(section.marginLeft.value).toBeCloseTo(30,1);expect(section.marginRight.value).toBeCloseTo(10,1);
  expect(report.stats.estimatedPages).toBeUndefined();
 });
});

it('keeps declared artifacts/evidence separate and validates their links',()=>{
 const profile={...structuredClone(DEFAULT_PROFILE),workKind:'bachelor' as const,artifactManifest:[{id:'assignment',kind:'assignment' as const,name:'Задание',provided:true,source:'Комплект пользователя'}],externalEvidence:[{ruleId:'stu.assignment.individual',artifactId:'assignment',kind:'user-confirmation' as const,source:'Пользователь',statement:'Задание получено'}]};
 expect(()=>parseProfile(profile)).not.toThrow();
 expect(evaluateRequirements(model(),profile,[]).find(r=>r.ruleId==='stu.assignment.individual')).toMatchObject({status:'unknown',evidence:[{kind:'user-confirmation'}]});
 expect(()=>parseProfile({...profile,externalEvidence:[{...profile.externalEvidence[0],artifactId:'missing'}]})).toThrow();
 expect(evaluateRequirements(model(),{...structuredClone(DEFAULT_PROFILE),workKind:'essay',approvalVariant:'combined',consultants:3},[]).find(r=>r.ruleId==='stu.title.combined-eligibility')?.status).toBe('not_applicable');
});
