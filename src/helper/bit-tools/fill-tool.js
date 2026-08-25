import paper from '@turbowarp/paper';
import {floodFill, floodFillAll, getHitBounds} from '../bitmap';
import {createGradientObject} from '../style-path';
import {createCanvas, getRaster} from '../layer';
import GradientTypes from '../../lib/gradient-types';

const TRANSPARENT = 'rgba(0,0,0,0)';
/**
 * Tool for drawing fills.
 */
class FillTool extends paper.Tool {
    /**
     * @param {!function} onUpdateImage A callback to call when the image visibly changes
     */
    constructor (onUpdateImage) {
        super();
        this.onUpdateImage = onUpdateImage;

        // We have to set these functions instead of just declaring them because
        // paper.js tools hook up the listeners in the setter functions.
        this.onMouseDown = this.handleMouseDown;
        this.onMouseDrag = this.handleMouseDrag;

        this.color = null;
        this.color2 = null;
        this.gradientType = null;
        this.active = false;
    }
    setColor (color) {
        this.color = color;
    }
    setColor2 (color2) {
        this.color2 = color2;
    }
    setGradientType (gradientType) {
        this.gradientType = gradientType;
    }
    /**
     * Fill a region somebody else filled.
     *
     * @param {Array<number>} point [x, y] in raster coordinates
     * @param {string} color the fill colour
     * @param {boolean} all true when the whole matching region was filled (shift-click)
     */
    replay (point, color, all) {
        const context = getRaster().getContext('2d');
        if (all) {
            floodFillAll(point[0], point[1], color, context, context);
        } else {
            floodFill(point[0], point[1], color, context, context);
        }
    }
    /**
     * Fill a region with a gradient somebody else chose.
     *
     * @param {Array<number>} point [x, y] in raster coordinates
     * @param {?string} color the first colour
     * @param {?string} color2 the second colour
     * @param {string} gradientType one of `GradientTypes`
     * @param {boolean} all true when the whole matching region was filled (shift-click)
     */
    replayGradient (point, color, color2, gradientType, all) {
        this.color = color;
        this.color2 = color2;
        this.gradientType = gradientType;

        const sourceContext = getRaster().getContext('2d');
        const tmpCanvas = createCanvas();
        const destContext = tmpCanvas.getContext('2d');
        const changed = all ?
            floodFillAll(point[0], point[1], 'black', sourceContext, destContext) :
            floodFill(point[0], point[1], 'black', sourceContext, destContext);
        if (!changed) return;

        const mask = new paper.Raster({insert: false});
        mask.canvas = tmpCanvas;
        this.drawGradientFill(mask, new paper.Point(point[0], point[1]));
    }
    /**
     * Lay a gradient over a region that has just been flood filled into a mask.
     *
     * @param {paper.Raster} mask the flood fill's result, black where the gradient should show
     * @param {paper.Point} point where the click was, which is a radial gradient's centre
     */
    drawGradientFill (mask, point) {
        mask.position = getRaster().position;
        // Erase what's already there
        getRaster().getContext().globalCompositeOperation = 'destination-out';
        getRaster().drawImage(mask.canvas, new paper.Point());
        getRaster().getContext().globalCompositeOperation = 'source-over';

        // Create the gradient to be masked
        const hitBounds = getHitBounds(mask);
        if (!hitBounds.area) return;
        const gradient = new paper.Shape.Rectangle({
            insert: false,
            rectangle: {
                topLeft: hitBounds.topLeft,
                bottomRight: hitBounds.bottomRight
            }
        });
        gradient.fillColor = createGradientObject(
            this.color,
            this.color2,
            this.gradientType,
            gradient.bounds,
            point);
        const rasterGradient = gradient.rasterize(getRaster().resolution.width, false /* insert */);

        // Mask gradient
        mask.getContext().globalCompositeOperation = 'source-in';
        mask.drawImage(rasterGradient.canvas, rasterGradient.bounds.topLeft);

        // Draw masked gradient into raster layer
        getRaster().drawImage(mask.canvas, new paper.Point());
    }
    handleMouseDown (event) {
        this.paint(event);
    }
    handleMouseDrag (event) {
        this.paint(event);
    }
    paint (event) {
        const sourceContext = getRaster().getContext('2d');
        let destContext = sourceContext;
        let color = this.color;
        // Paint to a mask instead of the original canvas when drawing
        if (this.gradientType !== GradientTypes.SOLID) {
            const tmpCanvas = createCanvas();
            destContext = tmpCanvas.getContext('2d');
            color = 'black';
        } else if (!color) {
            // Null color means transparent because that is the standard in vector
            color = TRANSPARENT;
        }
        let changed = false;
        if (event.event.shiftKey) {
            changed = floodFillAll(event.point.x, event.point.y, color, sourceContext, destContext);
        } else {
            changed = floodFill(event.point.x, event.point.y, color, sourceContext, destContext);
        }
        if (changed && this.gradientType !== GradientTypes.SOLID) {
            const mask = new paper.Raster({insert: false});
            mask.canvas = destContext.canvas;
            this.drawGradientFill(mask, event.point);
            this.onUpdateImage(false, null, {
                kind: 'gradfill',
                point: [event.point.x, event.point.y],
                color: this.color,
                color2: this.color2,
                gradientType: this.gradientType,
                all: !!event.event.shiftKey
            });
        } else if (changed) {
            this.onUpdateImage(false, null, {
                kind: 'fill',
                point: [event.point.x, event.point.y],
                color,
                all: !!event.event.shiftKey
            });
        }
    }
    deactivateTool () {
    }
}

export default FillTool;
