"""Face encoding store and matching, backed by trained_model/model.pkl."""
import base64
import io
import os
import pickle
import threading

import face_recognition
import numpy as np
from PIL import Image

from .config import DATASET_DIR, MATCH_TOLERANCE, MODEL_PATH

# Frames from the browser are scaled down to this width before detection.
DETECT_WIDTH = 640


def decode_image(data):
    """Accept a data URL / base64 string or raw bytes and return an RGB numpy array."""
    if isinstance(data, str):
        if "," in data:
            data = data.split(",", 1)[1]
        data = base64.b64decode(data)
    image = Image.open(io.BytesIO(data)).convert("RGB")
    return np.array(image)


def _parse_roll(display_name):
    # Legacy pickles store "Name (roll, Dept)".
    if "(" in display_name:
        return display_name.split("(", 1)[1].split(",", 1)[0].strip()
    return display_name.strip()


class Recognizer:
    def __init__(self, path=MODEL_PATH):
        self.path = path
        self.lock = threading.Lock()
        self.encodings = []
        self.rolls = []
        self.load()

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
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "wb") as f:
            pickle.dump({"encodings": self.encodings, "rolls": self.rolls}, f)

    @property
    def known_rolls(self):
        return set(self.rolls)

    def identify(self, image):
        """Return [{roll, distance, box}] for every face in the image; roll is None when unknown."""
        scale = 1.0
        if image.shape[1] > DETECT_WIDTH:
            scale = DETECT_WIDTH / image.shape[1]
            image = np.array(Image.fromarray(image).resize((DETECT_WIDTH, int(image.shape[0] * scale))))

        locations = face_recognition.face_locations(image, model="hog")
        encodings = face_recognition.face_encodings(image, locations)

        with self.lock:
            known = np.array(self.encodings) if self.encodings else None
            rolls = list(self.rolls)

        results = []
        for (top, right, bottom, left), encoding in zip(locations, encodings):
            roll, distance = None, None
            if known is not None:
                distances = face_recognition.face_distance(known, encoding)
                best = int(np.argmin(distances))
                distance = float(distances[best])
                if distance <= MATCH_TOLERANCE:
                    roll = rolls[best]
            results.append({
                "roll": roll,
                "distance": distance,
                # Box as fractions of the frame so the client can overlay at any size.
                "box": {
                    "top": top / image.shape[0],
                    "left": left / image.shape[1],
                    "bottom": bottom / image.shape[0],
                    "right": right / image.shape[1],
                },
            })
        return results

    def enroll(self, roll, images):
        """Detect one face per image, save crops to dataset/<roll>/ and add encodings. Returns count added."""
        person_dir = os.path.join(DATASET_DIR, roll)
        os.makedirs(person_dir, exist_ok=True)
        existing = len([f for f in os.listdir(person_dir) if f.endswith(".jpg")])

        new = []
        for image in images:
            locations = face_recognition.face_locations(image, model="hog")
            if len(locations) != 1:
                continue
            encoding = face_recognition.face_encodings(image, locations)[0]
            top, right, bottom, left = locations[0]
            crop = Image.fromarray(image[top:bottom, left:right])
            crop.save(os.path.join(person_dir, f"{roll}_{existing + len(new)}.jpg"))
            new.append(encoding)

        if new:
            with self.lock:
                self.encodings.extend(new)
                self.rolls.extend([roll] * len(new))
                self.save()
        return len(new)

    def forget(self, roll):
        with self.lock:
            keep = [i for i, r in enumerate(self.rolls) if r != roll]
            self.encodings = [self.encodings[i] for i in keep]
            self.rolls = [self.rolls[i] for i in keep]
            self.save()

    def train(self):
        """Rebuild every encoding from the images in dataset/. Returns (faces, people)."""
        encodings, rolls = [], []
        for roll in sorted(os.listdir(DATASET_DIR)):
            person_dir = os.path.join(DATASET_DIR, roll)
            if not os.path.isdir(person_dir):
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
