# Misuse patterns per app, with counts and file:line samples.
# Heuristic scan of .tsx sources (tests and stories excluded); every pattern is a
# candidate list to confirm by reading the line, see the report for false positives.
# Run from the repo root: python3 docs/design-system-audit/scripts/misuse.py [pattern] [--all]
import collections
import re
import subprocess
import sys

APPS = ['manager', 'portal']
DS_DIR = re.compile(r'/components/(ui|base-ui|ens-consumer)/')
DS_LAYERS = re.compile(r'/components/(ui|base-ui|ens-consumer|atoms|molecules|organisms)/')
ARBITRARY = re.compile(r'(?<![\w\[-])((?:[a-z0-9\-\[\]=@:]+:)*)(-?[a-z][a-z0-9-]*)-\[([^\]\s]+)\]')
NOT_A_VALUE = re.compile(r'(^|-)(data|aria|has|group|peer|supports|not|in|nth)$')
CUSTOM_UTILS = {'w-full', 'max-w-full'}  # @utility w-full-* / max-w-full-* in manager index.css
COLOR_CLASS = re.compile(r'(?<![\w-])(?:[a-z-]+:)*(bg|text|border)-(?!(xs|sm|base|lg|xl|\dxl|left|right|center|start|end|wrap|nowrap|ellipsis|clip|balance|pretty|none|solid|dashed|dotted|double|hidden|t|b|l|r|x|y|s|e|0|2|4|8|h\d|p|small)\b)[a-z\[#]')
BOX_CLASS = re.compile(r'(?<![\w-])(?:[a-z-]+:)*(h|rounded|px|py|p)-')
LOGIC_IMPORT = re.compile(r"from '(@/features[^']*|@/hooks[^']*|wagmi[^']*|@tanstack/react-query|@lingui[^']*|@/lib/(?!utils)[^']*|@ens-apps/[^']*|viem[^']*)'")

found = collections.defaultdict(lambda: collections.defaultdict(list))


def add(key, app, path, line, snippet):
    found[key][app].append((path, line, ' '.join(snippet.split())[:90]))


def sources(app):
    out = subprocess.run(['git', 'ls-files', f'apps/{app}/src'], capture_output=True, text=True).stdout.split()
    return [f for f in out if f.endswith('.tsx') and not re.search(r'\.(stories|test)\.tsx$', f)]


def jsx_tags(text, names):
    """Yield (line, tag text, end offset) for each JSX opening tag of the given element names."""
    for m in re.finditer(r'<(' + names + r')(?=[\s>/])', text):
        i, depth, quote = m.end(), 0, None
        while i < len(text):
            c = text[i]
            if quote:
                quote = None if c == quote else quote
            elif c in '"\'`':
                quote = c
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            elif c == '>' and depth == 0:
                break
            i += 1
        yield text.count('\n', 0, m.start()) + 1, text[m.start():i + 1], i + 1


def call_bodies(text, names):
    """Yield (line, argument text) for each call of the given function names."""
    for m in re.finditer(r'\b(' + names + r')\(', text):
        j, depth = m.end(), 1
        while depth and j < len(text):
            depth += text[j] == '('
            depth -= text[j] == ')'
            j += 1
        yield text.count('\n', 0, m.start()) + 1, text[m.end():j - 1]


