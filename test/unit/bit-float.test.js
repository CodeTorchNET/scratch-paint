/* eslint-env jest */

jest.mock('@turbowarp/paper', () => {
    class Shape {}
    class PointText {}
    class Raster {}
    return {
        Shape,
        PointText,
        Raster,
        Matrix: class {
            constructor (a, b, c, d, tx, ty) {
                Object.assign(this, {a, b, c, d, tx, ty});
            }
        },
        Point: class {
            constructor (x, y) {
                this.x = x;
                this.y = y;
            }
        },
        Size: class {},
        Rectangle: class {},
        view: {zoom: 1}
    };
});
jest.mock('../../src/helper/layer', () => ({getRaster: () => null}));

import paper from '@turbowarp/paper';
import {describeFloat, describeStamp, resetFloatState} from '../../src/helper/bit-float';

const css = value => ({type: 'rgb', toCSS: () => value});

const makeRect = (options = {}) => {
    const rect = new paper.Shape();
    rect.type = options.type || 'rectangle';
    rect.size = {width: 40, height: 20};
    rect.matrix = {a: 1, b: 0, c: 0, d: 1, tx: 100, ty: 50};
    rect.strokeWidth = 'strokeWidth' in options ? options.strokeWidth : 0;
    rect.fillColor = 'fillColor' in options ? options.fillColor : css('#9966ff');
    rect.strokeColor = options.strokeColor || null;
    rect.data = {};
    return rect;
};

beforeEach(() => {
    paper.view.zoom = 1;
    resetFloatState();
});

describe('a rectangle', () => {
    test('is described by its geometry and its colour', () => {
        const action = describeFloat(makeRect());
        expect(action.kind).toBe('float');
        expect(action.shape).toMatchObject({
            type: 'rect',
            size: [40, 20],
            matrix: [1, 0, 0, 1, 100, 50],
            filled: true,
            thickness: 0,
            color: {css: '#9966ff'}
        });
    });

    test('reports an outline thickness in project units, not in this zoom', () => {
        paper.view.zoom = 1;
        const atOne = describeFloat(makeRect({strokeWidth: 8, strokeColor: css('#000')}));

        resetFloatState();
        paper.view.zoom = 4;
        const atFour = describeFloat(makeRect({strokeWidth: 32, strokeColor: css('#000')}));

        expect(atOne.shape.thickness).toBe(8);
        expect(atFour.shape.thickness).toBe(8);
        expect(atFour.shape.filled).toBe(false);
    });

    test('carries a gradient rather than flattening it to one colour', () => {
        const rect = makeRect({
            fillColor: {
                type: 'gradient',
                gradient: {
                    radial: true,
                    stops: [
                        {offset: 0, color: css('#ff0000')},
                        {offset: null, color: css('#0000ff')}
                    ]
                },
                origin: {x: 1, y: 2},
                destination: {x: 3, y: 4},
                highlight: {x: 5, y: 6}
            }
        });
        expect(describeFloat(rect).shape.color).toEqual({
            gradient: {
                radial: true,
                stops: [
                    {offset: 0, css: '#ff0000'},
                    {offset: null, css: '#0000ff'}
                ]
            },
            origin: [1, 2],
            destination: [3, 4],
            highlight: [5, 6]
        });
    });
});

describe('an oval', () => {
    test('is described as an oval, not as a rectangle', () => {
        const oval = makeRect({type: 'ellipse'});
        expect(describeFloat(oval).shape.type).toBe('oval');
    });
});

describe('text', () => {
    test('carries what it says and how it is set', () => {
        const text = new paper.PointText();
        text.content = 'hello';
        text.matrix = {a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20};
        text.fontFamily = 'Sans Serif';
        text.fontSize = 40;
        text.leading = 46.15;
        text.justification = 'center';
        text.fillColor = css('#112233');
        text.data = {};

        expect(describeFloat(text).shape).toMatchObject({
            type: 'text',
            content: 'hello',
            fontFamily: 'Sans Serif',
            fontSize: 40,
            leading: 46.15,
            justification: 'center',
            color: {css: '#112233'}
        });
    });
});

describe('a selection', () => {
    test('travels as the rectangle it came from, and carries no pixels', () => {
        const selection = new paper.Raster();
        selection.matrix = {a: 1, b: 0, c: 0, d: 1, tx: 7, ty: 9};
        selection.data = {liftRect: [10, 20, 30, 40]};

        const shape = describeFloat(selection).shape;
        expect(shape).toEqual({
            type: 'raster',
            lift: [10, 20, 30, 40],
            matrix: [1, 0, 0, 1, 7, 9]
        });
        expect(JSON.stringify(shape)).not.toMatch(/data:image/);
    });

    test('is not described at all when its pixels were never in this raster', () => {
        const pasted = new paper.Raster();
        pasted.matrix = {a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0};
        pasted.data = {};

        expect(describeFloat(pasted)).toBeNull();
    });
});

describe('withdrawing a float', () => {
    test('says so exactly once, and only if something was announced', () => {
        expect(describeFloat(null)).toBeNull();

        const rect = makeRect();
        const announced = describeFloat(rect);
        expect(announced.floatId).toBeTruthy();

        const ended = describeFloat(null);
        expect(ended).toEqual({kind: 'float-end', floatId: announced.floatId});
        expect(describeFloat(null)).toBeNull();
    });

    test('is not said after a commit, because the commit already said it', () => {
        const rect = makeRect();
        describeFloat(rect);

        const stamp = describeStamp(rect);
        expect(stamp.kind).toBe('stamp');
        expect(describeFloat(null)).toBeNull();
    });

    test('keeps a shape under one name from first sight to commit', () => {
        const rect = makeRect();
        const first = describeFloat(rect);
        const moved = describeFloat(rect);
        const stamp = describeStamp(rect);

        expect(moved.floatId).toBe(first.floatId);
        expect(stamp.floatId).toBe(first.floatId);
    });
});
