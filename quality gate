import numpy as np

# MediaPipe Pose indices (right arm shown; mirror for left)
SH, EL, WR, HIP = 12, 14, 16, 24

def angle_2d(a, b, c):
    """Angle at b between segments ba and bc, in degrees."""
    v1, v2 = a - b, c - b
    cos = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))

class Gate:
    def __init__(self, calib):
        # calib: median 2D bone lengths (px, normalized by torso) from a
        # 3-second front-facing calibration pose
        self.calib = calib  # {"upper_arm": ..., "forearm": ...}

    def check(self, lm):
        """lm: (33, 4) array of x, y, z, visibility in pixel coords."""
        pts = lm[:, :2]
        reasons = []

        # 1. Visibility
        if min(lm[SH, 3], lm[EL, 3], lm[WR, 3]) < 0.6:
            reasons.append("low_visibility")

        # 2. Bone-length consistency vs calibration
        torso = np.linalg.norm(pts[SH] - pts[HIP]) + 1e-9
        ua = np.linalg.norm(pts[SH] - pts[EL]) / torso
        fa = np.linalg.norm(pts[EL] - pts[WR]) / torso
        # 3. Foreshortening: projected length well below calibrated length
        for name, L in (("upper_arm", ua), ("forearm", fa)):
            ratio = L / self.calib[name]
            if ratio < 0.65:
                reasons.append(f"foreshortened_{name}")
            elif ratio > 1.25:
                reasons.append(f"bone_length_{name}")

        return len(reasons) == 0, reasons
