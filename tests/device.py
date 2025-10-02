import tkinter as tk
from tkinter import messagebox
import requests
import random
import string
import threading
import socketio
import time

# ---------------- Server URLs ----------------
API_URL = "http://localhost:3000/api/register_device"
DEVICES_URL = "http://localhost:3000/admin/devices"
INTERFACES_URL = "http://localhost:3000/admin/interfaces"
DELETE_URL = "http://localhost:3000/api/delete_device"
SESSIONS_URL = "http://localhost:3000/admin/sessions"
SOCKET_URL = "http://localhost:3000"

# ---------------- GUI ----------------
root = tk.Tk()
root.title("Device Debugger")
root.geometry("1200x500")
root.resizable(False, False)

entries = {}
fields = ["device_id", "type", "ip", "port", "subnet", "is_public", "connection_code"]

left_frame = tk.Frame(root)
left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=10)

right_frame = tk.Frame(root)
right_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=10, pady=10)

# --- Left entries ---
for i, field in enumerate(fields):
    tk.Label(left_frame, text=field).grid(row=i, column=0, sticky="w")
    e = tk.Entry(left_frame, width=25)
    e.grid(row=i, column=1, pady=2)
    entries[field] = e

# --- Log ---
log_text = tk.Text(left_frame, height=15)
log_text.grid(row=len(fields)+3, column=0, columnspan=2, pady=5)
def log(msg):
    log_text.insert(tk.END, msg+"\n")
    log_text.see(tk.END)

# ---------------- Random Values ----------------
def random_values():
    entries['device_id'].delete(0, tk.END)
    entries['device_id'].insert(0, ''.join(random.choices(string.ascii_uppercase+string.digits, k=8)))
    entries['type'].delete(0, tk.END)
    entries['type'].insert(0, random.choice(["microscope","camera","sensor","robotic_arm"]))
    entries['ip'].delete(0, tk.END)
    entries['ip'].insert(0, f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}")
    entries['port'].delete(0, tk.END)
    entries['port'].insert(0, random.randint(1000,9999))
    entries['subnet'].delete(0, tk.END)
    entries['subnet'].insert(0, f"{random.randint(1,255)}.{random.randint(0,255)}.0.0/24")
    entries['is_public'].delete(0, tk.END)
    entries['is_public'].insert(0, random.choice(["True","False"]))
    entries['connection_code'].delete(0, tk.END)
    entries['connection_code'].insert(0, ''.join(random.choices(string.ascii_uppercase+string.digits, k=8)))

# ---------------- Socket.IO Client ----------------
sio = socketio.Client()
connected_devices = {}  # deviceId -> {type, connection_code}
socket_thread_lock = threading.Lock()

def start_socket_thread(device_id):
    """Connect via Socket.IO and register device session"""
    def run_socket():
        with socket_thread_lock:
            try:
                if not sio.connected:
                    sio.connect(SOCKET_URL)
                    log(f"[SOCKET] Connected to server with socket id {sio.sid}")

                # Register session
                try:
                    res = requests.post(f"{SOCKET_URL}/api/register_device_session",
                                        json={"deviceId": device_id, "socketId": sio.sid}, timeout=5)
                    if res.ok:
                        log(f"[SERVER] Device session created for {device_id}")
                    else:
                        log(f"[SERVER ERROR] Could not create session: {res.text}")
                except Exception as e:
                    log(f"[ERROR] Registering session failed: {e}")

                sio.emit("device_connect_to_dispatcher", {"deviceId": device_id})
                log(f"[SOCKET] Device {device_id} connected to server")
            except Exception as e:
                log(f"[SOCKET ERROR] {e}")

    threading.Thread(target=run_socket, daemon=True).start()

@sio.event
def connect():
    log(f"[SOCKET EVENT] Connected to server: {sio.sid}")

@sio.event
def disconnect():
    log(f"[SOCKET EVENT] Disconnected from server")

@sio.on("message_from_device")
def handle_device_message(data):
    log(f"[DEVICE MESSAGE] {data.get('message')}")

