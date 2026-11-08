import type { Properties } from './model';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
export function resolveFont(props: Properties, text: string, theme?: Document) {
 const slots = new Set(Array.from(text).filter(c=> !/\s/u.test(c)).map(c=> /[\u0590-\u08ff]/u.test(c)?'cs':/[\u2e80-\ud7ff\uf900-\ufaff]/u.test(c)?'eastAsia':c.charCodeAt(0)<128?'ascii':'hAnsi'));
 const values = [];
 for (const slot of slots) {
  const thematic = props[slot === 'cs'?'cstheme':`${slot}Theme`];
  let p = thematic ?? props[slot];
  if (thematic) {
   const family = String(thematic.value).startsWith('major')?'majorFont':'minorFont';
   const root = theme?.getElementsByTagNameNS(A,family)[0];
   const tag = slot==='eastAsia'?'ea':slot==='cs'?'cs':'latin';
   let face = root?.getElementsByTagNameNS(A,tag)[0]?.getAttribute('typeface');
   if(!face && root && slot!=='ascii' && slot!=='hAnsi') {
    const language=String(props[slot==='eastAsia'?'eastAsiaLanguage':'bidiLanguage']?.value ?? '');
    const script=slot==='cs'?/[\u0590-\u05ff]/u.test(text)?'Hebr':'Arab':/[\u3040-\u30ff]/u.test(text)||/^ja/i.test(language)?'Jpan':/[\uac00-\ud7af]/u.test(text)||/^ko/i.test(language)?'Hang':/^zh-(TW|HK|MO|Hant)/i.test(language)?'Hant':/^zh/i.test(language)?'Hans':undefined;
    face=script?Array.from(root.getElementsByTagNameNS(A,'font')).find(n=>n.getAttribute('script')===script)?.getAttribute('typeface'):undefined;
   }
   p = {...thematic,value:face || null,status:face?'resolved':'unsupported',reason:face?undefined:'Тематический шрифт для алфавита не разрешён'};
  }
  if (!p) return {value:null,status:'unknown' as const,source:null,reason:`Не определён шрифт ${slot}`};
  values.push(p);
 }
 const fonts = [...new Set(values.map(p=>p.value))];
 if (values.some(p=>p.status!=='resolved')) return values.find(p=>p.status!=='resolved')!;
 return {...values[0],value:fonts.join(' / '),reason:'Назначенное семейство шрифта по OOXML; наличие шрифта и фактический fallback не проверяются'};
}
export function resolveColor(props: Properties, theme?: Document) {
 const color=props.color;
 const themed=props.colorTheme;
 if(!themed) return color;
 const aliases:Record<string,string>={dark1:'dk1',light1:'lt1',dark2:'dk2',light2:'lt2',hyperlink:'hlink',followedHyperlink:'folHlink'};
 const tag=aliases[String(themed.value)] ?? String(themed.value);
 const scheme=theme?.getElementsByTagNameNS(A,'clrScheme')[0];
 const entry=scheme && Array.from(scheme.childNodes).find((n):n is Element=>n.nodeType===1&&(n as Element).namespaceURI===A&&(n as Element).localName===tag);
 const rgb=entry?.getElementsByTagNameNS(A,'srgbClr')[0]?.getAttribute('val') || entry?.getElementsByTagNameNS(A,'sysClr')[0]?.getAttribute('lastClr');
 const adjusted=rgb && /^[0-9a-f]{6}$/i.test(rgb) ? shadeTint(rgb,props.colorTint?.raw,props.colorShade?.raw):null;
 return {...themed,value:adjusted || null,status:adjusted?'resolved' as const:'unsupported' as const,reason:adjusted?undefined:'Тематический цвет или tint/shade не разрешён'};
}

/** Word's HSL luminance transform; tint takes precedence over shade.
 * MS-OI29500 §2.1.72. Hex attributes preserve the original theme bytes. */
function shadeTint(rgb:string,tint?:string,shade?:string):string|null {
 const modifier=tint ?? shade;if(modifier===undefined)return rgb.toUpperCase();
 if(!/^[0-9a-f]{2}$/i.test(modifier))return null;
 const c=[0,2,4].map(i=>parseInt(rgb.slice(i,i+2),16)/255);
 const hi=Math.max(...c),lo=Math.min(...c),delta=hi-lo,l=(hi+lo)/2;
 const saturation=delta===0?0:delta/(1-Math.abs(2*l-1));
 let h=delta===0?0:hi===c[0]?((c[1]-c[2])/delta)%6:hi===c[1]?(c[2]-c[0])/delta+2:(c[0]-c[1])/delta+4;
 h=(h+6)%6;
 const factor=parseInt(modifier,16)/255;
 const light=tint!==undefined?1-(1-l)*factor:l*factor;
 const chroma=(1-Math.abs(2*light-1))*saturation,x=chroma*(1-Math.abs(h%2-1)),m=light-chroma/2;
 const channels=h<1?[chroma,x,0]:h<2?[x,chroma,0]:h<3?[0,chroma,x]:h<4?[0,x,chroma]:h<5?[x,0,chroma]:[chroma,0,x];
 return channels.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
