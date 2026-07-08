/* ==========================================================================
   SHARED DATABASE (FIRESTORE) — musicians and events are now stored in the cloud,
   visible to all logged-in users.
   ========================================================================== */

let musicians = [];
let currentMusicianId = null;
let isEditingMusicianMode = false;

// HTML escape to prevent XSS attacks
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Save a single musician (with all events) to Firestore — with retry logic
async function shraniGlasbenikaVFirestore(m) {
    if (!window.db) { console.error("Firestore is not available."); return; }

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await window.fsSetDoc(window.fsDoc(window.db, 'musicians', m.id), m);
            return; // Success
        } catch (err) {
            lastError = err;
            console.warn(`Attempt ${attempt}/${maxRetries} failed:`, err.code);
            if (attempt < maxRetries) {
                const delayMs = Math.pow(2, attempt - 1) * 500; // 500ms, 1s, 2s
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    console.error("Final error after retries:", lastError);
    alert("Error saving to the shared database. Check your internet connection.");
}

// Delete musician from Firestore — with retry logic
async function izbrisiGlasbenikaIzFirestore(id) {
    if (!window.db) return;

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await window.fsDeleteDoc(window.fsDoc(window.db, 'musicians', id));
            return; // Success
        } catch (err) {
            lastError = err;
            console.warn(`Delete attempt ${attempt}/${maxRetries} failed:`, err.code);
            if (attempt < maxRetries) {
                const delayMs = Math.pow(2, attempt - 1) * 500;
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    console.error("Final delete error after retries:", lastError);
    alert("Error deleting from the shared database.");
}

// Load all musicians from Firestore (called on login from firebase-auth.js) — with retry logic
async function naloziGlasbenikeIzFirestore() {
    if (!window.db) { console.error("Firestore is not available."); return; }

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const snapshot = await window.fsGetDocs(window.fsCollection(window.db, 'musicians'));
            musicians = [];
            snapshot.forEach(d => musicians.push(d.data()));
            if (typeof searchMusicians === 'function') searchMusicians();
            if (typeof updateLocationLists === 'function') updateLocationLists();
            if (typeof updateLinkDropdowns === 'function') updateLinkDropdowns();
            return; // Success
        } catch (err) {
            lastError = err;
            console.warn(`Load attempt ${attempt}/${maxRetries} failed:`, err.code);
            if (attempt < maxRetries) {
                const delayMs = Math.pow(2, attempt - 1) * 500;
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    console.error("Final load error after retries:", lastError);
    alert("Error loading the shared database from Firestore.");
}
window.naloziGlasbenikeIzFirestore = naloziGlasbenikeIzFirestore;

/* ==========================================================================
   DROPDOWN MENU AND PROFILE MANAGEMENT
   ========================================================================== */

function generateId(name) { 
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'); 
}

function parseYear(yearStr) {
    if (!yearStr) return null;
    const match = yearStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
}

function toggleProfileDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    dropdown.classList.toggle('prikazi-meni');
}

function deleteMusician() {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;

    if (m.vnesUID !== window.trenutniUporabnikUID) {
        alert("You can only delete people you added yourself.");
        return;
    }

    const potrditev = confirm(`⚠️ WARNING: Are you sure you want to delete the composer "${m.name}" and all their associated events? This action cannot be undone.`);

    if (potrditev) {
        musicians = musicians.filter(item => item.id !== currentMusicianId);
        izbrisiGlasbenikaIzFirestore(m.id);
        searchMusicians();
        updateLocationLists();
        updateLinkDropdowns();
        closeDetailsView();
        alert("The person was successfully removed from the archive.");
    }
}

function exportSingleMusician() {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(m, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `archive_${m.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function copyProfileToClipboard() {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;

    let textToCopy = `${m.name} (${m.birth} – ${m.death})\n`;
    textToCopy += `========================================\n\n`;
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = generatePureSummary(m);
    textToCopy += tempDiv.textContent || tempDiv.innerText;
    textToCopy += `\n\nCHRONOLOGY AND WORKS:\n`;

    if (m.events && m.events.length > 0) {
        const sortedEvents = [...m.events].sort((a, b) => (parseYear(a.year) || 9999) - (parseYear(b.year) || 9999));
        const birthYear = parseYear(m.birth);

        sortedEvents.forEach(e => {
            let ageStr = '';
            const eventYear = parseYear(e.year);
            if (birthYear && eventYear) {
                const age = eventYear - birthYear;
                if (age >= 0 && age <= 110) ageStr = ` (${age} years old)`;
            }
            const locStr = e.location ? ` [📍 ${e.location}]` : '';
            const cleanText = e.text.replace(/\[\[(.*?)\]\]/g, '$1');
            
            textToCopy += `- ${e.year || '????'}${locStr}${ageStr}: ${cleanText}\n`;
        });
    } else {
        textToCopy += `(No events recorded)`;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
        alert(`The profile for "${m.name}" has been copied to the clipboard! You can now paste it into Word (Ctrl+V).`);
    }).catch(err => {
        alert("Error copying to clipboard.");
    });
}

/* ==========================================================================
   SEARCH AND FILTERING
   ========================================================================== */

function getAllExistingLocations() {
    const locations = new Set();
    musicians.forEach(m => {
        if (m.events) {
            m.events.forEach(e => {
                if (e.location && e.location.trim() !== '') {
                    locations.add(e.location.trim());
                }
            });
        }
    });
    return [...locations].sort((a, b) => a.localeCompare(b, 'en'));
}

function updateLocationLists() {
    const sortedLocations = getAllExistingLocations();
    const filterSelect = document.getElementById('location-filter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">-- All locations --</option>' + 
            sortedLocations.map(loc => `<option value="${loc}">${loc}</option>`).join('');
    }

    const datalist = document.getElementById('existing-locations');
    if (datalist) {
        datalist.innerHTML = sortedLocations.map(loc => `<option value="${loc}"></option>`).join('');
    }
}

function updateLinkDropdowns() {
    const sortedMusicians = [...musicians].sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const options = sortedMusicians.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    
    const eventSelect = document.getElementById('event-link-select');
    if (eventSelect) eventSelect.innerHTML = options;
}

function insertLinkFromDropdown(textareaId, selectId) {
    const area = document.getElementById(textareaId);
    const selectedName = document.getElementById(selectId).value;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const text = area.value;
    area.value = text.substring(0, start) + "[[" + selectedName + "]]" + text.substring(end, text.length);
    area.focus();
}

function renderMusicianList(data) {
    const listEl = document.getElementById('musician-list');
    listEl.innerHTML = '';
    
    data.sort((a, b) => a.name.localeCompare(b.name, 'en')).forEach(m => {
        const li = document.createElement('li');
        
        const parts = m.name.split(' ');
        const initials = parts.map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        let avatarHTML = `
            <div class="avatar-circle" style="
                background-color: var(--panel); 
                color: var(--amber); 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                font-weight: bold; 
                font-size: 14px;
                border: 2px solid var(--amber);
            ">
                ${initials}
            </div>`;
            
        if (m.img && m.img.trim() !== "") {
            avatarHTML = `<img src="${escapeHtml(m.img)}" class="avatar-circle" alt="${escapeHtml(m.name)}" style="border: 2px solid var(--amber);">`;
        }

        li.innerHTML = `${avatarHTML} <span>${escapeHtml(m.name)} (${escapeHtml(m.birth)}–${escapeHtml(m.death)})</span>`;
        li.onclick = () => showMusicianDetails(m.id);
        listEl.appendChild(li);
    });
}

function searchMusicians() {
    const filterSelect = document.getElementById('location-filter');
    if (filterSelect) filterSelect.value = "";
    
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const listEl = document.getElementById('musician-list');
    
    if (query === "") {
        renderMusicianList(musicians);
        return;
    }

    const isFourDigitYear = /^\d{4}$/.test(query);
    if (isFourDigitYear) {
        const searchYear = parseInt(query);
        filterByYear(searchYear);
        return;
    } 
    
    let filtered = musicians.filter(m => m.name.toLowerCase().includes(query));
    
    if (filtered.length === 0) {
        listEl.innerHTML = '<li style="color:var(--text-muted); cursor:default; border:none; padding: 10px;">No matches found.</li>';
    } else {
        renderMusicianList(filtered);
    }
}

document.getElementById('search-input').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (/^\d{4}$/.test(query)) {
        searchMusicians();
    } else if (!/^\d+$/.test(query)) {
        searchMusicians();
    }
});

const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (/^\d{4}$/.test(query)) {
            if (typeof searchMusicians === 'function') searchMusicians();
        } else if (!/^\d+$/.test(query)) {
            if (typeof searchMusicians === 'function') searchMusicians();
        }
    });
}

async function filterByYear(targetYear, pushHistory = true) {
    if (!targetYear) {
        closeDetailsView();
        return;
    }

    const cleanTargetYear = typeof parseYear === 'function' ? parseYear(targetYear.toString()) : parseInt(targetYear);
    
    if (!cleanTargetYear) {
        console.error("Wrong year format:", targetYear);
        return;
    }

    document.getElementById('search-input').value = "";
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');
    const geFormOverview = document.getElementById('add-global-event-form');
    if (geFormOverview) geFormOverview.classList.add('hidden');

    const detailsView = document.getElementById('details-view');
    const nameEl = document.getElementById('view-name');
    const datesEl = document.getElementById('view-dates');
    const summaryEl = document.getElementById('pure-summary');
    const timelineEl = document.getElementById('timeline');
    const titleEl = document.getElementById('timeline-title');
    const addEventBtn = document.getElementById('add-event-btn');
    const avatarContainer = document.getElementById('view-avatar-container');
    
    if (document.getElementById('profile-settings-container')) {
        document.getElementById('profile-settings-container').classList.add('hidden');
    }

    nameEl.textContent = `Year ${cleanTargetYear}`;
    datesEl.textContent = `Chronological overview of events in this year`;
    summaryEl.innerHTML = "";
    avatarContainer.innerHTML = ""; 
    titleEl.textContent = "Historical events";
    if (addEventBtn) addEventBtn.classList.add('hidden');

    let allYearEvents = [];
    
    musicians.forEach(m => {
        if (m.events) {
            m.events.forEach(e => {
                if (e.year) {
                    const cleanEventYear = typeof parseYear === 'function' ? parseYear(e.year.toString()) : parseInt(e.year);
                    if (cleanEventYear === cleanTargetYear) {
                        allYearEvents.push({
                            musicianName: m.name,
                            musicianId: m.id,
                            musicianBirth: m.birth,
                            event: e
                        });
                    }
                }
            });
        }
    });

    allYearEvents.sort((a, b) => a.musicianName.localeCompare(b.musicianName, 'en'));

    timelineEl.innerHTML = '';
    if (allYearEvents.length === 0) {
        timelineEl.innerHTML = `<p style="font-style:italic; color: var(--text-muted);">No events for the year ${cleanTargetYear}.</p>`;
    } else {
        allYearEvents.forEach(item => {
            const div = document.createElement('div');
            div.className = 'timeline-item';
            
            let ageHTML = '';
            const birthYear = typeof parseYear === 'function' ? parseYear(item.musicianBirth) : parseInt(item.musicianBirth);
            if (birthYear) {
                const age = cleanTargetYear - birthYear;
                if (age >= 0 && age <= 110) {
                    ageHTML = `<span class="timeline-age">${age} years old</span>`;
                }
            }

            let locationHTML = item.event.location
                ? `<span class="timeline-location" onclick="document.getElementById('location-filter').value='${escapeHtml(item.event.location).replace(/'/g, "\\'")}'; filterByLocation('${escapeHtml(item.event.location).replace(/'/g, "\\'")}')">\u{1F4CD} ${escapeHtml(item.event.location)}</span>`
                : '';

            const starHTML = typeof globalEventBadgeHTML === 'function' ? globalEventBadgeHTML(cleanTargetYear, item.event.location) : '';

            div.innerHTML = `
                <div class="timeline-header">
                    <span class="timeline-author" style="cursor:pointer; font-weight: bold; color: var(--amber);" onclick="showMusicianDetails('${item.musicianId}')">${escapeHtml(item.musicianName)}</span>
                    ${locationHTML}
                    ${ageHTML}
                    ${starHTML}
                </div>
                <div style="color: #ddd; margin-top: 4px;">${typeof parseWikiLinks === 'function' ? parseWikiLinks(escapeHtml(item.event.text)) : escapeHtml(item.event.text)}</div>
            `;
            timelineEl.appendChild(div);
        });
    }

    if (typeof refreshGlobalEventStarsForLocations === 'function') {
        const locs = allYearEvents.map(item => item.event.location).filter(l => l);
        refreshGlobalEventStarsForLocations(locs, () => filterByYear(targetYear, false));
    }

    detailsView.classList.remove('hidden');
    if (document.getElementById('back-btn')) document.getElementById('back-btn').style.display = 'inline-block';
    if (document.getElementById('sidebar')) document.getElementById('sidebar').classList.add('mobilno-skrij');
    if (document.getElementById('main-content')) document.getElementById('main-content').classList.add('mobilno-prikaži');

    const journeyContainer = document.getElementById('composer-journey-container');
    const mapContainer = document.getElementById('journey-map');
    const navPanel = document.getElementById('map-navigation-panel');

    if (allYearEvents.length > 0 && mapContainer) {
        if (journeyContainer) journeyContainer.style.display = 'block';
        mapContainer.style.setProperty('height', '350px', 'important');
        if (navPanel) navPanel.style.setProperty('display', 'flex', 'important');
        
        if (journeyContainer.querySelector('h3')) {
            journeyContainer.querySelector('h3').textContent = `Composer's travel map for ${cleanTargetYear}`;
        }

        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }

        mapMarkersArray = [];
        
        mapInstance = L.map('journey-map', { attributionControl: false }).setView([46.0569, 14.5058], 5);
        L.tileLayer(getMapTileUrl()).addTo(mapInstance);
        if (typeof updateMapThemeToggleLabel === 'function') updateMapThemeToggleLabel();

        const bounds = [];
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        for (const item of allYearEvents) {
            const locName = item.event.location;
            if (!locName || locName.trim() === '') continue;

            const cleanLocName = locName.trim();
            let coords = null;
            
            if (typeof GEO_COORDINATES !== 'undefined') {
                coords = GEO_COORDINATES[cleanLocName];
            }

            if (!coords) {
                await sleep(1200);
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanLocName)}&limit=1`, {
                        headers: { 'User-Agent': 'BaroqueArchiveApp/1.0' }
                    });
                    const data = await response.json();
                    
                    if (data && data.length > 0) {
                        coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                        GEO_COORDINATES[cleanLocName] = coords;
                    }
                } catch (err) {
                    console.error("Error searching for location:", cleanLocName);
                }
            }

            if (coords) {
                bounds.push(coords);

                const locationIcon = L.divIcon({
                    className: 'custom-map-location-container',
                    html: `<div style="background-color: var(--amber); color: #000; border-radius: 50%; width: 14px; height: 14px; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                });

                const marker = L.marker(coords, { icon: locationIcon }).addTo(mapInstance);
                marker.bindPopup(`<b style="color: #000;">${escapeHtml(item.musicianName)}</b><br><span style="color:#333;">${escapeHtml(item.event.text)}</span>`);

                mapMarkersArray.push({
                    leafletMarker: marker,
                    name: cleanLocName,
                    years: item.event.year
                });
            }
        }

        if (mapMarkersArray.length > 0) {
            mapInstance.fitBounds(bounds, { padding: [40, 40] });
            currentMapMarkerIndex = 0;
            
            const statusEl = document.getElementById('map-nav-status');
            if (statusEl) {
                statusEl.textContent = `Station: 1 / ${mapMarkersArray.length}`;
            }
            
            updateMapNavDisplay();
        } else {
            mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">Locations for the year ${cleanTargetYear} do not have known coordinates.</div>`;
            if (navPanel) navPanel.style.display = 'none';
        }

    } else {
        if (journeyContainer) journeyContainer.style.display = 'none';
    }

    if (pushHistory) history.pushState({ view: "year", year: cleanTargetYear }, "");
}

