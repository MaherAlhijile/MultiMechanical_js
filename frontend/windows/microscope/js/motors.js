document.getElementById("top").addEventListener("click", () => {
    console.log("Move Up");
    move_motor(1, 200, 100, 0)
});

document.getElementById("bottom").addEventListener("click", () => {
    console.log("Move Down");
    move_motor(1, 200, 100, 1)
});

document.getElementById("left").addEventListener("click", () => {
    console.log("Move Left");
    move_motor(2, 200, 100, 0)
});

document.getElementById("right").addEventListener("click", () => {
    console.log("Move Right");
    move_motor(1, 200, 100, 1)
});

document.getElementById("center").addEventListener("click", () => {
    console.log("Reset to Center");
    // your logic here
});

// Focus (Z-axis) buttons
document.getElementById("focus").addEventListener("click", () => {
    console.log("Focus (Z+)");
    move_motor(3, 200, 100, 0)
});

document.getElementById("unfocus").addEventListener("click", () => {
    console.log("Unfocus (Z-)");
    move_motor(3, 200, 100, 1)
});


async function move_motor(motor_number, steps, latency_ms, direction) {
    const formData = new FormData();
    formData.append("motor_number", motor_number);
    formData.append("steps", steps);
    formData.append("latency_ms", latency_ms);
    formData.append("direction", direction);

    let response = null;
    let data = null;

    try {
        response = await fetch("http://192.168.1.60:8000/move_motor", {
            method: "POST",
            body: formData
        });

        if (!response.ok) throw new Error("Server error " + response.status);

        data = await response.json(); // parse JSON feedback
        console.log("Motor feedback:", data);
        return data; // optional: return to caller

    } catch (error) {
        console.error("Error:", error);
        alert("Error: " + error.message);
    } finally {
        stopProcessingOverlay();
    }
}
