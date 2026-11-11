"""Reproducible source-preserving bank and lossless category icon export."""
import json,re,random,sys,hashlib
from pathlib import Path
from PIL import Image
from choices import POOLS,ROWS
ROOT=Path(__file__).resolve().parents[2]
source=json.loads((ROOT/'content/source-questions.json').read_text())
guide=(ROOT/'content/source-categories.md').read_text()
names=list(dict.fromkeys(q['الفئة'] for q in source))
assert len(names)==30 and len(source)==480
# Sheets were inspected. Export original-resolution tiles, never resampled.
sheets=['exec-2ec3795f-d553-4c30-a2e2-bac106ad9701.png','exec-ebd4637d-7654-4940-844a-afc4c28de6be.png','exec-d3ec683c-9675-421b-9459-61de5e255a46.png']
art=ROOT/'content/art';art.mkdir(exist_ok=True)
manifest=[]
for batch,filename in enumerate(sheets):
 original=art/f'sheet-{batch+1}.png'
 if not original.exists(): original.write_bytes((ROOT.parent/'generated_images'/filename).read_bytes())
 im=Image.open(original).convert('RGBA');w,h=im.size
 for tile in range(10):
  col,row=tile%5,tile//5
  box=(round(col*w/5),round(row*h/2),round((col+1)*w/5),round((row+1)*h/2))
  cid=f'c{batch*10+tile+1:02}'
  out=ROOT/f'public/categories/{cid}.png';out.parent.mkdir(exist_ok=True,parents=True)
  im.crop(box).save(out,optimize=True)
  manifest.append(dict(categoryId=cid,sheet=original.name,bounds=box,size=[box[2]-box[0],box[3]-box[1]],sha256=hashlib.sha256(out.read_bytes()).hexdigest()))
(art/'crop-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
def norm(s):
 s=re.sub(r'[\u064b-\u065f\u0670ـ]','',s.lower())
 for a,b in [('أ','ا'),('إ','ا'),('آ','ا'),('ى','ي'),('ة','ه')]:s=s.replace(a,b)
 return re.sub(r'[^\w\s]',' ',s)
def tokens(s):
 stop={'نادي','شركة','شركه','كوكب','طائر','سورة','سوره','فيلم','مسلسل','لعبة','لعبه','الفنان','الفنانه','الشاعر','الفيلسوف','الخليفه','الفرنسي','السعودي','السعوديه','الانجليزي','الاسباني','من','في','او','رضي','الله','عنه','عليها','السلام','رحمه','عليه'}
 return set(norm(s).split())-stop
categories=[]
for ci,name in enumerate(names,1):
 rows=[(i,q) for i,q in enumerate(source) if q['الفئة']==name]
 assert len(rows)==len(ROWS[ci])==16
 ranks={i:n for n,(i,q) in enumerate(sorted(rows,key=lambda t:t[1]['الصعوبة']))}
 section=re.search(r'^### '+str(ci)+r'\. (.*?)(?=^### |^## |\Z)',guide,re.M|re.S)
 desc=''
 if section:
  match=re.search(r'\* \*\*ماهية العنوان وتصنيف الأسئلة:\*\*\s*(.*?)(?=\* \*\*أمثلة)',section.group(0),re.S)
  desc=match.group(1).strip() if match else ''
 category={'id':f'c{ci:02}','name':name,'description':desc,'iconId':f'category-{ci:02}','icon':f'categories/c{ci:02}.png','presentation':'text','questions':[]}
 for ri,(idx,q) in enumerate(rows):
  rng=random.Random(idx+7001);answer=q['الاجابة'];rule=ROWS[ci][ri]
  if rule=='num':
   part=re.split('[（(]',answer)[0]
   m=re.search(r'\d[\d,]*(?:\.\d+)?',part)
   if not m:raise ValueError((ci,ri+1,answer))
   value=float(m.group().replace(',',''));values=[]
   for factor in [.5,.75,1.25,1.5,2]:
    v=round(value*factor) if value>=10 else round(value*factor,2)
    if v!=value and v not in values:values.append(v)
   rng.shuffle(values)
   candidates=[part[:m.start()]+format(v,'g')+part[m.end():] for v in values]
  elif rule=='@category':candidates=[x['الاجابة'] for _,x in rows]
  else:candidates=POOLS.get(rule,rule).split('|')
  candidates=[s for s in candidates if norm(s)!=norm(answer) and not (tokens(s) and tokens(s)<=tokens(answer))]
  candidates=list(dict.fromkeys(candidates));rng.shuffle(candidates)
  if len(candidates)<3:raise ValueError(('alternatives',ci,ri+1,answer,candidates))
  options=[answer]+candidates[:3];rng.shuffle(options)
  rank=ranks[idx];points=200 if rank<6 else 400 if rank<11 else 600
  # No source hints exist. Letter hint is explicitly tagged as generated.
  hint='تلميح حرفي: تبدأ الإجابة بـ «'+answer.strip()[0]+'».'
  category['questions'].append({'id':10001+idx,'categoryId':category['id'],'category':name,'question':q['السؤال'],'answer':answer,'points':points,'sourcePoints':q['الصعوبة'],'sourceIndex':idx,'difficulty':{200:'سهل',400:'متوسط',600:'صعب'}[points],'hint':hint,'hintSource':'generated-letter-hint','options':options})
 categories.append(category)
catalog={'schemaVersion':2,'points':[200,400,600],'categories':categories}
for path in ['src/data.json','public/data.json']:(ROOT/path).write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
metadata=[{k:v for k,v in c.items() if k!='questions'} for c in categories]
(ROOT/'src/categories.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
# Compatibility exports contain only the replacement bank.
flat=[q for c in categories for q in c['questions']]
for path in ['src/questions.json','public/questions.json']:(ROOT/path).write_text(json.dumps(flat,ensure_ascii=False,indent=2)+'\n')
print(f'Built {len(categories)} categories, {len(flat)} questions, 30 lossless icons; 18 cells per match.')
