"""Defaulter alert emails over SMTP (or a dry run when SMTP isn't configured)."""
import smtplib
from email.message import EmailMessage

from .config import DEFAULTER_THRESHOLD, SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER


def configured():
    return bool(SMTP_HOST)


def defaulter_message(student, summary, courses):
    need = summary["held"] and max(
        0, -(-(DEFAULTER_THRESHOLD * summary["held"] - 100 * summary["attended"]) // (100 - DEFAULTER_THRESHOLD))
    )
    lines = [
        f"Hi {student['name'].split()[0]},",
        "",
        f"Your attendance is {summary['percent']}% ({summary['attended']} of {summary['held']} classes), "
        f"below the required {DEFAULTER_THRESHOLD}%.",
        f"Attend the next {need} classes in a row to get back above the line.",
        "",
        "By course:",
        *[f"  {c['code']} {c['name']}: {c['percent'] if c['percent'] is not None else '—'}%" for c in courses],
        "",
        "If you were absent for a genuine reason, raise a leave request from your dashboard.",
        "",
        "— Present! attendance system",
    ]
    return f"Attendance alert: {summary['percent']}%", "\n".join(lines)


def send(messages):
    """messages: [(to, subject, text)]. Returns how many were sent."""
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        smtp.starttls()
        if SMTP_USER:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        for to, subject, text in messages:
            msg = EmailMessage()
            msg["From"], msg["To"], msg["Subject"] = SMTP_FROM, to, subject
            msg.set_content(text)
            smtp.send_message(msg)
    return len(messages)
