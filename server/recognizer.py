"""Face encodings, matching and liveness, backed by trained_model/model.pkl and dataset/."""
import base64
import io
import os
import pickle
import shutil
import threading

import face_recognition
import numpy as np
from PIL import Image

from .config import MATCH_TOLERANCE

# Frames from the browser are scaled down to this width before detection.
DETECT_WIDTH = 640

# A blink is when eye openness in some frame drops below this share of the most open frame.
BLINK_RATIO = 0.7
# Eye aspect ratio below this in the most open frame means the eyes were never really open.
MIN_OPEN_EAR = 0.18


def decode_image(data):
    """Accept a data URL / base64 string or raw bytes and return an RGB numpy array."""
    if isinstance(data, str):
        if "," in data:
            data = data.split(",", 1)[1]
        data = base64.b64decode(data)
    image = Image.open(io.BytesIO(data)).convert("RGB")
    return np.array(image)


def _shrink(image):
    if image.shape[1] <= DETECT_WIDTH:
        return image
    scale = DETECT_WIDTH / image.shape[1]
    return np.array(Image.fromarray(image).resize((DETECT_WIDTH, int(image.shape[0] * scale))))


def _parse_roll(display_name):
    # Legacy pickles store "Name (roll, Dept)".
    if "(" in display_name:
        return display_name.split("(", 1)[1].split(",", 1)[0].strip()
    return display_name.strip()


def _box(loc, image):
    top, right, bottom, left = loc
    h, w = image.shape[:2]
    return {"top": top / h, "left": left / w, "bottom": bottom / h, "right": right / w}


def eye_aspect_ratio(eye):
    """Soukupová & Čech (2016): vertical eye opening over horizontal width, from 6 landmarks."""
    p = np.array(eye, dtype=float)
    vertical = np.linalg.norm(p[1] - p[5]) + np.linalg.norm(p[2] - p[4])
    horizontal = np.linalg.norm(p[0] - p[3])
    return vertical / (2.0 * horizontal) if horizontal else 0.0


def crop(image, box, pad=0.25):
    """Cut a face out of an image using a fractional box, with some margin."""
    h, w = image.shape[:2]
    top, bottom = box["top"] * h, box["bottom"] * h
    left, right = box["left"] * w, box["right"] * w
    dy, dx = (bottom - top) * pad, (right - left) * pad
    t, b = max(0, int(top - dy)), min(h, int(bottom + dy))
    l, r = max(0, int(left - dx)), min(w, int(right + dx))
    return image[t:b, l:r]


