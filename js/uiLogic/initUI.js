import { csvParse } from "d3";
import { initTopBarScroll, initLinkMenuResize } from "./topBarScroll.js";
import { demoData, demoLayout } from "./demoLayout.js";
import {
    adjustBodyStyle,
    createEmptyGrid,
    createEmptyGridCell,
    getGridDimensions,
    getGridElementsInfo,
    loadLayout,
} from "./gridUtils.js";
import { websocketCommunication } from "../core/websocketCommunication.js";

/**
 * initializes all the ui components
 */
export function initializeUI(plots, url) {
    let wsUrl = `ws://` + url;
    let websocketCommunicationRef = {
        eventsCoordinator: new websocketCommunication(plots, wsUrl),
    };

    let httpUrl = `http://` + url;
    initTopBarScroll();
    initLinkMenuResize();
    initExportLayout();
    initKillSession(httpUrl);
    initLoadLayout(websocketCommunicationRef);
    initGridResizing(websocketCommunicationRef);
    initLoadCsv(websocketCommunicationRef);
    initLoadDemo(websocketCommunicationRef);
    createWebSocketConnection(websocketCommunicationRef);
}

/**
 * creates a web socket connection to the backend
 */
export function createWebSocketConnection(eventsCoordinatorRef) {
    eventsCoordinatorRef.eventsCoordinator.createWebSocketConnection()
}

/**
 * kills the current backend session and resets it when pressed
 */
export function initKillSession(url) {
    const btn = document.getElementById("kill-session-btn");

    btn.addEventListener("click", async () => {
        try {
            await fetch(`${url}reset`, {
                method: "POST",
            });
        } catch (e) {
            console.error("Reset request failed", e);
        }
    });
}

/**
 * initializes the export layout to file button functionality
 */
export function initExportLayout() {

    function exportLayout() {
        let gridSize = getGridDimensions();

        const gridData = getGridElementsInfo();
        const jsonString = JSON.stringify([gridSize, gridData], null, 2);

        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        // Create a temporary anchor element to trigger the download
        const a = document.createElement("a");
        a.href = url;
        a.download = "layout.json";
        a.click();

        URL.revokeObjectURL(url);
    }

    document
        .getElementById("exportLayoutButton")
        .addEventListener("click", exportLayout);
}

/**
 * initializes the restore layout from file button functionality
 */
export function initLoadLayout(eventsCoordinatorRef) {
    const fileInput = document.getElementById("layoutInput");

    fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];

        if (file) {
            const reader = new FileReader();

            reader.onload = (event) => {
                let parsedData;
                try {
                    parsedData = JSON.parse(event.target.result);
                } catch (error) {
                    console.error("Error parsing JSON:", error);
                    alert(
                        "Invalid JSON file. Please select a valid JSON file.",
                    );
                }

                const container = document.getElementById("plotsContainer");

                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }

                eventsCoordinatorRef.eventsCoordinator.removeAllPlots();

                loadLayout(parsedData, eventsCoordinatorRef);
                adjustBodyStyle();
            };

            reader.readAsText(file);
        }
    });
}

/**
 * initializes the buttons responsible for adding columns and rows to the grid
 */
export function initGridResizing(eventsCoordinatorRef) {
    let containerId = "plotsContainer";

    window.addEventListener("resize", function() {
        adjustBodyStyle();
    });

    document.getElementById("col").addEventListener("click", function() {
        let grid = getGridDimensions();

        grid.col++;
        const container = document.getElementById(containerId);

        container.style.gridTemplateColumns = `repeat(${grid.col}, 350px)`;
        container.style.gridTemplateRows = `repeat(${grid.row}, 350px)`;

        for (let i = 1; i <= grid.row; i++) {
            createEmptyGridCell( { col: grid.col, row: i }, eventsCoordinatorRef);
        }
        adjustBodyStyle();
    });

    document.getElementById("row").addEventListener("click", function() {
        let grid = getGridDimensions();

        grid.row++;
        const container = document.getElementById(containerId);

        container.style.gridTemplateColumns = `repeat(${grid.col}, 350px)`;
        container.style.gridTemplateRows = `repeat(${grid.row}, 350px)`;

        for (let i = 1; i <= grid.col; i++) {
            createEmptyGridCell({ col: i, row: grid.row }, eventsCoordinatorRef);
        }
        adjustBodyStyle();
    });
}

/**
 * initializes the button responsible for loading and parsing a csv file
 */
export function initLoadCsv(eventsCoordinatorRef) {

    const fileInput = document.getElementById("fileInput");

    fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];

        if (file) {
            const reader = new FileReader();

            reader.onload = async (event) => {
                const csvData = event.target.result;

                const container = document.getElementById("plotsContainer");

                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }

                let data = await csvParse(csvData.toString());

                eventsCoordinatorRef.eventsCoordinator.addDataSet(data, file.name);

                createEmptyGrid(eventsCoordinatorRef);

                document.getElementById("col").style.display = "flex";
                document.getElementById("row").style.display = "flex";
                document.getElementById("loadDemo").style.display = "none";

                adjustBodyStyle();
            };

            reader.readAsText(file);

            document.getElementById("loadLayoutButton").style.display = "flex";
            document.getElementById("exportLayoutButton").style.display = "flex";

        } else {
            alert("Please select a CSV file.");
        }
    });
}

/**
 * initializes the load demo button
 */
export function initLoadDemo(eventsCoordinatorRef){

    function loadDemo()  {

        eventsCoordinatorRef.eventsCoordinator.addDataSet(demoData, "demo");

        createEmptyGrid(eventsCoordinatorRef);
        document.getElementById("col").style.display = "flex";
        document.getElementById("row").style.display = "flex";
        document.getElementById("loadDemo").style.display = "none";
        // connectToWebSocket(socketRef, pcRef, url);
        adjustBodyStyle();

        loadLayout(demoLayout, eventsCoordinatorRef);
        document.getElementById("loadLayoutButton").style.display = "flex";
        document.getElementById("exportLayoutButton").style.display = "flex";
    }

    document
        .getElementById("loadDemo")
        .addEventListener("click", loadDemo);
}
