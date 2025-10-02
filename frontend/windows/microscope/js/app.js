let image = {
    psi: null,
    roi: null
};


let point1 = null;
let point2 = null;
let imageCaptured = null
let refCaptured = null
let stream = null;
// Auto-detect backend from the page URL; allow user override from localStorage
let apiBase = localStorage.getItem("apiBase") || `${window.location.protocol}//${window.location.host}`;


document.addEventListener("DOMContentLoaded", function () {

    const video = document.getElementById("video");
    const padStatus = document.getElementById("pad-status");

    let selectingROI = false;
    let startX, startY, endX, endY;

    const roiCanvas = document.getElementById("roiCanvas");
    const ctx = roiCanvas.getContext("2d");
    const phaseImage = document.getElementById("phaseImage");


    document.getElementById("openCam").addEventListener("click", (e) => { e.preventDefault(); initializeCamera(); });
    document.getElementById("setExposureBtn").addEventListener("click", (e) => { e.preventDefault(); setExposure(); });
    document.getElementById("captureImageBtn").addEventListener("click", (e) => { e.preventDefault(); captureImage(); });
    document.getElementById("stopCam").addEventListener("click", (e) => { e.preventDefault(); stopCamera(); });

    document.getElementById("imageFile").addEventListener("change", () => console.log("Object image selected"));
    document.getElementById("refFile").addEventListener("change", () => console.log("Reference image selected"));
    document.getElementById("1dbtn").addEventListener("click", (e) => { e.preventDefault(); startPointsSelection() });

    document.getElementById("phaseDiff").addEventListener("click", (e) => { e.preventDefault(); sendParams(); });
    document.getElementById("selectRoiBtn").addEventListener("click", startROISelection);
    document.getElementById("3dbtn").addEventListener("click", fetch3DPlot);
    document.getElementById("checkSpectrum").addEventListener("click", fetchSpectrum);

    document.getElementById("runAll").addEventListener("click", () => alert("Run All sequence started"));
    document.getElementById("2dbtn").addEventListener("click", () => alert("2dbtn clicked"));
    document.getElementById('mainGallery').addEventListener('click', () => {
        const details = document.getElementById('outputImages');
        details.style.display = (details.style.display === 'flex') ? 'none' : 'flex';
    });

    applyApiBaseToUI();
    document.getElementById("ipAddress")?.addEventListener("change", setApiBaseFromInputs);
    document.getElementById("port")?.addEventListener("change", setApiBaseFromInputs);
});

//setting IP Address
function applyApiBaseToUI() {
  try {
    const url = new URL(apiBase);
    const ipEl = document.getElementById("ipAddress");
    const portEl = document.getElementById("port");
    if (ipEl)  ipEl.value  = url.hostname || "";
    if (portEl) portEl.value = url.port || "8080"; //  usual default 
  } catch {}
}

function setApiBaseFromInputs() {
  const ipEl = document.getElementById("ipAddress");
  const portEl = document.getElementById("port");
  const ip = (ipEl?.value || "").trim();
  const port = (portEl?.value || "").trim(); // empty means default port
  if (!ip) return; // don’t change if blank
  apiBase = port ? `http://${ip}:${port}` : `http://${ip}`;
  localStorage.setItem("apiBase", apiBase);

  // Refresh live stream if open
  const stream = document.getElementById("cameraStream");
  if (stream) stream.src = `${apiBase}/camera_feed`;
}



//Motors

async function move_motor(motor_number, steps, latency_ms, direction) {
    try {
        const response = await fetch(`${apiBase}/move_motor_endpoint`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({motor_number, steps, latency_ms, direction })
        });
        const data = await response.json();
        if (data.error) {
            alert(data.error);
        } else {


        }
    } catch (error) {
        console.error("Error selecting ROI:", error);
        alert("Error selecting ROI: " + error.message);
    }
}



document.getElementById("top").addEventListener("click", () => {
    console.log("Up button clicked");

});

document.getElementById("bottom").addEventListener("click", () => {
    console.log("Down button clicked");
});

