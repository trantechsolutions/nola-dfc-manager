"""Local computer-vision pilot: follows the players and the ball on a stretch of tape with a stock
detector on the GPU, and works out rough team numbers (possession, passes, turnovers) from that.
Nothing leaves the PC. Runs in the private env (private/film/.venv):

    private/film/.venv/Scripts/python tools/film/cv_pilot.py <slug> [--half 1] [--from 0:00] [--len 5:00]
        options: --model ball.pt (ours, from cv_train.py; yolo11x.pt is the stock one)  --imgsz 1920  --stride 5 (every 5th frame)  --no-video

The stretch is measured from that half's kick-off (video.kickoff in the game file). Players are split
into teams by the look-alike split from cv_teams.py when it has been run for the game, else by shirt
colour (DFC light blue, the opponent red); anything else (referee, keepers, spectators) is left out. No player is named; who was on the field comes from lineups.json later.

Writes to data/raw/<slug>-cv/: <half>H_<from>.mp4 (what the model saw, boxes coloured by team) and
<half>H_<from>.json (per-frame track, detection rates and the totals).
"""
import argparse, json, subprocess, sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "private" / "film" / "data"
MODELS = ROOT / "private" / "film" / "models"
US, THEM, OTHER = 0, 1, 2
NAMES = {US: "DFC", THEM: "OPP", OTHER: "other"}
DRAW = {US: (230, 200, 90), THEM: (40, 40, 230), OTHER: (160, 160, 160)}


def load_game(slug):
    """The game file, or before it's written the tape's timing from npm run film -- postgame
    (data/raw/<slug>-cv/tape.json: highlights.source and video.kickoff/halfLength, nothing else)."""
    for f in (DATA / "games" / f"{slug}.json", DATA / "raw" / f"{slug}-cv" / "tape.json"):
        if f.exists():
            return json.loads(f.read_text(encoding="utf8"))
    sys.exit(f"No game file or tape for {slug}")


def secs(t):
    s = 0.0
    for p in str(t).split(":"):
        s = s * 60 + float(p)
    return s


def mmss(s):
    s = int(round(s))
    return f"{s // 60}:{s % 60:02d}"


def shirt(frame, box):
    """Team from the shirt: the upper body's non-grass pixels, light blue vs red by hue. Fixed ranges, so it
    fails when evening sun turns light blue to off-white; a split learnt per game is the next step."""
    x1, y1, x2, y2 = box.astype(int)
    h, w = y2 - y1, x2 - x1
    crop = frame[max(y1 + int(h * 0.15), 0):y1 + int(h * 0.5), max(x1 + int(w * 0.2), 0):x2 - int(w * 0.2)]
    if crop.size < 12:
        return OTHER
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV).reshape(-1, 3).astype(int)
    hue, sat, val = hsv[:, 0], hsv[:, 1], hsv[:, 2]
    grass = (hue >= 30) & (hue <= 80) & (sat > 40)
    cloth = ~grass & (val > 60)
    if cloth.sum() < 6:
        return OTHER
    hue, sat = hue[cloth], sat[cloth]
    red = (((hue <= 10) | (hue >= 165)) & (sat > 80)).mean()
    blue = ((hue >= 80) & (hue <= 120) & (sat > 35)).mean()  # 108-120: light blue in shade
    if red > 0.15 and red > blue * 1.5:
        return THEM
    if blue > 0.15 and blue > red * 1.5:
        return US
    return OTHER


def vote(v):
    """A track's team from its frames' shirt calls: a player is often too small or blurred to call, so the
    calls that were made count, as long as there are enough of them."""
    us, them, other = v
    return OTHER if us + them < 0.3 * (us + them + other) else (US if us >= them else THEM)


