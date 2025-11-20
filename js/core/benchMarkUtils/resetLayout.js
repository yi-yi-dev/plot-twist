import csvIcon from '../../../assets/csv_icon.svg';
import launchIcon from '../../../assets/launch_icon.svg';
import downloadIcon from '../../../assets/download_icon.svg';
import uploadIcon from '../../../assets/upload_icon.svg';
import listIcon from '../../../assets/list_icon.svg';

export function resetLayout() {
    const freshBody = document.createElement("body");

    freshBody.innerHTML = `
        <div class="top-bar-dummy"></div>
        <div class="top-bar-fixedRectangle"></div>

        <div class="top-bar">
            <div class="top-bar-inner">

                <div class="indentFileUpload">
                    <label for="fileInput" class="custom-file-upload top-bar-button">
                        Upload data-set&nbsp;
                        <img src="assets/csv_icon.svg" alt="select CSV" class="csv-icon"/>
                    </label>
                    <input
                        type="file"
                        id="fileInput"
                        class="file-input"
                        accept=".csv,text/csv"
                    />
                </div>

                <button id="loadDemo" class="top-bar-button">
                    Load Demo&nbsp;
                    <img src="assets/launch_icon.svg" class="csv-icon" alt="load demo">
                </button>

                <button id="exportLayoutButton" class="top-bar-button">
                    Save Layout&nbsp;
                    <img src="assets/download_icon.svg" class="csv-icon" alt="download layout file">
                </button>

                <div id="loadLayoutButton" class="indentFileUpload">
                    <label for="layoutInput" class="custom-file-upload top-bar-button">
                        Load layout&nbsp;
                        <img src="assets/upload_icon.svg" alt="upload layout file" class="csv-icon">
                    </label>
                    <input type="file" id="layoutInput" class="file-input" accept=".json,text/json"/>
                </div>

            </div>
        </div>


        <div id="app-view">
            <div id="grid-container">
                <div id="plotsContainer"></div>
                <button id="col">+</button>
                <button id="row">+</button>
                <div></div>
            </div>
        </div>

        <div class="menu-wrapper">
            <div class="group-component">
                <div class="group-component-inner">
                    <span class="group-title">
                    Cross data-set links
                    </span>

                    <div class="group-component-buttons">
                        <button id="and-btn">And</button>
                        <button id="or-btn">Or</button>
                    </div>
                </div>


                <div id="groups-list"></div>

                <div class="add-group-container">
                    <label for="field-group-name">Link: </label>
                    <select id="field-group-name">
                    </select>
                    <button id="group-name-submit">Add Link</button>
                </div>
            </div>

            <button id="slide-menu-btn">
                <img src="assets/link_tonedDownPurple.svg" alt="Group links button">
                <!--Field Groups-->
            </button>
        </div>


        <script type="module" src="/js/main.js"></script>
    `;

    document.body.replaceWith(freshBody);

    // Set image sources
    freshBody.querySelector('label[for="fileInput"] img').src = csvIcon;
    freshBody.querySelector('#loadDemo img').src = launchIcon;
    freshBody.querySelector('#exportLayoutButton img').src = downloadIcon;
    freshBody.querySelector('label[for="layoutInput"] img').src = uploadIcon;
    freshBody.querySelector('#slide-menu-btn img').src = listIcon;
}