document.getElementById("left").addEventListener("click", () => {
    console.log("Left button clicked");
});

document.getElementById("right").addEventListener("click", () => {
    console.log("Right button clicked");
});


document.getElementById("center").addEventListener("click", () => {
    console.log("Home button clicked");

});

// Directional pad logic
const quads = document.querySelectorAll(".quad");
const center = document.querySelector(".center");

function highlight(dir) {
    quads.forEach(q => q.classList.toggle("active", q.dataset.dir === dir));
}

quads.forEach(q => {
    q.addEventListener("click", () => {
        const d = q.dataset.dir;
        padStatus.textContent = `Direction: ${d}`;
        highlight(d);
        // TODO: send command to backend or move stage
        console.log("Clicked", d);
    });
});

center.addEventListener("click", () => {
    padStatus.textContent = "Home";
    highlight(null);
    console.log("Home pressed");
});

//ROI Selection

function startProcessingOverlay() {
    const overlay = document.getElementById("processingOverlay");
    const dots = document.getElementById("dots");
    overlay.style.display = "flex";

    let count = 0;
    window.processingInterval = setInterval(() => {
        count = (count + 1) % 4; // cycle 0-3
        dots.textContent = ".".repeat(count);
    }, 500); // change every 0.5s
}

function stopProcessingOverlay() {
    const overlay = document.getElementById("processingOverlay");
    overlay.style.display = "none";
    clearInterval(window.processingInterval);
    document.getElementById("dots").textContent = "";
}


function startROISelection() {
    if (!image.psi) {
        alert("No phase difference image available.");
        return;
    }

    const popup = window.open('', 'ImagePopup', 'width=800,height=600');
    popup.document.write(`
            <html>
            <head>
            <title>Select ROI</title>
            <style>
                body { margin: 0; }
                canvas { display: block; cursor: crosshair; }
            </style>
            </head>
            <body>
            <canvas id="canvas"></canvas>
            <script>
                const canvas = document.getElementById('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                img.src = "data:image/png;base64,${image.psi}";
                
                let startX, startY, endX, endY, drawing = false;

                img.onload = function() {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                };

                canvas.addEventListener('mousedown', e => {
                const rect = canvas.getBoundingClientRect();
                startX = e.clientX - rect.left;
                startY = e.clientY - rect.top;
                drawing = true;
                });

                canvas.addEventListener('mousemove', e => {
                if (!drawing) return;
                const rect = canvas.getBoundingClientRect();
                endX = e.clientX - rect.left;
                endY = e.clientY - rect.top;
                ctx.drawImage(img, 0, 0);
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 2;
                ctx.strokeRect(startX, startY, endX - startX, endY - startY);
                });

                canvas.addEventListener('mouseup', e => {
                drawing = false;
                const rect = canvas.getBoundingClientRect();
                endX = e.clientX - rect.left;
                endY = e.clientY - rect.top;
                const coords = {
                    x1: Math.round(Math.min(startX, endX)),
                    y1: Math.round(Math.min(startY, endY)),
                    x2: Math.round(Math.max(startX, endX)),
                    y2: Math.round(Math.max(startY, endY))
                };
                window.opener.receiveROI(coords);
                setTimeout(() => window.close(), 500);
                });
            <\/script>
            </body>
            </html>
            `);
}

function receiveROI(coords) {
    console.log("Selected ROI:", coords);
    selectROI(coords.x1, coords.y1, coords.x2, coords.y2);
}

async function selectROI(x1, y1, x2, y2) {
    try {
        const response = await fetch(`${apiBase}/select_roi`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x1, y1, x2, y2 })
        });
        const data = await response.json();
        if (data.error) {
            alert(data.error);
        } else {
            // Store the ROI image for display or selection
            image.roi = data.roi_image;

            // Optional: display the ROI image
            document.getElementById("roiOutput").innerHTML = `
              <img src="data:image/png;base64,${data.roi_image}" style="max-width:100%; border:1px solid #ccc;">
            `;

        }
    } catch (error) {
        console.error("Error selecting ROI:", error);
        alert("Error selecting ROI: " + error.message);
    }
}

