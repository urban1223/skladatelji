// Registracija PWA Service Workerja
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('PWA Service Worker uspešno registriran!', reg.scope))
            .catch(err => console.log('Registracija Service Workerja spodletela:', err));
    });
}

// PRISILNI RESET: Pusti to tukaj samo za eno osvežitev strani!
localStorage.setItem('baroque_archive_v7', JSON.stringify(zacetniPodatkiSkladateljev));

let musicians = JSON.parse(localStorage.getItem('baroque_archive_v7')) || zacetniPodatkiSkladateljev;
let currentMusicianId = null;
let editingEventId = null;
let activeTab = 'single';
let isEditingMusicianMode = false;
let mapInstance = null;
let mapMarkersArray = []; 
let currentMapMarkerIndex = -1;
window.onload = function() {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        document.getElementById('gemini-api-key').value = savedKey;
    }
    searchMusicians();
    updateLocationLists();
    updateLinkDropdowns();

    // Zapri spustni meni, če uporabnik klikne kamorkoli drugam
    window.addEventListener('click', function(e) {
        const dropdown = document.getElementById('profile-dropdown');
        const settingsBtn = document.getElementById('profile-settings-btn');
        
        if (dropdown && dropdown.classList.contains('prikazi-meni')) {
            if (!settingsBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('prikazi-meni');
            }
        }
    });

    // LOVLJENJE SISTEMSKEGA GUMBA "NAZAJ"
    window.addEventListener('popstate', function(event) {
        if (!event.state || event.state.view !== "details") {
            // Uporabimo interno funkcijo za zapiranje brez ponovnega klicanja history.back()
            // Zato v closeDetailsView ne smeš imeti klica history.back()
            document.getElementById('details-view').classList.add('hidden');
            document.getElementById('placeholder-text').classList.remove('hidden');
            document.getElementById('back-btn').style.display = 'none';
            document.getElementById('sidebar').classList.remove('mobilno-skrij');
            document.getElementById('main-content').classList.remove('mobilno-prikaži');
            currentMusicianId = null;
        } else if (event.state && event.state.view === "details" && event.state.id) {
            showMusicianDetails(event.state.id);
        }
    });

    // NOVO: Iskanje ob pritisku na tipko ENTER znotraj vnosnega polja
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prepreči privzeto obnašanje (npr. osveževanje ali pošiljanje obrazca)
                searchMusicians();      // Sproži iskanje po imenu ali letu
            }
        });
    }
};

function generateId(name) { 
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'); 
}

function parseYear(yearStr) {
    if (!yearStr) return null;
    const match = yearStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
}

function saveToStorage() { 
    localStorage.setItem('baroque_archive_v7', JSON.stringify(musicians)); 
}

/* ==========================================================================
   UPRAVLJANJE SPUSTNEGA MENIJA IN PROFILA
   ========================================================================== */

function toggleProfileDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    dropdown.classList.toggle('prikazi-meni');
}

function deleteMusician() {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;

    const potrditev = confirm(`⚠️ POZOR: Ali res želiš izbrisati skladatelja "${m.name}" in vse njegove povezane dogodke? Tega dejanja ni mogoče razveljaviti.`);
    
    if (potrditev) {
        musicians = musicians.filter(item => item.id !== currentMusicianId);
        saveToStorage();
        searchMusicians();
        updateLocationLists();
        updateLinkDropdowns();
        closeDetailsView();
        alert("Oseba je bila uspešno odstranjena iz arhiva.");
    }
}

