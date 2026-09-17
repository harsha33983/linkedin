"""Debug Brave response. PYTHONIOENCODING=utf-8 python .freebuff/test-brave-debug.py"""
import re
from scrapling.fetchers import Fetcher

def fetch(url):
    page = Fetcher.get(url, stealthy_headers=True, impersonate="chrome", timeout=30)
    return page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")

html = fetch("https://search.brave.com/search?q=site%3Alinkedin.com%2Fposts%2F+AI")
print("len:", len(html))
low = html.lower()
for marker in ["captcha", "challenge", "verify", "unusual", "blocked", "no results"]:
    if marker in low:
        i = low.index(marker)
        print(f"marker {marker!r} at {i}: ...{html[max(0,i-80):i+120]!r}...")
        break
# check status via re-fetch print of title
m = re.search(r"<title>(.*?)</title>", html, re.S)
print("title:", m.group(1)[:120] if m else None)
# count result anchors
print("anchors with /posts/:", html.count("linkedin.com/posts/"))
print("anchors href:", len(re.findall(r'href="[^"]*linkedin\.com', html)))
