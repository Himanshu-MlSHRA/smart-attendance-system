"""Wall-clock time in the configured time zone (servers run in UTC; classes don't)."""
from datetime import datetime
from zoneinfo import ZoneInfo

from .config import TIMEZONE

TZ = ZoneInfo(TIMEZONE)


def now():
    """Naive local datetime; everything stored is local wall-clock time."""
    return datetime.now(TZ).replace(tzinfo=None, microsecond=0)


def today():
    return now().date()


def stamp():
    return now().isoformat(sep=" ")
