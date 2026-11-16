export function setupOffline(canRestart, setRestarting) {
  const status = document.getElementById('offline-status');
  const notice = document.getElementById('update-notice');
  const button = document.getElementById('restart-update');
  let registration;
  let restarting = false;
  let checking = false;
  let installed = false;
  let updateWorker;
  let reloading = false;

  function reload() {
    if (reloading) return;
    reloading = true;
    location.reload();
  }

  function refresh() {
    if (registration?.waiting && registration.active) updateWorker = registration.waiting;
    notice.hidden = !updateWorker;
    button.disabled = restarting || !canRestart();
  }

  function failed() {
    status.textContent = installed ?
      'Could not check or download an update. Your saved offline version is still available; Phase will try again when you return.' :
      'Offline setup did not finish. Phase will try again when you return. Keep your own JSON backups.';
  }

  function watch(worker) {
    if (!worker) return;
    let activated = worker.state === 'activated';
    const isUpdate = installed || Boolean(registration.active);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'activated') {
        if (isUpdate) updateWorker = worker;
        activated ||= worker.state === 'activated';
        installed = true;
        status.textContent = 'Available offline on this device. Browser storage can still be lost; keep your own JSON backups.';
        refresh();
      } else if (worker.state === 'redundant') {
        if (updateWorker === worker) updateWorker = undefined;
        if (!activated) failed();
        refresh();
      }
    });
  }

  async function check() {
    if (checking) return;
    checking = true;
    try {
      if (registration && !registration.active && !registration.waiting && !registration.installing) {
        registration = undefined;
      }
      if (!registration) {
        registration = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), {
          scope: new URL('../', import.meta.url).href,
          updateViaCache: 'none'
        });
        registration.addEventListener('updatefound', () => watch(registration.installing));
        watch(registration.installing);
        installed = Boolean(registration.active || registration.waiting);
      } else {
        await registration.update();
      }
      if (installed) {
        status.textContent = 'Available offline on this device. Browser storage can still be lost; keep your own JSON backups.';
      }
      refresh();
    } catch {
      failed();
    } finally {
      checking = false;
    }
  }

  if (!navigator.serviceWorker) {
    status.textContent = 'Offline installation is unavailable in this browser. You can still use Phase while this page is open.';
    return refresh;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (restarting) reload();
    else refresh();
  });
  // Only a freshly loaded, current-version window requests cleanup. Older windows
  // remain in memory; no update reloads them or discards their drafts.
  navigator.serviceWorker.controller?.postMessage('clean-old-shells');
  button.addEventListener('click', () => {
    const worker = registration?.waiting ?? updateWorker;
    if (!worker || restarting || !canRestart()) return;
    restarting = true;
    setRestarting(true);
    refresh();
    status.textContent = 'Restarting to apply the update...';
    if (worker.state === 'activated') {
      reload();
      return;
    }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') reload();
      if (worker.state === 'redundant') {
        restarting = false;
        setRestarting(false);
        failed();
        refresh();
      }
    });
    worker.postMessage('activate-update');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('pageshow', () => check());
  check();
  return refresh;
}