function exportSingleMusician() {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(m, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `arhiv_${m.id}.json`);
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
    textToCopy += `\n\nKRONOLOGIJA IN DELA:\n`;

    if (m.events && m.events.length > 0) {
        const sortedEvents = [...m.events].sort((a, b) => (parseYear(a.year) || 9999) - (parseYear(b.year) || 9999));
        const birthYear = parseYear(m.birth);

        sortedEvents.forEach(e => {
            let ageStr = '';
            const eventYear = parseYear(e.year);
            if (birthYear && eventYear) {
                const age = eventYear - birthYear;
                if (age >= 0 && age <= 110) ageStr = ` (star ${age} let)`;
            }
            const locStr = e.location ? ` [📍 ${e.location}]` : '';
            const cleanText = e.text.replace(/\[\[(.*?)\]\]/g, '$1');
            
            textToCopy += `- ${e.year || '????'}${locStr}${ageStr}: ${cleanText}\n`;
        });
    } else {
        textToCopy += `(Ni zabeleženih dogodkov)`;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
        alert(`Profil za "${m.name}" je kopiran v odložišče! Sedaj ga lahko prilepiš v Word (Ctrl+V).`);
    }).catch(err => {
        alert("Napaka pri kopiranju v odložišče.");
    });
}

/* ==========================================================================
   ISKANJE IN FILTRIRANJE
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
    return [...locations].sort((a, b) => a.localeCompare(b, 'sl'));
}

function updateLocationLists() {
    const sortedLocations = getAllExistingLocations();
    const filterSelect = document.getElementById('location-filter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">-- Vsi kraji --</option>' + 
            sortedLocations.map(loc => `<option value="${loc}">${loc}</option>`).join('');
    }

    const datalist = document.getElementById('existing-locations');
    if (datalist) {
        datalist.innerHTML = sortedLocations.map(loc => `<option value="${loc}"></option>`).join('');
    }
}

function updateLinkDropdowns() {
    const sortedMusicians = [...musicians].sort((a, b) => a.name.localeCompare(b.name, 'sl'));
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

function switchModalTab(tab) {
    activeTab = tab;
    if(tab === 'single') {
        document.getElementById('tab-single').classList.add('active');
        document.getElementById('tab-auto').classList.remove('active');
        document.getElementById('modal-single-view').classList.remove('hidden');
        document.getElementById('modal-auto-view').classList.add('hidden');
    } else {
        document.getElementById('tab-single').classList.remove('active');
        document.getElementById('tab-auto').classList.add('active');
        document.getElementById('modal-single-view').classList.add('hidden');
        document.getElementById('modal-auto-view').classList.remove('hidden');
    }
}

// Pomožna funkcija za izris seznama (da ni podvajanja kode)
function renderMusicianList(data) {
    const listEl = document.getElementById('musician-list');
    listEl.innerHTML = '';
    
    data.sort((a, b) => a.name.localeCompare(b.name, 'sl')).forEach(m => {
        const li = document.createElement('li');
        
        // Generiranje začetnic
        const parts = m.name.split(' ');
        const initials = parts.map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        // Slog: Amber obroč, Panel (modro-sivo) ozadje, Amber črke
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
            
        // Če ima sliko, obdrži sliko z amber obročem
        if (m.img && m.img.trim() !== "") {
            avatarHTML = `<img src="${m.img}" class="avatar-circle" alt="${m.name}" style="border: 2px solid var(--amber);">`;
        }
        
        li.innerHTML = `${avatarHTML} <span>${m.name} (${m.birth}–${m.death})</span>`;
        li.onclick = () => showMusicianDetails(m.id);
        listEl.appendChild(li);
    });
}

// Glavna funkcija za iskanje
function searchMusicians() {
    const filterSelect = document.getElementById('location-filter');
    if (filterSelect) filterSelect.value = "";
    
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const listEl = document.getElementById('musician-list');
    
    // 1. Če je prazno, prikaži vse
    if (query === "") {
        renderMusicianList(musicians);
        return;
    }

    // 2. Logika za letnico: Sproži se samo, če je vpisana 4-mestna številka
    const isFourDigitYear = /^\d{4}$/.test(query);
    if (isFourDigitYear) {
        const searchYear = parseInt(query);
        filterByYear(searchYear);
        return;
    } 
    
    // 3. Iskanje po imenu (se izvaja vedno, ko ni 4-mestna številka)
    let filtered = musicians.filter(m => m.name.toLowerCase().includes(query));
    
    if (filtered.length === 0) {
        listEl.innerHTML = '<li style="color:var(--text-muted); cursor:default; border:none; padding: 10px;">Ni zadetkov.</li>';
    } else {
        renderMusicianList(filtered);
    }
}

// Avtomatski sprožilec za ime, a ne za letnico (dokler ni dolga 4 znake)
document.getElementById('search-input').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    // Če je vpisana 4-mestna številka, avtomatsko sproži iskanje po letu
    if (/^\d{4}$/.test(query)) {
        searchMusicians();
    } else if (!/^\d+$/.test(query)) {
        // Če ni samo številka (torej vpisuješ ime), sproži sproti
        searchMusicians();
    }
});

function filterByYear(targetYear) {
    if (!targetYear) {
        closeDetailsView();
        return;
    }

    const cleanTargetYear = typeof parseYear === 'function' ? parseYear(targetYear.toString()) : parseInt(targetYear);
    
    if (!cleanTargetYear) {
        console.error("Napačen format leta:", targetYear);
        return;
    }

    document.getElementById('search-input').value = "";
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');

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

    nameEl.textContent = `Leto ${cleanTargetYear}`;
    datesEl.textContent = `Kronološki pregled dogodkov v tem letu`;
    summaryEl.innerHTML = "";
    avatarContainer.innerHTML = ""; 
    titleEl.textContent = "Zgodovinski dogodki";
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

    allYearEvents.sort((a, b) => a.musicianName.localeCompare(b.musicianName, 'sl'));

    timelineEl.innerHTML = '';
    if (allYearEvents.length === 0) {
        timelineEl.innerHTML = `<p style="font-style:italic; color: var(--text-muted);">Ni dogodkov za leto ${cleanTargetYear}.</p>`;
    } else {
        allYearEvents.forEach(item => {
            const div = document.createElement('div');
            div.className = 'timeline-item';
            
            // Izračun starosti
            let ageHTML = '';
            const birthYear = typeof parseYear === 'function' ? parseYear(item.musicianBirth) : parseInt(item.musicianBirth);
            if (birthYear) {
                const age = cleanTargetYear - birthYear;
                if (age >= 0 && age <= 110) {
                    ageHTML = `<span class="timeline-age">star ${age} let</span>`;
                }
            }

            // Izpis kraja – enak kot v navadnem timelinu (z znatko 📍 in brez oklepajev)
            let locationHTML = item.event.location 
                ? `<span class="timeline-location" onclick="document.getElementById('location-filter').value='${item.event.location.replace(/'/g, "\\'")}'; filterByLocation('${item.event.location.replace(/'/g, "\\'")}')">📍 ${item.event.location}</span>` 
                : '';

            // Sestava glave: odstranjena ponovljena letnica, dodan lep prehod na kraj in starost
            div.innerHTML = `
                <div class="timeline-header">
                    <span class="timeline-author" style="cursor:pointer; font-weight: bold; color: var(--amber);" onclick="showMusicianDetails('${item.musicianId}')">${item.musicianName}</span>
                    ${locationHTML}
                    ${ageHTML}
                </div>
                <div style="color: #ddd; margin-top: 4px;">${typeof parseWikiLinks === 'function' ? parseWikiLinks(item.event.text) : item.event.text}</div>
            `;
            timelineEl.appendChild(div);
        });
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
            journeyContainer.querySelector('h3').textContent = `Zemljevid dogodkov v letu ${cleanTargetYear}`;
        }

        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }

        mapMarkersArray = [];
        
        mapInstance = L.map('journey-map', { attributionControl: false }).setView([46.0569, 14.5058], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapInstance);

        const bounds = [];

        allYearEvents.forEach(item => {
            const locName = item.event.location;
            if (!locName) return;

            let coords = null;
            if (typeof GEO_COORDINATES !== 'undefined') {
                coords = GEO_COORDINATES[locName] || GEO_COORDINATES[locName.trim()];
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
                marker.bindPopup(`<b style="color: #000;">${item.musicianName}</b><br><span style="color:#333;">${item.event.text}</span>`);

                mapMarkersArray.push({
                    leafletMarker: marker,
                    name: locName,
                    years: item.event.year
                });
            }
        });

        if (mapMarkersArray.length > 0) {
            mapInstance.fitBounds(bounds, { padding: [40, 40] });
            currentMapMarkerIndex = 0;
            
            const statusEl = document.getElementById('map-nav-status');
            if (statusEl) {
                statusEl.textContent = `Postaja: 1 / ${mapMarkersArray.length}`;
            }
            
            updateMapNavDisplay();
        } else {
            mapContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">Lokacije za leto ${cleanTargetYear} nimajo znanih koordinat.</div>`;
            if (navPanel) navPanel.style.display = 'none';
        }

    } else {
        if (journeyContainer) journeyContainer.style.display = 'none';
    }

    history.pushState({ view: "details", id: null }, "");
}

function filterByLocation(targetLoc) {
    if (!targetLoc) {
        closeDetailsView();
        return;
    }

    document.getElementById('search-input').value = "";
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');

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
    datesEl.textContent = `Kronološki pregled dogodkov v kraju`;
    summaryEl.innerHTML = "";
    avatarContainer.innerHTML = ""; 
    titleEl.textContent = "Zgodovinski dogodki";
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
        timelineEl.innerHTML = '<p style="font-style:italic; color: var(--text-muted);">Ni dogodkov za ta kraj.</p>';
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
                    ageHTML = `<span class="timeline-age">star ${age} let</span>`;
                }
            }

            div.innerHTML = `
                <div class="timeline-header">
                    <span class="timeline-author" style="cursor:pointer; font-weight: bold; color: var(--amber);" onclick="showMusicianDetails('${item.musicianId}')">${item.musicianName}</span>
                    <span class="timeline-year">${item.event.year || ''}</span>
                    ${ageHTML}
                </div>
                <div style="color: #ddd; margin-top: 4px;">${parseWikiLinks(item.event.text)}</div>
            `;
            timelineEl.appendChild(div);
        });
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

    history.pushState({ view: "details", id: null }, "");
}

function parseWikiLinks(text) {
    if (!text) return '';
    return text.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
        const target = musicians.find(m => m.name.toLowerCase().trim() === p1.toLowerCase().trim());
        if (target) {
            return `<span class="person-link" onclick="showMusicianDetails('${target.id}')">${p1}</span>`;
        }
        return `<span style="color: var(--text-muted); border-bottom: 1px dotted #556;">${p1}</span>`;
    });
}

function generatePureSummary(m) {
    const bYear = parseYear(m.birth) || m.birth;
    const dYear = parseYear(m.death) || m.death;
    let summary = `<strong>${m.name}</strong> je živel med letoma ${bYear} in ${dYear}. `;
    
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
            summary += `Glavne postaje delovanja: ${locations.map(l => `<strong class="timeline-location" onclick="document.getElementById('location-filter').value='${l}'; filterByLocation('${l}')">${l}</strong>`).join(', ')}. `;
        }
        if (uniqueConnections.length > 0) {
            summary += `Zabeležene povezave z avtorji: ${uniqueConnections.map(c => `<strong>${c}</strong>`).join(', ')}.`;
        }
    }
    return summary;
}

function showMusicianDetails(id) {
    const filterSelect = document.getElementById('location-filter');
    if (filterSelect) filterSelect.value = "";
    
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');
    document.getElementById('add-event-btn').classList.remove('hidden');
    
    document.getElementById('profile-settings-container').classList.remove('hidden');
    document.getElementById('profile-dropdown').classList.remove('prikazi-meni');
    
    document.getElementById('timeline-title').textContent = "Časovnica";
    
    currentMusicianId = id;
    const m = musicians.find(item => item.id === id);
    if (!m) return;

    document.getElementById('view-name').textContent = m.name;
    document.getElementById('view-dates').textContent = `${m.birth} – ${m.death}`;
    document.getElementById('pure-summary').innerHTML = generatePureSummary(m);

    const avatarContainer = document.getElementById('view-avatar-container');
    
    // Izris avatarja (slika ali začetnice)
    if (m.img && m.img.trim() !== "") {
        avatarContainer.innerHTML = `<img src="${m.img}" class="avatar-circle avatar-large" alt="${m.name}" style="border: 2px solid var(--amber);">`;
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
                ${initials}
            </div>`;
    }

    renderTimeline(m);
    
    // Prikaz podrobnosti in gumba za vrnitev
    document.getElementById('details-view').classList.remove('hidden');
    
    // Gumb Nazaj se prikaže samo tukaj, v pogledu podrobnosti
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.style.display = 'inline-block';
    }

    renderJourneyDiagram(m);

    document.getElementById('sidebar').classList.add('mobilno-skrij');
    document.getElementById('main-content').classList.add('mobilno-prikaži');

    history.pushState({ view: "details", id: id }, "");
}

/* ==========================================================================
   AI EKSTRAKCIJA IN MODALNA OKNA
   ========================================================================== */

