import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { csharp } from '@replit/codemirror-lang-csharp';
import { githubLight } from '@fsegurai/codemirror-theme-github-light';
import { autocompletion } from '@codemirror/autocomplete';

export class directFieldLink {
    static UIWidgetName = 'Direct Link';
    static _views = new Map();

    fieldPerDataset = null;
    state = { dataSet1: null, dataSet2: null, inputField: '' };
    isError = false;
    id = null;
    updateFun = null;
    themeCompartment = new Compartment();

    // debounce
    _debounceTimer = null;
    _debounceDelay = 1000; // 1 second

    // external coordinator support
    eventsCoordinatorRef = null;   // optional external coordinator
    _containerRef = null;          // last container used
    _container = null;
    _selectEls = {};
    _editorHolder = null;

    //  High z-index for autocomplete
    _highZIndexAutocomplete = EditorView.theme({
        ".cm-tooltip-autocomplete": {
            position: 'fixed',
            zIndex: 100000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            top: 'auto',
            left: 'auto',
        },
    });

    constructor(fieldsPerDataSet, id, newState, isError, eventCoordRef) {
        if (newState) this.state = newState;
        if (isError) this.isError = isError;
        this.id = id;
        this.fieldPerDataset = fieldsPerDataSet;
        this.eventsCoordinatorRef = eventCoordRef;
    }

    changeUpdateFunc(func) {
        this.updateFun = func;
    }

    updateErrorState(isError){
        const newVal = !!isError;
        if (this.isError === newVal) return;
        this.isError = newVal;

        // dataset selects
        try {
            Object.values(this._selectEls || {}).forEach(wrapper => {
                const select = wrapper.querySelector && wrapper.querySelector('select');
                if (!select) return;
                if (this.isError) {
                    select.classList.add('links-item__dataset-select__error');
                } else {
                    select.classList.remove('links-item__dataset-select__error');
                }
            });
        } catch {
            console.log("update widget error (selects)");
        }

        // editor holder border
        if (this._editorHolder) {
            this._editorHolder.style.border = this.isError
                ? '1px solid #d9534f'
                : '1px solid #ccc';
        }

        // handle group-wrapper and group-title anywhere inside containerRef (children, grandchildren, deeper)
        try {
            if (this._container) {
                let titleNode = this._container.closest('.group-wrapper');
                if (titleNode) {
                    if (this.isError) titleNode.classList.add('group-error');
                    else titleNode.classList.remove('group-error');
                }

                let titleNodes = titleNode.querySelectorAll('.group-title');
                if (titleNodes) {
                    titleNodes.forEach(node => {
                        if (this.isError) node.classList.add('tittle-error');
                        else node.classList.remove('tittle-error');
                    });
                }
            }
        } catch (e) {
            console.log(e);
        }
    }

    _scheduleUpdate(immediate = false) {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }

        const doSend = () => {
            if (this.eventsCoordinatorRef && this.eventsCoordinatorRef.eventsCoordinator?.sendUpdatedLinks) {
                const links = this.eventsCoordinatorRef.eventsCoordinator?.serverCreatedLinks;
                const link = links.find(l => l.id === this.id);
                if (link) {
                    link.state = { ...this.state };
                }
                this.eventsCoordinatorRef.eventsCoordinator.sendUpdatedLinks();
                return;
            }
            // fallback to legacy
            this.updateFun?.(this, true);
        };

