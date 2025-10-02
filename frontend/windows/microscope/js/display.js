
// Output containers
const objectImageOutput = document.getElementById("objectImageOutput");
const referenceImageOutput = document.getElementById("referenceImageOutput");
const phaseOutput = document.getElementById("phaseOutput");
const roiOutput = document.getElementById("roiOutput");
const output3D = document.getElementById("output3D");
const output1D = document.getElementById("output1D");





// Process overlay
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




// Popup functions
function openPopup(id) {
    document.getElementById(id).style.display = 'flex';
}

function closePopup(event, id) {
    document.getElementById(id).style.display = 'none';
}

function closePopupById(id) {
    document.getElementById(id).style.display = 'none';
}





//displaying function for object and refernce images
function displayImageInPlotly(imgSrc, divId) {
    const div = document.getElementById(divId);
    if (!div) return;

    Plotly.newPlot(divId, [{
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
}



function displayPhaseDifference(data) {
    phaseOutput.innerHTML = `<div id="plotImage" style="width:100%; height:100%;"></div>`;
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
}


function pixelateBase64Image(base64, canvasId) {
    const img = new Image();
    img.src = base64;

    img.onload = () => {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext("2d");

        // Get container dimensions
        const container = canvas.parentElement;
        const maxW = container.clientWidth;
        const maxH = container.clientHeight;

        // Scale image to fit container (preserve aspect ratio)
        let scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const drawW = Math.floor(img.width * scale);
        const drawH = Math.floor(img.height * scale);

        // Set internal resolution
        canvas.width = drawW;
        canvas.height = drawH;

        // Set CSS size to match, so no stretching
        canvas.style.width = drawW + "px";
        canvas.style.height = drawH + "px";

        let pixelSize = 100; // starting block size

        function animate() {
            ctx.imageSmoothingEnabled = false;

            const w = Math.max(1, Math.floor(drawW / pixelSize));
            const h = Math.max(1, Math.floor(drawH / pixelSize));

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h); // downscale
            ctx.drawImage(canvas, 0, 0, w, h, 0, 0, canvas.width, canvas.height); // upscale

            pixelSize *= 0.9;

            if (pixelSize > 1) {
                requestAnimationFrame(animate);
            } else {
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);
            }
        }

        animate();
    };
}