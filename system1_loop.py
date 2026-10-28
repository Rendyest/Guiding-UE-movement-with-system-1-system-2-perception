"""
System 1 skeleton: MediaPipe Pose + Hands + Face on a webcam or video file.

For one arm it computes the elbow angle in 2D (image) and 3D (MediaPipe world
landmarks), gates each frame for "is the 2D angle trustworthy?", smooths with
a One Euro filter, and logs everything to CSV so the same timestamps can be
compared offline against SAM 3D Body.

Usage:
    python system1_loop.py --source 0 --arm right --out run.csv        # webcam
    python system1_loop.py --source clip.mp4 --arm right --out clip.csv

Start every clip with ~3 s of the arm held out toward the side, in the image
plane, facing the camera (calibration pose). Press q to quit.

Models are downloaded on first run (needs internet). Thresholds are starting
points, tune them on your clips. Written against MediaPipe Tasks 0.10.x.
"""
import argparse
import csv
import math
import os
import time
import urllib.request
from dataclasses import dataclass

import numpy as np

MODEL_URLS = {
    "pose_landmarker.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
    "hand_landmarker.task": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
    "face_landmarker.task": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
}

# BlazePose indices: shoulder, elbow, wrist
ARM = {"left": (11, 13, 15), "right": (12, 14, 16)}
OTHER_SHOULDER = {"left": 12, "right": 11}
FACE_NOSE, FACE_LEFT_CHEEK, FACE_RIGHT_CHEEK = 1, 234, 454


@dataclass
class Config:
    vis_min: float = 0.5          # per-landmark visibility gate
    obs_min: float = 0.5          # l/L ~ cos(phi); 0.5 means link tilted ~60 deg out of plane
    len_tol: float = 0.25         # allowed fractional deviation of world bone length from calibration
    calib_seconds: float = 3.0
    one_euro_mincutoff: float = 1.0
    one_euro_beta: float = 0.05


# ---------- pure-numpy helpers (no mediapipe needed, easy to unit test) ----------

def angle_at(b, a, c):
    """Angle at point b between rays b->a and b->c, in degrees. Works in 2D or 3D."""
    u, v = np.asarray(a, float) - b, np.asarray(c, float) - b
    n = np.linalg.norm(u) * np.linalg.norm(v)
    if n < 1e-9:
        return float("nan")
    return math.degrees(math.acos(np.clip(np.dot(u, v) / n, -1.0, 1.0)))


class OneEuro:
    """One Euro filter (Casiez et al. 2012) for a scalar signal."""

    def __init__(self, mincutoff=1.0, beta=0.05, dcutoff=1.0):
        self.mincutoff, self.beta, self.dcutoff = mincutoff, beta, dcutoff
        self.x_prev = self.dx_prev = self.t_prev = None

    @staticmethod
    def _alpha(cutoff, dt):
        tau = 1.0 / (2 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def __call__(self, x, t):
        if self.t_prev is None:
            self.x_prev, self.dx_prev, self.t_prev = x, 0.0, t
            return x
        dt = max(t - self.t_prev, 1e-6)
        dx = (x - self.x_prev) / dt
        a_d = self._alpha(self.dcutoff, dt)
        dx_hat = a_d * dx + (1 - a_d) * self.dx_prev
        cutoff = self.mincutoff + self.beta * abs(dx_hat)
        a = self._alpha(cutoff, dt)
        x_hat = a * x + (1 - a) * self.x_prev
        self.x_prev, self.dx_prev, self.t_prev = x_hat, dx_hat, t
        return x_hat


class Calibrator:
    """Learns the 'true' link lengths from the opening in-plane pose.

    2D lengths are normalised by 2D shoulder width so the score does not depend
    on distance to the camera. Caveat: shoulder width itself shrinks if the
    torso rotates, so ask people to face the camera during calibration.
    """

    def __init__(self, cfg):
        self.cfg = cfg
        self.ratios2d = []   # (upper, fore) normalised 2D lengths
        self.world = []      # (upper, fore) world lengths in metres
        self.ref = None

    def add(self, r2d, rworld):
        self.ratios2d.append(r2d)
        self.world.append(rworld)

    def finish(self):
        if len(self.ratios2d) < 10:
            return False
        # 90th percentile: the in-plane frames are the longest-looking ones
        self.ref = {
            "r2d": np.percentile(np.array(self.ratios2d), 90, axis=0),
            "world": np.median(np.array(self.world), axis=0),
        }
        return True


def gate(vis, r2d, rworld, ref, cfg):
    """Return (ok, obs_upper, obs_fore, reasons). ok means the 2D angle is trustworthy."""
    reasons = []
    if min(vis) < cfg.vis_min:
        reasons.append("low_visibility")
    obs = np.clip(np.asarray(r2d) / ref["r2d"], 0, 1.2)
    if obs.min() < cfg.obs_min:
        reasons.append("foreshortened")
    dev = np.abs(np.asarray(rworld) / ref["world"] - 1.0)
    if dev.max() > cfg.len_tol:
        reasons.append("bone_length_jump")
    return (not reasons), float(obs[0]), float(obs[1]), reasons


# ---------- mediapipe wiring ----------

def ensure_models(folder="models"):
    os.makedirs(folder, exist_ok=True)
    paths = {}
    for name, url in MODEL_URLS.items():
        p = os.path.join(folder, name)
        if not os.path.exists(p):
            print(f"downloading {name} ...")
            urllib.request.urlretrieve(url, p)
        paths[name] = p
    return paths


def build_landmarkers(paths):
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision

    def base(name):
        return mpt.BaseOptions(model_asset_path=paths[name])

    mode = vision.RunningMode.VIDEO
    pose = vision.PoseLandmarker.create_from_options(
        vision.PoseLandmarkerOptions(base_options=base("pose_landmarker.task"),
                                     running_mode=mode, num_poses=1))
    hands = vision.HandLandmarker.create_from_options(
        vision.HandLandmarkerOptions(base_options=base("hand_landmarker.task"),
                                     running_mode=mode, num_hands=2))
    face = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(base_options=base("face_landmarker.task"),
                                     running_mode=mode, num_faces=1,
                                     output_facial_transformation_matrixes=True))
    return pose, hands, face


