#!/usr/bin/env python3
"""Screenshot helper for design passes. Usage: python3 scripts/ui_shot.py before|after"""
import sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

PREFIX = sys.argv[1] if len(sys.argv) > 1 else "before"
BASE = "http://localhost:8642"
OUT = Path(__file__).resolve().parent.parent / "docs" / "design-pass"
OUT.mkdir(parents=True, exist_ok=True)

ROUTES = [
    ("today", "#/"),
    ("report", "#/report"),
    ("observe", "#/observe"),
    ("learn", "#/learn"),
    ("safety", "#/safety"),
    ("account", "#/account"),
]
SIZES = [(375, 812), (1440, 900)]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for w, h in SIZES:
        ctx = browser.new_context(
            viewport={"width": w, "height": h},
            device_scale_factor=2,
            bypass_csp=False,
            service_workers="block",
            reduced_motion="reduce",
        )
        page = ctx.new_page()
        for name, route in ROUTES:
            page.goto(f"{BASE}/?nocache={int(time.time())}{route}")
            page.wait_for_timeout(900)
            page.screenshot(path=str(OUT / f"{PREFIX}-{name}-{w}.png"), full_page=True)
        # dark theme, today only
        page.goto(f"{BASE}/?nocache={int(time.time())}#/")
        page.wait_for_timeout(600)
        page.evaluate("document.documentElement.setAttribute('data-theme','dark'); localStorage.setItem('msc.theme','dark')")
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / f"{PREFIX}-today-dark-{w}.png"), full_page=True)
        ctx.close()
    browser.close()
print(f"saved to {OUT}")
