import json
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "arun-gogna-video.json"
CHANNEL_URL = "https://www.youtube.com/@gognaarun/videos"
HEADERS = {"User-Agent": "Catholic-Prayers-GitHub-Action/1.0"}
VIDEO_ID_PATTERN = re.compile(r'"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"')


def main():
    response = requests.get(CHANNEL_URL, headers=HEADERS, timeout=30)
    response.raise_for_status()
    video_ids = list(dict.fromkeys(VIDEO_ID_PATTERN.findall(response.text)))
    if not video_ids:
        raise RuntimeError("Arun Gogna's YouTube channel page contains no videos")

    video = None
    for video_id in video_ids:
        video_response = requests.get(
            f"https://www.youtube.com/watch?v={video_id}",
            headers=HEADERS,
            timeout=30,
        )
        video_response.raise_for_status()
        live_match = re.search(r'"isLiveContent"\s*:\s*(true|false)', video_response.text)
        if not live_match:
            raise RuntimeError(f"Could not determine whether YouTube video {video_id} is a livestream")
        if live_match.group(1) == "true":
            print(f"Skipping Arun Gogna livestream: {video_id}")
            continue

        page = BeautifulSoup(video_response.text, "html.parser")
        title_meta = page.find("meta", attrs={"property": "og:title"})
        published_meta = page.find("meta", attrs={"itemprop": "datePublished"})
        if published_meta is None:
            published_meta = page.find("meta", attrs={"itemprop": "uploadDate"})
        title = title_meta.get("content", "").strip() if title_meta else ""
        published_at = published_meta.get("content", "").strip() if published_meta else ""
        if not title or not published_at:
            raise RuntimeError(f"Arun Gogna's video page {video_id} is incomplete")
        video = {"id": video_id, "title": title, "publishedAt": published_at}
        break

    if video is None:
        raise RuntimeError("Arun Gogna's channel contains no regular video uploads")

    DATA.write_text(json.dumps({
        **video,
        "source": f"https://www.youtube.com/watch?v={video['id']}",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated Arun Gogna's latest regular video: {video['title']} ({video['id']})")


if __name__ == "__main__":
    main()