// WhatsApp Privacy Extension — content script
// Stability refactor (Phase 1):
//  - Blur is driven by a single injected stylesheet + marker classes, not by
//    rewriting inline `style.filter` on every element.
//  - Blur amount is a CSS variable, so changing it is one property write
//    instead of a full DOM re-walk.
//  - MutationObserver work is coalesced into a single rAF pass.

// ---------------------------------------------------------------------------
// Selectors. Each key maps to the elements that setting should blur.
// Centralized here so a WhatsApp DOM change is a one-file fix.
// ---------------------------------------------------------------------------
const SELECTORS = {
  allMessages: [
    ".quoted-mention._ao3e",
    "._ajv1 span.copyable-text.copyable-text",
    "._ak72 > span.copyable-text",
    "._akbu.x6ikm8r.x10wlt62",
    ".x1rg5ohu.x16dsc37",
    // Broad, resilient message-text catches (incl. image/media captions),
    // scoped to the open conversation so the rest of the UI is untouched.
    "#main span.selectable-text.copyable-text",
    "#main span.selectable-text",
    "#main div.copyable-text > span",
    '#main [data-testid="media-caption"]',
  ],
  lastPreview: [
    "div._ak8j > div._ak8k > span[title] > span._ao3e",
    "div._ak8j > div._ak8k > span[title] > span.x1iyjqo2",
    'div[data-testid="chat-list-item"] div[dir="ltr"] > span._ao3e',
    'div[role="row"] > div:nth-child(2) > div > span._ao3e',
    '[aria-label="Chat list"] [title] > span > span._ao3e',
    '[class*="ak8k"] span._ao3e',
    '[class*="msg-preview"]',
    'div._ak8k [dir="ltr"] > span',
    'div._ak8k > span > span[dir="auto"]',
  ],
  mediaPreview: [
    // Images
    'img[src^="blob:"]:not([aria-hidden])',
    '[data-testid="image-thumb"]',
    '[data-testid="media-viewer-image"]',
    // Videos
    "._amk4.false._amkv",
    // Documents
    'div[title^="Download"]',
    'span[data-icon^="document-"]',
    'div[aria-label*="document"]',
    // Links (preview cards + in-message anchors, scoped to the chat pane)
    '[data-testid="link-preview"]',
    "div._ak4a.x121pien",
    'a[href*="whatsapp"] div[role="button"]',
    '#main a[href^="http"]',
    '#main div[role="row"] a[href]',
    'a[href^="http"][target="_blank"]',
    'div[aria-label="Voice message"]',
    'button[aria-label="Play voice message"]',
    'span[data-icon="audio-play"]',
  ],
  mediaGallery: [
    'div[style*="background-image"][class*="x10l6tqk"][class*="x13vifvy"]',
    'div[style*="data:image"][class*="x10l6tqk"][class*="x13vifvy"]',
    '[data-testid="media-viewer-image"]',
    '[data-testid="media-viewer-video"]',
    'div[data-testid="media-gallery"] div[style*="background-image"]',
    '[data-testid="link-preview"]',
    "div._ak4a.x121pien",
    'a[href*="whatsapp"] div[role="button"]',
    '#main a[href^="http"]',
    '#main div[role="row"] a[href]',
    'a[href^="http"][target="_blank"]',
    'div[aria-label="Voice message"]',
    'button[aria-label="Play voice message"]',
    'span[data-icon="audio-play"]',
    'div[title^="Download"]',
    'span[data-icon^="document-"]',
    'div[aria-label*="document"]',
  ],
  textInput: [
    'div[contenteditable="true"]',
    "._ak1k",
  ],
  profilePictures: [
    'img._ao3e[src*="whatsapp.net"][draggable="false"]',
    'img.x1lliihq[src*="whatsapp.net"]',
    'div[style*="height: 40px; width: 40px"] img._ao3e',
    'div[data-testid="chat-list-item"] img[alt=""]',
    'header[data-testid="conversation-header"] img[alt=""]',
    "div.x1n2onr6.x1c9tyrk img.xeusxvb",
    'div.x1iyjqo2 > div.x78zum5 > div > svg[aria-label="group"]',
    'div[aria-label="Profile photo"] img',
    'div[data-testid="status-thumb"] img',
  ],
  groupNames: [
    'div._ak8q span._ao3e[dir="auto"][title]',
    'div[data-testid="chat-list-item"] span[title]',
    'div[role="row"] span._ao3e[dir="auto"]',
    'header[data-testid="conversation-header"] span._ao3e',
    'div[data-testid="conversation-info-header"] span[title]',
    'span.x1iyjqo2.x6ikm8r._ao3e[dir="auto"]',
    "div.x78zum5.x1q0g3np span._ao3e",
    'div._ahlk[aria-label="Pinned chat"]',
    'span[aria-label*="unread messages"]',
    'div[aria-label="Chat list"] span[title]',
    "span.x1rg5ohu.xjnfcd9.x1n2onr6._ao3e",
  ],
};

