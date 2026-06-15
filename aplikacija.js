let musicians = JSON.parse(localStorage.getItem('baroque_archive_v7')) || zacetniPodatkiSkladateljev;
let currentMusicianId = null;
let editingEventId = null;
let activeTab = 'single';
let isEditingMusicianMode = false;

window.onload = function() {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        document.getElementById('gemini-api-key').value = savedKey;
    }
    searchMusicians();
    updateLocationLists();
    updateLinkDropdowns();

// Zapri spustni meni, če uporabnik klikne kamorkoli drugam na zaslonu
window.addEventListener('click', function(e) {
    const dropdown = document.getElementById('profile-dropdown');
    const settingsBtn = document.getElementById('profile-settings-btn');
    if (dropdown && dropdown.classList.contains('prikazi-meni')) {
        if (e.target !== settingsBtn && !settingsBtn.contains(e.target)) {
            dropdown.classList.remove('prikazi-meni');
        }
    }
});
}

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

// 1. FUNKCIJA: Izbriši celotnega skladatelja
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

// 2. FUNKCIJA: Izvozi samo trenutnega skladatelja v JSON
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

// 3. FUNKCIJA: Kopiraj celoten profil v odložišče (za Word ali Markdown)
function copyProfileToClipboard() {
    const m = musicians.find(item => item.id === currentMusicianId);
    if (!m) return;

    let textToCopy = `${m.name} (${m.birth} – ${m.death})\n`;
    textToCopy += `========================================\n\n`;
    
    // Izvleček čistega povzetka (odstranimo HTML značke)
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
            
            // Odstranimo morebitne [[povezave]] za čisto besedilo v Wordu
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
   OBSTOJEČA LOGIKA (POSODOBLJENA IN OČIŠČENA)
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

async function extractEventsWithGemini() {
    const apiKey = document.getElementById('gemini-api-key').value.trim();
    const text = document.getElementById('raw-bio-input').value.trim();

    if (!apiKey) { alert("Prosim, vnesite svoj Google Gemini API ključ."); return; }
    if (!text) { alert("Prilepite besedilo za analizo."); return; }

    const btn = document.getElementById('ai-analyze-btn');
    btn.textContent = "AI razmišlja in preureja stavke...";
    btn.disabled = true;

    const existingLocs = getAllExistingLocations();

    // Izboljšan in strožji prompt za Gemini AI
    const prompt = `Danes deluješ kot strokovni zgodovinski asistent za ekstrakcijo podatkov. 
Iz naslednjega zgodovinskega besedila izlušči dogodke in dela ter jih vrni v strogi JSON strukturi.

ZAHTEVANA PRAVILA:
// Popravek pravila 1 v promptu za Gemini:
1. JEZIK: Vsi opisi dogodkov morajo biti VEDNO v slovenščini, tudi če je izvorno besedilo v angleščini, nemščini ali katerem koli drugem jeziku. Prevedi smiselno, strokovno in jedrnato (npr. namesto dolgega stavka zapiši "Selitev v London in prevzem vloge dvornega skladatelja" ali "Premiera opere Rinaldo").
2. LOKACIJA (KRAJ): Aktivno poišči geografska mesta, države ali lokacije, povezane z dogodkom (npr. če piše "selitev v Hamburg", je lokacija "Hamburg"; če piše "študij v Gradcu", je lokacija "Gradec"). Lokacije zapisuj v slovenskem imenovalniku (npr. "Hamburg", "Gradec", "London", "Dunaj"). Če je mogoče, uporabi uveljavljena slovenska imena (npr. Vienna -> Dunaj).
3. OBSTOJEČI KRAJI: Če najdeš ujemanje z obstoječimi kraji v moji bazi, uporabi točno to ime: ${JSON.stringify(existingLocs)}. Če lokacije kljub trudu ni mogoče zaznati, vrni prazen niz "".
4. FILTRIRANJE: Ignoriraj navadne številke ali opuse (kot so BWV, RV, Op.), če ne predstavljajo letnice.
5. FORMAT ODGOVORA: Odgovor vrni STRIKTNO kot veljaven JSON array objekt brez kakršnihkoli dodatnih besed ali oznak, kot sta \`\`\`json ali \`\`\`. 

Format mora biti natančno tak:
[{"year": "1711", "location": "London", "text": "Kratek preurejen opis dogodka v slovenščini"}]

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
        
        // Očiščenje morebitnih ostankov markdown oznak za vsak slučaj
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

function searchMusicians() {
    const filterSelect = document.getElementById('location-filter');
    if (filterSelect) filterSelect.value = "";
    
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const listEl = document.getElementById('musician-list');
    
    // Če je iskalno polje prazno, enostavno osvežimo privzet seznam skladateljev na levi
    if (query === "") {
        listEl.innerHTML = '';
        [...musicians].sort((a, b) => a.name.localeCompare(b.name, 'sl')).forEach(m => {
            const li = document.createElement('li');
            let avatarHTML = `<div class="avatar-circle"><span class="avatar-placeholder">🎻</span></div>`;
            if (m.img && m.img.trim() !== "") {
                avatarHTML = `<img src="${m.img}" class="avatar-circle" alt="${m.name}">`;
            }
            li.innerHTML = `${avatarHTML} <span>${m.name} (${m.birth}–${m.death})</span>`;
            li.onclick = () => showMusicianDetails(m.id);
            listEl.appendChild(li);
        });
        return;
    }

    const searchYear = parseYear(query);

    // ==========================================================================
    // NAČIN 1: UPORABNIK IŠČE SPECIFIČNO LETO (npr. 1715)
    // ==========================================================================
    if (searchYear && !isNaN(searchYear) && query.match(/^\d+$/)) {
        
        // Skrijemo začetno okno in obrazce
        document.getElementById('placeholder-text').classList.add('hidden');
        document.getElementById('add-musician-form').classList.add('hidden');
        
        // Pripravimo elemente glavnega okna za prikaz kronologije leta
        const detailsView = document.getElementById('details-view');
        const nameEl = document.getElementById('view-name');
        const datesEl = document.getElementById('view-dates');
        const summaryEl = document.getElementById('pure-summary');
        const timelineEl = document.getElementById('timeline');
        const titleEl = document.getElementById('timeline-title');
        const addEventBtn = document.getElementById('add-event-btn');
        const avatarContainer = document.getElementById('view-avatar-container');
        
        // Skrijemo gumbe, ki so specifični samo za profil posameznika
        document.getElementById('profile-settings-container').classList.add('hidden');
        addEventBtn.classList.add('hidden');
        avatarContainer.innerHTML = "";
        summaryEl.innerHTML = "";

        // Nastavimo naslove
        nameEl.textContent = `Leto ${searchYear}`;
        datesEl.textContent = `Pregled vseh zgodovinskih dogodkov in del v tem letu`;
        titleEl.textContent = "Zabeleženi dogodki";

        // Zberemo vse dogodke iz celotne baze, ki se ujemajo s tem letom
        let allYearEvents = [];
        musicians.forEach(m => {
            if (m.events) {
                m.events.forEach(e => {
                    if (e.year && parseYear(e.year) === searchYear) {
                        allYearEvents.push({
                            musicianName: m.name,
                            musicianId: m.id,
                            musicianBirth: m.birth,
                            event: e
                        });
                    }
                });
            }
        });

        // Sortiramo dogodke (po kraju, da je bolj urejeno, če jih je več)
        allYearEvents.sort((a, b) => (a.event.location || "").localeCompare(b.event.location || "", 'sl'));

        // Izris v časovnico
        timelineEl.innerHTML = '';
        if (allYearEvents.length === 0) {
            timelineEl.innerHTML = `<p style="font-style:italic; color: var(--text-muted);">V letu ${searchYear} v arhivu ni zabeleženih specifičnih dogodkov.</p>`;
        } else {
            allYearEvents.forEach(item => {
                const div = document.createElement('div');
                div.className = 'timeline-item';
                
                let ageHTML = '';
                const birthYear = parseYear(item.musicianBirth);
                if (birthYear) {
                    const age = searchYear - birthYear;
                    if (age >= 0 && age <= 110) {
                        ageHTML = `<span class="timeline-age">star ${age} let</span>`;
                    }
                }

                const locHTML = item.event.location ? `<span class="timeline-location" onclick="document.getElementById('location-filter').value='${item.event.location}'; filterByLocation('${item.event.location}')">📍 ${item.event.location}</span>` : '';

                div.innerHTML = `
                    <div class="timeline-header">
                        <span class="timeline-author" style="cursor:pointer; font-weight:bold; color:var(--amber);" onclick="showMusicianDetails('${item.musicianId}')">${item.musicianName}</span>
                        ${locHTML}
                        ${ageHTML}
                    </div>
                    <div style="color: #ddd; margin-top: 4px;">${parseWikiLinks(item.event.text)}</div>
                `;
                timelineEl.appendChild(div);
            });
        }

        detailsView.classList.remove('hidden');
        document.getElementById('back-btn').style.display = 'inline-block';

        // Mobilni preklop: skrij seznam in prikaži kronologijo leta
        document.getElementById('sidebar').classList.add('mobilno-skrij');
        document.getElementById('main-content').classList.add('mobilno-prikaži');

    // ==========================================================================
    // NAČIN 2: UPORABNIK IŠČE IME SKLADATELJA (KLASIČNO ISKANJE)
    // ==========================================================================
    } else {
        listEl.innerHTML = '';
        let filtered = musicians.filter(m => m.name.toLowerCase().includes(query));
        filtered.sort((a, b) => a.name.localeCompare(b.name, 'sl'));

        filtered.forEach(m => {
            const li = document.createElement('li');
            let avatarHTML = `<div class="avatar-circle"><span class="avatar-placeholder">🎻</span></div>`;
            if (m.img && m.img.trim() !== "") {
                avatarHTML = `<img src="${m.img}" class="avatar-circle" alt="${m.name}">`;
            }
            li.innerHTML = `${avatarHTML} <span>${m.name} (${m.birth}–${m.death})</span>`;
            li.onclick = () => showMusicianDetails(m.id);
            listEl.appendChild(li);
        });
        
        if (filtered.length === 0) {
            listEl.innerHTML = '<li style="color:var(--text-muted); cursor:default; border:none;">Ni zadetkov.</li>';
        }
    }
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
    
    // Skrij gumb za nastavitve profila, ko gledamo celotno lokacijo
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

            // Izris popolnoma enak tistemu pri iskanju po letih:
            // Ime skladatelja je zgoraj kot glava, tekst spodaj pa je čist in ločen.
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

    // Mobilni preklop
    document.getElementById('sidebar').classList.add('mobilno-skrij');
    document.getElementById('main-content').classList.add('mobilno-prikaži');
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
    
    // Prikaži gumb za nastavitve profila, ko gledamo specifičnega skladatelja
    document.getElementById('profile-settings-container').classList.remove('hidden');
    document.getElementById('profile-dropdown').classList.remove('prikazi-meni');
    
    document.getElementById('timeline-title').textContent = "Kronologija in dela";
    
    currentMusicianId = id;
    const m = musicians.find(item => item.id === id);
    if (!m) return;

    document.getElementById('view-name').textContent = m.name;
    document.getElementById('view-dates').textContent = `${m.birth} – ${m.death}`;
    document.getElementById('pure-summary').innerHTML = generatePureSummary(m);

    const avatarContainer = document.getElementById('view-avatar-container');
    if (m.img && m.img.trim() !== "") {
        avatarContainer.innerHTML = `<img src="${m.img}" class="avatar-circle avatar-large" alt="${m.name}">`;
    } else {
        avatarContainer.innerHTML = `<div class="avatar-circle avatar-large"><span class="avatar-placeholder" style="font-size: 2rem;">🎻</span></div>`;
    }

    // Izris besedilne časovnice
    renderTimeline(m);
    
    // DINAMIČNI IZRIS DIAGRAMA POTI (SVG)
    renderJourneyDiagram(m);
    
    document.getElementById('details-view').classList.remove('hidden');
    document.getElementById('back-btn').style.display = 'inline-block';

    // Mobilni preklop: skrij seznam in prikaži kronologijo
    document.getElementById('sidebar').classList.add('mobilno-skrij');
    document.getElementById('main-content').classList.add('mobilno-prikaži');
}

function renderJourneyDiagram(musician) {
    const svg = document.getElementById('journey-svg');
    if (!svg) return;

    // Najprej počistimo prejšnji diagram
    svg.innerHTML = '';

    // 1. Poiščemo vse kronološke dogodke, ki imajo vpisano lokacijo
    if (!musician.events || musician.events.length === 0) {
        svg.innerHTML = `<text x="20" y="90" fill="var(--text-muted)" font-size="13">Ni podatkov o lokacijah za ta profil.</text>`;
        return;
    }

    // Izluščimo kraje po kronološkem vrstnem redu dogodkov
    const chronologicalPlaces = musician.events
        .filter(ev => ev.location && ev.location.trim() !== '')
        .map(ev => ev.location.trim());

    if (chronologicalPlaces.length === 0) {
        svg.innerHTML = `<text x="20" y="90" fill="var(--text-muted)" font-size="13">V kronologiji ni vpisanih krajev.</text>`;
        return;
    }

    // Ustvarimo seznam unikatnih krajev (da se vsako mesto izriše le enkrat kot fiksna pika)
    const uniquePlaces = [...new Set(chronologicalPlaces)];

    // Nastavitve dimenzij znotraj SVG
    const paddingX = 60;
    const centerY = 110; // Višina, kjer bodo stale pike mest
    const svgWidth = svg.clientWidth || svg.getBoundingClientRect().width || 600;
    
    // Izračun razmaka med mesti, da se lepo razporedijo glede na širino zaslona
    const stepX = uniquePlaces.length > 1 ? (svgWidth - paddingX * 2) / (uniquePlaces.length - 1) : 0;

    // Slovar, v katerega si shranimo X koordinato za vsako mesto
    const coords = {};
    uniquePlaces.forEach((place, index) => {
        coords[place] = paddingX + (index * stepX);
    });

    // --- 2. IZRIS POVEZAV (LOKOV POTRETOVANJA) ---
    // Definicija puščice na koncu linije (marker)
    svg.innerHTML += `
        <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--amber)" />
            </marker>
        </defs>
    `;

    // Sprehodimo se skozi zaporedna potovanja (Ljubljana -> Graz, Graz -> Dunaj...)
    for (let i = 0; i < chronologicalPlaces.length - 1; i++) {
        const from = chronologicalPlaces[i];
        const to = chronologicalPlaces[i + 1];

        // Če gre za isto mesto zapored (npr. Ljubljana -> Ljubljana), ne rišemo loka
        if (from === to) continue;

        const x1 = coords[from];
        const x2 = coords[to];
        
        // Izračun loka: večja kot je razdalja med mestoma, višji bo lok (izgleda bolj dinamično)
        const distance = Math.abs(x2 - x1);
        const arcHeight = Math.min(60, distance * 0.4); 
        
        // Določimo, ali gre pot v desno ali nazaj v levo (da se loki ne prekrivajo čisto natančno)
        const sweepFlag = x2 > x1 ? 1 : 0;
        
        // SVG krivulja (A - Arc)
        const pathData = `M ${x1} ${centerY} A ${distance/2} ${arcHeight} 0 0 ${sweepFlag} ${x2} ${centerY}`;

        svg.innerHTML += `
            <path d="${pathData}" 
                  fill="none" 
                  stroke="var(--amber)" 
                  stroke-width="2" 
                  opacity="0.4" 
                  marker-end="url(#arrow)"
                  style="transition: all 0.3s ease;"
                  onmouseover="this.setAttribute('opacity', '1'); this.setAttribute('stroke-width', '3');"
                  onmouseout="this.setAttribute('opacity', '0.4'); this.setAttribute('stroke-width', '2');"
            />
        `;
    }

    // --- 3. IZRIS TOČK (MEST) IN BESEDILA ---
    uniquePlaces.forEach((place) => {
        const x = coords[place];

        // Izračunamo, kolikokrat se to mesto pojavi (pomembnost mesta)
        const occurrenceCount = chronologicalPlaces.filter(p => p === place).length;
        const radius = 5 + Math.min(8, occurrenceCount * 1.5); // Večja pika, če je več dogodkov tam

        // Zunanji sij za piko
        svg.innerHTML += `
            <circle cx="${x}" cy="${centerY}" r="${radius + 3}" fill="var(--amber)" opacity="0.15" />
        `;

        // Glavna pika mesta
        svg.innerHTML += `
            <circle cx="${x}" cy="${centerY}" r="${radius}" fill="#000" stroke="var(--amber)" stroke-width="2.5" />
        `;

        // Ime mesta (napisano navpično pod kotom -45 stopinj, da se imena ne prekrivajo!)
        svg.innerHTML += `
            <text x="${x}" y="${centerY + 18}" 
                  fill="var(--text-light)" 
                  font-size="12px" 
                  font-weight="bold"
                  text-anchor="end" 
                  transform="rotate(-35, ${x}, ${centerY + 18})"
                  style="user-select: none;">
                ${place} (${occurrenceCount}x)
            </text>
        `;
    });
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
    hideAllViews();
    const filterSelect = document.getElementById('location-filter');
    if (filterSelect) filterSelect.value = "";
    
    // Ponovno prikažemo začetno besedilo (za PC)
    document.getElementById('placeholder-text').classList.remove('hidden');
    document.getElementById('back-btn').style.display = 'none';

    // Mobilni preklop: VRNEMO SE NA PRVO STRAN (prikažemo seznam, skrijemo kronologijo)
    document.getElementById('sidebar').classList.remove('mobilno-skrij');
    document.getElementById('main-content').classList.remove('mobilno-prikaži');
    
    // Če je bil iskalnik uporabljen, ga osvežimo, da vrne celoten seznam
    searchMusicians();
}

function hideAllViews() {
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');
    document.getElementById('details-view').classList.add('hidden');
}

function showAddMusicianForm() {
    // 1. Skrijemo vse poglede, ki bi lahko prekrivali desno stran
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('details-view').classList.add('hidden');
    
    // 2. Prikažemo obrazec za dodajanje
    const formEl = document.getElementById('add-musician-form');
    formEl.classList.remove('hidden');

    // 3. Resetiramo naslov obrazca in spraznimo polja (če je prej ostalo kaj vpisano)
    document.getElementById('form-heading').textContent = "Dodaj novo osebo";
    document.getElementById('new-name').value = "";
    document.getElementById('new-birth').value = "";
    document.getElementById('new-death').value = "";
    document.getElementById('new-image').value = "";

    // 4. Poskrbimo za gumb Nazaj
    document.getElementById('back-btn').style.display = 'inline-block';

    // Mobilni preklop: skrijemo sidebar in prikažemo glavni del z obrazcem
    document.getElementById('sidebar').classList.add('mobilno-skrij');
    document.getElementById('main-content').classList.add('mobilno-prikaži');
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
    
    // Ponastavimo poglede
    document.getElementById('modal-single-view').classList.remove('hidden');
    if (document.getElementById('modal-auto-view')) {
        document.getElementById('modal-auto-view').classList.add('hidden');
    }
    document.getElementById('modal-merge-view').classList.add('hidden');
    
    // TUKAJ PONOVNO PRIKAŽEMO ZAVIHKE za naslednjič:
    const tabsEl = document.querySelector('.modal-tabs');
    if (tabsEl) tabsEl.classList.remove('hidden');
    
    // Ponastavi aktivni zavihek
    const tabSingle = document.getElementById('tab-single');
    const tabAuto = document.getElementById('tab-auto');
    if(tabSingle) tabSingle.classList.add('active');
    if(tabAuto) tabAuto.classList.remove('active');
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
                if (confirm("Ali želite zamenjati trenutno baze z naloženo varnostno kopijo?")) {
                    musicians = importedData;
                    saveToStorage();
                    searchMusicians();
                    updateLocationLists();
                    updateLinkDropdowns();
                    closeDetailsView();
                    alert("Baza uspešno uvožena!");
                }
            } else {
                alert("Napaka: Datoteka nima pravilne strukture.");
            }
        } catch (err) {
            alert("Napaka pri branju datoteke.");
        }
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

    // Skrijemo spustni meni možnosti
    document.getElementById('profile-dropdown').classList.add('hidden');

    // 1. Skrijemo ostale poglede v modalu
    document.getElementById('modal-single-view').classList.add('hidden');
    if (document.getElementById('modal-auto-view')) {
        document.getElementById('modal-auto-view').classList.add('hidden');
    }
    
    // TUKAJ SKRIJEMO ZAVIHKE (da ne piše Ročni vnos / AI ekstrakcija):
    const tabsEl = document.querySelector('.modal-tabs');
    if (tabsEl) tabsEl.classList.add('hidden');
    
    // Prikažemo del za združevanje
    document.getElementById('modal-merge-view').classList.remove('hidden');

    // 2. Nastavimo dinamična besedila
    document.getElementById('merge-label-current').textContent = `${sourceMusician.name} (Obdrži trenutnega)`;
    document.getElementById('merge-label-target').textContent = `Izbrani duplikat iz spodnjega seznama`;

    // 3. Napolnimo spustni seznam
    const selectEl = document.getElementById('merge-target-select');
    selectEl.innerHTML = '<option value="">-- izberi skladatelja za združitev --</option>';
    
    musicians.forEach(m => {
        if (m.id !== sourceMusician.id) {
            selectEl.innerHTML += `<option value="${m.id}">${m.name}</option>`;
        }
    });

    // 4. Odpremo modal
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

    // 1. Prenos dogodkov
    if (!mainMusician.events) mainMusician.events = [];
    if (duplicateMusician.events && duplicateMusician.events.length > 0) {
        mainMusician.events = mainMusician.events.concat(duplicateMusician.events);
    }

    // Sortiranje kronologije
    mainMusician.events.sort((a, b) => (parseYear(a.year) || 9999) - (parseYear(b.year) || 9999));

    // 2. STRIKTEN IZBRIS DUPLIKATA IZ BAZE
    musicians = musicians.filter(m => m.id !== duplicateMusician.id);

    // 3. Shranjevanje v LocalStorage (da se ne vrne ob osvežitvi)
    if (typeof saveToLocalStorage === "function") saveToLocalStorage();
    else if (typeof shraniPodatke === "function") shraniPodatke();
    else if (typeof saveToLocalStorageAndRender === "function") saveToLocalStorageAndRender();

    // 4. Zapremo in ponastavimo modal
    hideEventModal();

    alert(`Uspešno združeno! Duplikat (${duplicateMusician.name}) je izbrisan.`);

    // 5. AVTOMATSKO OSVEŽEVANJE VMESNIKA (da duplikat takoj izgine z ekrana)
    // Pokličeva tvoje glavne funkcije za izris levega seznama in desnih podrobnosti:
    if (typeof renderMusicians === "function") renderMusicians();
    if (typeof renderMusicianList === "function") renderMusicianList();
    if (typeof posodobiSeznam === "function") posodobiSeznam();
    if (typeof updateSidebar === "function") updateSidebar();
    
    // Prikažemo očiščen profil glavnega skladatelja
    showMusicianDetails(mainMusician.id);
}