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
  Object.assign(out,layer);
 }
 return out;
}
