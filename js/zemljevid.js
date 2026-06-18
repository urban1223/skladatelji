/* ==========================================================================
   LEAFLET ZEMLJEVIDI IN NAVIGACIJA
   ========================================================================== */

let mapInstance = null;
let mapMarkersArray = []; 
let currentMapMarkerIndex = -1;

const GEO_COORDINATES = {
    "Ljubljana": [46.0569, 14.5058],
    "Graz": [47.0707, 15.4395],
    "Gradec": [47.0707, 15.4395],
    "Vienna": [48.2082, 16.3738],
    "Dunaj": [48.2082, 16.3738],
    "Salzburg": [47.8095, 13.0550],
    "Venice": [45.4408, 12.3155],
    "Benetke": [45.4408, 12.3155],
    "Rome": [41.9028, 12.4964],
    "Rim": [41.9028, 12.4964],
    "London": [51.5074, -0.1278],
    "Paris": [48.8566, 2.3522],
    "Pariz": [48.8566, 2.3522],
    "Leipzig": [51.3397, 12.3731],
    "Dresden": [51.0504, 13.7373],
    "Hamburg": [53.5511, 9.9937],
    "Prague": [50.0755, 14.4378],
    "Praga": [50.0755, 14.4378]
};

async function renderJourneyDiagram(musician) {
    const mapContainer = document.getElementById('journey-map');
    const navPanel = document.getElementById('map-navigation-panel');
    const journeyContainer = document.getElementById('composer-journey-container');

    if (navPanel) navPanel.style.display = 'flex'; 
    if (mapContainer) mapContainer.style.height = '350px'; 
    if (journeyContainer) {
        const titleEl = journeyContainer.querySelector('h3');
        if (titleEl) titleEl.textContent = "Zemljevid potovanj skladatelja";
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
        mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted);">Ni podatkov o dogodkih za zemljevid.</div>`;
        return;
    }

    // Pomožna funkcija za čakanje (prepreči blokado API-ja)
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    
    const sortedEvents = [...musician.events].sort((a, b) => (parseYear(a.year) || 9999) - (parseYear(b.year) || 9999));
    const travelStations = [];
    
    for (const ev of sortedEvents) {
        if (!ev.location || ev.location.trim() === '') continue;
        
        const locName = ev.location.trim();
        let coords = GEO_COORDINATES[locName];

        if (!coords) {
            // Počakamo 1.2 sekunde med klici, da ne preobremenimo strežnika
            await sleep(1200); 
            
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locName)}&limit=1`, {
                    headers: { 'User-Agent': 'BaroqueArchiveApp/1.0' }
                });
                const data = await response.json();
                
                if (data && data.length > 0) {
                    coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                    GEO_COORDINATES[locName] = coords; // Shranimo za naslednjič
                }
            } catch (err) {
                console.error("Napaka pri iskanju:", locName);
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
        mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted);">V kronologiji ni vpisanih znanih krajev za prikaz na zemljevidu.</div>`;
        return;
    }

    try {
        mapInstance = L.map('journey-map', { attributionControl: false }).setView(travelStations[0].coords, 4);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapInstance);

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
                    <i style="font-size: 11px; color: #666;">Obdobje: ${yearsDisplay}</i>
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
        console.error("Napaka pri potovalnem diagramu:", err);
    }
}

function updateMapNavDisplay() {
    const statusText = document.getElementById('map-nav-status');
    const placeText = document.getElementById('map-nav-current-place');
    if (!statusText || !placeText) return;

    if (mapMarkersArray.length === 0) {
        statusText.textContent = "Postaja: 0 / 0";
        placeText.textContent = "Ni podatkov za pot.";
        return;
    }

    if (currentMapMarkerIndex === -1) {
        statusText.textContent = `Skupno postaj: ${mapMarkersArray.length}`;
        placeText.textContent = "Klikni 'Naslednja' za začetek poti (Postaja 1)";
    } else {
        const current = mapMarkersArray[currentMapMarkerIndex];
        statusText.textContent = `Postaja: ${currentMapMarkerIndex + 1} / ${mapMarkersArray.length}`;
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
    if (titleEl) titleEl.textContent = `Lokacija: ${locationName}`;
    mapContainer.style.setProperty('height', '550px', 'important');

    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    function drawMarker(coords) {
        try {
            mapInstance = L.map('journey-map', { attributionControl: false }).setView(coords, 8);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapInstance);

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

    mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">Iščem koordinate za kraj "${locationName}"...</div>`;

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1`)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                mapContainer.innerHTML = '';
                drawMarker([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
            } else {
                mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">Koordinat za kraj "${locationName}" ni mogoče najti.</div>`;
            }
        })
        .catch(err => {
            console.error(err);
            mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">Napaka pri povezavi z iskalnikom.</div>`;
        });
}