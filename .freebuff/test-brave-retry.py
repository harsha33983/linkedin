"""Single Brave request (no burst). PYTHONIOENCODING=utf-8 python .freebuff/test-brave-retry.py"""
import re, time, httpx

POST_URL = re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:posts|pulse|feed/update)/[^\s\"'<>?#&]+", re.IGNORECASE)

def age_days(url):
    m = re.search(r"activity-(\d{19})", url)
    if not m:
        return None
    return (time.time() * 1000 - (int(m.group(1)) >> 22)) / 86_400_000

with httpx.Client(timeout=60) as c:
    r = c.get("https://search.brave.com/search?q=" + str(httpx.QueryParams({'q': 'site:linkedin.com/posts/ AI'})),
              headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"})
html = r.text
low = html.lower()
urls = list({m.group(0).rstrip('.,);:!]').rstrip('/') for m in POST_URL.finditer(html)})
print("status:", r.status_code, "len:", len(html), "urls:", len(urls))
print("captcha:", "captcha" in low)
ages = sorted(round(a) for a in (age_days(u) for u in urls) if a is not None)
print("ages(days):", ages[:15])
