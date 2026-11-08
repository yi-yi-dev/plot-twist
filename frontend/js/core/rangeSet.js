
export class rangeSet {
    _selectionArr = [];
    addSelectionArr(selectionArr) {
        for(let i=0; i<selectionArr.length; i++){
            this.addSelection(selectionArr[i]);
        }
    }

    addSelection(selectionRange){
        let alreadyIsInArr = false;
        for(let i = 0; i<this._selectionArr.length; i++){
            if(this._selectionArr[i].field===selectionRange.field){
                alreadyIsInArr = true;

                if(selectionRange.type === "categorical"){
                    this._selectionArr[i].categories = this._selectionArr[i].categories
                        .filter(cat => selectionRange.categories.includes(cat));
                }else{ // "numerical"
                    let [x1, y1] = this._selectionArr[i].range;

                    // intersection
                    let start = Math.max(x1, selectionRange.range[0]);
                    let end = Math.min(y1, selectionRange.range[1]);
                    this._selectionArr[i].range=[start,end];
                    break;
                }
            }
        }
        if(!alreadyIsInArr){
            this._selectionArr.push(selectionRange);
        }
    }

    toArr() {
        return this._selectionArr;
    }
}
