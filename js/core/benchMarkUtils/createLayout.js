
export function createScatterLayout(plots_amt, numerical_columns_amt) {
    const layout = [{ col: numerical_columns_amt, row: numerical_columns_amt }, []];
    let plotCount = 0;


    const availablePairs = [];
    for (let x = 0; x < numerical_columns_amt; x++) {
        for (let y = 0; y < numerical_columns_amt; y++) {
            if (x !== y) {
                availablePairs.push([x, y]);
            }
        }
    }

    let usedCells = new Set();

    for (let blockSize = 1; blockSize <= numerical_columns_amt; blockSize++) {
        for (let row = 0; row < blockSize; row++) {
            for (let col = 0; col < blockSize; col++) {
                const cellKey = `${row},${col}`;
                if (usedCells.has(cellKey)) continue;
                if (plotCount >= plots_amt || availablePairs.length === 0) return layout;

                const [xIndex, yIndex] = availablePairs.shift();

                layout[1].push({
                    type: "Scatter Plot",
                    col: col + 1,
                    row: row + 1,
                    fields: [
                        { fieldName: "x-axis", fieldSelected: `field${xIndex}` },
                        { fieldName: "y-axis", fieldSelected: `field${yIndex}` },
                    ],
                    options: [
                        { optionName: "linear regression", optionCheckBox: false },
                        { optionName: "Spearman coefficient", optionCheckBox: false },
                        { optionName: "Pearson coefficient", optionCheckBox: false },
                    ],
                });

                usedCells.add(cellKey);
                plotCount++;
            }
        }
    }

    return layout;
}

export function generateConfigsPassFailMatrix(config) {
    const configs = [];

    let firstTime = true;
    for (let plots = 2; plots <= 16; plots += 2) {
        for (let entries = 300; entries <= 2400; entries += 300) {
            const newConfig = { ...config };
            newConfig.plotsAmount = plots;
            newConfig.entriesAmount = entries;
            configs.push(newConfig);
            if(firstTime){
                let firstCase = configs[0];
                configs.push(firstCase);
                configs.push(firstCase);
                configs.push(firstCase);
                firstTime = false;
            }
        }
    }

    return configs;
}

export function generateConfigsSinglePlotForCrossDSLinks(config) {
    const configs = [];

    let firstTime = true;

    // let entries = 15000;
    // {
    for (let entries = 1000; entries <= 16_000; entries += 2_000) {
        const newConfig = { ...config };
        newConfig.plotsAmount = 1;
        newConfig.entriesAmount = entries;
        configs.push(newConfig);
        if(firstTime){
            // let firstCase = configs[0];
            // configs.push(firstCase);
            // configs.push(firstCase);
            // configs.push(firstCase);
            firstTime = false;
        }
    }

    return configs;
}

export function generateConfigsSinglePlot(config) {
    const configs = [];

    let firstTime = true;

    for (let entries = 1000; entries <= 10_000; entries += 1000) {
        const newConfig = { ...config };
        newConfig.plotsAmount = 1;
        newConfig.entriesAmount = entries;
        configs.push(newConfig);
        if(firstTime){
            // let firstCase = configs[0];
            // configs.push(firstCase);
            // configs.push(firstCase);
            // configs.push(firstCase);
            firstTime = false;
        }
    }

    return configs;
}

export function generateConfigsBrushSizeAndTypeOfData(config) {
    const configs = [];

    let firstTime = true;
    const dataTypes = ["evenly distributed", "big clusters", "small clusters"];

    for (const x of dataTypes) {
        // for (let brushSize = 0.10; brushSize <= 0.40; brushSize += 0.04) {
            const newConfig = { ...config };
            newConfig.plotsAmount = 1;
            newConfig.entriesAmount = 10_000;
            newConfig.dataDistribution = x;
            // newConfig.brushSize = brushSize;
            configs.push(newConfig);

            // if (firstTime) {
            //     const firstCase = configs[0];
            //     configs.push(firstCase);
            //     configs.push(firstCase);
            //     configs.push(firstCase);
            //     firstTime = false;
            // }
        // }
    }

    return configs;
}

