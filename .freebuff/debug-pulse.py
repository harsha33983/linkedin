"""Debug pulse extraction failure. PYTHONIOENCODING=utf-8 python .freebuff/debug-pulse.py"""
import sys, json, asyncio
sys.path.insert(0, "scraper-service")
from app.providers.agent_reach_provider import fetch_page_html
from app.providers.scrapling_provider import _try_extract_html

url = "https://www.linkedin.com/pulse/settling-score-remote-work-the-plug-drink-gnbre"
html = asyncio.run(fetch_page_html(url))
print("html len:", len(html) if html else 0)
if html:
    low = html.lower()
    for marker in ["authwall", "sign in", "ld+json", "articlebody", "headline"]:
        print(f"  {marker}: {'FOUND' if marker in low else 'no'} ({html.count(marker)})")
    result = _try_extract_html(url, html)
    print("extract result:", "None" if result is None else {k: result.get(k) for k in ("publishedAt", "reactions", "comments")}, "| author:", (result or {}).get("author", {}).get("name") if result else None, "| content:", ((result or {}).get("content") or "")[:80] if result else None)
    # dump first ld+json keys if any
    import re
    m = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    if m:
        try:
            d = json.loads(m.group(1))
            print("ld+json @type:", d.get("@type"), "keys:", list(d.keys())[:15])
        except Exception as e:
            print("ld+json parse err:", e)
else:
    print("jina returned nothing")
