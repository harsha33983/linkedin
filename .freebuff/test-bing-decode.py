"""Decode Bing /ck/a redirect links -> real URLs. PYTHONIOENCODING=utf-8 python .freebuff/test-bing-decode.py"""
import re, base64
from scrapling.fetchers import Fetcher

def fetch(url):
    page = Fetcher.get(url, stealthy_headers=True, impersonate="chrome", timeout=30)
    return page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")

html = fetch("https://www.bing.com/search?q=site%3Alinkedin.com%2Fposts%2F+AI")
print("len:", len(html))

# Bing wraps targets in /ck/a?...&u=a1<base64url>. u param value starts with 'a1' + base64url
links = re.findall(r'href="(https://www\.bing\.com/ck/a[^"]+)"', html)
print("ck links:", len(links))

def decode_ck(link):
    m = re.search(r"[?&]u=a1([A-Za-z0-9_-]+)", link)
    if not m:
        return None
    b = m.group(1)
    b += "=" * (-len(b) % 4)
    try:
        return base64.urlsafe_b64decode(b).decode("utf-8", "ignore")
    except Exception:
        return None

decoded = [decode_ck(l) for l in links]
decoded = [d for d in decoded if d]
print("decoded:", len(decoded))
li = [d for d in decoded if "linkedin.com" in d]
print("linkedin:", len(li))
for u in li[:10]:
    print(" ", u[:110])
