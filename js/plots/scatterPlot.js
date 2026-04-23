import * as d3 from "d3";
import { customTickFormat } from "./plotsUtils/tickFormat.js";
import { LegendOverlay } from "./plotsUtils/togglableLegendOverlay.js";

export class ScatterPlot {
    constructor(fields, options, plotDiv, data, updatePlotsFun, utils) {
        this.fields = fields;
        this.options = options;
        this.plotDiv = plotDiv;
        this.data = data;
        this.updatePlotsFun = updatePlotsFun;
        this.utils = utils;

        // fields & options
        this.xField = fields.get("x-axis");
        this.yField = fields.get("y-axis");

        this.isRegressionSelected = options.get("linear regression");
        this.isSpearmanSelected = options.get("Spearman coefficient");
        this.isPearsonSelected = options.get("Pearson coefficient");

        // container & size
        this.container = d3.select(plotDiv);
        this.width = this.container.node().clientWidth;
        this.height = this.container.node().clientHeight;

        // margins & layout constants
        this.marginTop = 10;
        this.marginRight = 20;
        this.marginBottom = 30;
        this.marginLeft = 40;

        // visual constants
        this.fallbackColor = d3.scaleOrdinal(d3.schemeCategory10);
        this.unselectedColor = "hsl(0, 0%, 75%)";

        // ensure container positioned for absolute overlays
        this.container.style("position", "relative");

        // compute extents and scales
        let xExtent = d3.extent(this.data, (d) => Number(d[this.xField]));
        if (xExtent[0] == null || xExtent[1] == null) xExtent = [0, 1];
        if (xExtent[0] === xExtent[1]) {
            xExtent[0] -= 0.5;
            xExtent[1] += 0.5;
        }

        let yExtent = d3.extent(this.data, (d) => Number(d[this.yField]));
        if (yExtent[0] == null || yExtent[1] == null) yExtent = [0, 1];
        if (yExtent[0] === yExtent[1]) {
            yExtent[0] -= 0.5;
            yExtent[1] += 0.5;
        }

        this.x = d3
            .scaleLinear()
            .domain(xExtent)
            .range([this.marginLeft, this.width - this.marginRight])
            .unknown(this.marginLeft);
        this.y = d3
            .scaleLinear()
            .domain(yExtent)
            .nice()
            .range([this.height - this.marginBottom, this.marginTop])
            .unknown(this.height - this.marginBottom);

        // compute custom x ticks
        (function computeCustomXTicks(scale, width, ml, mr) {
            const [xmin, xmax] = scale.domain();
            const plotWidth = Math.max(1, width - ml - mr);
            const approxTickPx = 80;
            const totalTicks = Math.max(
                2,
                Math.min(10, Math.round(plotWidth / approxTickPx) + 1)
            );
            const interiorCount = Math.max(0, totalTicks - 2);
            const ticks = [xmin];
            if (interiorCount > 0) {
                const step = (xmax - xmin) / (interiorCount + 1);
                for (let i = 1; i <= interiorCount; i++)
                    ticks.push(xmin + step * i);
            }
            if (xmax !== xmin) ticks.push(xmax);
            scale.customTicks = ticks;
        })(this.x, this.width, this.marginLeft, this.marginRight);

        // Canvas element for point rendering (pixel-ratio aware)
        this.canvas = this.container.append("canvas").node();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.style.position = "absolute";
        this.canvas.style.left = "0px";
        this.canvas.style.top = "0px";
        this.canvas.style.width = this.width + "px";
        this.canvas.style.height = this.height + "px";
        this.canvas.width = Math.max(1, Math.floor(this.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(this.height * dpr));
        this.ctx = this.canvas.getContext("2d");
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // SVG overlay for axes, grids, brush and correlation text
        this.overlaySvg = this.container
            .append("svg")
            .attr("viewBox", `0 0 ${this.width} ${this.height}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .style("position", "absolute")
            .style("left", "0px")
            .style("top", "0px");

        // render axes + grids (static elements created once)
        this._createAxesAndGrids();

        // tooltip for point hover (kept for point hover behavior)
        this.tooltip = d3
            .select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("pointer-events", "none")
            .style("color", "#333")
            .style("background", "rgba(250, 250, 250, 0.95)")
            .style("padding", "6px 10px")
            .style("border-radius", "6px")
            .style("box-shadow", "0 2px 8px rgba(0,0,0,0.12)")
            .style("font-size", "13px")
            .style("z-index", 10000)
            .style("display", "none");

        // togglable legend overlay (legend handles its own tooltip)
        this.legend = new LegendOverlay(this.container, {
            fallbackColor: this.fallbackColor,
            onToggle: () => this.update(),
        });

        // radius configuration
        this.minRadius = 2.5;
        this.maxRadius = 7;
        this.radiusScale = d3
            .scaleLinear()
            .domain([0, 500])
            .range([this.maxRadius, this.minRadius])
            .clamp(true);
        this.computedRadius = Math.max(
            1.2,
            this.radiusScale(this.data.length) / 2
        );
        this.smallRadius = Math.max(0.9, this.computedRadius * 0.55);
        this.largeRadius = Math.max(2, this.computedRadius * 1.6);

        // build points & quadtree
        this._rebuildPointsAndQuadtree();

        // bind handlers to preserve `this`
        this.pointerHandler = this.pointerHandler.bind(this);
        this.handleSelection = this.handleSelection.bind(this);

        // pointer events for tooltip
        this.canvas.addEventListener("mousemove", this.pointerHandler);
        this.canvas.addEventListener("mouseleave", () =>
            this.tooltip.style("display", "none")
        );

        // brush on overlay
        this.overlaySvg.call(
            d3
                .brush()
                .extent([
                    [this.marginLeft, this.marginTop],
                    [
                        this.width - this.marginRight,
                        this.height - this.marginBottom,
                    ],
                ])
                .on("start brush end", this.handleSelection)
        );

        // initial render
        this.update();
    }

    // create axes + grids once
    _createAxesAndGrids() {
        const xTickValues = this.x.customTicks || this.x.ticks(5);

        // x axis
        this.overlaySvg
            .append("g")
            .attr(
                "transform",
                `translate(0,${this.height - this.marginBottom})`
            )
            .call(
                d3
                    .axisBottom(this.x)
                    .tickValues(xTickValues)
                    .tickFormat(customTickFormat)
            )
            .call((g) => g.select(".domain").remove())
            .call((g) =>
                g
                    .selectAll("text")
                    .style("text-anchor", "middle")
                    .style("font-size", "10px")
            )
            .call((g) =>
                g
                    .append("text")
                    .attr("x", this.width - this.marginRight)
                    .attr("y", -4)
                    .attr("fill", "#000")
                    .attr("font-weight", "bold")
                    .attr("text-anchor", "end")
                    .text(this.xField)
            );

        // y axis
        this.overlaySvg
            .append("g")
            .attr("transform", `translate(${this.marginLeft},0)`)
            .call(d3.axisLeft(this.y).ticks(7).tickFormat(customTickFormat))
            .call((g) => g.select(".domain").remove())
            .call((g) =>
                g
                    .select(".tick:last-of-type text")
                    .clone()
                    .attr("x", 4)
                    .attr("text-anchor", "start")
                    .attr("font-weight", "bold")
                    .text(this.yField)
            );

        // x grid
        this.overlaySvg
            .append("g")
            .attr("class", "grid")
            .attr(
                "transform",
                `translate(0,${this.height - this.marginBottom})`
            )
            .call(
                d3
                    .axisBottom(this.x)
                    .tickValues(this.x.customTicks || this.x.ticks(5))
                    .tickSize(-this.height + this.marginTop + this.marginBottom)
                    .tickFormat("")
            )
            .call((g) => g.select(".domain").remove())
            .call((g) =>
                g
                    .selectAll(".tick line")
                    .style("stroke-width", 0.5)
                    .style("stroke-opacity", 0.3)
            );

        // y grid
        this.overlaySvg
            .append("g")
            .attr("class", "grid")
            .attr("transform", `translate(${this.marginLeft},0)`)
            .call(
                d3
                    .axisLeft(this.y)
                    .tickSize(-this.width + this.marginLeft + this.marginRight)
                    .tickFormat("")
            )
            .call((g) => g.select(".domain").remove())
            .call((g) =>
                g
                    .selectAll(".tick line")
                    .style("stroke-width", 0.5)
                    .style("stroke-opacity", 0.3)
            );
    }

    // rebuild points array and quadtree when scales or data change
    _rebuildPointsAndQuadtree() {
        this.points = this.data.map((d, i) => ({
            i,
            data: d,
            x: this.x(Number(d[this.xField])),
            y: this.y(Number(d[this.yField])),
        }));
        this.quadtree = d3
            .quadtree()
            .x((d) => d.x)
            .y((d) => d.y)
            .addAll(this.points);
    }

    // returns datasets for a row
    dataSetsOfRow(i) {
        const u =
            typeof this.utils === "function" ? this.utils() : this.utils || {};
        let others = [];
        if (typeof u.dataSetsOf === "function") {
            const res = u.dataSetsOf(i);
            if (Array.isArray(res)) others = res;
        } else if (Array.isArray(u.dataSetsOf)) {
            others = u.dataSetsOf;
        } else if (typeof u.dataSestOf === "function") {
            const res = u.dataSestOf(i);
            if (Array.isArray(res)) others = res;
        } else if (Array.isArray(u.dataSestOf)) {
            others = u.dataSestOf;
        }

        const origin =
            typeof u.dataSet === "function" ? u.dataSet() : u.dataSet || "";
        const isSelected =
            typeof u.isRowSelected === "function"
                ? !!u.isRowSelected(i)
                : !!u.isRowSelected;
        if (isSelected && origin) others.push(origin);

        return Array.from(new Set(others || []));
    }

    // draw canvas: two passes (small grey dots, then colored selected dots)
    drawCanvas(filteredRegression) {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;

        ctx.clearRect(0, 0, width, height);

        const u =
            typeof this.utils === "function" ? this.utils() : this.utils || {};
        const allDataSets =
            typeof u.allDataSets === "function"
                ? u.allDataSets() || []
                : u.allDataSets || [];
        const colors = u.colorsPerDataSet || u.colors || {};

        // determine which datasets are hidden via legend overlay
        const hiddenSet = this.legend.getGlobalDatasets
            ? this.legend.getGlobalDatasets()
            : new Set();
        const visibleDatasets = new Set(
            allDataSets.filter((ds) => !hiddenSet.has(ds))
        );

        // clip to plot area for drawing points
        ctx.save();
        ctx.beginPath();
        ctx.rect(
            this.marginLeft,
            this.marginTop,
            width - this.marginLeft - this.marginRight,
            height - this.marginTop - this.marginBottom
        );
        ctx.clip();

        // PASS 1: small grey dot for every point
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        for (const p of this.points) {
            ctx.beginPath();
            ctx.fillStyle = this.unselectedColor;
            ctx.arc(p.x, p.y, this.smallRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // PASS 2: larger colored dot for points belonging to a visible dataset
        for (const p of this.points) {
            const dsList = this.dataSetsOfRow(p.i);
            let chosen = null;
            for (let j = 0; j < dsList.length; j++) {
                if (visibleDatasets.has(dsList[j])) {
                    chosen = dsList[j];
                    break;
                }
            }
            if (!chosen) continue;
            const dsColor = colors[chosen] || this.fallbackColor(chosen);
            ctx.beginPath();
            ctx.fillStyle = dsColor;
            ctx.arc(p.x, p.y, this.largeRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // regression line (if enabled)
        if (this.isRegressionSelected && filteredRegression) {
            const u2 =
                typeof this.utils === "function"
                    ? this.utils()
                    : this.utils || {};
            const origin =
                typeof u2.dataSet === "function"
                    ? u2.dataSet()
                    : u2.dataSet || "";
            const colors2 = u2.colorsPerDataSet || u2.colors || {};
            const originColor = origin
                ? colors2[origin] || this.fallbackColor(origin)
                : (u2.dataSetColor && u2.dataSetColor()) || "#000";

            ctx.beginPath();
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = originColor;
            const xDomain = this.x.domain();
            const x0v = xDomain[0],
                x1v = xDomain[1];
            const px0 = this.x(x0v),
                py0 = this.y(filteredRegression(x0v));
            const px1 = this.x(x1v),
                py1 = this.y(filteredRegression(x1v));
            ctx.moveTo(px0, py0);
            ctx.lineTo(px1, py1);
            ctx.stroke();
        }

        ctx.restore();
    }

    // pointer tooltip
    pointerHandler(event) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const hitRadius = 6;
        const found = this.quadtree.find(mx, my, hitRadius);
        if (found) {
            const d = found.data;
            const idx = d.i;
            const ds = this.dataSetsOfRow(idx);
            const dsText = ds.length ? `<br/>datasets: ${ds.join(", ")}` : "";
            this.tooltip
                .html(
                    `<strong>${this.xField}:</strong> ${d.data[this.xField]}<br/><strong>${this.yField}:</strong> ${d.data[this.yField]}${dsText}`
                )
                .style("left", event.pageX + 8 + "px")
                .style("top", event.pageY + 8 + "px")
                .style("display", "block");
        } else {
            this.tooltip.style("display", "none");
        }
    }

    // regression calculation helper (keeps original logic)
    calculateLinearRegression(data, xField, yField) {
        const n = data.length;
        let sumX = 0,
            sumY = 0,
            sumXY = 0,
            sumX2 = 0;
        data.forEach((d) => {
            const xv = Number(d[xField]);
            const yv = Number(d[yField]);
            sumX += xv;
            sumY += yv;
            sumXY += xv * yv;
            sumX2 += xv * xv;
        });
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        return (x) => slope * x + intercept;
    }

    calculatePearson(selectedData, xField, yField) {
        const xValues = selectedData.map((d) => +d[xField]);
        const yValues = selectedData.map((d) => +d[yField]);
        const xMean = d3.mean(xValues);
        const yMean = d3.mean(yValues);
        const numerator = d3.sum(
            xValues.map((x, i) => (x - xMean) * (yValues[i] - yMean))
        );
        const denominator = Math.sqrt(
            d3.sum(xValues.map((x) => Math.pow(x - xMean, 2))) *
                d3.sum(yValues.map((y) => Math.pow(y - yMean, 2)))
        );
        return numerator / denominator;
    }

    calculateSpearman(selectedData, xField, yField) {
        const xValues = selectedData.map((d) => +d[xField]);
        const yValues = selectedData.map((d) => +d[yField]);
        const xRanks = this.rank(xValues);
        const yRanks = this.rank(yValues);
        return this.calculatePearson(
            selectedData.map((d, i) => ({
                [xField]: xRanks[i],
                [yField]: yRanks[i],
            })),
            xField,
            yField
        );
    }

    rank(values) {
        const sorted = [...values].sort((a, b) => a - b);
        return values.map((v) => sorted.indexOf(v) + 1);
    }

    // updateCoefficients: removes previous text and appends new correlation text (keeps original layout)
    updateCoefficients(selectedData) {
        this.overlaySvg.selectAll(".correlation-text").remove();
        if (
            (!this.isPearsonSelected && !this.isSpearmanSelected) ||
            !selectedData ||
            selectedData.length < 2
        )
            return;

        let pearson;
        if (this.isPearsonSelected)
            pearson = this.calculatePearson(
                selectedData,
                this.xField,
                this.yField
            ).toFixed(2);
        let spearman;
        if (this.isSpearmanSelected)
            spearman = this.calculateSpearman(
                selectedData,
                this.xField,
                this.yField
            ).toFixed(2);

        const correlationText = this.overlaySvg
            .append("text")
            .attr("class", "correlation-text")
            .attr("x", this.width - this.marginRight)
            .attr("y", this.marginTop + 10)
            .attr("text-anchor", "end")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .attr("fill", "#000");

        const colorScale = d3
            .scaleLinear()
            .domain([-1, 0, 1])
            .range(["red", "grey", "green"]);

        if (this.isPearsonSelected) {
            correlationText
                .append("tspan")
                .attr("x", this.width - this.marginRight)
                .attr("dy", "0em")
                .text("Pearson: ");
            correlationText
                .append("tspan")
                .attr("fill", colorScale(pearson))
                .text(pearson);
        }
        if (this.isSpearmanSelected) {
            correlationText
                .append("tspan")
                .attr("x", this.width - this.marginRight)
                .attr("dy", this.isPearsonSelected ? "1.2em" : "0em")
                .text("Spearman: ");
            correlationText
                .append("tspan")
                .attr("fill", colorScale(spearman))
                .text(spearman);
        }
    }

    // brush handler -> calls updatePlotsFun with numeric ranges for x & y
    handleSelection({ selection }) {
        let selectRanges;
        if (selection) {
            const [[x0, y0], [x1, y1]] = selection;
            const xRange = [this.x.invert(x0), this.x.invert(x1)];
            const yRange = [this.y.invert(y1), this.y.invert(y0)];
            selectRanges = [
                { range: xRange, field: this.xField, type: "numerical" },
                { range: yRange, field: this.yField, type: "numerical" },
            ];
        } else {
            selectRanges = [];
        }
        this.updatePlotsFun(selectRanges);
    }

    // main update function: recompute quadtree, update legend, regression, coefficients and draw
    update() {
        const u =
            typeof this.utils === "function" ? this.utils() : this.utils || {};
        const allDataSets =
            typeof u.allDataSets === "function"
                ? u.allDataSets() || []
                : u.allDataSets || [];
        const colors = u.colorsPerDataSet || u.colors || {};

        // render legend via LegendOverlay API (LegendOverlay now handles its own hover tooltip)
        this.legend.render(allDataSets, colors);

        // rebuild spatial index (points positions may change if scales changed)
        this._rebuildPointsAndQuadtree();

        // compute which datasets are visible (legend holds toggles)
        const hiddenSet = this.legend.getGlobalDatasets
            ? this.legend.getGlobalDatasets()
            : new Set();
        const visibleDatasets = new Set(
            allDataSets.filter((ds) => !hiddenSet.has(ds))
        );

        // determine data that is selected and in visible datasets (used for regression & coefficients)
        const selectedAndInVisibleDs = this.data.filter((d, i) => {
            const dsList = this.dataSetsOfRow(i);
            if (!dsList || dsList.length === 0) return false;
            return dsList.some((ds) => visibleDatasets.has(ds));
        });

        const regression = this.isRegressionSelected
            ? this.updateRegressionLine(selectedAndInVisibleDs)
            : null;
        this.updateCoefficients(selectedAndInVisibleDs);

        // draw to canvas
        this.drawCanvas(regression);
    }

    // helper to compute regression function or null
    updateRegressionLine(filteredData) {
        if (!this.isRegressionSelected) return null;
        if (!filteredData || filteredData.length < 2) return null;
        return this.calculateLinearRegression(
            filteredData,
            this.xField,
            this.yField
        );
    }
}

export const scatterPlot = {
    plotName: "Scatter Plot",
    fields: [
        { isRequired: true, fieldType: "numerical", fieldName: "x-axis" },
        { isRequired: true, fieldType: "numerical", fieldName: "y-axis" },
    ],
    options: [
        "linear regression",
        "Spearman coefficient",
        "Pearson coefficient",
    ],
    height: 1,
    width: 1,
    plotClass: ScatterPlot,
};
