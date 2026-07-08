/* ==========================================================================
   LEAFLET MAPS AND NAVIGATION
   ========================================================================== */

let mapInstance = null;
let mapMarkersArray = [];
let currentMapMarkerIndex = -1;

const MAP_THEME_KEY = 'zemljevid_tema';

function getMapTileUrl() {
    const theme = localStorage.getItem(MAP_THEME_KEY) || 'dark';
    return theme === 'light'
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
}

function updateMapThemeToggleLabel() {
    const btn = document.getElementById('map-theme-toggle-btn');
    if (!btn) return;
    const theme = localStorage.getItem(MAP_THEME_KEY) || 'dark';
    btn.textContent = theme === 'light' ? '🌙 Dark map' : '☀️ Light map';
}

// Re-renders whichever map view (musician / year / location) is currently open
// with the newly chosen tile theme.
function toggleMapTheme() {
    const current = localStorage.getItem(MAP_THEME_KEY) || 'dark';
    localStorage.setItem(MAP_THEME_KEY, current === 'dark' ? 'light' : 'dark');
    updateMapThemeToggleLabel();

    const state = history.state;
    if (state && state.view === 'musician' && state.id) {
        const m = musicians.find(item => item.id === state.id);
        if (m && typeof renderJourneyDiagram === 'function') renderJourneyDiagram(m);
    } else if (state && state.view === 'year' && state.year) {
        if (typeof filterByYear === 'function') filterByYear(state.year, false);
    } else if (state && state.view === 'location' && state.location) {
        if (typeof filterByLocation === 'function') filterByLocation(state.location, false);
    }
}

const GEO_COORDINATES = {
    "Ljubljana": [46.0569, 14.5058],
    "Graz": [47.0707, 15.4395],
    "Vienna": [48.2082, 16.3738],
    "Salzburg": [47.8095, 13.0550],
    "Venice": [45.4408, 12.3155],
    "Rome": [41.9028, 12.4964],
    "London": [51.5074, -0.1278],
    "Paris": [48.8566, 2.3522],
    "Leipzig": [51.3397, 12.3731],
    "Dresden": [51.0504, 13.7373],
    "Hamburg": [53.5511, 9.9937],
    "Prague": [50.0755, 14.4378]
};

