import { all, attr, child, children } from './package';
import { extract } from './extract';
import { overlay, applyStyle } from './properties';
import type { Properties } from './model';
// Word conditional precedence: MS-OE376 §2.1.254. Region inheritance is
// resolved before precedence, so a derived wholeTable does not erase a base corner.
export function tableStyle(p: Element, doc?: Document) {
 let cell:Element|undefined,row:Element|undefined,table:Element|undefined;
 for(let n:Node|null=p.parentNode;n && n.nodeType===1;n=n.parentNode) {
  const e=n as Element;if(e.localName==='tc'&&!cell)cell=e;if(e.localName==='tr'&&!row)row=e;if(e.localName==='tbl'){table=e;break;}
 }
 if(!table)return {p:{},r:{},invalid:false};
 const id=attr(child(child(table,'tblPr'),'tblStyle'),'val');
 if(!id)return {p:{},r:{},invalid:false};
 const chain:Element[]=[],seen=new Set<string>();let invalid=['tblPrChange','trPrChange','tcPrChange'].some(tag=>all(table!,tag).length>0);
 function inherit(id:string) {
  if(seen.has(id)){invalid=true;return;}seen.add(id);
  const s=doc && all(doc,'style').find(n=>attr(n,'styleId')===id);
  if(!s || attr(s,'type')!=='table'){invalid=true;return;}
  const base=attr(child(s,'basedOn'),'val');if(base)inherit(base);chain.push(s);
 }
 inherit(id);
 const tblPr=child(table,'tblPr'),look=child(tblPr,'tblLook');
 const mask=parseInt(attr(look,'val') ?? '0',16);
 const on=(key:string,bit:number)=>attr(look,key)!==undefined?!['0','false','off'].includes(attr(look,key)!):!!(mask&bit);
 const rows=children(table).filter(n=>n.localName==='tr'),cells=row?children(row).filter(n=>n.localName==='tc'):[];
 const span=(c:Element)=>{const n=Number(attr(child(child(c,'tcPr'),'gridSpan'),'val') ?? 1);if(!Number.isInteger(n)||n<1){invalid=true;return 1;}return n;};
 const gridBefore=Number(attr(child(child(row,'trPr'),'gridBefore'),'val') ?? 0);
 const col=gridBefore+cells.slice(0,cells.indexOf(cell!)).reduce((sum,c)=>sum+span(c),0);
 const columns=Math.max(children(child(table,'tblGrid') ?? table).filter(n=>n.localName==='gridCol').length,...rows.map(r=>children(r).filter(n=>n.localName==='tc').reduce((sum,c)=>sum+span(c),0)));
 const ri=rows.indexOf(row!),firstRow=on('firstRow',32),lastRow=on('lastRow',64),firstCol=on('firstColumn',128),lastCol=on('lastColumn',256);
 const bandSize=(tag:string)=>{
  let value=1;for(const s of chain){const raw=attr(child(child(s,'tblPr'),tag),'val');if(raw!==undefined)value=Number(raw);}
  const direct=attr(child(tblPr,tag),'val');if(direct!==undefined)value=Number(direct);
  if(!Number.isInteger(value)||value<1){invalid=true;return 1;}return value;
 };
 const regions:Record<string,boolean>={wholeTable:true,
  band1Horz:!on('noHBand',512)&&Math.floor((ri-(firstRow?1:0))/bandSize('tblStyleRowBandSize'))%2===0,
  band2Horz:!on('noHBand',512)&&Math.floor((ri-(firstRow?1:0))/bandSize('tblStyleRowBandSize'))%2===1,
  band1Vert:!on('noVBand',1024)&&Math.floor((col-(firstCol?1:0))/bandSize('tblStyleColBandSize'))%2===0,
  band2Vert:!on('noVBand',1024)&&Math.floor((col-(firstCol?1:0))/bandSize('tblStyleColBandSize'))%2===1,
  firstCol:firstCol&&col===0,lastCol:lastCol&&col+span(cell!)===columns,firstRow:firstRow&&ri===0,lastRow:lastRow&&ri===rows.length-1};
 const flags:Record<string,string>={firstRow:'firstRow',lastRow:'lastRow',firstColumn:'firstCol',lastColumn:'lastCol',oddVBand:'band1Vert',evenVBand:'band2Vert',oddHBand:'band1Horz',evenHBand:'band2Horz',firstRowFirstColumn:'nwCell',firstRowLastColumn:'neCell',lastRowFirstColumn:'swCell',lastRowLastColumn:'seCell'};
 regions.nwCell=regions.firstRow&&regions.firstCol;regions.neCell=regions.firstRow&&regions.lastCol;regions.swCell=regions.lastRow&&regions.firstCol;regions.seCell=regions.lastRow&&regions.lastCol;
 for(const owner of [child(row,'trPr'),child(cell,'tcPr'),child(p,'pPr')]) {
  const cnf=child(owner,'cnfStyle');if(!cnf)continue;
  const bits=attr(cnf,'val');if(bits && !/^[01]{12}$/.test(bits))invalid=true;
  Object.entries(flags).forEach(([attribute,region],i)=>{
   const raw=attr(cnf,attribute) ?? bits?.[i];if(raw!==undefined)regions[region]=!['0','false','off'].includes(raw);
  });
 }
 // Vertical merge region propagation is deliberately unknown until a layout-
 // independent interpretation of all merged conditional intersections is available.
 if(rows.some(r=>children(r).filter(n=>n.localName==='tc').some(c=>['vMerge','hMerge'].some(tag=>!!child(child(c,'tcPr'),tag)))))invalid=true;
 let props:Properties={},runs:Properties={};
 for(const region of ['base','wholeTable','band1Horz','band2Horz','band1Vert','band2Vert','firstCol','lastCol','firstRow','lastRow','nwCell','neCell','swCell','seCell']) {
  if(region!=='base'&&!regions[region])continue;
  for(const s of chain) for(const n of region==='base'?[s]:children(s).filter(n=>n.localName==='tblStylePr'&&attr(n,'type')===region)) {
   props=overlay(props,extract(child(n,'pPr'),'word/styles.xml',attr(s,'styleId')));
   runs=applyStyle(runs,extract(child(n,'rPr'),'word/styles.xml',attr(s,'styleId')));
  }
 }
 return {p:props,r:runs,invalid};
}
export function tableGeometry(node: Element, part:string):Properties {
 const result:Properties={};
 function visit(n:Element,path:string){
  if(/Change$/.test(n.localName))return;
  for(const a of Array.from(n.attributes)) if(a.namespaceURI?.includes('wordprocessingml')) result[`${path}@${a.localName}`]={value:a.value,raw:a.value,status:'resolved',source:{part,property:`${path}@${a.localName}`},unit:['w','h','val'].includes(a.localName)?'OOXML (см. type/hRule)':'enum'};
  children(n).forEach((c,i)=>visit(c,`${path}/${c.localName}[${i}]`));
 }
 for(const tag of ['tblPr','tblGrid','trPr','tcPr']) {const p=child(node,tag);if(p)visit(p,tag);}
 const pr=child(node,node.localName==='tbl'?'tblPr':node.localName==='tr'?'trPr':'tcPr');
 const save=(key:string,raw:string|undefined,value:string|number|boolean|null,unit:string,reason?:string)=>{
  if(raw===undefined)return;
  result[key]={raw,value,status:value===null?'unknown':'resolved',unit,source:{part,property:key},reason};
 };
 for(const tag of ['tblW','tcW']) {
  const w=child(pr,tag),raw=attr(w,'w'),type=attr(w,'type') ?? 'dxa';
  save(`${tag}.type`,type,type,'enum');
  const n=Number(raw);save(`${tag}.value`,raw,['auto','nil'].includes(type)?type:Number.isFinite(n)&&['dxa','pct'].includes(type)?n/(type==='pct'?50:56.6929133858):null,type==='pct'?'%':type==='dxa'?'mm':'enum');
 }
 const height=child(pr,'trHeight'),raw=attr(height,'val');
 save('row.height',raw,raw!==undefined&&Number.isFinite(Number(raw))?Number(raw)/56.6929133858:null,'mm');
 const mode=attr(height,'hRule') ?? 'auto';if(height)save('row.heightRule',mode,mode,'enum');
 const header=child(pr,'tblHeader');if(header)save('row.repeatHeader',attr(header,'val') ?? 'true',!['0','false','off'].includes(attr(header,'val') ?? ''),'boolean');
 for(const tag of ['tcMar','tblCellMar'])for(const edge of children(child(pr,tag) ?? node).filter(n=>['top','left','bottom','right','start','end'].includes(n.localName))) {
  const raw=attr(edge,'w'),type=attr(edge,'type') ?? 'dxa';save(`${tag}.${edge.localName}`,raw,type==='dxa'&&Number.isFinite(Number(raw))?Number(raw)/56.6929133858:null,type==='dxa'?'mm':type);
 }
 for(const tag of ['tcBorders','tblBorders'])for(const edge of children(child(pr,tag) ?? node)) {
  const val=attr(edge,'val');if(val===undefined)continue;
  save(`${tag}.${edge.localName}.style`,val,val,'enum');const size=attr(edge,'sz');save(`${tag}.${edge.localName}.width`,size,Number.isFinite(Number(size))?Number(size)/8:null,'pt');
 }
 if(['tblPrChange','trPrChange','tcPrChange'].some(tag=>all(node,tag).length>0))for(const key of Object.keys(result))result[key]={...result[key],value:null,status:'unsupported',reason:'Изменённая геометрия таблицы не принята'};
 return result;
}