# ---------------- Refresh connected devices and interfaces ----------------
def refresh_sessions():
    while True:
        try:
            res = requests.get(SESSIONS_URL, timeout=5)
            if res.ok:
                sessions = res.json()
                new_connected_devices = {}
                new_connected_interfaces = []
                refresh_sessions.current_interfaces = []  # store for disconnect

                # Fetch devices and interfaces
                try:
                    devices_res = requests.get(DEVICES_URL, timeout=5)
                    interfaces_res = requests.get(INTERFACES_URL, timeout=5)
                    if devices_res.status_code == 200:
                        devices_list = devices_res.json()
                        devices_map = {d['device_id']: d for d in devices_list}
                    else:
                        devices_map = {}
                    if interfaces_res.status_code == 200:
                        interfaces_list = interfaces_res.json()
                        interfaces_map = {i['interface_id']: i for i in interfaces_list}
                    else:
                        interfaces_map = {}
                except Exception as e:
                    log(f"[ERROR] Fetching devices/interfaces failed: {e}")
                    devices_map = {}
                    interfaces_map = {}

                for s in sessions:
                    device_id = s.get('device_id')
                    interface_id = s.get('interface_id')

                    if not device_id:
                        continue

                    device = devices_map.get(device_id, {"type": "unknown", "connection_code": "unknown"})
                    new_connected_devices[device_id] = {
                        "type": device.get("type", "unknown"),
                        "connection_code": device.get("connection_code", "unknown")
                    }

                    if interface_id:
                        interface = interfaces_map.get(interface_id, {"name": "unknown"})
                        # Show connection code + interface ID
                        display_text = f"{device.get('connection_code')} | {interface_id}"
                        new_connected_interfaces.append(display_text)
                        # Keep for disconnect reference
                        refresh_sessions.current_interfaces.append({
                            "interface_id": interface_id,
                            "device_connection_code": device.get("connection_code")
                        })

                # Update UI
                connected_listbox.delete(0, tk.END)
                for info in new_connected_devices.values():
                    connected_listbox.insert(tk.END, f"{info['type']} | {info['connection_code']}")

                connected_interfaces_listbox.delete(0, tk.END)
                for entry in new_connected_interfaces:
                    connected_interfaces_listbox.insert(tk.END, entry)

                # Update internal dict
                connected_devices.clear()
                connected_devices.update(new_connected_devices)
            else:
                log(f"[ERROR] Could not fetch sessions: {res.status_code}")
        except Exception as e:
            log(f"[ERROR] Failed to fetch sessions: {e}")
        time.sleep(5)

# ---------------- Register Device ----------------
def register():
    payload = {
        "type": entries['type'].get(),
        "ip": entries['ip'].get(),
        "port": int(entries['port'].get()),
        "subnet": entries['subnet'].get(),
        "is_public": entries['is_public'].get()
    }
    try:
        response = requests.post(API_URL, json=payload, timeout=5)
        if response.status_code == 200:
            data = response.json()
            entries['connection_code'].delete(0, tk.END)
            entries['connection_code'].insert(0, data['connection_code'])
            log(f"[REGISTERED] Type: {data['type']} | Code: {data['connection_code']}")
            load_devices()
        elif response.status_code == 400:
            reason = response.json().get("reason", "Unknown error")
            log(f"[ERROR] {reason}")
            messagebox.showwarning("Registration Error", reason)
        else:
            log(f"[ERROR] {response.status_code}: {response.text}")
            messagebox.showerror("Server Error", response.text)
    except Exception as e:
        log(f"[ERROR] Could not reach server: {e}")
        messagebox.showerror("Connection Error", str(e))

# ---------------- Connect/Disconnect ----------------
def connect():
    sel = device_listbox.curselection()
    if not sel:
        messagebox.showwarning("Connect", "No device selected!")
        return
    index = sel[0]
    device_text = device_listbox.get(index)
    connection_code = device_text.split('|')[0].strip()
    device_id = devices_by_code.get(connection_code)
    if not device_id:
        messagebox.showerror("Connect", "Device ID not found!")
        return
    start_socket_thread(device_id)

def disconnect():
    try:
        sel_index = connected_listbox.curselection()[0]
        item = connected_listbox.get(sel_index)
    except IndexError:
        messagebox.showwarning("Disconnect", "No device selected!")
        return

    for dev_id, info in list(connected_devices.items()):
        if f"{info['type']} | {info['connection_code']}" == item:
            try:
                sio.emit("device_disconnect_from_dispatcher", {"deviceId": dev_id})
                log(f"[SOCKET] Sent disconnect for device {dev_id}")
            except Exception as e:
                log(f"[ERROR] Socket disconnect failed: {e}")

            try:
                res = requests.delete(f"{SOCKET_URL}/api/sessions/{dev_id}", timeout=5)
                if res.ok:
                    log(f"[SERVER] Session removed for device {dev_id}")
                else:
                    log(f"[SERVER ERROR] Could not remove session: {res.text}")
            except Exception as e:
                log(f"[ERROR] Could not remove session via API: {e}")

            connected_devices.pop(dev_id)
            connected_listbox.delete(sel_index)
            log(f"[CLIENT] Disconnected device {info['type']} ({info['connection_code']})")
            break

# ---------------- Left Buttons ----------------
# ---------------- Left Buttons ----------------
tk.Button(left_frame, text="Random", command=random_values).grid(row=len(fields), column=0, pady=5)
tk.Button(left_frame, text="Register", command=register).grid(row=len(fields), column=1, pady=5)
tk.Button(left_frame, text="Connect", command=connect).grid(row=len(fields)+1, column=0, columnspan=2, pady=5)

# ---------------- Right device & interface list ----------------
right_top_frame = tk.Frame(right_frame)
right_top_frame.pack(fill=tk.BOTH, expand=True)

# Registered Devices
tk.Label(right_top_frame, text="Registered Devices").grid(row=0, column=0, sticky="w")
device_listbox = tk.Listbox(right_top_frame, width=40)
device_listbox.grid(row=1, column=0, sticky="nsew", padx=5, pady=5)
tk.Button(right_top_frame, text="Delete Selected Device", command=lambda: delete_selected_device(), width=20).grid(row=2, column=0, pady=5)

