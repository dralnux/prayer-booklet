/* Resolves coarse, aggregated regional content without requesting precise location. */
window.PrayerLocationContent = (() => {
  const profileUrl = 'data/location-content.json';
  let locationPromise;

  function localRegion() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const language = navigator.language || '';
    if (/America\/(New_York|Chicago|Denver|Los_Angeles|Anchorage|Hawaii)/.test(timezone) || /^en-US/i.test(language)) return 'us';
    if (/Asia\/(Manila|Singapore|Hong_Kong|Kuala_Lumpur)/.test(timezone) || /^en-PH/i.test(language)) return 'ph';
    if (/Africa\/(Lagos|Accra|Johannesburg)/.test(timezone) || /^en-NG/i.test(language)) return 'ng';
    if (/Europe\/(London|Dublin)/.test(timezone) || /^en-(GB|IE)/i.test(language)) return 'gb';
    if (/Australia\//.test(timezone) || /^en-AU/i.test(language)) return 'au';
    return 'global';
  }

  async function load() {
    if (locationPromise) return locationPromise;
    locationPromise = resolveLocation();
    return locationPromise;
  }

  async function resolveLocation() {
    const profile = await fetch(profileUrl, {cache: 'no-store'}).then(response => {
      if (!response.ok) throw new Error('Location profile unavailable');
      return response.json();
    });
    let region = localRegion();
    let source = 'browser';
    const endpoint = window.PRAYER_LOCATION_ENDPOINT || profile.aggregationEndpoint;
    if (endpoint) {
      try {
        const response = await fetch(endpoint, {headers: {Accept: 'application/json'}, cache: 'no-store'});
        if (response.ok) {
          const aggregate = await response.json();
          if (aggregate.region && profile.regions[aggregate.region]) {
            region = aggregate.region;
            source = 'aggregation';
          }
        }
      } catch (error) {
        console.warn('Location aggregation unavailable; using local fallback.', error);
      }
    }
    if (source === 'browser' && profile.locationEndpoint) {
      try {
        const response = await fetch(profile.locationEndpoint, {headers: {Accept: 'application/json'}, cache: 'no-store'});
        if (response.ok) {
          const location = await response.json();
          const countryRegion = profile.countryRegions[location.country_code];
          if (countryRegion && profile.regions[countryRegion]) {
            region = countryRegion;
            source = 'visitor-location';
          }
        }
      } catch (error) {
        console.warn('Visitor location unavailable; using local fallback.', error);
      }
    }
    const selected = profile.regions[region] || profile.regions[profile.defaultRegion] || {};
    return {
      region,
      source,
      label: selected.label || 'Global',
      content: selected,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    };
  }

  function merge(base, override) {
    return Object.assign({}, base, override || {});
  }

  return {load, merge};
})();
