import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    sendEmailVerification,
    GoogleAuthProvider,
    signInWithPopup,
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC-JMU5q6kNV3f9bobpFMf3XFEF4chYRGg",
    authDomain: "skladatelji.firebaseapp.com",
    projectId: "skladatelji",
    storageBucket: "skladatelji.firebasestorage.app",
    messagingSenderId: "739953446061",
    appId: "1:739953446061:web:8ce3494b49870ca1f60a24",
    measurementId: "G-CE63D9WZRW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let authMode = 'login';
let trenutniUporabnikUID = null;
let trenutniUporabnikEmail = null;

// Izpostavimo Firestore primitive globalno, da jih lahko uporabljajo tudi
// klasični (ne-module) skripti, kot je skladatelji.js
window.db = db;
window.fsDoc = doc;
window.fsSetDoc = setDoc;
window.fsGetDoc = getDoc;
window.fsDeleteDoc = deleteDoc;
window.fsCollection = collection;
window.fsGetDocs = getDocs;

function izpeljiImePriimek(user) {
    let ime = "";
    let priimek = "";

    if (user.displayName) {
        const deli = user.displayName.trim().split(/\s+/);
        ime = deli[0] || "";
        priimek = deli.slice(1).join(" ") || "";
    } else if (user.email) {
        const delPredAfno = user.email.split('@')[0];

        if (delPredAfno.includes('.')) {
            const deliImena = delPredAfno.split('.');
            ime = deliImena[0] || "";
            priimek = deliImena.slice(1).join(' ') || "";
        } else if (delPredAfno.includes('-')) {
            const deliImena = delPredAfno.split('-');
            ime = deliImena[0] || "";
            priimek = deliImena.slice(1).join(' ') || "";
        } else {
            ime = delPredAfno;
            priimek = "";
        }
    }
    return { ime, priimek };
}

window.toggleAuthMode = function() {
    const titleEl = document.getElementById('auth-title');
    const descEl = document.getElementById('auth-desc');
    const btnEl = document.getElementById('auth-submit-btn');
    const errorEl = document.getElementById('auth-error');
    const toggleBtn = document.getElementById('auth-toggle-btn');

    if (errorEl) errorEl.style.display = 'none';

    if (authMode === 'login') {
        authMode = 'register';
        if (titleEl) titleEl.textContent = "Create New Account";
        if (descEl) descEl.textContent = "Sign up to access the archive.";
        if (btnEl) btnEl.textContent = "Sign Up";
        if (toggleBtn) toggleBtn.textContent = "Already have an account – Log In";
    } else {
        authMode = 'login';
        if (titleEl) titleEl.textContent = "Archive of Baroque Composers";
        if (descEl) descEl.textContent = "Log in and explore the archive.";
        if (btnEl) btnEl.textContent = "Log In";
        if (toggleBtn) toggleBtn.textContent = "Create New Account";
    }
};

