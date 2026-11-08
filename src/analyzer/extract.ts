import { attr, child, children } from './package';
import type { Properties } from './model';
const specs: Record<string, [string, string, string?, number?]> = {
 fontSize: ['sz','val','pt',.5], bold:['b','val','boolean'], italic:['i','val','boolean'], underline:['u','val'], color:['color','val'], verticalAlign:['vertAlign','val'], characterSpacing:['spacing','val','pt',.05],
 align:['jc','val'], left:['ind','left','mm',1/56.6929133858], right:['ind','right','mm',1/56.6929133858], firstLine:['ind','firstLine','mm',1/56.6929133858], hanging:['ind','hanging','mm',1/56.6929133858], before:['spacing','before','pt',.05], after:['spacing','after','pt',.05], line:['spacing','line','twips',1], lineRule:['spacing','lineRule'], beforeAuto:['spacing','beforeAutospacing','boolean'], afterAuto:['spacing','afterAutospacing','boolean'], contextualSpacing:['contextualSpacing','val','boolean'],
 keepNext:['keepNext','val','boolean'], keepLines:['keepLines','val','boolean'], pageBreakBefore:['pageBreakBefore','val','boolean'], widowControl:['widowControl','val','boolean'],
 numId:['numPr','numId'], level:['numPr','ilvl'],
 width:['pgSz','w','mm',1/56.6929133858], height:['pgSz','h','mm',1/56.6929133858], orientation:['pgSz','orient'], top:['pgMar','top','mm',1/56.6929133858], bottom:['pgMar','bottom','mm',1/56.6929133858], marginLeft:['pgMar','left','mm',1/56.6929133858], marginRight:['pgMar','right','mm',1/56.6929133858], gutter:['pgMar','gutter','mm',1/56.6929133858], headerDistance:['pgMar','header','mm',1/56.6929133858], footerDistance:['pgMar','footer','mm',1/56.6929133858], columns:['cols','num','count',1], pageNumberStart:['pgNumType','start','count',1], pageNumberFormat:['pgNumType','fmt']
};
export function extract(node: Element | undefined, part: string, styleId?: string): Properties {
 const result: Properties = {};
 if (!node) return result;
 for (const [key,[tag,attribute,unit,factor]] of Object.entries(specs)) {
  const n = child(node,tag); if (!n) continue;
  const raw = tag === 'numPr' ? attr(child(n,attribute),'val') : attr(n,attribute);
  if (raw === undefined && unit !== 'boolean') continue;
  const value = unit === 'boolean' ? !['0','false','off'].includes(raw ?? '') : factor ? Number(raw)*factor : raw!;
  result[key] = { value: typeof value === 'number' && !Number.isFinite(value) ? null : value, status: typeof value === 'number' && !Number.isFinite(value) ? 'unknown':'resolved', source:{part,property:key,styleId}, raw, unit };
 }
 const fonts = child(node,'rFonts');
 if (fonts) for (const slot of ['ascii','hAnsi','eastAsia','cs','asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme']) {
  const raw = attr(fonts,slot); if (raw) result[slot] = {value:raw,raw,status:'resolved',source:{part,property:slot,styleId}};
 }
 const color = child(node,'color');
 for(const [key,a] of [['colorTheme','themeColor'],['colorTint','themeTint'],['colorShade','themeShade']]) { const raw=attr(color,a);if(raw)result[key]={value:raw,raw,status:'resolved',source:{part,property:key,styleId}};}
 const tabs = child(node,'tabs');
 if (tabs) result.tabs = {value:children(tabs).map(n => `${attr(n,'val')}:${attr(n,'pos')}`).join(';'),status:'resolved',source:{part,property:'tabs',styleId},unit:'twips'};
 return result;
}
