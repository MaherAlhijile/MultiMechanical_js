import requests
import random
import uuid

# -----------------------------
# Configuration
# -----------------------------
API_URL = "http://localhost:3000/api"
ADMIN_URL = "http://localhost:3000/admin"

# Sample names and email domains to generate random interfaces
first_names = ["Alice", "Bob", "Charlie", "Dana", "Eve", "Frank"]
last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller"]
domains = ["example.com", "mail.com", "test.org"]

# -----------------------------
# Helper functions
# -----------------------------
def generate_random_name_email():
    first = random.choice(first_names)
    last = random.choice(last_names)
    name = f"{first} {last}"
    email = f"{first.lower()}.{last.lower()}{random.randint(1,999)}@{random.choice(domains)}"
    return name, email

def get_devices():
    """Fetch all registered devices from the dispatcher."""
    try:
        res = requests.get(f"{ADMIN_URL}/devices")
        res.raise_for_status()
        return res.json()
    except Exception as e:
        print("Error fetching devices:", e)
        return []

def create_interface(name, email, device_code):
    """Register a new interface via the API."""
    payload = {
        "name": name,
        "email": email,
        "deviceCode": device_code
    }
    try:
        res = requests.post(f"{API_URL}/register_interface", json=payload)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        print("Error creating interface:", e)
        return None

# -----------------------------
# Main logic
# -----------------------------
def main():
    devices = get_devices()
    if not devices:
        print("No devices found. Please register some devices first.")
        return

    # Generate random interface
    name, email = generate_random_name_email()

    # Pick a random device
    device = random.choice(devices)
    device_code = device["connection_code"]

    # Register interface
    result = create_interface(name, email, device_code)
    if result:
        print(f"Interface created successfully: {result}")
    else:
        print("Failed to create interface.")

if __name__ == "__main__":
    main()
