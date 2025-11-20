import { initLinkMenuResize, initTopBarScroll } from "../../uiLogic/topBarScroll.js";
import {
    createWebSocketConnection,
    initExportLayout,
    initGridResizing,
    initLoadCsv,
    initLoadLayout,
} from "../../uiLogic/initUI.js";
// import { updateCrossDataSetLinkTable } from "../../uiLogic/crossDataSetLinksTable.js";
import { adjustBodyStyle} from "../../uiLogic/gridUtils.js";
import {
    refreshLinkWidgetsErrorState,
    showOffErrorMsg,
    updateCrossDataSetLinkTable,
} from "../../uiLogic/crossDataSetLinksTable.js";


export function benchMarkSetUp(
    data,
    pcRefx,
    plots,
    url,
    layoutData,
    socketRefx,
    dataSetNum,
    firstTimeInit,
    clientId,
    brushIdRef,
    websocketCommunicationRef,
) {
    initTopBarScroll();
    initLinkMenuResize();
    initExportLayout();
    initLoadLayout(websocketCommunicationRef);
    initGridResizing(websocketCommunicationRef);
    // updateCrossDataSetLinkTable(pcRef, socketRef);
    initLoadCsv(websocketCommunicationRef);
    // createWebSocketConnection(websocketCommunicationRef);

    let ws = websocketCommunicationRef.eventsCoordinator;
    {
        ws.url = url;
        ws._socket = new WebSocket(url);

        ws._socket.onopen = () => {
            // const message = {
            //     type: "addClient",
            // };
            //
            // this._socket.send(JSON.stringify(message));
            // ws._socket.send(JSON.stringify(message));
        }

        ws._socket.onmessage = ({ data }) => {
            const msg = JSON.parse(data);
            // console.log(`Received ${msg.type}`);
            // console.log(msg);
            if (msg.type === "selection") {
                // console.log(msg.clientsSelections);
                let selection = msg.clientsSelections[0].selectionPerDataSet;
                ws._serverSelectionPerDataSet = selection;
                ws.updateStateOfPlotCoordinators();
            } else if (msg.type === 'link') {
                // TODO: handle ?
                ws.serverCreatedLinks = msg.links;
                ws.linkOperator = msg.linksOperator;
                ws._dataSets = Object.fromEntries(
                    msg.dataSet.map(ds => [ds.name, {
                        fields: ds.fields,
                        dataSetColorIndex: ds.dataSetColorIndex
                    }])
                );
                // console.log("Received selection");
                // console.log(this._dataSets);
                updateCrossDataSetLinkTable({ eventsCoordinator: ws }, false);
            }else if (msg.type === "crossSelection") {
                ws._serverCrossSelectionPerDataSet = msg.dataSetCrossSelection;
                // console.log(`Received ${msg.type}`);
                // console.log(this._serverCrossSelectionPerDataSet);
                ws.updateStateOfPlotCoordinators()
            }else if (msg.type === "linkUpdate"){
                ws.serverCreatedLinks = msg.links;
                ws.linkOperator = msg.linksOperator;
                ws._dataSets = Object.fromEntries(
                    msg.dataSet.map(ds => [ds.name, {
                        fields: ds.fields,
                        dataSetColorIndex: ds.dataSetColorIndex
                    }])
                );
                refreshLinkWidgetsErrorState({ eventsCoordinator: ws });
            }
            adjustBodyStyle();
        };

        ws._socket.onclose = function () {
            console.log("WebSocket connection closed");
            showOffErrorMsg("The connection to the server was lost");
        };

        ws._socket.onerror = function (error) {
            console.log("WebSocket error:", error);
            console.log("The server is offline");
            showOffErrorMsg("An error occurred trying to connect to the server");
        };

        document.getElementById("slide-menu-btn").style.display = "flex";
    }


    const container = document.getElementById("plotsContainer");
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    websocketCommunicationRef.eventsCoordinator.addDataSet(data,`BenchMarkData${dataSetNum}`, false);
    // pcRef.pc = new PlotCoordinator();
    // pcRef.pc.init(data, `BenchMarkData${dataSetNum}`);

    document.getElementById("col").style.display = "flex";
    document.getElementById("row").style.display = "flex";
    document.getElementById("loadLayoutButton").style.display = "flex";
    document.getElementById("exportLayoutButton").style.display = "flex";

    // TODO: re-utilize socket connection
    // if(firstTimeInit){
    //     socketRef.socket = new WebSocket(url);
    //     const socket = socketRef.socket;
    //
    //     socket.onopen = function() {
    //         setupSelectionBroadcast(pcRef, socketRef, clientId, brushIdRef);
    //         document.getElementById("slide-menu-btn").style.display = "flex";
    //     };
    //
    //     socket.onerror = function(e) {
    //         console.log(e);
    //     };
    // } else {
    //     document.getElementById("slide-menu-btn").style.display = "flex";
    // }
    // socketRef.socket.onmessage = createSocketMessageHandler({
    //     pcRef,
    //     socketRef
    // });

    adjustBodyStyle();
}
