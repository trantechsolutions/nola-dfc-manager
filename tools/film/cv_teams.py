"""Splits a game's players into teams by how they look, learnt from that game's own tape, so it copes with
any kits and with evening sun turning light blue to off-white (the colour rule in cv_pilot.shirt can't).

    private/film/.venv/Scripts/python tools/film/cv_teams.py prepare <slug>... [--every 4] [--groups 10]
    private/film/.venv/Scripts/python tools/film/cv_teams.py confirm <slug>...

prepare (unattended, ~4 min a game): player cut-outs every --every seconds through both halves are
described by an image model (SigLIP, private/film/models/hf) and sorted into --groups look-alike groups. Each
group gets a first guess from the colour rule (light blue = DFC, red = opponent; a group needs calls on 30% of
its cut-outs, which referees and keepers don't get). Saved to data/raw/<slug>-cv/looks.npz.

confirm (the coach, ~10 s a game): a screen per game with a row of sample cut-outs per group; mark each row
DFC, opponent or neither (any kit works, including white). A small classifier is then trained on the
confirmed groups and saved as teams.pkl (cv_pilot.py uses it for every player it sees), with teams.jpg to
check by eye.
"""
import argparse, json, pickle, sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from cv_pilot import DATA, DRAW, MODELS, NAMES, OTHER, THEM, US, shirt  # noqa: E402

SIGLIP = "google/siglip-base-patch16-224"


class Looks:
    """Image-model descriptions of player cut-outs, on the GPU."""

    def __init__(self):
        import torch
        from transformers import SiglipVisionModel
        self.torch = torch
        self.model = SiglipVisionModel.from_pretrained(SIGLIP, cache_dir=str(MODELS / "hf")).half().cuda().eval()

    def __call__(self, frame, boxes):
        if len(boxes) == 0:
            return np.zeros((0, 768), np.float32)
        crops = []
        for x1, y1, x2, y2 in np.asarray(boxes, float).astype(int):
            c = frame[max(y1, 0):max(y2, y1 + 1), max(x1, 0):max(x2, x1 + 1)]
            crops.append(cv2.resize(c, (224, 224))[:, :, ::-1])
        x = self.torch.from_numpy(np.stack(crops)).cuda().permute(0, 3, 1, 2).half() / 255
        x = (x - 0.5) / 0.5
        with self.torch.no_grad():
            out = self.model(pixel_values=x).pooler_output.float()
        out = out / out.norm(dim=1, keepdim=True)
        return out.cpu().numpy()


class Teams:
    """The trained split: classify(frame, boxes) gives US, THEM or OTHER for each box."""

    def __init__(self, path):
        self.clf = pickle.loads(Path(path).read_bytes())
        self.looks = Looks()

    def classify(self, frame, boxes):
        if len(boxes) == 0:
            return []
        return [int(x) for x in self.clf.predict(self.looks(frame, boxes))]


def prepare(slug, every=4, groups=10, model="ball.pt"):
    """Cut-outs every `every` seconds through both halves, described and sorted into `groups` look-alike groups,
    with a first guess at each group's team from the colour rule. Saved to looks.npz for confirm()."""
    from sklearn.cluster import KMeans
    from ultralytics import YOLO
    import umap

    game = json.loads((DATA / "games" / f"{slug}.json").read_text(encoding="utf8"))
    cap = cv2.VideoCapture(game["highlights"]["source"])
    det = YOLO(str(MODELS / model))
    person = {v: k for k, v in det.names.items()}.get("player", 0)
    looks = Looks()
    feats, calls, crops = [], [], []
    for h in ("1", "2"):
        start, length = game["video"]["kickoff"][h], game["video"]["halfLength"][h]
        end = start + sum(float(p) * 60 ** i for i, p in enumerate(reversed(length.split(":"))))
        for t in np.arange(start + 2, end, every):
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            if not ok:
                continue
            boxes = det.predict(frame, imgsz=1920, classes=[person], conf=0.4, verbose=False, half=True)[0].boxes.xyxy.cpu().numpy()
            boxes = boxes[(boxes[:, 3] - boxes[:, 1]) > 40]  # too small to tell apart
            if not len(boxes):
                continue
            feats.append(looks(frame, boxes))
            for b in boxes:
                calls.append(shirt(frame, b))
                x1, y1, x2, y2 = b.astype(int)
                crops.append(cv2.resize(frame[y1:y2, x1:x2], (48, 96)))
        print(f"  {slug} half {h}: {len(calls)} cut-outs so far", flush=True)
    X, calls = np.concatenate(feats), np.array(calls)
    emb = umap.UMAP(n_components=8, n_neighbors=30, min_dist=0.0, random_state=0).fit_transform(X)
    group = KMeans(groups, n_init=10, random_state=0).fit_predict(emb)
    guess, samples = [], []
    rng = np.random.default_rng(0)
    for g in range(groups):
        m = group == g
        us, them = (calls[m] == US).sum(), (calls[m] == THEM).sum()
        # Light blue vs red only; any other kit is left for the coach to mark. Referees and keepers get few calls.
        guess.append(US if us + them >= 0.3 * m.sum() and us >= 2 * them else
                     THEM if us + them >= 0.3 * m.sum() and them >= 2 * us else OTHER)
        idx = rng.choice(np.where(m)[0], size=min(24, m.sum()), replace=False)
        samples.append(np.stack([crops[i] for i in idx] + [np.zeros((96, 48, 3), np.uint8)] * (24 - len(idx))))
    out = DATA / "raw" / f"{slug}-cv"
    out.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out / "looks.npz", X=X.astype(np.float16), group=group, guess=np.array(guess),
                        samples=np.stack(samples), sizes=np.bincount(group, minlength=groups))
    print(f"  {slug}: {len(X)} cut-outs in {groups} groups, guess " + " ".join(NAMES[g] for g in guess), flush=True)


