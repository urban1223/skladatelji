/* ==========================================================================
   LOCATION CACHE (Firebase "locations" collection)
   --------------------------------------------------------------------------
   Trajna rešitev za težave z geokodiranjem (CORS / 429 blokade zunanjih API-jev).

   Vsako mesto se ZUNANJI API poišče samo ENKRAT za vse uporabnike:
     1. Najprej pogledamo v Firebase zbirko `locations`.
     2. Če mesto obstaja -> takoj vrnemo shranjene { lat, lon, country, ... }.
     3. Če mesta ni -> pokličemo zunanji geokoder (GeoNames).
     4. Uspešen rezultat TAKOJ zapišemo v `locations`, da je naslednjič
        na voljo vsem brez novega API klica.

   Vrne objekt { lat, lon, countryCode, country, state } ali null.
   Uporabljata ga globalni_dogodki.js (država/regija) in zemljevid.js (koordinate).
   ========================================================================== */

const LOCATIONS_COLLECTION = 'locations';

// GeoNames free web service. Account "nova_akademija" mora imeti na
// geonames.org omogočen "free web services" (Manage account -> Enable).
const GEONAMES_USERNAME = 'nova_akademija';

// key (normalizirano ime) -> Promise<resolved|null>. Sočasni klici za isto
// mesto si delijo isto obljubo, tako da tudi znotraj ene seje ne podvajamo
// niti Firebase branj niti zunanjih klicev.
const _locMemPromises = {};

// Zunanje klice serializiramo z zamikom (rate limit), tudi če jih sproži več
// mest hkrati. Firebase cache zadetki gredo mimo te vrste in so takojšnji.
let _geoExternalQueue = Promise.resolve();
function _throttleExternal(task) {
    const run = _geoExternalQueue.then(task, task);
    // Naslednji zunanji klic šele po ~1.1s (ne glede na uspeh/napako tega).
    _geoExternalQueue = run.then(
        () => new Promise(r => setTimeout(r, 1100)),
        () => new Promise(r => setTimeout(r, 1100))
    );
    return run;
}

function _normLocKey(name) {
    return (name || '').trim().toLowerCase();
}

