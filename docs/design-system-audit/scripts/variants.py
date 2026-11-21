# Uses of each variant value (cva and string-union props), counted inside the component's own JSX tags and
# `*Variants({...})` calls in its importers; run from the repo root: python3 docs/design-system-audit/scripts/variants.py
import re

from inventory import collect
from jsx import jsx_tags


def prop_values(site, key):
    """Values passed for key in one JSX tag or cva call. A literal yields itself; an expression yields the string
    literals inside it (both branches of a ternary), or None when it has none (a forwarded variable)."""
    attr = r'(?<![\w\-\[.])' + key + r"""=(?:'([^']*)'|"([^"]*)"|\{([^}]+)\})"""
    prop = r'(?<![\w\-\[.])' + key + r""":\s*(?:'([^']*)'|"([^"]*)"|([A-Za-z_][\w.]*))"""
    patterns = [attr, prop] if re.match(r'\w+Variants\(', site) else [attr]
    out = []
    for pattern in patterns:
        for m in re.finditer(pattern, site):
            single, double, expr = m.groups()
            if expr is None:
                out.append(single if single is not None else double)
                continue
            literals = [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", expr)]
            out += literals or [None]
    return out


def merge_families(*maps):
    out = {}
    for m in maps:
        for k, vs in m.items():
            out[k] = list(dict.fromkeys(out.get(k, []) + list(vs)))
    return out


def count_values(texts, exports, families, cva_fn_names=()):
    """Return ({key: {value: literal uses}}, {key: dynamic uses}) for the given exports' tags and cva calls."""
    sites = []
    tag_names = '|'.join(re.escape(e) for e in exports)
    for text in texts:
        if tag_names:
            sites += [tag for _, tag, _ in jsx_tags(text, tag_names)]
        for fn in cva_fn_names:
            sites += re.findall(re.escape(fn) + r'\(\s*\{[^}]*\}', text)
    literal = {k: dict.fromkeys(vs, 0) for k, vs in families.items()}
    dynamic = dict.fromkeys(families, 0)
    for site in sites:
        for key in families:
            for value in prop_values(site, key):
                if value is None:
                    dynamic[key] += 1
                elif value in literal[key]:
                    literal[key][value] += 1
    return literal, dynamic


def classify(literal, dynamic, defaults):
    """Values with no literal use and no default; 'unresolved' when dynamic props could still pass them."""
    unused = {k: [v for v, n in vals.items() if n == 0 and f'{k}={v}' not in defaults] for k, vals in literal.items()}
    return {k: ('unresolved' if dynamic[k] else 'unused', vs) for k, vs in unused.items() if vs}


def main():
    for r in collect():
        families = merge_families(r['variants'], r['prop_variants'])
        if not families:
            continue
        texts = [open(f).read() for f in r['importer_files']]
        cva_fns = re.findall(r'const\s+(\w+Variants)\s*=\s*cva', open(r['file']).read())
        literal, dynamic = count_values(texts, r['exports'], families, cva_fns)
        rel = r['file'].split('components/')[1]
        counts = ' '.join(f'{k}.{v}={n}' for k, vals in literal.items() for v, n in vals.items())
        dyn = ' '.join(f'{k}={n}' for k, n in dynamic.items() if n)
        print(f"{r['app']}|{rel}|importers={r['importers']}|{counts}|dynamic: {dyn or 'none'}")
        for k, (status, values) in classify(literal, dynamic, set(r['defaults'])).items():
            print(f"    {status} {k}: {', '.join(values)}")


if __name__ == '__main__':
    main()
