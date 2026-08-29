import json
import os
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "videos.json"
PLAYLIST_ID = "PLA_KgzimUIuXyOcP5WtOYLwdCogSXYdgz"
API_URL = "https://www.googleapis.com/youtube/v3"
HEADERS = {"User-Agent": "Catholic-Prayers-GitHub-Action/1.0"}
RSS_URL = "https://www.youtube.com/feeds/videos.xml"


def api_get(resource, **params):
    response = requests.get(
        f"{API_URL}/{resource}",
        params={"key": os.environ["YOUTUBE_API_KEY"], **params},
        headers=HEADERS,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def utc_day_bounds(day):
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def update_from_rss(target, upload_date):
    response = requests.get(
        RSS_URL,
        params={"playlist_id": PLAYLIST_ID},
        headers=HEADERS,
        timeout=30,
    )
    response.raise_for_status()
    root = ET.fromstring(response.content)
    namespaces = {"atom": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
    entry = next(
        (
            item for item in root.findall("atom:entry", namespaces)
            if item.findtext("atom:published", "", namespaces).startswith(upload_date.isoformat())
        ),
        None,
    )
    if entry is None:
        raise RuntimeError(f"No playlist video was uploaded on {upload_date.isoformat()} (UTC) for {target.isoformat()}.")

    video_id = entry.findtext("yt:videoId", "", namespaces)
    title = entry.findtext("atom:title", "", namespaces)
    published_at = entry.findtext("atom:published", "", namespaces)
    DATA.write_text(json.dumps({
        "date": target.isoformat(),
        "uploadedDate": upload_date.isoformat(),
        "video": {"id": video_id, "title": title, "description": "", "uploadedAt": published_at},
        "comments": [],
        "source": f"https://www.youtube.com/watch?v={video_id}",
        "playlist": f"https://www.youtube.com/playlist?list={PLAYLIST_ID}",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {DATA} from the YouTube playlist RSS feed for {target.isoformat()}")


def main():
    target = date.fromisoformat(os.getenv("VIDEO_DATE", datetime.now(timezone.utc).date().isoformat()))
    upload_date = target - timedelta(days=1)
    if not os.environ.get("YOUTUBE_API_KEY"):
        update_from_rss(target, upload_date)
        return

    start, end = utc_day_bounds(upload_date)

    matching_item = None
    video_details = None
    page_token = None
    while not matching_item:
        params = {"part": "snippet,contentDetails", "playlistId": PLAYLIST_ID, "maxResults": 50}
        if page_token:
            params["pageToken"] = page_token
        playlist = api_get("playlistItems", **params)
        video_ids = [item["contentDetails"]["videoId"] for item in playlist.get("items", [])]
        if video_ids:
            details = api_get("videos", part="snippet", id=",".join(video_ids))
            details_by_id = {item["id"]: item for item in details.get("items", [])}
            for item in playlist.get("items", []):
                candidate = details_by_id.get(item["contentDetails"]["videoId"])
                if candidate and candidate["snippet"].get("publishedAt", "").startswith(upload_date.isoformat()):
                    matching_item = item
                    video_details = candidate
                    break
        page_token = playlist.get("nextPageToken")
        if not page_token:
            break
    if not matching_item:
        raise RuntimeError(f"No playlist video was uploaded on {upload_date.isoformat()} (UTC) for {target.isoformat()}." )

    snippet = video_details["snippet"]
    video_id = matching_item["contentDetails"]["videoId"]
    comments = []
    try:
        page_token = None
        while True:
            params = {
                "part": "snippet",
                "videoId": video_id,
                "maxResults": 100,
                "order": "time",
            }
            if page_token:
                params["pageToken"] = page_token
            response = api_get("commentThreads", **params)
            reached_older_comments = False
            for item in response.get("items", []):
                comment = item["snippet"]["topLevelComment"]["snippet"]
                published_at = comment.get("publishedAt", "")
                if start.isoformat() <= published_at < end.isoformat():
                    comments.append(
                        {
                            "author": comment.get("authorDisplayName", ""),
                            "text": comment.get("textDisplay", ""),
                            "publishedAt": published_at,
                        }
                    )
                if published_at < start.isoformat():
                    reached_older_comments = True
            if reached_older_comments or not response.get("nextPageToken"):
                break
            page_token = response["nextPageToken"]
    except requests.HTTPError as error:
        if error.response is None or error.response.status_code != 403:
            raise

    payload = {
        "date": target.isoformat(),
        "uploadedDate": upload_date.isoformat(),
        "video": {
            "id": video_id,
            "title": snippet.get("title", ""),
            "description": snippet.get("description", ""),
            "uploadedAt": snippet.get("publishedAt", ""),
        },
        "comments": comments,
        "source": f"https://www.youtube.com/watch?v={video_id}",
        "playlist": f"https://www.youtube.com/playlist?list={PLAYLIST_ID}",
    }
    DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {DATA} for {target.isoformat()} using video uploaded on {upload_date.isoformat()} (UTC)")
    print(f"Comments from that date: {len(comments)}")


if __name__ == "__main__":
    main()