const toggleBtn = document.getElementById('toggleBtn');
const slideDiv = document.getElementById('slideDiv');

toggleBtn.addEventListener('click', () => {
    slideDiv.classList.toggle('active');
});



// send parameters to backend
async function sendParams() {

    const formData = new FormData();
    formData.append("wavelength", document.getElementById("wavelength").value);
    formData.append("pixel_size", document.getElementById("pixelSize").value);
    formData.append("magnification", document.getElementById("magnification").value);
    formData.append("delta_ri", document.getElementById("ri").value);
    formData.append("dc_remove", document.getElementById("skipPixels").value);
    formData.append("filter_type", document.getElementById("filterType").value);
    formData.append("filter_size", document.getElementById("filterSize").value);
    formData.append("beam_type", document.getElementById("beams").value);
    formData.append("threshold_strength", "1.0");

    const imageFile = document.getElementById("imageFile").files[0];
    const refFile = document.getElementById("refFile").files[0];
    if ((!imageFile && !refFile) && (!imageCaptured && !refCaptured)) {
        alert("Please select both image and reference files or capture via the live camera");
        return;
    }
    if (!imageFile && !imageCaptured) {
        alert("You only have a refference. Please select an image file or capture image via the live camera");
        return;
    }

    if (!refFile && !refCaptured) {
        alert("You only have an image. Please select a refference file or capture a refference via the live camera");
        return;
    }

    if (refFile && !imageFile) {
        alert("You only have a refference file uploaded. Please select an image file.");
        return;
    }

    if (!refFile && imageFile) {
        alert("You only have an image file uploaded. Please select a refference file");
        return
    }

    if (imageFile) {
        formData.append("image", imageFile);
    }

    if (refFile) {
        formData.append("reference", refFile);
    }



    try {
        const response = await fetch(`${apiBase}/run_phase_difference`, {
            method: "POST",
            body: formData
        });
        if (!response.ok) throw new Error("Server error " + response.status);

        const data = await response.json();

        // Inject the phase difference image into #phaseOutput
        const phaseOutputBox = document.getElementById("phaseOutput");
        phaseOutputBox.innerHTML = `<div id="plotImage" style="width:100%; height:100%;"></div>`;

        Plotly.newPlot('plotImage', [], {
            images: [{
                source: "data:image/png;base64," + data.phase_image,
                x: 0,
                y: 0,
                sizex: 1,
                sizey: 1,
                xref: "x",
                yref: "y",
                sizing: "stretch",
                layer: "below"
            }],
            xaxis: {
                showgrid: false,
                zeroline: false,
                visible: false,
                constrain: "domain",
                range: [0, 1],
                autorange: false,
                fixedrange: false
            },
            yaxis: {
                showgrid: false,
                zeroline: false,
                visible: false,
                scaleanchor: "x",
                range: [1, 0], // flipped axis
                autorange: false,
                fixedrange: false
            },
            margin: { l: 0, r: 0, t: 0, b: 0 }
        }, {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: [],
            modeBarButtonsToAdd: [],
            scrollZoom: true
        });


        // Optional: log details
        console.log("Phase shape:", data.shape);
        console.log("Phase range:", data.min, "to", data.max);
        image.psi = data.phase_image;

    } catch (error) {
        console.error("Error:", error);
        alert("Error: " + error.message);
        stopProcessingOverlay()
    } finally {
        // Hide overlay when done (success or error)
        stopProcessingOverlay()
    }
}



//recieves information returned from backend after 3d computation
async function fetch3DPlot() {
    try {
        const response = await fetch(`${apiBase}/compute_3d`);
        const data = await response.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        const output3D = document.getElementById("output3D");
        output3D.innerHTML = `<div id="plot3d" style="width:100%; height:100%;"></div>`;

        Plotly.newPlot('plot3d', [{
            type: 'surface',
            x: data.x,
            y: data.y,
            z: data.z,
            colorscale: 'Jet'
        }], {
            scene: {
                xaxis: { title: 'X (μm)' },
                yaxis: { title: 'Y (μm)' },
                zaxis: { title: 'Thickness (μm)' }
            },
            margin: { l: 0, r: 0, b: 0, t: 0 }
        });
    } catch (error) {
        console.error("Error:", error);
        alert("Error: " + error.message);
        stopProcessingOverlay()
    } finally {
        // Hide overlay when done (success or error)
        stopProcessingOverlay()
    }
}