def hand_to_face(hand_res, face_res, wrist_px, w, h):
    """Distance from the hand nearest the pose wrist to the nose, in face widths (nan if unavailable)."""
    if not hand_res.hand_landmarks or not face_res.face_landmarks:
        return float("nan")
    f = face_res.face_landmarks[0]
    nose = np.array([f[FACE_NOSE].x * w, f[FACE_NOSE].y * h])
    face_w = np.linalg.norm(np.array([f[FACE_LEFT_CHEEK].x * w, f[FACE_LEFT_CHEEK].y * h]) -
                            np.array([f[FACE_RIGHT_CHEEK].x * w, f[FACE_RIGHT_CHEEK].y * h]))
    # Match by position, not by the handedness label (labels can come out mirrored).
    hands_xy = [np.array([hl[0].x * w, hl[0].y * h]) for hl in hand_res.hand_landmarks]
    hand = min(hands_xy, key=lambda p: np.linalg.norm(p - wrist_px))
    if np.linalg.norm(hand - wrist_px) > 0.5 * face_w * 2:   # hand too far from pose wrist: probably the other arm
        return float("nan")
    return float(np.linalg.norm(hand - nose) / max(face_w, 1e-6))


def run(args):
    import cv2
    import mediapipe as mp

    cfg = Config()
    pose, hands, face = build_landmarkers(ensure_models())
    cap = cv2.VideoCapture(int(args.source) if args.source.isdigit() else args.source)
    is_file = not args.source.isdigit()
    s_i, e_i, w_i = ARM[args.arm]
    o_i = OTHER_SHOULDER[args.arm]

    calib, filt = Calibrator(cfg), OneEuro(cfg.one_euro_mincutoff, cfg.one_euro_beta)
    last_good, t0, last_ts = float("nan"), time.time(), -1
    cols = ["t", "angle2d_raw", "angle2d_smooth", "angle3d_world", "obs_upper", "obs_fore",
            "vis_min", "ok", "reasons", "hand_to_face"]
    fh = open(args.out, "w", newline="")
    wr = csv.writer(fh)
    wr.writerow(cols)

    while True:
        ok_read, frame = cap.read()
        if not ok_read:
            break
        h, w = frame.shape[:2]
        t = (cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0) if is_file else (time.time() - t0)
        ts = max(int(t * 1000), last_ts + 1)   # VIDEO mode needs strictly increasing ms
        last_ts = ts
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

        pres = pose.detect_for_video(mp_img, ts)
        if not pres.pose_landmarks:
            wr.writerow([f"{t:.3f}", "", "", "", "", "", "", 0, "no_pose", ""])
            continue
        lm, wl = pres.pose_landmarks[0], pres.pose_world_landmarks[0]

        px = lambda i: np.array([lm[i].x * w, lm[i].y * h])    # pixels, so the aspect ratio is right
        wd = lambda i: np.array([wl[i].x, wl[i].y, wl[i].z])   # metres, hip-centred
        sh, el, wr_ = px(s_i), px(e_i), px(w_i)
        shoulder_w = np.linalg.norm(sh - px(o_i))
        r2d = (np.linalg.norm(sh - el) / shoulder_w, np.linalg.norm(el - wr_) / shoulder_w)
        rworld = (np.linalg.norm(wd(s_i) - wd(e_i)), np.linalg.norm(wd(e_i) - wd(w_i)))
        vis = [lm[s_i].visibility, lm[e_i].visibility, lm[w_i].visibility]

        a2d = angle_at(el, sh, wr_)
        a3d = angle_at(wd(e_i), wd(s_i), wd(w_i))

        if calib.ref is None:
            if t < cfg.calib_seconds:
                if min(vis) >= cfg.vis_min:
                    calib.add(r2d, rworld)
            elif not calib.finish():
                print("calibration failed: not enough good frames, check the opening pose")
                break
            if calib.ref is None:
                wr.writerow([f"{t:.3f}", f"{a2d:.1f}", "", f"{a3d:.1f}", "", "", f"{min(vis):.2f}", 0, "calibrating", ""])
                continue

        ok, obs_u, obs_f, reasons = gate(vis, r2d, rworld, calib.ref, cfg)
        if ok:
            last_good = filt(a2d, t)    # only good frames update the filter; bad frames hold the last value
        # TODO system 1 hook: if not ok for N frames, or struggle score high -> flag for system 2 / SAM 3D Body

        hres = hands.detect_for_video(mp_img, ts)
        fres = face.detect_for_video(mp_img, ts)
        h2f = hand_to_face(hres, fres, wr_, w, h)

        wr.writerow([f"{t:.3f}", f"{a2d:.1f}", f"{last_good:.1f}", f"{a3d:.1f}", f"{obs_u:.2f}",
                     f"{obs_f:.2f}", f"{min(vis):.2f}", int(ok), "|".join(reasons), f"{h2f:.2f}"])

        cv2.putText(frame, f"elbow {last_good:.0f} deg  {'OK' if ok else 'GATED: ' + ','.join(reasons)}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0) if ok else (0, 0, 255), 2)
        cv2.imshow("system1", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    fh.close()
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="0", help="webcam index or video path")
    ap.add_argument("--arm", choices=["left", "right"], default="right")
    ap.add_argument("--out", default="run.csv")
    run(ap.parse_args())
