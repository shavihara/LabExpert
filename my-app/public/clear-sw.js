// Service Worker Cache Clear Script
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (let registration of registrations) {
      registration.unregister();
      console.log('ServiceWorker unregistered');
    }
  });
  
  // Clear all caches
  caches.keys().then(function(cacheNames) {
    cacheNames.forEach(function(cacheName) {
      caches.delete(cacheName);
      console.log('Cache deleted:', cacheName);
    });
  });
  
  // Force reload
  window.location.reload(true);
}