function filterByLocation(targetLoc, pushHistory = true) {
    if (!targetLoc) {
        closeDetailsView();
        return;
    }

    document.getElementById('search-input').value = "";
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');
    const geFormOverview = document.getElementById('add-global-event-form');
    if (geFormOverview) geFormOverview.classList.add('hidden');

    const detailsView = document.getElementById('details-view');
    const nameEl = document.getElementById('view-name');
    const datesEl = document.getElementById('view-dates');
    const summaryEl = document.getElementById('pure-summary');
    const timelineEl = document.getElementById('timeline');
    const titleEl = document.getElementById('timeline-title');
    const addEventBtn = document.getElementById('add-event-btn');
    const avatarContainer = document.getElementById('view-avatar-container');
    
    document.getElementById('profile-settings-container').classList.add('hidden');

    nameEl.textContent = targetLoc;
    datesEl.textContent = `Chronological overview of events in this location`;
    summaryEl.innerHTML = "";
    avatarContainer.innerHTML = ""; 
    titleEl.textContent = "Historical events";
    addEventBtn.classList.add('hidden');

    let allLocationEvents = [];
    musicians.forEach(m => {
        if (m.events) {
            m.events.forEach(e => {
                if (e.location && e.location.toLowerCase().trim() === targetLoc.toLowerCase().trim()) {
                    allLocationEvents.push({
                        musicianName: m.name,
                        musicianId: m.id,
                        musicianBirth: m.birth,
                        event: e
                    });
                }
            });
        }
    });

    allLocationEvents.sort((a, b) => (parseYear(a.event.year) || 9999) - (parseYear(b.event.year) || 9999));

    timelineEl.innerHTML = '';
    if (allLocationEvents.length === 0) {
        timelineEl.innerHTML = '<p style="font-style:italic; color: var(--text-muted);">No events for this location.</p>';
    } else {
        allLocationEvents.forEach(item => {
            const div = document.createElement('div');
            div.className = 'timeline-item';
            
            let ageHTML = '';
            const birthYear = parseYear(item.musicianBirth);
            const eventYear = parseYear(item.event.year);
            if (birthYear && eventYear) {
                const age = eventYear - birthYear;
                if (age >= 0 && age <= 110) {
                    ageHTML = `<span class="timeline-age">${age} years old</span>`;
                }
            }

            const starHTML = typeof globalEventBadgeHTML === 'function' ? globalEventBadgeHTML(eventYear, item.event.location) : '';

            div.innerHTML = `
                <div class="timeline-header">
                    <span class="timeline-author" style="cursor:pointer; font-weight: bold; color: var(--amber);" onclick="showMusicianDetails('${item.musicianId}')">${escapeHtml(item.musicianName)}</span>
                    <span class="timeline-year">${escapeHtml(item.event.year || '')}</span>
                    ${ageHTML}
                    ${starHTML}
                </div>
                <div style="color: #ddd; margin-top: 4px;">${parseWikiLinks(escapeHtml(item.event.text))}</div>
            `;
            timelineEl.appendChild(div);
        });
    }

    if (typeof refreshGlobalEventStarsForLocations === 'function') {
        refreshGlobalEventStarsForLocations([targetLoc], () => filterByLocation(targetLoc, false));
    }

    detailsView.classList.remove('hidden');
    document.getElementById('back-btn').style.display = 'inline-block';

    document.getElementById('sidebar').classList.add('mobilno-skrij');
    document.getElementById('main-content').classList.add('mobilno-prikaži');

    const journeyContainer = document.getElementById('composer-journey-container');
    if (journeyContainer) {
        journeyContainer.style.display = 'block';
    }
    if (typeof renderLocationMap === "function") {
        renderLocationMap(targetLoc);
    }

    if (pushHistory) history.pushState({ view: "location", location: targetLoc }, "");
}

