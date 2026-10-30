const fs = require('fs');

// Read the RSS feed XML file
const xml = fs.readFileSync('feed.xml', 'utf8');

// Extract first video entry
const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
if (!entryMatch) {
  console.error('No video entries found in RSS feed');
  process.exit(1);
}

const entry = entryMatch[1];

// Extract video ID
const idMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
const videoId = idMatch ? idMatch[1] : null;

// Extract title and decode HTML entities
const titleMatch = entry.match(/<title>(.*?)<\/title>/);
let title = titleMatch ? titleMatch[1] : null;
if (title) {
  title = title
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Extract published date
const publishedMatch = entry.match(/<published>(.*?)<\/published>/);
const publishedAt = publishedMatch ? publishedMatch[1] : null;

if (!videoId || !title) {
  console.error('Failed to parse video data');
  process.exit(1);
}

const videoData = {
  id: videoId,
  title: title,
  publishedAt: publishedAt,
  source: `https://www.youtube.com/watch?v=${videoId}`
};

// Write to JSON file
fs.writeFileSync('data/arun-gogna-video.json', JSON.stringify(videoData, null, 2) + '\n');
console.log('Video data updated successfully:', videoData);
