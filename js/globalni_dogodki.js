/* ==========================================================================
   INDEPENDENT HISTORICAL EVENTS (plagues, wars, famines...)
   Span a date range (year required, month optional) and get cross-referenced
   against every composer event that falls inside that range with a ⭐ badge.
   ========================================================================== */

const MESEC_IMENA = ["January", "February", "March", "April", "May", "June",
                     "July", "August", "September", "October", "November", "December"];

let globalEvents = [];
let editingGlobalEventId = null;

(function populateMonthSelects() {
    const selects = ['ge-start-month', 'ge-end-month'];
    selects.forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        MESEC_IMENA.forEach((name, idx) => {
            const opt = document.createElement('option');
            opt.value = idx + 1;
            opt.textContent = name;
            sel.appendChild(opt);
        });
    });
})();

// Save a global event to Firestore — with retry logic
async function shraniGlobalniDogodekVFirestore(g) {
    if (window.DEVELOPMENT_MODE) return;
    if (!window.db) { console.error("Firestore is not available."); return; }

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await window.fsSetDoc(window.fsDoc(window.db, 'globalEvents', g.id), g);
            return;
        } catch (err) {
            lastError = err;
            console.warn(`Attempt ${attempt}/${maxRetries} failed:`, err.code);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 500));
            }
        }
    }
    console.error("Final error after retries:", lastError);
    alert("Error saving the historical event. Check your internet connection.");
}

// Delete a global event from Firestore — with retry logic
async function izbrisiGlobalniDogodekIzFirestore(id) {
    if (window.DEVELOPMENT_MODE) return;
    if (!window.db) return;

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await window.fsDeleteDoc(window.fsDoc(window.db, 'globalEvents', id));
            return;
        } catch (err) {
            lastError = err;
            console.warn(`Delete attempt ${attempt}/${maxRetries} failed:`, err.code);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 500));
            }
        }
    }
    console.error("Final delete error after retries:", lastError);
    alert("Error deleting the historical event.");
}

// Load all global events from Firestore (called on login) — with retry logic
async function naloziGlobalneDogodkeIzFirestore() {
    if (!window.db) { console.error("Firestore is not available."); return; }

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const snapshot = await window.fsGetDocs(window.fsCollection(window.db, 'globalEvents'));
            globalEvents = [];
            snapshot.forEach(d => globalEvents.push(d.data()));
            if (typeof renderGlobalEventList === 'function') renderGlobalEventList();
            return;
        } catch (err) {
            lastError = err;
            console.warn(`Load attempt ${attempt}/${maxRetries} failed:`, err.code);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 500));
            }
        }
    }
    console.error("Final load error after retries:", lastError);
}
window.naloziGlobalneDogodkeIzFirestore = naloziGlobalneDogodkeIzFirestore;

function formatGlobalEventPeriod(g) {
    const startTxt = g.startMonth ? `${MESEC_IMENA[g.startMonth - 1]} ${g.startYear}` : `${g.startYear}`;
    const endTxt = g.endMonth ? `${MESEC_IMENA[g.endMonth - 1]} ${g.endYear}` : `${g.endYear}`;
    return `${startTxt} – ${endTxt}`;
}

// Highlights whichever of the two sidebar "add" buttons is currently active
// (amber/filled) and dims the other one (outline).
function setAddButtonActive(which) {
    const musicianBtn = document.getElementById('btn-add-musician');
    const eventBtn = document.getElementById('btn-add-global-event');
    if (!musicianBtn || !eventBtn) return;

    if (which === 'musician') {
        musicianBtn.classList.remove('secondary');
        eventBtn.classList.add('secondary');
    } else {
        eventBtn.classList.remove('secondary');
        musicianBtn.classList.add('secondary');
    }
}

function resetGlobalEventForm() {
    document.getElementById('ge-name').value = '';
    document.getElementById('ge-description').value = '';
    document.getElementById('ge-locations').value = '';
    document.getElementById('ge-start-year').value = '';
    document.getElementById('ge-start-month').value = '';
    document.getElementById('ge-end-year').value = '';
    document.getElementById('ge-end-month').value = '';

    const heading = document.getElementById('ge-form-heading');
    if (heading) heading.textContent = 'Add historical event';
    const saveBtn = document.getElementById('ge-save-btn');
    if (saveBtn) saveBtn.textContent = 'Save';
}