const ALL_SELECTORS = Object.values(SELECTORS).flat();

// ---------------------------------------------------------------------------
// CSS class names. Marker classes carry no styling of their own except via the
// `[class*="wpe-k-"]` base rule, so toggling blur on an element is just a
// classList add/remove.
// ---------------------------------------------------------------------------
const MARK_PREFIX = "wpe-k-"; // e.g. wpe-k-allMessages, wpe-k-idle
const REVEAL_CLASS = "wpe-reveal"; // per-element hover reveal
const ROOT_NO_TRANSITION = "wpe-no-transition";
const ROOT_APP_HOVER = "wpe-app-hover"; // unblur-everything while app hovered
const STYLE_ID = "wpe-style";
const DEFAULT_BLUR = 8;
const DEFAULT_IDLE_SECONDS = 10;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let observer = null;
let activeSettings = null;
let globalEnabled = false;
let isIdleBlurred = false;
let isAppHovered = false;
let inactivityTimer = null;
let relockTimer = null;
let lastKeepAlive = 0; // heartbeat from an open settings/options page
let mutationScheduled = false;

let blurAmount = DEFAULT_BLUR;
let inactivityTimeout = DEFAULT_IDLE_SECONDS * 1000;

// PIN-lock state mirrored from chrome.storage.local (written by the popup/options
// page via the lock library). content.js only reads it — never hashes anything.
const SECURITY_DEFAULTS = {
  pinEnabled: false,
  relockMode: "idle",
  relockTimerMinutes: 5,
  blurAllWhenLocked: false,
};
let securityCfg = { ...SECURITY_DEFAULTS };
let lockState = { locked: false, unlockedUntil: null };

