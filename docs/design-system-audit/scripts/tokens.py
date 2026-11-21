# Color token usage per app: tokens defined, uses outside the defining file, unused tokens.
# Run from the repo root: python3 docs/design-system-audit/scripts/tokens.py
import collections
import re
import subprocess

COLOR_UTIL = r'(?:bg|text|border|fill|stroke|ring|from|to|via|outline|divide|decoration|accent|caret|shadow|border-[trblxy])'
OLD_BRAND = r'ens-(blue|magenta|green|yellow|orange|brown|gray|white)'
DEFAULT_HUES = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'


def sources(app):
    out = subprocess.run(['git', 'ls-files', f'apps/{app}/src'], capture_output=True, text=True).stdout.split()
    keep = [f for f in out if f.endswith(('.tsx', '.ts', '.css')) and not re.search(r'\.(stories|test)\.tsx?$', f)]
    return {f: open(f).read() for f in keep}


def report(app, css_file, name_rx, group):
    files = sources(app)
    names = list(dict.fromkeys(re.findall(name_rx, open(css_file).read())))
    text = '\n'.join(t for f, t in files.items() if f != css_file)
    use = {}
    for n in names:
        util = re.findall(r'(?<![\w-])(?:[a-z-]+:)*' + COLOR_UTIL + '-' + re.escape(n) + r'(?![\w-])', text)
        var = re.findall(r'var\(--(?:color-)?' + re.escape(n) + r'\)', text)
        use[n] = len(util) + len(var)
    groups = collections.defaultdict(lambda: [0, 0, 0])
    for n, c in use.items():
        g = groups[group(n)]
        g[0] += 1
        g[1] += c
        g[2] += c == 0
    print(f'== {app}: {len(names)} color tokens in {css_file}, {sum(c == 0 for c in use.values())} unused outside it')
    for g, (k, c, z) in sorted(groups.items()):
        print(f'   {g}: tokens={k} uses={c} unused={z}')
    print('   unused:', [k for k, v in use.items() if v == 0])
    return use, text


def manager_group(n):
    if re.match(OLD_BRAND, n):
        return 'old-brand'
    if n.startswith('ens-'):
        return re.sub(r'-(\d+|dust|surface|core|hover|dense|bg|tint|border|text-\w+|error)$', '', n)
    return 'shadcn/other'


def portal_group(n):
    if re.match(r'(lapis|citrine|peridot|garnet|quartz|neutral|signal-\w+)-\d', n):
        return re.sub(r'-\d+$', '', n)
    return 'semantic'


m_use, m_text = report('manager', 'apps/manager/src/styles/theme.css', r'--color-([\w-]+):', manager_group)
print('   old-brand uses:', {k: v for k, v in m_use.items() if re.match(OLD_BRAND, k)})
hits = re.findall(r'(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|to)-(gray|zinc|slate|neutral|stone|' + DEFAULT_HUES + r')-\d{2,3}\b', m_text)
print(f'   Tailwind default palette uses: {len(hits)}', collections.Counter(hits).most_common(8))

p_use, p_text = report('portal', 'apps/portal/src/styles/index.css', r'--color-([\w-]+): var', portal_group)
hits = re.findall(r'(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|to)-(' + DEFAULT_HUES + r')-\d{2,3}\b', p_text)
print(f'   Tailwind default (non-gray) palette uses: {len(hits)}')