function showAddGlobalEventForm() {
    if (window.DEVELOPMENT_MODE) return;
    if (typeof hideAllViews === 'function') hideAllViews();
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('details-view').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');

    setAddButtonActive('event');

    editingGlobalEventId = null;
    resetGlobalEventForm();

    document.getElementById('add-global-event-form').classList.remove('hidden');
    document.getElementById('back-btn').style.display = 'inline-block';

    document.getElementById('sidebar').classList.add('mobilno-skrij');
    document.getElementById('main-content').classList.add('mobilno-prikaži');

    renderGlobalEventList();
}

// Opens the historical-event form pre-filled for editing. Only the person who
// created the event (vnesUID) may edit it; events with no recorded creator
// (added before this field existed) are treated as editable by anyone, same
// as the rest of the app's ownership checks.
function editGlobalEvent(id) {
    if (window.DEVELOPMENT_MODE) return;
    const g = globalEvents.find(item => item.id === id);
    if (!g) return;
    if (g.vnesUID !== window.trenutniUporabnikUID) {
        alert("You can only edit historical events you added yourself.");
        return;
    }

    if (typeof hideAllViews === 'function') hideAllViews();
    document.getElementById('placeholder-text').classList.add('hidden');
    document.getElementById('details-view').classList.add('hidden');
    document.getElementById('add-musician-form').classList.add('hidden');

    setAddButtonActive('event');

    editingGlobalEventId = id;
    document.getElementById('ge-name').value = g.name || '';
    document.getElementById('ge-description').value = g.description || '';
    document.getElementById('ge-locations').value = (g.locations || []).join(', ');
    document.getElementById('ge-start-year').value = g.startYear || '';
    document.getElementById('ge-start-month').value = g.startMonth || '';
    document.getElementById('ge-end-year').value = g.endYear || '';
    document.getElementById('ge-end-month').value = g.endMonth || '';

    const heading = document.getElementById('ge-form-heading');
    if (heading) heading.textContent = 'Edit historical event';
    const saveBtn = document.getElementById('ge-save-btn');
    if (saveBtn) saveBtn.textContent = 'Update';

    document.getElementById('add-global-event-form').classList.remove('hidden');
    document.getElementById('back-btn').style.display = 'inline-block';

    document.getElementById('sidebar').classList.add('mobilno-skrij');
    document.getElementById('main-content').classList.add('mobilno-prikaži');

    renderGlobalEventList();
}

