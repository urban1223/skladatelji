/* ==========================================================================
   AI EXTRACTION AND MODAL WINDOWS
   ========================================================================== */

let editingEventId = null;
let activeTab = 'single';

async function extractEventsWithGemini() {
    const apiKey = document.getElementById('gemini-api-key').value.trim();
    const text = document.getElementById('raw-bio-input').value.trim();

    if (!apiKey) { alert("Please enter your Google Gemini API key."); return; }
    if (!text) { alert("Paste the text to analyze."); return; }

    const btn = document.getElementById('ai-analyze-btn');
    btn.textContent = "AI is thinking and rearranging sentences...";
    btn.disabled = true;

    const existingLocs = getAllExistingLocations();

    const prompt = `You are acting as a professional historical research assistant for data extraction.
From the following historical text, extract events and works and return them in a strict JSON structure.

REQUIRED RULES FOR AI EXTRACTION:
LANGUAGE: All event descriptions must ALWAYS be in English. Translate meaningfully, professionally, and concisely. The style should be descriptive (e.g. "Appointment as court organist", "Publication of a madrigal collection", "Birth", "Death"). Each description must ALWAYS end with a period.

LOCATION: Always identify the geographic location. Use the standard English name of the place (e.g. "Graz", "Venice", "Vienna", "Rome"). If no location can be detected, return an empty string "".

LOCATION CONSISTENCY: Use established English place names. To stay consistent with existing locations in the database, use standardized naming.

FILTERING: Ignore technical catalogue numbers (BWV, RV, Op.), unless they are part of a collection title worth keeping.

RESPONSE FORMAT: Return the response STRICTLY as a valid JSON array object. No introductory text, no labels, no closing remarks.

The format must be exactly this:
[{"year": "Year", "location": "Place", "text": "Short, concise description in English ending with a period."}]

Text to analyze:
${text}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0]) {
            throw new Error("The API did not return valid data. Check your API key.");
        }

        let aiTextResponse = data.candidates[0].content.parts[0].text.trim();
        aiTextResponse = aiTextResponse.replace(/^```json/i, "").replace(/```$/, "").trim();
        
        const parsedEvents = JSON.parse(aiTextResponse);
        displayExtractedRows(parsedEvents);

    } catch (error) {
        console.error(error);
        alert("An error occurred while communicating with the AI or processing the data. Check your key and try again.");
    } finally {
        btn.textContent = "✨ Rearrange and analyze with AI";
        btn.disabled = false;
    }
}

function displayExtractedRows(events) {
    const resultsContainer = document.getElementById('extraction-results-container');
    const listEl = document.getElementById('extraction-rows-list');
    listEl.innerHTML = '';

    if(!Array.isArray(events) || events.length === 0) {
        listEl.innerHTML = '<p style="font-style:italic; color:var(--text-muted); font-size:13px;">The AI was unable to extract any events.</p>';
        document.getElementById('save-extracted-btn').classList.add('hidden');
    } else {
        events.sort((a,b) => (parseYear(a.year) || 0) - (parseYear(b.year) || 0));

        events.forEach((ev, idx) => {
            const row = document.createElement('div');
            row.className = 'extracted-row';
            row.innerHTML = `
                <input type="checkbox" id="ext-check-${idx}" checked style="width:auto; margin-right:4px;">
                <input type="text" id="ext-year-${idx}" value="${escapeHtml(ev.year || '')}" style="width:60px; text-align:center; font-weight:bold; color:var(--amber);">
                <input type="text" id="ext-loc-${idx}" value="${escapeHtml(ev.location || '')}" placeholder="Location" style="width:100px;">
                <input type="text" id="ext-text-${idx}" value="${escapeHtml(ev.text || '')}" style="flex:1;">
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
                    text: text,
                    vnesUID: window.trenutniUporabnikUID || null,
                    vnesIme: window.trenutniUporabnikIme || '',
                    vnesPriimek: window.trenutniUporabnikPriimek || ''
                });
                importCount++;
            }
        }
    }

    if(importCount > 0) {
        shraniGlasbenikaVFirestore(m);
        updateLocationLists();
        renderTimeline(m);
        document.getElementById('pure-summary').innerHTML = generatePureSummary(m);
        alert(`Successfully rearranged and imported ${importCount} events!`);
        hideEventModal();
    } else {
        alert("No event was selected.");
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