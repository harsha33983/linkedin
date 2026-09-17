"""Jina proxy on DDG html + Bing (their infra, not ours). PYTHONIOENCODING=utf-8 python .freebuff/test-jina-ddg.py"""
import re, httpx

POST_URL = re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:posts|pulse|feed/update)/[^\s\"'<>?#&]+", re.IGNORECASE)

def via_jina(url):
    with httpx.Client(timeout=90) as c:
        r = c.get("https://r.jina.ai/" + url, headers={"X-Return-Format": "html", "X-Timeout": "50", "User-Agent": "Mozilla/5.0"})
    return r.status_code, r.text

def report(name, url):
    try:
        code, html = via_jina(url)
        urls = list({m.group(0).rstrip('.,);:!]').rstrip('/') for m in POST_URL.finditer(html)})
        print(f"{name}: status={code} len={len(html)} urls={len(urls)}")
        for u in urls[:8]:
            print("  ", u[:120])
        return urls
    except Exception as e:
        print(f"{name}: ERR {type(e).__name__}: {e}")
        return []

report("ddg-html", "https://html.duckduckgo.com/html/?" + str(httpx.QueryParams({'q': 'site:linkedin.com/posts/ AI', 'df': 'm'})))
report("ddg-lite", "https://lite.duckduckgo.com/lite/?q=" + str(httpx.QueryParams({'q': 'site:linkedin.com/posts/ AI'})))
report("bing", "https://www.bing.com/search?q=" + str(httpx.QueryParams({'q': 'site:linkedin.com/posts/ AI', 'count': '30'})))
