# Component inventory (variants, stories, tests, importers); run from the repo root: python3 docs/design-system-audit/scripts/inventory.py [out.json]
import json
import os
import re
import subprocess
import sys

DIRS = {
    'manager': ['ui', 'atoms', 'molecules', 'organisms', 'base-ui', 'ens-consumer'],
    'portal': ['ui'],
}
TEST_OR_STORY = re.compile(r'\.(test|stories|spec)\.tsx?$')


def files(path):
    return subprocess.run(['git', 'ls-files', path], capture_output=True, text=True).stdout.split()


def block_after(text, start):
    """Return the text up to the brace that closes the one opened just before start."""
    depth, end = 1, start
    while depth and end < len(text):
        depth += text[end] == '{'
        depth -= text[end] == '}'
        end += 1
    return text[start:end - 1]


def cva_variants(text):
    variants = {}
    for cm in re.finditer(r'variants:\s*\{', text):
        block = block_after(text, cm.end())
        for km in re.finditer(r'^\s{4,8}(\w+):\s*\{', block, re.M):
            values = re.findall(r"^\s+(?:'([^']+)'|\"([^\"]+)\"|([\w-]+)):", block_after(block, km.end()), re.M)
            variants.setdefault(km.group(1), []).extend([a or b or c for a, b, c in values])
    return variants


def exported_names(text):
    names = re.findall(r'export\s+(?:const|function)\s+([A-Z]\w*)', text)
    m = re.search(r'export\s*\{([^}]*)\}', text)
    if m:
        names += [x.strip().split(' as ')[-1] for x in m.group(1).split(',') if x.strip() and x.strip()[0].isupper()]
    return names


def importers(f, rel, exports, candidates, texts):
    """Files among candidates that import f by alias path, relative path or its folder's index.ts."""
    mods = {'@/' + rel}
    is_folder_main = os.path.basename(rel) == os.path.basename(os.path.dirname(rel))
    if is_folder_main:
        mods.add('@/' + os.path.dirname(rel))
    has_index = os.path.exists(os.path.join(os.path.dirname(f), 'index.ts'))
    out = []
    for g in candidates:
        if g == f:
            continue
        s = texts[g]
        hit = any(re.search(r"from\s+['\"]" + re.escape(mo) + r"['\"]", s) for mo in mods)
        if not hit:
            for rm in re.finditer(r"from\s+['\"](\.[^'\"]+)['\"]", s):
                p = os.path.normpath(os.path.join(os.path.dirname(g), rm.group(1)))
                if p == f[:-4] or (p == os.path.dirname(f) and is_folder_main):
                    hit = True
                    break
        if not hit and has_index:
            bm = re.search(r"import\s*\{([^}]*)\}\s*from\s+['\"]" + re.escape('@/' + os.path.dirname(rel)) + r"['\"]", s)
            if bm and any(re.search(r'\b' + e + r'\b', bm.group(1)) for e in exports):
                hit = True
        if hit:
            out.append(g)
    return out


rows = []
for app, dirs in DIRS.items():
    src = f'apps/{app}/src'
    all_src = [f for f in files(src) if f.endswith(('.ts', '.tsx'))]
    prod = [f for f in all_src if not TEST_OR_STORY.search(f)]
    stories = [f for f in all_src if f.endswith('.stories.tsx')]
    tests = [f for f in all_src if re.search(r'\.test\.tsx?$', f)]
    texts = {f: open(f).read() for f in all_src}
    for d in dirs:
        for f in files(f'{src}/components/{d}'):
            if not f.endswith('.tsx') or re.search(r'\.(test|stories)\.tsx$', f):
                continue
            t = open(f).read()
            rel = f[len(src) + 1:-4]  # components/ui/button
            exports = exported_names(t)
            used = importers(f, rel, exports, prod, texts)
            rows.append(dict(
                app=app, dir=d, file=f, exports=sorted(set(exports)), variants=cva_variants(t),
                importers=len(used),
                internal=sum(1 for g in used if f'/components/{d}/' in g),
                stories=len(importers(f, rel, exports, stories, texts)),
                tests=len(importers(f, rel, exports, tests, texts)),
                exp_use={e: sum(1 for g in used if re.search(r'\b' + e + r'\b', texts[g])) for e in sorted(set(exports))},
                loc=t.count('\n'),
            ))

if len(sys.argv) > 1:
    json.dump(rows, open(sys.argv[1], 'w'), indent=1)
for r in rows:
    print(f"{r['app']}|{r['file'].split('components/')[1]}|imp={r['importers']}(int {r['internal']})|story={r['stories']}|test={r['tests']}|loc={r['loc']}|var={r['variants']}")
