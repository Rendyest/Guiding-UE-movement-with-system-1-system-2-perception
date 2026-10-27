from collections import deque

class Struggle:
    def __init__(self, fps=30, target_range=(40, 140)):
        self.buf = deque(maxlen=fps * 2)   # (t, elbow_angle, shoulder_y)
        self.target = target_range
        self.cooldown_until = 0

    def update(self, t, elbow, shoulder_y, gate_ok):
        if not gate_ok:            # never judge on untrusted frames
            return None
        self.buf.append((t, elbow, shoulder_y))
        if len(self.buf) < self.buf.maxlen or t < self.cooldown_until:
            return None

        ang = np.array([b[1] for b in self.buf])
        sy = np.array([b[2] for b in self.buf])
        vel = np.abs(np.diff(ang)) * 30            # deg/s

        flags = []
        # Stall: barely moving, and not at the target end of range
        if vel.mean() < 3 and ang[-1] < self.target[1] - 15:
            flags.append("stall")
        # Jitter/tremor: many direction reversals with small amplitude
        reversals = np.sum(np.diff(np.sign(np.diff(ang))) != 0)
        if reversals > 12 and np.ptp(ang) < 20:
            flags.append("jitter")
        # Compensation: shoulder rises while elbow barely progresses
        if (sy[0] - sy[-1]) > 0.04 and np.ptp(ang) < 15:   # y is normalized, up = smaller
            flags.append("shoulder_hiking")

        if flags:
            self.cooldown_until = t + 5   # at most one call per 5s
            return flags
        return None
