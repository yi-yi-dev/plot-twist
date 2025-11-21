import * as d3 from "d3";
import throttle from "lodash-es/throttle.js";
import { customTickFormat } from "./plotsUtils/tickFormat.js";

export const parallelCoordinates = {
    plotName: "Parallel Coordinates",
    fields: [
        { fieldType: "numerical", isRequired: true, fieldName: "1st axis" },
        { fieldType: "numerical", isRequired: true, fieldName: "2nd axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "3rd axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "4th axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "5th axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "6th axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "7th axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "8th axis" }
    ],
    options: [],
    height: 2,
    width: 1,
    createPlotFunction: createParallelCoordinates,
};

export function createParallelCoordinates(fields, options, plotDiv, data, updatePlotsFun, utils) {
    const keys = parallelCoordinates.fields
        .map(field => fields.get(field.fieldName))
        .filter(value => value !== "");

    const container = d3.select(plotDiv);
    const width = container.node().clientWidth;
    const height = container.node().clientHeight;

    const marginTop = 20;
    const marginRight = 15;
    const marginBottom = 30;
    const marginLeft = 15;

    const unselectedColor = "grey";
    const fallbackColor = d3.scaleOrdinal(d3.schemeCategory10);

    // horizontal x scale per key (ensure safe domains)
    const x = new Map(
        Array.from(keys, (key) => {
            let extent = d3.extent(data, (d) => {
                const v = Number(d[key]);
                return Number.isFinite(v) ? v : null;
            });
            if (extent[0] == null || extent[1] == null) extent = [0, 1];
            if (extent[0] === extent[1]) { extent[0] -= 0.5; extent[1] += 0.5; }
            return [
                key,
                d3.scaleLinear().domain(extent).nice().range([marginLeft, width - marginRight]).unknown(marginLeft)
            ];
        })
    );

    // y layout for axes
    const y = d3.scalePoint().domain(keys).range([marginTop, height - marginBottom]);

    const hiddenDatasets = new Set();

    // tooltip for legend
    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("pointer-events", "none")
        .style("color", "#333")
        .style("background", "rgba(250, 250, 250, 0.9)")
        .style("padding", "6px 12px")
        .style("border-radius", "8px")
        .style("box-shadow", "0 2px 8px rgba(0,0,0,0.15)")
        .style("font-size", "13px")
        .style("z-index", 10000)
        .style("opacity", 0)
        .style("transform", "translateY(5px)")
        .style("transition", "opacity 0.3s ease, transform 0.3s ease")
        .style("display", "none");

    function dataSetsOfRow(i) {
        const u = utils();
        let others = [];
        if (typeof u.dataSetsOf === "function") {
            const res = u.dataSetsOf(i);
            if (Array.isArray(res)) others = res;
        } else if (Array.isArray(u.dataSestOf)) {
            const res = u.dataSestOf(i);
            if (Array.isArray(res)) others = res;
        } else if (Array.isArray(u.dataSetsOf)) {
            others = u.dataSetsOf;
        }

        const origin = typeof u.dataSet === "function" ? u.dataSet() : (u.dataSet || "");
        const isSelected = typeof u.isRowSelected === "function" ? !!u.isRowSelected(i) : !!u.isRowSelected;
        if (isSelected && origin) others.push(origin);

        return Array.from(new Set(others || []));
    }

    function renderLegend(allDataSets, colors) {
        const outer = d3.select(plotDiv);
        outer.style("position", "relative");

        // safe length for positioning
        const currentAll = Array.isArray(allDataSets) ? allDataSets : (allDataSets || []);
        const rightOffset = (currentAll.length ? currentAll.length : 0) + 10 + "px";

        // create the legend overlay once and reuse it
        let legendDiv = outer.select(".legend-overlay");
        if (legendDiv.empty()) {
            legendDiv = outer.append("div")
                .attr("class", "legend-overlay")
                .style("position", "absolute")
                .style("right", rightOffset)
                .style("top", -25 + "px")
                .style("display", "flex")
                .style("gap", "6px")
                .style("z-index", 9999)
                .style("pointer-events", "auto");
        } else {
            legendDiv.style("right", rightOffset);
        }

        const swatchSize = 16;
        const itemHeight = 18;

        // data join keyed by dataset name
        const items = legendDiv.selectAll("div.legend-item").data(currentAll, d => d);

        // remove old
        items.exit().remove();

        // enter (no label text — only swatch; name appears on hover via tooltip)
        const enter = items.enter()
            .append("div")
            .attr("class", "legend-item")
            .style("display", "flex")
            .style("align-items", "center")
            .style("cursor", "pointer")
            .style("height", itemHeight + "px")
            // prevent SVG brushes from stealing the pointer events
            .on("pointerdown", function(event, d) {
                event.stopPropagation();
                if (hiddenDatasets.has(d)) hiddenDatasets.delete(d);
                else hiddenDatasets.add(d);
                // update view (this will call renderLegend again but it will reuse the container)
                updateParallel();
            })
            .on("mouseover", function(event, d) {
                const rect = this.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                tooltip.html(d)
                    .style("left", (rect.left + scrollLeft + swatchSize + 8) + "px")
                    .style("top", (rect.top + scrollTop) + "px")
                    .style("display", "block")
                    .style("opacity", 1)
                    .on("transitionend", null);
            })
            .on("mousemove", function() {
                const rect = this.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                tooltip.style("left", (rect.left + scrollLeft + swatchSize + 8) + "px")
                    .style("top", (rect.top + scrollTop) + "px");
            })
            .on("mouseleave", function() {
                tooltip.style("opacity", 0).on("transitionend", function(event) {
                    if (event.propertyName === "opacity" && tooltip.style("opacity") === "0") {
                        tooltip.style("display", "none");
                        tooltip.on("transitionend", null);
                    }
                });
            });

        enter.append("div").attr("class", "legend-swatch")
            .style("width", swatchSize + "px")
            .style("height", swatchSize + "px")
            .style("border-radius", "7px")
            .style("border", "1px solid #ccc");

        // update existing + newly entered items
        const merged = enter.merge(items);

        merged.select(".legend-swatch")
            .style("background-color", d => (colors && colors[d]) || fallbackColor(d))
            .style("opacity", d => hiddenDatasets.has(d) ? 0.25 : 1);
    }

    // create canvas for drawing data lines (below SVG axes)
    const canvas = container.append('canvas')
        .attr('class', 'pc-canvas')
        .style('position', 'absolute')
        .style('left', '0px')
        .style('top', '0px')
        .style('z-index', 1)
        .node();

    const ctx = canvas.getContext('2d');
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // svg overlay for axes + brushes
    const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style('position', 'absolute')
        .style('left', '0px')
        .style('top', '0px')
        .style('z-index', 2)
        .property("value", []);

    // draw axes groups (same as before)
    const axes = svg.append("g")
        .selectAll("g")
        .data(keys)
        .join("g")
        .attr("transform", (d) => `translate(0,${y(d)})`)
        .each(function (d) {
            d3.select(this).call(d3.axisBottom(x.get(d)).ticks(5).tickFormat(customTickFormat));
        })
        .call((g) =>
            g.append("text")
                .attr("x", marginLeft)
                .attr("y", -6)
                .attr("text-anchor", "start")
                .attr("fill", "currentColor")
                .text((d) => d)
        )
        .call((g) =>
            g.selectAll("text")
                .clone(true)
                .lower()
                .attr("fill", "none")
                .attr("stroke-width", 5)
                .attr("stroke-linejoin", "round")
                .attr("stroke", "white")
        );

    // Brush behaviour (per-axis)
    const selectionsFromAxis = new Map();

    function handleSelection(event, fieldSelected) {
        const selection = event.selection;
        if (selection === null) {
            selectionsFromAxis.delete(fieldSelected);
        } else {
            // convert pixels -> domain values
            const vals = selection.map(v => x.get(fieldSelected).invert(v));
            selectionsFromAxis.set(fieldSelected, vals);
        }

        const selectRanges = Array.from(
            selectionsFromAxis,
            ([field, [min, max]]) => ({
                range: [min, max],
                field: field,
                type: "numerical",
            })
        );

        updatePlotsFun(selectRanges);
    }

    // const throttledHandleSelection = throttle((event, field) => handleSelection(event, field), 50);
    const throttledHandleSelection = handleSelection;
    

    const brushHeight = 50;
    const brush = d3.brushX()
        .extent([[marginLeft, -(brushHeight / 2)], [width - marginRight, brushHeight / 2]]);

    axes.call(g => g.call(brush.on("start brush end", function(event, d) { throttledHandleSelection(event, d); })));

    // initial legend
    const initialUtils = utils();
    const initialAllDataSets = typeof initialUtils.allDataSets === "function" ? (initialUtils.allDataSets() || []) : (initialUtils.allDataSets || []);
    const initialColors = initialUtils.colorsPerDataSet || initialUtils.colors || {};
    renderLegend(initialAllDataSets, initialColors);

    // Precompute polyline points for each datum for faster draws and simple bounding boxes for hit-testing
    const polylines = data.map(d => {
        const pts = keys.map(k => {
            const v = d[k];
            const num = v == null || v === "" ? null : Number(v);
            return (num == null || !Number.isFinite(num)) ? null : [x.get(k)(num), y(k)];
        }).filter(p => p != null);
        // bbox
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
            if (p[0] < minX) minX = p[0];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[1] > maxY) maxY = p[1];
        }
        if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
        return { pts, bbox: [minX, minY, maxX, maxY] };
    });

    // draw all polylines to canvas according to dataset and hidden sets
    function drawCanvas(allDataSets, colors) {
        ctx.clearRect(0, 0, width, height);

        const visibleDatasets = new Set(allDataSets.filter(ds => !hiddenDatasets.has(ds)));

        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const pl = polylines[i];
            if (!pl || pl.pts.length === 0) continue;

            const dsList = dataSetsOfRow(i);
            let chosen = null;
            for (let j = 0; j < dsList.length; j++) {
                if (visibleDatasets.has(dsList[j])) { chosen = dsList[j]; break; }
            }

            const dsColor = chosen ? (colors[chosen] || fallbackColor(chosen)) : unselectedColor;
            const isRowSel = chosen;

            ctx.beginPath();
            const pts = pl.pts;
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);

            // stroke style mapping from original
            ctx.lineWidth = isRowSel ? 0.8 : 0.08;
            ctx.globalAlpha = 1;
            ctx.strokeStyle = dsColor;
            ctx.stroke();
        }
        // restore defaults
        ctx.globalAlpha = 1;
    }

    // simple hit test (throttled) to show title-like tooltip for nearest polyline within tolerance
    const hoverTolerance = 6; // pixels
    const findNearest = (mx, my, colors, allDataSets) => {
        // scan bounding boxes first (cheap), then segment distances for a small candidate set
        const candidates = [];
        for (let i = 0; i < polylines.length; i++) {
            const b = polylines[i].bbox;
            if (mx + hoverTolerance < b[0] || mx - hoverTolerance > b[2] || my + hoverTolerance < b[1] || my - hoverTolerance > b[3]) continue;
            candidates.push(i);
        }
        let best = { idx: -1, dist: Infinity };
        for (const i of candidates) {
            const pts = polylines[i].pts;
            for (let s = 0; s < pts.length - 1; s++) {
                const x1 = pts[s][0], y1 = pts[s][1], x2 = pts[s+1][0], y2 = pts[s+1][1];
                // distance from point to segment
                const A = mx - x1, B = my - y1, C = x2 - x1, D = y2 - y1;
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                let param = lenSq !== 0 ? dot / lenSq : -1;
                let xx, yy;
                if (param < 0) { xx = x1; yy = y1; }
                else if (param > 1) { xx = x2; yy = y2; }
                else { xx = x1 + param * C; yy = y1 + param * D; }
                const dx = mx - xx, dy = my - yy;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < best.dist) { best = { idx: i, dist }; }
            }
        }
        if (best.idx !== -1 && best.dist <= hoverTolerance) return best.idx;
        return -1;
    };

    const throttledMouse = throttle(function(event) {
        const rect = canvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const u = utils();
        const allDataSets = typeof u.allDataSets === "function" ? (u.allDataSets() || []) : (u.allDataSets || []);
        const colors = u.colorsPerDataSet || u.colors || {};
        const idx = findNearest(mx, my, colors, allDataSets);
        if (idx >= 0) {
            const name = data[idx] && data[idx].name ? data[idx].name : "";
            tooltip.html(name)
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY + 6) + "px")
                .style("display", "block")
                .style("opacity", 1);
        } else {
            tooltip.style("opacity", 0).on("transitionend", function(event) {
                if (event.propertyName === "opacity" && tooltip.style("opacity") === "0") {
                    tooltip.style("display", "none");
                    tooltip.on("transitionend", null);
                }
            });
        }
    }, 60);

    canvas.addEventListener('mousemove', throttledMouse);
    canvas.addEventListener('mouseleave', function() {
        tooltip.style("opacity", 0).on("transitionend", function(event) {
            if (event.propertyName === "opacity" && tooltip.style("opacity") === "0") {
                tooltip.style("display", "none");
                tooltip.on("transitionend", null);
            }
        });
    });

    // main updater that matches scatter logic for visibility and coloring
    function updateParallel() {
        const u = utils();
        let allDataSets = typeof u.allDataSets === "function" ? (u.allDataSets() || []) : (u.allDataSets || []);
        const colors = u.colorsPerDataSet || u.colors || {};

        // update legend to reflect current state
        renderLegend(allDataSets, colors);

        // draw to canvas using current hiddenDatasets/colors
        drawCanvas(allDataSets, colors);
    }

    // initial call
    updateParallel();

    // Return updater for external calls (same contract as original)
    return function () {
        updateParallel();
    };
}