function parseWikiLinks(text) {
    if (!text) return '';
    return text.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
        const safeName = escapeHtml(p1);
        const target = musicians.find(m => m.name.toLowerCase().trim() === p1.toLowerCase().trim());
        if (target) {
            return `<span class="person-link" onclick="showMusicianDetails('${target.id}')">${safeName}</span>`;
        }
        return `<span style="color: var(--text-muted); border-bottom: 1px dotted #556;">${safeName}</span>`;
    });
}

function generatePureSummary(m) {
    const bYear = parseYear(m.birth) || m.birth;
    const dYear = parseYear(m.death) || m.death;
    let summary = `<strong>${escapeHtml(m.name)}</strong> lived between the years ${escapeHtml(bYear)} and ${escapeHtml(dYear)}. `;

    if (m.events && m.events.length > 0) {
        const locations = [...new Set(m.events.map(e => e.location).filter(l => l))];
        const connections = [];
        const regex = /\[\[(.*?)\]\]/g;
        m.events.forEach(e => {
            if (e.text) {
                let match;
                while ((match = regex.exec(e.text)) !== null) {
                    connections.push(match[1]);
                }
            }
        });
        const uniqueConnections = [...new Set(connections)];

        if (locations.length > 0) {
            summary += `Main locations of activity: ${locations.map(l => `<strong class="timeline-location" onclick="document.getElementById('location-filter').value='${escapeHtml(l).replace(/'/g, "\\'")}'; filterByLocation('${escapeHtml(l).replace(/'/g, "\\'")}')">${escapeHtml(l)}</strong>`).join(', ')}. `;
        }
        if (uniqueConnections.length > 0) {
            summary += `Recorded connections with authors: ${uniqueConnections.map(c => `<strong>${escapeHtml(c)}</strong>`).join(', ')}.`;
        }
    }
    return summary;
}