function renderGlobalEventList() {
    const listEl = document.getElementById('global-event-list');
    if (!listEl) return;

    if (globalEvents.length === 0) {
        listEl.innerHTML = '<p style="font-style:italic; color: var(--text-muted); font-size: 13px;">No historical events added yet.</p>';
        return;
    }

    const sorted = [...globalEvents].sort((a, b) => (a.startYear || 0) - (b.startYear || 0));

    listEl.innerHTML = sorted.map(g => {
        // Editing AND deleting a historical event are both owner-only (enforced
        // server-side too - see firestore.rules), unlike composer events.
        const canManage = g.vnesUID === window.trenutniUporabnikUID;
        return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 0; border-bottom:1px solid var(--border-color);">
            <div style="min-width:0; flex:1;">
                <strong>⭐ ${escapeHtml(g.name)}</strong>
                <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(formatGlobalEventPeriod(g))}${g.locations && g.locations.length ? ' · 📍 ' + escapeHtml(g.locations.join(', ')) : ''}</div>
            </div>
            ${canManage ? `
            <div style="display:flex; gap:2px; flex-shrink:0;">
                <button class="btn-action" title="Edit" onclick="editGlobalEvent('${g.id}')">✏️</button>
                <button class="btn-action btn-delete" title="Delete" onclick="deleteGlobalEvent('${g.id}')">❌</button>
            </div>` : ''}
        </div>
    `;
    }).join('');
}

function saveNewGlobalEvent() {
    if (window.DEVELOPMENT_MODE) return;
    const name = document.getElementById('ge-name').value.trim();
    const description = document.getElementById('ge-description').value.trim();
    const startYear = parseInt(document.getElementById('ge-start-year').value.trim(), 10);
    const startMonth = document.getElementById('ge-start-month').value ? parseInt(document.getElementById('ge-start-month').value, 10) : null;
    const endYear = parseInt(document.getElementById('ge-end-year').value.trim(), 10);
    const endMonth = document.getElementById('ge-end-month').value ? parseInt(document.getElementById('ge-end-month').value, 10) : null;
    const locations = document.getElementById('ge-locations').value
        .split(',')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    if (!name) { alert("Please enter an event name."); return; }
    if (!startYear || !endYear) { alert("Please enter both a start year and an end year."); return; }
    if (endYear < startYear) { alert("The end year cannot be before the start year."); return; }

    const isEditing = !!editingGlobalEventId;
    const existingEvent = isEditing ? globalEvents.find(g => g.id === editingGlobalEventId) : null;

    if (isEditing && existingEvent && existingEvent.vnesUID !== window.trenutniUporabnikUID) {
        alert("You can only edit historical events you added yourself.");
        return;
    }

    const updatedEvent = {
        id: isEditing ? editingGlobalEventId : generateId(name) + '-' + startYear,
        name, description, startYear, startMonth, endYear, endMonth, locations,
        vnesUID: existingEvent ? existingEvent.vnesUID : (window.trenutniUporabnikUID || null),
        vnesIme: existingEvent ? existingEvent.vnesIme : (window.trenutniUporabnikIme || ''),
        vnesPriimek: existingEvent ? existingEvent.vnesPriimek : (window.trenutniUporabnikPriimek || '')
    };

    if (isEditing) {
        const idx = globalEvents.findIndex(g => g.id === editingGlobalEventId);
        if (idx !== -1) globalEvents[idx] = updatedEvent; else globalEvents.push(updatedEvent);
    } else {
        globalEvents.push(updatedEvent);
    }

    shraniGlobalniDogodekVFirestore(updatedEvent);
    renderGlobalEventList();

    editingGlobalEventId = null;
    resetGlobalEventForm();

    alert(isEditing
        ? `Historical event "${name}" updated!`
        : `Historical event "${name}" saved! Matching composer events will now show a ⭐.`);

    // Re-render whichever timeline is currently open so the new star badges appear immediately
    if (typeof currentMusicianId !== 'undefined' && currentMusicianId) {
        const m = musicians.find(item => item.id === currentMusicianId);
        if (m && typeof renderTimeline === 'function') renderTimeline(m);
    }
}

function deleteGlobalEvent(id) {
    if (window.DEVELOPMENT_MODE) return;
    const g = globalEvents.find(item => item.id === id);
    if (g && g.vnesUID !== window.trenutniUporabnikUID) {
        alert("You can only delete historical events you added yourself.");
        return;
    }
    if (!confirm("Delete this historical event? The ⭐ markers on composer events will disappear.")) return;
    globalEvents = globalEvents.filter(g => g.id !== id);
    izbrisiGlobalniDogodekIzFirestore(id);
    if (editingGlobalEventId === id) {
        editingGlobalEventId = null;
        resetGlobalEventForm();
    }
    renderGlobalEventList();

    if (typeof currentMusicianId !== 'undefined' && currentMusicianId) {
        const m = musicians.find(item => item.id === currentMusicianId);
        if (m && typeof renderTimeline === 'function') renderTimeline(m);
    }
}

// place name (lowercase) -> { countryCode, country, state } (all lowercase) or null.
// Resolved via geocoding for BOTH composer-event cities (e.g. "London") AND the
// free-text locations typed into a historical event (e.g. "Italija", "England").
// Comparing by countryCode (a language-independent ISO code) instead of raw text
// means the typed language/spelling doesn't matter - "Italija", "Italy" and
// "Italia" all resolve to countryCode "it" and therefore match each other.
let LOCATION_COUNTRY_CACHE = {};

async function resolveLocationCountry(locationName) {
    const key = locationName.trim().toLowerCase();
    if (key in LOCATION_COUNTRY_CACHE) return LOCATION_COUNTRY_CACHE[key];

    // Gre skozi skupni Firebase "locations" cache (glej js/lokacije.js):
    // najprej Firebase, šele nato zunanji geokoder, uspeh se shrani nazaj.
    let territory = null;
    try {
        if (typeof window.resolveLocationData === 'function') {
            const data = await window.resolveLocationData(locationName);
            if (data) {
                territory = {
                    countryCode: data.countryCode || null,
                    country: data.country || null,
                    state: data.state || null
                };
            }
        }
    } catch (err) {
        console.error("Error resolving country for location:", locationName, err);
    }
    LOCATION_COUNTRY_CACHE[key] = territory;
    return territory;
}

// Resolves any not-yet-cached locations to their territory (rate-limited, one at a
// time, per Nominatim's usage policy) and calls rerenderFn once new matches might
// be available. Resolves BOTH the currently displayed composer-event locations AND
// every historical event's own typed locations, so both sides of the comparison
// end up in the same cache. Skipped entirely if no historical event restricts by
// location, so normal browsing never triggers extra network calls.
async function refreshGlobalEventStarsForLocations(locations, rerenderFn) {
    const restrictedEvents = globalEvents.filter(g => g.locations && g.locations.length > 0);
    if (restrictedEvents.length === 0) return;

    const globalEventLocs = restrictedEvents.flatMap(g => g.locations);
    const uniqueLocations = [...new Set([...locations, ...globalEventLocs].filter(l => l && l.trim() !== ''))];
    const unresolved = uniqueLocations.filter(l => !(l.trim().toLowerCase() in LOCATION_COUNTRY_CACHE));
    if (unresolved.length === 0) return;

    let resolvedAny = false;
    for (const loc of unresolved) {
        // Firebase cache zadetki so takojšnji; zunanje klice serializira in
        // časovno omeji resolveLocationData (js/lokacije.js), zato tu ni sleepa.
        const territory = await resolveLocationCountry(loc);
        if (territory) resolvedAny = true;
    }
    if (resolvedAny && typeof rerenderFn === 'function') rerenderFn();
}

// Returns the global events whose [startYear, endYear] range contains eventYear
// AND, if the event specifies locations, whose location list matches eventLocation -
// either as an exact text match, or (once both sides are geocoded) the same country,
// further narrowed to the same state/region when the historical event names one
// (e.g. "England" matches London but not Rome, even though both resolve country-wise).
// A global event with no locations listed is treated as affecting everywhere.
function getMatchingGlobalEvents(eventYear, eventLocation) {
    if (!eventYear) return [];
    const cleanLoc = (eventLocation || '').toLowerCase().trim();
    const cityTerritory = LOCATION_COUNTRY_CACHE[cleanLoc] || null;

    return globalEvents.filter(g => {
        const yearMatches = eventYear >= g.startYear && eventYear <= g.endYear;
        if (!yearMatches) return false;
        if (!g.locations || g.locations.length === 0) return true;

        return g.locations.some(loc => {
            const cleanGLoc = loc.toLowerCase().trim();
            if (cleanGLoc === cleanLoc) return true;

            const gLocTerritory = LOCATION_COUNTRY_CACHE[cleanGLoc] || null;
            if (!cityTerritory || !gLocTerritory || !cityTerritory.countryCode || !gLocTerritory.countryCode) return false;
            if (cityTerritory.countryCode !== gLocTerritory.countryCode) return false;

            // Same country. If the historical event names a specific region
            // (e.g. "England"), only match cities within that same region.
            return gLocTerritory.state ? gLocTerritory.state === cityTerritory.state : true;
        });
    });
}

// Returns a ready-to-insert ⭐ badge (or '' if no match) for a given event year + location
function globalEventBadgeHTML(eventYear, eventLocation) {
    const matches = getMatchingGlobalEvents(eventYear, eventLocation);
    if (matches.length === 0) return '';
    const idsAttr = matches.map(g => g.id.replace(/'/g, "\\'")).join('|');
    return `<span class="global-event-star" title="Coincides with a historical event" onclick="event.stopPropagation(); showGlobalEventPopup('${idsAttr}')">⭐</span>`;
}

function showGlobalEventPopup(idsPipeSeparated) {
    const ids = idsPipeSeparated.split('|');
    const matches = globalEvents.filter(g => ids.includes(g.id));
    if (matches.length === 0) return;

    const staro = document.getElementById('global-event-popup');
    if (staro) staro.remove();

    const overlay = document.createElement('div');
    overlay.id = 'global-event-popup';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:100001; font-family:sans-serif;';
    overlay.onclick = function(ev) { if (ev.target === overlay) overlay.remove(); };

    const itemsHTML = matches.map(g => `
        <div style="margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--border-color, #2a2a35);">
            <h3 style="margin: 0 0 4px 0; color: var(--amber, #f2cc5a);">⭐ ${escapeHtml(g.name)}</h3>
            <div style="font-size: 12px; color: var(--text-muted, #888999); margin-bottom: 4px;">${escapeHtml(formatGlobalEventPeriod(g))}</div>
            ${g.locations && g.locations.length ? `<div style="font-size: 12px; color: var(--text-muted, #888999); margin-bottom: 8px;">📍 ${escapeHtml(g.locations.join(', '))}</div>` : ''}
            <div style="font-size: 14px; color: var(--text, #e8e0d0);">${escapeHtml(g.description || '')}</div>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div style="background:var(--panel,#141b29); padding:24px; border-radius:16px; max-width:400px; width:90%; max-height:80vh; overflow-y:auto; color:var(--text,#e8e0d0); border:1px solid var(--border-color,#2a2a35); text-align:left;">
            ${itemsHTML}
            <button class="secondary" style="width:100%; margin-top: 4px;" onclick="document.getElementById('global-event-popup').remove()">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
}
