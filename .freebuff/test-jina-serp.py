"""Test Jina Reader as a search-engine proxy: r.jina.ai/<google-serp-url>.
Jina fetches from THEIR infra, so this IP's Google/DDG rate limits don't apply.
PYTHONIOENCODING=utf-8 python .freebuff/test-jina-serp.py"""
import re, json, urllib.request

POST_URL = re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:posts|pulse|feed/update)/[^\s\"'<>?#&]+", re.IGNORECASE)

def jina(url, timeout=60):
    req = urllib.request.Request(
        f"https://r.jina.ai/{url}",
        headers={
            "X-Return-Format": "html",
            "X-Timeout": "45",
            "User-Agent": "Mozilla/5.0",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")

serp = "https://www.google.com/search?q=" + urllib.parse.quote('site:linkedin.com/posts/ "AI"') + "&num=30&hl=en&tbs=qdr:m"
try:
    html = jina(serp)
    urls = list({m.group(0).rstrip(".,);:!]").rstrip("/") for m in POST_URL.finditer(html)})
    print("len:", len(html), "urls:", len(urls))
    low = html.lower()
    print("captcha-ish:", [m for m in ("captcha", "unusual traffic", "/sorry/") if m in low])
    for u in urls[:10]:
        print(" ", u[:120])
except Exception as e:
    print("ERR", type(e).__name__, e)

import urllib.parse
