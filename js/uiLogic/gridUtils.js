import { showOffErrorMsg } from "./crossDataSetLinksTable.js";
import { analyzeFieldType } from "../plots/plotsUtils/fieldTypeCheck.js";

export function loadLayout(layoutData, eventsCoordinatorRef) {
    let gridSize = { col: 3, row: 3 };
    gridSize.col = layoutData[0].col;
    gridSize.row = layoutData[0].row;

    const container = document.getElementById("plotsContainer");

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    const plots = eventsCoordinatorRef.eventsCoordinator.plotTypes();
    createEmptyGrid(eventsCoordinatorRef, gridSize);

    if (layoutData[1]) {
        layoutData[1].forEach((item) => {
            plots.forEach((plot) => {
                if(item.type === plot.plotName){
                    createPlot(plot,
                        eventsCoordinatorRef.eventsCoordinator.getDataSetPlotCoordinator("TODO"),
                        { col: item.col, row: item.row },
                        new Map(item.fields.map(field => [field.fieldName, field.fieldSelected])),
                        new Map(item.options.map(option => [option.optionName, option.optionCheckBox]))
                    ) // TODO: fix layout
                }
            });
        });
        eventsCoordinatorRef.eventsCoordinator.updateStateOfPlotCoordinators();
    }
}

function createPlot(selectedPlot, plotCoordinator, gridPos, selectedFields, selectedCheckBoxes){
    let id = plotCoordinator.newPlotId();
    let col = gridPos.col;
    let row = gridPos.row;

    // stores the Plot details into a json embedded in the div for the layout information
    const createdPlotJsonInfo = {
        dataSet: plotCoordinator.dsName,
        plotName: selectedPlot.plotName,
        fields: Array.from(selectedFields.entries()).map(([key, value]) => ({
            fieldName: key,
            fieldSelected: value
        })),
        options: Array.from(selectedCheckBoxes.entries()).map(([key, value]) => ({
            optionName: key,
            optionCheckBox: value
        })),
        col: col,
        row: row,
    };

    // creates the plotDiv where the delete button and the plot will reside
    const plotDiv = document.createElement("div");
    plotDiv.id = `plot-${col}-${row}`;
    plotDiv.setAttribute("data-json", JSON.stringify(createdPlotJsonInfo));
    plotDiv.classList.add("plotAndDeleteButton-container");
    plotDiv.style.gridColumn = col;
    plotDiv.style.gridRow = row;
    plotDiv.style.width = `${349*selectedPlot.width+(selectedPlot.width-1)*15.1}px`;
    plotDiv.style.height = `${348.18*selectedPlot.height+(selectedPlot.height-1)*15.1}px`;
    document.getElementById("plotsContainer").appendChild(plotDiv);

    // Adds top bar on top of plot where delete button resides
    const deleteButtonContainer = document.createElement("div");
    deleteButtonContainer.classList.add("plot-deleteButton-container");
    plotDiv.appendChild(deleteButtonContainer);

    // Adds delete button to remove the plot when clicked
    const button = document.createElement("button");
    button.textContent = "Delete";
    button.classList.add("delete-plot");
    button.addEventListener("click", () => {
        plotCoordinator.removePlot(id);
        plotDiv.remove();
    });
    deleteButtonContainer.appendChild(button);

    // Adds the div where the actual plot will reside
    const innerPlotContainer = document.createElement("div");
    innerPlotContainer.classList.add("plot-content");
    innerPlotContainer.style.width = `${350*selectedPlot.width+(selectedPlot.width-1)*15}px`;
    innerPlotContainer.style.height = `${350*selectedPlot.height+(selectedPlot.height-1)*15-43}px`;
    plotDiv.appendChild(innerPlotContainer);

    let plotInstance = new selectedPlot.plotClass(
        selectedFields,
        selectedCheckBoxes,
        innerPlotContainer,
        plotCoordinator.entries(),
        (selection)=> {
            plotCoordinator.throttledUpdatePlotsView(id, selection);
        },
        () => {
            return plotCoordinator.plotUtils();
        },
    );

    plotCoordinator.addPlot(id, () => plotInstance.update());
}

