"""Runs the computer-vision stats for whole games, from tape to a season table.

    private/film/.venv/Scripts/python tools/film/cv_game.py prepare [slug...]   learn each game's look-alike groups (~4 min a game)
    private/film/.venv/Scripts/python tools/film/cv_game.py confirm [slug...]   mark which group is DFC / opponent (a screen, ~10 s a game)
    private/film/.venv/Scripts/python tools/film/cv_game.py run [slug...]       both halves, the game's numbers, then apply (~30 min a game)
    private/film/.venv/Scripts/python tools/film/cv_game.py apply [slug...]     write the numbers into each game's match report
    private/film/.venv/Scripts/python tools/film/cv_game.py report              the season table

With no slugs, each step takes every game whose tape is on this PC and that is ready for it and not done
yet (--force redoes them). run writes data/raw/<slug>-cv/game.json: possession, passes and turnovers for the
game and each half, DFC's possession in 5-minute stretches, and Ollie's numbers alongside where the game
file has them. All of it is approximate: good for spotting stretches and trends, not for exact counts.
"""
import argparse, json, re, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from cv_pilot import DATA, OTHER, THEM, US, analyse, mmss, secs  # noqa: E402

PY = sys.executable
HERE = Path(__file__).parent
STRETCH = 300  # seconds
# Both teams field the same number, so on average the camera sees about as many of each. When it reads far
# more of one kit than the other, or can't place most players at all, the kits weren't told apart.
BALANCE, READ = 0.6, 0.35


def games(slugs):
    out = []
    for p in sorted((DATA / "games").glob("*.json")):
        if slugs and p.stem not in slugs:
            continue
        g = json.loads(p.read_text(encoding="utf8"))
        if Path(g.get("highlights", {}).get("source", "")).is_file() and g.get("video", {}).get("kickoff"):
            out.append((p.stem, g))
    return out


def folder(slug):
    return DATA / "raw" / f"{slug}-cv"


def ollie(g):
    """Ollie's whole-game numbers as the game file reports them (DFC first), where it has them."""
    ours = (TITLE["en"], STRETCH_TITLE["en"])
    tables = [t for t in g["report"]["numbers"]["tables"] if (t.get("title") or {}).get("en") not in ours]
    s = json.dumps({**g, "report": {**g["report"], "numbers": {**g["report"]["numbers"], "tables": tables}}}, ensure_ascii=False)
    out = {}
    m = re.search(r"Possession \*\*(\d+)%[–-](\d+)%", s)
    if m:
        out["possession"] = [int(m[1]), int(m[2])]
    for key, label in (("passes", "Completed passes"), ("turnovers", "Turnovers")):
        m = re.search(r'"en": "' + label + r'", "es": "[^"]*"\}, "us": (\d+), "them": (\d+)', s)
        if m:
            out[key] = [int(m[1]), int(m[2])]
    return out


def numbers(slug, g):
    halves, stretches, total = {}, [], {"time": [0.0, 0.0], "passes": [0, 0], "turnovers": [0, 0]}
    seen = [0, 0, 0]  # player sightings read as DFC, the opponent, neither
    for h in ("1", "2"):
        d = json.loads((folder(slug) / f"{h}H_0-00.json").read_text(encoding="utf8"))
        team, dt = {int(k): v for k, v in d["teams"].items()}, d["stride"] / 25
        s = d["summary"]
        for f in d["frames"]:
            for row in f["people"]:
                seen[team.get(int(row[0]), OTHER)] += 1
        halves[h] = {k: s[k] for k in ("possession", "passes", "turnovers", "ballSeen", "ballHeld")}
        held = s["ballHeld"] * s["frames"] * dt  # seconds someone had the ball, to weight the halves
        for i, k in enumerate(("DFC", "OPP")):
            total["time"][i] += s["possession"][k] * held
            total["passes"][i] += s["passes"][k]
            total["turnovers"][i] += s["turnovers"][k]
        step = int(STRETCH / dt)
        for k in range(0, len(d["frames"]), step):
            r = analyse(d["frames"][k:k + step], team, dt)
            stretches.append({"half": int(h), "from": mmss(k * dt), "dfc": round(r["possession"]["DFC"] * 100)})
    t = sum(total["time"]) or 1
    balance = min(seen[US], seen[THEM]) / (max(seen[US], seen[THEM]) or 1)
    read = (seen[US] + seen[THEM]) / (sum(seen) or 1)
    return {"slug": slug, "opponent": g.get("opponent"),
            "possession": [round(100 * total["time"][0] / t), round(100 * total["time"][1] / t)],
            "passes": total["passes"], "turnovers": total["turnovers"], "halves": halves,
            "stretches": stretches, "ollie": ollie(g),
            "kits": {"balance": round(balance, 2), "read": round(read, 2), "unsure": balance < BALANCE or read < READ}}


def report():
    rows = []
    for slug, g in games(None):
        p = folder(slug) / "game.json"
        if p.exists():
            rows.append(json.loads(p.read_text(encoding="utf8")))
    if not rows:
        print("No games have been run yet.")
        return
    pair = lambda x: f"{x[0]}-{x[1]}" if x else "-"
    print(f"{'game':28} {'poss (Ollie)':>14} {'passes (Ollie)':>18} {'turnovers (Ollie)':>20}  weakest stretches (DFC possession)")
    for r in rows:
        o = r["ollie"]
        weak = sorted(r["stretches"], key=lambda s: s["dfc"])[:2]
        print(f"{r['slug'] + ('*' if r.get('kits', {}).get('unsure') else ''):28} {pair(r['possession']):>6} ({pair(o.get('possession')):>5}) "
              f"{pair(r['passes']):>8} ({pair(o.get('passes')):>7}) {pair(r['turnovers']):>9} ({pair(o.get('turnovers')):>7})  "
              + ", ".join(f"{s['half']}H {s['from']} {s['dfc']}%" for s in weak))
    if any(r.get("kits", {}).get("unsure") for r in rows):
        print("* the model struggled to tell the kits apart; try prepare --force --groups 16 and confirm again")


