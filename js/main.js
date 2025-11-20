import { scatterPlot } from "./plots/scatterPlot.js";
import { parallelCoordinates } from "./plots/parallelCoordinates.js";
import { histogram } from "./plots/histogram.js";
import { barPlot } from "./plots/barPlot.js";
import { initializeUI } from "./uiLogic/initUI.js";
import { benchMark } from "./core/benchMark.js";
// import { scatterPlotSVG } from "./plots/scatterPlotSVG.js";
// import { histogramSVG } from "./plots/histogramSVG.js";
// import { barPlotSVG } from "./plots/barPlotSVG.js";
// import { parallelCoordinatesSVG } from "./plots/parallelCoordinatesSVG.js";

function run(){
    let plots = [
        scatterPlot,
        histogram,
        barPlot,
        parallelCoordinates,
        // scatterPlotSVG,
        // histogramSVG,
        // barPlotSVG,
        // parallelCoordinatesSVG,
        // scatterPlotly
    ];

    let ip = "181.1.73.207";
    let url = `ws://${ip}:5226/`;
    const BENCHMARK = false;

    if(BENCHMARK){
        benchMark(plots, url).then();
    }else{
        initializeUI(plots, url);
    }
}

run();

