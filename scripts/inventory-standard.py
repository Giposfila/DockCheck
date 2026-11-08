"""Local-only source indexing. Never copies PDF text to the distributable catalog.
Run: python3 scripts/inventory-standard.py [path-to-local-PDF]
Each layout paragraph gets a page/line locator and SHA-256 for independent review.
The semantic decisions remain in catalog.ts, not in this extraction script.
"""
from pathlib import Path
import hashlib, json, re, subprocess, sys
root = Path(__file__).resolve().parent.parent
pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'CТУ.pdf'
text = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-']).decode()
fragments = []
appendices = {31:'А',32:'А',33:'Б',34:'В',35:'Г',36:'Д',37:'Е',38:'Ж',39:'И',40:'К',41:'Л',42:'М',43:'Н',44:'П',45:'Р',46:'С',47:'С',48:'С',49:'С',50:'Т',51:'У',52:'У',53:'У',54:'У',55:'У',56:'У',57:'Ф',58:'Ф',59:'Х',60:'Х'}
clause = 'front-matter'
for page_no, page in enumerate(text.split('\f'), 1):
    if not page.strip(): continue
    lines = page.splitlines()
    if page_no in appendices: clause = 'Приложение ' + appendices[page_no]
    elif page_no == 61: clause = 'Библиография'
    buffer, start = [], 0
    def flush(end):
        if not buffer: return
        value = '\n'.join(buffer)
        fragments.append({'id':f'pdf.{page_no}.{start}', 'pdfPage':page_no, 'clause':clause,
            'firstLine':start,'lastLine':end,'sha256':hashlib.sha256(value.encode()).hexdigest(),
            'kind':'image-and-text' if page_no in [45,46,47,48,57,58] else 'text'})
    for index,line in enumerate(lines, 1):
        # Running page header is document metadata, not a student obligation.
        if page_no > 1 and index <= 6: continue
        match = re.match(r'^\s*((?:[1-9]\d?)(?:\.\d+){1,3})\s+([А-ЯЁа-яёA-Za-z])',line)
        root_heading=re.match(r'^\s*([1-9])\s+(Область|Нормативные|Термины|Сокращения|Общие положения|Требования к)',line)
        if root_heading:match=root_heading
        if page_no >= 4 and page_no <= 30 and match:
            new_clause=match.group(1)
            if buffer: flush(index-1); buffer=[]
            clause=new_clause
        if line.strip():
            if not buffer:start=index
            buffer.append(line.rstrip())
        elif buffer:
            flush(index-1);buffer=[]
    if buffer:flush(len(lines))
    if page_no in [45,46,47,48,57,58]:
        fragments.append({'id':f'pdf.{page_no}.diagram','pdfPage':page_no,'clause':clause,
            'firstLine':None,'lastLine':None,'sha256':None,'kind':'diagram',
            'review':'Dimensions and fold order require image inspection; extraction alone is insufficient.'})
output={'schemaVersion':1,'source':{'edition':'СТУ 7.5–07–2021','pages':61,
    'sha256':hashlib.sha256(pdf.read_bytes()).hexdigest()},'fragments':fragments}
(root/'src/requirements/source-index.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(f'Indexed {len(fragments)} source fragments on {len(set(f["pdfPage"] for f in fragments))} pages.')