// Firestore doc ID ne sme vsebovati '/', biti '.'/'..' ali oblike __*__.
function _locDocId(key) {
    let id = key.replace(/\//g, '-').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!id || id === '.' || id === '..') id = '_';
    return id;
}

async function _readLocationFromFirebase(key) {
    if (!window.db || !window.fsGetDoc || !window.fsDoc) return null;
    try {
        const snap = await window.fsGetDoc(window.fsDoc(window.db, LOCATIONS_COLLECTION, _locDocId(key)));
        if (snap.exists()) {
            const d = snap.data();
            if (typeof d.lat === 'number' && typeof d.lon === 'number') {
                return {
                    lat: d.lat,
                    lon: d.lon,
                    countryCode: d.countryCode || null,
                    country: d.country || null,
                    state: d.state || null
                };
            }
        }
    } catch (err) {
        console.warn('locations cache: branje ni uspelo za', key, err && (err.code || err.message));
    }
    return null;
}

async function _writeLocationToFirebase(key, name, data) {
    if (!window.db || !window.fsSetDoc || !window.fsDoc) return;
    try {
        await window.fsSetDoc(window.fsDoc(window.db, LOCATIONS_COLLECTION, _locDocId(key)), {
            name: (name || '').trim(),
            key: key,
            lat: data.lat,
            lon: data.lon,
            countryCode: data.countryCode,
            country: data.country,
            state: data.state,
            source: 'geonames',
            updatedAt: Date.now()
        });
    } catch (err) {
        console.warn('locations cache: zapis ni uspel za', key, err && (err.code || err.message));
    }
}

// Zunanji geokoder (GeoNames). Vrne { lat, lon, countryCode, country, state } ali null.
async function _geocodeExternal(name) {
    return _throttleExternal(async () => {
        // orderby=population: ob večpomenskih imenih (Oxford, Cambridge, Avila,
        // England ...) vrne najbolj naseljeno različico, kar je za zgodovinski
        // arhiv skoraj vedno pravilno (evropska mesta > istoimenske vasi drugod).
        // featureClass=A,P: le upravne enote (države/regije) in naseljena mesta,
        // da ne dobimo rek, gora ipd.
        const url = `https://secure.geonames.org/searchJSON?q=${encodeURIComponent(name)}&maxRows=1&orderby=population&featureClass=A&featureClass=P&username=${GEONAMES_USERNAME}`;
        const resp = await fetch(url);
        const json = await resp.json();

        // Ob napaki (napačno uporabniško ime, presežena kvota ...) GeoNames vrne
        // { status: { message, value } } brez polja geonames -> obravnavamo kot "ni najdeno".
        if (json && json.status) {
            console.warn('GeoNames sporočilo:', json.status.message);
        }
        const g = json && json.geonames && json.geonames[0];
        if (!g) return null;

        const lat = parseFloat(g.lat);
        const lon = parseFloat(g.lng);
        if (isNaN(lat) || isNaN(lon)) return null;

        return {
            lat: lat,
            lon: lon,
            countryCode: g.countryCode ? g.countryCode.toLowerCase().trim() : null,
            country: g.countryName ? g.countryName.toLowerCase().trim() : null,
            state: g.adminName1 ? g.adminName1.toLowerCase().trim() : null
        };
    });
}

/**
 * Vrne { lat, lon, countryCode, country, state } za dano mesto (ali null).
 * Vrstni red: Firebase `locations` cache -> zunanji API -> zapis v cache.
 *
 * opts.force === true: preskoči cache (pomnilnik + Firebase), znova poizve pri
 * zunanjem geokoderju in PREPIŠE obstoječi zapis. Za popravek napačnih zapisov.
 */
async function resolveLocationData(name, opts) {
    opts = opts || {};
    const key = _normLocKey(name);
    if (!key) return null;
    if (!opts.force && (key in _locMemPromises)) return _locMemPromises[key];

    const p = (async () => {
        // 1. Firebase cache (preskočen pri force)
        if (!opts.force) {
            const cached = await _readLocationFromFirebase(key);
            if (cached) return cached;
        }

        // 2. Zunanji API (samo če mesta še ni v bazi, ali ob force)
        let resolved = null;
        try {
            resolved = await _geocodeExternal(name);
        } catch (err) {
            console.error('Zunanje geokodiranje ni uspelo za', name, err);
        }

        // 3. Uspešen rezultat takoj shranimo za vse naslednje uporabnike
        if (resolved) {
            await _writeLocationToFirebase(key, name, resolved);
        }
        return resolved;
    })();

    _locMemPromises[key] = p;
    return p;
}

window.resolveLocationData = resolveLocationData;


/* ==========================================================================
   ENKRATNA MIGRACIJA — napolni `locations` z že obstoječimi mesti
   --------------------------------------------------------------------------
   Poženi ENKRAT v konzoli brskalnika, ko si prijavljen (verificiran) uporabnik:

       await seedLocationsCache();

   Zbere vsa mesta iz:
     - dogodkov skladateljev (musicians[].events[].location),
     - lokacij zgodovinskih dogodkov (globalEvents[].locations),
     - vgrajenega seznama koordinat (GEO_COORDINATES),
   in vsako spelje skozi resolveLocationData() -> torej se v `locations` zapiše
   samo tisto, česar tam še ni (obstoječih zapisov ne prepisuje po nepotrebnem).

   Zunanje klice serializira in omeji resolveLocationData (~1,1 s na novo mesto),
   zato pri veliko novih mestih migracija traja nekaj časa — pusti zavihek odprt.
   Funkcija je idempotentna: lahko jo poženeš večkrat brez škode.
   ========================================================================== */
async function seedLocationsCache(options) {
    options = options || {};
    const verbose = options.verbose !== false;

    if (!window.db || !window.fsGetDoc) {
        console.error('seedLocationsCache: Firebase ni na voljo. Ali si prijavljen?');
        return { total: 0, resolved: 0, failed: 0 };
    }

    const names = new Set();

    // 1. Vgrajene koordinate (zemljevid.js) — da dobijo tudi državo iz GeoNames.
    if (typeof GEO_COORDINATES !== 'undefined' && GEO_COORDINATES) {
        Object.keys(GEO_COORDINATES).forEach(n => { if (n && n.trim()) names.add(n.trim()); });
    }
    // 2. Mesta iz vseh dogodkov skladateljev.
    if (typeof musicians !== 'undefined' && Array.isArray(musicians)) {
        musicians.forEach(m => (m.events || []).forEach(ev => {
            if (ev && ev.location && ev.location.trim()) names.add(ev.location.trim());
        }));
    }
    // 3. Lokacije, vpisane v zgodovinske dogodke.
    if (typeof globalEvents !== 'undefined' && Array.isArray(globalEvents)) {
        globalEvents.forEach(g => (g.locations || []).forEach(l => {
            if (l && l.trim()) names.add(l.trim());
        }));
    }

    const list = [...names];
    if (verbose) console.log(`seedLocationsCache: ${list.length} unikatnih mest za obdelavo${options.force ? ' (force — prepis obstoječih)' : ''} …`);

    let resolved = 0, failed = 0;
    for (let i = 0; i < list.length; i++) {
        const name = list[i];
        try {
            const data = await resolveLocationData(name, { force: !!options.force });
            if (data) {
                resolved++;
                if (verbose) console.log(`  [${i + 1}/${list.length}] ✓ ${name} -> ${data.lat.toFixed(3)}, ${data.lon.toFixed(3)} (${data.country || '—'})`);
            } else {
                failed++;
                if (verbose) console.warn(`  [${i + 1}/${list.length}] ✗ ${name} — ni najdeno`);
            }
        } catch (err) {
            failed++;
            console.error(`  [${i + 1}/${list.length}] ✗ ${name} — napaka`, err);
        }
    }

    const summary = { total: list.length, resolved, failed };
    if (verbose) console.log('seedLocationsCache: končano.', summary);
    return summary;
}

window.seedLocationsCache = seedLocationsCache;