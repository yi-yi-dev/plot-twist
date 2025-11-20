import throttle from "lodash-es/throttle.js";
import { makeAdaptiveThrottle } from "./adaptiveThrottle.js";

/**
 * Responsible for coordinating the brushing between different plots
 */
export class PlotCoordinator {
    _entries = [];
    /** Stores the parsed csv data. Each entry in _entries is a row from the csv.
     *
     * Example: _entries[index] = {Sex: Male, age: 31, ... }
     */

    _plots = new Map();
    /** Maps each plot ID to an object consisting of:
     * lastIndexesSelected: An array of indexes representing the last selected entries made by that plot.
     * plotUpdateFunction: A function that updates the plot based on the current selections by all plots.
     * lastSelectionRanges: Array of objects, each containing a `[from, to]` range and the corresponding field.
     *
     * Example: _plotsModules.get(id) = {
     *     lastSelectionRanges: [{
     *          range: [21.5, 41.7],
     *          field: "Age",
     *          type: "numerical"
     *          }, ...],
     *     lastIndexesSelected: [true, false, true, false],
     *     plotUpdateFunction: howToUpdatePlot()
     * }
     */

    _idCounter = 1; // Unique ID for each new plot

    _entrySelectionTracker = [];
    /** Tracks how many times each entry is being selected.
     * An array of integers where each index corresponds to an entry in _entries.
     * _entrySelectionTracker[entryIndex] stores how many times that entry is currently being selected.
     * A count increases for each plot selecting the entry and once more if selected by the intersection of all other clients and decreases if no longer selected.
     * if _entrySelectionTracker[entryIndex] == numberOfPlots+1(the server) then the entry is considered selected
     */

    _crossSelection;
    _defaultColorIndex = 0;
    _colorIndexPerDataSet;

    _localColorPool =
        ["#5C6BC0",
        "#E4572E",
        "#76B041",
        "#C44D9F",
        "#F3A712"];

    dsName = ""; // name of the dataset

    BENCHMARK = {
        isActive: false,
        deltaUpdateIndexes: undefined,
        deltaUpdatePlots: undefined,
        afterIndexesFun: ()=>{},
        afterPlotFun: ()=>{},
    };


    isSelected(entryIndex) {
        return this._entrySelectionTracker[entryIndex] === this._plots.size;
    }

    colorOf(idx) {
        const sel = this._crossSelection[idx] || [];
        const defaultColor = this.dataSetColor();

        const unique = [
            ...new Set(
                sel
                    .map(i => this._localColorPool[i])
                    .filter(color => color !== defaultColor)
            )
        ];

        return [...unique, defaultColor];
    }

    dataSetsOf(idx) {
        const sel = this._crossSelection[idx] || [];

        return sel.map(i =>
            Object.keys(this._colorIndexPerDataSet)
                .find(name => this._colorIndexPerDataSet[name] === i)
        );
    }

    dataSetColor(){
        return this._localColorPool[this._defaultColorIndex];
    }

    colorsPerDataSet(){
        return Object.fromEntries(
            Object.entries(this._colorIndexPerDataSet).map(
                ([name, idx]) => [name, this._localColorPool[idx]]
            )
        );
    }

    allDataSets(){
        return Object.keys(this._colorIndexPerDataSet);
    }

    plotUtils(){
        return {
            isRowSelected: (...args) => this.isSelected(...args),
            colorsPerDataSet: () => this.colorsPerDataSet(),
            dataSet: () => {return this.dsName},
            dataSetsOf: (...args) => this.dataSetsOf(...args),
            colorsOf: (...args) => this.colorOf(...args),
            dataSetColor: () => this.dataSetColor(),
            allDataSets: () => this.allDataSets(),
        }
    }

    updateCrossSelection(newCrossSelection) {
        this._crossSelection = newCrossSelection;
    }

    updateDefaultColor(dataSetColorIndex) {
        this._defaultColorIndex = dataSetColorIndex;
    }

    updateDataSetsColors(colorsPerDataSet) {
        this._colorIndexPerDataSet = colorsPerDataSet;
    }

    locallySelectedEntriesIndexes(){
        const results = [];
        const plot = this._plots.get(0);
        const expectedCount = this._plots.size - 1;

        for (let idx = 0; idx < this._entrySelectionTracker.length; idx++) {
            const count = this._entrySelectionTracker[idx];
            const lastSelected = plot.lastIndexesSelected[idx];
            const serverSelection = lastSelected ? 1 : 0;
            const adjustedCount = count - serverSelection;

            results.push(adjustedCount === expectedCount);
        }

        return results;
    }

    onSelectionDo(afterSelectionFunction){
        this._onSelectionFunction = () => {
            afterSelectionFunction(this.locallySelectedEntriesIndexes(), this.dsName);
        };
    }

    _onSelectionFunction = () => {};

    onBenchmarkDo(afterIndexFun, afterPlotFun){
        this.BENCHMARK.afterIndexesFun = afterIndexFun;
        this.BENCHMARK.afterPlotFun = afterPlotFun;
    }

