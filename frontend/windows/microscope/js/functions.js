//fix 1d
//integrate camera & motors

let imageCaptured = null
let refCaptured = null
let refFile = null
let imageFile = null



let image = {
    psi: null,
    roi: null
};


// Functions for loading object and refernce images, coressponding displaying functions found in display.js
const objectInput = document.getElementById('imageFile');
objectInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        displayImageInPlotly(event.target.result, 'objectImageOutput');
        document.getElementById('objectLabel').textContent = file.name;
        document.getElementById('opjectImagePlaceholder').style.display = 'none';
        imageCaptured = true
    };
    reader.readAsDataURL(file);
});

const refInput = document.getElementById('refFile');
refInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        displayImageInPlotly(event.target.result, 'referenceImageOutput');
        document.getElementById('referenceLabel').textContent = file.name;
        document.getElementById('referenceImagePlaceholder').style.display = 'none';
        refCaptured = true
    };
    reader.readAsDataURL(file);
});




// Functions for phase difference & region of interseset

document.getElementById("phaseDiff").addEventListener("click", (e) => { e.preventDefault(); runPhaseDiff(); });
document.getElementById("selectRoiBtn").addEventListener("click", startROISelection);
document.getElementById("3dbtn").addEventListener("click", fetch3DPlot);
document.getElementById("1dbtn").addEventListener("click", (e) => { e.preventDefault(); startPointsSelection() });




async function runPhaseDiff() {
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
        alert("You only have a reference. Please select an image file or capture one via the live camera");
        return;
    }
    if (!refFile && !refCaptured) {
        alert("You only have an image. Please select a reference file or capture one via the live camera");
        return;
    }

    if (imageFile) formData.append("image", imageFile);
    if (refFile) formData.append("reference", refFile);

    try {
        startProcessingOverlay();
        const response = await fetch(`http://192.168.1.60:8000/run_phase_difference`, {
            method: "POST",
            body: formData
        });
        if (!response.ok) throw new Error("Server error " + response.status);

        const data = await response.json();

        // Render phase output container
        const phaseOutputBox = document.getElementById("phaseOutput");
        phaseOutputBox.innerHTML = `<canvas id="pixelCanvas" style="width:100%; height:100%;"></canvas>`;

        // Run pixelation effect on returned phase image
        pixelateBase64Image("data:image/png;base64," + data.phase_image, "pixelCanvas");

        // Optional debug logs
        console.log("Phase shape:", data.shape);
        console.log("Phase range:", data.min, "to", data.max);
        image.psi = data.phase_image;

    } catch (error) {
        console.error("Error:", error);
        alert("Error: " + error.message);
        stopProcessingOverlay();
    } finally {
        stopProcessingOverlay();
    }
}





// function runPhaseDiff() {

//     data = sendData(getParams(), "run_phase_difference")
//     displayPhaseDifference(data)
// }

function getParams() {
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

    imageFile = document.getElementById("imageFile").files[0];
    refFile = document.getElementById("refFile").files[0];

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

    return formData
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
    const roiPlaceholder = document.getElementById("xxx");

    try {
        const response = await fetch(`http://192.168.1.60:8000/select_roi`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x1, y1, x2, y2 })
        });
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        // Convert base64 image to src format for Plotly
        const imgSrc = `data:image/png;base64,${data.roi_image}`;

        // Get the div
        const div = document.getElementById("roiOutput");
        roiPlaceholder.style.display = "none";

        // Use Plotly to display the image
        Plotly.newPlot(div, [{
            type: 'image',
            source: imgSrc,
            x: [0, 1],
            y: [0, 1],
            xref: 'x',
            yref: 'y',
            sizing: 'contain',
            layer: 'below'
        }], {
            margin: { t: 0, b: 0, l: 0, r: 0 },
            autosize: false,
            width: div.clientWidth,
            height: div.clientHeight
        }, {
            staticPlot: false // disables zoom/pan interactions
        });

    } catch (error) {
        console.error("Error selecting ROI:", error);
        alert("Error selecting ROI: " + error.message);
    }
}



async function fetch3DPlot() {
    try {
        startProcessingOverlay()

        const response = await fetch(`http://192.168.1.60:8000/compute_3d`);
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
        const response = await fetch(`http://192.168.1.60:8000/compute_1d`, {
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



const toggle = document.getElementById("themeToggle");
const body = document.body;

// Load saved preference
if (localStorage.getItem("theme") === "dark") {
  body.classList.add("dark-mode");
  toggle.textContent = "☀️";
}

toggle.addEventListener("click", () => {
  body.classList.toggle("dark-mode");
  const isDark = body.classList.contains("dark-mode");
  toggle.textContent = isDark ? "☀️" : "🌙";
  localStorage.setItem("theme", isDark ? "dark" : "light");
});