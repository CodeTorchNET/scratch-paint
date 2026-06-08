import PaintEditor from './containers/tw-paint-editor-wrapper.jsx';
import ScratchPaintReducer from './reducers/scratch-paint-reducer';
import {applyPaperPatches} from './helper/paper-patch.js';

applyPaperPatches();

export {
    PaintEditor as default,
    ScratchPaintReducer
};
