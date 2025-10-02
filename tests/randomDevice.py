import requests
import random
import string

# -----------------------------
# Configuration
# -----------------------------
BROKER_URL = "http://localhost:3000"  # replace with your broker URL
REGISTER_ENDPOINT = f"{BROKER_URL}/api/register_device"

DEVICE_TYPES = ["microscope", "camera", "sensor", "robotic_arm"]

# -----------------------------
# Helper functions
# -----------------------------
def random_ip():
    return f"{random.randint(1, 255)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"

def random_subnet():
    return f"{random.randint(1, 255)}.{random.randint(0, 255)}.0.0/24"

def random_port():
    return random.randint(1000, 9999)

def random_type():
    return random.choice(DEVICE_TYPES)

def random_name(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

# -----------------------------
# Main function to add a device
# -----------------------------
def add_device():
    payload = {
        "type": random_type(),
        "ip": random_ip(),
        "port": random_port(),
        "subnet": random_subnet(),
        "public": False,
    }

    try:
        response = requests.post(REGISTER_ENDPOINT, json=payload, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"[SUCCESS] Device added: ID={data['deviceId']}, Code={data['connectionCode']}")
        else:
            print(f"[FAILURE] Status {response.status_code}: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Could not connect to broker: {e}")

# -----------------------------
# Command-line interface
# -----------------------------
def main():
    print("Random Device Adder (isolated, via API)")
    print("Press ENTER to add a new device or type 'exit' to quit.")
    while True:
        cmd = input("> ")
        if cmd.strip().lower() == "exit":
            break
        add_device()

if __name__ == "__main__":
    main()