//1d profile

function startPointsSelection() {
    if (!image.roi && !image.psi) {
        alert("Please compute the phase difference first.");
        return;
    }

    else if (image.roi != null)
        selectPoints(image.roi);

    else
        selectPoints(image.psi);

}
function selectPoints(psi) {
    if (!psi) {
        alert("No phase image available. Please run phase difference first.");
        return;
    }

    const popup = window.open('', 'ImagePopup', 'width=800,height=600');
    popup.document.write(`
    <html>
    <head>
      <title>Select Points</title>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        canvas {
          display: block;
          width: 100vw;
          height: 100vh;
          cursor: crosshair;
        }
        #pixel-tooltip {
          position: fixed;
          background: rgba(0,0,0,0.7);
          color: white;
          padding: 4px 8px;
          font-family: monospace;
          font-size: 12px;
          border-radius: 4px;
          pointer-events: none;
          z-index: 1000;
        }
      </style>
    </head>
    <body>
      <canvas id="canvas"></canvas>
      <div id="pixel-tooltip"></div>
      <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = "data:image/png;base64,${psi}";

        let points = [];

        let imageWidth, imageHeight;

        function resizeCanvas() {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          if (img.complete) {
            drawScaledImage();
          }
        }

        function drawScaledImage() {
          const scale = Math.min(canvas.width / imageWidth, canvas.height / imageHeight);
          const drawWidth = imageWidth * scale;
          const drawHeight = imageHeight * scale;
          const offsetX = (canvas.width - drawWidth) / 2;
          const offsetY = (canvas.height - drawHeight) / 2;

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

          // Re-draw points and lines
          ctx.fillStyle = 'red';
          points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.canvasX, p.canvasY, 5, 0, 2 * Math.PI);
            ctx.fill();
          });

          if (points.length === 2) {
            ctx.beginPath();
            ctx.moveTo(points[0].canvasX, points[0].canvasY);
            ctx.lineTo(points[1].canvasX, points[1].canvasY);
            ctx.strokeStyle = 'blue';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }

        img.onload = function() {
          imageWidth = img.width;
          imageHeight = img.height;
          resizeCanvas();
        };

        window.addEventListener('resize', resizeCanvas);

        canvas.addEventListener('click', function(event) {
          const rect = canvas.getBoundingClientRect();
          const scale = Math.min(canvas.width / imageWidth, canvas.height / imageHeight);
          const offsetX = (canvas.width - imageWidth * scale) / 2;
          const offsetY = (canvas.height - imageHeight * scale) / 2;

          const x = (event.clientX - rect.left - offsetX) / scale;
          const y = (event.clientY - rect.top - offsetY) / scale;

          const canvasX = event.clientX - rect.left;
          const canvasY = event.clientY - rect.top;

          points.push({ x, y, canvasX, canvasY });

          drawScaledImage();

          if (points.length === 2) {
            window.opener.receivePoints(points[0], points[1]);
            setTimeout(() => window.close(), 1000);
          }
        });

        canvas.addEventListener('mousemove', function(event) {
          const rect = canvas.getBoundingClientRect();
          const scale = Math.min(canvas.width / imageWidth, canvas.height / imageHeight);
          const offsetX = (canvas.width - imageWidth * scale) / 2;
          const offsetY = (canvas.height - imageHeight * scale) / 2;

          const x = Math.floor((event.clientX - rect.left - offsetX) / scale);
          const y = Math.floor((event.clientY - rect.top - offsetY) / scale);

          const tooltip = document.getElementById('pixel-tooltip');

          if (x >= 0 && x < imageWidth && y >= 0 && y < imageHeight) {
            const pixel = ctx.getImageData(event.clientX - rect.left, event.clientY - rect.top, 1, 1).data;
            const [r, g, b, a] = pixel;
            tooltip.textContent = \`(\${x}, \${y}): R=\${r} G=\${g} B=\${b} A=\${a}\`;
            tooltip.style.left = \`\${event.clientX + 10}px\`;
            tooltip.style.top = \`\${event.clientY + 10}px\`;
          } else {
            tooltip.textContent = '';
          }
        });

        canvas.addEventListener('mouseleave', () => {
          document.getElementById('pixel-tooltip').textContent = '';
        });
      <\/script>
    </body>
    </html>
  `);
}


