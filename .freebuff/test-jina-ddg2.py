"""Inspect Jina-proxied DDG html content. PYTHONIOENCODING=utf-8 python .freebuff/test-jina-ddg2.py"""
import re, httpx
from urllib.parse import unquote

with httpx.Client(timeout=90) as c:
    r = c.get("https://r.jina.ai/" + "https://html.duckduckgo.com/html/?q=" + str(httpx.QueryParams({'q': 'site:linkedin.com/posts/ AI'})), headers={"X-Return-Format": "html", "X-Timeout": "50"})
html = r.text
print("len:", len(html))
low = html.lower()
for marker in ["anomaly", "challenge", "no results", "result__a", "uddg"]:
    print(f"{marker!r}: {'FOUND' if marker in low else 'no'}  count={html.count(marker)}")
# sample result links
for m in re.finditer(r'href="([^"]{10,300})"', html):
    h = m.group(1)
    if "linkedin" in h or "uddg" in h:
        print("link:", unquote(h)[:160])
# titles
for m in list(re.finditer(r'class="result__a"[^>]*>(.*?)</a>', html, re.S))[:6]:
    print("title:", re.sub(r"<[^>]+>", "", m.group(1)).strip()[:100])
