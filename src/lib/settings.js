// Shared helpers for reading/writing the blur settings that live in
// chrome.storage.sync, used by both the popup and the options page.

export const DEFAULT_SETTINGS = {
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

export const DEFAULT_BLUR_VALUES = {
  "blur amount": 8,
  "idle timeout": 10,
};

export function sendMessageToExtension(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function notifyContentScripts() {
  chrome.tabs.query({ url: "*://web.whatsapp.com/*" }, (tabs) => {
    tabs.forEach((tab) =>
      chrome.tabs.sendMessage(tab.id, { type: "EXTENSION_UPDATED" })
    );
  });
}

export async function loadState() {
  const result = await chrome.storage.sync.get([
    "globalToggle",
    "settings",
    "blurValues",
  ]);
  return {
    globalToggle: result.globalToggle ?? true,
    settings: { ...DEFAULT_SETTINGS, ...(result.settings || {}) },
    blurValues: { ...DEFAULT_BLUR_VALUES, ...(result.blurValues || {}) },
  };
}

export async function updateSettings(settings) {
  await sendMessageToExtension({ type: "UPDATE_SETTINGS", settings });
  notifyContentScripts();
}

export async function toggleGlobal(value) {
  await sendMessageToExtension({ type: "TOGGLE_GLOBAL", value });
  notifyContentScripts();
}

export async function updateBlurValues(blurValues) {
  await sendMessageToExtension({ type: "UPDATE_BLUR_VALUES", blurValues });
  notifyContentScripts();
}