function showMusicianDetails(id, pushHistory = true) {
    const filterSelect = document.getElementById('location-filter');
    if (filterSelect) filterSelect.value = "";
    
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');
    const geFormMusician = document.getElementById('add-global-event-form');
    if (geFormMusician) geFormMusician.classList.add('hidden');
    document.getElementById('add-event-btn').classList.remove('hidden');
    
    document.getElementById('profile-settings-container').classList.remove('hidden');
    document.getElementById('profile-dropdown').classList.remove('prikazi-meni');
    
    document.getElementById('timeline-title').textContent = "Timeline";
    
    currentMusicianId = id;
    const m = musicians.find(item => item.id === id);
    if (!m) return;

    document.getElementById('view-name').textContent = m.name;
    document.getElementById('view-dates').textContent = `${m.birth} – ${m.death}`;
    document.getElementById('pure-summary').innerHTML = generatePureSummary(m);

    const avatarContainer = document.getElementById('view-avatar-container');
    
    if (m.img && m.img.trim() !== "") {
        avatarContainer.innerHTML = `<img src="${escapeHtml(m.img)}" class="avatar-circle avatar-large" alt="${escapeHtml(m.name)}" style="border: 2px solid var(--amber);">`;
    } else {
        const parts = m.name.split(' ');
        const initials = parts.map(n => n[0]).join('').substring(0, 2).toUpperCase();

        avatarContainer.innerHTML = `
            <div class="avatar-circle avatar-large" style="
                background-color: var(--panel);
                color: var(--amber);
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 2rem;
                border: 2px solid var(--amber);
            ">
                ${escapeHtml(initials)}
            </div>`;
    }

    renderTimeline(m);
    
    document.getElementById('details-view').classList.remove('hidden');
    
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.style.display = 'inline-block';
    }

    renderJourneyDiagram(m);

    document.getElementById('sidebar').classList.add('mobilno-skrij');
    document.getElementById('main-content').classList.add('mobilno-prikaži');

    if (pushHistory) history.pushState({ view: "musician", id: id }, "");
}

