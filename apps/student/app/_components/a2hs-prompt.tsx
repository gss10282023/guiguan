'use client';

import { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone() {
  type NavigatorWithStandalone = Navigator & { standalone?: boolean };

  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

function isIos() {
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

export default function A2HSPrompt({ label }: { label: string }) {
  const [installed, setInstalled] = useState(false);
  const [bipEvent, setBipEvent] = useState<BeforeInstallPromptEvent | null>(null);

  const showIosGuide = useMemo(() => !installed && !bipEvent && isIos(), [installed, bipEvent]);

  useEffect(() => {
    setInstalled(isStandalone());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setBipEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setBipEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (installed) return null;
  if (!bipEvent && !showIosGuide) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 50,
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        background: '#ffffff',
        padding: 12,
        boxShadow: '0 6px 24px rgba(0,0,0,0.08)',
        maxWidth: 960,
        margin: '0 auto',
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
        <div className="stack" style={{ gap: 4 }}>
          <strong style={{ fontSize: 14 }}>添加到主屏幕</strong>
          {bipEvent ? (
            <span className="muted" style={{ fontSize: 12 }}>
              将 {label} 安装到主屏幕，像 App 一样使用。
            </span>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              iOS Safari：点击“分享”按钮，然后选择“添加到主屏幕”。
            </span>
          )}
        </div>

        <div className="row" style={{ gap: 8 }}>
          {bipEvent ? (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await bipEvent.prompt();
                await bipEvent.userChoice;
                setBipEvent(null);
              }}
            >
              添加
            </button>
          ) : null}
          <button className="btnSecondary" type="button" onClick={() => setInstalled(true)}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
