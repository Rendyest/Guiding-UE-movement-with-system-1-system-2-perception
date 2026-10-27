"""
Replay harness: runs recorded clips through MediaPipe Pose + gate + struggle
detector and reports the three headline numbers.

Setup:
  pip install mediapipe opencv-python numpy pandas
  Put the Gate and Struggle classes (plus angle_2d, SH/EL/WR/HIP) in pipeline.py

Layout:
  clips/*.mp4              recorded clips (include deliberately bad ones)
  calib.json               {"upper_arm": ..., "forearm": ...} torso-normalized
                           median bone lengths from a front-facing calibration clip
  reference.csv            clip,frame,elbow_ref   (offline mesh or goniometer angles;
                           only needs to cover the sampled frames)

Run:
  python replay.py --calibrate clips/calib.mp4     # writes calib.json
  python replay.py                                 # runs all clips, prints report
"""
import argparse, glob, json, os
import cv2
import numpy as np
import pandas as pd
import mediapipe as mp

from pipeline import Gate, Struggle, angle_2d, SH, EL, WR, HIP

FIXED_INTERVAL_S = 2.0       # baseline policy: call every 2 s
COOLDOWN_S = 5.0             # must match Struggle cooldown


def pose_frames(path):
    """Yield (frame_idx, t_seconds, landmarks (33,4) in pixel coords or None)."""
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    pose = mp.solutions.pose.Pose(model_complexity=1, min_detection_confidence=0.5)
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        res = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        lm = None
        if res.pose_landmarks:
            lm = np.array([[p.x * w, p.y * h, p.z * w, p.visibility]
                           for p in res.pose_landmarks.landmark])
        yield i, i / fps, lm, h
        i += 1
    cap.release()
    pose.close()


def calibrate(path, out="calib.json"):
    ua, fa = [], []
    for _, _, lm, _ in pose_frames(path):
        if lm is None:
            continue
        pts = lm[:, :2]
        torso = np.linalg.norm(pts[SH] - pts[HIP]) + 1e-9
        ua.append(np.linalg.norm(pts[SH] - pts[EL]) / torso)
        fa.append(np.linalg.norm(pts[EL] - pts[WR]) / torso)
    calib = {"upper_arm": float(np.median(ua)), "forearm": float(np.median(fa))}
    json.dump(calib, open(out, "w"))
    print("Saved", out, calib)


def run_clip(path, calib):
    gate, strug = Gate(calib), Struggle()
    rows, triggers = [], []
    for i, t, lm, h in pose_frames(path):
        if lm is None:
            rows.append(dict(frame=i, t=t, elbow=np.nan, gate_ok=False,
                             reasons="no_pose"))
            continue
        ok, reasons = gate.check(lm)
        elbow = angle_2d(lm[SH, :2], lm[EL, :2], lm[WR, :2])
        sy = lm[SH, 1] / h
        flags = strug.update(t, elbow, sy, ok)
        rows.append(dict(frame=i, t=t, elbow=elbow, gate_ok=ok,
                         reasons="|".join(reasons)))
        if flags:
            triggers.append(dict(t=t, flags="|".join(flags)))
    df = pd.DataFrame(rows)
    df["clip"] = os.path.basename(path)
    return df, triggers


def count_calls(duration_s, fps, n_gated_triggers):
    """Muse Spark calls under three policies for one clip."""
    return dict(
        every_frame=int(duration_s * fps),
        fixed_interval=int(duration_s // FIXED_INTERVAL_S),
        gated_trigger=n_gated_triggers,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--calibrate")
    ap.add_argument("--clips", default="clips/*.mp4")
    ap.add_argument("--calib", default="calib.json")
    ap.add_argument("--ref", default="reference.csv")
    ap.add_argument("--out", default="results")
    args = ap.parse_args()

    if args.calibrate:
        return calibrate(args.calibrate, args.calib)

    os.makedirs(args.out, exist_ok=True)
    calib = json.load(open(args.calib))

    all_frames, calls, trig_log = [], [], []
    for path in sorted(glob.glob(args.clips)):
        if os.path.basename(path).startswith("calib"):
            continue
        print("Processing", path)
        df, trig = run_clip(path, calib)
        fps = len(df) / max(df.t.max(), 1e-9)
        c = count_calls(df.t.max(), fps, len(trig))
        c["clip"] = os.path.basename(path)
        calls.append(c)
        trig_log += [dict(clip=c["clip"], **x) for x in trig]
        all_frames.append(df)

    frames = pd.concat(all_frames, ignore_index=True)
    calls = pd.DataFrame(calls)

    # 1. Joint-angle error: gated-OK vs all frames (on frames with a reference)
    ref = pd.read_csv(args.ref)
    m = frames.merge(ref, on=["clip", "frame"], how="inner").dropna(subset=["elbow"])
    m["abs_err"] = (m.elbow - m.elbow_ref).abs()
    mae_all = m.abs_err.mean()
    mae_ok = m[m.gate_ok].abs_err.mean()
    mae_flag = m[~m.gate_ok].abs_err.mean()

    # Does the gate catch the bad frames? (bad = error above threshold)
    BAD_DEG = 15
    m["bad"] = m.abs_err > BAD_DEG
    caught = (m.bad & ~m.gate_ok).sum() / max(m.bad.sum(), 1)
    false_alarm = (~m.bad & ~m.gate_ok).sum() / max((~m.gate_ok).sum(), 1)

    # 2. Calls saved
    tot = calls[["every_frame", "fixed_interval", "gated_trigger"]].sum()
    saved_vs_frame = 1 - tot.gated_trigger / max(tot.every_frame, 1)
    saved_vs_fixed = 1 - tot.gated_trigger / max(tot.fixed_interval, 1)

    # 3. Share of frames escalated to the mesh = gate flag rate
    flag_rate = (~frames.gate_ok).mean()
    reasons = (frames[~frames.gate_ok].reasons.str.split("|").explode()
               .value_counts())

    report = f"""
=== JOINT-ANGLE ERROR (elbow, {len(m)} frames with reference) ===
MAE all frames        : {mae_all:.1f} deg
MAE gated-OK frames   : {mae_ok:.1f} deg
MAE flagged frames    : {mae_flag:.1f} deg
Bad frames (> {BAD_DEG} deg) caught by gate : {caught:.0%}
Flagged frames that were actually fine      : {false_alarm:.0%}

=== MUSE SPARK CALLS ({len(calls)} clips) ===
Every frame      : {tot.every_frame}
Fixed {FIXED_INTERVAL_S:.0f}s interval : {tot.fixed_interval}
Gated trigger    : {tot.gated_trigger}
Saved vs every frame : {saved_vs_frame:.1%}
Saved vs fixed       : {saved_vs_fixed:.1%}

=== ESCALATION TO MESH ===
Frames flagged by gate : {flag_rate:.1%}
Flag reasons:
{reasons.to_string()}
"""
    print(report)
    open(f"{args.out}/report.txt", "w").write(report)
    frames.to_csv(f"{args.out}/frames.csv", index=False)
    calls.to_csv(f"{args.out}/calls.csv", index=False)
    pd.DataFrame(trig_log).to_csv(f"{args.out}/triggers.csv", index=False)


if __name__ == "__main__":
    main()