function createPlotWithErrorHandling(selectedPlot, plotCoordinator, gridPos, plotTypes, selectedFields, selectedCheckBoxes) {

    let gridDimensions = getGridDimensions();
    let rows = gridDimensions.row;
    let cols = gridDimensions.col;

    const gridData = getGridElementsInfo();

    let plotWidth = selectedPlot.width;
    let plotHeight = selectedPlot.height;

    let canBePlaced = true;

    for (let r = gridPos.row; r < gridPos.row + plotHeight; r++) {
        for (let c = gridPos.col; c < gridPos.col + plotWidth; c++) {
            // check if it fits within grid boundaries
            if (r > rows || c > cols) {
                canBePlaced = false;
                break;
            }

            // check there is no overlap with existing plots
            if (gridData.some(plot =>
                plot.row <= r && r < plot.row + (plotTypes.find(p => p.plotName === plot.type)?.height || 1) &&
                plot.col <= c && c < plot.col + (plotTypes.find(p => p.plotName === plot.type)?.width || 1)
            )) {
                canBePlaced = false;
                break;
            }
        }
        if (!canBePlaced) break;
    }

    if(canBePlaced){
        createPlot(selectedPlot, plotCoordinator, gridPos, selectedFields, selectedCheckBoxes);
    }else {
        showOffErrorMsg(`The plot doesn't fit`);
    }
}

function createFieldSelectionMenu(selectedPlot, pcRef, gridPos, TODO, eventsCoordinatorRef) {
    let plotTypes = eventsCoordinatorRef.eventsCoordinator.plotTypes();
    let col = gridPos.col;
    let row = gridPos.row;
    const gridCell = document.getElementById(`grid-cell-${col}-${row}`);

    const plotOptionsDiv = document.createElement("div");
    plotOptionsDiv.classList.add("plot-fields-selection-menu");

    const plotFieldsContainer = document.createElement("div");
    plotFieldsContainer.classList.add("plot-fields-container");
    plotOptionsDiv.appendChild(plotFieldsContainer);

    let selectedFields = new Map();
    let selectedCheckBoxes = new Map();

    for (let i = 0; i < selectedPlot.fields.length; i++) {
        let selectField = document.createElement("select");
        selectField.classList.add("field-select-dropDown");

        if (!selectedPlot.fields[i].isRequired) {
            const noneOption = document.createElement("option");
            noneOption.value = "";
            noneOption.text = "----";
            selectField.appendChild(noneOption);
        }

        eventsCoordinatorRef.eventsCoordinator.getDataSetPlotCoordinator("TODO").fields().forEach((field) => {
            const data = eventsCoordinatorRef.eventsCoordinator.getDataSetPlotCoordinator("TODO").entries();
            const { isCategorical, isNumerical } = analyzeFieldType(data, field);

            let isValidField = false;
            if (selectedPlot.fields[i].fieldType === "numerical") {
                isValidField = isNumerical;
            } else if (selectedPlot.fields[i].fieldType === "categorical") {
                isValidField = isCategorical;
            }else{
                isValidField = true;
            }

            if (isValidField) {
                const option = document.createElement("option");
                option.value = field;
                option.text = field;
                selectField.appendChild(option);
            }
        });

        // Add label and select field
        const label = document.createElement("label");
        label.textContent = selectedPlot.fields[i].fieldName;
        label.classList.add("field-select-label");

        // Initialize the map with the default value
        selectedFields.set(selectedPlot.fields[i].fieldName, selectField.value);

        selectField.addEventListener("change", () => {
            selectedFields.set(selectedPlot.fields[i].fieldName, selectField.value);
        });

        plotFieldsContainer.appendChild(label);
        plotFieldsContainer.appendChild(selectField);
    }

    for (let i = 0; i < selectedPlot.options.length; i++) {
        const container = document.createElement("div");
        container.classList.add("plotCreation-checkbox-container");

        let checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.classList.add("plotCreation-checkbox");
        checkbox.id = `checkbox-${i}-${row}-${col}`;

        // Initialize the map with false
        selectedCheckBoxes.set(selectedPlot.options[i], false);

        checkbox.addEventListener("change", () => {
            selectedCheckBoxes.set(selectedPlot.options[i], checkbox.checked);
        });

        const label = document.createElement("label");
        label.textContent = selectedPlot.options[i];
        label.classList.add("plotCreation-checkbox-label");
        label.htmlFor = checkbox.id;

        container.appendChild(checkbox);
        container.appendChild(label);
        plotFieldsContainer.appendChild(container);
    }

    // Add the "create" button at the bottom
    const plotButtonsContainer = document.createElement("div");
    plotButtonsContainer.classList.add("fieldSelection-buttons-container");

    const createButton = document.createElement("button");
    createButton.textContent = "Create";

    let plotCoordinator = eventsCoordinatorRef.eventsCoordinator.getDataSetPlotCoordinator("TODO");
    createButton.addEventListener("click",
        () => {
        createPlotWithErrorHandling(selectedPlot, plotCoordinator, gridPos, plotTypes, selectedFields, selectedCheckBoxes);
        eventsCoordinatorRef.eventsCoordinator.updateStateOfPlotCoordinators();
    });

    createButton.classList.add("plot-button", "create-plot-button");

    // Add the "back" button at the bottom
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Back";
    cancelButton.classList.add("plot-button", "cancel-button");
    cancelButton.addEventListener("click", () => {
        gridCell.removeChild(plotOptionsDiv); // Remove the plot options menu
        createPlotTypeSelectionMenu(null, gridPos, plotTypes, eventsCoordinatorRef); // Show plot type menu again
    });

    plotButtonsContainer.appendChild(cancelButton);
    plotButtonsContainer.appendChild(createButton);
    plotOptionsDiv.appendChild(plotButtonsContainer);
    gridCell.appendChild(plotOptionsDiv);
}

