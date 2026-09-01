/* Loads the day's verse, gospel, reflection, and Full Tank video on every page
 * load. Per-day results are cached in localStorage so reloads on the same day
 * are instant; the next day the cache key changes and content is refetched.
 *
 * Layered precedence (highest first):
 *   1. Per-region override in data/location-content.json (or the configured
 *      aggregation endpoint, which PrayerLocationContent.load() already
 *      consults and merges in).
 *   2. Live API fetch (bible-api.com for verse/gospel text, YouTube RSS for the
 *      video, reflection.md for the reflection).
 *   3. Static data/*.json or reflection.md as the offline fallback.
 *
 * On any failure, the function returns whatever the next layer produces; the
 * caller is responsible for rendering. Errors are logged but never thrown so
 * the page still renders something. */
window.DailyContent = (() => {
  const BIBLE_API = 'https://bible-api.com/';
  const YOUTUBE_RSS = 'https://www.youtube.com/feeds/videos.xml';
  const PLAYLIST_ID = 'PLA_KgzimUIuXyOcP5WtOYLwdCogSXYdgz';
  const CACHE_PREFIX = 'daily-content:v2:';
  const VIDEO_LOOKBACK_HOURS = 36;

  function cacheKey(kind, date, region) {
    return `${CACHE_PREFIX}${kind}:${region || 'global'}:${date}`;
  }

  function todayISO(now, timeZone) {
    const d = now || new Date();
    if (!timeZone) timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d).reduce((values, part) => {
      if (part.type !== 'literal') values[part.type] = part.value;
      return values;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function readCache(kind, date, region) {
    try {
      const raw = localStorage.getItem(cacheKey(kind, date, region));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === date && parsed.region === region) return parsed;
    } catch (error) {
      console.warn('DailyContent cache read failed', error);
    }
    return null;
  }

  function writeCache(kind, date, region, payload) {
    try {
      localStorage.setItem(cacheKey(kind, date, region), JSON.stringify(Object.assign({date, region}, payload)));
    } catch (error) {
      console.warn('DailyContent cache write failed', error);
    }
  }

  function cleanWhitespace(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function isForDate(content, date) {
    return content && content.date === date;
  }

  function passageUrl(reference, translation) {
    const encoded = reference.replace(/\s+/g, '+');
    const params = translation ? `?translation=${encodeURIComponent(translation)}` : '';
    return `${BIBLE_API}${encoded}${params}`;
  }

  async function fetchPassageText(reference, translation) {
    const url = passageUrl(reference, translation);
    const response = await fetch(url, {headers: {Accept: 'application/json'}, cache: 'no-store'});
    if (!response.ok) throw new Error(`Bible API ${response.status}`);
    const json = await response.json();
    const text = cleanWhitespace(json.text || '');
    if (!text) throw new Error('Bible API returned no text');
    return text;
  }

  async function fetchStaticJson(url) {
    const response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Static fetch ${response.status}: ${url}`);
    return response.json();
  }

  async function fetchReflectionMarkdown() {
    const response = await fetch('reflection.md', {cache: 'no-store'});
    if (!response.ok) throw new Error(`reflection.md ${response.status}`);
    return response.text();
  }

  function findReflectionSection(markdown, date) {
    const target = new Date(`${date}T12:00:00Z`);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    // Look for the date format in reflection.md: ## 2026-01-01 — Title
    const datePattern = `## ${date}`;
    const idx = markdown.indexOf(datePattern);
    if (idx < 0) return null;

    // Get the section content until the next ## or ---
    const tail = markdown.slice(idx);
    const sectionEnd = tail.search(/\n## /);
    const sectionText = sectionEnd === -1 ? tail : tail.slice(0, sectionEnd);

    // Extract Reflect, Prayer, and Saint of the Day sections (### headers)
    const reflectMatch = sectionText.match(/### Reflect\s*\n\s*([\s\S]*?)(?=\n### |---|\n## |$)/i);
    const prayerMatch = sectionText.match(/### Prayer\s*\n\s*([\s\S]*?)(?=\n### |---|\n## |$)/i);
    const saintMatch = sectionText.match(/### Saint of the Day\s*\n\s*([^\n]+)/i);

    const reflect = reflectMatch ? cleanWhitespace(reflectMatch[1]) : '';
    const prayer = prayerMatch ? cleanWhitespace(prayerMatch[1]) : '';
    const saint = saintMatch ? saintMatch[1].trim() : '';

    return { reflect, prayer, saint };
  }

  function parseRssEntries(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('YouTube RSS parse error');
    const entries = [...doc.getElementsByTagName('entry')];
    return entries.map((entry) => {
      const videoId = entry.getElementsByTagNameNS('http://www.youtube.com/xml/schemas/2015', 'videoId')[0]?.textContent || '';
      const title = entry.getElementsByTagName('title')[0]?.textContent || '';
      const published = entry.getElementsByTagName('published')[0]?.textContent || '';
      const link = entry.getElementsByTagName('link')[0]?.getAttribute('href') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
      return {videoId, title, published, link};
    });
  }

  function pickVideoForToday(entries, now) {
    if (!entries.length) return null;
    const cutoff = now.getTime() - VIDEO_LOOKBACK_HOURS * 60 * 60 * 1000;
    const recent = entries
      .map((entry) => ({entry, when: new Date(entry.published).getTime()}))
      .filter((row) => !Number.isNaN(row.when) && row.when <= now.getTime() && row.when >= cutoff)
      .sort((a, b) => b.when - a.when);
    return (recent[0] && recent[0].entry) || entries[0];
  }

  async function getContext(now) {
    const location = await PrayerLocationContent.load();
    const date = todayISO(now, location.timeZone);
    return {now: now || new Date(), date, location};
  }

  async function fetchVideoFromRss(now) {
    const url = `${YOUTUBE_RSS}?playlist_id=${encodeURIComponent(PLAYLIST_ID)}`;
    const response = await fetch(url, {headers: {Accept: 'application/atom+xml'}, cache: 'no-store'});
    if (!response.ok) throw new Error(`YouTube RSS ${response.status}`);
    const xml = await response.text();
    const entries = parseRssEntries(xml);
    const entry = pickVideoForToday(entries, now);
    if (!entry || !entry.videoId) throw new Error('YouTube RSS returned no playable entry');
    return {
      id: entry.videoId,
      title: entry.title,
      description: '',
      uploadedAt: entry.published,
      source: entry.link,
      playlist: `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`,
    };
  }

  /* Public API */

  async function getVerse(now) {
    const context = await getContext(now);
    const {date, location} = context;
    const cached = readCache('verse', date, location.region);
    if (cached) return cached;

    const regionOverride = (location.content && location.content.verse) || null;
    if (isForDate(regionOverride, date) && regionOverride.text) {
      const result = {reference: regionOverride.reference || '', text: regionOverride.text, translation: regionOverride.translation || '', source: 'region'};
      writeCache('verse', date, location.region, result);
      return Object.assign({date}, result);
    }

    let reference = '';
    let translation = '';
    try {
      const staticVerse = await fetchStaticJson('data/daily-verse.json');
      if (staticVerse.date !== date) throw new Error(`Verse data is dated ${staticVerse.date || 'unknown'}`);
      reference = staticVerse.reference || '';
      translation = staticVerse.translation || '';
      if (reference) {
        const liveText = await fetchPassageText(reference, translation || 'kjv');
        const result = {reference, text: liveText, translation: translation || 'KJV', source: 'bible-api.com'};
        writeCache('verse', date, location.region, result);
        return Object.assign({date}, result);
      }
    } catch (error) {
      console.warn('DailyContent.getVerse: live fetch failed, falling back', error);
    }

    try {
      const fallback = await fetchStaticJson('data/daily-verse.json');
      if (fallback.date !== date) throw new Error(`Verse fallback is dated ${fallback.date || 'unknown'}`);
      const result = {reference: fallback.reference || '', text: fallback.text || '', translation: fallback.translation || '', source: fallback.source || 'static'};
      writeCache('verse', date, location.region, result);
      return Object.assign({date}, result);
    } catch (error) {
      console.warn('DailyContent.getVerse: static fallback failed', error);
      return {date, reference: '', text: 'Today’s verse will appear here shortly.', translation: '', source: 'placeholder'};
    }
  }

  async function getGospel(now) {
    const context = await getContext(now);
    const {date, location} = context;
    const cached = readCache('gospel', date, location.region);
    if (cached) return cached;

    const regionOverride = (location.content && location.content.gospel) || null;
    if (isForDate(regionOverride, date) && regionOverride.text) {
      const result = {reference: regionOverride.reference || '', text: regionOverride.text, translation: regionOverride.translation || '', source: 'region'};
      writeCache('gospel', date, location.region, result);
      return Object.assign({date}, result);
    }

    try {
      const staticGospel = await fetchStaticJson('data/daily-gospel.json');
      if (staticGospel.date !== date) throw new Error(`Gospel data is dated ${staticGospel.date || 'unknown'}`);
      const reference = staticGospel.reference || '';
      const translation = staticGospel.translation || 'kjv';
      if (reference) {
        const liveText = await fetchPassageText(reference, translation);
        const result = {reference, text: liveText, translation: translation.toUpperCase(), source: staticGospel.source || 'Vatican News'};
        writeCache('gospel', date, location.region, result);
        return Object.assign({date}, result);
      }
      const fallback = {reference: staticGospel.reference || '', text: staticGospel.text || '', translation: staticGospel.translation || '', source: staticGospel.source || 'static'};
      writeCache('gospel', date, location.region, fallback);
      return Object.assign({date}, fallback);
    } catch (error) {
      console.warn('DailyContent.getGospel failed', error);
      return {date, reference: '', text: 'Today’s Gospel will appear here shortly.', translation: '', source: 'placeholder'};
    }
  }

  async function getReflection(now) {
    const context = await getContext(now);
    const {date, location} = context;
    const cached = readCache('reflection', date, location.region);
    if (cached) return cached;

    const regionOverride = (location.content && location.content.reflection) || null;
    if (isForDate(regionOverride, date) && regionOverride.text) {
      const result = {text: regionOverride.text, source: regionOverride.source || 'region', date};
      writeCache('reflection', date, location.region, result);
      return result;
    }

    try {
      const markdown = await fetchReflectionMarkdown();
      const section = findReflectionSection(markdown, date);
      if (section) {
        const result = {
          reflect: section.reflect || '',
          prayer: section.prayer || '',
          saint: section.saint || '',
          source: 'reflection.md',
          date
        };
        writeCache('reflection', date, location.region, result);
        return result;
      }
    } catch (error) {
      console.warn('DailyContent.getReflection: reflection.md fetch failed', error);
    }

    try {
      const staticGospel = await fetchStaticJson('data/daily-gospel.json');
      if (staticGospel.date !== date) throw new Error(`Reflection fallback is dated ${staticGospel.date || 'unknown'}`);
      const result = {
        reflect: staticGospel.text || '',
        prayer: '',
        saint: '',
        source: 'daily-gospel.json',
        date
      };
      writeCache('reflection', date, location.region, result);
      return result;
    } catch (error) {
      return {
        reflect: "Today's reflection will appear here shortly.",
        prayer: '',
        saint: '',
        source: 'placeholder',
        date
      };
    }
  }

  async function getVideo(now) {
    const context = await getContext(now);
    const {date: today, location} = context;
    const cached = readCache('video', today, location.region);
    if (cached) return cached;

    const regionOverride = (location.content && location.content.video) || null;
    if (isForDate(regionOverride, today) && regionOverride.id) {
      const result = {id: regionOverride.id, title: regionOverride.title || '', source: `https://www.youtube.com/watch?v=${regionOverride.id}`, date: today};
      writeCache('video', today, location.region, result);
      return result;
    }

    try {
      const live = await fetchVideoFromRss(context.now);
      const result = Object.assign({date: today}, live);
      writeCache('video', today, location.region, result);
      return result;
    } catch (error) {
      console.warn('DailyContent.getVideo: live RSS failed, falling back to static', error);
    }

    try {
      const fallback = await fetchStaticJson('data/videos.json');
      if (fallback.date !== today) throw new Error(`Video data is dated ${fallback.date || 'unknown'}`);
      const video = fallback.video || {};
      const result = {
        id: video.id || '',
        title: video.title || '',
        source: fallback.source || (video.id ? `https://www.youtube.com/watch?v=${video.id}` : ''),
        date: today,
        uploadedDate: fallback.uploadedDate || '',
      };
      writeCache('video', today, location.region, result);
      return result;
    } catch (error) {
      console.warn('DailyContent.getVideo: static fallback failed', error);
      return {id: '', title: '', source: '', date: today};
    }
  }

  function clearToday() {
    const date = todayISO();
    try {
      Object.keys(localStorage).filter(key => key.startsWith(CACHE_PREFIX) && key.endsWith(`:${date}`)).forEach(key => localStorage.removeItem(key));
    } catch (error) { /* ignore */ }
  }

  return {getVerse, getGospel, getReflection, getVideo, clearToday, todayISO};
})();
