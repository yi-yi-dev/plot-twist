import { wait } from "./miscUtils.js";

function createSelection(a, b, numFields, catFields) {
    const numericalSelections = Array.from({ length: numFields }, (_, i) => ({
        range: [a, b],
        field: `field${i}`,
        type: "numerical",
    }));

    const categoricalSelections = Array.from({ length: catFields }, (_, i) => ({
        categories: ["A", "B", "C"],
        field: `catField${i}`,
        type: "categorical",
    }));

    return [...numericalSelections, ...categoricalSelections];
}

export async function brushBackAndForth(
    timeAmount,
    stepSize,
    numDimensionsSelected,
    catDimensionsSelected,
    pcRefx,
    brushSize,
    socketRefx,
    clientId,
    timeBetween,
    isStaggered,
    numberOfClientBrushing,
    websocketCommunicationRef
) {
    let name = Object.keys(websocketCommunicationRef.eventsCoordinator._dataSets)[0];
    let pc = websocketCommunicationRef.eventsCoordinator.getDataSetPlotCoordinator(name);

    const startPos = 0.3;
    const endPos = 0.7;
    let x = startPos;
    let forward = true;

    // compute when (in ms) this client should start
    let startDelay = 0;
    if (isStaggered) {
        const frac = (numberOfClientBrushing - clientId) / numberOfClientBrushing;
        startDelay = timeAmount * frac;
    }

    let elapsed = 0;    // total elapsed (including enforced waits)

    while (timeAmount > 0) {
        const t0 = performance.now();

        // advance x back-and-forth
        if (forward) {
            x += stepSize;
            if (x >= endPos) forward = false;
        } else {
            x -= stepSize;
            if (x <= startPos) forward = true;
        }

        // only update once we've passed our stagger offset
        if (!isStaggered || elapsed >= startDelay) {
            const a = x - brushSize / 2;
            const b = x + brushSize / 2;
            const selection = createSelection(
                a,
                b,
                numDimensionsSelected,
                catDimensionsSelected
            );
            pc.updatePlotsView(-1, selection);
        }

        // enforce minimum loop time
        const delta = performance.now() - t0;
        const waitFor = timeBetween - delta;
        if (waitFor > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitFor));
            elapsed += timeBetween;
            timeAmount -= timeBetween;
        } else {
            // iteration already took ≥ timeBetween
            elapsed += delta;
            timeAmount -= delta;
        }
    }

    // clear brush
    await wait(300);
    pc.updatePlotsView(-1, []);
    await wait(300)
    pc.updatePlotsView(-1, []);
    await wait(300)
    pc.updatePlotsView(-1, []);

}

