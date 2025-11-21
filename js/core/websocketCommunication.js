import { PlotCoordinator } from "./plotCoordinator.js";
import { refreshLinkWidgetsErrorState, updateCrossDataSetLinkTable } from "../uiLogic/crossDataSetLinksTable.js";
import { adjustBodyStyle } from "../uiLogic/gridUtils.js";
import { showOffErrorMsg } from "../uiLogic/crossDataSetLinksTable.js";

export class websocketCommunication {
    _plotCoordinatorPerDataSet = [];

    _plotsModules = null;

    _url = null;
    _socket = null;

    _localSelectionPerDataset = [];
    _serverSelectionPerDataSet = [];
    _serverCrossSelectionPerDataSet;

    _dataSets = [];

    linkOperator = "And"
    serverCreatedLinks = [
        // {
        //     type: "Direct Link",
        //     id: 1,
        //     state: {
        //         dataSet1: "demo",
        //         dataSet2: null,
        //         inputField: ""
        //     },
        //     isError: true,
        // },
        // {
        //     type: "Bidirectional Link",
        //     id: 2,
        //     state: {
        //             dataSet1: "demo",
        //             dataSet2: "demo",
        //             inputField: ""
        //         },
        //     isError: false,
        // }
    ];

    sendUpdatedLinks(){
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) return;

        let msg = {
            type: "link",
            links: this.serverCreatedLinks,
            linksOperator: this.linkOperator,
        };

