import paper from '@turbowarp/paper';
import {ART_BOARD_WIDTH, ART_BOARD_HEIGHT} from './view';
import {getRaster} from './layer';


let announced = null;

export const resetFloatState = () => {
    announced = null;
};

const matrixOf = item => {
    const m = item.matrix;
    return [m.a, m.b, m.c, m.d, m.tx, m.ty];
};

const toMatrix = values => new paper.Matrix(
    values[0], values[1], values[2], values[3], values[4], values[5]);

const describeColor = color => {
    if (!color) return null;
    if (color.type === 'gradient') {
        return {
            gradient: {
                radial: !!color.gradient.radial,
                stops: color.gradient.stops.map(stop => ({
                    offset: typeof stop.offset === 'number' ? stop.offset : null,
                    css: stop.color.toCSS()
                }))
            },
            origin: [color.origin.x, color.origin.y],
            destination: [color.destination.x, color.destination.y],
            highlight: color.highlight ? [color.highlight.x, color.highlight.y] : null
        };
    }
    return {css: color.toCSS()};
};

const buildColor = description => {
    if (!description) return null;
    if (description.css) return description.css;
    const style = {
        gradient: {
            radial: description.gradient.radial,
            stops: description.gradient.stops.map(stop =>
                (stop.offset === null ? stop.css : [stop.css, stop.offset]))
        },
        origin: new paper.Point(description.origin[0], description.origin[1]),
        destination: new paper.Point(description.destination[0], description.destination[1])
    };
    if (description.highlight) {
        style.highlight = new paper.Point(description.highlight[0], description.highlight[1]);
    }
    return style;
};

const thicknessOf = item => item.strokeWidth / paper.view.zoom;

const describeShape = item => {
    if (item instanceof paper.Shape && (item.type === 'rectangle' || item.type === 'ellipse')) {
        const filled = item.strokeWidth === 0;
        return {
            type: item.type === 'rectangle' ? 'rect' : 'oval',
            size: [item.size.width, item.size.height],
            matrix: matrixOf(item),
            filled,
            thickness: filled ? 0 : thicknessOf(item),
            color: describeColor(filled ? item.fillColor : item.strokeColor)
        };
    }

    if (item instanceof paper.PointText) {
        return {
            type: 'text',
            content: item.content,
            matrix: matrixOf(item),
            fontFamily: item.fontFamily,
            fontSize: item.fontSize,
            fontWeight: item.fontWeight,
            leading: item.leading,
            justification: item.justification,
            color: describeColor(item.fillColor)
        };
    }

    if (item instanceof paper.Raster && item.data && item.data.liftRect) {
        return {
            type: 'raster',
            lift: item.data.liftRect.slice(),
            matrix: matrixOf(item)
        };
    }

    return null;
};

/*
 * A shape's name, which is intentionally not called `id`.
 */
const idOf = item => {
    if (!item.data) item.data = {};
    if (!item.data.collabFloatId) {
        const noise = Math.random().toString(36);
        item.data.collabFloatId = `f${noise.slice(2, 10)}`;
    }
    return item.data.collabFloatId;
};

/**
 * What to say about the floating item, given what we said last time.
 *
 * @param {?paper.Item} item the single selected item, or null if there is none
 * @returns {?object} an action to publish, or null when there is nothing to say
 */
export const describeFloat = item => {
    const shape = item ? describeShape(item) : null;
    if (!shape) {
        if (!announced) return null;
        const floatId = announced;
        announced = null;
        return {kind: 'float-end', floatId};
    }
    const floatId = idOf(item);
    announced = floatId;
    return {kind: 'float', floatId, shape};
};

/**
 * @param {paper.Item} item the item about to be drawn into the raster
 * @returns {?object} an action to publish, or null when this item cannot be described
 */
export const describeStamp = item => {
    if (!item) return null;
    const shape = describeShape(item);
    if (!shape) return null;
    const floatId = idOf(item);
    if (announced === floatId) announced = null;
    return {kind: 'stamp', floatId, shape};
};

/**
 * @param {paper.Item} item the item about to be deleted
 * @returns {?object} an action to publish, or null when this is not a lifted selection
 */
export const describeCut = item => {
    if (!item || !(item instanceof paper.Raster)) return null;
    if (!item.data || !item.data.liftRect) return null;
    const floatId = idOf(item);
    if (announced === floatId) announced = null;
    return {kind: 'cut', floatId, lift: item.data.liftRect.slice()};
};

/**
 * @param {number[]} lift `[x, y, width, height]` in raster coordinates
 * @returns {?paper.Raster} the lifted pixels, uninserted, with the hole already cut
 */
const liftFromRaster = lift => {
    const rect = new paper.Rectangle(lift[0], lift[1], lift[2], lift[3])
        .intersect(new paper.Rectangle(0, 0, ART_BOARD_WIDTH, ART_BOARD_HEIGHT));
    if (!rect.area) return null;

    const raster = getRaster().getSubRaster(rect);
    raster.remove();
    raster.canvas.getContext('2d').imageSmoothingEnabled = false;
    const expanded = getRaster().getSubRaster(rect.expand(4));
    expanded.remove();
    raster.data = {expanded, liftRect: lift.slice()};

    getRaster().getContext(true /* modify */)
        .clearRect(rect.x, rect.y, rect.width, rect.height);
    return raster;
};

/**
 * Rebuild a described item.
 *
 * @param {object} shape a description from `describeFloat`
 * @returns {?paper.Item} the item, or null if the description names something we do not build
 */
export const buildFloat = shape => {
    if (!shape) return null;

    if (shape.type === 'rect' || shape.type === 'oval') {
        const box = [0, 0, shape.size[0], shape.size[1]];
        const item = shape.type === 'rect' ?
            new paper.Shape.Rectangle({insert: false, rectangle: box}) :
            new paper.Shape.Ellipse({insert: false, rectangle: box});
        item.applyMatrix = false;
        item.strokeScaling = false;
        item.strokeJoin = 'round';
        const color = buildColor(shape.color);
        if (shape.filled) {
            item.fillColor = color;
            item.strokeWidth = 0;
        } else {
            item.strokeColor = color;
            item.strokeWidth = shape.thickness * paper.view.zoom;
        }
        item.matrix = toMatrix(shape.matrix);
        return item;
    }

    if (shape.type === 'text') {
        const item = new paper.PointText({
            insert: false,
            point: [0, 0],
            content: shape.content,
            fontFamily: shape.fontFamily,
            fontSize: shape.fontSize,
            leading: shape.leading,
            justification: shape.justification,
            fillColor: buildColor(shape.color)
        });
        if (shape.fontWeight) item.fontWeight = shape.fontWeight;
        item.matrix = toMatrix(shape.matrix);
        return item;
    }

    if (shape.type === 'raster') {
        const item = liftFromRaster(shape.lift);
        if (!item) return null;
        item.matrix = toMatrix(shape.matrix);
        return item;
    }

    return null;
};

export default {describeFloat, describeStamp, describeCut, buildFloat, resetFloatState};