def ball_candidates(model, frame):
    """The ball is a few pixels across, so the frame below the skyline is also scanned in tiles at 2x."""
    H, W = frame.shape[:2]
    top = int(H * 0.35)
    spots = [(x, y) for y in range(top, H - 319, 300) for x in list(range(0, W - 639, 427))[:4] + [W - 640]]
    tiles = [frame[y:y + 480, x:x + 640] for x, y in spots]
    out = []
    for (x, y), r in zip(spots, model.predict(tiles, imgsz=1280, classes=[32], conf=0.1, verbose=False, half=True)):
        for c, bb in zip(r.boxes.conf.cpu().numpy(), r.boxes.xyxy.cpu().numpy()):
            if bb[2] - bb[0] < 40:  # a tyre or a bag is bigger than the ball
                out.append((float(c), x + float(bb[0] + bb[2]) / 2, y + float(bb[1] + bb[3]) / 2))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--half", type=int, default=1)
    ap.add_argument("--from", dest="start", default="0:00")
    ap.add_argument("--len", default="5:00")
    ap.add_argument("--model", default="ball.pt")
    ap.add_argument("--imgsz", type=int, default=1920)
    ap.add_argument("--stride", type=int, default=5)
    ap.add_argument("--no-video", action="store_true")
    ap.add_argument("--colour", action="store_true", help="split teams by the shirt-colour rule even if cv_teams.py has run")
    a = ap.parse_args()

    from ultralytics import YOLO
    from ultralytics.trackers.byte_tracker import BYTETracker
    from ultralytics.utils import IterableSimpleNamespace, YAML
    from ultralytics.utils.checks import check_yaml

    game = load_game(a.slug)
    video = Path(game["highlights"]["source"])
    if not video.exists():
        sys.exit(f"The tape isn't on this PC: {video}")
    t0 = game["video"]["kickoff"][str(a.half)] + secs(a.start)
    dur = secs(a.len)
    out = DATA / "raw" / f"{a.slug}-cv"
    out.mkdir(parents=True, exist_ok=True)
    tag = f"{a.half}H_{a.start.replace(':', '-')}"

    model = YOLO(str(MODELS / a.model) if (MODELS / a.model).exists() else a.model)
    names = {v: k for k, v in model.names.items()}
    ours = "ball" in names  # trained by cv_train.py: 0 player, 1 ball; else the stock COCO classes
    PERSON, BALL = (names["player"], names["ball"]) if ours else (names["person"], names["sports ball"])
    tracker = BYTETracker(IterableSimpleNamespace(**{**YAML.load(check_yaml("bytetrack.yaml")), "track_buffer": 50 // a.stride}))
    cap = cv2.VideoCapture(str(video))  # read straight from the tape: a copy of a half is over a gigabyte
    cap.set(cv2.CAP_PROP_POS_MSEC, t0 * 1000)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer = None if a.no_video else cv2.VideoWriter(str(out / f"{tag}_raw.mp4"), cv2.VideoWriter_fourcc(*"mp4v"),
                                                     fps / a.stride, (W, H))
    teams = {}  # track id -> team votes
    split = None
    if not a.colour and (out / "teams.pkl").exists():  # the look-alike split learnt by cv_teams.py
        from cv_teams import Teams
        split = Teams(out / "teams.pkl")
    last_ball = None
    spots = []  # [x, y, first seen, last seen] for candidates that haven't moved
    frames, i = [], -1
    while True:
        ok, frame = cap.read()
        if not ok or (i + 1) / fps >= dur:
            break
        i += 1
        if i % a.stride:
            continue
        t = i / fps
        r = model.predict(frame, imgsz=a.imgsz, classes=[PERSON] + ([BALL] if ours else []), conf=0.1,
                          verbose=False, half=True)[0]
        b = r.boxes.cpu().numpy()
        tracked = tracker.update(b[b.cls == PERSON], frame)  # rows: x1 y1 x2 y2 id score cls idx
        ppl = []
        calls = split.classify(frame, [row[:4] for row in tracked]) if split else [shirt(frame, row[:4]) for row in tracked]
        for row, call in zip(tracked, calls):
            box, tid = row[:4], row[4]
            teams.setdefault(int(tid), [0, 0, 0])[call] += 1
            ppl.append([int(tid), *[round(float(x), 1) for x in box]])
        # The ball: near a player on either team, and close to where it was a moment ago if it was seen.
        players = [p for p in ppl if vote(teams[p[0]]) != OTHER]
        ball, best = None, 0.0
        if ours:  # our own model sees the ball in the one full-frame pass
            cands = [(float(c), float(x1 + x2) / 2, float(y1 + y2) / 2)
                     for c, (x1, y1, x2, y2) in zip(b.conf[b.cls == BALL], b.xyxy[b.cls == BALL])]
        else:
            cands = ball_candidates(model, frame)
        # A spare ball in a net, or a bag, sits still on screen with nobody near it: a spot that has held a
        # candidate for 2 seconds is ignored until it has been empty for 3.
        spots = [s for s in spots if t - s[3] < 3]
        for c, bx, by in cands:
            near = min((np.hypot((x1 + x2) / 2 - bx, y2 - by) / (y2 - y1) for _, x1, y1, x2, y2, *_ in players), default=99)
            spot = next((s for s in spots if np.hypot(s[0] - bx, s[1] - by) < 10), None)
            if spot is None:
                spots.append(spot := [bx, by, t, t])
            spot[3] = t
            if near > 5 or (near > 1.5 and t - spot[2] >= 2):
                continue
            score = c
            if last_ball and t - last_ball[0] < 1:
                score -= min(np.hypot(bx - last_ball[1], by - last_ball[2]) / 600, 0.5)
            if score > best:
                ball, best = [round(bx, 1), round(by, 1), round(c, 3)], score
        if ball:
            last_ball = (t, ball[0], ball[1])
        frames.append({"t": round(t, 2), "ball": ball, "people": ppl})
        if writer:
            for tid, *box in ppl:
                box = box[:4]
                team = vote(teams[tid])
                x1, y1, x2, y2 = map(int, box)
                cv2.rectangle(frame, (x1, y1), (x2, y2), DRAW[team], 2)
                cv2.putText(frame, str(tid), (x1, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, DRAW[team], 1)
            if ball:
                cv2.circle(frame, (int(ball[0]), int(ball[1])), 14, (0, 255, 255), 3)
            cv2.putText(frame, mmss(secs(a.start) + t), (30, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (255, 255, 255), 3)
            writer.write(frame)
        if len(frames) % 250 == 0:
            print(f"  {mmss(t)} / {mmss(dur)}", flush=True)
    cap.release()
    if writer:
        writer.release()

    team_of = {tid: vote(v) for tid, v in teams.items()}
    summary = analyse(frames, team_of, a.stride / fps)
    (out / f"{tag}.json").write_text(json.dumps({"slug": a.slug, "half": a.half, "from": a.start, "len": a.len,
                                                "model": a.model, "imgsz": a.imgsz, "stride": a.stride,
                                                "summary": summary, "teams": team_of, "frames": frames}),
                                     encoding="utf8")
    if writer:  # re-encode so the browser and phone can play it
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(out / f"{tag}_raw.mp4"),
                        "-c:v", "libx264", "-crf", "23", "-preset", "fast", str(out / f"{tag}.mp4")], check=True)
        (out / f"{tag}_raw.mp4").unlink()
    print(json.dumps(summary, indent=1))
    print(f"Wrote {out / tag}.json" + ("" if a.no_video else " and .mp4"))


def analyse(frames, team_of, dt):
    """Possession from the nearest player to the ball, then passes and turnovers from who holds it next."""
    n = len(frames)
    seen = [f["ball"] is not None for f in frames]
    # Fill ball gaps of up to a second by straight line, so a short miss doesn't end a possession.
    pos = [f["ball"][:2] if f["ball"] else None for f in frames]
    gap = int(1 / dt)
    last = None
    for k in range(n):
        if pos[k] is None:
            continue
        if last is not None and 1 < k - last <= gap:
            for j in range(last + 1, k):
                w = (j - last) / (k - last)
                pos[j] = [pos[last][0] * (1 - w) + pos[k][0] * w, pos[last][1] * (1 - w) + pos[k][1] * w]
        last = k
    owner = []  # (team, track id) of the player on the ball, or None
    for f, b in zip(frames, pos):
        best = None
        if b is not None:
            for tid, x1, y1, x2, y2, *_ in f["people"]:
                team = team_of.get(tid, OTHER)
                if team == OTHER:
                    continue
                d = np.hypot((x1 + x2) / 2 - b[0], y2 - b[1])
                if d < (y2 - y1) * 0.9 and (best is None or d < best[0]):
                    best = (d, team, tid)
        owner.append(best[1:] if best else None)
    # A touch counts once someone holds the ball for a third of a second; flickers are dropped.
    held, run, need = [], 0, max(1, round(0.33 / dt))
    for k, o in enumerate(owner):
        run = run + 1 if o and k and owner[k - 1] == o else (1 if o else 0)
        held.append(o if run >= need else None)
    time = {US: 0.0, THEM: 0.0}
    passes = {US: 0, THEM: 0}
    lost = {US: 0, THEM: 0}
    chains = {US: [], THEM: []}
    cur, chain, team_now = None, 0, None
    for o in held:
        if o is None:
            continue
        team, tid = o
        if team_now is not None:
            time[team_now] += dt
        if cur is None:
            cur, chain, team_now = o, 0, team
            continue
        if o == cur:
            continue
        if team == cur[0]:
            passes[team] += 1
            chain += 1
        else:
            lost[cur[0]] += 1
            chains[cur[0]].append(chain)
            chain = 0
        cur, team_now = o, team
    total = time[US] + time[THEM] or 1
    kinds = [team_of.get(tid, OTHER) for f in frames for tid, *_ in f["people"]]
    return {
        "frames": n,
        "ballSeen": round(sum(seen) / max(n, 1), 3),
        "ballHeld": round(sum(1 for o in held if o) / max(n, 1), 3),
        "playersPerFrame": {NAMES[k]: round(kinds.count(k) / max(n, 1), 1) for k in (US, THEM, OTHER)},
        "tracks": {NAMES[k]: sum(1 for v in team_of.values() if v == k) for k in (US, THEM, OTHER)},
        "possession": {NAMES[k]: round(time[k] / total, 3) for k in (US, THEM)},
        "passes": {NAMES[k]: passes[k] for k in (US, THEM)},
        "turnovers": {NAMES[k]: lost[k] for k in (US, THEM)},
        "avgPassChain": {NAMES[k]: round(float(np.mean(chains[k])), 1) if chains[k] else None for k in (US, THEM)},
    }


if __name__ == "__main__":
    main()
