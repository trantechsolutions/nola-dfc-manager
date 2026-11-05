"""Shots, shots on target and saves: the model finds the moments, the coach says what they were.

    private/film/.venv/Scripts/python tools/film/cv_shots.py find [slug...] [--half 1|2] [--sheets]   (~1 h a game)
    private/film/.venv/Scripts/python tools/film/cv_shots.py review [slug...]                          (~5 min a game)
    private/film/.venv/Scripts/python tools/film/cv_shots.py apply [slug...]

With no slugs, every game whose teams are confirmed (cv_game.py confirm). Needs the model with goals
(cv_goals.py, then cv_train.py).

find makes two passes over each half. The scan reads one frame in 12 (about two a second) and marks the
moments when a goal is in view and the ball, or failing that a few players, are near it. The close look then
reads every other frame of those moments, plus a few seconds either side, and follows the ball. A candidate
shot is the ball leaving a player fast toward the goal from within striking range; a struck ball blurs and is
often lost in flight, so a sighting at the goal up to GAP seconds later counts. The model flags several
candidates for every real shot, so they go to the coach. Writes data/raw/<slug>-cv/shots.json; --sheets also
saves a picture strip of each candidate (shots/<n>.jpg).

review loops each candidate for a few seconds, with a yellow flash at the moment of the strike: 1 / 2 says
which team struck it (the model's guess is shown), then G goal, T on target and saved, O off target or
blocked, N not a shot. S slows it down, U undoes, Q stops (it carries on where it left off).

apply writes Shots, Shots on target and Saves into the match report. A keeper's saves are the other side's
shots on target that didn't go in.
"""
import argparse, json, sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from cv_pilot import DATA, MODELS, NAMES, OTHER, THEM, US, mmss, secs, vote  # noqa: E402

SCAN = 12          # frames between scan reads
PAD = (4.0, 3.0)   # seconds read before and after each near-goal moment
NEAR = 4.0         # goal widths: the ball this close to a goal is worth a close look
FAST = 6.0         # player heights a second: slower than this is a pass or a dribble, not a shot
RANGE = 5.0        # goal widths: shots are struck from no further out than this
FLIGHT = 1.6       # seconds a shot is followed for
GAP = 1.2          # seconds a struck ball may go unseen in flight
STEP = 2           # frames between close-look reads: shots are bridged across gaps anyway
MERGE = 1.5        # seconds: candidates closer than this are one strike
GOAL_NEAR = 10.0   # seconds: a goal the coach marks this close to a logged goal is that goal
TABLE = {"en": "Shots and saves (from the video, checked by the coach)",
         "es": "Tiros y paradas (del video, revisados por el entrenador)"}


def detect(model, frame):
    """Players, the ball candidates and the goals in one frame."""
    r = model.predict(frame, imgsz=1920, conf=0.1, verbose=False, half=True)[0].boxes.cpu().numpy()
    names = {v: k for k, v in model.names.items()}
    players = r.xyxy[(r.cls == names["player"]) & (r.conf >= 0.3)]
    balls = [(float(c), float(x1 + x2) / 2, float(y1 + y2) / 2)
             for c, (x1, y1, x2, y2) in zip(r.conf[r.cls == names["ball"]], r.xyxy[r.cls == names["ball"]])]
    goals = [b for c, b in zip(r.conf[r.cls == names["goal"]], r.xyxy[r.cls == names["goal"]]) if c >= 0.5]
    return r, players, balls, goals


def height_at(players, x, y):
    """A player's height in pixels near (x, y): the scale for speeds and distances on the ground."""
    if len(players) == 0:
        return None
    d = np.hypot((players[:, 0] + players[:, 2]) / 2 - x, players[:, 3] - y)
    near = players[np.argsort(d)[:3]]
    return float(np.median(near[:, 3] - near[:, 1]))


def nearest_goal(goals, x, y):
    if not goals:
        return None, 99.0
    g = min(goals, key=lambda b: np.hypot((b[0] + b[2]) / 2 - x, (b[1] + b[3]) / 2 - y))
    return g, float(np.hypot((g[0] + g[2]) / 2 - x, (g[1] + g[3]) / 2 - y) / max(g[2] - g[0], 1))