function receivePoints(p1, p2) {
    point1 = p1;
    point2 = p2;
    console.log('Selected points:', point1, point2);
    fetch1DPlot();  // Call after user selects points
}

async function fetch1DPlot() {
    if (!point1 || !point2) {
        alert("Please select two points on the image.");
        return;
    }

    const x1 = Math.round(point1.x);
    const y1 = Math.round(point1.y);
    const x2 = Math.round(point2.x);
    const y2 = Math.round(point2.y);

    try {
        const response = await fetch(`${apiBase}/compute_1d`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ x1, y1, x2, y2 })
        });

        // recieve thickness and distance to plot
        const data = await response.json();
        if (data.error) {
            alert(data.error);
            return;
        }

        const output1D = document.getElementById("output1D");

        // Ensure parent has height via CSS (see below)
        output1D.innerHTML = `
  <div id="plot1d" style="width:100%; height:100%;"></div>
`;

        // Create the plot
        Plotly.newPlot("plot1d", [{
            x: data.x,
            y: data.y,
            mode: 'lines',
            type: 'scatter',
            line: { color: 'blue' }
        }], {
            xaxis: { title: "Distance (μm)" },
            yaxis: { title: "Thickness (μm)" },
            margin: { l: 40, r: 10, b: 40, t: 10 }
        }, {
            responsive: true
        });

    } catch (error) {
        console.error("1D Error:", error);
        alert("Failed to generate 1D plot");
        stopProcessingOverlay()
    } finally {
        // Hide overlay when done (success or error)
        stopProcessingOverlay()
    }
}






document.getElementById('mainGallery').addEventListener('click', () => {
    const details = document.getElementById('outputImages');
    if (details.style.display === 'flex') {
        details.style.display = 'none';
    } else {
        details.style.display = 'flex';
    }
});


const rightPanel = document.querySelector('.right');

toggleCamera.addEventListener('click', () => {
    rightPanel.style.display = 'flex';
});

//camera
async function initializeCamera() {
    try {
        const res = await fetch(`${apiBase}/start_camera`);
        const data = await res.json();
        if (data.error) {
            alert("Failed to start camera: " + data.error);
        } else {
            document.getElementById("cameraStream").src = `${apiBase}/camera_feed`;

        }
    } catch (err) {
        alert("Error connecting to server: " + err.message);
    }
}


async function setExposure() {
    const exposureValue = document.getElementById("exposureInput").value;
    try {
        const res = await fetch(`${apiBase}/set_exposure`, {
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
        const res = await fetch(`${apiBase}/capture_image`, {
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
        await fetch(`${apiBase}/stop_camera`);
    } catch (error) {
        console.error("Failed to stop camera on backend:", error);
    }
}

// chech spectrum removed
async function fetchSpectrum() {
    try {
        const response = await fetch(`${apiBase}/check_spectrum`);
        const data = await response.json();
        if (data.error) {
            alert(data.error);
            return;
        }

        alert(data.imageArray_shiftft, data.mask_bool, data.max_y, data.max_x)
        const spectrumOutput = document.getElementById("spectrumOutput")
        spectrumOutput.innerHTML = `<div id="spectrumOutput" style="width:100%; height:100%;"></div>`;

    } catch (error) {
        console.error("Error:", error);
        alert("Error: " + error.message);
    }


}




