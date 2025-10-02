
document.getElementById("openCam").addEventListener("click", (e) => { e.preventDefault(); initializeCamera(); });
document.getElementById("setExposureBtn").addEventListener("click", (e) => { e.preventDefault(); setExposure(); });
document.getElementById("captureImageBtn").addEventListener("click", (e) => { e.preventDefault(); captureImage(); });
document.getElementById("stopCam").addEventListener("click", (e) => { e.preventDefault(); stopCamera(); });


async function initializeCamera() {
    try {
        const res = await fetch(`http://192.168.1.60:8000/start_camera`);
        const data = await res.json();
        if (data.error) {
            alert("Failed to start camera: " + data.error);
        } else {
            document.getElementById("cameraStream").src = `http://192.168.1.60:8000/camera_feed`;

        }
    } catch (err) {
        alert("Error connecting to server: " + err.message);
    }
}


async function setExposure() {
    const exposureValue = document.getElementById("exposureInput").value;
    try {
        const res = await fetch(`http://192.168.1.60:8000/set_exposure`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ exposure: parseFloat(exposureValue) })
        });
        const data = await res.json();
        if (data.success) {
            alert("Exposure set to " + exposureValue + " μs");
        } else {
            alert("Failed to set exposure.");
        }
    } catch (error) {
        console.error("Exposure Error:", error);
        alert("Error setting exposure: " + error.message);
    }
}



async function captureImage() {
    const type = document.getElementById("captureType").value; // "object" or "reference"
    try {
        const res = await fetch(`http://192.168.1.60:8000/capture_image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: type })
        });
        const data = await res.json();
        if (data.success_ref) {
            alert(`Captured and set image as ${type}`);
            refCaptured = true
        }
        else if (data.success_img) {
            alert(`Captured and set image as ${type}`);
            imageCaptured = true
        }
        else {
            alert("Capture failed");
        }
    } catch (error) {
        console.error("Capture Error:", error);
        alert("Error capturing image: " + error.message);
    }
}

async function stopCamera() {
    try {
        refreshConnectionParams();
        document.getElementById("cameraStream").src = "";  // Stop image
        await fetch(`http://192.168.1.60:8000/stop_camera`);
    } catch (error) {
        console.error("Failed to stop camera on backend:", error);
    }
}
