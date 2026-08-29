import json,re,requests,os
from datetime import date,datetime,timezone
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/"data"; DATA.mkdir(exist_ok=True)
H={"User-Agent":"Catholic-Prayers-GitHub-Action/1.0"}
def html_text(url):
 r=requests.get(url,headers=H,timeout=30); r.raise_for_status()
 return BeautifulSoup(r.text,"html.parser").get_text(" ",strip=True)
def clean(s): return re.sub(r"\s+"," ",s or "").strip()
d=date.fromisoformat(os.getenv("CONTENT_DATE", datetime.now(timezone.utc).date().isoformat())); ds=d.isoformat()

# 1) Vatican News supplies the official liturgical Gospel reference for the date.
vu=f"https://www.vaticannews.va/en/word-of-the-day/{d.year}/{d.month:02d}/{d.day:02d}.html"
s=html_text(vu)
m=re.search(r"Gospel of the day\s+From the Gospel according to\s+([A-Za-z]+)\s+([0-9]+:[0-9,\-]+)",s,re.I)
if not m: raise RuntimeError("Could not find the Gospel reference on Vatican News")
book, chapter_verses=m.group(1),m.group(2)
ref=f"{book} {chapter_verses}"

# 2) Fetch the complete reading in the public-domain King James Version.
# This avoids copying the copyrighted lectionary wording from Vatican News.
api_book={"Matthew":"Matthew","Mark":"Mark","Luke":"Luke","John":"John"}.get(book,book)
api_url=f"https://bible-api.com/{requests.utils.quote(api_book+' '+chapter_verses,safe='') }?translation=kjv"
r=requests.get(api_url,headers=H,timeout=30); r.raise_for_status(); bj=r.json()
gtext=clean(bj.get("text",""))
if not gtext: raise RuntimeError("Bible API returned no Gospel text")
(DATA/"daily-gospel.json").write_text(json.dumps({
 "date":ds,"title":"Daily Gospel","reference":ref,"translation":"KJV",
 "text":gtext,"source":vu,
 "text_source":"https://bible-api.com/","text_source_note":"Complete Gospel displayed in the public-domain King James Version. Vatican News is the liturgical source for the day's Gospel reference."
},ensure_ascii=False,indent=2),encoding="utf-8")

# 3) Bible.com Verse of the Day
bu="https://www.bible.com/verse-of-the-day"; bs=html_text(bu)
dm=re.search(rf"{d.strftime('%B')}\s+{d.day},\s+{d.year}",bs)
if not dm: raise RuntimeError(f"Bible.com page does not contain today's date: {ds}")
tail=bs[dm.end():] if dm else bs
rm=re.search(r"((?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+:\d+(?:-\d+)?)\s+\(([^)]+)\)",tail)
if not rm: raise RuntimeError("Could not find today's Verse of the Day reference")
ref2=f"{clean(rm.group(1))} {rm.group(2)}"
translation=rm.group(3) if rm else "NIV"
vtext=""
if rm:
 before=tail[:rm.start()]
 vtext=clean(before.split("This Weeks Bible Verses")[-1])[-700:]
 vtext=re.sub(r"^(?:(?:Share|Next)\s+)+", "", vtext, flags=re.I)
if not vtext: raise RuntimeError("Could not find today's Verse of the Day text")
(DATA/"daily-verse.json").write_text(json.dumps({"date":ds,"title":"Verse of the Day","reference":ref2,"translation":translation,"text":vtext,"source":bu},ensure_ascii=False,indent=2),encoding="utf-8")
print("Updated",ds,ref,ref2)
