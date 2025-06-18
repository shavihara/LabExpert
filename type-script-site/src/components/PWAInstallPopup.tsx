// components/PWAInstallPopup.tsx
import React, { useState, useEffect } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallPopupProps {
  appName?: string;
  appIcon?: string;
  showAfterDelay?: number; // milliseconds
  hideAfter?: number; // days
}

export const PWAInstallPopup: React.FC<PWAInstallPopupProps> = ({
  appName = 'Our App',
  appIcon = '/icons/icon-192x192.png',
  showAfterDelay = 3000,
  hideAfter = 7
}) => {
  const { isInstallable, isInstalled, installApp, isIOSSafari } = usePWAInstall();
  const [showPopup, setShowPopup] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has dismissed the popup recently
    const dismissedDate = localStorage.getItem('pwa-install-dismissed');
    if (dismissedDate) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedDate)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < hideAfter) {
        setDismissed(true);
        return;
      }
    }

    // Show popup after delay if installable and not installed
    if (isInstallable && !isInstalled && !dismissed) {
      const timer = setTimeout(() => {
        setShowPopup(true);
      }, showAfterDelay);

      return () => clearTimeout(timer);
    }
  }, [isInstallable, isInstalled, dismissed, showAfterDelay, hideAfter]);

  const handleInstall = async () => {
    if (isIOSSafari) {
      // Show iOS Safari instructions
      setShowPopup(false);
      alert('To install this app on your iPhone/iPad:\n1. Tap the Share button\n2. Select "Add to Home Screen"');
      return;
    }

    const success = await installApp();
    if (success) {
      setShowPopup(false);
    }
  };

  const handleDismiss = () => {
    setShowPopup(false);
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!showPopup || isInstalled || dismissed) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      right: '20px',
      backgroundColor: 'white',
      border: '1px solid #ddd',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 1000,
      maxWidth: '400px',
      margin: '0 auto',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }}>
      <img 
        src={appIcon} 
        alt={`${appName} icon`}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '8px'
        }}
      />
      
      <div style={{ flex: 1 }}>
        <h3 style={{ 
          margin: '0 0 4px 0', 
          fontSize: '16px', 
          fontWeight: '600',
          color: '#333'
        }}>
          Install {appName}
        </h3>
        <p style={{ 
          margin: 0, 
          fontSize: '14px', 
          color: '#666',
          lineHeight: '1.4'
        }}>
          {isIOSSafari 
            ? 'Add to your home screen for quick access'
            : 'Get the full app experience with offline access'
          }
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <button
          onClick={handleInstall}
          style={{
            backgroundColor: '#007AFF',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            minWidth: '80px'
          }}
        >
          {isIOSSafari ? 'How to Install' : 'Install'}
        </button>
        
        <button
          onClick={handleDismiss}
          style={{
            backgroundColor: 'transparent',
            color: '#666',
            border: 'none',
            fontSize: '12px',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
};