def scan(model, cap, t0, dur, fps):
    """Seconds into the half when a goal is in view and play is near it."""
    hot = []
    cap.set(cv2.CAP_PROP_POS_MSEC, t0 * 1000)
    for i in range(int(dur * fps)):
        if i % SCAN:
            if not cap.grab():
                break
            continue
        ok, frame = cap.read()
        if not ok:
            break
        _, players, balls, goals = detect(model, frame)
        if not goals:
            continue
        ball = max(balls, default=None)
        if ball and ball[0] >= 0.25:
            close = nearest_goal(goals, ball[1], ball[2])[1] <= NEAR
        else:  # no ball: a few players by the goal
            close = sum(nearest_goal(goals, (p[0] + p[2]) / 2, p[3])[1] <= NEAR * 0.6 for p in players) >= 3
        if close:
            hot.append(i / fps)
        if i % (SCAN * 600) == 0:
            print(f"    scan {mmss(i / fps)} / {mmss(dur)}", flush=True)
    windows = []
    for t in hot:
        a, b = max(t - PAD[0], 0), min(t + PAD[1], dur)
        if windows and a <= windows[-1][1]:
            windows[-1][1] = b
        else:
            windows.append([a, b])
    return windows


def follow(model, split, cap, t0, a, b, fps):
    """Every frame from a to b seconds into the half: the ball, the nearest goal and the players by team."""
    from ultralytics.trackers.byte_tracker import BYTETracker
    from ultralytics.utils import IterableSimpleNamespace, YAML
    from ultralytics.utils.checks import check_yaml

    tracker = BYTETracker(IterableSimpleNamespace(**{**YAML.load(check_yaml("bytetrack.yaml")), "track_buffer": 50}))
    votes, frames, last, spots = {}, [], None, []
    cap.set(cv2.CAP_PROP_POS_MSEC, (t0 + a) * 1000)
    for i in range(int((b - a) * fps)):
        if i % STEP:
            if not cap.grab():
                break
            continue
        ok, frame = cap.read()
        if not ok:
            break
        t = a + i / fps
        r, players, balls, goals = detect(model, frame)
        names = {v: k for k, v in model.names.items()}
        tracked = tracker.update(r[r.cls == names["player"]], frame)
        if i % (STEP * 5) == 0 and len(tracked):
            for row, call in zip(tracked, split.classify(frame, [row[:4] for row in tracked])):
                votes.setdefault(int(row[4]), [0, 0, 0])[call] += 1
        ppl = [[int(row[4]), *[float(x) for x in row[:4]]] for row in tracked]
        # The ball: the likeliest candidate, near where it was a moment ago; a spare ball sitting still
        # behind a goal for 2 seconds is ignored.
        spots = [s for s in spots if t - s[3] < 3]
        ball, best = None, 0.0
        for c, bx, by in balls:
            spot = next((s for s in spots if np.hypot(s[0] - bx, s[1] - by) < 8), None)
            if spot is None:
                spots.append(spot := [bx, by, t, t])
            spot[3] = t
            if t - spot[2] >= 2:
                continue
            h = height_at(players, bx, by) or 60
            score = c
            if last and t - last[0] < 0.5:
                score -= min(np.hypot(bx - last[1], by - last[2]) / (h * 12 * max(t - last[0], 0.04)), 0.6)
            if score > best:
                ball, best = (bx, by), score
        if ball:
            last = (t, *ball)
        g, _ = nearest_goal(goals, *ball) if ball and goals else (max(goals, key=lambda g: g[2] - g[0]) if goals else None, 0)
        frames.append({"t": t, "ball": ball, "goal": None if g is None else [float(x) for x in g],
                       "h": height_at(players, *ball) if ball else None, "people": ppl})
    return frames, {tid: vote(v) for tid, v in votes.items()}


def inside(g, x, y, margin=0.12):
    m = margin * (g[2] - g[0])
    return g[0] - m <= x <= g[2] + m and g[1] - m <= y <= g[3] + m


