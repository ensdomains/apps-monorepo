# Literal usages of each cva variant value, counted in the files that import the component.
# Dynamic values (variant={x}) are not resolved, so counts are a lower bound.
# Run from the repo root: python3 docs/design-system-audit/scripts/variants.py
import json,re,sys,os,subprocess,tempfile
tmp=os.path.join(tempfile.mkdtemp(),'inventory.json')
subprocess.run([sys.executable,os.path.join(os.path.dirname(__file__),'inventory.py'),tmp],check=True,capture_output=True)
rows=json.load(open(tmp))
for r in rows:
    if not r['variants']: continue
    src=f"apps/{r['app']}/src"
    rel=r['file'][len(src)+1:-4]
    imp=subprocess.run(['git','grep','-l','-E',f"from '@/{rel}'",'--',src],capture_output=True,text=True).stdout.split()
    imp=[f for f in imp if not f.endswith('.stories.tsx') and not re.search(r'\.test\.tsx?$',f)]
    comp=os.path.basename(rel)
    out=[]
    for key,vals in r['variants'].items():
        for v in dict.fromkeys(vals):
            pat=re.compile(rf"""\b{key}(?:=|:\s*|=\{{\s*)['"]{re.escape(v)}['"]""")
            n=sum(len(pat.findall(open(f).read())) for f in imp)
            out.append(f"{key}.{v}={n}")
    print(f"{r['app']}|{rel}|importers={len(imp)}|"+' '.join(out))