/**
 * creates the menu responsible for the selection of the type of plot to be created
 */
function createPlotTypeSelectionMenu(pcRef, gridPos, TODO, eventsCoordinatorRef) {
    let col = gridPos.col;
    let row = gridPos.row;
    const gridCell = document.getElementById(`grid-cell-${col}-${row}`);
    const addPlotButton = gridCell.querySelector(".empty-grid-cell");

    const plotMenu = document.createElement("div");
    plotMenu.classList.add("plotType-selection-menu");

    const plotSelectionInnerMenu = document.createElement("div");
    plotSelectionInnerMenu.classList.add("plotSelectionInnerMenu");
    plotMenu.appendChild(plotSelectionInnerMenu);

    eventsCoordinatorRef.eventsCoordinator.plotTypes().forEach((plot) => {
        const plotButton = document.createElement("button");
        plotButton.textContent = plot.plotName;
        plotButton.addEventListener("click", () => {
            createFieldSelectionMenu(plot, null, gridPos, null, eventsCoordinatorRef);
            gridCell.removeChild(plotMenu);
        });
        plotSelectionInnerMenu.appendChild(plotButton);
    });

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Back";
    cancelButton.classList.add("cancel-button");
    cancelButton.addEventListener("click", () => {
        gridCell.removeChild(plotMenu);
        addPlotButton.style.display = "flex"; // Show the "Add Plot" button again
    });

    plotMenu.appendChild(cancelButton);
    gridCell.appendChild(plotMenu);
}

/**
 * creates an empty cell with an "Add Plot" button
 */
