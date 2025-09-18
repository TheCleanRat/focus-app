chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab && tab.active && tab.url) {
    if (/youtube\.com|instagram\.com/.test(tab.url)) {
      if (chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '👀', tabId });
      }
      notifyDistraction(tabId);
      ensureWebSocket(tabId);
      setTimeout(() => closeTab(tabId), 30000); // Close after 30s
    } else {
      if (chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '', tabId });
      }
    }
  }
});

function notifyDistraction(tabId) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title: 'FocusTracker Reminder',
    message: 'You are on a distracting site! Time to get back on track.'
  });
}

let ws = null;
let wsReady = false;
let freezeTabId = null;
let freezeInterval = null;

function ensureWebSocket(tabId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'distraction', tabId }));
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'close-tab' && data.tabId) {
          closeTab(data.tabId);
          unfreezeTab();
        } else if (data.type === 'freeze-tab' && data.tabId) {
          freezeTab(data.tabId);
        }
      } catch (e) {}
    };
    return;
  }
  ws = new WebSocket('ws://localhost:17345');
  ws.onopen = () => {
    wsReady = true;
    ws.send(JSON.stringify({ type: 'distraction', tabId }));
  };
  ws.onerror = () => {};
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'close-tab' && data.tabId) {
        closeTab(data.tabId);
        unfreezeTab();
      } else if (data.type === 'freeze-tab' && data.tabId) {
        freezeTab(data.tabId);
      }
    } catch (e) {}
  };
}

function freezeTab(tabId) {
  if (freezeTabId !== tabId) {
    freezeTabId = tabId;
    if (freezeInterval) clearInterval(freezeInterval);
    freezeInterval = setInterval(() => {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          if (!window.__focusBlocker) {
            const blocker = document.createElement('div');
            blocker.id = '__focusBlocker';
            blocker.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:2rem;color:#6a4cff;pointer-events:auto;';
            blocker.innerHTML = 'Stay Focused! ✨<br>Access to this site is blocked until you click I\'m back in FocusTracker.';
            document.body.appendChild(blocker);
          }
        }
      });
    }, 1000);
  }
}

function unfreezeTab() {
  if (freezeInterval) clearInterval(freezeInterval);
  if (freezeTabId !== null) {
    chrome.scripting.executeScript({
      target: { tabId: freezeTabId },
      func: () => {
        const blocker = document.getElementById('__focusBlocker');
        if (blocker) blocker.remove();
      }
    });
  }
  freezeTabId = null;
}

function closeTab(tabId) {
  // First try to unfreeze immediately
  unfreezeTab();
  
  // Clear any remaining freeze intervals
  if (freezeInterval) {
    clearInterval(freezeInterval);
    freezeInterval = null;
  }

  // Force close the tab with multiple attempts
  function attemptClose(attemptsLeft = 3) {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        // Tab already closed
        ws.send(JSON.stringify({ type: 'tab-closed', tabId }));
        return;
      }

      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError && attemptsLeft > 0) {
          // If failed, try again after a short delay
          setTimeout(() => attemptClose(attemptsLeft - 1), 100);
        } else {
          // Notify main process that tab is closed
          ws.send(JSON.stringify({ type: 'tab-closed', tabId }));
        }
      });
    });
  }

  // Start the close attempts
  attemptClose();
}