window.handleAuth = async function(event) {
    event.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.style.display = 'none';

    try {
        if (authMode === 'login') {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            // The verification email is the whole point of registration, so if it
            // can't be sent we must not pretend the sign-up succeeded. We surface
            // the error and still sign out (the unverified account can't be used
            // until it's confirmed anyway).
            try {
                await sendEmailVerification(result.user);
            } catch (mailErr) {
                console.error("Error sending verification email:", mailErr);
                await signOut(auth);
                if (errorEl) {
                    errorEl.style.display = 'block';
                    errorEl.textContent = "Account created, but the confirmation email could not be sent. Please try 'Log In' and use the Resend button, or contact support.";
                }
                return;
            }
            await signOut(auth);
            document.getElementById('auth-form').reset();
            window.toggleAuthMode();
            alert("Your account was created!\n\nWe've sent a confirmation link to " + email + ". You MUST click that link before you can log in.\n\n(If you don't see it within a few minutes, check your spam folder.)");
        }
    } catch (error) {
        if (errorEl) {
            errorEl.style.display = 'block';
            if (authMode === 'login' && (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found')) {
                // Modern Firebase returns invalid-credential for both a wrong password
                // AND a non-existent account (to prevent email enumeration), so we
                // point the user toward registration as the likely fix.
                errorEl.textContent = "Login failed. If you don't have an account yet, tap \"Create New Account\" below to register. Otherwise, check your email and password.";
            }
            else if (error.code === 'auth/invalid-credential') errorEl.textContent = "Incorrect password or email address.";
            else if (error.code === 'auth/email-already-in-use') errorEl.textContent = "This email address is already registered. Please log in instead.";
            else if (error.code === 'auth/weak-password') errorEl.textContent = "Password must be at least 6 characters.";
            else if (error.code === 'auth/invalid-email') errorEl.textContent = "Please enter a valid email address.";
            else errorEl.textContent = "Error: " + error.message;
        }
    }
};

window.handleGoogleAuth = async function() {
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (error) {
        console.error("Google sign-in error:", error);
    }
};

window.handleLogout = async function() {
    try {
        window.toggleSettingsModal(false);
        await signOut(auth);
    } catch (error) {
        console.error("Logout error:", error);
    }
};

window.toggleSettingsModal = function(show) {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.style.display = show ? 'flex' : 'none';
        if (show) window.loadUserProfile();
    }
};

window.saveUserProfile = async function(event) {
    event.preventDefault();
    if (!trenutniUporabnikUID) return;

    const profilniPodatki = {
        email: trenutniUporabnikEmail,
        slika: document.getElementById('prof-img').value,
        ime: document.getElementById('prof-ime').value,
        priimek: document.getElementById('prof-priimek').value,
        instrument: document.getElementById('prof-instrument').value,
        sola: document.getElementById('prof-sola').value,
        podrocje: document.getElementById('prof-podrocje').value,
        web: document.getElementById('prof-web').value
    };

    try {
        await setDoc(doc(db, 'profiles', trenutniUporabnikUID), profilniPodatki);
        window.updateSidebarProfile(profilniPodatki);
        // Posodobimo tudi globalno ime/priimek, da nove dogodke pravilno označimo
        window.trenutniUporabnikIme = profilniPodatki.ime;
        window.trenutniUporabnikPriimek = profilniPodatki.priimek;
        window.toggleSettingsModal(false);
        alert("Profile successfully updated!");
    } catch (error) {
        console.error("Error saving profile:", error);
        alert("Error saving profile.");
    }
};

window.loadUserProfile = async function() {
    if (!trenutniUporabnikUID) return;

    try {
        const snap = await getDoc(doc(db, 'profiles', trenutniUporabnikUID));
        if (snap.exists()) {
            const p = snap.data();
            if (document.getElementById('prof-img')) document.getElementById('prof-img').value = p.slika || '';
            if (document.getElementById('prof-ime')) document.getElementById('prof-ime').value = p.ime || '';
            if (document.getElementById('prof-priimek')) document.getElementById('prof-priimek').value = p.priimek || '';
            if (document.getElementById('prof-instrument')) document.getElementById('prof-instrument').value = p.instrument || '';
            if (document.getElementById('prof-sola')) document.getElementById('prof-sola').value = p.sola || '';
            if (document.getElementById('prof-podrocje')) document.getElementById('prof-podrocje').value = p.podrocje || '';
            if (document.getElementById('prof-web')) document.getElementById('prof-web').value = p.web || '';
        }
    } catch (error) {
        console.error("Error loading profile:", error);
    }
};

window.updateSidebarProfile = function(podatki) {
    const avatarEl = document.getElementById('sidebar-user-avatar');
    if (avatarEl && podatki && podatki.slika) {
        avatarEl.src = podatki.slika;
    } else if (avatarEl) {
        avatarEl.src = "https://www.w3schools.com/howto/img_avatar.png";
    }
};