export function generateConfigsBrushSizeVsStepSize(config) {
    const configs = [];

    let firstTime = true;

    for (let stepSize = 0.04; stepSize <= 0.32; stepSize += 0.04) {
        for (let brushSize = 0.10; brushSize <= 0.40; brushSize += 0.04) {
            const newConfig = { ...config };
            newConfig.plotsAmount = 1;
            newConfig.entriesAmount = 1000;
            newConfig.stepSize = stepSize;
            newConfig.brushSize = brushSize;
            configs.push(newConfig);

            if (firstTime) {
                const firstCase = configs[0];
                configs.push(firstCase);
                configs.push(firstCase);
                configs.push(firstCase);
                firstTime = false;
            }
        }
    }

    return configs;
}

export function generateConfigsAmountOfEntries(config) {
    const configs = [];

    let firstTime = true;

    for (let entriesAmt = 100; entriesAmt <= 5000; entriesAmt += 500) {
        const newConfig = { ...config };
        newConfig.plotsAmount = 1;
        newConfig.entriesAmount = entriesAmt;
        configs.push(newConfig);

        if (firstTime) {
            const firstCase = configs[0];
            configs.push(firstCase);
            configs.push(firstCase);
            configs.push(firstCase);
            firstTime = false;
        }
    }

    return configs;
}

export function generateConfigsForEventAnalysis2Clients(config) {
    const configs = [{ ...config }];

    configs[0].numberOfClientBrushing = 1;

    return configs;
}

export function generateConfigsBigIntervalBetweenBrushes(config) {
    const configs = [{ ...config }];

    configs[0].numberOfClientBrushing = 1;

    return configs;
}


export function generateConfigsStaggeredBrushingEventWith4Clients(config) {
    const configs = [{ ...config }];

    configs[0].numberOfClientBrushing = 4;

    return configs;
}

export function singleParLayout(){
    let x = 0;
    const layoutData = [{ col: 3, row: 3 }, []];

    layoutData[1].push({
        type: "Parallel Coordinates",
        col: 1,
        row: 1,
        fields: [
            { fieldName: "1st axis", fieldSelected: `field${x}` },
            { fieldName: "2nd axis", fieldSelected: `field${x+1}` },
            { fieldName: "3rd axis", fieldSelected: `field${x+2}` },
            { fieldName: "4th axis", fieldSelected: `field${x+3}` },
            { fieldName: "5th axis", fieldSelected: "" },
            { fieldName: "6th axis", fieldSelected: "" },
            { fieldName: "7th axis", fieldSelected: "" },
            { fieldName: "8th axis", fieldSelected: "" },
        ],
        options: [
        ],
    });



    return [true, layoutData];
}

export function singleHistLayout(){
    let x = 0;
    const layoutData = [{ col: 3, row: 3 }, []];

    layoutData[1].push({
        type: "Histogram",
        col: 1,
        row: 1,
        fields: [
            { fieldName: "bin-variable", fieldSelected: `field${x}` },
        ],
        options: [
            { optionName: "y-axis log scale", optionCheckBox: false },
        ],
    });



    return [true, layoutData];
}

export function singleBarLayout(){
    let x = 0;
    const layoutData = [{ col: 3, row: 3 }, []];

    layoutData[1].push({
        type: "Bar Plot SVG",
        col: 1,
        row: 1,
        fields: [
            { fieldName: "bin-variable", fieldSelected: `catField${x}` },
        ],
        options: [
        ],
    });



    return [true, layoutData];
}

export function singleScatterLayout() {
    let x = 0;
    let y = 1;
    const layoutData = [{ col: 3, row: 3 }, []];

    layoutData[1].push({
        type: "Scatter Plot",
        col: 1,
        row: 1,
        fields: [
            { fieldName: "x-axis", fieldSelected: `field${x}` },
            { fieldName: "y-axis", fieldSelected: `field${y}` },
        ],
        options: [
            { optionName: "linear regression", optionCheckBox: false },
            { optionName: "Spearman coefficient", optionCheckBox: false },
            { optionName: "Pearson coefficient", optionCheckBox: false },
        ],
    });

    return [true, layoutData];
}