        if (immediate || this._debounceDelay === 0) {
            doSend();
            return;
        }

        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            doSend();
        }, this._debounceDelay);
    }

    _destroyLocalLinks() {
        // destroy CM view
        const viewKey = `cm-${this.id}`;
        const view = bidirectionalFieldLink._views.get(viewKey);
        if (view) {
            try { view.destroy?.(); } catch {}
            bidirectionalFieldLink._views.delete(viewKey);
        }

        // remove selects
        try {
            Object.values(this._selectEls || {}).forEach(sel => {
                if (sel && sel.parentNode) sel.parentNode.remove();
            });
        } catch {}
        this._selectEls = {};

        // remove editor holder
        if (this._editorHolder) {
            const parent = this._editorHolder.parentNode;
            if (parent && parent.parentNode) parent.parentNode.removeChild(parent);
            this._editorHolder = null;
        }

        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
    }

    _resizeEditor(holder, view) {
        requestAnimationFrame(() => {
            holder.style.height = view.contentDOM.scrollHeight + 15 + 'px';
        });
    }

    _createDatasetSelect(key, value) {
        const wrapper = document.createElement('div');
        wrapper.className = 'links-item';

        const label = document.createElement('span');
        label.className = 'links-item__label';
        label.textContent = key === 'dataSet1' ? 'X : Data Set 1' : 'Y : Data Set 2';
        wrapper.appendChild(label);

        const select = document.createElement('select');
        select.className = 'links-item__dataset-select';
        if (this.isError) select.classList.add('links-item__dataset-select__error');

        select.add(new Option('-- Select Dataset --', ''));
        Object.keys(this.fieldPerDataset || {}).forEach(ds => select.add(new Option(ds, ds)));
        select.value = value || '';

        select.onchange = () => {
            this.state[key] = select.value;
            this._scheduleUpdate();
        };

        wrapper.appendChild(select);
        this._selectEls[key] = wrapper;
        return wrapper;
    }

    _completionSource = (context) => {
        const word = context.matchBefore(/([XY])\.\w*$/);
        if (!word) return null;

        const [varName, partial] = word.text.split('.');
        let fields = null;

        if (varName === 'X' && this.state.dataSet1) {
            fields = this.fieldPerDataset[this.state.dataSet1]?.fields;
        } else if (varName === 'Y' && this.state.dataSet2) {
            fields = this.fieldPerDataset[this.state.dataSet2]?.fields;
        }

        if (!Array.isArray(fields)) return null;

        const filteredFields = fields.filter(field => field.toLowerCase().startsWith((partial || '').toLowerCase()));

        return {
            from: word.from + varName.length + 1,
            options: filteredFields.map(field => ({
                label: field.replace(/ /g, "_"),
                type: 'property'
            }))
        };
    };

    _createEditor(key, value) {
        const wrapper = document.createElement('div');
        wrapper.className = 'links-item-input';
        wrapper.style.width = '100%';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';

        const editorHolder = document.createElement('div');
        editorHolder.className = 'links-item__cm-editor';
        editorHolder.style.width = '100%';
        editorHolder.style.minHeight = '50px';
        editorHolder.style.border = this.isError ? '1px solid #d9534f' : '1px solid #ccc';
        editorHolder.style.paddingBottom = '15px';
        wrapper.appendChild(editorHolder);

        const startState = EditorState.create({
            doc: value || '',
            extensions: [
                basicSetup,
                csharp(),
                this.themeCompartment.of(githubLight),
                autocompletion({
                    override: [this._completionSource],
                    container: document.body,
                }),
                this._highZIndexAutocomplete,
                EditorView.updateListener.of(update => {
                    if (update.docChanged) {
                        this.state.inputField = update.state.doc.toString();
                        this._resizeEditor(editorHolder, update.view);
                        this._scheduleUpdate();
                    }
                })
            ]
        });

        const view = new EditorView({ state: startState, parent: editorHolder });
        this._resizeEditor(editorHolder, view);

        const viewKey = `cm-${this.id}`;
        directFieldLink._views.set(viewKey, view);

        this._editorHolder = editorHolder;
        return wrapper;
    }

    setTheme(newTheme) {
        const view = directFieldLink._views.get(`cm-${this.id}`);
        if (view) {
            view.dispatch({
                effects: this.themeCompartment.reconfigure(newTheme)
            });
        }
    }

    display(container) {
        this._containerRef = container;
        this._container = container;

        if (!this._selectEls['dataSet1']) {
            container.appendChild(this._createDatasetSelect('dataSet1', this.state.dataSet1));
        }
        if (!this._selectEls['dataSet2']) {
            container.appendChild(this._createDatasetSelect('dataSet2', this.state.dataSet2));
        }
        if (!this._editorHolder) {
            container.appendChild(this._createEditor('inputField', this.state.inputField));
        }
    }
}