function isLocked() {
  if (!securityCfg?.pinEnabled) return false;
  if (lockState?.locked) return true;
  if (lockState?.unlockedUntil && Date.now() >= lockState.unlockedUntil) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [class*="${MARK_PREFIX}"] {
      filter: blur(var(--wpe-blur-amount, ${DEFAULT_BLUR}px)) !important;
      transition: filter 0.3s ease;
    }
    .${ROOT_NO_TRANSITION} [class*="${MARK_PREFIX}"] {
      transition: none !important;
    }
    /* Per-element hover reveal wins on specificity (class + attr). Also clear
       any marked descendants so nested blurs reveal together. */
    .${REVEAL_CLASS}[class*="${MARK_PREFIX}"],
    .${REVEAL_CLASS} [class*="${MARK_PREFIX}"] {
      filter: none !important;
    }
    /* Reveal everything while the whole app is hovered. */
    .${ROOT_APP_HOVER} [class*="${MARK_PREFIX}"] {
      filter: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function setBlurAmount(px) {
  document.documentElement.style.setProperty("--wpe-blur-amount", `${px}px`);
}

function updateRootClasses() {
  const root = document.documentElement;
  root.classList.toggle(ROOT_NO_TRANSITION, !!activeSettings?.noTransition);
  root.classList.toggle(
    ROOT_APP_HOVER,
    !!activeSettings?.unblurOnHover && isAppHovered && !isIdleBlurred && !isLocked()
  );
}

// ---------------------------------------------------------------------------
// Marker management
// ---------------------------------------------------------------------------
function markKey(key) {
  const selectors = SELECTORS[key];
  if (!selectors) return;
  const cls = MARK_PREFIX + key;
  selectors.forEach((selector) => {
    let nodes;
    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      return; // skip a selector WhatsApp may have invalidated
    }
    nodes.forEach((el) => el.classList.add(cls));
  });
}

function unmarkKey(key) {
  document
    .querySelectorAll(`.${MARK_PREFIX}${key}`)
    .forEach((el) => el.classList.remove(MARK_PREFIX + key));
}

function removeAllMarkers() {
  document.querySelectorAll(`[class*="${MARK_PREFIX}"]`).forEach((el) => {
    // Use classList (works on SVG too, where className is an SVGAnimatedString).
    Array.from(el.classList)
      .filter((c) => c.startsWith(MARK_PREFIX))
      .forEach((c) => el.classList.remove(c));
    el.classList.remove(REVEAL_CLASS);
  });
}

// Apply blur markers for the current settings. Cheap and idempotent — adding a
// class that already exists is a no-op, so this is safe to call on every
// mutation pass.
function applyBlurBasedOnSettings() {
  if (!globalEnabled || !activeSettings) {
    removeAllMarkers();
    return;
  }

  Object.keys(SELECTORS).forEach((key) => {
    if (activeSettings[key]) markKey(key);
    else unmarkKey(key);
  });

  // Blur everything (regardless of individual toggles) when idle, or when the
  // PIN lock is engaged and "blur all while locked" is on.
  const blurAll =
    isIdleBlurred || (isLocked() && securityCfg?.blurAllWhenLocked);
  if (blurAll) markIdle();
  else unmarkIdle();

  updateRootClasses();
}

function markIdle() {
  ALL_SELECTORS.forEach((selector) => {
    let nodes;
    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      return;
    }
    nodes.forEach((el) => el.classList.add(`${MARK_PREFIX}idle`));
  });
}

function unmarkIdle() {
  document
    .querySelectorAll(`.${MARK_PREFIX}idle`)
    .forEach((el) => el.classList.remove(`${MARK_PREFIX}idle`));
}

// ---------------------------------------------------------------------------
// Hover reveal (per element). Disabled while idle-blurred.
// ---------------------------------------------------------------------------
function closestBlurred(target) {
  for (const sel of ALL_SELECTORS) {
    let match;
    try {
      match = target.closest(sel);
    } catch {
      continue;
    }
    if (match) return match;
  }
  return null;
}

let hoverRevealed = null;

// The highest marked ancestor of `target`, so revealing it (plus the CSS rule
// that clears marked descendants) un-blurs the whole nested element at once.
function topBlurred(target) {
  let node = target;
  let top = null;
  while (node && node.nodeType === 1) {
    if (node.matches && node.matches(`[class*="${MARK_PREFIX}"]`)) top = node;
    node = node.parentElement;
  }
  return top;
}

function handleMouseOver(e) {
  if (!globalEnabled || isIdleBlurred) return;
  // While locked, hovering a blurred element prompts for the PIN.
  if (isLocked()) {
    if (closestBlurred(e.target)) showUnlockOverlay();
    return;
  }
  const el = topBlurred(e.target);
  if (el && el !== hoverRevealed) {
    if (hoverRevealed) hoverRevealed.classList.remove(REVEAL_CLASS);
    hoverRevealed = el;
    el.classList.add(REVEAL_CLASS);
  }
}

// ---------------------------------------------------------------------------
// In-page unlock overlay (an extension iframe hosting the PIN keypad).
// ---------------------------------------------------------------------------
let unlockIframe = null;

