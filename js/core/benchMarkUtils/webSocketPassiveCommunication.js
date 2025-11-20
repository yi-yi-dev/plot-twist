import { debounce } from "lodash-es";

export function createSocketMessageHandler({
    pcRef,
    socketRef,
}) {
    // return function onSocketMessage(event) {
    //     const receivedData = JSON.parse(event.data);
    //
    //     switch (receivedData.type) {
    //         case 'link':
    //             populateGroups(receivedData.links, pcRef.pc.fields(), socketRef, pcRef);
    //             break;
    //         case "selection":
    //             pcRef.pc.throttledUpdatePlotsView(0, receivedData.range ?? []);
    //             break;
    //     }
    // };

    const processSelection = debounce((range) => {
        pcRef.pc.throttledUpdatePlotsView(0, range);
    }, 0, { leading: false, trailing: true });

    return ({ data }) => {
        const msg = JSON.parse(data);
        if (msg.type === 'selection') {
            processSelection(msg.range ?? []);
        } else if (msg.type === 'link') {
            populateGroups(msg.links, pcRef.pc.fields(), socketRef, pcRef);
        }
    };

}

export function sendBenchMarkTimings(socketRefx, pcRefx, brushIdRef, clientId, measurement, wasSent, websocketCommunicationRef) {
    let message;
    let name = Object.keys(websocketCommunicationRef.eventsCoordinator._dataSets)[0];
    let pc = websocketCommunicationRef.eventsCoordinator.getDataSetPlotCoordinator(name);
    let socket = websocketCommunicationRef.eventsCoordinator._socket;

    if(measurement === "postIndex") {
        let timeToProcessBrushLocally = pc.BENCHMARK.deltaUpdateIndexes;
        message = {
            type: "BenchMark",
            benchMark: {
                action: "updateIndexes",
                timeToProcessBrushLocally: timeToProcessBrushLocally,
                brushId: brushIdRef.brushId,
                clientId: clientId,
                isActiveBrush: wasSent,
            },
        };
    }
    if(measurement === "postPlots") {
        let timeToUpdatePlots = pc.BENCHMARK.deltaUpdatePlots;
        message = {
            type: "BenchMark",
            benchMark: {
                action: "updatePlots",
                timeToUpdatePlots: timeToUpdatePlots,
                brushId: brushIdRef.brushId,
                clientId: clientId,
                isActiveBrush: wasSent,
            },
        };
        brushIdRef.brushId++;
    }

    // let socket = socketRef.socket;
    socket.send(JSON.stringify(message));
}

export function waitForStartTrigger(socketRefx, websocketCommunicationRef) {
    // const socket = socketRef.socket;
    let socket = websocketCommunicationRef.eventsCoordinator._socket;


    return new Promise((resolve) => {
        function startHandler(evt) {
            const data = JSON.parse(evt.data);
            if (
                data.type === "BenchMark" &&
                data.benchMark.action === "start"
            ) {
                console.log("BenchMark Started");
                socket.removeEventListener("message", startHandler);
                resolve(data);
            }
        }

        socket.addEventListener("message", startHandler);
    });
}

export function waitForEndTrigger(socketRefx, pcRefx, websocketCommunicationRef) {
    // let socket = socketRef.socket;
    let socket = websocketCommunicationRef.eventsCoordinator._socket;
    let name = Object.keys(websocketCommunicationRef.eventsCoordinator._dataSets)[0];
    let pc = websocketCommunicationRef.eventsCoordinator.getDataSetPlotCoordinator(name);

    return new Promise((resolve) => {
        function handler(event) {
            const receivedData = JSON.parse(event.data);
            if (
                receivedData.type === "BenchMark" &&
                receivedData.benchMark.action === "end"
            ) {
                console.log("   BenchMark Ended");
                socket.removeEventListener("message", handler);

                socket.onmessage = function (event) {
                    const receivedData = JSON.parse(event.data);
                    switch (receivedData.type) {
                        case "link":
                            // TODO:
                            // populateGroups(
                            //     receivedData.links,
                            //     pc.fields(),
                            //     socketRef,
                            //     pcRef
                            // );
                            break;
                    }
                };

                resolve(receivedData);
            }
        }

        socket.addEventListener("message", handler);
    });
}

export function sendEndTrigger(socketRef, websocketCommunicationRef) {
    // let socket = socketRef.socket;
    let socket = websocketCommunicationRef.eventsCoordinator._socket;

    let message = {
        type: "BenchMark",
        benchMark: {
            action: "end",
        },
    };

    socket.send(JSON.stringify(message));
    console.log(">>END");
}

export function sendStartTrigger(socketRefx, websocketCommunicationRef) {
    // let socket = socketRef.socket;
    let socket = websocketCommunicationRef.eventsCoordinator._socket;


    return new Promise((resolve) => {
        function sendLinkGroups() {
            let message = {
                type: "BenchMark",
                benchMark: {
                    action: "start",
                },
            };

            socket.send(JSON.stringify(message));
            console.log(">>START");

            resolve();
        }

        if (socket.readyState === WebSocket.OPEN) {
            sendLinkGroups();
        } else {
            socket.addEventListener(
                "open",
                () => {
                    sendLinkGroups();
                },
                { once: true }
            );
        }
    });
}
