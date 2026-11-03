"""Ball labelling screen: shows still frames from every tape on this PC, one at a time, and you click the
ball. The clicks train a ball detector for our own footage (cv_pilot.py's stock model can't find it).

    private/film/.venv/Scripts/python tools/film/cv_label.py [--count 400]

The full frame is on the left; the right side is a 4x zoom of wherever the mouse is. Click the ball on
either side. The model's guesses are drawn as numbered circles, so if one is right press its number.
    1-5  that guess is the ball       N  no ball in the frame (hidden, out of shot)
    X    skip this frame (not play)    U  undo the last frame       Q / Esc  save and quit
Every answer is saved at once, so stopping and starting again carries on where it left off.

Writes data/cv/ball/labels.json and the labelled frames as data/cv/ball/images/<slug>_<sec>.jpg.
"""
import argparse, json, random, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from cv_pilot import DATA, ball_candidates, mmss, secs  # noqa: E402

OUT = DATA / "cv" / "ball"
MODELS = DATA.parent / "models"
ZOOM, ZW, ZH = 4, 1440, 1080
KEYS = "1 - 5 pick a guess   click = the ball   N no ball   X skip (not play)   U undo   Q quit"


def plan(count, seed=7):
    """Random in-play moments spread evenly over every game whose tape is on this PC."""
    games = []
    for p in sorted((DATA / "games").glob("*.json")):
        g = json.loads(p.read_text(encoding="utf8"))
        src = Path(g.get("highlights", {}).get("source", ""))
        if src.is_file() and g.get("video", {}).get("kickoff"):
            games.append((p.stem, src, g["video"]))
    rng = random.Random(seed)
    per = -(-count // max(len(games), 1))
    todo = []
    for slug, src, v in games:
        for k in range(per):
            h = "1" if k % 2 == 0 else "2"
            t = v["kickoff"][h] + rng.uniform(20, secs(v["halfLength"][h]) - 20)
            todo.append({"slug": slug, "src": str(src), "t": round(t, 1), "half": int(h),
                         "clock": mmss(t - v["kickoff"][h])})
    rng.shuffle(todo)
    return todo[:count]


def load(item, model):
    cap = cv2.VideoCapture(item["src"])
    cap.set(cv2.CAP_PROP_POS_MSEC, item["t"] * 1000)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        return item, None, [], 14
    people = model.predict(frame, imgsz=1920, classes=[0], conf=0.4, verbose=False, half=True)[0].boxes.xyxy.cpu().numpy()
    guesses = sorted(ball_candidates(model, frame), reverse=True)[:5]
    return item, frame, guesses, people


def size_at(people, x, y):
    """Ball box size from the nearest players' height: a ball is about a seventh of a player's height."""
    if len(people) == 0:
        return 14
    d = np.hypot((people[:, 0] + people[:, 2]) / 2 - x, people[:, 3] - y)
    near = people[np.argsort(d)[:3]]
    return float(np.clip(np.median(near[:, 3] - near[:, 1]) / 7, 6, 40))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=400)
    a = ap.parse_args()
    from ultralytics import YOLO

    (OUT / "images").mkdir(parents=True, exist_ok=True)
    path = OUT / "labels.json"
    labels = json.loads(path.read_text(encoding="utf8")) if path.exists() else []
    done = {(l["slug"], l["t"]) for l in labels}
    todo = [i for i in plan(a.count) if (i["slug"], i["t"]) not in done]
    if not todo:
        print(f"All {len(labels)} frames are labelled.")
        return
    model = YOLO(str(MODELS / "yolo11x.pt"))
    pool = ThreadPoolExecutor(1)
    nxt = pool.submit(load, todo[0], model)

    def save():
        path.write_text(json.dumps(labels, indent=1), encoding="utf8")

    state = {"mouse": (960, 540), "click": None}

    def on_mouse(ev, x, y, *_):
        if x < 1920 and y < 1080:
            fx, fy = x, y
            if ev == cv2.EVENT_MOUSEMOVE:
                state["mouse"] = (x, y)
        elif x >= 1920 + 40 and y < ZH:  # inside the zoom: map back to the frame
            cx, cy = state["mouse"]
            fx = cx - ZW / ZOOM / 2 + (x - 1960) / ZOOM
            fy = cy - ZH / ZOOM / 2 + y / ZOOM
        else:
            return
        if ev == cv2.EVENT_LBUTTONDOWN:
            state["click"] = (float(fx), float(fy))

    win = "Ball labelling"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, 1960 + ZW, ZH + 60)
    cv2.setMouseCallback(win, on_mouse)
    k = 0
    while k < len(todo):
        item, frame, guesses, people = nxt.result()
        if k + 1 < len(todo):
            nxt = pool.submit(load, todo[k + 1], model)
        if frame is None:
            k += 1
            continue
        answer = None
        state["click"] = None
        while answer is None:
            canvas = np.zeros((ZH + 60, 1960 + ZW, 3), np.uint8)
            view = frame.copy()
            for n, (c, gx, gy) in enumerate(guesses, 1):
                cv2.circle(view, (int(gx), int(gy)), 16, (0, 255, 255), 2)
                cv2.putText(view, str(n), (int(gx) + 16, int(gy) - 12), 0, 0.8, (0, 255, 255), 2)
            canvas[:1080, :1920] = view
            cx, cy = state["mouse"]
            x0 = int(np.clip(cx - ZW / ZOOM / 2, 0, 1920 - ZW / ZOOM))
            y0 = int(np.clip(cy - ZH / ZOOM / 2, 0, 1080 - ZH / ZOOM))
            if (x0, y0) != (cx - ZW / ZOOM / 2, cy - ZH / ZOOM / 2):
                state["mouse"] = (x0 + ZW / ZOOM / 2, y0 + ZH / ZOOM / 2)
            canvas[:ZH, 1960:] = cv2.resize(view[y0:y0 + ZH // ZOOM, x0:x0 + ZW // ZOOM], (ZW, ZH),
                                            interpolation=cv2.INTER_NEAREST)
            cv2.rectangle(canvas, (x0, y0), (x0 + ZW // ZOOM, y0 + ZH // ZOOM), (255, 255, 255), 1)
            head = f"{len(labels) + 1}/{len(labels) + len(todo) - k}   {item['slug']}  {item['half']}H {item['clock']}"
            cv2.putText(canvas, head + "      " + KEYS, (12, ZH + 40), 0, 0.9, (255, 255, 255), 2)
            cv2.imshow(win, canvas)
            key = cv2.waitKey(30) & 0xFF
            if cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:
                key = ord("q")
            if state["click"]:
                answer = ("ball", state["click"])
            elif ord("1") <= key <= ord("5") and key - ord("1") < len(guesses):
                answer = ("ball", guesses[key - ord("1")][1:])
            elif key in (ord("n"), ord("N")):
                answer = ("none", None)
            elif key in (ord("x"), ord("X")):
                answer = ("skip", None)
            elif key in (ord("u"), ord("U")) and labels:
                last = labels.pop()
                save()
                todo.insert(k, {kk: last[kk] for kk in ("slug", "src", "t", "half", "clock")})
                nxt.cancel()
                nxt = pool.submit(load, todo[k], model)
                answer = ("undo", None)
            elif key in (ord("q"), 27):
                save()
                cv2.destroyAllWindows()
                print(f"Saved {len(labels)} frames to {path}")
                pool.shutdown(cancel_futures=True)
                return
        kind, at = answer
        if kind == "undo":
            continue
        rec = {**item, "kind": kind}
        if kind != "skip":
            img = f"{item['slug']}_{item['t']:.1f}.jpg"
            cv2.imwrite(str(OUT / "images" / img), frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            rec["image"] = img
        if kind == "ball":
            rec["ball"] = [round(at[0], 1), round(at[1], 1), round(size_at(people, *at), 1)]
        labels.append(rec)
        save()
        k += 1
    cv2.destroyAllWindows()
    print(f"Done: {len(labels)} frames in {path}")


if __name__ == "__main__":
    main()
