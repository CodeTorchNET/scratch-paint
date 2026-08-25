import paper from '@turbowarp/paper';
import {getRaster, getGuideLayer, createCanvas} from '../layer';
import {doesColorRequireMask, forEachLinePoint, getBrushMark} from '../bitmap';
import {snapDeltaToAngle} from '../math';

/**
 * Tool for drawing with the bitmap brush and eraser
 */
class BrushTool extends paper.Tool {
    /**
     * @param {!function} onUpdateImage A callback to call when the image visibly changes
     * @param {boolean} isEraser True if brush should erase
     */
    constructor (onUpdateImage, isEraser) {
        super();
        this.onUpdateImage = onUpdateImage;
        this.isEraser = isEraser;

        // We have to set these functions instead of just declaring them because
        // paper.js tools hook up the listeners in the setter functions.
        this.onMouseMove = this.handleMouseMove;
        this.onMouseDown = this.handleMouseDown;
        this.onMouseDrag = this.handleMouseDrag;
        this.onMouseUp = this.handleMouseUp;

        this.colorState = null;
        this.active = false;
        this.lastPoint = null;
        this.cursorPreview = null;
        this.drawTarget = null;
        this.maskTarget = null;
        this.maskBrush = null;
        this.strokePoints = [];
    }
    beginStroke () {
        if (this.isEraser) {
            this.drawTarget = getRaster();
            return;
        }
        const drawCanvas = createCanvas();
        this.drawTarget = new paper.Raster(drawCanvas);
        this.drawTarget.parent = getGuideLayer();
        this.drawTarget.guide = true;
        this.drawTarget.locked = true;
        this.drawTarget.position = getRaster().position;

        if (this.color && doesColorRequireMask(this.color)) {
            this.maskTarget = createCanvas().getContext('2d');
            this.maskBrush = getBrushMark(this.size, 'black', false);
        }
    }
    endStroke () {
        if (!this.isEraser && this.drawTarget) {
            getRaster().drawImage(this.drawTarget.canvas, new paper.Point(0, 0));
            this.drawTarget.remove();
        }
        this.drawTarget = null;
        this.maskTarget = null;
        this.maskBrush = null;
    }
    /**
     * Draw a stroke somebody else made.
     *
     * @param {Array<Array<number>>} points the gesture, as [x, y] pairs in raster coordinates
     */
    replay (points) {
        if (!points || !points.length) return;
        this.beginStroke();
        let previous = new paper.Point(points[0][0], points[0][1]);
        this.drawNextLine(previous, previous);
        for (let index = 1; index < points.length; index++) {
            const next = new paper.Point(points[index][0], points[index][1]);
            this.drawNextLine(previous, next);
            previous = next;
        }
        this.endStroke();
    }
    setColor (color) {
        this.color = color;
        this.tmpCanvas = getBrushMark(this.size, this.color, this.isEraser || !this.color);
    }
    setBrushSize (size) {
        // For performance, make sure this is an integer
        this.size = Math.max(1, ~~size);
        this.tmpCanvas = getBrushMark(this.size, this.color, this.isEraser || !this.color);
    }
    drawNextLine (previousPoint, nextPoint) {
        const roundedUpRadius = Math.ceil(this.size / 2);
        const context = this.maskTarget || this.drawTarget.getContext('2d');
        if (this.isEraser || !this.color) {
            context.globalCompositeOperation = 'destination-out';
        }
        forEachLinePoint(previousPoint, nextPoint, (x, y) => {
            context.drawImage(this.maskBrush || this.tmpCanvas, ~~x - roundedUpRadius, ~~y - roundedUpRadius);
        });
        if (this.isEraser || !this.color) {
            context.globalCompositeOperation = 'source-over';
        }
        if (this.maskTarget) {
            const drawContext = this.drawTarget.getContext('2d');
            const {width, height} = drawContext.canvas;
            drawContext.globalCompositeOperation = 'source-over';
            drawContext.drawImage(this.maskTarget.canvas, 0, 0);
            drawContext.globalCompositeOperation = 'source-in';
            drawContext.fillStyle = this.color;
            drawContext.fillRect(0, 0, width, height);
        }
    }
    updateCursorIfNeeded () {
        if (!this.size) {
            return;
        }

        // The cursor preview was unattached from the view by an outside process,
        // such as changing costumes or undo.
        if (this.cursorPreview && !this.cursorPreview.parent) {
            this.cursorPreview = null;
        }

        if (!this.cursorPreview || !(this.lastSize === this.size && this.lastColor === this.color)) {
            if (this.cursorPreview) {
                this.cursorPreview.remove();
            }

            this.tmpCanvas = getBrushMark(this.size, this.color, this.isEraser || !this.color);
            this.cursorPreview = new paper.Raster(this.tmpCanvas);
            this.cursorPreview.guide = true;
            this.cursorPreview.parent = getGuideLayer();
            this.cursorPreview.data.isHelperItem = true;
        }

        this.lastSize = this.size;
        this.lastColor = this.color;
    }
    constrainPoint (currentPoint, lastPoint, modifiers) {
        let delta = currentPoint.subtract(lastPoint);
        if (modifiers.shift) {
            // 45 degree movement
            delta = snapDeltaToAngle(delta, Math.PI / 4);
        } else if (modifiers.alt) {
            // vertical movement
            delta = new paper.Point(0, delta.y);
        } else if (modifiers.control || modifiers.meta) {
            // horizontal movement
            delta = new paper.Point(delta.x, 0);
        }
        return lastPoint.add(delta);
    }
    handleMouseMove (event) {
        this.updateCursorIfNeeded();
        this.cursorPreview.position = new paper.Point(~~event.point.x, ~~event.point.y);
    }
    handleMouseDown (event) {
        if (event.event.button > 0) return; // only first mouse button
        this.active = true;

        if (this.cursorPreview) {
            this.cursorPreview.remove();
        }

        this.beginStroke();

        const point = event.point;
        this.strokePoints = [[point.x, point.y]];
        this.drawNextLine(point, point);
        this.lastPoint = point;
    }
    handleMouseDrag (event) {
        if (event.event.button > 0 || !this.active) return; // only first mouse button

        const point = this.constrainPoint(event.point, this.lastPoint, event.modifiers);
        this.strokePoints.push([point.x, point.y]);
        this.drawNextLine(this.lastPoint, point);
        this.lastPoint = point;
    }
    handleMouseUp (event) {
        if (event.event.button > 0 || !this.active) return; // only first mouse button

        const point = this.constrainPoint(event.point, this.lastPoint, event.modifiers);
        this.strokePoints.push([point.x, point.y]);
        this.drawNextLine(this.lastPoint, point);
        this.endStroke();
        this.onUpdateImage(false, null, {
            kind: this.isEraser ? 'erase' : 'brush',
            points: this.strokePoints,
            size: this.size,
            color: this.color || null
        });
        this.strokePoints = [];

        this.lastPoint = null;
        this.active = false;

        this.updateCursorIfNeeded();
        this.cursorPreview.position = new paper.Point(~~event.point.x, ~~event.point.y);
    }
    deactivateTool () {
        this.active = false;
        this.tmpCanvas = null;
        if (this.cursorPreview) {
            this.cursorPreview.remove();
            this.cursorPreview = null;
        }
    }
}

export default BrushTool;
