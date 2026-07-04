window.onload = function() {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        document.getElementById('gemini-api-key').value = savedKey;
    }
    
    // Trigger search and initialization based on loaded data
    if (typeof searchMusicians === 'function') searchMusicians();
    if (typeof updateLocationLists === 'function') updateLocationLists();
    if (typeof updateLinkDropdowns === 'function') updateLinkDropdowns();

    // Close dropdown menu if the user clicks anywhere else
    window.addEventListener('click', function(e) {
        const dropdown = document.getElementById('profile-dropdown');
        const settingsBtn = document.getElementById('profile-settings-btn');
        
        if (dropdown && dropdown.classList.contains('prikazi-meni')) {
            if (!settingsBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('prikazi-meni');
            }
        }
    });

    // CATCH SYSTEM "BACK" BUTTON
    window.addEventListener('popstate', function(event) {
        if (!event.state || event.state.view !== "details") {
            // Use internal close function without calling history.back() again
            // Therefore, closeDetailsView must not contain history.back() call
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

    // NEW: Search on ENTER key press inside the input field
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent default behavior (e.g. refreshing or form submission)
                if (typeof searchMusicians === 'function') searchMusicians(); // Trigger search by name or year
            }
        });
    }
};