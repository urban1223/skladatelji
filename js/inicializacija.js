window.onload = function() {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        document.getElementById('gemini-api-key').value = savedKey;
    }
    
    // Sproži iskanje in inicializacijo na podlagi naloženih podatkov
    if (typeof searchMusicians === 'function') searchMusicians();
    if (typeof updateLocationLists === 'function') updateLocationLists();
    if (typeof updateLinkDropdowns === 'function') updateLinkDropdowns();

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
            if (document.getElementById('details-view')) document.getElementById('details-view').classList.add('hidden');
            if (document.getElementById('placeholder-text')) document.getElementById('placeholder-text').classList.remove('hidden');
            if (document.getElementById('back-btn')) document.getElementById('back-btn').style.display = 'none';
            if (document.getElementById('sidebar')) document.getElementById('sidebar').classList.remove('mobilno-skrij');
            if (document.getElementById('main-content')) document.getElementById('main-content').classList.remove('mobilno-prikaži');
            currentMusicianId = null;
        } else if (event.state && event.state.view === "details" && event.state.id) {
            if (typeof showMusicianDetails === 'function') showMusicianDetails(event.state.id);
        }
    });

    // NOVO: Iskanje ob pritisku na tipko ENTER znotraj vnosnega polja
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prepreči privzeto obnašanje (npr. osveževanje ali pošiljanje obrazca)
                if (typeof searchMusicians === 'function') searchMusicians(); // Sproži iskanje po imenu ali letu
            }
        });
    }
};