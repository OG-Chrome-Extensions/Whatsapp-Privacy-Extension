console.log("Background script loaded");

const DEFAULT_SETTINGS = {
  allMessages: true,
  lastPreview: false,
  mediaPreview: true,
  mediaGallery: true,
  textInput: true,
  profilePictures: false,
  groupNames: false,
  noTransition: false,
  unblurOnHover: false,
  blurOnIdle: false,
};

const DEFAULT_BLUR_VALUES = { "blur amount": 8, "idle timeout": 10 };

const DEFAULT_SECURITY = {
  pinEnabled: false,
  pinHash: "",
  pinSalt: "",
  recoveryHash: "",
  recoverySalt: "",
  relockMode: "idle",
  relockTimerMinutes: 5,
  blurAllWhenLocked: false,
};

// Seed defaults only for keys that are missing, so updating the extension
// never wipes the user's settings or PIN.
chrome.runtime.onInstalled.addListener(async () => {
  const sync = await chrome.storage.sync.get([
    "globalToggle",
    "settings",
    "blurValues",
  ]);
  const syncPatch = {};
  if (sync.globalToggle === undefined) syncPatch.globalToggle = true;
  if (!sync.settings) syncPatch.settings = DEFAULT_SETTINGS;
  if (!sync.blurValues) syncPatch.blurValues = DEFAULT_BLUR_VALUES;
  if (Object.keys(syncPatch).length) chrome.storage.sync.set(syncPatch);

  const local = await chrome.storage.local.get("wpeSecurity");
  if (!local.wpeSecurity) {
    chrome.storage.local.set({
      wpeSecurity: DEFAULT_SECURITY,
      wpeLock: { locked: false, unlockedUntil: null },
      wpeAttempts: { count: 0, lockedUntil: null },
    });
  }
});

// Re-lock when a WhatsApp tab closes, so reopening requires the PIN again.
chrome.tabs.onRemoved.addListener(async () => {
  const { wpeSecurity } = await chrome.storage.local.get("wpeSecurity");
  if (wpeSecurity?.pinEnabled) {
    chrome.storage.local.set({ wpeLock: { locked: true, unlockedUntil: null } });
  }
});



// Handle long-lived connection from content script
chrome.runtime.onConnect.addListener((port) => {
  console.assert(port.name === 'whatsapp-privacy');

  port.onMessage.addListener((msg) => {
    if (msg.type === 'init') {
      // Send current settings when content script connects
      chrome.storage.sync.get(['globalToggle', 'settings'], (data) => {
        port.postMessage({
          type: 'INIT_SETTINGS',
          ...data
        });
      });
    }
  });
});

// Handle one-time messages (from popup or elsewhere)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'UPDATE_SETTINGS') {
    chrome.storage.sync.set({ settings: request.settings }, () => {
      notifyAllTabs(); // Notify all open WhatsApp tabs
      sendResponse({ success: true });
    });
    return true; // Required for async sendResponse
  }

  if (request.type === 'TOGGLE_GLOBAL') {
    chrome.storage.sync.set({ globalToggle: request.value }, () => {
      notifyAllTabs(); // Notify all open WhatsApp tabs
      sendResponse({ success: true });
    });
    return true;
  }
  if (request.type === 'UPDATE_BLUR_VALUES') {
  chrome.storage.sync.set({ blurValues: request.blurValues }, () => {
    notifyAllTabs(); // Reapply blurs with new values
    sendResponse({ success: true });
  });
  return true;
}
});

//  Notify all open WhatsApp tabs of setting changes
function notifyAllTabs() {
  chrome.tabs.query({ url: "*://web.whatsapp.com/*" }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: 'EXTENSION_UPDATED' });
    });
  });
}
