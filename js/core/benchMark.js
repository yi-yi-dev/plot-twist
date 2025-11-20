import { resetLayout } from "./benchMarkUtils/resetLayout.js";
import { createData, dataToTable } from "./benchMarkUtils/dataCreation.js";
import { benchMarkSetUp } from "./benchMarkUtils/setUp.js";
import { logTimingInfo, validateConfig, wait } from "./benchMarkUtils/miscUtils.js";
import * as layout from "./benchMarkUtils/createLayout.js";
import { createFieldGroups, deleteFieldGroups, sendClientInfo, setupSelectionBroadcast } from "./benchMarkUtils/webSocketActiveCommunication.js";
import { brushBackAndForth } from "./benchMarkUtils/brushing.js";
import { loadLayout } from "../uiLogic/gridUtils.js";
import { sendBenchMarkTimings, sendEndTrigger, sendStartTrigger, waitForEndTrigger, waitForStartTrigger } from "./benchMarkUtils/webSocketPassiveCommunication.js";
import { websocketCommunication } from "./websocketCommunication.js";
import {
    generateConfigsSinglePlotForCrossDSLinks, singleBarLayout,
    singleHistLayout, singleParLayout,
    singleScatterLayout,
} from "./benchMarkUtils/createLayout.js";

// TODO: change layout export to include dataset it came from
// TODO: add multiple plots in same client functionality

// TODO: make GitHub pretty with instructions
// TODO: example usage, add gif
// TODO: add introductory text before loadCSV
// TODO: clean plots code

// TODO: test backend install instructions

