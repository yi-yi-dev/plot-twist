
import deleteIcon from '../../assets/delete_icon.svg';
import { directFieldLink } from "./crossTableLinksWidgets/directFieldLink.js";
import { bidirectionalFieldLink } from "./crossTableLinksWidgets/BidirectionalLink.js";

export function showOffErrorMsg(errorMsg) {
    let containerDiv = document.querySelector(".error-msg-container");

    if (!containerDiv) {
        containerDiv = document.createElement("div");
        containerDiv.className = "error-msg-container";
        document.body.appendChild(containerDiv);
    }

    const messageDiv = document.createElement("div");
    messageDiv.className = "error-msg";
    messageDiv.textContent = errorMsg;

    const closeButton = document.createElement("span");
    closeButton.className = "close-button";

    const icon = document.createElement("img");
    icon.src = deleteIcon;
    icon.alt = "Close";
    icon.className = "close-icon";

    icon.onclick = function () {
        messageDiv.remove();
    };

    closeButton.appendChild(icon);
    messageDiv.appendChild(closeButton);
    containerDiv.appendChild(messageDiv);
}

let linkUIWidgetsTypes = [
    bidirectionalFieldLink,
    directFieldLink
];

export function refreshLinkWidgetsErrorState(eventsCoordinatorRef) {
    const websocketCommunication = eventsCoordinatorRef.eventsCoordinator;
    if (!websocketCommunication || !Array.isArray(websocketCommunication.serverCreatedLinks)) return;

    for (let fooLinkInfo of websocketCommunication.serverCreatedLinks) {
        const id = String(fooLinkInfo.id);
        // find the wrapper created by createLinkWidget
        const wrapper = document.querySelector(`.group-wrapper[data-link-id="${id}"]`);
        if (!wrapper) continue;

        const instance = wrapper._linkInstance || wrapper.linkWidget || null;

        if (instance && typeof instance.updateErrorState === 'function') {
            // direct call if available
            instance.updateErrorState(Boolean(fooLinkInfo.isError));
        } else {
            // fallback: dispatch event the widget can listen to
            wrapper.dispatchEvent(new CustomEvent('link:updateErrorState', {
                detail: { isError: Boolean(fooLinkInfo.isError), linkId: id }
            }));
        }
    }
}

let widgetZIndexCounter = 100;

export function updateCrossDataSetLinkTable(eventsCoordinatorRef, shouldSendUpdate=true) {
    let websocketCommunication = eventsCoordinatorRef.eventsCoordinator;
    document.getElementById("group-name-submit").innerHTML = "Add Link";
    const select = document.getElementById("field-group-name");
    select.innerHTML = "";
    document.getElementById("groups-list").innerHTML = "";

    // AND / OR button
    const btns = document.querySelectorAll('.group-component-buttons button');
    btns.forEach(b => b.classList.remove('active'));
    btns.forEach(btn => {
        if (websocketCommunication.linkOperator === "Or") {
            if (btn.id === 'or-btn') {
                btn.classList.add('active');
            }
        } else {
            if (btn.id !== 'or-btn') {
                btn.classList.add('active');
            }
        }
    });

    function handleClick(e) {
        btns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');

        websocketCommunication.linkOperator = (e.currentTarget.id === 'or-btn') ? "Or" : "And";
        websocketCommunication.sendUpdatedLinks();
    }

    btns.forEach(btn => {
        if (btn._hasHandler) return;
        btn.addEventListener('click', handleClick);
        btn._hasHandler = true;
    });

    // populate dropdown
    for (let linkType of linkUIWidgetsTypes) {
        const name = linkType.UIWidgetName;
        const opt  = document.createElement("option");
        opt.value = linkType.UIWidgetName;
        opt.textContent = name;

        select.appendChild(opt);
    }
    
    // populate widget list
    for (let link of websocketCommunication.serverCreatedLinks) {
        createLinkWidget(link.type, eventsCoordinatorRef, link.id, link.state, link.isError);
    }

    // on submit: instantiate matching widget classes and call onDraw()
    const groupNameSubmit = document.getElementById("group-name-submit");
    groupNameSubmit.replaceWith(groupNameSubmit.cloneNode(true));
    document.getElementById("group-name-submit")
        .addEventListener("click", () => {
            const chosen = select.selectedOptions[0].text;
            createLinkWidget(chosen, eventsCoordinatorRef);
            updateCrossDataSetLinkTable(eventsCoordinatorRef);
        });

    // Auto resize text input area
    document.querySelectorAll('.links-item-input textarea').forEach(textarea => {
        const minHeight = 30;

        const autoResize = () => {
            // reset height so scrollHeight is recalculated from content only
            textarea.style.height = 'auto';

            // temporarily hide horizontal scrollbar to get a clean scrollHeight
            const prevOverflowX = textarea.style.overflowX;
            textarea.style.overflowX = 'hidden';
            const contentHeight = textarea.scrollHeight;
            textarea.style.overflowX = prevOverflowX;

            textarea.style.height = Math.max(contentHeight, minHeight) + 22 + 'px';
        };

        textarea.addEventListener('input', autoResize);
        autoResize();
    });

    if(shouldSendUpdate){
        websocketCommunication.sendUpdatedLinks();
    }

    widgetZIndexCounter = 100;
}

