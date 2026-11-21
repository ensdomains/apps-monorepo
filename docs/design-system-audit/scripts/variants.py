# Literal uses of each cva variant value in its importers (variant={x} not resolved); run from the repo root: python3 docs/design-system-audit/scripts/variants.py
import json
import os
import re
import subprocess
import sys
import tempfile

inventory_json = os.path.join(tempfile.mkdtemp(), 'inventory.json')
inventory_py = os.path.join(os.path.dirname(__file__), 'inventory.py')
subprocess.run([sys.executable, inventory_py, inventory_json], check=True, capture_output=True)

for r in json.load(open(inventory_json)):
    if not r['variants']:
        continue
    src = f"apps/{r['app']}/src"
    rel = r['file'][len(src) + 1:-4]
    grep = subprocess.run(['git', 'grep', '-l', '-E', f"from '@/{rel}'", '--', src], capture_output=True, text=True)
    importers = [f for f in grep.stdout.split() if not f.endswith('.stories.tsx') and not re.search(r'\.test\.tsx?$', f)]
    texts = [open(f).read() for f in importers]
    counts = []
    for key, values in r['variants'].items():
        for v in dict.fromkeys(values):
            pattern = re.compile(rf"""\b{key}(?:=|:\s*|=\{{\s*)['"]{re.escape(v)}['"]""")
            counts.append(f'{key}.{v}={sum(len(pattern.findall(t)) for t in texts)}')
    print(f"{r['app']}|{rel}|importers={len(importers)}|" + ' '.join(counts))
