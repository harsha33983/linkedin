"""Re-test Brave: working query form + recency. PYTHONIOENCODING=utf-8 python .freebuff/test-brave-tf2.py"""
import re, time
from scrapling.fetchers import Fetcher

POST_URL = re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:posts|pulse|feed/update)/[^\s\"'<>?#&]+", re.IGNORECASE)

def fetch(url):
    page = Fetcher.get(url, stealthy_headers=True, impersonate="chrome", timeout=30)
    return page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")

def activity_age_days(url):
    m = re.search(r"activity-(\d{19})", url)
    if not m:
        return None
    ts_ms = int(m.group(1)) >> 22
    return (time.time() * 1000 - ts_ms) / 86_400_000

for tf in ["pd", "pw", "pm", None]:
    url = "https://search.brave.com/search?q=site%3Alinkedin.com%2Fposts%2F+AI"
    if tf:
        url += f"&tf={tf}"
    html = fetch(url)
    urls = list({m.group(0).rstrip(".,);:!]").rstrip("/") for m in POST_URL.finditer(html)})
    ages = sorted(a for a in (activity_age_days(u) for u in urls) if a is not None)
    print(f"tf={tf!s:5} urls={len(urls):3}  ages(days)={[round(a) for a in ages[:12]]}")
