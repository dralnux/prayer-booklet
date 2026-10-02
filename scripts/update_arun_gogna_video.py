import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "arun-gogna-video.json"
CHANNEL_ID = "UCzJvKlvUNBGKxGyzJw4-9yQ"
FEED_URL = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
NAMESPACES = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
}


def main():
    response = requests.get(
        FEED_URL,
        headers={"User-Agent": "Catholic-Prayers-GitHub-Action/1.0"},
        timeout=30,
    )
    response.raise_for_status()
    feed = ET.fromstring(response.content)

    entries = feed.findall("atom:entry", NAMESPACES)
    if not entries:
        raise RuntimeError("Arun Gogna's YouTube feed contains no videos")

    video = None
    for entry in entries:
        video_id = entry.findtext("yt:videoId", "", NAMESPACES).strip()
        if not video_id:
            continue

        video_response = requests.get(
            f"https://www.youtube.com/watch?v={video_id}",
            headers={"User-Agent": "Catholic-Prayers-GitHub-Action/1.0"},
            timeout=30,
        )
        video_response.raise_for_status()
        live_match = re.search(r'"isLiveContent"\s*:\s*(true|false)', video_response.text)
        if not live_match:
            raise RuntimeError(f"Could not determine whether YouTube video {video_id} is a livestream")
        if live_match.group(1) == "true":
            print(f"Skipping Arun Gogna livestream: {video_id}")
            continue

        title = entry.findtext("atom:title", "", NAMESPACES).strip()
        published_at = entry.findtext("atom:published", "", NAMESPACES).strip()
        if not title or not published_at:
            raise RuntimeError(f"Arun Gogna's video feed entry {video_id} is incomplete")
        video = {"id": video_id, "title": title, "publishedAt": published_at}
        break

    if video is None:
        raise RuntimeError("Arun Gogna's feed contains no regular video uploads")

    DATA.write_text(json.dumps({
        **video,
        "source": f"https://www.youtube.com/watch?v={video['id']}",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated Arun Gogna's latest regular video: {video['title']} ({video['id']})")


if __name__ == "__main__":
    main()