import { api } from '../api.js?v=7';

export class NearbyView {
  constructor(modal) {
    this.modal = modal;
    this.container = document.getElementById('nearby-view-content');
    this.points = [];
    this.origin = null;
    this.locationAccuracyMeters = null;
    this.mapConfig = { google_maps_enabled: false };
    this.activeView = 'list';
    this.mapPromise = null;
    this.leafletPromise = null;
    this.map = null;
    this.mapProvider = null;
    this.markers = [];

    document.getElementById('nearby-origin-form')?.addEventListener('submit', event => {
      event.preventDefault();
      this.useManualOrigin();
    });
    document.getElementById('nearby-use-location')?.addEventListener('click', () => this.useBrowserLocation());
    document.getElementById('nearby-radius')?.addEventListener('change', () => this.renderResults());
    document.querySelectorAll('[data-nearby-view]').forEach(button => button.addEventListener('click', () => {
      this.activeView = button.dataset.nearbyView;
      this.updateViewMode();
    }));
  }

  async render() {
    if (!this.container) return;
    this.container.innerHTML = '<p class="text-secondary">Loading nearby places...</p>';
    const [configResponse, pointsResponse] = await Promise.all([api.getMapConfig(), api.getMapPoints()]);
    this.mapConfig = configResponse.ok ? configResponse.data : { google_maps_enabled: false };
    if (!pointsResponse.ok) {
      this.container.innerHTML = `<div class="empty-state">${escapeHtml(pointsResponse.error || 'Nearby listings are unavailable right now.')}</div>`;
      return;
    }
    this.points = pointsResponse.data || [];
    this.container.innerHTML = `
      <div class="nearby-summary"><span class="badge badge-emerald">${this.points.length} mapped places</span><span class="text-secondary">Only public campus meeting points and approximate community locations are shown.</span></div>
      <div class="nearby-view-tabs" role="tablist" aria-label="Nearby results view">
        <button type="button" class="tab-btn active" data-nearby-view="list">List</button>
        <button type="button" class="tab-btn" data-nearby-view="map">Map</button>
      </div>
      <section class="nearby-list-view" data-nearby-list-view>
        <div class="nearby-results-toolbar"><h2>Nearby books and communities</h2><label>Within <select id="nearby-radius" class="form-select"><option value="2">2 km</option><option value="5" selected>5 km</option><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option><option value="100">100 km</option></select></label></div>
        <div class="nearby-results" data-nearby-results></div>
      </section>
      <section class="nearby-map-view" data-nearby-map-view hidden>
        <div class="nearby-map-status" data-nearby-map-status role="status"></div>
        <div id="nearby-map-canvas" class="nearby-map-canvas" aria-label="Nearby map"></div>
      </section>
    `;
    this.container.querySelectorAll('[data-nearby-view]').forEach(button => button.addEventListener('click', () => {
      this.activeView = button.dataset.nearbyView;
      this.updateViewMode();
    }));
    this.container.querySelector('#nearby-radius')?.addEventListener('change', () => this.renderResults());
    this.renderResults();
    this.updateViewMode();
  }

  useManualOrigin() {
    const latitude = Number(document.getElementById('nearby-latitude')?.value);
    const longitude = Number(document.getElementById('nearby-longitude')?.value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      window.toast?.show('Enter a valid campus latitude and longitude.', 'error');
      return;
    }
    this.origin = { latitude, longitude };
    this.locationAccuracyMeters = null;
    this.showOriginStatus('Using the approximate campus point entered above.');
    this.renderResults();
    if (this.activeView === 'map') this.updateViewMode();
  }