class Recognizer:
    def __init__(self, model_path, dataset_dir, tolerance=MATCH_TOLERANCE):
        self.path = model_path
        self.dataset_dir = dataset_dir
        self.tolerance = tolerance
        self.lock = threading.Lock()
        self.encodings = []
        self.rolls = []
        self.load()

    # ------------------------------------------------------------ persistence

    def load(self):
        if not os.path.exists(self.path):
            return
        with open(self.path, "rb") as f:
            data = pickle.load(f)
        self.encodings = list(data.get("encodings", []))
        if "rolls" in data:
            self.rolls = list(data["rolls"])
        elif data.get("metadata"):
            self.rolls = [m["roll_number"] for m in data["metadata"]]
        else:
            self.rolls = [_parse_roll(n) for n in data.get("names", [])]

    def save(self):
        """Write the model atomically. Call with the lock held."""
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "wb") as f:
            pickle.dump({"encodings": self.encodings, "rolls": self.rolls}, f)
        os.replace(tmp, self.path)

    @property
    def known_rolls(self):
        return set(self.rolls)

    def photo_path(self, roll):
        """First saved face crop for a person, used as their avatar."""
        person_dir = os.path.join(self.dataset_dir, roll)
        if not os.path.isdir(person_dir):
            return None
        photos = sorted(
            (f for f in os.listdir(person_dir) if f.lower().endswith((".jpg", ".jpeg", ".png"))),
            key=lambda f: (len(f), f),
        )
        return os.path.join(person_dir, photos[0]) if photos else None

    # ------------------------------------------------------------ matching

    def match(self, encoding):
        """Return (roll or None, distance or None) for one face encoding."""
        with self.lock:
            if not self.encodings:
                return None, None
            known = np.array(self.encodings)
            rolls = list(self.rolls)
        distances = face_recognition.face_distance(known, encoding)
        best = int(np.argmin(distances))
        distance = float(distances[best])
        return (rolls[best] if distance <= self.tolerance else None), distance

    def identify(self, image):
        """Return [{roll, distance, box, encoding}] for every face; roll is None when unknown."""
        image = _shrink(image)
        locations = face_recognition.face_locations(image, model="hog")
        encodings = face_recognition.face_encodings(image, locations)
        results = []
        for loc, encoding in zip(locations, encodings):
            roll, distance = self.match(encoding)
            # Box as fractions of the frame so the client can overlay at any size.
            results.append({"roll": roll, "distance": distance, "encoding": encoding, "box": _box(loc, image)})
        return results

    def check_liveness(self, images):
        """Look at a burst of frames of one person and decide whether they blinked.

        Returns {"faces": frames with a face, "blinked": bool, "roll": match on the
        open-eyed frames (None unless they agree), "distance": float, "box": box}.
        """
        samples = []
        for image in images:
            image = _shrink(image)
            locations = face_recognition.face_locations(image, model="hog")
            if not locations:
                continue
            # The biggest face is the person checking in.
            loc = max(locations, key=lambda b: (b[2] - b[0]) * (b[1] - b[3]))
            marks = face_recognition.face_landmarks(image, [loc])
            if not marks:
                continue
            ear = (eye_aspect_ratio(marks[0]["left_eye"]) + eye_aspect_ratio(marks[0]["right_eye"])) / 2
            samples.append((ear, image, loc))

        result = {"faces": len(samples), "blinked": False, "roll": None, "distance": None, "box": None}
        if not samples:
            return result

        ears = [s[0] for s in samples]
        result["blinked"] = bool(len(samples) >= 3 and max(ears) >= MIN_OPEN_EAR and min(ears) < BLINK_RATIO * max(ears))

        # Identify on the two most open-eyed frames; both must agree.
        votes = []
        for _ear, image, loc in sorted(samples, key=lambda s: -s[0])[:2]:
            encoding = face_recognition.face_encodings(image, [loc])[0]
            roll, distance = self.match(encoding)
            votes.append((roll, distance, _box(loc, image)))
        best = min(votes, key=lambda v: v[1] if v[1] is not None else 9)
        result["roll"] = best[0] if len({v[0] for v in votes}) == 1 else None
        result["distance"], result["box"] = best[1], best[2]
        return result

    # ------------------------------------------------------------ enrolling

    def _next_file(self, roll):
        person_dir = os.path.join(self.dataset_dir, roll)
        os.makedirs(person_dir, exist_ok=True)
        existing = set(os.listdir(person_dir))
        i = len(existing)
        while f"{roll}_{i}.jpg" in existing:
            i += 1
        return os.path.join(person_dir, f"{roll}_{i}.jpg")

    def enroll(self, roll, images):
        """Detect one face per image, save crops to dataset/<roll>/ and add encodings. Returns count added."""
        added = 0
        for image in images:
            locations = face_recognition.face_locations(image, model="hog")
            if len(locations) != 1:
                continue
            encoding = face_recognition.face_encodings(image, locations)[0]
            top, right, bottom, left = locations[0]
            self.add_face(roll, image[top:bottom, left:right], encoding, save=False)
            added += 1
        if added:
            with self.lock:
                self.save()
        return added

    def add_face(self, roll, face_image, encoding, save=True):
        """Store one already-encoded face (e.g. from the unknown-faces queue) under a person."""
        Image.fromarray(face_image).save(self._next_file(roll))
        with self.lock:
            self.encodings.append(np.asarray(encoding))
            self.rolls.append(roll)
            if save:
                self.save()

    def forget(self, roll):
        """Remove a person's encodings and their photos, so retraining can't bring them back."""
        with self.lock:
            keep = [i for i, r in enumerate(self.rolls) if r != roll]
            self.encodings = [self.encodings[i] for i in keep]
            self.rolls = [self.rolls[i] for i in keep]
            self.save()
        shutil.rmtree(os.path.join(self.dataset_dir, roll), ignore_errors=True)

    def train(self, allowed_rolls=None):
        """Rebuild every encoding from the images in dataset/. Returns (faces, people)."""
        encodings, rolls = [], []
        if os.path.isdir(self.dataset_dir):
            for roll in sorted(os.listdir(self.dataset_dir)):
                person_dir = os.path.join(self.dataset_dir, roll)
                if not os.path.isdir(person_dir) or (allowed_rolls is not None and roll not in allowed_rolls):
                    continue
                for name in sorted(os.listdir(person_dir)):
                    if not name.lower().endswith((".jpg", ".jpeg", ".png")):
                        continue
                    image = face_recognition.load_image_file(os.path.join(person_dir, name))
                    found = face_recognition.face_encodings(image)
                    if not found:
                        # Saved crops are tight around the face; let the whole image be the face.
                        h, w = image.shape[:2]
                        found = face_recognition.face_encodings(image, [(0, w, h, 0)])
                    if found:
                        encodings.append(found[0])
                        rolls.append(roll)
        with self.lock:
            self.encodings, self.rolls = encodings, rolls
            self.save()
        return len(encodings), len(set(rolls))
