const WebSocket = require('ws');

// Set up logging for WebSocket server
function wsLog(type, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [WS-${type}] ${message}`, data ? data : '');
}

let wsClient = null;
let lastDistractionTabId = null;
let reconnectTimer = null;
let messageQueue = [];

function startWebSocketServer(onDistraction) {
  const wss = new WebSocket.Server({ port: 17345 });
  
  function processMessageQueue() {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        try {
          wsClient.send(msg);
        } catch (e) {
          console.error('Failed to send message:', e);
          messageQueue.unshift(msg); // Put message back at front of queue
          break;
        }
      }
    }
  }

  wss.on('connection', ws => {
    wsClient = ws;
    ws.on('message', msg => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'distraction') {
          lastDistractionTabId = data.tabId;
          onDistraction(data.tabId);
        } else if (data.type === 'tab-closed') {
          // Clear the ID once the tab is confirmed closed
          lastDistractionTabId = null;
        }
      } catch (e) {
        if (msg.toString() === 'distraction') {
          onDistraction();
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsClient = null;
    });

    ws.on('close', () => {
      wsClient = null;
      // Try to reconnect
      if (!reconnectTimer) {
        reconnectTimer = setInterval(() => {
          if (wsClient) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
          }
        }, 1000);
      }
    });

    // Process any queued messages on connection
    processMessageQueue();
  });
}

function sendCloseTab(tabId, freezeOnly = false) {
  if (!tabId) {
    wsLog('ERROR', 'Attempted to send close/freeze command without tabId');
    return;
  }
  
  const message = JSON.stringify({
    type: freezeOnly ? 'freeze-tab' : 'close-tab',
    tabId,
    timestamp: Date.now()
  });

  wsLog('INFO', `Preparing to send ${freezeOnly ? 'freeze' : 'close'} command`, { tabId });

  // If we have an active connection, send immediately
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    try {
      wsLog('INFO', 'Sending message through WebSocket', { message });
      wsClient.send(message);
      
      // For close commands, send multiple times to ensure delivery
      if (!freezeOnly) {
        wsLog('INFO', 'Scheduling redundant close messages');
        setTimeout(() => {
          if (wsClient?.readyState === WebSocket.OPEN) {
            wsLog('INFO', 'Sending first redundant close message');
            wsClient.send(message);
          }
        }, 100);
        setTimeout(() => {
          if (wsClient?.readyState === WebSocket.OPEN) {
            wsLog('INFO', 'Sending second redundant close message');
            wsClient.send(message);
          }
        }, 300);
      }
    } catch (error) {
      wsLog('ERROR', 'Failed to send message through WebSocket', { error });
      messageQueue.push(message);
      wsLog('INFO', 'Added message to queue', { queueLength: messageQueue.length });
    }
  } else {
    wsLog('WARN', 'No active WebSocket connection, queueing message', { 
      wsClientExists: !!wsClient,
      readyState: wsClient ? wsClient.readyState : 'no client'
    });
    messageQueue.push(message);
  }
}

module.exports = { startWebSocketServer, sendCloseTab, lastDistractionTabId };
