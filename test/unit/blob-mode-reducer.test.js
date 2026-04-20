/* eslint-disable no-undefined */
/* eslint-env jest */
import brushReducer, {changeBrushSize} from '../../src/reducers/brush-mode';
import eraserReducer, {changeBrushSize as changeEraserSize} from '../../src/reducers/eraser-mode';

test('initialState', () => {
    let defaultState;

    expect(brushReducer(defaultState /* state */, {type: 'anything'} /* action */)).toBeDefined();
    expect(brushReducer(defaultState /* state */, {type: 'anything'} /* action */).brushSize).toBeGreaterThan(0);

    expect(eraserReducer(defaultState /* state */, {type: 'anything'} /* action */)).toBeTruthy();
    expect(eraserReducer(defaultState /* state */, {type: 'anything'} /* action */).brushSize).toBeGreaterThan(0);
});

test('changeBrushSize', () => {
    let defaultState;
    const newBrushSize = 8078;
    const initialSimplifySize = 10;
    const initialBrushType = 'CIRCLE';

    expect(brushReducer(defaultState, changeBrushSize(newBrushSize)))
        .toEqual({brushSize: newBrushSize, simplifySize: initialSimplifySize, brushType: initialBrushType});
    
    expect(brushReducer(1, changeBrushSize(newBrushSize)))
        .toEqual({brushSize: newBrushSize, simplifySize: undefined, brushType: undefined});

    expect(eraserReducer(defaultState, changeEraserSize(newBrushSize)))
        .toEqual({brushSize: newBrushSize, simplifySize: initialSimplifySize});
        
    expect(eraserReducer(1, changeEraserSize(newBrushSize)))
        .toEqual({brushSize: newBrushSize, simplifySize: undefined});
});

test('invalidChangeBrushSize', () => {
    const origState = {brushSize: 1, simplifySize: 1};

    expect(brushReducer(origState /* state */, changeBrushSize('invalid argument') /* action */))
        .toBe(origState);
    expect(brushReducer(origState /* state */, changeBrushSize() /* action */))
        .toBe(origState);

    expect(eraserReducer(origState /* state */, changeEraserSize('invalid argument') /* action */))
        .toBe(origState);
    expect(eraserReducer(origState /* state */, changeEraserSize() /* action */))
        .toBe(origState);
});