export function createEmptyGridCell({ col, row }, eventsCoordinatorRef) {
    const containerId = "plotsContainer";
    const container = document.getElementById(containerId);

    const gridCell = document.createElement("div");
    gridCell.classList.add("grid-cell");
    gridCell.setAttribute("id", `grid-cell-${col}-${row}`);

    gridCell.style.gridColumn = `${col}`;
    gridCell.style.gridRow = `${row}`;

    const buttonContainer = document.createElement("div");
    buttonContainer.classList.add("empty-grid-cell");

    const addPlotButton = document.createElement("button");
    addPlotButton.textContent = "Add Plot";
    addPlotButton.addEventListener("click", () => {
        // when clicked display the plot type menu
        createPlotTypeSelectionMenu(null, { col: col, row: row }, null, eventsCoordinatorRef);

        // Hide the Add Plot button
        buttonContainer.style.display = "none";
    });

    buttonContainer.appendChild(addPlotButton);
    gridCell.appendChild(buttonContainer);
    container.appendChild(gridCell);
}

/**
 * creates the default plot-less 3x3 grid
 */
export function createEmptyGrid(eventsCoordinatorRef, gridDimensions = { col: -1, row: -1 }) {
    const containerId = "plotsContainer";
    const container = document.getElementById(containerId);

    const defaultCol = Math.max(1, Math.floor(window.innerWidth / 350));
    const defaultRow = Math.max(1, Math.floor(window.innerHeight / 350));

    if (gridDimensions.col === -1 && gridDimensions.row === -1) {
        gridDimensions.col = defaultCol;
        gridDimensions.row = defaultRow;
    }

    container.style.gridTemplateColumns = `repeat(${gridDimensions.col}, 350px)`;
    container.style.gridTemplateRows = `repeat(${gridDimensions.row}, 350px)`;

    for (let col = 1; col <= gridDimensions.col; col++) {
        for (let row = 1; row <= gridDimensions.row; row++) {
            // TODO: add another menu for selecting dataset

            createEmptyGridCell({ col, row }, eventsCoordinatorRef);
        }
    }

    adjustBodyStyle();
}

/**
 * Adjust the css styling of the grid such that if the screen allows it, it is fixed and centered,
 * and if not it properly overflows
 */
export function adjustBodyStyle() {
    const content = document.getElementById("grid-container");
    const appView = document.querySelector("#app-view");
    const body = document.body;
    const { height, width } = content.getBoundingClientRect();
    const isMobile = window.matchMedia("(max-width: 600px)").matches;

    if (isMobile) {
        // Mobile: make #app-view scrollable
        body.style.display = "block";
        appView.style.cssText = `
      padding-top: 0;
      overflow-y: auto;
      max-height: 100vh;
    `;
        return;
    }

    // Non‑mobile: revert any mobile scroll settings
    appView.style.overflowY = "visible";
    appView.style.maxHeight = "none";

    // 1) adjust top padding if content is taller than window
    appView.style.paddingTop = (height + 60 > window.innerHeight)
        ? "68px"
        : "0";

    // 2) switch between flex‑centered vs block layout
    if (width + 20 >= window.innerWidth) {
        body.style.display = "block";
        body.style.flexDirection = "";
        body.style.alignItems = "";
        appView.style.paddingTop = "0";
    } else {
        body.style.display = "flex";
        body.style.flexDirection = "column";
        body.style.alignItems = "center";
    }
}


/**
 * Returns the grid width (number of columns) and height (number of rows)
 */
export function getGridDimensions() {
    const plotsContainer = document.getElementById("plotsContainer");
    const styles = window.getComputedStyle(plotsContainer);

    const cols = styles.getPropertyValue("grid-template-columns").split(" ").length;
    const rows = styles.getPropertyValue("grid-template-rows").split(" ").length;

    return { col: cols, row: rows };
}

/**
 * Returns an array with the info of all the plots currently in the grid and their positions
 */
export function getGridElementsInfo() {
    const container = document.getElementById("plotsContainer");
    const elements = container.getElementsByClassName("plotAndDeleteButton-container");
    const gridInfoArray = [];

    for (const element of elements) {
        const jsonData = JSON.parse(element.getAttribute("data-json"));

        gridInfoArray.push({
            type: jsonData.plotName,
            col: jsonData.col,
            row: jsonData.row,
            fields: jsonData.fields,
            options: jsonData.options,
        });
    }

    return gridInfoArray;
}
