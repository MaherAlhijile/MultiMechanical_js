// let apiBase = localStorage.getItem("apiBase") || `${window.location.protocol}//${window.location.host}`;
//TEST 

apiBase = "http://192.168.1.60:8000"


async function sendData(formData, dest) {
    console.log(apiBase)
    try {
        startProcessingOverlay()
        const response = await fetch(`${apiBase}/${dest}`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error("Server error " + response.status);
        }

        const data = await response.json();
        return data; // return parsed JSON to caller

    } catch (error) {
        console.error(`Error in ${dest}:`, error);
        throw error; // re-throw to handle outside
    } finally {
        stopProcessingOverlay()
    }
}

