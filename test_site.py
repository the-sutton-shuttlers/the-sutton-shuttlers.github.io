#!/usr/bin/env python3
"""
Sutton Shuttlers site test pack.

Usage:
    python3 test_site.py            # test the local build in ./ (default)
    python3 test_site.py --live     # test https://the-sutton-shuttlers.github.io
    python3 test_site.py --base file:///home/ubuntu/ss-org

Requires: playwright (`pip install playwright`) and Devin's Chrome on :29229,
or it falls back to launching its own chromium (`playwright install chromium`).
"""
import argparse, sys, time

BASE_LIVE = 'https://the-sutton-shuttlers.github.io'

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS' if ok else 'FAIL'), '-', name, ('| ' + str(detail)[:140] if detail else ''))

def connect(p):
    try:
        b = p.chromium.connect_over_cdp('http://localhost:29229')
        return b, b.contexts[0]
    except Exception:
        b = p.chromium.launch()
        return b, b.new_context()

def new_page(ctx, cdp_off=False):
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    return pg, errs

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--live', action='store_true')
    ap.add_argument('--base', default=None)
    ap.add_argument('--mobile', action='store_true', default=True)
    args = ap.parse_args()
    base = args.base or (BASE_LIVE if args.live else 'file:///home/ubuntu/ss-org')
    base = base.rstrip('/')

    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    browser, ctx = connect(pw)
    try:
        session = ctx.new_cdp_session(ctx.new_page()) if hasattr(ctx, 'new_cdp_session') else None
    except Exception:
        session = None
    # disable cache for live testing
    pg0, _ = new_page(ctx)
    try:
        cdp = ctx.new_cdp_session(pg0)
        cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
    except Exception:
        pass

    def open(path, wait=10000, vw=390):
        pg, errs = new_page(ctx)
        pg.set_viewport_size({'width': vw, 'height': 844})
        pg.goto(base + '/' + path)
        pg.wait_for_timeout(wait)
        return pg, errs

    # ---------- 1. all pages load ----------
    print('\n== Pages ==')
    for path in ['index.html', 'about.html', 'monday-ladder.html', 'tournaments.html',
                 'calendar.html', 'events.html', 'photos.html', 'videos.html',
                 'contact.html', 'register.html', 'annual-party-2026.html',
                 'code-of-conduct.html', 'privacy-policy.html', 'data-protection.html', 'league.html']:
        pg, errs = open(path, wait=4000)
        title = pg.title()
        check(f'page loads: {path}', not errs and title, f'title="{title}" errs={errs[:1]}')
        pg.close()

    # ---------- 2. nav order ----------
    pg, errs = open('monday-ladder.html', wait=4000)
    nav = pg.eval_on_selector_all('.nav-links a', 'a=>a.map(x=>x.innerText.trim())')
    check('nav first item = Monday Ladder', nav and 'Ladder' in nav[0], nav)
    check('nav last-but-one = About', nav and 'About' in nav[-2], nav)

    # ---------- 3. ladder page sections ----------
    t = pg.evaluate("document.body.innerText")
    check('club stats section', 'LADDER IN NUMBERS' in t.upper(), '')
    check('leaderboard section', 'LEADERBOARD' in t.upper(), '')
    check('players section', 'PLAYERS' in t.upper(), '')
    check('how-it-works section', 'HOW THE LADDER WORKS' in t.upper(), '')
    check('page-nav has How it works', pg.evaluate("!!document.querySelector('a[href=\"#how-it-works\"]')"), '')

    # leaderboard rendered (sheet fetch needs time)
    pg.wait_for_timeout(8000)
    rows = pg.eval_on_selector_all('#ladder .lb-table tr', 'r=>r.length')
    check('all-time table ~67 rows', rows >= 60, f'{rows} rows')
    pods = pg.eval_on_selector_all('.podium .pod', 'e=>e.length')
    check('podium has 3 medals', pods == 3, pods)
    cards = pg.eval_on_selector_all('#players-grid a', 'e=>e.length')
    check('player cards ~66', cards >= 60, cards)
    season_tabs = pg.eval_on_selector_all('.lb-tabs *', 'e=>e.length')
    check('season tabs present', season_tabs >= 4, season_tabs)
    # short names in table, not full names
    names = pg.eval_on_selector_all('#ladder .lb-table td a', 'a=>a.map(x=>x.innerText)')
    check('table shows short name "Pankaj C"', 'Pankaj C' in names, names[:8])
    check('no wrong "Pankaj Khanna" in table', 'Pankaj Khanna' not in names, '')
    pg.close()

    # ---------- 4. player profile ----------
    pg, errs = open('player.html?n=Himanshu%20S', wait=12000)
    t = pg.evaluate("document.getElementById('player-root').innerText")
    check('profile renders (no "Loading")', 'Loading player' not in t and len(t) > 400, t[:60])
    check('no page errors', not errs, errs[:1])
    for sec in ['MATCHES', 'RANK SCORE BREAKDOWN', 'TOTAL', 'RECENT FORM', 'GAMES BY COURT',
                'ACTIVITY', 'SEASON BY SEASON', 'HIGHLIGHTS', 'HEAD TO HEAD',
                'TRAJECTORY', 'CHEMISTRY', 'MILESTONES', 'TOP PARTNERS', 'TOUGHEST OPPONENTS']:
        check(f'profile section: {sec}', sec in t.upper(), '')
    check('full name on profile', 'HIMANSHU' in t.upper(), t[:80])
    # head-to-head dropdown works
    nopts = pg.eval_on_selector_all('#h2h-sel option', 'o=>o.length')
    check('h2h has opponents', nopts > 5, nopts)
    if nopts > 1:
        pg.select_option('#h2h-sel', index=1)
        pg.wait_for_timeout(400)
        out = pg.eval_on_selector('#h2h-out', 'e=>e.innerText')
        check('h2h record renders', 'meetings' in out, out[:60])
    # mobile width: card nearly full width
    w = pg.evaluate("document.querySelector('.pcard').getBoundingClientRect().width")
    check('hero card uses >80% of 390px viewport', w > 320, f'{w}px')
    pg.close()

    # second player sanity (distinct names)
    pg, _ = open('player.html?n=Pankaj%20C', wait=11000)
    t = pg.evaluate("document.getElementById('player-root').innerText")
    check('Pankaj C -> Pankaj Chopra profile', 'CHOPRA' in t.upper(), t[:80])
    pg.close()

    # ---------- 5. photo slideshow ----------
    pg, errs = open('photos.html', wait=4000)
    imgs = pg.eval_on_selector_all('.gallery img', 'e=>e.length')
    check('gallery has photos', imgs > 5, imgs)
    pg.click('.gallery img'); pg.wait_for_timeout(500)
    c1 = pg.eval_on_selector('.lb-count', 'e=>e.innerText') if pg.query_selector('.lb-count') else ''
    pg.click('.lb-next'); pg.wait_for_timeout(300)
    c2 = pg.eval_on_selector('.lb-count', 'e=>e.innerText')
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300)
    c3 = pg.eval_on_selector('.lb-count', 'e=>e.innerText')
    check('slideshow counter 1->2->3', c1.startswith('1') and c2.startswith('2') and c3.startswith('3'), f'{c1},{c2},{c3}')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('lightbox closes on Escape', 'open' not in (pg.eval_on_selector('.lightbox', 'e=>e.className')), '')
    pg.close()

    # ---------- 6. party form ----------
    pg, errs = open('annual-party-2026.html', wait=4000)
    t = pg.evaluate("document.body.innerText").upper()
    check('party page: masquerade', 'MASQUERADE' in t, '')
    check('party page: saturday', 'SATURDAY' in t, '')
    check('party page: venue', 'GANDER GREEN' in t, '')
    check('party page: drinks note', 'BAR' in t, '')
    # duplicate-submit guard attribute / required phone
    phone_req = pg.evaluate("!!document.querySelector('input[name*=phone i][required], input[type=tel][required]')")
    check('phone required', phone_req, '')
    pg.close()

    # ---------- summary ----------
    fails = [r for r in results if not r[1]]
    print('\n==== %d checks, %d passed, %d FAILED ====' % (len(results), len(results)-len(fails), len(fails)))
    for n, ok, d in fails:
        print('  FAIL:', n, '|', d[:120])
    pw.stop()
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
