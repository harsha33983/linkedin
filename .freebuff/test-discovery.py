"""Test each discovery engine directly. PYTHONIOENCODING=utf-8 python .freebuff/test-discovery.py"""
import sys, re
sys.path.insert(0, "scraper-service")

POST_URL = re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:posts|pulse|feed/update)/[^\s\"'<>?#&]+", re.IGNORECASE)

def urls_in(html):
    return list({m.group(0).rstrip(".,);:!]").rstrip("/") for m in POST_URL.finditer(html or "")})

results = {}

# 1. Google via StealthyFetcher (current primary)
try:
    from scrapling.fetchers import StealthyFetcher
    q = 'site:linkedin.com/posts/ "AI"'
    page = StealthyFetcher.fetch(f"https://www.google.com/search?q={q.replace(' ', '+')}&num=30&hl=en&tbs=qdr:w", headless=True, timeout=45000)
    html = page.html_content or ""
    results["google_stealth"] = (len(urls_in(html)), "captcha" if "captcha" in html.lower() or "/sorry/" in html.lower() else "ok")
except Exception as e:
    results["google_stealth"] = (0, f"ERR {type(e).__name__}: {e}")

# 2. DDG html via plain Fetcher
try:
    from scrapling.fetchers import Fetcher
    page = Fetcher.get("https://html.duckduckgo.com/html/?q=" + 'site%3Alinkedin.com%2Fposts%2F+AI'.replace("+", "+") + "&df=w", stealthy_headers=True, impersonate="chrome", timeout=30)
    html = page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")
    results["ddg_html"] = (len(urls_in(html)), "challenge" if "anomaly" in html.lower() else "ok")
except Exception as e:
    results["ddg_html"] = (0, f"ERR {type(e).__name__}: {e}")

# 3. Bing via plain Fetcher (site: scoped)
try:
    page = Fetcher.get("https://www.bing.com/search?q=" + 'site%3Alinkedin.com%2Fposts%2F+%22AI%22'.replace("+", "+") + "&filters=ex1%3a%22ez5_" , stealthy_headers=True, impersonate="chrome", timeout=30)
    html = page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")
    results["bing_fetcher"] = (len(urls_in(html)), len(html))
except Exception as e:
    results["bing_fetcher"] = (0, f"ERR {type(e).__name__}: {e}")

# 4. Mojeek (bot-friendly meta engine)
try:
    page = Fetcher.get("https://www.mojeek.com/search?q=" + 'site%3Alinkedin.com%2Fposts%2F+AI', stealthy_headers=True, impersonate="chrome", timeout=30)
    html = page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")
    results["mojeek"] = (len(urls_in(html)), len(html))
except Exception as e:
    results["mojeek"] = (0, f"ERR {type(e).__name__}: {e}")

# 5. Brave search html (often bot-friendly)
try:
    page = Fetcher.get("https://search.brave.com/search?q=" + 'site%3Alinkedin.com%2Fposts%2F+AI', stealthy_headers=True, impersonate="chrome", timeout=30)
    html = page.body.decode("utf-8", "ignore") if isinstance(page.body, bytes) else (page.html_content or "")
    results["brave"] = (len(urls_in(html)), len(html))
except Exception as e:
    results["brave"] = (0, f"ERR {type(e).__name__}: {e}")

for k, v in results.items():
    print(f"{k:16} urls={v[0]:3}  info={v[1]}")
