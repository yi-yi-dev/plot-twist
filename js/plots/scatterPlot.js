import * as d3 from "d3";
import throttle from "lodash-es/throttle.js";
import { customTickFormat } from "./plotsUtils/tickFormat.js";

export const scatterPlot = {
    plotName: "Scatter Plot",
    fields: [
        { isRequired: true, fieldType: "numerical", fieldName: "x-axis" },
        { isRequired: true, fieldType: "numerical", fieldName: "y-axis" },
    ],
    options: ["linear regression", "Spearman coefficient", "Pearson coefficient"],
    height: 1,
    width: 1,
    createPlotFunction: createScatterPlot,
};

export function createScatterPlot(fields, options, plotDiv, data, updatePlotsFun, utils) {
    // fields & options
    const xField = fields.get("x-axis");
    const yField = fields.get("y-axis");

    const isRegressionSelected = options.get("linear regression");
    const isSpearmanSelected = options.get("Spearman coefficient");
    const isPearsonSelected = options.get("Pearson coefficient");

    const container = d3.select(plotDiv);
    const width = container.node().clientWidth;
    const height = container.node().clientHeight;

    const marginTop = 10;
    const marginRight = 20;
    const marginBottom = 30;
    const marginLeft = 40;

    const brushThrottleMs = 50;
    const fallbackColor = d3.scaleOrdinal(d3.schemeCategory10);
    const unselectedColor = "hsl(0, 0%, 75%)";

    // extents & scales
    let xExtent = d3.extent(data, d => Number(d[xField]));
    if (xExtent[0] == null || xExtent[1] == null) xExtent = [0, 1];
    if (xExtent[0] === xExtent[1]) { xExtent[0] -= 0.5; xExtent[1] += 0.5; }

    let yExtent = d3.extent(data, d => Number(d[yField]));
    if (yExtent[0] == null || yExtent[1] == null) yExtent = [0, 1];
    if (yExtent[0] === yExtent[1]) { yExtent[0] -= 0.5; yExtent[1] += 0.5; }

    const x = d3.scaleLinear().domain(xExtent).nice().range([marginLeft, width - marginRight]).unknown(marginLeft);
    const y = d3.scaleLinear().domain(yExtent).nice().range([height - marginBottom, marginTop]).unknown(height - marginBottom);

    container.style("position", "relative");

    // Canvas setup
    const canvas = container.append("canvas").node();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.position = "absolute";
    canvas.style.left = "0px";
    canvas.style.top = "0px";
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // SVG overlay (axes, grids, brush)
    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("position", "absolute")
        .style("left", "0px")
        .style("top", "0px");

    svg.append("g")
        .attr("transform", `translate(0,${height - marginBottom})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(customTickFormat))
        .call((g) => g.select(".domain").remove())
        .call((g) => g.selectAll("text").style("text-anchor", "middle").style("font-size", "10px"))
        .call((g) => g.append("text")
            .attr("x", width - marginRight)
            .attr("y", -4)
            .attr("fill", "#000")
            .attr("font-weight", "bold")
            .attr("text-anchor", "end")
            .text(xField));

    svg.append("g")
        .attr("transform", `translate(${marginLeft},0)`)
        .call(d3.axisLeft(y).ticks(7).tickFormat(customTickFormat))
        .call((g) => g.select(".domain").remove())
        .call((g) => g.select(".tick:last-of-type text").clone().attr("x", 4).attr("text-anchor", "start").attr("font-weight", "bold").text(yField));

    svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${height - marginBottom})`)
        .call(d3.axisBottom(x).tickSize(-height + marginTop + marginBottom).tickFormat(""))
        .call((g) => g.select(".domain").remove())
        .call((g) => g.selectAll(".tick line").style("stroke-width", 0.5).style("stroke-opacity", 0.3));

    svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(${marginLeft},0)`)
        .call(d3.axisLeft(y).tickSize(-width + marginLeft + marginRight).tickFormat(""))
        .call((g) => g.select(".domain").remove())
        .call((g) => g.selectAll(".tick line").style("stroke-width", 0.5).style("stroke-opacity", 0.3));

    // tooltip
    const tooltip = d3.select("body")
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

    const hiddenDatasets = new Set();

    function dataSetsOfRow(i) {
        const u = utils();
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

        const origin = typeof u.dataSet === "function" ? u.dataSet() : (u.dataSet || "");
        const isSelected = typeof u.isRowSelected === "function" ? !!u.isRowSelected(i) : !!u.isRowSelected;
        if (isSelected && origin) others.push(origin);

        return Array.from(new Set(others || []));
    }

    function renderLegend(allDataSets, colors) {
        const outer = d3.select(plotDiv);
        outer.style("position", "relative");

        // create the legend overlay once and reuse it
        let legendDiv = outer.select(".legend-overlay");
        if (legendDiv.empty()) {
            legendDiv = outer.append("div")
                .attr("class", "legend-overlay")
                .style("position", "absolute")
                .style("right", utils().allDataSets().length + 10 + "px")
                .style("top", -25 + "px")
                .style("display", "flex")
                .style("gap", "6px")
                .style("z-index", 9999)
                .style("pointer-events", "auto");
        } else {
            // update the position in case number of datasets changed
            legendDiv.style("right", utils().allDataSets().length + 10 + "px");
        }

        const swatchSize = 16;
        const itemHeight = 18;

        // data join for legend items (keyed by dataset name)
        const items = legendDiv.selectAll("div.legend-item").data(allDataSets, d => d);

        // remove old
        items.exit().remove();

        // enter
        const enter = items.enter()
            .append("div")
            .attr("class", "legend-item")
            .style("display", "flex")
            .style("align-items", "center")
            .style("cursor", "pointer")
            .style("height", itemHeight + "px")
            // stop propagation so SVG brush doesn't steal the pointer events
            .on("pointerdown", function(event, d) {
                event.stopPropagation();
                // toggle hidden state
                if (hiddenDatasets.has(d)) hiddenDatasets.delete(d);
                else hiddenDatasets.add(d);
                // call updateScatter which will re-run renderLegend (update-only)
                updateScatter();
            })
            .on("mouseover", function(event, d) {
                const rect = this.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

                tooltip.html(d)
                    .style("left", (rect.left + scrollLeft + swatchSize + 8) + "px")
                    .style("top", (rect.top + scrollTop) + "px")
                    .style("display", "block");
            })
            .on("mousemove", function() {
                const rect = this.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                tooltip.style("left", (rect.left + scrollLeft + swatchSize + 8) + "px").style("top", (rect.top + scrollTop) + "px");
            })
            .on("mouseleave", function() {
                tooltip.style("display", "none");
            });

        enter.append("div").attr("class", "legend-swatch")
            .style("width", swatchSize + "px")
            .style("height", swatchSize + "px")
            .style("border-radius", "7px")
            .style("border", "1px solid #ccc")
            .style("margin-right", "6px");

        // update existing + newly entered items
        const merged = enter.merge(items);

        merged.select(".legend-swatch")
            .style("background-color", d => colors[d] || fallbackColor(d))
            .style("opacity", d => hiddenDatasets.has(d) ? 0.25 : 1);
    }


    // radius configuration: small grey dot & larger colored selected dot
    const minRadius = 2.5;
    const maxRadius = 7;
    const radiusScale = d3.scaleLinear().domain([0, 500]).range([maxRadius, minRadius]).clamp(true);
    const computedRadius = Math.max(1.2, radiusScale(data.length) / 2);
    const smallRadius = Math.max(0.9, computedRadius * 0.55); // small grey background dot
    const largeRadius = Math.max(2, computedRadius * 1.6);    // larger colored selected dot

    // points & quadtree
    let points = data.map((d, i) => ({ i, data: d, x: x(Number(d[xField])), y: y(Number(d[yField])) }));
    let quadtree = d3.quadtree().x(d => d.x).y(d => d.y).addAll(points);

    function rebuildPointsAndQuadtree() {
        points = data.map((d, i) => ({ i, data: d, x: x(Number(d[xField])), y: y(Number(d[yField])) }));
        quadtree = d3.quadtree().x(d => d.x).y(d => d.y).addAll(points);
    }

    // draw canvas: pass1 = all small grey dots, pass2 = selected big colored dots
    function drawCanvas(filteredRegression) {
        ctx.clearRect(0, 0, width, height);

        const u = utils();
        const allDataSets = typeof u.allDataSets === "function" ? (u.allDataSets() || []) : (u.allDataSets || []);
        const colors = u.colorsPerDataSet || u.colors || {};
        const visibleDatasets = new Set(allDataSets.filter(ds => !hiddenDatasets.has(ds)));

        // clip to plot area
        ctx.save();
        ctx.beginPath();
        ctx.rect(marginLeft, marginTop, width - marginLeft - marginRight, height - marginTop - marginBottom);
        ctx.clip();

        // PASS 1: draw every point as a small grey dot
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        for (const p of points) {
            ctx.beginPath();
            ctx.fillStyle = unselectedColor;
            ctx.arc(p.x, p.y, smallRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // PASS 2: draw points that belong to a visible dataset as larger full-color dots
        for (const p of points) {
            const dsList = dataSetsOfRow(p.i);
            let chosen = null;
            for (let j = 0; j < dsList.length; j++) {
                if (visibleDatasets.has(dsList[j])) { chosen = dsList[j]; break; }
            }
            if (!chosen) continue; // not selected -> only small grey dot remains

            const dsColor = colors[chosen] || fallbackColor(chosen);
            ctx.beginPath();
            ctx.fillStyle = dsColor;
            ctx.arc(p.x, p.y, largeRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Regression line (if enabled) drawn on top of dots
        if (isRegressionSelected && filteredRegression) {
            const u2 = utils();
            const origin = typeof u2.dataSet === "function" ? u2.dataSet() : (u2.dataSet || "");
            const colors2 = u2.colorsPerDataSet || u2.colors || {};
            const originColor = origin ? (colors2[origin] || fallbackColor(origin)) : (u2.dataSetColor && u2.dataSetColor()) || "#000";

            ctx.beginPath();
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = originColor;
            const xDomain = x.domain();
            const x0v = xDomain[0], x1v = xDomain[1];
            const px0 = x(x0v), py0 = y(filteredRegression(x0v));
            const px1 = x(x1v), py1 = y(filteredRegression(x1v));
            ctx.moveTo(px0, py0);
            ctx.lineTo(px1, py1);
            ctx.stroke();
        }

        ctx.restore();
    }

    // tooltip hit-testing
    function pointerHandler(event) {
        const rect = canvas.getBoundingClientRect();
        const mx = (event.clientX - rect.left);
        const my = (event.clientY - rect.top);
        const hitRadius = 6;
        const found = quadtree.find(mx, my, hitRadius);
        if (found) {
            const d = found.data;
            const idx = d.i;
            const ds = dataSetsOfRow(idx);
            const dsText = ds.length ? `<br/>datasets: ${ds.join(", ")}` : "";
            tooltip.html(`<strong>${xField}:</strong> ${d.data[xField]}<br/><strong>${yField}:</strong> ${d.data[yField]}${dsText}`)
                .style("left", (event.pageX + 8) + "px")
                .style("top", (event.pageY + 8) + "px")
                .style("display", "block");
        } else {
            tooltip.style("display", "none");
        }
    }

    canvas.addEventListener("mousemove", pointerHandler);
    canvas.addEventListener("mouseleave", () => tooltip.style("display", "none"));

    // initial legend
    const initialUtils = utils();
    const initialAllDataSets = typeof initialUtils.allDataSets === "function" ? (initialUtils.allDataSets() || []) : (initialUtils.allDataSets || []);
    const initialColors = initialUtils.colorsPerDataSet || initialUtils.colors || {};
    renderLegend(initialAllDataSets, initialColors);

    // regression & coefficients
    function updateRegressionLine(filteredData) {
        if (!isRegressionSelected) return null;
        if (!filteredData || filteredData.length < 2) return null;
        return calculateLinearRegression(filteredData, xField, yField);
    }

    function updateCoefficients(selectedData) {
        svg.selectAll('.correlation-text').remove();
        if ((!isPearsonSelected && !isSpearmanSelected) || !selectedData || selectedData.length < 2) return;

        let pearson;
        if (isPearsonSelected) pearson = calculatePearson(selectedData, xField, yField).toFixed(2);
        let spearman;
        if (isSpearmanSelected) spearman = calculateSpearman(selectedData, xField, yField).toFixed(2);

        const correlationText = svg.append("text")
            .attr("class", "correlation-text")
            .attr("x", width - marginRight)
            .attr("y", marginTop + 10)
            .attr("text-anchor", "end")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .attr("fill", "#000");

        const colorScale = d3.scaleLinear().domain([-1, 0, 1]).range(["red", "grey", "green"]);

        if (isPearsonSelected) {
            correlationText.append("tspan").attr("x", width - marginRight).attr("dy", "0em").text("Pearson: ");
            correlationText.append("tspan").attr("fill", colorScale(pearson)).text(pearson);
        }
        if (isSpearmanSelected) {
            correlationText.append("tspan").attr("x", width - marginRight).attr("dy", isPearsonSelected ? "1.2em" : "0em").text("Spearman: ");
            correlationText.append("tspan").attr("fill", colorScale(spearman)).text(spearman);
        }
    }

    // update loop
    function updateScatter() {
        const u = utils();
        const allDataSets = typeof u.allDataSets === "function" ? (u.allDataSets() || []) : (u.allDataSets || []);
        const colors = u.colorsPerDataSet || u.colors || {};

        renderLegend(allDataSets, colors);
        rebuildPointsAndQuadtree();

        const visibleDatasets = new Set(allDataSets.filter(ds => !hiddenDatasets.has(ds)));
        const selectedAndInVisibleDs = data.filter((d, i) => {
            const dsList = dataSetsOfRow(i);
            if (!dsList || dsList.length === 0) return false;
            return dsList.some(ds => visibleDatasets.has(ds));
        });

        const regression = updateRegressionLine(selectedAndInVisibleDs);
        updateCoefficients(selectedAndInVisibleDs);

        drawCanvas(regression);
    }

    // brush
    function handleSelection({ selection }) {
        let selectRanges;
        if (selection) {
            const [[x0, y0], [x1, y1]] = selection;
            const xRange = [x.invert(x0), x.invert(x1)];
            const yRange = [y.invert(y1), y.invert(y0)];
            selectRanges = [
                { range: xRange, field: xField, type: "numerical" },
                { range: yRange, field: yField, type: "numerical" },
            ];
        } else {
            selectRanges = [];
        }
        updatePlotsFun(selectRanges);
    }

    // const throttledHandleSelection = throttle(handleSelection, brushThrottleMs);
    const throttledHandleSelection = handleSelection;
    svg.call(d3.brush().extent([[marginLeft, marginTop], [width - marginRight, height - marginBottom]]).on("start brush end", throttledHandleSelection));

    // initial
    updateScatter();

    return function updateScatterWrapper() {
        updateScatter();
    };
}

// statistics
function calculatePearson(selectedData, xField, yField) {
    const xValues = selectedData.map((d) => +d[xField]);
    const yValues = selectedData.map((d) => +d[yField]);

    const xMean = d3.mean(xValues);
    const yMean = d3.mean(yValues);

    const numerator = d3.sum(xValues.map((x, i) => (x - xMean) * (yValues[i] - yMean)));
    const denominator = Math.sqrt(
        d3.sum(xValues.map((x) => Math.pow(x - xMean, 2))) *
        d3.sum(yValues.map((y) => Math.pow(y - yMean, 2)))
    );

    return numerator / denominator;
}

function calculateLinearRegression(data, xField, yField) {
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

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

function calculateSpearman(selectedData, xField, yField) {
    const xValues = selectedData.map((d) => +d[xField]);
    const yValues = selectedData.map((d) => +d[yField]);

    const xRanks = rank(xValues);
    const yRanks = rank(yValues);

    return calculatePearson(
        selectedData.map((d, i) => ({ [xField]: xRanks[i], [yField]: yRanks[i] })),
        xField,
        yField
    );
}

function rank(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return values.map((v) => sorted.indexOf(v) + 1);
}
