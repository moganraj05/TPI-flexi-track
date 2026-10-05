import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Button } from './ui';
import { isIos, isStandalone } from '../push';

// "Install the app" card. Android/desktop Chrome hand over an install prompt
// (captured early in main.jsx as window.__ftInstallPrompt, since the browser
// fires it once, right at page load); iPhone has no prompt, so it gets the
// Share → Add to Home Screen steps instead. Hidden once already installed.
export function InstallCard() {
  const [promptEvent, setPromptEvent] = useState(() => window.__ftInstallPrompt || null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onAvailable = () => setPromptEvent(window.__ftInstallPrompt || null);
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('ft-install-available', onAvailable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('ft-install-available', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  const ios = isIos();
  if (!promptEvent && !ios) return null;

  const install = async () => {
    promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    window.__ftInstallPrompt = null;
    setPromptEvent(null);
    if (choice?.outcome === 'accepted') setInstalled(true);
  };

  return (
    <section className="m-card m-setting-card">
      <div className="m-setting-row">
        <span className="m-setting-icon m-tint-brand">
          <Icon name="download" size={20} />
        </span>
        <div className="m-setting-text">
          <div className="m-setting-title">Install FlexiTrack</div>
          <div className="m-setting-sub">Open it from your home screen like an app.</div>
        </div>
        {promptEvent ? (
          <Button variant="field" className="m-btn-sm" onClick={install}>
            Install
          </Button>
        ) : null}
      </div>
      {!promptEvent && ios ? (
        <ol className="m-steps">
          <li>
            Tap the <Icon name="share" size={15} /> <b>Share</b> button in Safari.
          </li>
          <li>
            Choose <Icon name="add-square" size={15} /> <b>Add to Home Screen</b>.
          </li>
          <li>Open FlexiTrack from the new icon to turn on notifications.</li>
        </ol>
      ) : null}
    </section>
  );
}