def holder_team(frames, team_of, t, back=1.5):
    """The team that had the ball over the last `back` seconds: whose player was nearest it most often."""
    count = {US: 0, THEM: 0}
    for f in frames:
        if not (t - back <= f["t"] <= t) or not f["ball"]:
            continue
        bx, by = f["ball"]
        near = [(np.hypot((p[1] + p[3]) / 2 - bx, p[4] - by) / max(p[4] - p[2], 1), p[0]) for p in f["people"]]
        near = [n for n in near if n[0] < 1.2]
        if near:
            team = team_of.get(min(near)[1], OTHER)
            if team in count:
                count[team] += 1
    return max(count, key=count.get) if any(count.values()) else OTHER


def shots_in(frames, team_of):
    """Finds the shots in a run of followed frames. A struck ball blurs and is often lost in flight, so a shot
    is a sighting followed, within GAP seconds, by one far enough away to mean a strike, heading for the goal;
    a gap longer than a moment must end at the goal, so that a jump to some other ball isn't taken for one."""
    seen = [f for f in frames if f["ball"] and f["goal"] and f["h"]]
    out, k = [], 0
    while k < len(seen) - 1:
        f0, f1 = seen[k], seen[k + 1]
        dt = f1["t"] - f0["t"]
        (x0, y0), (x1, y1), g, h = f0["ball"], f1["ball"], f0["goal"], f0["h"]
        gw, gx, gy = g[2] - g[0], (g[0] + g[2]) / 2, (g[1] + g[3]) / 2
        d = np.array([x1 - x0, y1 - y0])
        to = np.array([gx - x0, gy - y0])
        speed = np.linalg.norm(d) / max(dt, 1e-3) / h
        heading = float(d @ to / (np.linalg.norm(d) * np.linalg.norm(to) + 1e-6))
        far = np.linalg.norm(to) / gw
        if inside(g, x0, y0, 0):  # the ball being taken out of the net after a goal
            k += 1
            continue
        lands = inside(f1["goal"], x1, y1) or np.hypot(x1 - gx, y1 - gy) / gw < 1.5
        if (dt > GAP or not FAST <= speed <= 40 or heading < 0.75 or far > RANGE
                or (dt > 0.25 and not lands)):
            k += 1
            continue
        team = holder_team(frames, team_of, f0["t"])
        # The flight: on target if it reaches the goal frame (into the net, or stopped there by the keeper),
        # off target if it goes past or is blocked short.
        flight = [f for f in seen if f0["t"] < f["t"] <= f0["t"] + FLIGHT]
        on = any(inside(f["goal"], *f["ball"]) for f in flight)
        out.append({"t": round(f0["t"], 2), "team": team, "onTarget": on, "speed": round(speed, 1),
                    "from": round(far, 1)})
        # One shot per strike: skip past its flight.
        end = f0["t"] + FLIGHT
        while k < len(seen) and seen[k]["t"] < end:
            k += 1
    return out


def sheet(cap, t0, t, frames, path):
    """A strip of the shot: 6 frames from just before the strike, the ball's path drawn in."""
    path_pts = [(int(f["ball"][0]), int(f["ball"][1])) for f in frames if f["ball"] and t - 0.5 <= f["t"] <= t + FLIGHT]
    tiles = []
    for s in np.linspace(t - 0.5, t + FLIGHT, 6):
        cap.set(cv2.CAP_PROP_POS_MSEC, (t0 + s) * 1000)
        ok, fr = cap.read()
        if not ok:
            continue
        for p, q in zip(path_pts, path_pts[1:]):
            cv2.line(fr, p, q, (0, 255, 255), 3)
        g = next((f["goal"] for f in frames if f["goal"] and abs(f["t"] - s) < 0.1), None)
        if g:
            cv2.rectangle(fr, (int(g[0]), int(g[1])), (int(g[2]), int(g[3])), (0, 0, 255), 3)
        fr = cv2.resize(fr, (640, 360))
        cv2.putText(fr, mmss(s), (10, 34), 0, 1.0, (255, 255, 255), 2)
        tiles.append(fr)
    if tiles:
        cv2.imwrite(str(path), np.vstack([np.hstack(tiles[:3]), np.hstack(tiles[3:6])]) if len(tiles) == 6 else np.hstack(tiles))



