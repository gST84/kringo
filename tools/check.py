#!/usr/bin/env python3
"""Static checks for Kringo (no Node needed): run `python3 tools/check.py` before committing.

- every file under src/ is listed in the service worker's offline list (sw.js) and vice versa
- every relative import points to an existing file that exports the imported names
- no unused imported names
"""
import os, re, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
errors = []

src = {}
for d, _, fs in os.walk('src'):
    for f in fs:
        if f.endswith('.js'):
            p = os.path.join(d, f).replace(os.sep, '/')
            src[p] = open(p, encoding='utf-8').read()

# service worker offline list
sw = open('sw.js', encoding='utf-8').read()
shell = set(re.findall(r"'([^']+\.(?:js|css|html|webmanifest|png|svg))'", sw.split('];')[0]))
for p in src:
    if p not in shell:
        errors.append(f'sw.js: {p} ontbreekt in SHELL (werkt niet offline)')
for p in shell:
    if not os.path.exists(p):
        errors.append(f'sw.js: {p} staat in SHELL maar bestaat niet')

# imports
def exports_of(text):
    names = set(re.findall(r'export\s+(?:async\s+)?(?:function|const|class|let)\s+(\w+)', text))
    for m in re.finditer(r'export\s*\{([^}]*)\}', text):
        names |= {n.strip().split(' as ')[-1].strip() for n in m.group(1).split(',') if n.strip()}
    return names

for p, text in src.items():
    for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*'([^']+)'", text):
        names = [n.strip().split(' as ') for n in m.group(1).split(',') if n.strip()]
        target = os.path.normpath(os.path.join(os.path.dirname(p), m.group(2))).replace(os.sep, '/')
        if target not in src:
            errors.append(f'{p}: import uit onbestaand bestand {m.group(2)}')
            continue
        exp = exports_of(src[target])
        for parts in names:
            orig, local = parts[0].strip(), parts[-1].strip()
            if orig not in exp:
                errors.append(f'{p}: {orig} wordt niet geëxporteerd door {target}')
            if len(re.findall(r'\b' + re.escape(local) + r'\b', text)) < 2:
                errors.append(f'{p}: import {local} wordt niet gebruikt')

_v = re.search(r"APP_VERSION = '([\d.]+)'", src.get('src/version.js', ''))
_s = re.search(r"VERSION = 'kringo-([\d.]+)'", open('sw.js', encoding='utf-8').read())
if not _v or not _s or _v.group(1) != _s.group(1):
    errors.append('src/version.js APP_VERSION en sw.js VERSION verschillen')

if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'OK – {len(src)} modules gecontroleerd')
