"""Inspect raw Bing link format. PYTHONIOENCODING=utf-8 python .freebuff/test-bing-inspect.py"""
import re
from scrapling.fetchers import Fetcher

def fetch(url):
    page = Fetcher.get(url, stealthy_headers=True, impersonate="chrome", timeout=30)
    return page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")

html = fetch("https://www.bing.com/search?q=site%3Alinkedin.com%2Fposts%2F+AI")
# sample 3 distinct ck links raw
links = re.findall(r'href="(https://www\.bing\.com/ck/a[^"]{0,300})"', html)
for l in links[:3]:
    print(l[:280], "\n---")
# also check for cite tags which show visible target URL
cites = re.findall(r'<cite>([^<]{0,150})</cite>', html)
print("cites:", len(cites))
for c in cites[:8]:
    print(" cite:", c)