def find(slug, half=None, sheets=False, rescan=False):
    """The candidate shots of a game (or one half), saved to shots.json for review()."""
    from ultralytics import YOLO
    from cv_teams import Teams

    game = json.loads((DATA / "games" / f"{slug}.json").read_text(encoding="utf8"))
    out = DATA / "raw" / f"{slug}-cv"
    model = YOLO(str(MODELS / "ball.pt"))
    if "goal" not in model.names.values():
        sys.exit("ball.pt can't see goals yet: run cv_goals.py, then cv_train.py.")
    split = Teams(out / "teams.pkl")
    cap = cv2.VideoCapture(game["highlights"]["source"])
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    path = out / "shots.json"
    saved = json.loads(path.read_text(encoding="utf8")) if path.exists() else {"halves": {}}
    for h in ([str(half)] if half else ["1", "2"]):
        t0, dur = game["video"]["kickoff"][h], secs(game["video"]["halfLength"][h])
        if h in saved["halves"] and not rescan:
            windows = saved["halves"][h]["windows"]
        else:
            print(f"  {slug} half {h}: scanning", flush=True)
            windows = scan(model, cap, t0, dur, fps)
        print(f"  {slug} half {h}: {len(windows)} moments near a goal, {sum(b - a for a, b in windows) / 60:.1f} min to follow", flush=True)
        shots = []
        for n, (wa, wb) in enumerate(windows, 1):
            # The close look is the slow part, so it is kept: rerunning only re-judges the shots.
            cache = out / "follow" / f"{h}H_{wa:.1f}-{wb:.1f}.json"
            if cache.exists():
                c = json.loads(cache.read_text(encoding="utf8"))
                frames, team_of = c["frames"], {int(k): v for k, v in c["teams"].items()}
            else:
                frames, team_of = follow(model, split, cap, t0, wa, wb, fps)
                cache.parent.mkdir(exist_ok=True)
                cache.write_text(json.dumps({"frames": frames, "teams": team_of}), encoding="utf8")
            found = shots_in(frames, team_of)
            if sheets:
                (out / "shots").mkdir(exist_ok=True)
                for sh in found:
                    sheet(cap, t0, sh["t"], frames, out / "shots" / f"{h}H_{mmss(sh['t']).replace(':', '-')}.jpg")
            shots += found
            if n % 10 == 0:
                print(f"    followed {n}/{len(windows)}, {len(shots)} candidates so far", flush=True)
        merged = []
        for sh in sorted(shots, key=lambda x: x["t"]):
            if merged and sh["t"] - merged[-1]["t"] < MERGE:
                continue
            merged.append(sh)
        saved["halves"][h] = {"windows": windows, "shots": merged}
        path.write_text(json.dumps(saved, indent=1), encoding="utf8")
        print(f"  {slug} half {h}: {len(merged)} candidate shots", flush=True)


VERDICTS = {ord("g"): "goal", ord("t"): "saved", ord("o"): "off", ord("n"): "none"}
HELP = "1 DFC  2 opponent  |  G goal  T on target, saved  O off target / blocked  N not a shot  |  S slow  U undo  Q quit"
BEFORE, AFTER = 2.5, 2.5  # seconds of tape shown around each candidate


def clip(src, t, fps):
    """The frames around a moment, shrunk for the screen."""
    cap = cv2.VideoCapture(src)
    cap.set(cv2.CAP_PROP_POS_MSEC, (t - BEFORE) * 1000)
    out = []
    for _ in range(int((BEFORE + AFTER) * fps)):
        ok, fr = cap.read()
        if not ok:
            break
        out.append(cv2.resize(fr, (1280, 720)))
    cap.release()
    return out