def scan_tags(app, path, text, in_ds):
    for ln, tag, _ in jsx_tags(text, 'button'):
        if not in_ds:
            add('native-button', app, path, ln, tag)
    for ln, tag, _ in jsx_tags(text, 'select'):
        add('native-select', app, path, ln, tag)
    for ln, tag, _ in jsx_tags(text, 'input'):
        m = re.search(r'type=["\'{]+(checkbox|radio|range)', tag)
        if m and not in_ds:
            add('native-input-' + m.group(1), app, path, ln, tag)
    for ln, tag, _ in jsx_tags(text, 'dialog'):
        add('native-dialog', app, path, ln, tag)
    for ln, tag, _ in jsx_tags(text, 'div|span|li|p|img|section|article|td|tr'):
        if re.search(r'\sonClick=', tag) and not (re.search(r'role=', tag) and re.search(r'onKey(Down|Up)', tag)):
            add('a11y-static-onclick', app, path, ln, tag)
    for ln, tag, end in jsx_tags(text, 'Button|button'):
        if re.search(r'size=["\']icon', tag) and not re.search(r'aria-label|aria-labelledby|title=', tag):
            body = text[end:end + 400]
            if 'sr-only' not in body[:body.find('</')]:
                add('a11y-icon-button-no-label', app, path, ln, tag)
    for ln, tag, _ in jsx_tags(text, 'Button|Badge|Alert|Input|DialogContent|Card'):
        name = re.match(r'<(\w+)', tag).group(1)
        cls = re.search(r'className=(\{[\s\S]*\}|"[^"]*")', tag)
        if name == 'Button' and app == 'manager' and not in_ds and 'variant=' not in tag and 'components/ui/button' in text:
            add('manager-button-default-variant', app, path, ln, tag)
        if not cls:
            continue
        if name != 'Card' and COLOR_CLASS.search(cls.group(1)):
            add('override-color-' + name, app, path, ln, tag)
        if BOX_CLASS.search(cls.group(1)):
            add('override-box-' + name, app, path, ln, tag)


def scan_lines(app, path, text, in_ds):
    is_asset = '/assets/' in path or '/icons/' in path
    for i, line in enumerate(text.split('\n'), 1):
        if re.search(r'outline-none|outline-hidden', line) and not re.search(r'focus-visible:|focus:ring|focus-within:', line) and not in_ds:
            add('a11y-outline-removed', app, path, i, line)
        if re.search(r'(?<![\w-])focus:ring', line):
            add('a11y-focus-not-visible', app, path, i, line)
        if '!important' in line or re.search(r'[\s\'"`]![a-z]+-[\w\[]|[a-z0-9\]]![\s\'"`]', line) and re.search(r'class|cn\(', line):
            add('important', app, path, i, line)
        if not is_asset:
            for m in re.finditer(r'(?<=[\'"`\[(,: ])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])', line):
                add('hex-color', app, path, i, m.group(0))
            if re.search(r'rgba?\(', line):
                add('rgb-color', app, path, i, line)
        if 'style={' in line:
            add('inline-style', app, path, i, line)
        if re.search(r'\btwm?(\(|`)', line):
            add('tw-twm-helper', app, path, i, line)
        if re.search(r"from 'clsx'", line):
            add('bare-clsx', app, path, i, line)
        if not re.search(r'[\'"`]', line):
            continue
        for m in ARBITRARY.finditer(line):
            prop = m.group(2)
            if NOT_A_VALUE.search(prop) or prop in CUSTOM_UTILS:
                continue
            add('arbitrary-value', app, path, i, m.group(0))
            add('arbitrary:' + prop, app, path, i, m.group(0))


def scan_file(app, path):
    text = open(path).read()
    in_ds = bool(DS_DIR.search(path))
    scan_tags(app, path, text, in_ds)
    scan_lines(app, path, text, in_ds)
    if '/features/' in path:
        for ln, body in call_bodies(text, 'cn|twm|tw|clsx'):
            for _ in re.finditer(r'\?\s*[\'"`]', body):
                add('ternary-in-class-helper', app, path, ln, body)
    if DS_LAYERS.search(path):
        for m in LOGIC_IMPORT.finditer(text):
            add('ds-layer-logic-import', app, path, text.count('\n', 0, m.start()) + 1, m.group(1))


for app in APPS:
    for path in sources(app):
        scan_file(app, path)

only = [a for a in sys.argv[1:] if not a.startswith('--')]
show_all = '--all' in sys.argv
for key in sorted(found):
    if only and not any(key.startswith(o) for o in only):
        continue
    if key.startswith('arbitrary:') and not only:
        continue
    parts = [f'{a}={len(found[key][a])} in {len({h[0] for h in found[key][a]})} files' for a in APPS]
    print(f'## {key}: ' + ', '.join(parts))
    for a in APPS:
        for path, line, snippet in found[key][a][:None if show_all else 3]:
            print(f'   {path}:{line}  {snippet}')

if not only:
    for a in APPS:
        by_prop = collections.Counter(k.split(':', 1)[1] for k in found if k.startswith('arbitrary:') for _ in found[k][a])
        print(f'## arbitrary values by utility, {a}: {by_prop.most_common(15)}')
