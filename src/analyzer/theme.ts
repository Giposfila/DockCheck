import type { Properties } from './model';
export function resolveFont(props: Properties, text: string, theme?: Document) {
 const slots = new Set(Array.from(text).filter(c=> !/\s/u.test(c)).map(c=> /[\u0590-\u08ff]/u.test(c)?'cs':/[\u2e80-\ud7ff\uf900-\ufaff]/u.test(c)?'eastAsia':c.charCodeAt(0)<128?'ascii':'hAnsi'));
 const values = [];
 for (const slot of slots) {
  const thematic = props[slot === 'cs'?'cstheme':`${slot}Theme`];
  let p = thematic ?? props[slot];
  if (thematic) {
   const family = String(thematic.value).startsWith('major')?'majorFont':'minorFont';
   const root = theme?.getElementsByTagNameNS('*',family)[0];
   const tag = slot==='eastAsia'?'ea':slot==='cs'?'cs':'latin';
   const face = root?.getElementsByTagNameNS('*',tag)[0]?.getAttribute('typeface');
   p = {...thematic,value:face || null,status:face?'resolved':'unsupported',reason:face?undefined:'Тематический шрифт для алфавита не разрешён'};
  }
  if (!p) return {value:null,status:'unknown' as const,source:null,reason:`Не определён шрифт ${slot}`};
  values.push(p);
 }
 const fonts = [...new Set(values.map(p=>p.value))];
 if (values.some(p=>p.status!=='resolved')) return values.find(p=>p.status!=='resolved')!;
 return {...values[0],value:fonts.join(' / ')};
}
export function resolveColor(props: Properties, theme?: Document) {
 const color=props.color;
 const themed=props.colorTheme;
 if(!themed) return color;
 const aliases:Record<string,string>={dark1:'dk1',light1:'lt1',dark2:'dk2',light2:'lt2',hyperlink:'hlink',followedHyperlink:'folHlink'};
 const tag=aliases[String(themed.value)] ?? String(themed.value);
 const scheme=theme?.getElementsByTagNameNS('*','clrScheme')[0];
 const entry=scheme && Array.from(scheme.childNodes).find((n):n is Element=>n.nodeType===1&&(n as Element).localName===tag);
 const rgb=entry?.getElementsByTagNameNS('*','srgbClr')[0]?.getAttribute('val') || entry?.getElementsByTagNameNS('*','sysClr')[0]?.getAttribute('lastClr');
 return {...themed,value:rgb || null,status:rgb?'resolved' as const:'unsupported' as const,reason:rgb?undefined:'Тематический цвет не разрешён'};
}
