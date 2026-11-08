import JSZip from 'jszip';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const types:Record<string,string>={document:'document.main',styles:'styles',numbering:'numbering',settings:'settings',footnotes:'footnotes',endnotes:'endnotes',header:'header',footer:'footer'};
/** Complete synthetic OPC packaging; expected formatting remains in each test. */
export function completePackage(zip:JSZip) {
 const overrides:string[]=[],rels:string[]=[];
 for(const path of Object.keys(zip.files).filter(p=>p.endsWith('.xml')&&p.startsWith('word/'))) {
  const kind=path.includes('/theme/')?'theme':path.split('/').at(-1)!.replace(/\d*\.xml$/,'');
  const content=kind==='theme'?'application/vnd.openxmlformats-officedocument.theme+xml':types[kind]?`application/vnd.openxmlformats-officedocument.wordprocessingml.${types[kind]}+xml`:'application/xml';
  overrides.push(`<Override PartName="/${path}" ContentType="${content}"/>`);
  if(kind!=='document')rels.push(`<Relationship Id="${kind}" Type="${R+kind}" Target="${path.slice(5)}"/>`);
 }
 zip.file('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.join('')}</Types>`);
 zip.file('_rels/.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`);
 if(!zip.file('word/_rels/document.xml.rels'))zip.file('word/_rels/document.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
 return zip;
}
