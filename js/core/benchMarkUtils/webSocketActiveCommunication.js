import { rangeSet } from "../rangeSet.js";

export function setupSelectionBroadcast(pcRefx, socketRefx, clientId, brushIdRef, websocketCommunicationRef) {
    let socket = websocketCommunicationRef.eventsCoordinator._socket;
    let name = Object.keys(websocketCommunicationRef.eventsCoordinator._dataSets)[0];
    let pc = websocketCommunicationRef.eventsCoordinator.getDataSetPlotCoordinator(name);

    pc.addPlot(0, () => {
        let selection = new rangeSet();
        for (let [id, plot] of pc._plots.entries()) {
            if (id !== 0) {
                selection.addSelectionArr(JSON.parse(JSON.stringify(plot.lastSelectionRange)));
            }
        }

        // const message = {
        //     type: "selection",
        //     range: selection.toArr(),
        // };

        let message = {
            type: "BenchMark",
            benchMark: {
                action: "processBrushInServer",
                range: selection.toArr(),
                clientId: clientId,
                brushId: brushIdRef.brushId,
            },
        };

        socket.send(JSON.stringify(message));
    });
}

export function sendClientInfo(clientInfo, socketRefx, clientId, pcRefx, websocketCommunicationRef) {
    // let socket = socketRef.socket;
    let socket = websocketCommunicationRef.eventsCoordinator._socket;
    let name = Object.keys(websocketCommunicationRef.eventsCoordinator._dataSets)[0];
    let fields = websocketCommunicationRef.eventsCoordinator.getDataSetPlotCoordinator(name).fields();
    return new Promise((resolve) => {
        function sendClientInfoWhenOpen() {
            let message = {
                type: "BenchMark",
                benchMark: {
                    action: "addClientBenchMark",
                    clientInfo: clientInfo,
                    clientId,
                },
                dataSet: [{
                    name: name,
                    fields: fields
                }],
                // dataSet: { name: pcRef.pc.dsName, fields: pcRef.pc.fields() },
            };

            socket.send(JSON.stringify(message));

            resolve();
        }

        if (socket.readyState === WebSocket.OPEN) {
            sendClientInfoWhenOpen();
        } else {
            socket.addEventListener("open", () => {
                sendClientInfoWhenOpen();
            }, { once: true });
        }
    });
}

// TODO: refactor to use new links
export function createFieldGroups(socketRefx, numFieldGroupsAmount, catFieldsGroupsAmountx, dataSetNumx, websocketCommunicationRef, numberOfDataSets, dataSetId) {
    // let socket = socketRef.socket;
    let socket = websocketCommunicationRef.eventsCoordinator._socket;
    let links = [
        // {
        //     type: "Direct Link",
        //     id: 1,
        //     state: {
        //         dataSet1: "BenchMarkData0",
        //         dataSet2: "BenchMarkData1",
        //         inputField: "Sqrt(Pow(X.field0 - Y.field0, 2) + Pow(X.field1 - Y.field1, 2)) <= 0.2"
        //     },
        //     isError: false,
        // },
        // {
        //     type: "Bidirectional Link",
        //     id: 2,
        //     state: {
        //             dataSet1: "BenchMarkData0",
        //             dataSet2: "BenchMarkData1",
        //             inputField: "Sqrt(Pow(X.field1 - Y.field2, 2) + Pow(X.field2 - Y.field2, 2)) <= 0.2"
        //         },
        //     isError: false,
        // }
    ];
    // for (let dataSetNum = 0; dataSetNum < numberOfDataSets; dataSetNum++) {
    let dataSetNum=0;
        let newLink = {
            type: "Direct Link",
            id: 1,
            state: {
                dataSet1: `BenchMarkData${dataSetId+1}`,
                dataSet2: `BenchMarkData${dataSetId}`,
                inputField: `Sqrt(Pow(X.field${dataSetNum} - Y.field${dataSetNum}, 2) + Pow(X.field${dataSetNum+1} - Y.field${dataSetNum+1}, 2)) <= 0.1`
            },
            isError: false,
        };
        links.push(newLink);
    // }

    return new Promise((resolve) => {
        function sendLinkGroups() {
            let msg = {
                type: "link",
                links: links,
                linksOperator: "And",
            };

            socket.send(JSON.stringify(msg));

            resolve();
        }

        if (socket.readyState === WebSocket.OPEN) {
            sendLinkGroups();
        } else {
            socket.addEventListener("open", () => {
                sendLinkGroups();
            }, { once: true });
        }
    });
}


export function deleteFieldGroups(socketRefx, numFieldGroupsAmount, catFieldsGroupsAmount, dataSetNum, websocketCommunicationRef) {
    // let socket = socketRef.socket;
    let socket = websocketCommunicationRef.eventsCoordinator._socket;

    let msg = {
        type: "link",
        links: [],
        linksOperator: "And",
    };

    socket.send(JSON.stringify(msg));
}