def review(slugs):
    """The coach's screen: each candidate loops for a few seconds; say which team struck it and what came of it."""
    from concurrent.futures import ThreadPoolExecutor

    win = "Shot review"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, 1280, 790)
    pool = ThreadPoolExecutor(1)
    for slug in slugs:
        path = DATA / "raw" / f"{slug}-cv" / "shots.json"
        if not path.exists():
            continue
        game = json.loads((DATA / "games" / f"{slug}.json").read_text(encoding="utf8"))
        saved = json.loads(path.read_text(encoding="utf8"))
        marks = saved.setdefault("review", {})
        todo = [(h, sh) for h, hv in sorted(saved["halves"].items()) for sh in hv["shots"] if f"{h}-{sh['t']}" not in marks]
        if not todo:
            continue
        src, fps = game["highlights"]["source"], 25

        def at(k):
            return game["video"]["kickoff"][todo[k][0]] + todo[k][1]["t"]

        def save():
            path.write_text(json.dumps(saved, indent=1), encoding="utf8")

        nxt, k, done = pool.submit(clip, src, at(0), fps), 0, []
        while k < len(todo):
            frames = nxt.result()
            if k + 1 < len(todo):
                nxt = pool.submit(clip, src, at(k + 1), fps)
            h, sh = todo[k]
            team = sh["team"] if sh["team"] in (US, THEM) else None
            slow, i, answer = False, 0, None
            while answer is None:
                n = max(len(frames), 1)
                fr = frames[i % n].copy() if frames else np.zeros((720, 1280, 3), np.uint8)
                if abs(i % n - int(BEFORE * fps)) < 4:  # the moment of the strike
                    cv2.rectangle(fr, (0, 0), (1279, 719), (0, 255, 255), 10)
                bar = np.zeros((70, 1280, 3), np.uint8)
                who = NAMES[team] if team is not None else "which team? press 1 or 2"
                cv2.putText(bar, f"{slug}  {h}H {mmss(sh['t'])}   {len(marks) + 1}/{len(marks) + len(todo) - k}   struck by {who}",
                            (10, 30), 0, 0.8, (255, 255, 255), 2)
                cv2.putText(bar, HELP, (10, 60), 0, 0.6, (200, 200, 200), 1)
                cv2.imshow(win, np.vstack([fr, bar]))
                key = cv2.waitKey(80 if slow else 40) & 0xFF
                i += 1
                if cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:
                    key = ord("q")
                if 65 <= key <= 90:  # capitals
                    key += 32
                if key == ord("1"):
                    team = US
                elif key == ord("2"):
                    team = THEM
                elif key == ord("s"):
                    slow = not slow
                elif key in VERDICTS and (team is not None or VERDICTS[key] == "none"):
                    answer = VERDICTS[key]
                elif key == ord("u") and done:
                    marks.pop(done.pop(), None)
                    save()
                    k -= 1
                    nxt.cancel()
                    nxt = pool.submit(clip, src, at(k), fps)
                    answer = "undo"
                elif key in (ord("q"), 27):
                    save()
                    cv2.destroyAllWindows()
                    pool.shutdown(cancel_futures=True)
                    return
            if answer == "undo":
                continue
            mark = f"{h}-{sh['t']}"
            marks[mark] = {"verdict": answer, "team": team}
            save()
            done.append(mark)
            k += 1
        print(f"  {slug}: reviewed", flush=True)
    cv2.destroyAllWindows()
    pool.shutdown(cancel_futures=True)


