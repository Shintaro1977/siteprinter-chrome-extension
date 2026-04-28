// Storage utility functions for SitePrinter

const STORAGE_KEYS = {
  SETTINGS: 'siteprinter_settings',
  SCREENSHOTS: 'screenshots',
  CAPTURED_AT: 'capturedAt',
};

const DEFAULT_SETTINGS = {
  columns: 2,
  margin: 'medium',
  showHeader: true,
  showFooter: true,
};

export async function getSettings() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEYS.SETTINGS] };
  } catch (error) {
    console.error('Failed to get settings:', error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: settings,
    });
    return true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
}

export async function getScreenshots() {
  try {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.SCREENSHOTS,
      STORAGE_KEYS.CAPTURED_AT,
    ]);
    return {
      screenshots: data[STORAGE_KEYS.SCREENSHOTS] || [],
      capturedAt: data[STORAGE_KEYS.CAPTURED_AT] || null,
    };
  } catch (error) {
    console.error('Failed to get screenshots:', error);
    return { screenshots: [], capturedAt: null };
  }
}

export async function saveScreenshots(screenshots, capturedAt) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SCREENSHOTS]: screenshots,
      [STORAGE_KEYS.CAPTURED_AT]: capturedAt,
    });
    return true;
  } catch (error) {
    console.error('Failed to save screenshots:', error);
    return false;
  }
}

export async function clearScreenshots() {
  try {
    await chrome.storage.local.remove([
      STORAGE_KEYS.SCREENSHOTS,
      STORAGE_KEYS.CAPTURED_AT,
    ]);
    return true;
  } catch (error) {
    console.error('Failed to clear screenshots:', error);
    return false;
  }
}
