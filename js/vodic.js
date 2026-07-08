/* ==========================================================================
   GUIDED ONBOARDING TOUR — spotlight + bubble walkthrough shown on first login.
   Self-contained, no external libraries. Runs once per user account (a flag is
   stored in localStorage). Can be re-launched manually via zaženiUvodniVodic().
   ========================================================================== */

// Steps run top-to-bottom through the sidebar, matching the on-screen layout so
// the spotlight moves in a natural order. A null selector = centered welcome/finish
// card. Missing elements are skipped gracefully.
const TOUR_STEPS = [
    {
        selector: null,
        title: "👋 Welcome to Composer Timelines",
        text: "Here's a quick tour of the main features — it only takes a few seconds. You can skip it anytime."
    },
    {
        selector: "#search-input",
        title: "🔎 Search",
        text: "Find a composer by name, or type a year (e.g. 1545) to see everyone who was active that year."
    },
    {
        selector: "#location-filter",
        title: "📍 Filter by place",
        text: "Pick a location to see every event that happened there — across all composers at once."
    },
    {
        selector: "#btn-add-musician",
        title: "➕ Add a person",
        text: "Contribute a new composer/musician/ruler to the shared archive. You can also import one from a file. You can only edit or delete the entries you added yourself."
    },
    {
        selector: "#btn-add-global-event",
        title: "⭐ Historical events",
        text: "Add independent events like plagues or wars that span a period (and optionally a place). Any composer event that falls inside gets a ⭐ you can click to read about it."
    },
    {
        selector: "#musician-list",
        title: "🎼 The archive",
        text: "Every composer/musician/ruler appears here. Click a name to open their timeline and travel map — including who they worked with."
    },
    {
        selector: "#sidebar-avatar-container",
        title: "⚙️ Your profile",
        text: "Edit your details, add your institution, or log out here."
    },
    {
        selector: null,
        title: "✅ You're all set!",
        text: "Click any composer on the left to start exploring. Enjoy the archive!"
    }
];

let tourStepIndex = 0;
let tourOnDone = null;
let tourResizeHandler = null;

function zgradiTourDOM() {
    if (document.getElementById('tour-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'tour-overlay';

    const highlight = document.createElement('div');
    highlight.id = 'tour-highlight';

    const bubble = document.createElement('div');
    bubble.id = 'tour-bubble';
    bubble.innerHTML = `
        <h3 id="tour-title"></h3>
        <p id="tour-text"></p>
        <div id="tour-controls">
            <button type="button" id="tour-skip" class="tour-link">Skip tour</button>
            <div id="tour-right">
                <span id="tour-counter"></span>
                <button type="button" id="tour-back" class="secondary btn-sm">Back</button>
                <button type="button" id="tour-next" class="btn-sm">Next</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(highlight);
    document.body.appendChild(bubble);

    document.getElementById('tour-skip').onclick = koncajVodic;
    document.getElementById('tour-back').onclick = () => premakniTourKorak(-1);
    document.getElementById('tour-next').onclick = () => premakniTourKorak(1);

    tourResizeHandler = () => prikaziTourKorak(tourStepIndex);
    window.addEventListener('resize', tourResizeHandler);
}

function postaviBubble(rect) {
    const bubble = document.getElementById('tour-bubble');
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const margin = 12;

    if (!rect) {
        // Centered card (welcome / finish)
        bubble.style.top = Math.max(margin, (window.innerHeight - bh) / 2) + 'px';
        bubble.style.left = Math.max(margin, (window.innerWidth - bw) / 2) + 'px';
        return;
    }

    let top;
    if (rect.bottom + margin + bh < window.innerHeight) {
        top = rect.bottom + margin;                 // below the element
    } else if (rect.top - margin - bh > 0) {
        top = rect.top - margin - bh;               // above it
    } else {
        top = Math.max(margin, (window.innerHeight - bh) / 2);
    }

    let left = rect.left + rect.width / 2 - bw / 2; // horizontally centered on target
    left = Math.max(margin, Math.min(left, window.innerWidth - bw - margin));

    bubble.style.top = top + 'px';
    bubble.style.left = left + 'px';
}

function prikaziTourKorak(index) {
    const step = TOUR_STEPS[index];
    if (!step) return;

    const highlight = document.getElementById('tour-highlight');
    const titleEl = document.getElementById('tour-title');
    const textEl = document.getElementById('tour-text');
    const counterEl = document.getElementById('tour-counter');
    const backBtn = document.getElementById('tour-back');
    const nextBtn = document.getElementById('tour-next');

    titleEl.textContent = step.title;
    textEl.textContent = step.text;
    counterEl.textContent = `${index + 1} / ${TOUR_STEPS.length}`;
    backBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = index === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';

    const target = step.selector ? document.querySelector(step.selector) : null;

    if (target) {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = target.getBoundingClientRect();
        const pad = 6;
        highlight.style.display = 'block';
        highlight.style.top = (rect.top - pad) + 'px';
        highlight.style.left = (rect.left - pad) + 'px';
        highlight.style.width = (rect.width + pad * 2) + 'px';
        highlight.style.height = (rect.height + pad * 2) + 'px';
        postaviBubble(rect);
    } else {
        highlight.style.display = 'none';
        postaviBubble(null);
    }
}

function premakniTourKorak(delta) {
    let next = tourStepIndex + delta;

    // Skip any step whose target element is missing (e.g. a hidden button)
    while (next > 0 && next < TOUR_STEPS.length - 1) {
        const s = TOUR_STEPS[next];
        if (!s.selector || document.querySelector(s.selector)) break;
        next += delta;
    }

    if (next >= TOUR_STEPS.length) { koncajVodic(); return; }
    if (next < 0) next = 0;

    tourStepIndex = next;
    prikaziTourKorak(tourStepIndex);
}

function koncajVodic() {
    const overlay = document.getElementById('tour-overlay');
    const highlight = document.getElementById('tour-highlight');
    const bubble = document.getElementById('tour-bubble');
    if (overlay) overlay.remove();
    if (highlight) highlight.remove();
    if (bubble) bubble.remove();
    if (tourResizeHandler) {
        window.removeEventListener('resize', tourResizeHandler);
        tourResizeHandler = null;
    }
    if (typeof tourOnDone === 'function') {
        const cb = tourOnDone;
        tourOnDone = null;
        cb();
    }
}

// Public: start the tour immediately (used for a manual "?" replay or testing).
window.zaženiUvodniVodic = function(onDone) {
    if (document.getElementById('tour-overlay')) return; // already running
    tourOnDone = onDone || null;
    tourStepIndex = 0;
    zgradiTourDOM();
    prikaziTourKorak(0);
};

// Public: run the tour only if this user account hasn't seen it yet.
// Called after a successful, verified login from firebase-auth.js.
window.preveriInZaženiVodic = function(uid) {
    if (!uid) return;
    const key = 'vodic_koncan_' + uid;
    if (localStorage.getItem(key)) return;
    window.zaženiUvodniVodic(() => localStorage.setItem(key, '1'));
};