export async function benchMark(plots, url) {
    let clientId = prompt("Enter clientId:", "");
    // let clientId = 1;
    clientId = Number(clientId);

    // BASE CASE------------------------------------------------------------------------------------------------------//
    // let timeBetween =15500; // 70
    // let waitBetweenTestDuration = 20*1000;
    // let testDuration = 900*1000; // 40

    let timeBetween =70; // 70
    let waitBetweenTestDuration = 5*1000;
    let testDuration = 60*1000; // 40
    let isStaggered = false;
    const baseConfig = {
        dataDistribution: "evenly distributed",
        plotsAmount: 1,
        numColumnsAmount: 30,
        catColumnsAmount: 5,
        entriesAmount: 10_000,
        numDimensionsSelected: 2,
        catDimensionsSelected: 0,
        numFieldGroupsAmount: 1,
        catFieldGroupsAmount: 0,
        brushSize: 0.4,
        stepSize: 0.04,
        numberOfClientBrushing: 1,
        numberOfDataSets: 1,
        testDuration: testDuration,
        dataSetNum: null,
        clientId,
    };
    // BASE CASE------------------------------------------------------------------------------------------------------//

    baseConfig.dataSetNum = clientId % baseConfig.numberOfDataSets;
    let isCustomLayoutSelected = false;
    let layoutData;
    let useCrossDSLinks = false;

    // BENCHMARK CONFIGS HERE-----------------------------------------------------------------------------------------//
    let modifiedConfigs;
    modifiedConfigs = [{ ...baseConfig }];
    // modifiedConfigs = layout.generateConfigsSinglePlot(baseConfig);

    // modifiedConfigs = layout.generateConfigsPassFailMatrix(baseConfig);
    // modifiedConfigs = layout.generateConfigsBrushSizeAndTypeOfData(baseConfig);
    // modifiedConfigs = layout.generateConfigsAmountOfEntries(baseConfig);
    // modifiedConfigs = layout.generateConfigsBrushSizeVsStepSize(baseConfig);
    // modifiedConfigs = layout.generateConfigsStaggeredBrushingEventWith4Clients(baseConfig)
    // isStaggered = true;
    // modifiedConfigs = layout.generateConfigsForEventAnalysis2Clients(baseConfig)

    // modifiedConfigs = layout.generateConfigsBigIntervalBetweenBrushes(baseConfig); // THIS

    // timeBetween = 500;
    // [isCustomLayoutSelected, layoutData] = layout.singleScatterLayout();
    // [isCustomLayoutSelected, layoutData]  = singleHistLayout();
    // [isCustomLayoutSelected, layoutData]  = singleParLayout();
    // [isCustomLayoutSelected, layoutData]  = singleBarLayout()



    // modifiedConfigs = layout.generateConfigsSinglePlotForCrossDSLinks(baseConfig);
    // useCrossDSLinks = true;

    // modifiedConfigs.splice(0, 57)
    // modifiedConfigs.unshift(modifiedConfigs[0]);
    // modifiedConfigs.unshift(modifiedConfigs[0]);
    // modifiedConfigs.unshift(modifiedConfigs[0]);

    // BENCHMARK CONFIGS HERE-----------------------------------------------------------------------------------------//
    let brushIdRef = {
        brushId: 0,
    }

    let websocketCommunicationRef;
    let firstTimeInit = true;
    for (let i = 0; i < modifiedConfigs.length; i++) {
        const cfg = modifiedConfigs[i];
        validateConfig(cfg);

        // Log Percentage of completion
        const percentage = ((i + 1) / modifiedConfigs.length) * 100;
        console.log(
            `(${i + 1} / ${modifiedConfigs.length}): ${percentage.toFixed(2)}%`
        );
        const iterationStart = Date.now();
        console.log(cfg);

        // the main client should start after all the other clients have already been set up
        const isMainClient = clientId === 1;
        if (isMainClient && !firstTimeInit) {
            await wait(waitBetweenTestDuration);
        }

        // create the data and layout from the config information
        const data = createData(
            cfg.entriesAmount,
            cfg.numColumnsAmount,
            cfg.catColumnsAmount,
            cfg.dataDistribution
        );
        const table = dataToTable(data, cfg.catColumnsAmount);
        if (!isCustomLayoutSelected) {
            layoutData = layout.createScatterLayout(
                cfg.plotsAmount,
                cfg.numColumnsAmount
            );
        }

        // set up the whole app in benchmarking mode
        if (firstTimeInit) {
            // socketRef = { socket: undefined };
            websocketCommunicationRef = {
                eventsCoordinator: new websocketCommunication(plots, url)
            };
        }else{
            websocketCommunicationRef.eventsCoordinator.serverCreatedLinks=[];
            websocketCommunicationRef.eventsCoordinator._dataSets=[];
            websocketCommunicationRef.eventsCoordinator._plotCoordinatorPerDataSet=[];
            websocketCommunicationRef.eventsCoordinator._localSelectionPerDataset=[];
            websocketCommunicationRef.eventsCoordinator._serverSelectionPerDataSet=[];
        }

        benchMarkSetUp(
            table,
            null,
            plots,
            url,
            layoutData,
            null,
            cfg.dataSetNum+(i*2), // TODO: change back
            // 1,
            firstTimeInit,
            clientId,
            brushIdRef,
            websocketCommunicationRef,
        );

        await sendClientInfo(cfg, null, clientId, null, websocketCommunicationRef);

        // set up message sending when a brush selection is made
        if (!firstTimeInit) {
            setupSelectionBroadcast(null, null, clientId, brushIdRef, websocketCommunicationRef);
        }
        loadLayout(layoutData, websocketCommunicationRef);

        let name = Object.keys(websocketCommunicationRef.eventsCoordinator._dataSets)[0];
        let pc = websocketCommunicationRef.eventsCoordinator.getDataSetPlotCoordinator(name);
        // set up dummy plot to have the benchmark make selections
        pc.BENCHMARK.isActive = true;
        pc.onSelectionDo((selection, name) => {
            websocketCommunicationRef.eventsCoordinator._localSelectionPerDataset[name] = selection;
            if (websocketCommunicationRef.eventsCoordinator._socket.readyState === WebSocket.OPEN) {
                let msg = {
                    type: "BenchMark",
                    benchMark: {
                        action: "processBrushInServer",
                        clientsSelections: [
                            {
                                selectionPerDataSet: [
                                    {
                                        dataSetName: name,
                                        indexesSelected: selection,
                                    },
                                ],
                            },
                        ],
                        clientId: clientId,
                        brushId: brushIdRef.brushId,
                    },

                };
                websocketCommunicationRef.eventsCoordinator._socket.send(JSON.stringify(msg));
            }
        });
        pc.addPlot(-1,()=>{});
        pc.onBenchmarkDo(
            (measurement,wasSent)=>{
                sendBenchMarkTimings(null, null, brushIdRef, clientId, measurement, wasSent, websocketCommunicationRef);
            },
            (measurement,wasSent)=>{
                sendBenchMarkTimings(null, null, brushIdRef, clientId, measurement, wasSent, websocketCommunicationRef);
            }
        )
        // pc.addPlot(-1,
        //     (measurement, wasSent)=>{
        //         sendBenchMarkTimings(socketRef, pcRef, brushIdRef, clientId, measurement, wasSent);
        //     }
        // );

        // have the main client make all the field groups
        if (isMainClient) {
            if(cfg.numberOfDataSets>=2 && useCrossDSLinks){

                await createFieldGroups(
                    null,
                    cfg.numFieldGroupsAmount,
                    cfg.catFieldGroupsAmount,
                    null,
                    websocketCommunicationRef,
                    cfg.numberOfDataSets,
                    i*2
                );
            }else{
                deleteFieldGroups(
                    null,
                    cfg.numFieldGroupsAmount,
                    cfg.catFieldGroupsAmount,
                    null,
                    websocketCommunicationRef
                );
            }

            await sendStartTrigger(null, websocketCommunicationRef);
        }

        // when the start trigger is received start brushing back and forth (if it is an active client)
        await waitForStartTrigger(null, websocketCommunicationRef);

        if (clientId <= cfg.numberOfClientBrushing) {
            await brushBackAndForth(
                cfg.testDuration,
                cfg.stepSize,
                cfg.numDimensionsSelected,
                cfg.catDimensionsSelected,
                null,
                cfg.brushSize,
                null,
                clientId,
                timeBetween,
                isStaggered,
                cfg.numberOfClientBrushing,
                websocketCommunicationRef
            );
            // await wait(60*60*1000);
        }

        // have the main client clean up and send the end trigger
        if (isMainClient) {
            // for (
            //     let dataSetNum = 0;
            //     dataSetNum < cfg.numberOfDataSets;
            //     dataSetNum++
            // ) {
            deleteFieldGroups(
                null,
                cfg.numFieldGroupsAmount,
                cfg.catFieldGroupsAmount,
                null,
                websocketCommunicationRef
            );
            // }
            await wait(waitBetweenTestDuration);
            sendEndTrigger(null, websocketCommunicationRef);
        }

        // finish when the end trigger is received
        await waitForEndTrigger(null, null, websocketCommunicationRef);
        resetLayout();
        await wait(100);
        firstTimeInit = false;

        logTimingInfo(iterationStart, i, modifiedConfigs.length);
    }
}