  useBrowserLocation() {
    if (!navigator.geolocation) {
      window.toast?.show('Location is not available in this browser. Enter an approximate campus point instead.', 'info');
      return;
    }
    const button = document.getElementById('nearby-use-location');
    if (button) {
      button.disabled = true;
      button.textContent = 'Locating…';
    }
    navigator.geolocation.getCurrentPosition(position => {
      this.origin = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      this.locationAccuracyMeters = position.coords.accuracy;
      document.getElementById('nearby-latitude').value = this.origin.latitude.toFixed(6);
      document.getElementById('nearby-longitude').value = this.origin.longitude.toFixed(6);
      this.showOriginStatus(`Device location fix received. Browser-reported accuracy: about ${Math.round(this.locationAccuracyMeters)} m. The coordinates stay in this browser.`);
      this.renderResults();
      if (this.activeView === 'map') this.updateViewMode();
      window.toast?.show(`Location received (about ${Math.round(this.locationAccuracyMeters)} m accuracy).`, 'success');
      if (button) {
        button.disabled = false;
        button.textContent = 'Refresh my location';
      }
    }, error => {
      const messages = {
        1: 'Location permission was denied. Allow location access for this localhost site in your browser settings, then try again.',
        2: 'Your device could not determine its location. Check device location services or enter coordinates manually.',
        3: 'The location request timed out. Move near a window or try again.',
      };
      const message = messages[error.code] || 'Could not read your device location.';
      this.showOriginStatus(message);
      window.toast?.show(message, 'error', 6000);
      if (button) {
        button.disabled = false;
        button.textContent = 'Use my current location';
      }
    }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
  }

  showOriginStatus(message) {
    const status = document.getElementById('nearby-origin-status');
    if (status) status.textContent = message;
  }

  renderResults() {
    if (!this.container?.isConnected) return;
    const results = this.container.querySelector('[data-nearby-results]');
    if (!results) return;
    const radius = Number(this.container.querySelector('#nearby-radius')?.value || 5);
    const ranked = this.points.map(point => ({
      ...point,
      distance_km: this.origin ? haversineKm(this.origin, point) : null,
    })).filter(point => point.distance_km == null || point.distance_km <= radius)
      .sort((left, right) => (left.distance_km ?? Infinity) - (right.distance_km ?? Infinity));
    if (!ranked.length) {
      results.innerHTML = '<div class="empty-state">No location-tagged books or communities are in this radius. Try a larger distance or use Discover to browse all available books.</div>';
      return;
    }
    results.innerHTML = ranked.map(point => `
      <article class="nearby-result">
        <span class="nearby-point-icon ${point.point_type}" aria-hidden="true">${point.point_type === 'book' ? '▤' : '◉'}</span>
        <div class="nearby-result-copy"><div class="nearby-result-heading"><span class="badge ${point.point_type === 'book' ? 'badge-emerald' : 'badge-indigo'}">${point.point_type === 'book' ? 'Book' : 'Community'}</span>${point.is_seed_data ? '<span class="badge badge-amber">Demo data</span>' : ''}</div><h3>${escapeHtml(point.title)}</h3><p>${escapeHtml(point.subtitle)}</p><small>Safe meeting point: ${escapeHtml(point.location_name)}${point.distance_km == null ? ' · Set an approximate campus point to calculate distance' : ` · ${point.distance_km.toFixed(1)} km away`}</small></div>
        <div class="nearby-result-actions">${point.point_type === 'book' ? `<button type="button" class="btn btn-outline btn-sm" data-nearby-book="${escapeHtml(point.id)}">Details</button>` : `<button type="button" class="btn btn-outline btn-sm" data-nearby-community="${escapeHtml(point.id)}">Community</button>`}<a class="btn btn-ghost btn-sm" href="https://www.google.com/maps/dir/?api=1&destination=${point.latitude}%2C${point.longitude}" target="_blank" rel="noopener noreferrer" aria-label="Directions to ${escapeHtml(point.location_name)}">Directions</a></div>
      </article>
    `).join('');
    results.querySelectorAll('[data-nearby-book]').forEach(button => button.addEventListener('click', () => this.openBook(button.dataset.nearbyBook)));
    results.querySelectorAll('[data-nearby-community]').forEach(button => button.addEventListener('click', () => window.bookloopCommunities?.openCommunity(button.dataset.nearbyCommunity)));
  }

  async openBook(bookId) {
    const response = await api.getBook(bookId);
    if (!response.ok) {
      window.toast?.show(response.error || 'Could not load this listing.', 'error');
      return;
    }
    this.modal.openBook(normalizeBook(response.data));
  }

  updateViewMode() {
    const listView = this.container?.querySelector('[data-nearby-list-view]');
    const mapView = this.container?.querySelector('[data-nearby-map-view]');
    if (!listView || !mapView) return;
    listView.hidden = this.activeView !== 'list';
    mapView.hidden = this.activeView !== 'map';
    this.container.querySelectorAll('[data-nearby-view]').forEach(button => button.classList.toggle('active', button.dataset.nearbyView === this.activeView));
    if (this.activeView === 'map') this.renderMap();
  }

  async renderMap() {
    const status = this.container.querySelector('[data-nearby-map-status]');
    const canvas = this.container.querySelector('#nearby-map-canvas');
    canvas.hidden = false;
    if (this.mapConfig.google_maps_enabled && this.mapConfig.google_maps_api_key) {
      try {
        await this.renderGoogleMap(status, canvas);
        return;
      } catch {
        status.innerHTML = '<strong>Google Maps did not load.</strong><span>Switching to the OpenStreetMap fallback.</span>';
      }
    }
    if (!this.mapConfig.google_maps_enabled || !this.mapConfig.google_maps_api_key) {
      status.innerHTML = '<strong>Map active · OpenStreetMap</strong><span>Google Maps is optional.</span>';
    }
    await this.renderOpenStreetMap(status, canvas);
  }

  async renderGoogleMap(status, canvas) {
    status.textContent = 'Loading Google Maps…';
    await this.loadGoogleMaps(this.mapConfig.google_maps_api_key);
    const center = this.origin || (this.points[0] && { latitude: this.points[0].latitude, longitude: this.points[0].longitude });
    if (!center) {
      status.innerHTML += '<span>Choose a campus point or add a location-tagged listing to center the map.</span>';
      return;
    }
    if (this.mapProvider === 'leaflet' && this.map) this.map.remove();
    this.markers.forEach(marker => marker.setMap(null));
    this.map = new google.maps.Map(canvas, {
      center: { lat: center.latitude, lng: center.longitude },
      zoom: this.origin ? 13 : 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
    this.mapProvider = 'google';
    this.markers = [];
    const infoWindow = new google.maps.InfoWindow();
    const points = this.points.map(point => ({ ...point, distance_km: this.origin ? haversineKm(this.origin, point) : null }));
    for (const point of points) {
      const marker = new google.maps.Marker({
        map: this.map,
        position: { lat: point.latitude, lng: point.longitude },
        title: point.title,
        label: point.point_type === 'book' ? 'B' : 'C',
      });
      marker.addListener('click', () => {
        const detail = document.createElement('div');
        detail.className = 'map-info-window';
        detail.innerHTML = `<strong>${escapeHtml(point.title)}</strong><span>${escapeHtml(point.subtitle)}</span><span>${escapeHtml(point.location_name)}</span>${point.distance_km == null ? '' : `<span>${point.distance_km.toFixed(1)} km away</span>`}`;
        infoWindow.setContent(detail);
        infoWindow.open({ map: this.map, anchor: marker });
      });
      this.markers.push(marker);
    }
    status.textContent = `${points.length} public meeting points on Google Maps.`;
  }

  async renderOpenStreetMap(status, canvas) {
    const center = this.origin || (this.points[0] && { latitude: this.points[0].latitude, longitude: this.points[0].longitude });
    if (!center) {
      status.innerHTML += '<span>No public map locations have been added yet. Set a campus point to center the map, or add a safe meeting point to a book or community to create public markers.</span>';
      canvas.hidden = true;
      return;
    }
    status.innerHTML += '<span>Map tiles and markers are provided by OpenStreetMap.</span>';
    canvas.hidden = false;
    try {
      await this.loadLeaflet();
      if (this.mapProvider === 'google') this.markers.forEach(marker => marker.setMap(null));
      if (this.mapProvider === 'leaflet' && this.map) this.map.remove();
      this.markers = [];
      this.map = window.L.map(canvas, { scrollWheelZoom: false }).setView([center.latitude, center.longitude], this.origin ? 13 : 11);
      this.mapProvider = 'leaflet';
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);
      const points = this.points.map(point => ({ ...point, distance_km: this.origin ? haversineKm(this.origin, point) : null }));
      for (const point of points) {
        const markerIcon = window.L.divIcon({
          className: 'nearby-leaflet-marker',
          html: `<span class="nearby-leaflet-pin ${point.point_type}">${point.point_type === 'book' ? 'B' : 'C'}</span>`,
          iconSize: [30, 38],
          iconAnchor: [15, 38],
          popupAnchor: [0, -34],
        });
        const marker = window.L.marker([point.latitude, point.longitude], { icon: markerIcon }).addTo(this.map);
        marker.bindPopup(`<div class="map-info-window"><strong>${escapeHtml(point.title)}</strong><span>${escapeHtml(point.subtitle)}</span><span>${escapeHtml(point.location_name)}</span>${point.distance_km == null ? '' : `<span>${point.distance_km.toFixed(1)} km away</span>`}</div>`);
        this.markers.push(marker);
      }
      if (this.origin) {
        window.L.circleMarker([this.origin.latitude, this.origin.longitude], {
          radius: 7,
          color: '#1D4ED8',
          fillColor: '#60A5FA',
          fillOpacity: 0.9,
        }).bindPopup(`Your device location · about ${Math.round(this.locationAccuracyMeters || 0)} m accuracy · only visible in this browser`).addTo(this.map);
      }
      this.map.invalidateSize();
      const publicPointMessage = points.length
        ? `${points.length} public book/community locations shown.`
        : 'No public book/community pins yet. Add a safe campus location to a listing or community to show public pins.';
      status.innerHTML += `<span>${publicPointMessage}</span>`;
      if (this.origin) {
        status.innerHTML += `<span class="nearby-private-location-status">Your current device location is marked privately. Reported accuracy: about ${Math.round(this.locationAccuracyMeters || 0)} m. Only you can see this marker.</span>`;
      } else {
        status.innerHTML += '<span>Your location is not set. Select “Use my current location” to center the map privately.</span>';
      }
    } catch {
      status.innerHTML += '<span>The map tiles could not load. Use the nearby list and directions instead.</span>';
      canvas.hidden = true;
    }
  }

  loadGoogleMaps(apiKey) {
    if (window.google?.maps) return Promise.resolve();
    if (this.mapPromise) return this.mapPromise;
    this.mapPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
      script.async = true;
      script.onload = () => window.google?.maps ? resolve() : reject(new Error('Maps library did not initialize'));
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return this.mapPromise;
  }

  loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (this.leafletPromise) return this.leafletPromise;
    this.leafletPromise = new Promise((resolve, reject) => {
      if (!document.getElementById('leaflet-css')) {
        const stylesheet = document.createElement('link');
        stylesheet.id = 'leaflet-css';
        stylesheet.rel = 'stylesheet';
        stylesheet.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(stylesheet);
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => window.L ? resolve() : reject(new Error('Leaflet did not initialize'));
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return this.leafletPromise;
  }
}

function haversineKm(origin, point) {
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = radians(point.latitude - origin.latitude);
  const longitudeDelta = radians(point.longitude - origin.longitude);
  const originLatitude = radians(origin.latitude);
  const destinationLatitude = radians(point.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function normalizeBook(book) {
  return {
    ...book,
    conditionLabel: book.condition_label,
    listingType: book.listing_type,
    listingTypeLabel: book.listing_type_label,
    priceUnit: book.price_unit || '',
    originalPrice: book.original_price,
    coverGradient: book.cover_gradient || 'linear-gradient(135deg, #334155 0%, #64748B 100%)',
    distanceKm: book.distance_km ?? 0,
    courseCode: book.course_code || '',
    exchangeWish: book.exchange_wish || '',
    seller: {
      name: book.seller?.name || 'BookLoop Student',
      college: book.seller?.university || 'Student Campus',
      year: book.seller?.year || '',
      trustScore: book.seller?.trust_score ?? null,
      reviewsCount: book.seller?.reviews_count ?? 0,
      avatar: book.seller?.avatar_emoji || '👨‍🎓',
    },
  };
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}