TITLE = {"en": "Ball and possession (estimated from the video)", "es": "Balón y posesión (estimado a partir del video)"}
STRETCH_TITLE = {"en": "Possession by 5-minute stretch (estimated from the video)",
                 "es": "Posesión por tramos de 5 minutos (estimado a partir del video)"}
NOTE = {"en": " The two tables estimated from the video come from a computer model following the players and the ball on the tape; treat them as a guide to trends and weak stretches, not as a count.",
        "es": " Las dos tablas estimadas a partir del video salen de un modelo que sigue a los jugadores y el balón en la grabación; tómelas como guía de tendencias y tramos flojos, no como un conteo."}


def apply(slug):
    """Writes the game's estimates into its match report (report.numbers), next to Ollie's tables, which are
    left as they are. Running it again replaces the estimated tables."""
    path = DATA / "games" / f"{slug}.json"
    g = json.loads(path.read_text(encoding="utf8"))
    r = json.loads((folder(slug) / "game.json").read_text(encoding="utf8"))
    if "kits" not in r:  # run before the kit check existed
        r = numbers(slug, g)
        (folder(slug) / "game.json").write_text(json.dumps(r, indent=1), encoding="utf8")
    n = g["report"]["numbers"]
    n["tables"] = [t for t in n["tables"] if (t.get("title") or {}).get("en") not in (TITLE["en"], STRETCH_TITLE["en"])]
    h1, h2 = r["halves"]["1"]["possession"], r["halves"]["2"]["possession"]
    pct = lambda x: round(x * 100)
    unsure = {"unsure": True} if r.get("kits", {}).get("unsure") else {}
    n["tables"].append({"title": TITLE, **unsure, "rows": [
        {"label": {"en": "Possession", "es": "Posesión"}, "us": r["possession"][0], "them": r["possession"][1], "unit": "%"},
        {"label": {"en": "Possession, first half", "es": "Posesión, primera parte"}, "us": pct(h1["DFC"]), "them": pct(h1["OPP"]), "unit": "%"},
        {"label": {"en": "Possession, second half", "es": "Posesión, segunda parte"}, "us": pct(h2["DFC"]), "them": pct(h2["OPP"]), "unit": "%"},
        {"label": {"en": "Completed passes", "es": "Pases completados"}, "us": r["passes"][0], "them": r["passes"][1]},
        {"label": {"en": "Turnovers", "es": "Pérdidas de balón"}, "us": r["turnovers"][0], "them": r["turnovers"][1]},
    ]})
    rows = []
    for st in r["stretches"]:
        h = str(st["half"])
        a = int(secs(st["from"]) // 60)
        b = min(a + STRETCH // 60, -(-int(secs(g["video"]["halfLength"][h])) // 60))
        rows.append({"label": {"en": f"{'1st' if h == '1' else '2nd'} half {a}–{b}'", "es": f"{h}.ª parte {a}–{b}'"},
                     "us": st["dfc"], "them": 100 - st["dfc"], "unit": "%"})
    n["tables"].append({"title": STRETCH_TITLE, **unsure, "rows": rows})
    sub = n.get("sub") or {"en": "", "es": ""}
    n["sub"] = {k: (sub[k].split(NOTE[k])[0] + NOTE[k]).strip() for k in ("en", "es")}
    path.write_text(json.dumps(g, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(f"  {slug}: estimates written into the match report" + (" (marked unsure: kits not told apart)" if unsure else ""), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["prepare", "confirm", "run", "apply", "report"])
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--groups", type=int, default=10, help="look-alike groups per game; pale kits need more")
    a = ap.parse_args()
    todo = games(a.slugs)
    if a.step == "prepare":
        from cv_teams import prepare
        for slug, _ in todo:
            if a.force or not (folder(slug) / "looks.npz").exists():
                prepare(slug, groups=a.groups)
    elif a.step == "confirm":
        from cv_teams import confirm
        confirm([s for s, _ in todo if (folder(s) / "looks.npz").exists()
                 and (a.force or not (folder(s) / "teams.pkl").exists())])
    elif a.step == "run":
        for slug, g in todo:
            if not (folder(slug) / "teams.pkl").exists():
                print(f"  {slug}: confirm its teams first")
                continue
            if (folder(slug) / "game.json").exists() and not a.force:
                continue
            for h in ("1", "2"):
                subprocess.run([PY, str(HERE / "cv_pilot.py"), slug, "--half", h, "--from", "0:00",
                                "--len", g["video"]["halfLength"][h], "--no-video"], check=True)
            r = numbers(slug, g)
            (folder(slug) / "game.json").write_text(json.dumps(r, indent=1), encoding="utf8")
            print(f"  {slug}: possession {r['possession']}, passes {r['passes']}, turnovers {r['turnovers']}", flush=True)
            apply(slug)
    elif a.step == "apply":
        for slug, _ in todo:
            if (folder(slug) / "game.json").exists():
                apply(slug)
    else:
        report()


if __name__ == "__main__":
    main()
