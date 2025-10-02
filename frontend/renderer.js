// --- ELEMENTS ---
const mainPanel = document.getElementById('mainPanel');
const offlineBtn = document.getElementById('offlineBtn');
const onlineBtn = document.getElementById('onlineBtn');

const loginPopup = document.getElementById('loginPopup');
const closeLogin = document.getElementById('closeLogin');
const loginBtn = document.getElementById('loginBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');

const devicePopup = document.getElementById('devicePopup');
const closeDevice = document.getElementById('closeDevice');
const selectDeviceBtn = document.getElementById('selectDeviceBtn');

const appPanel = document.getElementById('appPanel');
const usernameDisplay = document.getElementById('usernameDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const deviceCards = document.getElementById('deviceCards');
const addDeviceBtn = document.getElementById('addDeviceBtn');

const addDevicePopup = document.getElementById('addDevicePopup');
const closeAddDevice = document.getElementById('closeAddDevice');
const addDeviceForm = document.getElementById('addDeviceForm');

const deviceRadios = document.querySelectorAll('input[name="device"]');

// ---------------- STATE ----------------
let loggedInUser = null; // store full user object

// ---------------- SERVER CHECK ----------------
async function checkServer() {
  try {
    const res = await fetch("http://localhost:3000/ping");
    const data = await res.json();
    console.log("Ping response:", data);
    onlineBtn.disabled = !res.ok;
  } catch (err) {
    console.error("Ping failed:", err);
    onlineBtn.disabled = true;
  }
}
checkServer();
setInterval(checkServer, 5000);

// ---------------- DEVICE RADIO SELECTION ----------------
deviceRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    selectDeviceBtn.disabled = false;
  });
});

// ---------------- ADD DEVICE POPUP ----------------
addDeviceBtn.addEventListener('click', () => {
  addDevicePopup.style.display = 'flex';
  disableScroll();
});
closeAddDevice.addEventListener('click', () => {
  addDevicePopup.style.display = 'none';
  enableScroll();
});
addDevicePopup.addEventListener('click', e => {
  if (e.target === addDevicePopup) {
    addDevicePopup.style.display = 'none';
    enableScroll();
  }
});

// ---------------- ADD INTERFACE ----------------
addDeviceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!loggedInUser) return alert("Please log in with Google first.");

  const formData = new FormData(addDeviceForm);
  const name = formData.get('name');
  const deviceCode = formData.get('Code');
  if (!name || !deviceCode) return alert("Please fill in all fields.");

  try {
    const res = await fetch('http://localhost:3000/api/register_interface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email: loggedInUser.email,
        deviceCode
      })
    });

    const data = await res.json();
    if (!res.ok) return alert(`Error: ${data.reason}`);

    const card = createDeviceCard(data);
    deviceCards.appendChild(card);
    addDevicePopup.style.display = 'none';
    enableScroll();
    addDeviceForm.reset();
  } catch (err) {
    console.error('Device add failed:', err);
    alert(`Error: ${err.message}`);
  }
});

// ---------------- POPUPS ----------------
devicePopup.addEventListener('click', e => {
  if (e.target === devicePopup) {
    devicePopup.style.display = 'none';
    enableScroll();
  }
});

loginPopup.addEventListener('click', e => {
  if (e.target === loginPopup) {
    loginPopup.style.display = 'none';
    enableScroll();
  }
});

offlineBtn.addEventListener('click', () => {
  devicePopup.style.display = 'flex';
  disableScroll();
});
closeDevice.addEventListener('click', () => {
  devicePopup.style.display = 'none';
  enableScroll();
});
onlineBtn.addEventListener('click', () => {
  loginPopup.style.display = 'flex';
  disableScroll();
});
closeLogin.addEventListener('click', () => {
  loginPopup.style.display = 'none';
  enableScroll();
});
loginBtn.addEventListener('click', () => {
  const username = document.getElementById('username').value || "User";
  const password = document.getElementById('password').value;
  window.electronAPI.sendToMain({ username, password });
  loginPopup.style.display = 'none';
  mainPanel.style.display = 'none';
  usernameDisplay.textContent = username;
  appPanel.style.display = 'block';
});

// ---------------- GOOGLE LOGIN ----------------
googleLoginBtn.addEventListener('click', async () => {
  try {
    const user = await window.electronAPI.invoke('google-login');
    loggedInUser = user;

    loginPopup.style.display = 'none';
    mainPanel.style.display = 'none';
    usernameDisplay.textContent = user.name;
    appPanel.style.display = 'block';
    console.log("Logged in user:", loggedInUser);

    loadInterfacesForUser(user.email);
  } catch (err) {
    console.error('Google login failed:', err);
    alert('Google login failed. Please try again.');
  }
});

