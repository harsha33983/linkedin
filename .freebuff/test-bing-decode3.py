"""Print all decoded Bing targets. PYTHONIOENCODING=utf-8 python .freebuff/test-bing-decode3.py"""
import re, base64, html as htmlmod
from scrapling.fetchers import Fetcher

def fetch(url):
    page = Fetcher.get(url, stealthy_headers=True, impersonate="chrome", timeout=30)
    return page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")

raw = fetch("https://www.bing.com/search?q=site%3Alinkedin.com%2Fposts%2F+AI")
text = htmlmod.unescape(raw)
links = re.findall(r'https://www\.bing\.com/ck/a\?[^"\s]+', text)
for l in links[:15]:
    m = re.search(r"[?&]u=a1([A-Za-z0-9_-]+)", l)
    if not m:
        print("NO-u:", l[:100])
        continue
    b = m.group(1) + "=" * (-(len(m.group(1))) % 4)
    try:
        d = base64.urlsafe_b64decode(b).decode("utf-8", "ignore")
    except Exception as e:
        d = f"<decode err {e}>"
    print("->", d[:130])
