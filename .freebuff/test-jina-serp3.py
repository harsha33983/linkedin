"""Jina SERP proxy, careful encoding + content dump. PYTHONIOENCODING=utf-8 python .freebuff/test-jina-serp3.py"""
import re, httpx

POST_URL = re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:posts|pulse|feed/update)/[^\s\"'<>?#&]+", re.IGNORECASE)

serp_inner = 'https://www.google.com/search?q=' + httpx.QueryParams({'q': 'site:linkedin.com/posts/ AI'}).get('q') + '&num=30&hl=en&tbs=qdr:m'

with httpx.Client(timeout=90) as c:
    r = c.get("https://r.jina.ai/" + serp_inner, headers={"X-Return-Format": "html", "X-Timeout": "50", "User-Agent": "Mozilla/5.0"})
    print("status:", r.status_code, "len:", len(r.text))
    html = r.text
    m = re.search(r"<title>(.*?)</title>", html, re.S)
    print("TITLE:", (m.group(1)[:160] if m else None))
    low = html.lower()
    for marker in ["enable javascript", "consent", "before you continue", "unusual", "captcha", "noscript"]:
        if marker in low:
            i = low.index(marker)
            print(f"marker {marker!r}: ...{html[max(0,i-70):i+150]!r}")
            break
    urls = list({m.group(0).rstrip('.,);:!]').rstrip('/') for m in POST_URL.finditer(html)})
    print("post urls:", len(urls))
    print("linkedin mentions:", html.count('linkedin.com'))
    # dump hrefs containing linkedin
    hrefs = re.findall(r'href="([^"]*linkedin[^"]*)"', html)
    print("linkedin hrefs:", len(hrefs))
    for h in hrefs[:8]:
        print("  ", h[:130])
