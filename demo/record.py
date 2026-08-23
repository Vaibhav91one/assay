#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""Demo recorder: one Playwright context per segment, webm out, PNG keyframes.

Usage: record.py [segment-numbers...]   (no args = all)
Videos land in demo/raw/<nn>-<name>.webm, stills in demo/shots/.
Server expected on :3020 against assay_demo (see plan).
"""
import sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:3020"
ROOT = Path(__file__).resolve().parent
RAW, SHOTS = ROOT / "raw", ROOT / "shots"
SIZE = {"width": 1440, "height": 900}
MOBILE = {"width": 390, "height": 844}

def pace(page, ms=1000):
    page.wait_for_timeout(ms)

def scroll(page, steps=6, dy=300, ms=420):
    for _ in range(steps):
        page.mouse.wheel(0, dy)
        page.wait_for_timeout(ms)

def shot(page, name):
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=False)

class Seg:
    def __init__(self, pw, nn, name, size=SIZE):
        self.nn, self.name = nn, name
        self.browser = pw.chromium.launch(headless=True)
        self.ctx = self.browser.new_context(
            viewport=size, record_video_dir=str(RAW), record_video_size=size)
        self.page = self.ctx.new_page()
    def done(self):
        video = self.page.video
        self.ctx.close()
        path = Path(video.path())
        dest = RAW / f"{self.nn}-{self.name}.webm"
        dest.unlink(missing_ok=True)
        path.rename(dest)
        self.browser.close()
        print(f"  -> {dest.name}")

def goto(page, path, wait="networkidle"):
    page.goto(BASE + path, wait_until=wait, timeout=60000)
    pace(page, 1200)

# ---------------------------------------------------------------- segments

def seg01(pw):
    s = Seg(pw, "01", "home-identity"); p = s.page
    goto(p, "/")
    shot(p, "01a-home-hero")
    pace(p, 1500)
    scroll(p, steps=4)
    shot(p, "01b-home-stats")
    pace(p, 800)
    s.done()

def seg02(pw):
    s = Seg(pw, "02", "create-with-ai"); p = s.page
    goto(p, "/")
    box = p.get_by_role("textbox").first
    box.click(); pace(p, 600)
    msg = "https://assay-testbed.vercel.app/v/baseline/ - track the recall title and units affected for each recall"
    box.type(msg, delay=18)
    pace(p, 900)
    shot(p, "02a-composer-filled")
    box.press("Enter")
    # model turn: wait for the proposal's confirm button, up to 3 min
    btn = p.get_by_text("Start watching these fields")
    btn.wait_for(state="visible", timeout=180000)
    pace(p, 1500)
    shot(p, "02b-proposal-table")
    # expand first tier chip if present
    try:
        chip = p.locator("button", has_text="normal").first
        chip.click(timeout=3000); pace(p, 1600)
        shot(p, "02c-tier-spec")
    except Exception:
        pass
    scroll(p, steps=2)
    btn.click()
    # built state: fields created
    p.get_by_text("Watching", exact=False).first.wait_for(timeout=60000)
    pace(p, 2000)
    shot(p, "02d-built")
    s.done()

def seg03(pw):
    s = Seg(pw, "03", "refuses-to-guess-at-creation"); p = s.page
    goto(p, "/")
    p.get_by_text("Describe the fields yourself", exact=False).first.click()
    pace(p, 1200)
    url_in = p.get_by_placeholder("https://", exact=False).first
    url_in.fill("https://assay-testbed.vercel.app/v/baseline/")
    pace(p, 600)
    inputs = p.locator("input").all()
    # name + example-value fields: find empties after the URL
    p.get_by_placeholder("price", exact=False).first.fill("recall_title")
    p.get_by_placeholder("as it reads on the page", exact=False).first.fill("this value is not on the page")
    pace(p, 800)
    shot(p, "03a-manual-wrong-value")
    p.get_by_text("Start watching", exact=True).first.click()
    p.get_by_text("Could not find", exact=False).first.wait_for(timeout=60000)
    pace(p, 1500)
    shot(p, "03b-refusal")
    s.done()

def seg04(pw):
    s = Seg(pw, "04", "run-trace"); p = s.page
    held = held_run_path()
    goto(p, held)
    shot(p, "04a-trace-top")
    scroll(p, steps=3)
    try:
        p.get_by_text("show the numbers", exact=False).first.click(timeout=5000)
        pace(p, 1600)
        shot(p, "04b-show-the-numbers")
    except Exception:
        print("  ! numbers disclosure not found")
    scroll(p, steps=5)
    shot(p, "04c-sources")
    pace(p, 800)
    s.done()

def seg05(pw):
    s = Seg(pw, "05", "decisions-queue"); p = s.page
    goto(p, "/decisions")
    shot(p, "05a-held-decision")
    pace(p, 2000)
    try:
        p.get_by_text("Leave this field empty", exact=False).first.click(timeout=5000)
        pace(p, 700)
        shot(p, "05b-toast-undo")
        p.get_by_text("Undo", exact=False).first.click(timeout=4000)
        pace(p, 2000)
        shot(p, "05c-undone")
    except Exception as e:
        print(f"  ! resolve flow: {e}")
    s.done()

def seg06(pw):
    s = Seg(pw, "06", "proof-page"); p = s.page
    proof = proof_id()
    goto(p, f"/explain/{proof}")
    shot(p, "06a-explain")
    scroll(p, steps=3)
    try:
        p.get_by_text("full record", exact=False).first.click(timeout=5000)
        pace(p, 1500)
        shot(p, "06b-full-record")
    except Exception:
        pass
    scroll(p, steps=3)
    s.done()

def seg07(pw):
    s = Seg(pw, "07", "break-it-live"); p = s.page
    goto(p, latest_run_path("assay-testbed"))
    try:
        sel = p.locator("select:visible").last
        sel.scroll_into_view_if_needed(timeout=8000)
        pace(p, 800)
        shot(p, "07a-variant-picker")
        sel.select_option(value="rename_class")
        pace(p, 800)
        p.get_by_text("Break this page", exact=False).first.click(timeout=8000)
        pace(p, 1500)
        shot(p, "07b-queued")
        # worker claims on its next poll (<=30s); then the panel links the run
        p.wait_for_timeout(45000)
        shot(p, "07c-after-worker")
        run = latest_run_path("assay-testbed")
        goto(p, run)
        pace(p, 1500)
        shot(p, "07d-break-run-trace")
        scroll(p, steps=3)
    except Exception as e:
        shot(p, "07x-state")
        print(f"  ! break-it-live: {e}")
    s.done()

def seg08(pw):
    s = Seg(pw, "08", "fields-fragility"); p = s.page
    goto(p, "/fields")
    shot(p, "08a-fields")
    scroll(p, steps=2)
    try:
        link = p.locator("a[href^='/fields/']:visible").first
        link.scroll_into_view_if_needed(timeout=5000)
        pace(p, 600)
        link.click(timeout=5000)
        p.wait_for_load_state("networkidle")
        pace(p, 1500)
        shot(p, "08b-data-view")
        scroll(p, steps=2)
    except Exception as e:
        print(f"  ! data view: {e}")
    s.done()

def seg09(pw):
    s = Seg(pw, "09", "schedule-and-lifecycle"); p = s.page
    goto(p, "/schedule")
    shot(p, "09a-calendar")
    pace(p, 1500)
    scroll(p, steps=2)
    goto(p, "/runs")
    try:
        p.get_by_text("Ask for a run", exact=False).first.click(timeout=5000)
        pace(p, 1500)
        shot(p, "09b-run-picker")
        p.keyboard.press("Escape"); pace(p, 800)
    except Exception as e:
        print(f"  ! run picker: {e}")
    goto(p, "/schedule")
    try:
        # a calendar entry opens the detail dialog, which carries the
        # pause/resume/cadence/delete lifecycle controls
        p.locator('button:has-text("demo-hold"):visible').first.click(timeout=6000)
        pace(p, 1600)
        shot(p, "09c-lifecycle-dialog")
        p.keyboard.press("Escape"); pace(p, 600)
    except Exception as e:
        print(f"  ! lifecycle dialog: {e}")
    s.done()

def seg10(pw):
    s = Seg(pw, "10", "audit"); p = s.page
    goto(p, "/audit")
    shot(p, "10a-audit")
    scroll(p, steps=4)
    shot(p, "10b-audit-table")
    s.done()

def seg11(pw):
    s = Seg(pw, "11", "compare"); p = s.page
    goto(p, "/compare")
    shot(p, "11a-compare")
    scroll(p, steps=3)
    s.done()

def seg12(pw):
    s = Seg(pw, "12", "docs-and-search"); p = s.page
    goto(p, "/docs")
    shot(p, "12a-docs")
    pace(p, 1000)
    try:
        p.keyboard.press("Meta+k"); pace(p, 900)
        p.keyboard.type("abstain", delay=60); pace(p, 1500)
        shot(p, "12b-search")
        p.keyboard.press("Escape")
    except Exception:
        pass
    goto(p, "/docs/api-reference"); scroll(p, steps=3)
    shot(p, "12c-api-reference")
    goto(p, "/docs/glossary"); scroll(p, steps=3)
    s.done()

def seg13(pw):
    s = Seg(pw, "13", "mobile", size=MOBILE); p = s.page
    for path, name in [("/", "13a-mobile-home"), ("/runs", "13b-mobile-runs"), ("/decisions", "13c-mobile-decisions")]:
        goto(p, path)
        shot(p, name)
        scroll(p, steps=3, dy=250)
    s.done()

def seg14(pw):
    s = Seg(pw, "14", "honest-edges"); p = s.page
    goto(p, "/runs/999999")
    shot(p, "14a-branded-404")
    pace(p, 1200)
    goto(p, "/settings?tab=notifications")
    shot(p, "14b-settings-honesty")
    scroll(p, steps=2)
    s.done()

# ------------------------------------------------------------- db lookups
import subprocess
def sql(q):
    return subprocess.run(
        ["psql", "-tA", "-c", q, "postgres://localhost:5432/assay_demo"],
        capture_output=True, text=True).stdout.strip()

def held_run_path():
    r = sql("select run_id from field_runs where status='quarantined' order by run_id desc limit 1")
    return f"/runs/{r}" if r else "/runs"

def latest_run_path(slug_prefix):
    r = sql(f"select r.run_id from runs r join targets t on t.target_id=r.target_id where t.target_id like '{slug_prefix}%' order by r.run_id desc limit 1")
    if not r:
        r = sql("select run_id from runs order by run_id desc limit 1")
    return f"/runs/{r}" if r else "/runs"

def proof_id():
    r = sql("select proof_id from field_runs where proof_id is not null and status='quarantined' order by run_id desc limit 1")
    return r or sql("select proof_id from field_runs where proof_id is not null order by run_id desc limit 1")

SEGS = {f"{i:02d}": fn for i, fn in
        [(1, seg01), (2, seg02), (3, seg03), (4, seg04), (5, seg05), (6, seg06),
         (7, seg07), (8, seg08), (9, seg09), (10, seg10), (11, seg11), (12, seg12),
         (13, seg13), (14, seg14)]}

if __name__ == "__main__":
    want = sys.argv[1:] or sorted(SEGS)
    RAW.mkdir(parents=True, exist_ok=True); SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        for nn in want:
            nn = nn.zfill(2)
            print(f"segment {nn} ...")
            t0 = time.time()
            try:
                SEGS[nn](pw)
                print(f"  ok in {time.time()-t0:.0f}s")
            except Exception as e:
                print(f"  FAILED: {e}")
