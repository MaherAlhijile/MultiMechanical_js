import tkinter as tk
from tkinter import messagebox
import requests
import random
import string
import threading
import socketio  # pip install "python-socketio[client]"

# ---------------- Server URLs ----------------
API_URL = "http://localhost:3000/api/register_device"
DEVICES_URL = "http://localhost:3000/admin/devices"
DELETE_URL = "http://localhost:3000/api/delete_device"
SOCKET_URL = "http://localhost:3000"

# ---------------- GUI ----------------
root = tk.Tk()
root.title("Device Debugger")
root.geometry("1000x500")
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
    """Start Socket.IO connection in a separate thread to avoid blocking Tkinter"""
    def run_socket():
        with socket_thread_lock:
            try:
                if not sio.connected:
                    sio.connect(SOCKET_URL)
                    log(f"[SOCKET] Connected to server with socket id {sio.sid}")
                sio.emit("device_connect_to_dispatcher", {"deviceId": device_id})
                log(f"[SOCKET] Device {device_id} registered with server")
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

def fetch_device_info(device_id):
    """Fetch device type and connection_code from server"""
    try:
        res = requests.get(DEVICES_URL, timeout=5)
        if res.status_code == 200:
            devices = res.json()
            for d in devices:
                if d['device_id'] == device_id:
                    return d['type'], d['connection_code']
    except Exception as e:
        log(f"[ERROR] Could not fetch device info: {e}")
    return "unknown", "unknown"

def refresh_connected_list():
    """Refresh the connected devices listbox"""
    connected_listbox.delete(0, tk.END)
    for info in connected_devices.values():
        connected_listbox.insert(tk.END, f"{info['type']} | {info['connection_code']}")

@sio.on("device_connected")
def handle_device_connected(data):
    device_id = data.get("deviceId")
    if device_id and device_id not in connected_devices:
        device_type, connection_code = fetch_device_info(device_id)
        connected_devices[device_id] = {"type": device_type, "connection_code": connection_code}
        refresh_connected_list()
        log(f"[CONNECTED] Device {device_type} ({connection_code}) connected")

@sio.on("device_disconnected")
def handle_device_disconnected(data):
    device_id = data.get("deviceId")
    if device_id and device_id in connected_devices:
        info = connected_devices.pop(device_id)
        refresh_connected_list()
        log(f"[DISCONNECTED] Device {info['type']} ({info['connection_code']}) disconnected")

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
            data = response.json()
            reason = data.get("reason", "Unknown error")
            log(f"[ERROR] {reason}")
            messagebox.showwarning("Registration Error", reason)
        else:
            log(f"[ERROR] {response.status_code}: {response.text}")
            messagebox.showerror("Server Error", response.text)
    except requests.exceptions.RequestException as e:
        log(f"[ERROR] Could not reach server: {e}")
        messagebox.showerror("Connection Error", str(e))

# ---------------- Connect Button ----------------
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
    log(f"[CLIENT] Connecting device {device_id} to server...")

# ---------------- Disconnect Button ----------------
def disconnect():
    try:
        item = connected_listbox.get(connected_listbox.curselection())
    except tk.TclError:
        messagebox.showwarning("Disconnect", "No device selected!")
        return

    for dev_id, info in list(connected_devices.items()):
        if f"{info['type']} | {info['connection_code']}" == item:
            sio.emit("device_disconnect_from_dispatcher", {"deviceId": dev_id})
            connected_devices.pop(dev_id)
            refresh_connected_list()
            log(f"[CLIENT] Disconnected device {info['type']} ({info['connection_code']})")
            break

# ---------------- Left buttons ----------------
tk.Button(left_frame, text="Random", command=random_values).grid(row=len(fields), column=0, pady=5)
tk.Button(left_frame, text="Register", command=register).grid(row=len(fields), column=1, pady=5)
tk.Button(left_frame, text="Connect", command=connect).grid(row=len(fields)+1, column=0, columnspan=2, pady=5)

# ---------------- Right device list ----------------
tk.Label(right_frame, text="Registered Devices").pack()
device_listbox = tk.Listbox(right_frame, width=50)
device_listbox.pack(fill=tk.BOTH, expand=True)

# Connected devices list
tk.Label(right_frame, text="Connected Devices").pack(pady=(20, 0))
connected_listbox = tk.Listbox(right_frame, width=50, bg="#e0f7fa")
connected_listbox.pack(fill=tk.BOTH, expand=True)
tk.Button(right_frame, text="Disconnect Selected Device", command=disconnect, takefocus=0).pack(pady=5)

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
        else:
            log(f"[ERROR] Failed to fetch devices: {res.status_code}")
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
                    for f in ["device_id","type","ip","port","subnet","is_public","connection_code"]:
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
        res = requests.delete(f"{DELETE_URL}/{device_id}")
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

tk.Button(right_frame, text="Delete Selected Device", command=delete_selected_device).pack(pady=5)

# ---------------- Initial setup ----------------
random_values()
load_devices()

root.mainloop()
