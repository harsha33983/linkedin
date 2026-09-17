"""Inspect Jina-proxied Google SERP content. PYTHONIOENCODING=utf-8 python .freebuff/test-jina-serp2.py"""
import re, urllib.request, urllib.parse

def jina(url, timeout=60, fmt="html"):
    req = urllib.request.Request(
        f"https://r.jina.ai/{url}",
        headers={"X-Return-Format": fmt, "X-Timeout": "45", "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")

serp = "https://www.google.com/search?q=" + urllib.parse.quote('site:linkedin.com/posts/ "AI"') + "&num=30&hl=en"

html = jina(serp)
m = re.search(r"<title>(.*?)</title>", html, re.S)
print("TITLE:", m.group(1)[:150] if m else None)
low = html.lower()
for marker in ["enable javascript", "consent", "before you continue", "unsupported", "detected unusual"]:
    if marker in low:
        i = low.index(marker)
        print(f"marker {marker!r}: ...{html[max(0,i-60):i+140]!r}")
        break
print("mentions linkedin.com:", html.count("linkedin.com"))
# try markdown format (default) — Jina's readability extraction may include result links
md = jina(serp, fmt="default")
print("\nMD len:", len(md), "linkedin mentions:", md.count("linkedin.com"))
for m in re.finditer(r"https?://[^\s)\"]*linkedin\.com[^\s)\"]*", md):
    print(" ", m.group(0)[:120])
