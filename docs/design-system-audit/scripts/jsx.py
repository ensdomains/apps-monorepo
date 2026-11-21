# Shared parsing helpers for the audit scripts.
import re
import subprocess


def files(path):
    return subprocess.run(['git', 'ls-files', path], capture_output=True, text=True).stdout.split()


def jsx_tags(text, names):
    """Yield (line, tag text, end offset) for each JSX opening tag of the given element names (regex alternation)."""
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
