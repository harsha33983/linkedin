"""Verify Brave discovery quality: real URLs? recent? PYTHONIOENCODING=utf-8 python .freebuff/test-brave.py"""
import sys, re, asyncio
sys.path.insert(0, "scraper-service")

from scrapling.fetchers import Fetcher

POST_URL = re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:posts|pulse|feed/update)/[^\s\"'<>?#&]+", re.IGNORECASE)

def fetch(url):
    page = Fetcher.get(url, stealthy_headers=True, impersonate="chrome", timeout=30)
    html = page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")
    return html

# Two query variations, both with recency where supported
queries = [
    'site:linkedin.com/posts/ "AI"',
    'site:linkedin.com/posts/ AI insights',
]
all_urls = []
for q in queries:
    html = fetch("https://search.brave.com/search?q=" + q.replace(" ", "+"))
    found = list({m.group(0).rstrip(".,);:!]").rstrip("/") for m in POST_URL.finditer(html)})
    print(f"q={q!r}: {len(found)} urls")
    all_urls.extend(found)

# Dedup preserving order
seen, urls = set(), []
for u in all_urls:
    k = u.lower()
    if k not in seen:
        seen.add(k)
        urls.append(u)

print(f"\ntotal unique: {len(urls)}")
for u in urls[:8]:
    print(" ", u)

# Now extract ONE of them via the full pipeline to confirm freshness
if urls:
    from app.providers.scrapling_provider import extract_post
    post = asyncio.run(extract_post(urls[0]))
    if post:
        print("\nextracted sample:")
        print("  author:", post["author"]["name"])
        print("  publishedAt:", post["publishedAt"])
        print("  reactions:", post["reactions"], "comments:", post["comments"])
        print("  content:", (post["content"] or "")[:120].replace("\n", " "))
    else:
        print("\nEXTRACTION FAILED for", urls[0])