function showUnlockOverlay() {
  if (unlockIframe) return;
  unlockIframe = document.createElement("iframe");
  unlockIframe.src = chrome.runtime.getURL("unlock.html");
  Object.assign(unlockIframe.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    border: "0",
    background: "transparent",
    zIndex: "2147483647",
  });
  document.documentElement.appendChild(unlockIframe);
}

function hideUnlockOverlay() {
  if (unlockIframe) {
    unlockIframe.remove();
    unlockIframe = null;
  }
}

window.addEventListener("message", (e) => {
  const type = e?.data?.type;
  if (type === "wpe-unlocked" || type === "wpe-cancel") {
    hideUnlockOverlay();
    // On unlock, applyUnlock already wrote storage; onChanged re-applies blur.
  }
});

function handleMouseOut(e) {
  // While app-hover reveal-all is active, leave reveal handling to the root class.
  if (activeSettings?.unblurOnHover && isAppHovered) return;
  // Re-blur only when the pointer truly leaves the revealed element.
  if (hoverRevealed && !hoverRevealed.contains(e.relatedTarget)) {
    hoverRevealed.classList.remove(REVEAL_CLASS);
    hoverRevealed = null;
  }
}

function setupHoverEffect() {
  document.removeEventListener("mouseover", handleMouseOver);
  document.removeEventListener("mouseout", handleMouseOut);
  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("mouseout", handleMouseOut);
}

// ---------------------------------------------------------------------------
// App-hover: reveal everything while the cursor is anywhere in the app.
// Implemented purely with a root class — no per-element bookkeeping.
// ---------------------------------------------------------------------------
function handleAppEnter() {
  if (!activeSettings?.unblurOnHover || !globalEnabled) return;
  isAppHovered = true;
  updateRootClasses();
}

function handleAppLeave() {
  isAppHovered = false;
  updateRootClasses();
}

function setupAppHover() {
  const root = document.documentElement;
  root.removeEventListener("mouseenter", handleAppEnter);
  root.removeEventListener("mouseleave", handleAppLeave);
  root.addEventListener("mouseenter", handleAppEnter);
  root.addEventListener("mouseleave", handleAppLeave);
}

// ---------------------------------------------------------------------------
// Activity → idle blur + PIN re-lock
// ---------------------------------------------------------------------------
const IDLE_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart", "wheel"];

// Persist a new lock state and re-apply immediately (the storage write also
// notifies any other tab via the onChanged listener).
function setLockedState(locked) {
  lockState = { locked, unlockedUntil: null };
  chrome.storage.local.set({ wpeLock: lockState });
  applyBlurBasedOnSettings();
}

// Arm the re-lock timer for the current mode. idle/immediate reset on activity;
// timer uses the unlock deadline; session never auto-locks.
function scheduleRelock() {
  clearTimeout(relockTimer);
  if (!securityCfg?.pinEnabled || isLocked()) return;
  const mode = securityCfg.relockMode;
  if (mode === "session") return;

  let delay;
  if (mode === "idle") delay = inactivityTimeout;
  else if (mode === "immediate") delay = 3000;
  else {
    const until =
      lockState?.unlockedUntil ||
      Date.now() + (securityCfg.relockTimerMinutes || 5) * 60000;
    delay = Math.max(0, until - Date.now());
  }
  relockTimer = setTimeout(() => {
    // Defer if the settings page is actively open (recent heartbeat).
    if (Date.now() - lastKeepAlive < 8000) {
      scheduleRelock();
      return;
    }
    setLockedState(true);
  }, delay);
}

function onActivity() {
  // Visual idle blur.
  if (globalEnabled && activeSettings?.blurOnIdle) {
    clearTimeout(inactivityTimer);
    if (isIdleBlurred) {
      isIdleBlurred = false;
      applyBlurBasedOnSettings();
    }
    inactivityTimer = setTimeout(() => {
      if (globalEnabled && activeSettings?.blurOnIdle) {
        isIdleBlurred = true;
        applyBlurBasedOnSettings();
      }
    }, inactivityTimeout);
  }

  // Re-lock on inactivity for idle/immediate modes.
  const mode = securityCfg?.relockMode;
  if (
    securityCfg?.pinEnabled &&
    !isLocked() &&
    (mode === "idle" || mode === "immediate")
  ) {
    scheduleRelock();
  }
}