        this._socket.send(JSON.stringify(msg));
    }

    constructor(plots, url) {
        this._plotsModules = plots;
        this._url = url;
    }

    sendSelection(selection, dsName) {
        this._localSelectionPerDataset[dsName] = selection;
        if (this._socket.readyState === WebSocket.OPEN) {
            let msg = {
                type: "selection",
                clientsSelections: [
                    {
                        debugTimeSent: Date.now(),
                        selectionPerDataSet: [
                            {
                                dataSetName: dsName,
                                indexesSelected: selection,
                            },
                        ],
                    },
                ],
            };
            // console.log("Msg sent:");
            // console.log(msg.clientsSelections[0].selectionPerDataSet[0].indexesSelected);
            // console.log("---------------------------");
            // console.log(JSON.stringify(msg));
            this._socket.send(JSON.stringify(msg));
        }
    }

    createWebSocketConnection() {
        this._socket = new WebSocket(this._url);

        this._socket.onopen = () => {
            const message = {
                type: "addClient",
            };

            this._socket.send(JSON.stringify(message));
        }

        this._socket.onmessage = ({ data }) => {
            const msg = JSON.parse(data);
            // console.log(`Received ${msg.type}`);
            // console.log(msg);

            if (msg.type === "selection") {
                // console.log(msg.clientsSelections);
                let selection = msg.clientsSelections[0].selectionPerDataSet;
                this._serverSelectionPerDataSet = selection;
                this.updateStateOfPlotCoordinators();
            } else if (msg.type === 'link') {
                this.serverCreatedLinks = msg.links;
                this.linkOperator = msg.linksOperator;
                this._dataSets = Object.fromEntries(
                    msg.dataSet.map(ds => [ds.name, {
                        fields: ds.fields,
                        dataSetColorIndex: ds.dataSetColorIndex
                    }])
                );
                // console.log("Received selection");
                // console.log(this._dataSets);
                updateCrossDataSetLinkTable({ eventsCoordinator: this }, false);
            }else if (msg.type === "crossSelection") {
                this._serverCrossSelectionPerDataSet = msg.dataSetCrossSelection;
                // console.log(`Received ${msg.type}`);
                // console.log(this._serverCrossSelectionPerDataSet);
                this.updateStateOfPlotCoordinators()
            }else if (msg.type === "linkUpdate"){
                this.serverCreatedLinks = msg.links;
                this.linkOperator = msg.linksOperator;
                this._dataSets = Object.fromEntries(
                    msg.dataSet.map(ds => [ds.name, {
                        fields: ds.fields,
                        dataSetColorIndex: ds.dataSetColorIndex
                    }])
                );
                refreshLinkWidgetsErrorState({ eventsCoordinator: this });
            }
            adjustBodyStyle();
        };

        this._socket.onclose = function () {
            console.log("WebSocket connection closed");
            showOffErrorMsg("The connection to the server was lost");
        };

        this._socket.onerror = function (error) {
            console.log("WebSocket error:", error);
            console.log("The server is offline");
            showOffErrorMsg("An error occurred trying to connect to the server");
        };

        document.getElementById("slide-menu-btn").style.display = "flex";
    }

    plotTypes() {
        return this._plotsModules;
    }

    sendDataSetInfo(dataSet, dataSetName) {
        let pc = this.getDataSetPlotCoordinator(dataSetName);

        // Find the current highest dataSetColorIndex
        const currentIndices = Object.values(this._dataSets).map(ds => ds.dataSetColorIndex ?? -1);
        let nextIndex = currentIndices.length ? Math.max(...currentIndices) + 1 : 0;
        this._dataSets[dataSetName] = {
            fields: pc.fields(),
            dataSetColorIndex: nextIndex,
        };

        // Early return for empty dataset (keeps behavior sensible regardless of socket state)
        if (!dataSet.length) {
            this.updateStateOfPlotCoordinators();
            return { columns: [], rows: [] };
        }

        const columns = Object.keys(dataSet[0]);
        const rows = dataSet.map(obj =>
            columns.map(key => (typeof obj[key] === 'number' ? obj[key] : String(obj[key])))
        );

        const msg = {
            type: "addDataSet",
            dataSet: [
                {
                    name: dataSetName,
                    fields: pc.fields(),
                    table: { columns, rows },
                    length: pc.entries().length,
                }
            ],
        };

        // Ensure a queue exists on the instance
        this._sendQueue = this._sendQueue || [];

        const flushQueue = () => {
            // Only flush if socket is open
            if (!this._socket || this._socket.readyState !== WebSocket.OPEN) return;
            while (this._sendQueue.length) {
                try {
                    this._socket.send(JSON.stringify(this._sendQueue.shift()));
                } catch (err) {
                    // On send failure re-queue the message and stop flushing for now
                    console.error("Failed to send queued message, will retry later:", err);
                    // push back and break
                    // (we re-insert at front)
                    this._sendQueue.unshift(this._sendQueue.shift());
                    break;
                }
            }
            // remove listener flag so we can reattach if a new socket is assigned
            this._openFlushAttached = false;
        };

        // If socket is open — send immediately
        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
            this._socket.send(JSON.stringify(msg));
        } else if (this._socket && this._socket.readyState === WebSocket.CONNECTING) {
            // queue and attach a one-time open listener to flush
            this._sendQueue.push(msg);
            if (!this._openFlushAttached) {
                const onOpen = () => {
                    flushQueue();
                    // remove listener after flushing
                    if (this._socket) this._socket.removeEventListener('open', onOpen);
                };
                this._socket.addEventListener('open', onOpen);
                this._openFlushAttached = true;
            }
        } else {
            // socket is null, CLOSING, or CLOSED: queue the message and rely on higher-level code
            // to call flushQueue (or reattach) after reconnecting/replacing this._socket.
            // We still enqueue so the message isn't lost.
            this._sendQueue.push(msg);
            // Optionally expose flush function so external reconnection logic can call it:
            this.flushPendingSends = flushQueue.bind(this);
            console.warn("WebSocket not open; message queued. Call this.flushPendingSends() after reconnect.");
        }

        this.updateStateOfPlotCoordinators();
    }

    addDataSet(dataSet, dataSetName, broadcastSelection = true) {
        const existingIndex = this._plotCoordinatorPerDataSet.findIndex(pc => pc.dsName === dataSetName);

        // Create new PlotCoordinator
        const plotCoordinator = new PlotCoordinator();
        plotCoordinator.init(dataSet, dataSetName);
        if(broadcastSelection){
            plotCoordinator.onSelectionDo((selection, name) => {
                this.sendSelection(selection, name);
            });
        }

        // Replace if exists, otherwise unshift
        if (existingIndex !== -1) {
            this._plotCoordinatorPerDataSet[existingIndex] = plotCoordinator;
        } else {
            this._plotCoordinatorPerDataSet.unshift(plotCoordinator);
        }

        this.sendDataSetInfo(dataSet, dataSetName);
        this.updateStateOfPlotCoordinators();
        updateCrossDataSetLinkTable({ eventsCoordinator: this });
    }

    updateStateOfPlotCoordinators() {
        for (let plotCoordinator of this._plotCoordinatorPerDataSet) {
            let dsName = plotCoordinator.dsName;
            let dsServerSelection;
            for (let ds of this._serverSelectionPerDataSet) {
                if (ds.dataSetName === dsName) {
                    dsServerSelection = ds;
                    break;
                }
            }
            let indexesSelected = dsServerSelection ? dsServerSelection.indexesSelected : Array(plotCoordinator.entries().length).fill(true);

            if(this._serverCrossSelectionPerDataSet){
                let selectedBy = this._serverCrossSelectionPerDataSet.find(item => item["DataSet"] === dsName);
                if(this._serverCrossSelectionPerDataSet && selectedBy){
                    selectedBy = selectedBy["SelectedByIds"];
                    plotCoordinator.updateCrossSelection(selectedBy);
                }
            }

            let dataSetColorIndex = this._dataSets[dsName].dataSetColorIndex;
            plotCoordinator.updateDefaultColor(dataSetColorIndex);
            const colorsPerDataSet = Object.fromEntries(
                Object.entries(this._dataSets).map(([name, value]) => [name, value.dataSetColorIndex])
            );
            plotCoordinator.updateDataSetsColors(colorsPerDataSet);
            let newSelection = {type: "index", indexes: indexesSelected};
            plotCoordinator.throttledUpdatePlotsView(0, [newSelection]);
        }

        const container = document.getElementById("plotsContainer");
        const elements = container.getElementsByClassName("plotAndDeleteButton-container");
        for (const element of elements) {
            const jsonData = JSON.parse(element.getAttribute("data-json"));
            let dataSet = jsonData.dataSet;
            if(dataSet){
                const matchingPlot = this._plotCoordinatorPerDataSet.find(p => p.dsName === dataSet);
                let color = matchingPlot.dataSetColor();
                element.style.borderColor = color;
            }
        }
    }

    getDataSetPlotCoordinator(dataSetName) {
        return this._plotCoordinatorPerDataSet[0];
        // return this._plotCoordinatorPerDataSet.find(pc => pc.dsName === dataSetName);
    }

    removeAllPlots() {
        for (let plotCoordinator of this._plotCoordinatorPerDataSet) {
            plotCoordinator.removeAll();
        }
    }
}