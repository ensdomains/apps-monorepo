# Compare ui/ components that exist in both apps: raw diff size, and class tokens
# that only one copy has (ignores class order, which Biome sorts only in Manager).
# Run from the repo root: python3 docs/design-system-audit/scripts/drift.py
import os
import re
import subprocess

M, P = 'apps/manager/src/components/ui', 'apps/portal/src/components/ui'
CLASS = re.compile(r'[\'"`]([^\'"`\n]*\b(?:flex|rounded|bg-|text-|border|px-|py-|h-|w-|z-|data-|focus|hover)[^\'"`\n]*)[\'"`]')


def classes(path):
    return {tok for m in CLASS.finditer(open(path).read()) for tok in m.group(1).split()}


for name in sorted(set(os.listdir(M)) & set(os.listdir(P))):
    if not name.endswith('.tsx'):
        continue
    a, b = f'{M}/{name}', f'{P}/{name}'
    diff = subprocess.run(['diff', a, b], capture_output=True, text=True).stdout
    changed = sum(1 for line in diff.splitlines() if line[:1] in '<>')
    ca, cb = classes(a), classes(b)
    only_m, only_p = sorted(ca - cb), sorted(cb - ca)
    print(f'{name}: diff lines={changed} | class tokens only in manager={len(only_m)} only in portal={len(only_p)}')
    print(f'    manager-only: {" ".join(only_m[:10])}')
    print(f'    portal-only:  {" ".join(only_p[:10])}')
