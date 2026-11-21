# Component inventory: variants, story/test presence and importer counts.
# Run from the repo root: python3 docs/design-system-audit/scripts/inventory.py [out.json]
import os, re, subprocess, sys, json
DIRS = {
 'manager': ['ui','atoms','molecules','organisms','base-ui','ens-consumer'],
 'portal': ['ui'],
}
def files(path):
    return subprocess.run(['git','ls-files',path],capture_output=True,text=True).stdout.split()
rows=[]
for app, dirs in DIRS.items():
    src=f'apps/{app}/src'
    allsrc=[f for f in files(src) if f.endswith(('.ts','.tsx'))]
    prod=[f for f in allsrc if not re.search(r'\.(test|stories|spec)\.tsx?$',f)]
    texts={f:open(f).read() for f in allsrc}
    for d in dirs:
        base=f'{src}/components/{d}'
        for f in files(base):
            if not f.endswith('.tsx') or re.search(r'\.(test|stories)\.tsx$',f): continue
            t=open(f).read()
            rel=f[len(src)+1:-4]  # components/ui/button
            mods={'@/'+rel}
            if os.path.basename(rel)==os.path.basename(os.path.dirname(rel)):
                mods.add('@/'+os.path.dirname(rel))
            # relative imports: match by basename within same dir tree
            exports=re.findall(r'export\s+(?:const|function)\s+([A-Z]\w*)',t)
            m=re.search(r'export\s*\{([^}]*)\}',t)
            if m: exports+= [x.strip().split(' as ')[-1] for x in m.group(1).split(',') if x.strip() and x.strip()[0].isupper()]
            variants={}
            for cm in re.finditer(r'variants:\s*\{',t):
                i=cm.end(); depth=1; j=i
                while depth and j<len(t):
                    depth+= t[j]=='{'; depth-= t[j]=='}'; j+=1
                block=t[i:j-1]
                for km in re.finditer(r'^\s{4,8}(\w+):\s*\{',block,re.M):
                    k=km.group(1); k2=km.end(); dd=1; e=k2
                    while dd and e<len(block):
                        dd+= block[e]=='{'; dd-= block[e]=='}'; e+=1
                    vals=re.findall(r"^\s+(?:'([^']+)'|\"([^\"]+)\"|([\w-]+)):",block[k2:e-1],re.M)
                    variants.setdefault(k,[]).extend([a or b or c for a,b,c in vals])
            def imports_of(fl):
                out=[]
                for g in fl:
                    if g==f: continue
                    s=texts[g]
                    hit=any(re.search(r"from\s+['\"]"+re.escape(mo)+r"['\"]",s) for mo in mods)
                    if not hit:
                        # relative import resolve
                        for rm in re.finditer(r"from\s+['\"](\.[^'\"]+)['\"]",s):
                            p=os.path.normpath(os.path.join(os.path.dirname(g),rm.group(1)))
                            if p in (f[:-4], os.path.dirname(f)) and (p==f[:-4] or os.path.basename(f[:-4])==os.path.basename(os.path.dirname(f))):
                                hit=True;break
                    if not hit and os.path.exists(os.path.join(os.path.dirname(f),'index.ts')):
                        bm=re.search(r"import\s*\{([^}]*)\}\s*from\s+['\"]"+re.escape('@/'+os.path.dirname(rel))+r"['\"]",s)
                        if bm and any(re.search(r'\b'+e+r'\b',bm.group(1)) for e in exports): hit=True
                    if hit: out.append(g)
                return out
            used=imports_of(prod)
            stories=[g for g in imports_of([x for x in allsrc if x.endswith('.stories.tsx')])]
            tests=[g for g in imports_of([x for x in allsrc if re.search(r'\.test\.tsx?$',x)])]
            # per-export usage across prod
            exp_use={}
            for e in sorted(set(exports)):
                exp_use[e]=sum(1 for g in used if re.search(r'\b'+e+r'\b',texts[g]))
            ui_internal=[g for g in used if '/components/' in g and ('/components/'+d+'/') in g]
            rows.append(dict(app=app,dir=d,file=f,exports=sorted(set(exports)),variants=variants,
              importers=len(used),internal=len(ui_internal),stories=len(stories),tests=len(tests),exp_use=exp_use,
              loc=t.count('\n')))
if len(sys.argv) > 1:
    json.dump(rows, open(sys.argv[1], 'w'), indent=1)
for r in rows:
    print(f"{r['app']}|{r['file'].split('components/')[1]}|imp={r['importers']}(int {r['internal']})|story={r['stories']}|test={r['tests']}|loc={r['loc']}|var={ {k:v for k,v in r['variants'].items()} }")