function setupActivity() {
  IDLE_EVENTS.forEach((event) =>
    window.removeEventListener(event, onActivity)
  );
  if (!activeSettings?.blurOnIdle && !securityCfg?.pinEnabled) return;
  IDLE_EVENTS.forEach((event) =>
    window.addEventListener(event, onActivity, { passive: true })
  );
  onActivity();
}

// ---------------------------------------------------------------------------
// Observe new content. Mutations are coalesced into one rAF pass so a burst of
// DOM changes triggers a single re-mark instead of one per mutation.
// ---------------------------------------------------------------------------
function scheduleApply() {
  if (mutationScheduled) return;
  mutationScheduled = true;
  requestAnimationFrame(() => {
    mutationScheduled = false;
    if (globalEnabled) applyBlurBasedOnSettings();
  });
}

function observeNewContent() {
  if (observer) observer.disconnect();
  if (!globalEnabled) return;

  observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Init / teardown
// ---------------------------------------------------------------------------
function teardown() {
  if (observer) observer.disconnect();
  clearTimeout(inactivityTimer);
  clearTimeout(relockTimer);
  IDLE_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
  isIdleBlurred = false;
  isAppHovered = false;
  hoverRevealed = null;
  hideUnlockOverlay();
  removeAllMarkers();
  document.documentElement.classList.remove(ROOT_NO_TRANSITION, ROOT_APP_HOVER);
}

// freshLoad === true only for the initial injection (page load / reload), where
// we always re-lock if a PIN is set. EXTENSION_UPDATED re-inits without locking.
async function init(freshLoad) {
  const sync = await chrome.storage.sync.get([
    "settings",
    "globalToggle",
    "blurValues",
  ]);
  const local = await chrome.storage.local.get(["wpeSecurity", "wpeLock"]);

  activeSettings = sync.settings || {};
  globalEnabled = !!sync.globalToggle;
  blurAmount = Number(sync.blurValues?.["blur amount"]) || DEFAULT_BLUR;
  inactivityTimeout =
    (Number(sync.blurValues?.["idle timeout"]) || DEFAULT_IDLE_SECONDS) * 1000;

  securityCfg = { ...SECURITY_DEFAULTS, ...(local.wpeSecurity || {}) };
  lockState = local.wpeLock || { locked: false, unlockedUntil: null };

  if (freshLoad && securityCfg.pinEnabled) {
    lockState = { locked: true, unlockedUntil: null };
    chrome.storage.local.set({ wpeLock: lockState });
  }

  injectStyles();
  setBlurAmount(blurAmount);

  if (!globalEnabled) {
    teardown();
    return;
  }

  applyBlurBasedOnSettings();
  setupHoverEffect();
  observeNewContent();
  setupAppHover();
  setupActivity();
  scheduleRelock();
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "EXTENSION_UPDATED") {
    clearTimeout(inactivityTimer);
    isIdleBlurred = false;
    init(false);
    sendResponse({ success: true });
  }
  return true;
});

// React to lock/security changes written by the popup or options page.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  // Heartbeat from an open settings page — defer idle re-lock, nothing else.
  if (changes.wpeKeepAlive) {
    lastKeepAlive = Number(changes.wpeKeepAlive.newValue) || Date.now();
    return;
  }
  let relevant = false;
  if (changes.wpeLock) {
    lockState = changes.wpeLock.newValue || { locked: false, unlockedUntil: null };
    relevant = true;
  }
  if (changes.wpeSecurity) {
    securityCfg = { ...SECURITY_DEFAULTS, ...(changes.wpeSecurity.newValue || {}) };
    relevant = true;
  }
  if (relevant && globalEnabled) {
    if (!isLocked()) hideUnlockOverlay();
    applyBlurBasedOnSettings();
    scheduleRelock();
  }
});

init(true);
