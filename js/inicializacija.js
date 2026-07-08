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

    function showHomeScreen() {
        if (document.getElementById('details-view')) document.getElementById('details-view').classList.add('hidden');
        if (document.getElementById('add-musician-form')) document.getElementById('add-musician-form').classList.add('hidden');
        if (document.getElementById('add-global-event-form')) document.getElementById('add-global-event-form').classList.add('hidden');
        if (document.getElementById('placeholder-text')) document.getElementById('placeholder-text').classList.remove('hidden');
        if (document.getElementById('back-btn')) document.getElementById('back-btn').style.display = 'none';
        if (document.getElementById('sidebar')) document.getElementById('sidebar').classList.remove('mobilno-skrij');
        if (document.getElementById('main-content')) document.getElementById('main-content').classList.remove('mobilno-prikaži');
        currentMusicianId = null;
    }

    // EXIT GUARD: mark the very first history entry as "home" and add one buffer
    // entry ("home-guard") on top of it. Pressing system/browser Back always has
    // at least this one extra step to consume before it would truly leave the
    // app, which gives us a chance to ask for confirmation instead of the user
    // being kicked out unexpectedly.
    history.replaceState({ view: 'home' }, '');
    history.pushState({ view: 'home-guard' }, '');

    // CATCH SYSTEM "BACK" BUTTON — restore whichever view (musician/year/location) was
    // previously open, or fall back to the empty placeholder when the stack is exhausted.
    // The `false` argument tells each show-function not to push a new history entry,
    // otherwise navigating back would itself add a forward entry and break the stack.
    window.addEventListener('popstate', function(event) {
        const state = event.state;

        if (state && state.view === "musician" && state.id) {
            if (typeof showMusicianDetails === 'function') showMusicianDetails(state.id, false);
        } else if (state && state.view === "year" && state.year) {
            if (typeof filterByYear === 'function') filterByYear(state.year, false);
        } else if (state && state.view === "location" && state.location) {
            if (typeof filterByLocation === 'function') filterByLocation(state.location, false);
        } else if (state && state.view === "home-guard") {
            // Still inside our safety buffer — just show the empty screen, no prompt yet.
            showHomeScreen();
        } else if (state && state.view === "home") {
            // The buffer was just consumed: one more Back would really exit the app.
            showHomeScreen();
            const wantsToLeave = confirm("Do you want to leave the app?");
            if (wantsToLeave) {
                history.back();
            } else {
                history.pushState({ view: 'home-guard' }, ''); // re-arm the buffer
            }
        } else {
            // Fallback for any unrecognized/legacy state
            showHomeScreen();
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