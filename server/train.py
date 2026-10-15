"""Rebuild trained_model/model.pkl from every image in dataset/.

Run with:  python -m server.train
"""
from .config import DATASET_DIR, MODEL_PATH
from .recognizer import Recognizer

if __name__ == "__main__":
    faces, people = Recognizer(MODEL_PATH, DATASET_DIR).train()
    print(f"Trained on {faces} faces across {people} people.")
