"""Decode ALL Bing ck links (unescape first). PYTHONIOENCODING=utf-8 python .freebuff/test-bing-decode2.py"""
import re, base64, html as htmlmod
from scrapling.fetchers import Fetcher

def fetch(url):
    page = Fetcher.get(url, stealthy_headers=True, impersonate="chrome", timeout=30)
    return page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")

raw = fetch("https://www.bing.com/search?q=site%3Alinkedin.com%2Fposts%2F+AI")
text = htmlmod.unescape(raw)
links = re.findall(r'https://www\.bing\.com/ck/a\?[^"\s]+', text)
print("ck links:", len(links))

def decode_ck(link):
    m = re.search(r"[?&]u=a1([A-Za-z0-9_-]+)", link)
    if not m:
        return None
    b = m.group(1) + "=" * (-(len(m.group(1))) % 4)
    try:
        return base64.urlsafe_b64decode(b).decode("utf-8", "ignore")
    except Exception:
        return None

posts = []
for l in links:
    d = decode_ck(l)
    if d and re.search(r"linkedin\.com/(posts|pulse|feed/update)/", d, re.IGNORECASE):
        if d not in posts:
            posts.append(d)
print("linkedin post urls:", len(posts))
for u in posts[:12]:
    print(" ", u[:120])
