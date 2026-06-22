import docker
import smtplib
from email.message import EmailMessage
import os
import time

SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
DESTINATION_EMAIL = os.environ.get("DESTINATION_EMAIL")

KEYWORDS = ["ERROR", "FATAL", "Exception", "Traceback"]
IGNORE_KEYWORDS = ["No Anthropic API key is set", "Suggested prompts generation failed", "qa_errors"]

def send_email(subject, body):
    if not all([SMTP_USER, SMTP_PASSWORD, DESTINATION_EMAIL]):
        print("Email credentials not fully set. Skipping email.")
        return

    msg = EmailMessage()
    msg.set_content(body)
    msg['Subject'] = subject
    msg['From'] = SMTP_USER
    msg['To'] = DESTINATION_EMAIL

    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
        print(f"Alert email sent to {DESTINATION_EMAIL}")
    except Exception as e:
        print(f"Failed to send email: {e}")

def main():
    print("Starting log alerter...")
    client = docker.from_env()
    
    last_checked = time.time()
    
    while True:
        time.sleep(60)
        now = time.time()
        
        for container in client.containers.list():
            # Skip ourself and uptime-kuma
            if "log-alerter" in container.name or "uptime-kuma" in container.name:
                continue
                
            try:
                # Get logs from the last 60 seconds
                logs = container.logs(since=int(last_checked), until=int(now)).decode('utf-8', errors='replace')
                errors_found = []
                for line in logs.split('\n'):
                    if any(keyword.lower() in line.lower() for keyword in KEYWORDS):
                        if not any(ignore.lower() in line.lower() for ignore in IGNORE_KEYWORDS):
                            errors_found.append(line)
                        
                if errors_found:
                    error_text = '\n'.join(errors_found)
                    print(f"Found {len(errors_found)} error lines in {container.name}")
                    subject = f"Alert: Errors detected in container {container.name}"
                    body = f"The following errors were detected in the last minute in container '{container.name}':\n\n{error_text}"
                    send_email(subject, body)
            except Exception as e:
                print(f"Error reading logs for {container.name}: {e}")
                
        last_checked = now

if __name__ == "__main__":
    main()