/* ==========================================================================
   AI EXTRACTION AND MODAL WINDOWS
   ========================================================================== */

function renderTimeline(musician) {
    const timelineEl = document.getElementById('timeline');
    timelineEl.innerHTML = '';

    if (!musician.events || musician.events.length === 0) {
        timelineEl.innerHTML = '<p style="font-style:italic; color: var(--text-muted);">No events.</p>';
        return;
    }

    const sorted = [...musician.events].sort((a, b) => (parseYear(a.year) || 9999) - (parseYear(b.year) || 9999));
    const birthYear = parseYear(musician.birth);

    sorted.forEach(e => {
        const div = document.createElement('div');
        div.className = 'timeline-item';
        
        const locHTML = e.location ? `<span class="timeline-location" onclick="document.getElementById('location-filter').value='${escapeHtml(e.location).replace(/'/g, "\\'")}'; filterByLocation('${escapeHtml(e.location).replace(/'/g, "\\'")}')">\u{1F4CD} ${escapeHtml(e.location)}</span>` : '';

        let ageHTML = '';
        const eventYear = parseYear(e.year);
        if (birthYear && eventYear) {
            const age = eventYear - birthYear;
            if (age >= 0 && age <= 110) {
                ageHTML = `<span class="timeline-age">${age} years old</span>`;
            }
        }

        const avtorHTML = (e.vnesIme || e.vnesPriimek)
            ? `<div class="timeline-vnesel" style="font-size:11px; color:var(--text-muted); margin-top:4px; ${e.vnesUID ? 'cursor:pointer; text-decoration:underline dotted;' : ''}" ${e.vnesUID ? `onclick="prikaziProfilOsebe('${escapeHtml(e.vnesUID)}')"` : ''}>added by: ${escapeHtml(e.vnesIme || '')} ${escapeHtml(e.vnesPriimek || '')}</div>`
            : '';

        const reviews = e.reviews || {};
        const stevilke = { check: 0, question: 0, cross: 0 };
        let mojaOcena = null;
        Object.keys(reviews).forEach(uid => {
            const tip = reviews[uid] && reviews[uid].tip;
            if (stevilke[tip] !== undefined) stevilke[tip]++;
            if (uid === window.trenutniUporabnikUID) mojaOcena = tip;
        });

        const stevecHTML = (stevilke.check + stevilke.question + stevilke.cross > 0) ? `
            <div class="timeline-review-counts" style="font-size:11px; color:var(--text-muted); margin-top:2px;">
                ${stevilke.check ? `✅ ${stevilke.check} ` : ''}${stevilke.question ? `❓ ${stevilke.question} ` : ''}${stevilke.cross ? `🚫 ${stevilke.cross}` : ''}
            </div>` : '';

        const jeLastnikDogodka = e.vnesUID === window.trenutniUporabnikUID;
        let akcijeHTML = '';
        if (jeLastnikDogodka) {
            akcijeHTML = `
                <div class="timeline-actions">
                    <button class="btn-action" onclick="showEventModal(true, ${e.id})" title="Edit">✏️</button>
                    <button class="btn-action btn-delete" onclick="deleteEvent(${e.id})" title="Delete">❌</button>
                </div>`;
        } else {
            akcijeHTML = `
                <div class="timeline-actions timeline-review-actions">
                    <button class="btn-action" style="${mojaOcena === 'check' ? 'opacity:1; transform:scale(1.2);' : 'opacity:0.45;'}" onclick="preklopiOcenoDogodka(${e.id}, 'check')" title="Confirm accuracy">✅</button>
                    <button class="btn-action" style="${mojaOcena === 'question' ? 'opacity:1; transform:scale(1.2);' : 'opacity:0.45;'}" onclick="preklopiOcenoDogodka(${e.id}, 'question')" title="Questionable">❓</button>
                    <button class="btn-action" style="${mojaOcena === 'cross' ? 'opacity:1; transform:scale(1.2);' : 'opacity:0.45;'}" onclick="preklopiOcenoDogodka(${e.id}, 'cross')" title="Incorrect">🚫</button>
                </div>`;
        }

        const starHTML = typeof globalEventBadgeHTML === 'function' ? globalEventBadgeHTML(eventYear, e.location) : '';

        div.innerHTML = `
            <div class="timeline-header">
                <span class="timeline-year">${escapeHtml(e.year || '')}</span>
                ${locHTML}
                ${ageHTML}
                ${starHTML}
            </div>
            <div style="color: #ddd;">${parseWikiLinks(escapeHtml(e.text))}</div>
            ${avtorHTML}
            ${stevecHTML}
            ${akcijeHTML}
        `;
        timelineEl.appendChild(div);
    });

    if (typeof refreshGlobalEventStarsForLocations === 'function') {
        const locs = musician.events.map(e => e.location).filter(l => l);
        refreshGlobalEventStarsForLocations(locs, () => renderTimeline(musician));
    }
}

