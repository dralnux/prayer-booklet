import json, re
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'daily-gospel.json'

now = datetime.now(timezone.utc)
date_str = now.strftime('%Y/%m/%d')
page_url = f'https://www.vaticannews.va/en/word-of-the-day/{date_str}.html'

headers = {'User-Agent': 'Catholic-Prayers-GitHub-Pages/1.0'}
r = requests.get(page_url, headers=headers, timeout=30)
r.raise_for_status()
soup = BeautifulSoup(r.text, 'html.parser')

# Remove page chrome that can pollute extracted text.
for tag in soup(['script', 'style', 'noscript', 'nav', 'footer', 'header']):
    tag.decompose()

# Find the Gospel section by its heading and collect the content until
# the next major section (normally "The words of the Popes").
heading = None
for tag in soup.find_all(['h1','h2','h3','h4']):
    if 'Gospel of the day' in tag.get_text(' ', strip=True):
        heading = tag
        break

if not heading:
    raise RuntimeError('Could not find "Gospel of the day" on Vatican News page.')

parts = []
for el in heading.find_all_next():
    if el.name in ('h1','h2','h3','h4') and el is not heading:
        title = el.get_text(' ', strip=True)
        if 'The words of the Popes' in title or 'Prayer' in title:
            break
    if el.name in ('p','blockquote','li'):
        text = el.get_text(' ', strip=True)
        if text and text not in parts:
            parts.append(text)

# Prefer the first substantial text block as the reference line, while
# retaining the full Gospel passage for the dedicated Gospel page.
text = '\n\n'.join(parts).strip()
if len(text) < 100:
    raise RuntimeError('Extracted Gospel content looks incomplete.')

# Try to obtain the date/liturgical title from the page title/header.
title = ''
for tag in soup.find_all(['h1','h2']):
    t = tag.get_text(' ', strip=True)
    if t and 'Gospel of the day' not in t and 'Word of the day' not in t:
        title = t
        break

# Extract Gospel reference, e.g. Matthew 16:13-20.
ref = ''
m = re.search(r'(?:according to|Gospel according to)\s+(?:the\s+)?([A-Za-z .]+)\s+([0-9]+:[0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)?)', text, re.I)
if m:
    ref = f'{m.group(1).strip()} {m.group(2)}'

payload = {
    'date': now.strftime('%Y-%m-%d'),
    'source': 'Vatican News',
    'sourceUrl': page_url,
    'title': title,
    'reference': ref,
    'gospel': text,
    'updatedAtUtc': now.isoformat(),
}
DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Updated {DATA} from {page_url}')
print(f'Reference: {ref}')
