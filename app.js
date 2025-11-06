// app.js - Recipe Keeper (plain script, no modules)
// Drop this file into your site and make sure index.html includes it AFTER the DOM elements.
// It expects these element IDs to exist in index.html:
// - lock (wrapper div for the lock UI)
// - lockInput (password input shown when unlocking)
// - unlockBtn (button to attempt unlock)
// - setPassBtn (button to open settings dialog)
// - settingsDlg (dialog or div for settings; optional fallback uses settings box ids below)
// - newPass (input inside settings to set a password)
// - savePassBtn (save button inside settings)
// - closeSettings (button to close settings)
// If you have a function loadApp() defined (e.g. in drive.js) it will be called after unlocking.

(function () {
  // KEY used in localStorage
  const STORAGE_KEY = "recipeKeeperPassword";

  // Utility: safe query
  function $(id) {
    return document.getElementById(id);
  }

  // Read saved password (string or null)
  function getSavedPassword() {
    return localStorage.getItem(STORAGE_KEY);
  }

  // Save password (can be empty string to disable password)
  function savePasswordToStorage(pw) {
    try {
      localStorage.setItem(STORAGE_KEY, pw === null ? "" : String(pw));
      return true;
    } catch (e) {
      console.error("Failed to save password", e);
      return false;
    }
  }

  // UI helpers
  function showLock() {
    const lock = $("lock");
    if (lock) lock.classList.remove("hidden");
  }
  function hideLock() {
    const lock = $("lock");
    if (lock) lock.classList.add("hidden");
  }
  function showSettings() {
    // If a dialog element exists, try that first
    const dlg = $("settingsDlg");
    if (dlg) {
      dlg.style.display = "block";
      // focus input if present
      const np = $("newPass");
      if (np) np.focus();
      return;
    }
    // fallback: try to find settings modal by id used in some versions
    const fallback = $("setPassDialog");
    if (fallback) fallback.style.display = "block";
  }
  function hideSettings() {
    const dlg = $("settingsDlg");
    if (dlg) dlg.style.display = "none";
    const fallback = $("setPassDialog");
    if (fallback) fallback.style.display = "none";
  }

  // Called after successful unlock to start the app
  function startApp() {
    // Hide the lock UI
    hideLock();

    // If drive/app loader exists, call it
    if (typeof window.loadApp === "function") {
      try {
        window.loadApp();
      } catch (e) {
        console.error("loadApp() threw:", e);
      }
    } else {
      // No loadApp found - you may want to implement showing the main UI here.
      console.log("Unlocked — no loadApp() found. Implement main UI startup.");
    }
  }

  // Attempt to unlock using the password typed in lockInput
  function attemptUnlock() {
    const input = $("lockInput");
    const typed = input ? input.value : "";

    const saved = getSavedPassword();

    // If no password was set (empty string or null), allow immediate unlock
    if (!saved || saved === "") {
      // no password configured — allow open
      startApp();
      return;
    }

    // Compare typed vs saved (exact match)
    if (typed === saved) {
      startApp();
      return;
    }

    // Wrong password => show message
    // Prefer an inline message area if present
    const msg = $("lockMsg");
    if (msg) {
      msg.textContent = "Incorrect password. Try again.";
      msg.style.color = "crimson";
    } else {
      alert("Incorrect password. Try again.");
    }
  }

  // Save password from settings input
  function saveSettingsPassword() {
    const np = $("newPass");
    if (!np) {
      alert("No password input found.");
      return;
    }
    const pw = np.value || ""; // empty to disable
    const ok = savePasswordToStorage(pw);
    if (!ok) {
      alert("Unable to save password (storage error).");
      return;
    }

    // Show confirmation
    const settingsMsg = $("settingsMsg");
    if (settingsMsg) {
      settingsMsg.textContent = pw ? "Password saved (this device only)." : "Password removed — no password required on this device.";
      settingsMsg.style.color = "#666";
    } else {
      alert(pw ? "Password saved (on this device)." : "Password removed — site will open without password on this device.");
    }

    hideSettings();
  }

  // Wire up listeners (safe: only attaches if element exists)
  function attachListeners() {
    const unlockBtn = $("unlockBtn");
    if (unlockBtn) {
      unlockBtn.addEventListener("click", function (e) {
        e.preventDefault();
        attemptUnlock();
      });
    }

    const lockInput = $("lockInput");
    if (lockInput) {
      // allow Enter to submit
      lockInput.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          attemptUnlock();
        }
      });
    }

    const setPassBtn = $("setPassBtn");
    if (setPassBtn) {
      setPassBtn.addEventListener("click", function (e) {
        e.preventDefault();
        showSettings();
      });
    }

    const savePassBtn = $("savePassBtn");
    if (savePassBtn) {
      savePassBtn.addEventListener("click", function (e) {
        e.preventDefault();
        saveSettingsPassword();
      });
    }

    const closeSettings = $("closeSettings");
    if (closeSettings) {
      closeSettings.addEventListener("click", function (e) {
        e.preventDefault();
        hideSettings();
      });
    }

    // If settings dialog is used and user presses Enter inside it, save
    const newPass = $("newPass");
    if (newPass) {
      newPass.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          saveSettingsPassword();
        }
      });
    }
  }

  // On load: decide whether to show lock (if password present or not)
  function initLockUI() {
    // Always show lock UI initially; the user can set password to empty to disable
    showLock();

    // Pre-fill lock input placeholder based on saved password
    const saved = getSavedPassword();
    const input = $("lockInput");
    if (input) {
      input.value = "";
      if (!saved || saved === "") {
        // no password set -> indicate to user they can unlock directly
        input.placeholder = "No password set — click Unlock to open";
      } else {
        input.placeholder = "Enter password";
      }
    }

    // Pre-fill settings newPass input with existing password (blank for security is fine)
    const np = $("newPass");
    if (np) {
      np.value = saved || "";
    }

    // If there is no password set — you may optionally auto-unlock (but we keep the button UX)
    // We will NOT auto-unlock to avoid surprising behavior. User can press Unlock.
  }

  // DOM ready
  function boot() {
    attachListeners();
    initLockUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Expose minor helpers for debugging (optional)
  window.__recipeKeeper = {
    getSavedPassword,
    savePasswordToStorage,
    attemptUnlock,
  };
})();