function preklopiOcenoDogodka(eventId, tipOcene) {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;
    const ev = m.events.find(e => e.id === eventId);
    if (!ev) return;

    const uid = window.trenutniUporabnikUID;
    if (!uid) return;

    if (!ev.reviews) ev.reviews = {};

    if (ev.reviews[uid] && ev.reviews[uid].tip === tipOcene) {
        delete ev.reviews[uid];
    } else {
        ev.reviews[uid] = {
            tip: tipOcene,
            ime: window.trenutniUporabnikIme || '',
            priimek: window.trenutniUporabnikPriimek || ''
        };
    }

    shraniGlasbenikaVFirestore(m);
    renderTimeline(m);
}

async function prikaziProfilOsebe(uid) {
    if (!uid || !window.db) return;
    try {
        const snap = await window.fsGetDoc(window.fsDoc(window.db, 'profiles', uid));
        if (!snap.exists()) {
            alert("Profile could not be found.");
            return;
        }
        const p = snap.data();

        const staro = document.getElementById('avtor-profil-modal');
        if (staro) staro.remove();

        const overlay = document.createElement('div');
        overlay.id = 'avtor-profil-modal';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:100001; font-family:sans-serif;';
        overlay.onclick = function(ev) { if (ev.target === overlay) overlay.remove(); };

        const slikaHTML = p.slika ? `<img src="${p.slika}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; margin-bottom:12px;">` : '';

        overlay.innerHTML = `
            <div style="background:var(--panel,#141b29); padding:24px; border-radius:16px; max-width:340px; width:90%; color:var(--text,#e8e0d0); border:1px solid var(--border-color,#2a2a35); text-align:center;">
                ${slikaHTML}
                <h3 style="margin:0 0 4px 0; color:var(--amber,#f2cc5a);">${p.ime || ''} ${p.priimek || ''}</h3>
                ${p.instrument ? `<div style="font-size:13px; margin-top:6px;">🎻 ${p.instrument}</div>` : ''}
                ${p.sola ? `<div style="font-size:13px;">🏛️ ${p.sola}</div>` : ''}
                ${p.podrocje ? `<div style="font-size:13px;">🔍 ${p.podrocje}</div>` : ''}
                ${p.email ? `<div style="font-size:13px; margin-top:8px;"><a href="mailto:${p.email}" style="color:var(--amber,#f2cc5a);">✉️ ${p.email}</a></div>` : ''}
                ${p.web ? `<div style="font-size:13px;"><a href="${p.web}" target="_blank" style="color:var(--amber,#f2cc5a);">🌐 Website</a></div>` : ''}
                <button onclick="document.getElementById('avtor-profil-modal').remove()" style="margin-top:16px; padding:8px 20px; border:none; border-radius:8px; background:var(--border-color,#2a2a35); color:var(--text,#e8e0d0); cursor:pointer;">Close</button>
            </div>
        `;
        document.body.appendChild(overlay);
    } catch (err) {
        console.error("Error loading profile:", err);
        alert("Error loading the person's profile.");
    }
}

function closeDetailsView() {
    document.getElementById('details-view').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');
    const geForm = document.getElementById('add-global-event-form');
    if (geForm) geForm.classList.add('hidden');
    document.getElementById('placeholder-text').classList.remove('hidden');

    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.style.display = 'none';
    }

    document.getElementById('sidebar').classList.remove('mobilno-skrij');
    document.getElementById('main-content').classList.remove('mobilno-prikaži');

    currentMusicianId = null;

    const navigableViews = ["musician", "year", "location"];
    if (history.state && navigableViews.includes(history.state.view)) {
        history.back();
    }
}

function hideAllViews() {
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');
    document.getElementById('details-view').classList.add('hidden');
    const geForm = document.getElementById('add-global-event-form');
    if (geForm) geForm.classList.add('hidden');
}

function showAddMusicianForm() {
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('details-view').classList.add('hidden');
    const geForm = document.getElementById('add-global-event-form');
    if (geForm) geForm.classList.add('hidden');

    if (typeof setAddButtonActive === 'function') setAddButtonActive('musician');

    const formEl = document.getElementById('add-musician-form');
    formEl.classList.remove('hidden');

    document.getElementById('form-heading').textContent = "Add new person";
    document.getElementById('new-name').value = "";
    document.getElementById('new-birth').value = "";
    document.getElementById('new-death').value = "";
    document.getElementById('new-image').value = "";

    document.getElementById('back-btn').style.display = 'inline-block';
    document.getElementById('sidebar').classList.add('mobilno-skrij');
    document.getElementById('main-content').classList.add('mobilno-prikaži');
}