// NOVO: za prihodnji javni seznam vseh profilov (npr. stran "Člani")
window.nalozisVseProfile = async function() {
    const seznam = [];
    try {
        const snapshot = await getDocs(collection(db, 'profiles'));
        snapshot.forEach(d => seznam.push({ uid: d.id, ...d.data() }));
    } catch (error) {
        console.error("Error loading profile list:", error);
    }
    return seznam;
};

function prikaziZaslonPotrditve(user) {
    const staro = document.getElementById('verify-email-screen');
    if (staro) staro.remove();

    const overlay = document.createElement('div');
    overlay.id = 'verify-email-screen';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:linear-gradient(135deg,#0f172a 0%,#1e1b2e 100%); display:flex; justify-content:center; align-items:center; z-index:999999; font-family:sans-serif; padding:20px; box-sizing:border-box;';

    overlay.innerHTML = `
        <div style="background:#1e293b; padding:36px 32px; border-radius:16px; box-shadow:0 20px 50px rgba(0,0,0,0.5); width:100%; max-width:380px; text-align:center; border:1px solid #334155;">
            <div style="width:56px; height:56px; background:var(--amber,#f59e0b); border-radius:14px; display:flex; align-items:center; justify-content:center; margin:0 auto 18px; font-size:28px;">✉️</div>
            <h2 style="color:#fff; margin:0 0 10px 0; font-size:20px; font-weight:700;">Verify your email</h2>
            <p style="color:#94a3b8; font-size:14px; margin:0 0 24px 0; line-height:1.5;">We've sent a confirmation link to <strong style="color:#fff;">${user.email}</strong>. Click it, then press the button below.</p>
            <button id="verify-check-btn" style="width:100%; padding:14px; background:var(--amber,#f59e0b); border:none; border-radius:10px; color:#000; font-weight:700; font-size:15px; cursor:pointer; margin-bottom:10px;">I've verified, continue</button>
            <button id="verify-resend-btn" style="width:100%; padding:13px; background:transparent; border:1px solid #334155; border-radius:10px; color:#cbd5e1; font-weight:600; font-size:14px; cursor:pointer; margin-bottom:10px;">Resend</button>
            <button id="verify-logout-btn" style="width:100%; padding:10px; background:transparent; border:none; color:#64748b; font-size:13px; cursor:pointer; text-decoration:underline;">Log out</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('verify-check-btn').onclick = async function() {
        try {
            await user.reload();
            if (user.emailVerified) {
                overlay.remove();
                window.location.reload();
            } else {
                alert("Email not verified yet. Check your inbox (including spam).");
            }
        } catch (err) {
            console.error(err);
            alert("Error checking verification status.");
        }
    };

    document.getElementById('verify-resend-btn').onclick = async function() {
        try {
            await sendEmailVerification(user);
            alert("Confirmation email has been resent.");
        } catch (err) {
            console.error(err);
            alert("Error sending email. Please try again later.");
        }
    };

    document.getElementById('verify-logout-btn').onclick = async function() {
        overlay.remove();
        await signOut(auth);
    };
}

onAuthStateChanged(auth, async (user) => {
    const authScreen = document.getElementById('auth-screen');
    const sidebarProfileZone = document.querySelector('.sidebar-profile-zone');
    const appLoading = document.getElementById('app-loading');

    // Firebase je ugotovil, ali obstaja shranjena seja - odstranimo nalagalni zaslon
    // in šele zdaj (ne prej) po potrebi pokažemo prijavni obrazec, da se ta ne
    // zabliska prijavljenim uporabnikom ob vsakem osvežitvi strani.
    if (appLoading) appLoading.remove();

    if (user) {
        // user.emailVerified can be a stale snapshot from the cached session -
        // force a refresh from Firebase so a just-created (or just-verified)
        // account is never judged on out-of-date information.
        try {
            await user.reload();
        } catch (reloadErr) {
            console.error("Error refreshing user status:", reloadErr);
        }

        if (!user.emailVerified) {
            if (authScreen) authScreen.style.setProperty('display', 'none', 'important');
            if (sidebarProfileZone) sidebarProfileZone.style.setProperty('display', 'none', 'important');
            prikaziZaslonPotrditve(user);
            return;
        }
        const staroPreverjanje = document.getElementById('verify-email-screen');
        if (staroPreverjanje) staroPreverjanje.remove();

        trenutniUporabnikUID = user.uid;
        trenutniUporabnikEmail = user.email;
        window.trenutniUporabnikUID = user.uid;
        window.trenutniUporabnikEmail = user.email;

        if (authScreen) authScreen.style.setProperty('display', 'none', 'important');
        if (sidebarProfileZone) sidebarProfileZone.style.setProperty('display', 'flex', 'important');

        try {
            const ref = doc(db, 'profiles', user.uid);
            const snap = await getDoc(ref);

            if (!snap.exists()) {
                // Migracija: če obstaja star localStorage profil (izpred Firestore), ga uporabimo
                let polja;
                const staroLokalno = localStorage.getItem('profil_' + user.email);
                if (staroLokalno) {
                    polja = JSON.parse(staroLokalno);
                } else {
                    const { ime, priimek } = izpeljiImePriimek(user);
                    polja = { ime, priimek, instrument: "", sola: "", podrocje: "", web: "", slika: user.photoURL || "" };
                }
                polja.email = user.email;
                await setDoc(ref, polja);
                window.updateSidebarProfile(polja);
                window.trenutniUporabnikIme = polja.ime;
                window.trenutniUporabnikPriimek = polja.priimek;
            } else {
                let obstojeciProfil = snap.data();

                if (!obstojeciProfil.ime && !obstojeciProfil.priimek) {
                    const { ime, priimek } = izpeljiImePriimek(user);
                    obstojeciProfil.ime = ime;
                    obstojeciProfil.priimek = priimek;
                    await setDoc(ref, obstojeciProfil);
                }

                window.updateSidebarProfile(obstojeciProfil);
                window.trenutniUporabnikIme = obstojeciProfil.ime;
                window.trenutniUporabnikPriimek = obstojeciProfil.priimek;
            }
        } catch (error) {
            console.error("Error loading profile from Firestore:", error);
        }

        // Naložimo skupno bazo skladateljev/dogodkov iz Firestore (funkcija je v skladatelji.js)
        if (typeof window.naloziGlasbenikeIzFirestore === 'function') {
            window.naloziGlasbenikeIzFirestore();
        }
        if (typeof window.naloziGlobalneDogodkeIzFirestore === 'function') {
            window.naloziGlobalneDogodkeIzFirestore();
        }

        // Ob prvi prijavi tega računa zaženemo voden uvodni pregled (enkrat na račun).
        // Kratek zamik, da se stranska vrstica in profil izrišejo, preden usmerimo oblačke.
        setTimeout(() => {
            if (typeof window.preveriInZaženiVodic === 'function') {
                window.preveriInZaženiVodic(user.uid);
            }
        }, 900);
    } else {
        trenutniUporabnikUID = null;
        trenutniUporabnikEmail = null;
        window.trenutniUporabnikUID = null;
        window.trenutniUporabnikEmail = null;
        window.trenutniUporabnikIme = null;
        window.trenutniUporabnikPriimek = null;
        window.toggleSettingsModal(false);

        if (authScreen) authScreen.style.setProperty('display', 'flex', 'important');
        if (sidebarProfileZone) sidebarProfileZone.style.setProperty('display', 'none', 'important');

        if (document.getElementById('prof-img')) document.getElementById('prof-img').value = '';
        if (document.getElementById('prof-ime')) document.getElementById('prof-ime').value = '';
        if (document.getElementById('prof-priimek')) document.getElementById('prof-priimek').value = '';
        if (document.getElementById('prof-instrument')) document.getElementById('prof-instrument').value = '';
        if (document.getElementById('prof-sola')) document.getElementById('prof-sola').value = '';
        if (document.getElementById('prof-podrocje')) document.getElementById('prof-podrocje').value = '';
        if (document.getElementById('prof-web')) document.getElementById('prof-web').value = '';

        window.updateSidebarProfile(null);
    }
});