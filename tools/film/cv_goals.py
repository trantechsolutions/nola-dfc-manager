"""Goal labelling screen: goes back over the frames already labelled for the ball (cv_label.py) and you box
each goal you can see. The boxes teach the detector to find the goals, which shots and saves are judged
against.

    private/film/.venv/Scripts/python tools/film/cv_goals.py

The full frame is on the left; the right side is a 4x zoom of wherever the mouse is. Box a goal with two
clicks, on either side: the top of one post, then the bottom of the other (the corners of the goal frame,
net included). Box every goal in the frame, even one far away or partly hidden; skip only one you can't
make out at all.
    Enter / Space  done with this frame (no goal is fine)    U  undo the last box (or go back a frame)
    Q / Esc  save and quit
Every frame is saved as you finish it, so stopping and starting again carries on where it left off.

Writes data/cv/ball/goals.json: {image: [[x1, y1, x2, y2], ...]}. cv_train.py adds the boxes as class 2
once every labelled frame has been through here.
"""
import json, sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from cv_pilot import DATA  # noqa: E402

OUT = DATA / "cv" / "ball"
ZOOM, ZW, ZH = 4, 1440, 1080
KEYS = "click two corners = a goal   Enter/Space next frame   U undo   Q quit"


def main():
    labels = [l for l in json.loads((OUT / "labels.json").read_text(encoding="utf8")) if l.get("image")]
    path = OUT / "goals.json"
    goals = json.loads(path.read_text(encoding="utf8")) if path.exists() else {}
    todo = [l["image"] for l in labels if l["image"] not in goals]
    if not todo:
        print(f"All {len(goals)} frames have their goals boxed.")
        return

    def save():
        path.write_text(json.dumps(goals, indent=1), encoding="utf8")

    state = {"mouse": (960, 540), "click": None}

    def on_mouse(ev, x, y, *_):
        if x < 1920 and y < 1080:
            fx, fy = x, y
            if ev == cv2.EVENT_MOUSEMOVE:
                state["mouse"] = (x, y)
        elif x >= 1960 and y < ZH:  # inside the zoom: map back to the frame
            cx, cy = state["mouse"]
            fx = cx - ZW / ZOOM / 2 + (x - 1960) / ZOOM
            fy = cy - ZH / ZOOM / 2 + y / ZOOM
        else:
            return
        if ev == cv2.EVENT_LBUTTONDOWN:
            state["click"] = (float(fx), float(fy))

    win = "Goal labelling"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, 1960 + ZW, ZH + 60)
    cv2.setMouseCallback(win, on_mouse)
    k, history = 0, []  # history: images finished this session, for undo across frames
    while k < len(todo):
        img = todo[k]
        frame = cv2.imread(str(OUT / "images" / img))
        if frame is None:
            k += 1
            continue
        boxes, corner = [], None
        while True:
            view = frame.copy()
            for x1, y1, x2, y2 in boxes:
                cv2.rectangle(view, (int(x1), int(y1)), (int(x2), int(y2)), (0, 0, 255), 2)
            if corner:
                cv2.drawMarker(view, (int(corner[0]), int(corner[1])), (0, 255, 255), cv2.MARKER_CROSS, 24, 2)
            canvas = np.zeros((ZH + 60, 1960 + ZW, 3), np.uint8)
            canvas[:1080, :1920] = view
            cx, cy = state["mouse"]
            x0 = int(np.clip(cx - ZW / ZOOM / 2, 0, 1920 - ZW / ZOOM))
            y0 = int(np.clip(cy - ZH / ZOOM / 2, 0, 1080 - ZH / ZOOM))
            if (x0, y0) != (cx - ZW / ZOOM / 2, cy - ZH / ZOOM / 2):
                state["mouse"] = (x0 + ZW / ZOOM / 2, y0 + ZH / ZOOM / 2)
            canvas[:ZH, 1960:] = cv2.resize(view[y0:y0 + ZH // ZOOM, x0:x0 + ZW // ZOOM], (ZW, ZH),
                                            interpolation=cv2.INTER_NEAREST)
            cv2.rectangle(canvas, (x0, y0), (x0 + ZW // ZOOM, y0 + ZH // ZOOM), (255, 255, 255), 1)
            head = f"{len(goals) + 1}/{len(goals) + len(todo) - k}   {img}   {len(boxes)} goal(s)"
            cv2.putText(canvas, head + "      " + KEYS, (12, ZH + 40), 0, 0.9, (255, 255, 255), 2)
            cv2.imshow(win, canvas)
            key = cv2.waitKey(30) & 0xFF
            if cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:
                key = ord("q")
            if state["click"]:
                p, state["click"] = state["click"], None
                if corner is None:
                    corner = p
                else:
                    (ax, ay), (bx, by) = corner, p
                    if abs(ax - bx) > 3 and abs(ay - by) > 3:
                        boxes.append([round(min(ax, bx), 1), round(min(ay, by), 1), round(max(ax, bx), 1), round(max(ay, by), 1)])
                    corner = None
            elif key in (13, 10, 32):
                goals[img] = boxes
                save()
                history.append(img)
                k += 1
                break
            elif key in (ord("u"), ord("U")):
                if corner:
                    corner = None
                elif boxes:
                    boxes.pop()
                elif history:  # back to the previous frame, its boxes cleared
                    prev = history.pop()
                    goals.pop(prev, None)
                    save()
                    todo.insert(k, prev)
                    break
            elif key in (ord("q"), 27):
                save()
                cv2.destroyAllWindows()
                print(f"Saved {len(goals)} frames to {path}")
                return
    cv2.destroyAllWindows()
    print(f"Done: {len(goals)} frames in {path}")


if __name__ == "__main__":
    main()