function showEditMusicianForm() {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;
    
    hideAllViews();
    isEditingMusicianMode = true;
    document.getElementById('form-heading').textContent = "Edit person: " + m.name;
    document.getElementById('new-name').value = m.name;
    document.getElementById('new-birth').value = m.birth;
    document.getElementById('new-death').value = m.death;
    document.getElementById('new-image').value = m.img || '';
    document.getElementById('add-musician-form').classList.remove('hidden');
    document.getElementById('back-btn').style.display = 'inline-block';
}

function saveNewMusician() {
    const name = document.getElementById('new-name').value.trim();
    const birth = document.getElementById('new-birth').value.trim() || '?';
    const death = document.getElementById('new-death').value.trim() || '?';
    const img = document.getElementById('new-image').value.trim();

    if (!name) { alert("Please enter a name."); return; }

    if (isEditingMusicianMode) {
        const m = musicians.find(item => item.id === currentMusicianId);
        if (m) {
            if (m.vnesUID && m.vnesUID !== window.trenutniUporabnikUID) {
                alert("You can only edit people you added yourself.");
                return;
            }
            m.name = name;
            m.birth = birth;
            m.death = death;
            m.img = img;
            shraniGlasbenikaVFirestore(m);
        }
    } else {
        const newId = generateId(name);
        const newMusician = { 
            id: newId, name: name, birth: birth, death: death, img: img, events: [],
            vnesUID: window.trenutniUporabnikUID || null,
            vnesIme: window.trenutniUporabnikIme || '',
            vnesPriimek: window.trenutniUporabnikPriimek || ''
        };
        musicians.push(newMusician);
        currentMusicianId = newId;
        shraniGlasbenikaVFirestore(newMusician);
    }

    updateLinkDropdowns();
    searchMusicians();
    showMusicianDetails(currentMusicianId);
}

function showEventModal(isEdit, eventId = null) { 
    const journeyContainer = document.getElementById('composer-journey-container');
    if (journeyContainer) {
        journeyContainer.style.display = 'none';
    }

    updateLinkDropdowns();
    updateLocationLists();
    switchModalTab('single');
    
    document.getElementById('raw-bio-input').value = '';
    document.getElementById('extraction-results-container').classList.add('hidden');
    document.getElementById('save-extracted-btn').classList.add('hidden');

    const modal = document.getElementById('event-modal');
    
    if (isEdit) {
        editingEventId = eventId;
        document.getElementById('modal-title').textContent = "Edit event";
        document.getElementById('modal-save-btn').textContent = "Save";
        document.getElementById('tab-auto').classList.add('hidden');
        
        const m = musicians.find(item => item.id === currentMusicianId);
        const ev = m.events.find(e => e.id === eventId);
        if (ev) {
            document.getElementById('event-year').value = ev.year || '';
            document.getElementById('event-location').value = ev.location || '';
            document.getElementById('event-text').value = ev.text || '';
        }
    } else {
        editingEventId = null;
        document.getElementById('modal-title').textContent = "Add event";
        document.getElementById('modal-save-btn').textContent = "Add";
        document.getElementById('tab-auto').classList.remove('hidden');
        
        document.getElementById('event-year').value = '';
        document.getElementById('event-location').value = '';
        document.getElementById('event-text').value = '';
    }
    
    modal.classList.remove('hidden'); 
}

function hideEventModal() {
    document.getElementById('event-modal').classList.add('hidden');
    document.getElementById('modal-single-view').classList.remove('hidden');
    if (document.getElementById('modal-auto-view')) {
        document.getElementById('modal-auto-view').classList.add('hidden');
    }
    document.getElementById('modal-merge-view').classList.add('hidden');
    
    const tabsEl = document.querySelector('.modal-tabs');
    if (tabsEl) tabsEl.classList.remove('hidden');
    
    const tabSingle = document.getElementById('tab-single');
    const tabAuto = document.getElementById('tab-auto');
    if(tabSingle) tabSingle.classList.add('active');
    if(tabAuto) tabAuto.classList.remove('active');

    const journeyContainer = document.getElementById('composer-journey-container');
    if (journeyContainer) {
        journeyContainer.style.display = 'block';
    }
    if (mapInstance) {
        mapInstance.invalidateSize();
    }
}

function submitEventForm() {
    const year = document.getElementById('event-year').value.trim();
    const location = document.getElementById('event-location').value.trim();
    const text = document.getElementById('event-text').value.trim();
    if (!text) { alert("Please enter a description."); return; }

    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;

    if (editingEventId !== null) {
        const ev = m.events.find(e => e.id === editingEventId);
        if (ev) {
            if (ev.vnesUID !== window.trenutniUporabnikUID) {
                alert("You can only edit events you added yourself.");
                return;
            }
            ev.year = year;
            ev.location = location;
            ev.text = text;
        }
    } else {
        if (!m.events) m.events = [];
        m.events.push({
            id: Date.now(),
            year: year,
            location: location,
            text: text,
            vnesUID: window.trenutniUporabnikUID || null,
            vnesIme: window.trenutniUporabnikIme || '',
            vnesPriimek: window.trenutniUporabnikPriimek || ''
        });
    }

    shraniGlasbenikaVFirestore(m);
    updateLocationLists();
    renderTimeline(m);
    document.getElementById('pure-summary').innerHTML = generatePureSummary(m);
    hideEventModal();
}

