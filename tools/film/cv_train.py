"""Trains our own player-and-ball detector from the frames labelled in cv_label.py.

    private/film/.venv/Scripts/python tools/film/cv_train.py [--epochs 100] [--base yolo11s.pt] [--batch 2]

The ball boxes are the clicks; the player boxes on the same frames come from the stock model (yolo11x),
which already finds players well. Classes: 0 player, 1 ball. Frames are split 85/15 into train and
check sets by a fixed shuffle, so reruns compare like with like.

Writes the label files next to data/cv/ball/images/, then trains into models/runs/<name>/; the finished
model is models/runs/<name>/weights/best.pt. Training prints the ball's precision and recall on the
check set after every pass.
"""
import argparse, json, random, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from cv_pilot import DATA  # noqa: E402

BALL = DATA / "cv" / "ball"
MODELS = DATA.parent / "models"


def build():
    from ultralytics import YOLO

    labels = [l for l in json.loads((BALL / "labels.json").read_text(encoding="utf8")) if l["kind"] != "skip"]
    (BALL / "labels").mkdir(exist_ok=True)
    stock = YOLO(str(MODELS / "yolo11x.pt"))
    for n, l in enumerate(labels, 1):
        img = BALL / "images" / l["image"]
        r = stock.predict(str(img), imgsz=1920, classes=[0], conf=0.4, verbose=False, half=True)[0]
        H, W = r.orig_shape
        rows = [f"0 {x:.6f} {y:.6f} {w:.6f} {h:.6f}" for x, y, w, h in r.boxes.xywhn.cpu().numpy()]
        if l["kind"] == "ball":
            bx, by, s = l["ball"]
            rows.append(f"1 {bx / W:.6f} {by / H:.6f} {s / W:.6f} {s / H:.6f}")
        (BALL / "labels" / img.with_suffix(".txt").name).write_text("\n".join(rows) + "\n", encoding="utf8")
        if n % 50 == 0:
            print(f"  labelled {n}/{len(labels)}", flush=True)
    imgs = sorted(str((BALL / "images" / l["image"]).resolve()) for l in labels)
    random.Random(11).shuffle(imgs)
    cut = int(len(imgs) * 0.85)
    (BALL / "train.txt").write_text("\n".join(imgs[:cut]) + "\n", encoding="utf8")
    (BALL / "val.txt").write_text("\n".join(imgs[cut:]) + "\n", encoding="utf8")
    (BALL / "data.yaml").write_text(f"path: {BALL.resolve().as_posix()}\ntrain: train.txt\nval: val.txt\n"
                                    "names:\n  0: player\n  1: ball\n", encoding="utf8")
    print(f"{cut} frames to train on, {len(imgs) - cut} to check against")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=100)
    ap.add_argument("--base", default="yolo11s.pt")
    ap.add_argument("--batch", type=int, default=2)
    ap.add_argument("--imgsz", type=int, default=1920)
    ap.add_argument("--name", default="ball")
    ap.add_argument("--skip-build", action="store_true")
    a = ap.parse_args()
    from ultralytics import YOLO

    if not a.skip_build:
        build()
    base = MODELS / a.base
    model = YOLO(str(base) if base.exists() else a.base)

    # Training at full size leans on Windows' swap file; stop cleanly before the disk fills.
    def guard(trainer):
        free = shutil.disk_usage(MODELS).free
        if free < 2 * 1024 ** 3:
            sys.exit(f"Stopped: only {free / 1024 ** 3:.1f} GB left on the disk. Free some space and rerun with --skip-build.")

    model.add_callback("on_train_batch_end", guard)
    model.train(data=str(BALL / "data.yaml"), epochs=a.epochs, imgsz=a.imgsz, batch=a.batch, rect=False,
                patience=30, workers=0, project=str(MODELS / "runs"), name=a.name, exist_ok=True,
                mosaic=1.0, close_mosaic=15, fliplr=0.5, scale=0.3, degrees=0, plots=False, verbose=False)


if __name__ == "__main__":
    main()