function createLinkWidget(chosen, eventsCoordinatorRef, id, state, error) {
    let eventsCoordinator = eventsCoordinatorRef.eventsCoordinator;

    for (let LinkClass of linkUIWidgetsTypes) {
        if (LinkClass.UIWidgetName === chosen) {
            let instance;
            if (id) {
                instance = new LinkClass(
                    eventsCoordinator._dataSets,
                    id,
                    state,
                    error,
                    eventsCoordinatorRef
                );
            } else {
                const newId = eventsCoordinator.serverCreatedLinks.length
                    ? Math.max(...eventsCoordinator.serverCreatedLinks.map(link => link.id)) + 1
                    : 1;

                instance = new LinkClass(eventsCoordinator._dataSets, newId, null, null, eventsCoordinatorRef);
            }

            // 1) outer wrapper
            const wrapper = document.createElement("div");
            wrapper.classList.add("group-wrapper");
            wrapper.style.zIndex = widgetZIndexCounter--;  // assign and decrement
            wrapper.dataset.linkId = String(instance.id);  // mark DOM node with link id
            wrapper._linkInstance = instance;
            if (instance.isError) {
                wrapper.classList.add("group-error");
            }

            // 2) delete-button bar with title
            const deleteBar = document.createElement("div");
            deleteBar.classList.add("group-deleteBar");

            const titleDiv = document.createElement("div");
            titleDiv.classList.add("group-title");
            titleDiv.textContent = chosen;
            if (instance.isError) {
                titleDiv.classList.add("tittle-error");
            }

            const delBtn = document.createElement("button");
            delBtn.textContent = "Delete";
            delBtn.classList.add("group-deleteBtn");

            deleteBar.appendChild(titleDiv);
            deleteBar.appendChild(delBtn);
            wrapper.appendChild(deleteBar);

            // 3) content area
            const body = document.createElement("div");
            body.classList.add("group-body");
            wrapper.appendChild(body);

            // 4) render inside
            const updateFun = (linkWidget, shouldRefreshTable) => {
                body.textContent = "";
                instance.display(body);
                let fromId = linkWidget.id;
                let newState = linkWidget.state;
                let widgetType = linkWidget.constructor.UIWidgetName;
                const existingLinkIndex = eventsCoordinator.serverCreatedLinks.findIndex(
                    (link) => link.id === fromId
                );

                if (existingLinkIndex !== -1) {
                    eventsCoordinator.serverCreatedLinks[existingLinkIndex] = {
                        ...eventsCoordinator.serverCreatedLinks[existingLinkIndex],
                        state: newState,
                    };
                } else {
                    eventsCoordinator.serverCreatedLinks.push({
                        type: widgetType,
                        id: fromId,
                        state: newState,
                        isError: true,
                    });
                }

                if (shouldRefreshTable) {
                    updateCrossDataSetLinkTable(eventsCoordinatorRef);
                }
            };
            instance.changeUpdateFunc(updateFun);
            updateFun(instance, false);

            delBtn.addEventListener("click", () => {
                wrapper.remove();
                eventsCoordinator.serverCreatedLinks =
                    eventsCoordinator.serverCreatedLinks.filter(e => e.id !== instance.id);
                updateCrossDataSetLinkTable(eventsCoordinatorRef);
            });

            // 5) append into your menu list
            document.getElementById("groups-list").appendChild(wrapper);
        }
    }
}