// NOTE: this ownership check is enforced client-side only. Events live inside
// the musician document's `events` array rather than their own Firestore
// documents, so a per-event server-side rule isn't possible without moving
// events into a subcollection (a bigger migration, deliberately deferred).
function deleteEvent(eventId) {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;
    const ev = m.events.find(e => e.id === eventId);
    if (ev && ev.vnesUID !== window.trenutniUporabnikUID) {
        alert("You can only delete events you added yourself.");
        return;
    }

    if (confirm("Are you sure you want to delete this event?")) {
        m.events = m.events.filter(e => e.id !== eventId);
        shraniGlasbenikaVFirestore(m);
        updateLocationLists();
        renderTimeline(m);
        document.getElementById('pure-summary').innerHTML = generatePureSummary(m);
    }
}

function exportDatabase() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(musicians, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "archive_composers_backup.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (Array.isArray(importedData)) {
                if (confirm("Do you want to replace the CURRENT database with the uploaded full database backup? (Old entries not in the file will remain in the shared database.)")) {
                    musicians = importedData;
                    for (const m of musicians) {
                        await shraniGlasbenikaVFirestore(m);
                    }
                    searchMusicians();
                    updateLocationLists();
                    updateLinkDropdowns();
                    closeDetailsView();
                    alert("Entire database successfully imported!");
                }
            } else if (importedData && typeof importedData === 'object' && importedData.name) {
                if (confirm(`Do you want to import/update the composer "${importedData.name}"?`)) {
                    if (!importedData.id) {
                        importedData.id = Date.now().toString();
                    } else {
                        importedData.id = importedData.id.toString();
                    }

                    const existingIndex = musicians.findIndex(m => m.id == importedData.id);
                    if (existingIndex !== -1) {
                        musicians[existingIndex] = importedData;
                    } else {
                        musicians.push(importedData);
                    }

                    await shraniGlasbenikaVFirestore(importedData);
                    searchMusicians();
                    updateLocationLists();
                    updateLinkDropdowns();
                    
                    currentMusicianId = importedData.id;
                    showMusicianDetails(importedData.id);
                    alert(`Composer "${importedData.name}" successfully imported and loaded!`);
                }
            } else {
                alert("Error: The file does not have the correct structure.");
            }
        } catch (err) {
            console.error(err);
            alert("Error reading the file.");
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function mergeMusicianPrompt() {
    const currentId = currentMusicianId; 
    const sourceMusician = musicians.find(m => m.id === currentId);
    
    if (!sourceMusician) {
        alert("Error: Cannot find the current composer.");
        return;
    }

    document.getElementById('profile-dropdown').classList.add('hidden');
    document.getElementById('modal-single-view').classList.add('hidden');
    if (document.getElementById('modal-auto-view')) {
        document.getElementById('modal-auto-view').classList.add('hidden');
    }
    
    const tabsEl = document.querySelector('.modal-tabs');
    if (tabsEl) tabsEl.classList.add('hidden');
    
    document.getElementById('modal-merge-view').classList.remove('hidden');
    document.getElementById('merge-label-current').textContent = `${escapeHtml(sourceMusician.name)} (Keep current)`;
    document.getElementById('merge-label-target').textContent = `Selected duplicate from the list below`;

    const selectEl = document.getElementById('merge-target-select');
    selectEl.innerHTML = '<option value="">-- select composer to merge --</option>';

    musicians.forEach(m => {
        if (m.id !== sourceMusician.id) {
            selectEl.innerHTML += `<option value="${m.id}">${escapeHtml(m.name)}</option>`;
        }
    });

    document.getElementById('event-modal').classList.remove('hidden');
}

function executeMusicianMerge() {
    const sourceMusician = musicians.find(m => m.id === currentMusicianId);
    const targetSelect = document.getElementById('merge-target-select');
    const targetId = targetSelect.value;

    if (!targetId) {
        alert("Please select a composer to merge with the current one.");
        return;
    }

    const targetMusician = musicians.find(m => m.id === targetId);
    if (!sourceMusician || !targetMusician) {
        alert("Error reading composer data.");
        return;
    }

    const mainChoice = document.querySelector('input[name="merge-main-choice"]:checked').value;
    let mainMusician, duplicateMusician;
    if (mainChoice === 'current') {
        mainMusician = sourceMusician;
        duplicateMusician = targetMusician;
    } else {
        mainMusician = targetMusician;
        duplicateMusician = sourceMusician;
    }

    if (duplicateMusician.vnesUID && duplicateMusician.vnesUID !== window.trenutniUporabnikUID) {
        alert(`Merge cancelled: "${duplicateMusician.name}" was added by someone else, so only they (or you, for a profile you added) can delete it. Ask them to perform the merge, or pick a duplicate you created yourself.`);
        return;
    }

    if (!confirm(`Are you sure you want to merge all events under the profile "${mainMusician.name}"? The profile "${duplicateMusician.name}" will be permanently deleted.`)) {
        return;
    }

    if (!mainMusician.events) mainMusician.events = [];
    if (duplicateMusician.events && duplicateMusician.events.length > 0) {
        mainMusician.events = mainMusician.events.concat(duplicateMusician.events);
    }

    mainMusician.events.sort((a, b) => (parseYear(a.year) || 9999) - (parseYear(b.year) || 9999));
    musicians = musicians.filter(m => m.id !== duplicateMusician.id);

    shraniGlasbenikaVFirestore(mainMusician);
    izbrisiGlasbenikaIzFirestore(duplicateMusician.id);
    hideEventModal();

    alert(`Merge successful! Duplicate (${duplicateMusician.name}) has been deleted.`);
    showMusicianDetails(mainMusician.id);
}