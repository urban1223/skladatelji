// Registracija PWA Service Workerja
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('PWA Service Worker uspešno registriran!', reg.scope))
            .catch(err => console.log('Registracija Service Workerja spodletela:', err));
    });
}