def counts(slug):
    """Shots, shots on target, goals and saved shots per side from the coach's review; None until it's finished."""
    path = DATA / "raw" / f"{slug}-cv" / "shots.json"
    if not path.exists():
        return None
    saved = json.loads(path.read_text(encoding="utf8"))
    marks = saved.get("review", {})
    if len(saved["halves"]) < 2 or any(f"{h}-{sh['t']}" not in marks for h, hv in saved["halves"].items() for sh in hv["shots"]):
        return None
    # The goals are already logged, with the scorer's side: each goal the coach marked takes the side of the
    # logged goal it falls on, a second mark on the same goal is dropped, and a logged goal the model never
    # flagged (a ball lost in flight for longer than GAP) is counted anyway.
    game = json.loads((DATA / "games" / f"{slug}.json").read_text(encoding="utf8"))
    logged = [{"h": str(e["h"]), "t": secs(e["c"]), "team": US if e["t"] == "D" else THEM, "clock": e["c"], "seen": False}
              for e in game["events"] if e["y"] == "Goal" and e["t"] in ("D", "O")]
    c = {t: {"shots": 0, "on": 0, "goals": 0, "saved": 0, "notes": []} for t in (US, THEM)}
    for key, m in sorted(marks.items(), key=lambda kv: (kv[0].split("-")[0], float(kv[0].split("-")[1]))):
        h, t = key.split("-")
        verdict, team = m["verdict"], m["team"]
        if verdict == "goal":
            g = min((g for g in logged if g["h"] == h), key=lambda g: abs(g["t"] - float(t)), default=None)
            if g is None or abs(g["t"] - float(t)) > GOAL_NEAR:
                verdict = "saved"  # no goal was logged then: on target, and the keeper or the post kept it out
                c[team if team in c else US]["notes"].append(f"{h}H {mmss(float(t))} marked a goal but none was logged; counted as saved")
            elif g["seen"]:
                continue
            else:
                g["seen"], team = True, g["team"]
        if verdict == "none" or team not in c:
            continue
        side = c[team]
        side["shots"] += 1
        side["on"] += verdict in ("goal", "saved")
        side["goals"] += verdict == "goal"
        side["saved"] += verdict == "saved"
    for g in logged:
        if not g["seen"]:
            side = c[g["team"]]
            side["shots"] += 1
            side["on"] += 1
            side["goals"] += 1
            side["notes"].append(f"{g['h']}H {g['clock']} goal the model didn't flag; added from the log")
    return c


def apply(slug):
    """Writes the reviewed shots into the game's match report, replacing any earlier version of the table."""
    c = counts(slug)
    if c is None:
        print(f"  {slug}: review isn't finished")
        return
    path = DATA / "games" / f"{slug}.json"
    g = json.loads(path.read_text(encoding="utf8"))
    n = g["report"]["numbers"]
    n["tables"] = [t for t in n["tables"] if (t.get("title") or {}).get("en") != TABLE["en"]]
    n["tables"].append({"title": TABLE, "rows": [
        {"label": {"en": "Shots", "es": "Tiros"}, "us": c[US]["shots"], "them": c[THEM]["shots"]},
        {"label": {"en": "Shots on target", "es": "Tiros a puerta"}, "us": c[US]["on"], "them": c[THEM]["on"]},
        # Our keeper's saves are the opponent's shots on target that didn't go in, and the other way round.
        {"label": {"en": "Saves", "es": "Paradas"}, "us": c[THEM]["saved"], "them": c[US]["saved"]},
    ]})
    path.write_text(json.dumps(g, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    sc = g["score"]
    check = "" if (c[US]["goals"], c[THEM]["goals"]) == (sc["us"], sc["them"]) else (
        f"  (goals marked {c[US]['goals']}-{c[THEM]['goals']} but the score is {sc['us']}-{sc['them']}: the model missed some)")
    print(f"  {slug}: shots {c[US]['shots']}-{c[THEM]['shots']}, on target {c[US]['on']}-{c[THEM]['on']}, "
          f"saves {c[THEM]['saved']}-{c[US]['saved']}" + check, flush=True)
    for note in c[US]["notes"] + c[THEM]["notes"]:
        print(f"    {note}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["find", "review", "apply"])
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--half", type=int, choices=[1, 2])
    ap.add_argument("--sheets", action="store_true")
    ap.add_argument("--rescan", action="store_true", help="scan again rather than reuse the saved near-goal moments")
    a = ap.parse_args()
    slugs = a.slugs or [p.parent.name[:-3] for p in sorted((DATA / "raw").glob("*-cv/teams.pkl"))]
    if a.step == "find":
        for slug in slugs:
            find(slug, a.half, a.sheets, a.rescan)
    elif a.step == "review":
        review(slugs)
    else:
        for slug in slugs:
            apply(slug)


if __name__ == "__main__":
    main()
