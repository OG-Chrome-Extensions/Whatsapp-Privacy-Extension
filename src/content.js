console.log("injected content script")
const SELECTORS = {
  allMessages: [
    ".quoted-mention._ao3e",
    "._ajv1 span.copyable-text.copyable-text",
    "._ak72 > span.copyable-text",
    "._akbu.x6ikm8r.x10wlt62",
    ".x1rg5ohu.x16dsc37",
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
    '._amk4.false._amkv',

    // Documents
    'div[title^="Download"]', // Document download containers
    'span[data-icon^="document-"]', // Document icons
    'div[aria-label*="document"]', // Document labels

    // Links
    'a[href*="whatsapp"] div[role="button"]', // Link previews
    '[data-testid="link-preview"]',
    "div._ak4a.x121pien",
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
    // Links
    'a[href*="whatsapp"] div[role="button"]', // Link previews
    '[data-testid="link-preview"]',
    "div._ak4a.x121pien",
    'div[aria-label="Voice message"]',
    'button[aria-label="Play voice message"]',
    'span[data-icon="audio-play"]',
    // Documents
    'div[title^="Download"]', // Document download containers
    'span[data-icon^="document-"]', // Document icons
    'div[aria-label*="document"]', // Document labels
  ],
  textInput: [
    // Add selectors for text input
    'div[contenteditable="true"]', // Main input area
    "._ak1k", // Maybe reply input
  ],
  profilePictures: [
    // Main profile pictures (chat list and headers)
    'img._ao3e[src*="whatsapp.net"][draggable="false"]',
    'img.x1lliihq[src*="whatsapp.net"]',
    'div[style*="height: 40px; width: 40px"] img._ao3e',

    // Fallbacks and alternative locations
    'div[data-testid="chat-list-item"] img[alt=""]',
    'header[data-testid="conversation-header"] img[alt=""]',
    "div.x1n2onr6.x1c9tyrk img.xeusxvb",

    // Group profile picture indicators
    'div.x1iyjqo2 > div.x78zum5 > div > svg[aria-label="group"]',

    // Status/profile view pictures
    'div[aria-label="Profile photo"] img',
    'div[data-testid="status-thumb"] img',
  ],
  groupNames: [
    // Primary selectors (chat list items)
    'div._ak8q span._ao3e[dir="auto"][title]', // Your specific case
    'div[data-testid="chat-list-item"] span[title]',
    'div[role="row"] span._ao3e[dir="auto"]',

    // Chat header names
    'header[data-testid="conversation-header"] span._ao3e',
    'div[data-testid="conversation-info-header"] span[title]',

    // Alternative selectors
    'span.x1iyjqo2.x6ikm8r._ao3e[dir="auto"]', // Common name structure
    "div.x78zum5.x1q0g3np span._ao3e", // Container-based

    // Pinned/Unread indicators (from your example)
    'div._ahlk[aria-label="Pinned chat"]', // Pinned chats
    'span[aria-label*="unread messages"]', // Unread count

    // Fallback selectors
    'div[aria-label="Chat list"] span[title]',
    "span.x1rg5ohu.xjnfcd9.x1n2onr6._ao3e",
  ],
};

let observer = null;
let activeSettings = null;
let globalEnabled = false;

let isInactiveBlurred = false;
let appHoverTimer; //useless
let inactivityTimer;
const APP_HOVER_DELAY = 100;
let BLUR_AMOUNT = 8;
let INACTIVITY_TIMEOUT = 10000;
let isAppHovered = false;
let lastAppliedBlurAmount = null;


// Improved blur application that respects inactive state
function applyBlurToElements(selectors, blurValue , key) {
  if (!selectors || selectors.length === 0) return;
  // Prevent blur if unblurOnHover is on and app is hovered

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      const className = `privacy-blurred-${key}`;
      if (!el.classList.contains(className)) {
        // Don't override inactive blur
        if (!isInactiveBlurred || key === "inactive") {
          el.style.filter = `blur(${blurValue}px)`;
          el.dataset.originalFilter = `blur(${blurValue}px)`;
          console.log("bulur amount inside fun ",blurValue)
        }
        el.style.transition = activeSettings.noTransition
          ? "none"
          : "filter 0.3s ease";
        el.classList.add(className);
      }
    });
  });
}