async function extractEventsWithGemini() {
    const apiKey = document.getElementById('gemini-api-key').value.trim();
    const text = document.getElementById('raw-bio-input').value.trim();

    if (!apiKey) { alert("Prosim, vnesite svoj Google Gemini API ključ."); return; }
    if (!text) { alert("Prilepite besedilo za analizo."); return; }

    const btn = document.getElementById('ai-analyze-btn');
    btn.textContent = "AI razmišlja in preureja stavke...";
    btn.disabled = true;

    const existingLocs = getAllExistingLocations();

    const prompt = `Danes deluješ kot strokovni zgodovinski asistent za ekstrakcijo podatkov. 
Iz naslednjega zgodovinskega besedila izlušči dogodke in dela ter jih vrni v strogi JSON strukturi.

ZAHTEVANA PRAVILA ZA AI EKSTRAKCIJO:
JEZIK: Vsi opisi dogodkov morajo biti VEDNO v slovenščini. Prevedi smiselno, strokovno in jedrnato. Slog naj bo deskriptiven (npr. "Zaposlitev kot organist na dvoru", "Izid zbirke madrigalov", "Rojstvo", "Smrt"). Nakoncu vsakega opisa je VEDNO pika.

LOKACIJA (KRAJ): Vedno identificiraj geografsko lokacijo. Uporabljaj slovenski imenovalnik (npr. "Gradec", "Benetke", "Dunaj", "Rim"). Če lokacije ni mogoče zaznati, vrni prazen niz "".

USKLAJENOST KRAJEV: Uporabi uveljavljena slovenska imena za mesta. Za usklajevanje z obstoječimi lokacijami v bazi uporabi standardizirana poimenovanja.

FILTRIRANJE: Ignoriraj tehnične oznake (BWV, RV, Op.), razen če so del naslova zbirke, ki jo je smiselno ohraniti.

FORMAT ODGOVORA: Odgovor vrni STRIKTNO kot veljaven JSON array objekt. Brez kakršnihkoli uvodnih besed, brez oznak brez zaključnih besed.

Format mora biti natančno tak:
[{"year": "Letnica", "location": "Kraj", "text": "Kratek in jedrnat opis v slovenščini s piko na koncu."}]

Besedilo za analizo:
${text}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0]) {
            throw new Error("API ni vrnil veljavnih podatkov. Preveri API ključ.");
        }

        let aiTextResponse = data.candidates[0].content.parts[0].text.trim();
        aiTextResponse = aiTextResponse.replace(/^```json/i, "").replace(/```$/, "").trim();
        
        const parsedEvents = JSON.parse(aiTextResponse);
        displayExtractedRows(parsedEvents);

    } catch (error) {
        console.error(error);
        alert("Prišlo je do napake pri komunikaciji z AI ali obdelavi podatkov. Preverite ključ in poskusite ponovno.");
    } finally {
        btn.textContent = "✨ Preuredi in analiziraj z AI";
        btn.disabled = false;
    }
}


function displayExtractedRows(events) {
    const resultsContainer = document.getElementById('extraction-results-container');
    const listEl = document.getElementById('extraction-rows-list');
    listEl.innerHTML = '';

    if(!Array.isArray(events) || events.length === 0) {
        listEl.innerHTML = '<p style="font-style:italic; color:var(--text-muted); font-size:13px;">AI ni uspel izluščiti dogodkov.</p>';
        document.getElementById('save-extracted-btn').classList.add('hidden');
    } else {
        events.sort((a,b) => (parseYear(a.year) || 0) - (parseYear(b.year) || 0));

        events.forEach((ev, idx) => {
            const row = document.createElement('div');
            row.className = 'extracted-row';
            row.innerHTML = `
                <input type="checkbox" id="ext-check-${idx}" checked style="width:auto; margin-right:4px;">
                <input type="text" id="ext-year-${idx}" value="${ev.year || ''}" style="width:60px; text-align:center; font-weight:bold; color:var(--amber);">
                <input type="text" id="ext-loc-${idx}" value="${ev.location || ''}" placeholder="Kraj" style="width:100px;">
                <input type="text" id="ext-text-${idx}" value="${ev.text || ''}" style="flex:1;">
            `;
            listEl.appendChild(row);
        });
        document.getElementById('save-extracted-btn').classList.remove('hidden');
    }
    resultsContainer.classList.remove('hidden');
}

function saveCheckedExtractedEvents() {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;
    if (!m.events) m.events = [];

    const rows = document.getElementById('extraction-rows-list').children;
    let importCount = 0;

    for(let i = 0; i < rows.length; i++) {
        const checkbox = document.getElementById(`ext-check-${i}`);
        if (checkbox && checkbox.checked) {
            const year = document.getElementById(`ext-year-${i}`).value.trim();
            const location = document.getElementById(`ext-loc-${i}`).value.trim();
            const text = document.getElementById(`ext-text-${i}`).value.trim();

            if(text) {
                m.events.push({
                    id: Date.now() + i,
                    year: year,
                    location: location,
                    text: text
                });
                importCount++;
            }
        }
    }

    if(importCount > 0) {
        saveToStorage();
        updateLocationLists();
        renderTimeline(m);
        document.getElementById('pure-summary').innerHTML = generatePureSummary(m);
        alert(`Uspešno preurejenih in uvoženih ${importCount} dogodkov!`);
        hideEventModal();
    } else {
        alert("Noben dogodek ni bil izbran.");
    }
}

function renderTimeline(musician) {
    const timelineEl = document.getElementById('timeline');
    timelineEl.innerHTML = '';

    if (!musician.events || musician.events.length === 0) {
        timelineEl.innerHTML = '<p style="font-style:italic; color: var(--text-muted);">Ni dogodkov.</p>';
        return;
    }

    const sorted = [...musician.events].sort((a, b) => (parseYear(a.year) || 9999) - (parseYear(b.year) || 9999));
    const birthYear = parseYear(musician.birth);

    sorted.forEach(e => {
        const div = document.createElement('div');
        div.className = 'timeline-item';
        
        const locHTML = e.location ? `<span class="timeline-location" onclick="document.getElementById('location-filter').value='${e.location}'; filterByLocation('${e.location}')">📍 ${e.location}</span>` : '';
        
        let ageHTML = '';
        const eventYear = parseYear(e.year);
        if (birthYear && eventYear) {
            const age = eventYear - birthYear;
            if (age >= 0 && age <= 110) {
                ageHTML = `<span class="timeline-age">star ${age} let</span>`;
            }
        }
        
        div.innerHTML = `
            <div class="timeline-header">
                <span class="timeline-year">${e.year || ''}</span>
                ${locHTML}
                ${ageHTML}
            </div>
            <div style="color: #ddd;">${parseWikiLinks(e.text)}</div>
            <div class="timeline-actions">
                <button class="btn-action" onclick="showEventModal(true, ${e.id})" title="Uredi">✏️</button>
                <button class="btn-action btn-delete" onclick="deleteEvent(${e.id})" title="Izbriši">❌</button>
            </div>
        `;
        timelineEl.appendChild(div);
    });
}

function closeDetailsView() {
    // 1. Skrijemo pogled podrobnosti
    document.getElementById('details-view').classList.add('hidden');
    
    // 2. Prikažemo začetni pozdravni napis
    document.getElementById('placeholder-text').classList.remove('hidden');
    
    // 3. Skrijemo gumb za nazaj
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.style.display = 'none';
    }
    
    // 4. Ponastavimo mobilni prikaz (prikažemo seznam, skrijemo vsebino)
    document.getElementById('sidebar').classList.remove('mobilno-skrij');
    document.getElementById('main-content').classList.remove('mobilno-prikaži');
    
    // 5. Očistimo trenutni ID
    currentMusicianId = null;

    // 6. Očistimo zgodovino, da se ne zgodi dvojno vračanje
    if (history.state && history.state.view === "details") {
        history.back();
    }
}

function hideAllViews() {
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');
    document.getElementById('details-view').classList.add('hidden');
}

function showAddMusicianForm() {
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('details-view').classList.add('hidden');
    
    const formEl = document.getElementById('add-musician-form');
    formEl.classList.remove('hidden');

    document.getElementById('form-heading').textContent = "Dodaj novo osebo";
    document.getElementById('new-name').value = "";
    document.getElementById('new-birth').value = "";
    document.getElementById('new-death').value = "";
    document.getElementById('new-image').value = "";

    document.getElementById('back-btn').style.display = 'inline-block';
    document.getElementById('sidebar').classList.add('mobilno-skrij');
    document.getElementById('main-content').classList.add('mobilno-prikaži');

    history.pushState({ view: "details", id: null }, "");
}

function showEditMusicianForm() {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;
    
    hideAllViews();
    isEditingMusicianMode = true;
    document.getElementById('form-heading').textContent = "Uredi osebo: " + m.name;
    document.getElementById('new-name').value = m.name;
    document.getElementById('new-birth').value = m.birth;
    document.getElementById('new-death').value = m.death;
    document.getElementById('new-image').value = m.img || '';
    document.getElementById('add-musician-form').classList.remove('hidden');
    document.getElementById('back-btn').style.display = 'inline-block';

    history.pushState({ view: "details", id: null }, "");
}

function saveNewMusician() {
    const name = document.getElementById('new-name').value.trim();
    const birth = document.getElementById('new-birth').value.trim() || '?';
    const death = document.getElementById('new-death').value.trim() || '?';
    const img = document.getElementById('new-image').value.trim();

    if (!name) { alert("Vnesite ime."); return; }

    if (isEditingMusicianMode) {
        const m = musicians.find(item => item.id === currentMusicianId);
        if (m) {
            m.name = name;
            m.birth = birth;
            m.death = death;
            m.img = img;
        }
    } else {
        const newId = generateId(name);
        const newMusician = { id: newId, name: name, birth: birth, death: death, img: img, events: [] };
        musicians.push(newMusician);
        currentMusicianId = newId;
    }

    saveToStorage();
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
        document.getElementById('modal-title').textContent = "Uredi dogodek";
        document.getElementById('modal-save-btn').textContent = "Shrani";
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
        document.getElementById('modal-title').textContent = "Dodaj dogodek";
        document.getElementById('modal-save-btn').textContent = "Dodaj";
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
    if (!text) { alert("Vnesite opis."); return; }

    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;

    if (editingEventId !== null) {
        const ev = m.events.find(e => e.id === editingEventId);
        if (ev) {
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
            text: text
        });
    }

    saveToStorage();
    updateLocationLists();
    renderTimeline(m);
    document.getElementById('pure-summary').innerHTML = generatePureSummary(m);
    hideEventModal();
}

function deleteEvent(eventId) {
    if (confirm("Ali ste prepričani, da želite izbrisati ta dogodek?")) {
        const m = musicians.find(item => item.id === currentMusicianId);
        if (m) {
            m.events = m.events.filter(e => e.id !== eventId);
            saveToStorage();
            updateLocationLists();
            renderTimeline(m);
            document.getElementById('pure-summary').innerHTML = generatePureSummary(m);
        }
    }
}

function exportDatabase() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(musicians, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "arhiv_skladateljev_backup.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (Array.isArray(importedData)) {
                if (confirm("Ali želite zamenjati TRENUTNO bazo z naloženo varnostno kopijo celotne baze?")) {
                    musicians = importedData;
                    saveToStorage();
                    searchMusicians();
                    updateLocationLists();
                    updateLinkDropdowns();
                    closeDetailsView();
                    alert("Celotna baza uspešno uvožena!");
                }
            } else if (importedData && typeof importedData === 'object' && importedData.name) {
                if (confirm(`Ali želite v bazo uvoziti/posodobiti skladatelja "${importedData.name}"?`)) {
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
                    
                    saveToStorage();
                    searchMusicians();
                    updateLocationLists();
                    updateLinkDropdowns();
                    
                    currentMusicianId = importedData.id;
                    showMusicianDetails(importedData.id);
                    alert(`Skladatelj "${importedData.name}" uspešno uvožen in naložen!`);
                }
            } else {
                alert("Napaka: Datoteka nima pravilne strukture.");
            }
        } catch (err) {
            console.error(err);
            alert("Napaka pri branju datoteke.");
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function mergeMusicianPrompt() {
    const currentId = currentMusicianId; 
    const sourceMusician = musicians.find(m => m.id === currentId);
    
    if (!sourceMusician) {
        alert("Napaka: Ni mogoče najti trenutnega skladatelja.");
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
    document.getElementById('merge-label-current').textContent = `${sourceMusician.name} (Obdrži trenutnega)`;
    document.getElementById('merge-label-target').textContent = `Izbrani duplikat iz spodnjega seznama`;

    const selectEl = document.getElementById('merge-target-select');
    selectEl.innerHTML = '<option value="">-- izberi skladatelja za združitev --</option>';
    
    musicians.forEach(m => {
        if (m.id !== sourceMusician.id) {
            selectEl.innerHTML += `<option value="${m.id}">${m.name}</option>`;
        }
    });

    document.getElementById('event-modal').classList.remove('hidden');
}

function executeMusicianMerge() {
    const sourceMusician = musicians.find(m => m.id === currentMusicianId);
    const targetSelect = document.getElementById('merge-target-select');
    const targetId = targetSelect.value;

    if (!targetId) {
        alert("Prosim, izberite skladatelja, s katerim želite združiti trenutnega.");
        return;
    }

    const targetMusician = musicians.find(m => m.id === targetId);
    if (!sourceMusician || !targetMusician) {
        alert("Napaka pri branju podatkov skladateljev.");
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

    if (!confirm(`Ali ste prepričani, da želite združiti vse dogodke pod profil "${mainMusician.name}"? Profil "${duplicateMusician.name}" bo trajno izbrisan.`)) {
        return;
    }

    if (!mainMusician.events) mainMusician.events = [];
    if (duplicateMusician.events && duplicateMusician.events.length > 0) {
        mainMusician.events = mainMusician.events.concat(duplicateMusician.events);
    }

    mainMusician.events.sort((a, b) => (parseYear(a.year) || 9999) - (parseYear(b.year) || 9999));
    musicians = musicians.filter(m => m.id !== duplicateMusician.id);

    saveToStorage();
    hideEventModal();

    alert(`Uspešno združeno! Duplikat (${duplicateMusician.name}) je izbrisan.`);
    showMusicianDetails(mainMusician.id);
}

/* ==========================================================================
   LEAFLET ZEMLJEVIDI IN NAVIGACIJA
   ========================================================================== */

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
    
    const sortedEvents = [...musician.events].sort((a, b) => (parseYear(a.year) || 9999) - (parseYear(b.year) || 9999));
    const travelStations = [];
    
    for (const ev of sortedEvents) {
        if (!ev.location || ev.location.trim() === '') continue;
        
        const locName = ev.location.trim();
        let coords = GEO_COORDINATES[locName];

        if (!coords) {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locName)}&limit=1`, {
                    headers: { 'User-Agent': 'BaroqueArchiveApp/1.0' }
                });
                const data = await response.json();
                
                if (data && data.length > 0) {
                    coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                    GEO_COORDINATES[locName] = coords;
                } else {
                    continue;
                }
            } catch (err) {
                continue;
            }
        }

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