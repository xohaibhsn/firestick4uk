'use client';
import { useEffect } from 'react';

export default function A1IPTVDownload() {
  useEffect(() => {
    // Auto-trigger download on page load
    const timer = setTimeout(() => {
      window.location.href = '/downloads/A1IPTVPlayer-latest.apk';
    }, 1500); // 1.5 second delay for page to render

    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0533 50%, #0a0a0a 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif',
      color: '#ffffff',
      padding: '20px',
      textAlign: 'center'
    }}>

      {/* Logo/Icon */}
      <div style={{
        width: '120px',
        height: '120px',
        background: 'linear-gradient(135deg, #5B21B6, #7C3AED)',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '60px',
        marginBottom: '32px',
        boxShadow: '0 0 40px rgba(91,33,182,0.5)'
      }}>
        📺
      </div>

      {/* App Name */}
      <h1 style={{
        fontSize: '32px',
        fontWeight: '700',
        marginBottom: '8px',
        background: 'linear-gradient(135deg, #ffffff, #a78bfa)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }}>
        A1 IPTV Player
      </h1>

      <p style={{
        color: '#a78bfa',
        marginBottom: '32px',
        fontSize: '16px'
      }}>
        by Firestick4UK
      </p>

      {/* Download Status */}
      <div style={{
        background: 'rgba(91,33,182,0.2)',
        border: '1px solid rgba(91,33,182,0.4)',
        borderRadius: '16px',
        padding: '24px 40px',
        marginBottom: '32px'
      }}>
        <div style={{
          fontSize: '40px',
          marginBottom: '12px',
          animation: 'bounce 1s infinite'
        }}>
          ⬇️
        </div>
        <p style={{
          fontSize: '20px',
          fontWeight: '600',
          marginBottom: '8px'
        }}>
          Your download is starting...
        </p>
        <p style={{
          color: '#9ca3af',
          fontSize: '14px'
        }}>
          APK file will download automatically
        </p>
      </div>

      {/* Manual fallback button */}
      <a
        href="/downloads/A1IPTVPlayer-latest.apk"
        style={{
          background: '#5B21B6',
          color: '#ffffff',
          padding: '14px 32px',
          borderRadius: '50px',
          textDecoration: 'none',
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: '48px',
          display: 'inline-block'
        }}
      >
        ⬇️ Click here if download doesn&apos;t start
      </a>

      {/* Installation Instructions */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        padding: '24px',
        maxWidth: '400px',
        textAlign: 'left'
      }}>
        <h3 style={{
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: '16px',
          color: '#a78bfa'
        }}>
          📋 Installation Instructions:
        </h3>

        {[
          'Open the downloaded APK file',
          'Tap "Allow" when asked for unknown sources',
          'Tap "Install" to begin installation',
          'Open A1 IPTV Player and enjoy!'
        ].map((step, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            marginBottom: '12px'
          }}>
            <span style={{
              background: '#5B21B6',
              color: '#fff',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: '700',
              flexShrink: 0
            }}>
              {i + 1}
            </span>
            <span style={{
              color: '#d1d5db',
              fontSize: '14px',
              lineHeight: '1.5'
            }}>
              {step}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p style={{
        color: '#4b5563',
        fontSize: '12px',
        marginTop: '32px'
      }}>
        © 2026 Firestick4UK · Latest Version · HTTPS Secured 🔒
      </p>

    </div>
  );
}