# Connected Devices
tk.Label(right_top_frame, text="Connected Devices").grid(row=0, column=1, sticky="w")
connected_listbox = tk.Listbox(right_top_frame, width=40, bg="#e0f7fa")
connected_listbox.grid(row=1, column=1, sticky="nsew", padx=5, pady=5)
tk.Button(right_top_frame, text="Disconnect Selected Device", command=disconnect, width=25).grid(row=2, column=1, pady=5)

# Connected Interfaces
tk.Label(right_top_frame, text="Connected Interfaces").grid(row=0, column=2, sticky="w")
connected_interfaces_listbox = tk.Listbox(right_top_frame, width=40, bg="#f0e0ff")
connected_interfaces_listbox.grid(row=1, column=2, sticky="nsew", padx=5, pady=5)

def disconnect_interface():
    sel = connected_interfaces_listbox.curselection()
    if not sel:
        messagebox.showwarning("Disconnect Interface", "No interface selected!")
        return
    index = sel[0]
    entry_text = connected_interfaces_listbox.get(index)
    
    # Assuming format "DeviceCode | InterfaceID"
    try:
        device_code, interface_id = entry_text.split('|')
        device_code = device_code.strip()
        interface_id = interface_id.strip()
    except ValueError:
        messagebox.showerror("Error", "Invalid format in interfaces list")
        return

    # Find the corresponding deviceId from connected_devices (you maintain device_code -> deviceId)
    deviceId = None
    for dev_id, info in connected_devices.items():
        if info['connection_code'] == device_code:
            deviceId = dev_id
            break

    if not deviceId:
        messagebox.showerror("Error", f"Device not found for code {device_code}")
        return

    try:
        sio.emit("interface_disconnect_from_dispatcher", {"interfaceId": interface_id})
        log(f"[SOCKET] Sent disconnect for interface {interface_id}")
        connected_interfaces_listbox.delete(index)
    except Exception as e:
        log(f"[ERROR] Socket disconnect failed: {e}")
        messagebox.showerror("Error", str(e))



tk.Button(right_top_frame, text="Disconnect Selected Interface", command=disconnect_interface, width=25).grid(row=2, column=2, pady=5)

# Make columns expand evenly
right_top_frame.grid_columnconfigure(0, weight=1)
right_top_frame.grid_columnconfigure(1, weight=1)
right_top_frame.grid_columnconfigure(2, weight=1)

# ---------------- Device Mapping ----------------
devices_by_code = {}

def load_devices():
    global devices_by_code
    try:
        res = requests.get(DEVICES_URL, timeout=5)
        if res.status_code == 200:
            devices = res.json()
            device_listbox.delete(0, tk.END)
            devices_by_code = {}
            for d in devices:
                device_listbox.insert(tk.END, f"{d['connection_code']} | {d['type']}")
                devices_by_code[d['connection_code']] = d['device_id']
            log(f"[INFO] Loaded {len(devices)} devices")
    except Exception as e:
        log(f"[ERROR] Could not fetch devices: {e}")

def fill_from_selection(event):
    sel = device_listbox.curselection()
    if not sel: return
    index = sel[0]
    device_text = device_listbox.get(index)
    connection_code = device_text.split('|')[0].strip()
    try:
        device_id = devices_by_code.get(connection_code)
        if device_id:
            res = requests.get(DEVICES_URL, timeout=5)
            if res.status_code == 200:
                devices = res.json()
                device = next((d for d in devices if d['connection_code']==connection_code), None)
                if device:
                    for f in fields:
                        entries[f].delete(0, tk.END)
                        entries[f].insert(0, str(device.get(f, "")))
    except Exception as e:
        log(f"[ERROR] Could not fill device: {e}")

device_listbox.bind("<<ListboxSelect>>", fill_from_selection)

# ---------------- Delete selected device ----------------
def delete_selected_device():
    sel = device_listbox.curselection()
    if not sel:
        messagebox.showwarning("Delete Device", "No device selected!")
        return
    index = sel[0]
    device_text = device_listbox.get(index)
    connection_code = device_text.split('|')[0].strip()
    device_id = devices_by_code.get(connection_code)
    if not device_id:
        messagebox.showerror("Delete Device", "Device ID not found!")
        return
    try:
        res = requests.delete(f"{DELETE_URL}/{device_id}", timeout=5)
        data = res.json()
        if res.ok:
            messagebox.showinfo("Deleted", f"Device {connection_code} deleted successfully")
            load_devices()
            for f in entries:
                entries[f].delete(0, tk.END)
        else:
            messagebox.showerror("Error", data.get("reason","Unknown error"))
    except Exception as e:
        messagebox.showerror("Error", str(e))

# ---------------- Initial setup ----------------
random_values()
load_devices()

# Start background thread to poll sessions table
threading.Thread(target=refresh_sessions, daemon=True).start()

root.mainloop()