function removeBlurFromElements(key) {
  document.querySelectorAll(`.privacy-blurred-${key}`).forEach((el) => {
    // Only remove blur if not inactive (unless we're specifically removing inactive)
    if (!isInactiveBlurred || key === "inactive") {
      el.style.filter = "";
      delete el.dataset.originalFilter;
    }
    el.classList.remove(`privacy-blurred-${key}`);
  });
}

// Modified to handle inactive state properly
function applyBlurBasedOnSettings() {
  if (!globalEnabled || !activeSettings) {
    Object.keys(SELECTORS).forEach((key) => removeBlurFromElements(key));
  lastAppliedBlurAmount = null; // Reset
    return;
  }

  const blurChanged = lastAppliedBlurAmount !== BLUR_AMOUNT;

  //  If blur amount changed, remove all current blur before reapplying
  if (blurChanged) {
    
    Object.entries(activeSettings).forEach(([key, value]) => {
      if (SELECTORS[key] && key !== "blurOnIdle" && value) {
        removeBlurFromElements(key); // remove old blur class
      }
    });
  }

  // Always apply blur or remove based on current settings
  Object.entries(activeSettings).forEach(([key, value]) => {
    if (SELECTORS[key] && key !== "blurOnIdle") {
      if (value) {
        applyBlurToElements(SELECTORS[key], BLUR_AMOUNT, key); // now reapply with new amount
      } else {
        removeBlurFromElements(key);
      }
    }
  });

  //  Update stored value for next comparison
  lastAppliedBlurAmount = BLUR_AMOUNT;

  // Handle inactive blur separately if needed
  if (activeSettings.blurOnIdle && isInactiveBlurred) {
    applyBlurToElements(Object.values(SELECTORS).flat(), 8, "inactive");
  }
}

// Improved hover effect that respects other toggles
function setupHoverEffect() {
  const allSelectors = Object.values(SELECTORS).flat();

  document.addEventListener("mouseover", (e) => {
    const el = allSelectors.map((sel) => e.target.closest(sel)).find(Boolean);
    if (el?.dataset.originalFilter && !isInactiveBlurred) {
      el.style.filter = "none";
      // console.log("Hovering:", el, "Original filter:", el?.dataset.originalFilter);
    }
  });

  document.addEventListener("mouseout", (e) => {
    const el = allSelectors.map((sel) => e.target.closest(sel)).find(Boolean);
   
    if (activeSettings.unblurOnHover && isAppHovered) return;


    if (el?.dataset.originalFilter && !isInactiveBlurred) {
      el.style.filter = el.dataset.originalFilter;
    }
  });
}

// Improved inactivity blur
function setupInactivityBlur() {
  const resetTimer = () => {
    if (!activeSettings.blurOnIdle || !globalEnabled) return;

    clearTimeout(inactivityTimer);

    //  Remove only idle-related blur
    document.querySelectorAll(".privacy-blurred-inactive").forEach((el) => {
      el.style.filter = "";
      el.classList.remove("privacy-blurred-inactive");
    });

    //  Restore saved setting-based blur
    applyBlurBasedOnSettings();

    inactivityTimer = setTimeout(() => {
      if (globalEnabled && activeSettings.blurOnIdle) {
        const alreadyBlurred = new Set();
        Object.keys(activeSettings).forEach((key) => {
          if (activeSettings[key]) {
            document
              .querySelectorAll(`.privacy-blurred-${key}`)
              .forEach((el) => alreadyBlurred.add(el));
          }
        });

        const allSelectors = Object.values(SELECTORS).flat();
        allSelectors.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => {
            if (!alreadyBlurred.has(el)) {
              el.style.filter = "blur(8px)";
              el.classList.add("privacy-blurred-inactive");
            }
          });
        });
      }
    }, INACTIVITY_TIMEOUT);
  };

  // Event listeners
  ["mousemove", "keydown", "click", "scroll", "touchstart", "wheel"].forEach(
    (event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    }
  );

  resetTimer(); // Initialize
}

