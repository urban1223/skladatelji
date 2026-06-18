/* ==========================================================================
   AI EKSTRAKCIJA IN MODALNA OKNA
   ========================================================================== */

let editingEventId = null;
let activeTab = 'single';

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