// ---------------- LOAD INTERFACES ----------------
async function loadInterfacesForUser(email) {
  if (!email) return;
  try {
    const res = await fetch(`http://localhost:3000/interfaces_by_email?email=${encodeURIComponent(email)}`);
    if (!res.ok) return console.error("Failed to fetch interfaces");
    const interfaces = await res.json();
    deviceCards.innerHTML = '';
    interfaces.forEach(i => deviceCards.appendChild(createDeviceCard(i)));
  } catch (err) {
    console.error("Error loading interfaces:", err);
  }
}

// ---------------- CREATE DEVICE CARD ----------------
function createDeviceCard(i) {
  const card = document.createElement('div');
  card.className = 'device-card';

  // ✅ Assign dataset for interfaceId and connectionCode
  card.dataset.deviceId = i.interface_id;
  card.dataset.connectionCode = i.device_code;

  card.innerHTML = `
    <h4 class="device-name">${i.name}</h4>
    <p class="device-code">Code: ${i.device_code}</p>
    <p class="device-type">Type: ${i.type || 'N/A'} / Subnet: ${i.subnet || 'N/A'}</p>
    <div class="device-card-buttons">
      <button class="connect-btn">Connect</button>
      <button class="delete-btn">Delete</button>
    </div>
          <button class="start-btn" disabled>Start</button>

  `;

  // ---------------- INTERFACE SESSION WATCHER ----------------
async function watchInterfaceSessions() {
  try {
    console.log("[WATCH] Checking sessions table...");
    const res = await fetch('http://localhost:3000/admin/sessions'); // your sessions endpoint
    if (!res.ok) {
      console.error("[WATCH] Failed to fetch sessions:", res.status, res.statusText);
      return;
    }

    const sessions = await res.json();
    console.log("[WATCH] Sessions fetched:", sessions);

    const activeInterfaceIds = sessions
      .filter(s => s.interface_id)       // only sessions with interface_id
      .map(s => s.interface_id);

    console.log("[WATCH] Active interface IDs:", activeInterfaceIds);

    // Iterate over all device cards
    const cards = document.querySelectorAll('.device-card');
    cards.forEach(card => {
      const startBtn = card.querySelector('.start-btn');
      const interfaceId = card.dataset.deviceId;

      if (startBtn) {
        if (activeInterfaceIds.includes(interfaceId)) {
          if (startBtn.disabled) {
            console.log(`[WATCH] Enabling start button for interface ${interfaceId}`);
          }
          startBtn.disabled = false; // enable if active
        } else {
          if (!startBtn.disabled) {
            console.log(`[WATCH] Disabling start button for interface ${interfaceId}`);
          }
          startBtn.disabled = true; // disable if not active
        }
      }
    });

  } catch (err) {
    console.error("[WATCH] Error checking interface sessions:", err);
  }
}

// Start polling every 5 seconds
setInterval(watchInterfaceSessions, 5000);


  // --- Connect Button ---
  card.querySelector('.connect-btn').addEventListener('click', async () => {
    const interfaceId = card.dataset.deviceId;
    const connectionCode = card.dataset.connectionCode;

    console.log("Connecting interface:", interfaceId, "with code:", connectionCode);

    try {
      const data = await window.electronAPI.invoke('connect-to-device', { interfaceId, connectionCode });

      if (data.error) {
        alert(`Connection failed: ${data.message}`);
        return;
      }

      const message = `Device type: ${data.deviceType}`;
      console.log(message);

      let msgDiv = card.querySelector('.message');
      if (!msgDiv) {
        msgDiv = document.createElement('div');
        msgDiv.classList.add('message');
        card.appendChild(msgDiv);
      }
      msgDiv.textContent = message;

    } catch (err) {
      console.error('Failed to connect to device:', err);
      alert('Failed to connect to device. See console.');
    }
  });

    card.querySelector('.start-btn').addEventListener('click', () => {
    window.electronAPI.send('open-microscope');
  });

  // --- Delete Button ---
  card.querySelector('.delete-btn').addEventListener('click', async () => {
    if (confirm(`Delete interface ${i.interface_id}?`)) {
      try {
        const res = await fetch(`http://localhost:3000/api/delete_interface/${i.interface_id}`, { method: 'DELETE' });
        const result = await res.json();
        if (res.ok) card.remove();
        else alert(`Failed to delete: ${result.reason}`);
      } catch (err) {
        console.error("Error deleting interface:", err);
        alert("Error deleting interface. See console.");
      }
    }
  });

  

  return card;
}


// ---------------- LOGOUT ----------------
logoutBtn.addEventListener('click', () => {
  appPanel.style.display = 'none';
  mainPanel.style.display = 'block';
  deviceCards.innerHTML = '';
  loggedInUser = null;
});

// ---------------- SCROLL HELPERS ----------------
function disableScroll() { document.body.style.overflow = 'hidden'; }
function enableScroll() { document.body.style.overflow = ''; }