    _benchMark(where) {
        if (this.BENCHMARK.isActive) {
            let startTime, endTime;
            switch (where) {
                case "preIndexUpdate":
                    this.BENCHMARK.updateIndexStart = performance.now();
                    break;
                case "postIndexUpdate":
                    startTime = this.BENCHMARK.updateIndexStart;
                    endTime = performance.now();
                    this.BENCHMARK.deltaUpdateIndexes = endTime - startTime;
                    break;
                case "prePlotsUpdate":
                    this.BENCHMARK.updatePlotsStart = performance.now();
                    break;
                case "postPlotsUpdate":
                    startTime = this.BENCHMARK.updatePlotsStart;
                    endTime = performance.now();
                    this.BENCHMARK.deltaUpdatePlots = endTime - startTime;
                    break;
            }
        }
    }

    newPlotId() {
        return ++this._idCounter;
    }

    addPlot(id, updateFunction) {
        const existingPlot = this._plots.get(id);

        if (existingPlot) {
            // Update only the function if plot already exists
            existingPlot.plotUpdateFunction = updateFunction;
        } else {
            for (let i = 0; i < this._entrySelectionTracker.length; i++) {
                this._entrySelectionTracker[i]++;
            }
        }

        // Initialize a new plot
        this._plots.set(id, {
            lastSelectionRange: [],
            lastIndexesSelected: Array(this._entries.length).fill(true),
            plotUpdateFunction: updateFunction,
        });

        this.updatePlotsView(id, []);
        // empty selection [] => all entries selected
    }

    removePlot(id) {
        if (!this._plots.has(id)) return;

        let indexesSelected = this._plots.get(id).lastIndexesSelected;
        for (let i = 0; i < indexesSelected.length; i++) {
            if(indexesSelected[i]){
                this._entrySelectionTracker[i]--;
            }
        }

        this._plots.delete(id);
        for (let plot of this._plots.values()) {
            plot.plotUpdateFunction();
        }
        this._onSelectionFunction();
    }

    removeAll() {
        for (let [key, plot] of this._plots.entries()) {
            if (key === 0) continue;

            let indexesSelected = plot.lastIndexesSelected;
            for (let i = 0; i < indexesSelected.length; i++) {
                if(indexesSelected[i]){
                    this._entrySelectionTracker[i]--;
                }
            }
        }

        this._plots.clear();
    }

    _isSelectedRange(d, selectionArr, idx) {
        for (let selection of selectionArr) {
            const field = selection.field;

            if (selection.type === "numerical") {
                if (selection.range) {
                    const from = selection.range[0];
                    const to = selection.range[1];
                    if (!(from <= d[field] && d[field] <= to)) {
                        return false;
                    }
                }
            } else if(selection.type === "categorical") {
                const categories = selection.categories;
                let isSelected = false;
                for (let cat of categories) {
                    if (d[field] === cat) {
                        isSelected = true;
                        break;
                    }
                }
                if (!isSelected) {
                    return false;
                }
            }else{
                if(selection.indexes){
                    return selection.indexes.length>0 ? selection.indexes[idx] : true;
                }
            }
        }

        return true;
    }

    // throttledUpdatePlotsView = throttle(this.updatePlotsView, 70);
    throttledUpdatePlotsView = makeAdaptiveThrottle(this.updatePlotsView);

    updatePlotsView(triggeringPlotId, newSelection) {
        const t0 = Date.now();

        this._plots.get(triggeringPlotId).lastSelectionRange = newSelection;

        this._benchMark("preIndexUpdate");
        let lastSelectedIndexes = this._plots.get(triggeringPlotId).lastIndexesSelected;

        let newlySelectedIndexes = this._entries.map((d, i) =>
            this._isSelectedRange(this._entries[i], newSelection, i)
        );

        for (let idx = 0; idx < lastSelectedIndexes.length; idx++){
            let isSelected = lastSelectedIndexes[idx];
            if(isSelected){
                this._entrySelectionTracker[idx]--;
            }
        }
        for (let idx = 0; idx < newlySelectedIndexes.length; idx++){
            let isSelected = newlySelectedIndexes[idx];
            if(isSelected){
                this._entrySelectionTracker[idx]++;
            }
        }
        this._plots.get(triggeringPlotId).lastIndexesSelected = newlySelectedIndexes;
        // the id 0 is reserved for server communication
        if(triggeringPlotId !== 0){
            // the selection is sent to the server before updating the rest of the plots
            this._onSelectionFunction();
        }

        this._benchMark("postIndexUpdate");
        this.BENCHMARK.afterIndexesFun("postIndex", triggeringPlotId!==0);

        this._benchMark("prePlotsUpdate");
        for (let [plotToUpdateId, plot] of this._plots.entries()) {
            if (plotToUpdateId === 0 || plotToUpdateId === -1) continue;
            plot.plotUpdateFunction();
        }

        this._benchMark("postPlotsUpdate");
        this.BENCHMARK.afterPlotFun("postPlots", triggeringPlotId!==0);

        const elapsed = Date.now() - t0; // ms
        this.throttledUpdatePlotsView.report(elapsed);
        this.throttledUpdatePlotsView.enable(!this.BENCHMARK.isActive);
    }

    fields() {
        let fields = [];
        if (this._entries.length > 0) {
            for (let field in this._entries[0]) {
                fields.push(field);
            }
        }

        return fields;
    }

    entries(){
        return this._entries;
    }

    init(entries, dsName) {
        this.dsName = dsName;
        this._entries = entries;

        let n = entries.length;
        this._entrySelectionTracker = Array(n);
        this._crossSelection = Array(n);
        for (let i = 0; i < n; i++) {
            this._entrySelectionTracker[i] = 0;
            this._crossSelection[i] = [];
        }

        this.addPlot(0, ()=>{});
    }
}