def finish(slug, team_of_group):
    """Trains the split from the confirmed groups and writes teams.pkl and teams.jpg."""
    from sklearn.linear_model import LogisticRegression

    out = DATA / "raw" / f"{slug}-cv"
    saved = np.load(out / "looks.npz")
    y = np.array([team_of_group[g] for g in saved["group"]])
    clf = LogisticRegression(max_iter=2000, C=1.0).fit(saved["X"].astype(np.float32), y)
    (out / "teams.pkl").write_bytes(pickle.dumps(clf))
    (out / "teams.json").write_text(json.dumps({"groups": [NAMES[t] for t in team_of_group]}), encoding="utf8")
    cv2.imwrite(str(out / "teams.jpg"), sheet(saved["samples"], team_of_group))


def sheet(samples, teams, pick=None):
    rows = []
    for g, tiles in enumerate(samples):
        colour = DRAW[teams[g]] if teams[g] != OTHER else (90, 90, 90)
        row = np.hstack([cv2.copyMakeBorder(t, 3, 3, 3, 3, cv2.BORDER_CONSTANT, value=colour) for t in tiles])
        label = np.zeros((102, 150, 3), np.uint8)
        cv2.putText(label, f"{(g + 1) % 10}  {NAMES[teams[g]]}", (8, 58), 0, 0.8, colour if teams[g] != OTHER else (200, 200, 200), 2)
        if g == pick:
            cv2.rectangle(label, (2, 2), (147, 99), (255, 255, 255), 2)
        rows.append(np.hstack([label, row]))
    return np.vstack(rows)


def confirm(slugs):
    """One screen per game: each row is a look-alike group. Pick a row with its number (0 is row 10) or W/S, then D (DFC), O (the
    opponent) or N (neither: referees, keepers, spectators). Enter saves the game and moves on; Q stops."""
    win = "Teams: 1-9, 0 or W/S pick a row, D = DFC, O = opponent, N = neither, Enter = save game, Q = stop"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    for slug in slugs:
        saved = np.load(DATA / "raw" / f"{slug}-cv" / "looks.npz")
        teams, pick = [int(x) for x in saved["guess"]], 0
        while True:
            img = sheet(saved["samples"], teams, pick)
            top = np.zeros((50, img.shape[1], 3), np.uint8)
            cv2.putText(top, slug, (10, 36), 0, 1.0, (255, 255, 255), 2)
            cv2.imshow(win, np.vstack([top, img]))
            key = cv2.waitKey(50) & 0xFF
            row = 9 if key == ord("0") else key - ord("1") if ord("1") <= key <= ord("9") else None
            if row is not None and row < len(teams):
                pick = row
            elif key in (82, 0, ord("w")):  # up
                pick = (pick - 1) % len(teams)
            elif key in (84, 1, ord("s")):  # down
                pick = (pick + 1) % len(teams)
            elif key in (ord("d"), ord("D")):
                teams[pick] = US
            elif key in (ord("o"), ord("O")):
                teams[pick] = THEM
            elif key in (ord("n"), ord("N")):
                teams[pick] = OTHER
            elif key in (13, 10):
                if US in teams and THEM in teams:
                    finish(slug, teams)
                    print(f"  {slug}: " + " ".join(NAMES[t] for t in teams), flush=True)
                    break
            elif key in (ord("q"), 27) or cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:
                cv2.destroyAllWindows()
                return
    cv2.destroyAllWindows()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["prepare", "confirm"])
    ap.add_argument("slugs", nargs="+")
    ap.add_argument("--every", type=float, default=4)
    ap.add_argument("--groups", type=int, default=10)
    a = ap.parse_args()
    if a.step == "prepare":
        for slug in a.slugs:
            prepare(slug, a.every, a.groups)
    else:
        confirm(a.slugs)


if __name__ == "__main__":
    main()
