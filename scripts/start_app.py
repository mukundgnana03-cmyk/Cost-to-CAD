"""Run on YOUR computer: build/start the app and open its upload screen."""

import shutil
import subprocess
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


def main():
    if not shutil.which("docker"):
        raise SystemExit(
            "Install and start Docker Desktop (or Docker Engine with Compose), then run this launcher again."
        )
    root = Path(__file__).resolve().parents[1]
    print(
        "Starting the CAD upload app. The first build can take several minutes.",
        flush=True,
    )
    subprocess.run(
        ["docker", "compose", "up", "--build", "--wait", "--wait-timeout", "240"],
        cwd=root,
        check=True,
    )
    url = "http://localhost:8080"
    for _ in range(30):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    print(f"Upload and test your part: {url}", flush=True)
                    webbrowser.open(url)
                    return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(1)
    raise SystemExit(
        "The upload screen did not become available. Run docker compose logs from the project directory."
    )


if __name__ == "__main__":
    main()