// Improved app hover
function setupAppHover() {
  const appContainer =
    document.querySelector("#app, .app-wrapper") || document.body;
  console.log(" setupAppHover initialized");

  const handleMouseEnter = () => {
    if (!activeSettings.unblurOnHover || !globalEnabled) return;
    isAppHovered = true;

    clearTimeout(appHoverTimer);

    Object.keys(SELECTORS).forEach((key) => {
      document.querySelectorAll(`.privacy-blurred-${key}`).forEach((el) => {
        // Save current blur filter before removing
        if (!el.dataset.originalFilter) {
          el.dataset.originalFilter = el.style.filter || "blur(8px)";
        }

        el.style.filter = "none";
      });
    });
    console.log("Unblurred screen on mouse enter");
  };

  const handleMouseLeave = () => {
    if (!activeSettings.unblurOnHover || !globalEnabled) return;
    isAppHovered = false;


    appHoverTimer = setTimeout(() => {
      Object.keys(SELECTORS).forEach((key) => {
        document.querySelectorAll(`.privacy-blurred-${key}`).forEach((el) => {
          const filter = el.dataset.originalFilter || "blur(8px)";
          el.style.filter = filter;
        });
      });
     
    }, APP_HOVER_DELAY);
  };

  appContainer.removeEventListener("mouseenter", handleMouseEnter);
  appContainer.removeEventListener("mouseleave", handleMouseLeave);

  appContainer.addEventListener("mouseenter", handleMouseEnter);
  appContainer.addEventListener("mouseleave", handleMouseLeave);
}

function observeNewContent() {
  if (observer) observer.disconnect();
  if (!globalEnabled) return;

  observer = new MutationObserver(() => {
    setTimeout(() => {
      if (!globalEnabled) return;

      if (isAppHovered && activeSettings.unblurOnHover) {
        // If hovered, unblur any new elements immediately
        Object.keys(SELECTORS).forEach((key) => {
          document.querySelectorAll(`.privacy-blurred-${key}`).forEach((el) => {
            if (!el.dataset.originalFilter) {
              el.dataset.originalFilter = el.style.filter || "blur(8px)";
            }
            el.style.filter = "none";
          });
        });
      } else {
        // Otherwise apply blur normally
        applyBlurBasedOnSettings();
      }
    }, 100);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function init() {
  chrome.storage.sync.get(
   ["settings", "globalToggle", "blurValues"],
    ({ settings, globalToggle, blurValues }) => {
      activeSettings = settings || {};
      globalEnabled = !!globalToggle;
    

       if (blurValues) {
        BLUR_AMOUNT = blurValues["blur amount"] || 8;
       INACTIVITY_TIMEOUT = (blurValues["idle timeout"] || 10) * 1000;


        console.log("blur amount",BLUR_AMOUNT)
        console.log("blur IDL ITME OUT",INACTIVITY_TIMEOUT)
      }


      if (!globalEnabled) {
        if (observer) observer.disconnect();
        Object.keys(SELECTORS).forEach((key) => removeBlurFromElements(key));
        isInactiveBlurred = false;
        return;
      }

      applyBlurBasedOnSettings();
      setupHoverEffect();
      observeNewContent();
      setupAppHover();
      setupInactivityBlur();
    }
  );
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "EXTENSION_UPDATED") {
    // Clear existing timers
    clearTimeout(appHoverTimer);
    clearTimeout(inactivityTimer);

    // Reset state
    isInactiveBlurred = false;

    // Reinitialize everything
    init();
    sendResponse({ success: true });
  }
  return true; // Required for async response
});

init();
