import { unknown, type Properties } from './model';
export const textKeys=['font','fontSize','bold','italic','underline','color','verticalAlign','characterSpacing'];
export const paragraphKeys=['align','left','right','firstLine','hanging','before','after','line','lineRule','tabs','beforeAuto','afterAuto','contextualSpacing','keepNext','keepLines','pageBreakBefore','widowControl','numId','level'];
export const sectionKeys=['width','height','orientation','top','bottom','marginLeft','marginRight','gutter','mirrorMargins','columns','headerDistance','footerDistance','pageNumberStart','pageNumberFormat'];
export function complete(p:Properties, keys:string[]) { for(const key of keys) p[key] ??= unknown();return p; }
export function overlay(...layers:Properties[]):Properties {
 const out:Properties={};
 for(const layer of layers) {
  for(const slot of ['ascii','hAnsi','eastAsia','cs']) {
   const theme=slot==='cs'?'cstheme':slot+'Theme';
   if(layer[slot] && !layer[theme]) delete out[theme];
  }
  // First-line indentation and hanging indentation are mutually exclusive.
  if(layer.firstLine && !layer.hanging) delete out.hanging;
  if(layer.hanging) delete out.firstLine;
  // A color element is atomic: an explicit RGB value clears the inherited theme.
  if(layer.color || layer.colorTheme) for(const key of ['color','colorTheme','colorTint','colorShade']) delete out[key];
  // Tab stops are merged by position; clear removes a previously inherited stop.
  if(layer.tabs) {
   const tabs=new Map<string,string>();
   for(const encoded of [out.tabs?.value,layer.tabs.value]) for(const entry of String(encoded ?? '').split(';').filter(Boolean)) {
    const [kind,position]=entry.split(':'); if(kind==='clear') tabs.delete(position);else tabs.set(position,kind);
   }
   out.tabs={...layer.tabs,value:[...tabs].sort((a,b)=>Number(a[0])-Number(b[0])).map(([position,kind])=>`${kind}:${position}`).join(';')};
  }
  const {tabs,...rest}=layer;
  Object.assign(out,rest);
 }
 return out;
}

/** Style b/i are toggle parity; direct formatting remains an absolute value. */
export function applyStyle(base:Properties,style:Properties):Properties {
 const result=overlay(base,style);
 for(const key of ['bold','italic'])if(style[key])result[key]={...style[key],value:style[key].value ? !base[key]?.value : base[key]?.value ?? false};
 return result;
}