async function renderJourneyDiagram(musician) {
    const mapContainer = document.getElementById('journey-map');
    const navPanel = document.getElementById('map-navigation-panel');
    const journeyContainer = document.getElementById('composer-journey-container');

    if (navPanel) navPanel.style.display = 'flex'; 
    if (mapContainer) mapContainer.style.height = '350px'; 
    if (journeyContainer) {
        const titleEl = journeyContainer.querySelector('h3');
        if (titleEl) titleEl.textContent = "Composer's travel map";
    }

    if (!mapContainer) return;

    mapMarkersArray = [];
    currentMapMarkerIndex = -1;
    updateMapNavDisplay();

    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    if (!musician.events || musician.events.length === 0) {
        mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted);">No event data available for the map.</div>`;
        return;
    }

    const sortedEvents = [...musician.events].sort((a, b) => (parseYear(a.year) || 9999) - (parseYear(b.year) || 9999));
    const travelStations = [];
    
    for (const ev of sortedEvents) {
        if (!ev.location || ev.location.trim() === '') continue;
        
        const locName = ev.location.trim();
        let coords = GEO_COORDINATES[locName];

        if (!coords && typeof window.resolveLocationData === 'function') {
            // Skupni Firebase "locations" cache (js/lokacije.js): najprej Firebase,
            // šele nato zunanji geokoder, uspeh se shrani nazaj za vse uporabnike.
            try {
                const data = await window.resolveLocationData(locName);
                if (data) {
                    coords = [data.lat, data.lon];
                    GEO_COORDINATES[locName] = coords; // in-memory cache za to sejo
                }
            } catch (err) {
                console.error("Error searching for:", locName, err);
            }
        }

        if (coords) {
            const lastStation = travelStations[travelStations.length - 1];
            if (lastStation && lastStation.name === locName) {
                lastStation.endYear = ev.year;
                lastStation.eventTexts.push(`${ev.year}: ${ev.text}`);
            } else {
                travelStations.push({
                    name: locName,
                    coords: coords,
                    startYear: ev.year,
                    endYear: ev.year,
                    eventTexts: [`${ev.year}: ${ev.text}`]
                });
            }
        }
    }

    if (travelStations.length === 0) {
        mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted);">No known locations in the chronology to display on the map.</div>`;
        return;
    }

    try {
        mapInstance = L.map('journey-map', { attributionControl: false }).setView(travelStations[0].coords, 4);
        L.tileLayer(getMapTileUrl()).addTo(mapInstance);
        updateMapThemeToggleLabel();

        const latlngs = [];
        travelStations.forEach((station, index) => {
            const orderNumber = index + 1;
            let finalCoords = [...station.coords];
            latlngs.push(finalCoords);

            const yearsDisplay = (station.startYear === station.endYear || !station.endYear) 
                ? station.startYear 
                : `${station.startYear}–${station.endYear}`;

            const numberIcon = L.divIcon({
                className: 'custom-map-number-container',
                html: `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="background-color: var(--amber); color: #000; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.4);">${orderNumber}</div>
                        <div style="background: rgba(0, 0, 0, 0.85); color: #fff; font-size: 9px; padding: 1px 4px; border-radius: 3px; margin-top: 2px; white-space: nowrap; border: 1px solid rgba(255,255,255,0.2);">${yearsDisplay}</div>
                    </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 11]
            });

            const popupHTML = `
                <div style="color: #000; font-family: sans-serif; max-height: 180px; overflow-y: auto; min-width: 180px;">
                    <b style="font-size: 13px; color: #b45309;">${orderNumber}. ${station.name}</b><br>
                    <i style="font-size: 11px; color: #666;">Period: ${yearsDisplay}</i>
                    <hr style="margin: 6px 0; border: 0; border-top: 1px solid #ddd;">
                    <div style="font-size: 11px; line-height: 1.4; max-height: 100px; overflow-y:auto;">
                        ${station.eventTexts.map(t => `• ${t}`).join('<br>')}
                    </div>
                </div>
            `;

            const marker = L.marker(finalCoords, { icon: numberIcon })
                .addTo(mapInstance)
                .bindPopup(popupHTML);

            mapMarkersArray.push({
                leafletMarker: marker,
                name: station.name,
                years: yearsDisplay
            });
        });

        if (latlngs.length > 1) {
            const polyline = L.polyline(latlngs, {
                color: 'var(--amber)',
                weight: 2,
                opacity: 0.6,
                dashArray: '4, 6'
            }).addTo(mapInstance);
            mapInstance.fitBounds(polyline.getBounds(), { padding: [80, 80] });
        }

        updateMapNavDisplay();
        mapInstance.invalidateSize();
    } catch (err) {
        console.error("Error with the travel diagram:", err);
    }
}

function updateMapNavDisplay() {
    const statusText = document.getElementById('map-nav-status');
    const placeText = document.getElementById('map-nav-current-place');
    if (!statusText || !placeText) return;

    if (mapMarkersArray.length === 0) {
        statusText.textContent = "0 / 0";
        placeText.textContent = "No route.";
        return;
    }

    if (currentMapMarkerIndex === -1) {
        statusText.textContent = `${mapMarkersArray.length} stations`;
        placeText.textContent = "Click to start";
    } else {
        const current = mapMarkersArray[currentMapMarkerIndex];
        statusText.textContent = `${currentMapMarkerIndex + 1} / ${mapMarkersArray.length}`;
        placeText.textContent = `${current.name} (${current.years})`;
    }
}

function navigateMap(direction) {
    if (mapMarkersArray.length === 0 || !mapInstance) return;

    currentMapMarkerIndex += direction;
    if (currentMapMarkerIndex < 0) currentMapMarkerIndex = 0;
    if (currentMapMarkerIndex >= mapMarkersArray.length) currentMapMarkerIndex = mapMarkersArray.length - 1;

    const target = mapMarkersArray[currentMapMarkerIndex];
    mapInstance.setView(target.leafletMarker.getLatLng(), 7);
    target.leafletMarker.openPopup();
    updateMapNavDisplay();
}

function renderLocationMap(locationName) {
    const mapContainer = document.getElementById('journey-map');
    const journeyContainer = document.getElementById('composer-journey-container');
    const navPanel = document.getElementById('map-navigation-panel');
    
    if (!mapContainer || !journeyContainer) return;
    if (navPanel) navPanel.style.setProperty('display', 'none', 'important');

    const titleEl = journeyContainer.querySelector('h3');
    if (titleEl) titleEl.textContent = `Location: ${locationName}`;
    mapContainer.style.setProperty('height', '550px', 'important');

    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    function drawMarker(coords) {
        try {
            mapInstance = L.map('journey-map', { attributionControl: false }).setView(coords, 8);
            L.tileLayer(getMapTileUrl()).addTo(mapInstance);
            updateMapThemeToggleLabel();

            const locationIcon = L.divIcon({
                className: 'custom-map-location-container',
                html: `<div style="background-color: var(--amber); color: #000; border-radius: 50%; width: 16px; height: 16px; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            L.marker(coords, { icon: locationIcon })
                .addTo(mapInstance)
                .bindPopup(`<b style="color: #000;">${locationName}</b>`)
                .openPopup();

            mapInstance.invalidateSize();
        } catch (e) {
            console.error(e);
        }
    }

    if (typeof GEO_COORDINATES !== 'undefined' && GEO_COORDINATES[locationName]) {
        drawMarker(GEO_COORDINATES[locationName]);
        return;
    }

    mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">Searching coordinates for location "${locationName}"...</div>`;

    if (typeof window.resolveLocationData !== 'function') {
        mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">Error connecting to the search engine.</div>`;
        return;
    }

    // Skupni Firebase "locations" cache (js/lokacije.js): najprej Firebase,
    // šele nato zunanji geokoder, uspeh se shrani nazaj za vse uporabnike.
    window.resolveLocationData(locationName)
        .then(data => {
            if (data) {
                GEO_COORDINATES[locationName] = [data.lat, data.lon]; // in-memory cache za to sejo
                mapContainer.innerHTML = '';
                drawMarker([data.lat, data.lon]);
            } else {
                mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">Coordinates for location "${locationName}" could not be found.</div>`;
            }
        })
        .catch(err => {
            console.error(err);
            mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">Error connecting to the search engine.</div>`;
        });
}