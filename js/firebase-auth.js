import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Uradna Firebase konfiguracija
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
const googleProvider = new GoogleAuthProvider();

let authMode = 'login';

// Eksplicitno izpostavimo funkcije globalnemu oknu (window), ker uporabljamo type="module"
window.toggleAuthMode = function() {
    const titleEl = document.getElementById('auth-title');
    const descEl = document.getElementById('auth-desc');
    const btnEl = document.getElementById('auth-submit-btn');
    const errorEl = document.getElementById('auth-error');
    
    // Poiščemo p element na dnu obrazca, ki vsebuje povezavo za preklop
    const toggleContainer = document.querySelector('#auth-screen p');

    if (errorEl) errorEl.style.display = 'none';

    if (authMode === 'login') {
        authMode = 'register';
        if (titleEl) titleEl.textContent = "Ustvari nov račun";
        if (descEl) descEl.textContent = "Registrirajte se za dostop do arhiva.";
        if (btnEl) btnEl.textContent = "Registriraj se";
        if (toggleContainer) {
            toggleContainer.innerHTML = `Že imate račun? <a href="javascript:void(0)" onclick="toggleAuthMode()" style="color: var(--amber, #f59e0b); text-decoration: none; font-weight: bold; margin-left: 4px;">Prijava</a>`;
        }
    } else {
        authMode = 'login';
        if (titleEl) titleEl.textContent = "Arhiv baročnih skladateljev";
        if (descEl) descEl.textContent = "Za dostop do aplikacije se prosimo prijavite.";
        if (btnEl) btnEl.textContent = "Prijavi se";
        if (toggleContainer) {
            toggleContainer.innerHTML = `Še nimate računa? <a href="javascript:void(0)" onclick="toggleAuthMode()" style="color: var(--amber, #f59e0b); text-decoration: none; font-weight: bold; margin-left: 4px;">Ustvari račun</a>`;
        }
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
            await createUserWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        console.error("Napaka pri avtentikaciji:", error);
        if (errorEl) {
            errorEl.style.display = 'block';
            if (error.code === 'auth/invalid-credential') {
                errorEl.textContent = "Napačno geslo ali e-poštni naslov.";
            } else if (error.code === 'auth/email-already-in-use') {
                errorEl.textContent = "Ta e-poštni naslov je že registriran.";
            } else if (error.code === 'auth/weak-password') {
                errorEl.textContent = "Geslo mora imeti vsaj 6 znakov.";
            } else {
                errorEl.textContent = "Napaka: " + error.message;
            }
        }
    }
};

window.handleGoogleAuth = async function() {
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.style.display = 'none';
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (error) {
        console.error("Google prijava napaka:", error);
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = "Google prijava ni uspela.";
        }
    }
};

window.handleLogout = async function() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Odjava napaka:", error);
    }
};

// Prisilno skrij zaslon ob uspešni prijavi
onAuthStateChanged(auth, (user) => {
    const authScreen = document.getElementById('auth-screen');
    if (user) {
        console.log("Uporabnik uspešno prijavljen:", user.email);
        if (authScreen) {
            authScreen.style.setProperty('display', 'none', 'important');
        }
    } else {
        console.log("Uporabnik ni prijavljen.");
        if (authScreen) {
            authScreen.style.setProperty('display', 'flex', 'important');
        }
    }
});